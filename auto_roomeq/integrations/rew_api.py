"""
Room EQ Wizard (REW) REST API Client.
Communicates with REW's built-in local HTTP API (http://localhost:4735 by default)
to automate measurement retrieval, impulse alignment, FDW windowing, vector averaging,
and trace arithmetic (A/B, 1/A, A+B).

Supports:
- Implicit frequency responses (startFreq + pointsPerOctave or freqStep).
- Explicit dictionary & list formats.
- High-performance Base64 binary (>f4 big-endian float) decoded impulse & frequency data.
"""

from typing import Dict, List, Optional, Any, Union, Tuple
import base64
import httpx
import numpy as np
from ..dsp.measurement import Measurement


class RewApiClient:
    """
    Client for interacting with Room EQ Wizard's local REST API.
    """

    def __init__(self, base_url: str = "http://localhost:4735", timeout: float = 5.0):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    async def check_connection(self) -> Dict[str, Any]:
        """
        Check if REW API is running and reachable.
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(f"{self.base_url}/measurements")
                if resp.status_code == 200:
                    return {
                        "connected": True,
                        "base_url": self.base_url,
                        "status_code": resp.status_code,
                        "message": "Connected to Room EQ Wizard REST API",
                    }
                else:
                    return {
                        "connected": True,
                        "base_url": self.base_url,
                        "status_code": resp.status_code,
                        "message": f"REW responded with HTTP {resp.status_code}",
                    }
        except httpx.ConnectError:
            return {
                "connected": False,
                "base_url": self.base_url,
                "error": f"Cannot connect to REW API at {self.base_url}. Ensure REW is open with API enabled in Preferences or launched with -api.",
            }
        except Exception as e:
            return {
                "connected": False,
                "base_url": self.base_url,
                "error": str(e),
            }

    async def get_measurements(self) -> List[Dict[str, Any]]:
        """
        Get list of all open measurements currently in REW.
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(f"{self.base_url}/measurements")
            resp.raise_for_status()
            data = resp.json()
            if isinstance(data, list):
                # If list of IDs, fetch metadata for each
                results = []
                for item in data:
                    if isinstance(item, (int, str)):
                        try:
                            info_resp = await client.get(f"{self.base_url}/measurements/{item}")
                            if info_resp.status_code == 200:
                                info_data = info_resp.json()
                                info_data["id"] = item
                                results.append(info_data)
                            else:
                                results.append({"id": item, "title": f"Measurement {item}"})
                        except Exception:
                            results.append({"id": item, "title": f"Measurement {item}"})
                    elif isinstance(item, dict):
                        results.append(item)
                return results
            elif isinstance(data, dict) and "measurements" in data:
                return data["measurements"]
            return []

    async def get_measurement_data(self, measurement_id: Union[int, str]) -> Optional[Measurement]:
        """
        Fetch frequency response and/or impulse response for a specific measurement ID.
        Handles Base64 binary (>f4), implicit log spacing (startFreq/ppo), and explicit JSON formats.
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            # 1. Try to fetch raw impulse response first for maximum time-domain fidelity
            url_ir = f"{self.base_url}/measurements/{measurement_id}/impulse-response"
            try:
                resp_ir = await client.get(url_ir)
                if resp_ir.status_code == 200:
                    ir_data = resp_ir.json()
                    name = f"REW Measurement {measurement_id}"
                    sr = 48000
                    
                    if isinstance(ir_data, dict):
                        sr = int(ir_data.get("sampleRate", 48000))
                        name = ir_data.get("title", ir_data.get("name", name))
                        
                        for key in ["impulseResponse", "ir", "samples", "data", "y"]:
                            if key in ir_data:
                                val = ir_data[key]
                                if isinstance(val, str):
                                    samples = np.frombuffer(base64.b64decode(val), dtype=">f4").astype(np.float64)
                                    return Measurement(name=name, ir=samples, sample_rate=sr)
                                elif isinstance(val, list):
                                    samples = np.array(val, dtype=np.float64)
                                    return Measurement(name=name, ir=samples, sample_rate=sr)
                    elif isinstance(ir_data, list):
                        samples = np.array(ir_data, dtype=np.float64)
                        return Measurement(name=name, ir=samples, sample_rate=sr)
            except Exception:
                pass

            # 2. Fallback to frequency response endpoint
            url_freq = f"{self.base_url}/measurements/{measurement_id}/frequency-response"
            resp_freq = await client.get(url_freq)
            if resp_freq.status_code == 200:
                data = resp_freq.json()
                freqs, spl = self._parse_frequency_response_data(data)
                name = f"REW Measurement {measurement_id}"
                
                n_fft = 65536
                sr = 48000
                fft_freqs = np.fft.rfftfreq(n_fft, d=1.0 / sr)
                interp_spl = np.interp(fft_freqs, freqs, spl, left=spl[0], right=spl[-1])
                
                # Minimum phase reconstruction
                H = (10.0 ** (interp_spl / 20.0))
                full_log_mag = np.concatenate([np.log(np.maximum(H, 1e-12)), np.log(np.maximum(H[-2:0:-1], 1e-12))])
                cepstrum = np.fft.ifft(full_log_mag).real
                min_win = np.zeros_like(cepstrum)
                min_win[0] = 1.0
                min_win[1:len(cepstrum)//2] = 2.0
                min_win[len(cepstrum)//2] = 1.0
                
                min_phase_spec = np.exp(np.fft.fft(cepstrum * min_win))[:len(fft_freqs)]
                ir = np.fft.irfft(min_phase_spec, n=n_fft)
                
                return Measurement(name=name, ir=ir, sample_rate=sr, n_fft=n_fft)

            return None

    def _parse_frequency_response_data(self, data: Any) -> Tuple[np.ndarray, np.ndarray]:
        """
        Helper to parse frequency response from diverse REW API formats.
        """
        if isinstance(data, dict):
            # Implicit startFreq + ppo/freqStep
            if "startFreq" in data:
                start_freq = float(data["startFreq"])
                mag_key = next((k for k in ["magnitude", "magnitudes", "smoothedMagnitude", "spl"] if k in data), None)
                if mag_key:
                    mag_val = data[mag_key]
                    if isinstance(mag_val, str):
                        mags = np.frombuffer(base64.b64decode(mag_val), dtype=">f4").astype(np.float64)
                    else:
                        mags = np.array(mag_val, dtype=np.float64)
                        
                    if "pointsPerOctave" in data or "ppo" in data:
                        ppo = float(data.get("pointsPerOctave", data.get("ppo", 48.0)))
                        step_factor = 2.0 ** (1.0 / ppo)
                        freqs = start_freq * (step_factor ** np.arange(len(mags)))
                    elif "freqStep" in data:
                        step = float(data["freqStep"])
                        freqs = start_freq + np.arange(len(mags)) * step
                    else:
                        freqs = start_freq + np.arange(len(mags))
                    return freqs, mags

            # Explicit arrays
            if "frequencies" in data and "spl" in data:
                return np.array(data["frequencies"], dtype=np.float64), np.array(data["spl"], dtype=np.float64)
                
        if isinstance(data, list) and len(data) > 0:
            if isinstance(data[0], dict) and "freq" in data[0] and "spl" in data[0]:
                freqs = np.array([pt["freq"] for pt in data], dtype=np.float64)
                spl = np.array([pt["spl"] for pt in data], dtype=np.float64)
                return freqs, spl
            elif isinstance(data[0], (list, tuple)) and len(data[0]) >= 2:
                freqs = np.array([pt[0] for pt in data], dtype=np.float64)
                spl = np.array([pt[1] for pt in data], dtype=np.float64)
                return freqs, spl
                
        raise ValueError("Unrecognized REW frequency response data format.")

    async def align_impulse_responses(self, ref_id: int, target_ids: List[int]) -> bool:
        """
        Trigger REW's cross-correlation impulse alignment.
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                payload = {"referenceId": ref_id, "targetIds": target_ids}
                resp = await client.post(f"{self.base_url}/measurements/align-impulse-responses", json=payload)
                return resp.status_code in [200, 201, 204]
        except Exception:
            return False

    async def execute_trace_arithmetic(
        self,
        operation: str,
        id_a: int,
        id_b: Optional[int] = None,
    ) -> Optional[int]:
        """
        Execute trace arithmetic in REW (e.g. A/B, 1/A, A+B).
        """
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                payload = {"operation": operation, "measurementA": id_a}
                if id_b is not None:
                    payload["measurementB"] = id_b
                resp = await client.post(f"{self.base_url}/measurements/arithmetic", json=payload)
                if resp.status_code in [200, 201]:
                    res_data = resp.json()
                    return res_data.get("id")
        except Exception:
            return None
        return None
