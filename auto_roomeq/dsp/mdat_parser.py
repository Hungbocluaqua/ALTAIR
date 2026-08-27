"""
Best-Effort REW .mdat Binary Measurement Parser / Extraction Bridge.

REW .mdat files are serialized Java object streams (magic 0xACED0005). ALTAIR does
not bundle a full Java serialization engine; instead this module uses layered
robust extraction strategies:

1. ZIP container scan — if the payload is a ZIP (or contains embedded text
   exports), parse the first .txt/.frd/.csv entry via parse_rew_text.
2. Java-serialization tokenizer — walks the ACED0005 stream and captures
   TC_STRING titles and TC_ARRAY double[] payloads (the way REW stores
   frequency / SPL / phase curves), classifying each double array by strict
   plausibility checks.
3. Raw double-run heuristic — fallback for layouts the tokenizer cannot walk:
   scans for runs of big-endian IEEE-754 doubles that look like frequency /
   SPL / phase axes.

If none of the strategies yields data, a ValueError with actionable guidance is
raised (user should export REW text .txt/.frd instead).
"""

from typing import Dict, List, Optional, Tuple
import io
import struct
import zipfile

import numpy as np

from .measurement import Measurement, parse_rew_text


# ---------------------------------------------------------------------------
# Java serialization tokenizer
# ---------------------------------------------------------------------------
_TC_NULL = 0x70
_TC_REFERENCE = 0x71
_TC_CLASSDESC = 0x72
_TC_OBJECT = 0x73
_TC_STRING = 0x74
_TC_ARRAY = 0x75
_TC_BLOCKDATA = 0x77
_TC_ENDBLOCKDATA = 0x78
_BASE_HANDLE = 0x7E0000

_PRIMITIVE_SIZES = {
    ord("B"): 1, ord("C"): 1, ord("D"): 8, ord("F"): 4,
    ord("I"): 4, ord("J"): 8, ord("S"): 2, ord("Z"): 1,
}


def _tokenize_java_stream(
    content: bytes,
) -> Tuple[List[str], List[Tuple[int, int]]]:
    """
    Walk a Java serialization object stream and collect:
    - readable TC_STRING values (measurement titles / metadata)
    - (element_count, data_offset) of every double[] array (TC_ARRAY with "[D")

    Returns whatever was captured before any parse error; the caller decides
    whether enough was found.
    """
    strings: List[str] = []
    double_arrays: List[Tuple[int, int]] = []
    class_handles: Dict[int, str] = {}
    n = len(content)
    pos = 0
    next_handle = _BASE_HANDLE

    def u1() -> int:
        nonlocal pos
        if pos >= n:
            raise ValueError("stream end")
        v = content[pos]
        pos += 1
        return v

    def u2() -> int:
        return struct.unpack(">H", u1_u1(2))[0]  # placeholder replaced below

    def u1_u1(count: int) -> bytes:
        nonlocal pos
        if pos + count > n:
            raise ValueError("stream end")
        v = content[pos:pos + count]
        pos += count
        return v

    def u4() -> int:
        return struct.unpack(">I", u1_u1(4))[0]

    def u8() -> int:
        return struct.unpack(">q", u1_u1(8))[0]

    def utf() -> str:
        length = struct.unpack(">H", u1_u1(2))[0]
        raw = u1_u1(length)
        return raw.decode("utf-8", errors="ignore")

    def assign_handle() -> int:
        nonlocal next_handle
        h = next_handle
        next_handle += 1
        return h

    def parse_classdesc() -> str:
        """Parse TC_CLASSDESC (already consumed tag) + optional superclass; returns class name."""
        name = utf()
        u8()          # serialVersionUID
        u1()          # classDescFlags
        # Field descriptors until TC_ENDBLOCKDATA
        while True:
            ftype = u1()
            if ftype == _TC_ENDBLOCKDATA:
                break
            utf()  # field name
            if ftype == ord("L") or ftype == ord("["):
                utf()  # field type name
        # Optional superclass descriptor (rare)
        if pos < n and content[pos] == _TC_CLASSDESC:
            u1()
            parse_classdesc()
        return name

    def parse_classdesc_token() -> Optional[str]:
        """Parse a classDesc token (reference or inline descriptor); returns class name if known."""
        tag = u1()
        if tag == _TC_REFERENCE:
            handle = u4()
            return class_handles.get(handle)
        if tag == _TC_CLASSDESC:
            name = parse_classdesc()
            h = assign_handle()
            class_handles[h] = name
            return name
        return None

    try:
        if content[pos:pos + 2] != b"\xAC\xED":
            return strings, double_arrays
        pos = 2
        u2()  # stream version

        while pos < n:
            tag = u1()
            if tag == _TC_NULL:
                continue
            if tag == _TC_REFERENCE:
                u4()
                continue
            if tag == _TC_STRING:
                text = utf()
                if len(text) >= 3 and text.isprintable():
                    strings.append(text)
                assign_handle()
                continue
            if tag == _TC_CLASSDESC:
                name = parse_classdesc()
                h = assign_handle()
                class_handles[h] = name
                continue
            if tag == _TC_BLOCKDATA:
                length = u1()
                if length == 0xFF:
                    length = u4()
                u1_u1(length)
                continue
            if tag == _TC_ENDBLOCKDATA:
                continue
            if tag == _TC_ARRAY:
                class_name = parse_classdesc_token()
                array_handle = u4()
                count = u4()
                if class_name == "[D":
                    double_arrays.append((count, pos))
                    pos += count * 8
                    if pos > n:
                        break
                elif class_name is not None:
                    # Known primitive array element type (or object array): best effort skip
                    elem = class_name[1:2] if len(class_name) >= 2 else ""
                    size = _PRIMITIVE_SIZES.get(ord(elem)) if elem else None
                    if size is not None:
                        pos += count * size
                        if pos > n:
                            break
                    else:
                        # Cannot safely skip object arrays — stop walking.
                        break
                else:
                    # Unknown classDesc reference: assume worst case and stop
                    break
                assign_handle()
                continue
            if tag == _TC_OBJECT:
                parse_classdesc_token()
                assign_handle()
                # Object field data layout is class-dependent; continue the
                # generic token walk from here (REW objects contain further
                # arrays/strings that the walker will still discover).
                continue
            # Unknown tag: stop walking gracefully
            break
    except Exception:
        pass

    return strings, double_arrays


def _classify_double_array(arr: np.ndarray) -> Optional[str]:
    """Classify a candidate double array as 'freq', 'spl' or 'phase'."""
    if len(arr) < 16:
        return None
    diffs = np.diff(arr)
    if (
        np.all(diffs >= 0)
        and arr[0] >= 1.0
        and arr[-1] <= 200000.0
        and arr[-1] >= arr[0] * 1.2
        and np.all(arr > 0.0)
    ):
        return "freq"
    if 20.0 <= float(np.mean(arr)) <= 160.0 and float(np.max(arr)) <= 180.0:
        return "spl"
    if (
        float(np.min(arr)) >= -1440.0
        and float(np.max(arr)) <= 1440.0
        and float(np.min(arr)) < 5.0  # phase curves in REW generally cross 0 deg
    ):
        return "phase"
    return None


def _read_double_array(content: bytes, count: int, offset: int) -> Optional[np.ndarray]:
    if offset + count * 8 > len(content):
        return None
    try:
        arr = np.frombuffer(content, dtype=">f8", count=count, offset=offset).astype(np.float64)
    except Exception:
        return None
    if not np.all(np.isfinite(arr)):
        return None
    return arr


# ---------------------------------------------------------------------------
# Raw big-endian double-run heuristic (fallback)
# ---------------------------------------------------------------------------
def _heuristic_double_runs(
    content: bytes,
    min_run: int = 64,
    max_offsets: int = 1024,
    max_run_values: int = 4096,
    max_content_bytes: int = 8 * 1024 * 1024,
) -> List[Tuple[np.ndarray, str]]:
    """
    Fallback: scan big-endian double runs for plausible frequency/SPL/phase axes.

    Bounded for safety: the offsets are sampled (never every 8-aligned offset),
    each run is capped, and the heuristic is skipped entirely for payloads
    larger than max_content_bytes. This keeps worst-case cost at
    max_offsets * max_run_values struct.unpack calls regardless of file size.
    """
    n = len(content)
    found: List[Tuple[np.ndarray, str]] = []
    if n > max_content_bytes or n < 8:
        return found

    # Sample offsets evenly across the buffer (aligned to 8 bytes)
    step = max(8, ((n - 8) // max_offsets))
    step = max(8, (step // 8) * 8)
    for start in range(0, n - 8, step):
        values: List[float] = []
        pos = start
        while pos + 8 <= n and len(values) < max_run_values:
            try:
                v = struct.unpack(">d", content[pos:pos + 8])[0]
            except Exception:
                break
            if not np.isfinite(v) or abs(v) > 1.0e6:
                break
            values.append(v)
            pos += 8
        if len(values) >= min_run:
            arr = np.array(values, dtype=np.float64)
            kind = _classify_double_array(arr)
            if kind:
                found.append((arr, kind))
    return found


# ---------------------------------------------------------------------------
# Extraction layers
# ---------------------------------------------------------------------------
def _extract_from_zip(
    content: bytes, sample_rate: int, name: str, n_fft: int
) -> Optional[Tuple[Measurement, Dict[str, object]]]:
    if not content.startswith(b"PK\x03\x04"):
        return None
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            candidates = [
                info.filename
                for info in zf.infolist()
                if info.filename.lower().endswith((".txt", ".frd", ".csv", ".mdat.txt"))
            ]
            for entry_name in sorted(candidates):
                try:
                    text = zf.read(entry_name).decode("utf-8", errors="ignore")
                    meas = parse_rew_text(text, sample_rate=sample_rate, name=f"{name}: {entry_name}", n_fft=n_fft)
                    return meas, {"parser": "zip_text_export", "entry": entry_name}
                except Exception:
                    continue
    except Exception:
        return None
    return None


def _extract_from_java_stream(
    content: bytes, sample_rate: int, name: str, n_fft: int
) -> Optional[Tuple[Measurement, Dict[str, object]]]:
    if not content.startswith(b"\xAC\xED\x00\x05"):
        return None

    strings, double_arrays = _tokenize_java_stream(content)
    candidates: List[Tuple[np.ndarray, str]] = []
    for count, offset in double_arrays:
        arr = _read_double_array(content, count, offset)
        if arr is None:
            continue
        kind = _classify_double_array(arr)
        if kind:
            candidates.append((arr, kind))

    # Fallback: raw heuristic scan when the tokenizer found no frequency axis
    if not any(k == "freq" for _, k in candidates):
        candidates.extend(_heuristic_double_runs(content))

    freq_axes = [(a, k) for a, k in candidates if k == "freq"]
    if not freq_axes:
        return None

    freq_arr, _ = max(freq_axes, key=lambda t: len(t[0]))

    # Pair with the SPL array closest in length, then phase
    def _pick(kind: str):
        pool = [a for a, k in candidates if k == kind]
        if not pool:
            return None
        return min(pool, key=lambda a: abs(len(a) - len(freq_arr)))

    spl_arr = _pick("spl")
    if spl_arr is None:
        return None
    phase_arr = _pick("phase")

    common = min(len(freq_arr), len(spl_arr))
    freqs_src = freq_arr[:common]
    spl_src = spl_arr[:common]

    # Reconstruct complex response on the FFT grid (same path as parse_rew_text)
    fft_freqs = np.fft.rfftfreq(n_fft, d=1.0 / sample_rate)
    interp_spl = np.interp(fft_freqs, freqs_src, spl_src, left=float(spl_src[0]), right=float(spl_src[-1]))
    if phase_arr is not None:
        phase_src = phase_arr[:common]
        interp_phase = np.radians(np.interp(fft_freqs, freqs_src, phase_src, left=float(phase_src[0]), right=float(phase_src[-1])))
    else:
        interp_phase = np.zeros_like(fft_freqs)

    H = (10.0 ** (interp_spl / 20.0)) * np.exp(1j * interp_phase)
    ir = np.fft.irfft(H, n=n_fft)

    title = next((s for s in strings if len(s) >= 3), name)
    meas = Measurement(
        name=f"{name}: {title}" if title != name else name,
        ir=ir,
        sample_rate=sample_rate,
        n_fft=n_fft,
    )
    meta: Dict[str, object] = {
        "parser": "java_serialization_scan",
        "measurement_titles": strings[:16],
        "frequency_points": int(common),
        "phase_recovered": phase_arr is not None,
    }
    return meas, meta


def parse_mdat(
    content: bytes,
    sample_rate: int = 48000,
    name: str = "REW .mdat Measurement",
    n_fft: int = 65536,
) -> Tuple[Measurement, Dict[str, object]]:
    """
    Best-effort parse of a REW .mdat binary file.

    Returns:
        (Measurement, metadata dict with parser strategy info)

    Raises:
        ValueError when no frequency/SPL payload can be extracted.
    """
    if not content or len(content) < 8:
        raise ValueError("Empty or truncated .mdat file.")

    for extractor in (_extract_from_zip, _extract_from_java_stream):
        result = extractor(content, sample_rate, name, n_fft)
        if result is not None:
            return result

    raise ValueError(
        "Could not extract measurement data from this .mdat file. "
        "ALTAIR's .mdat bridge supports ZIP-packaged text exports and Java-serialized "
        "frequency/SPL arrays; for complex .mdat projects, export the measurement as "
        "REW text (.txt/.frd) or upload a WAV impulse response instead."
    )
