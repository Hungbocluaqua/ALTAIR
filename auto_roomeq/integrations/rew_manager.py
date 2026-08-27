"""
Room EQ Wizard (REW) Lifecycle and Process Manager.
Handles:
- Automatic detection of REW installation directories (Registry, known paths, PATH).
- Process state detection (Process status and REST API health).
- Detached background execution with the `-api` flag.
- User auto-start preference persistence.
"""

import os
import sys
import json
import time
import shutil
import asyncio
import subprocess
from typing import Optional, Dict, Any, Tuple

SETTINGS_FILE = "altair_settings.json"


def load_altair_settings() -> Dict[str, Any]:
    """Load persistent app settings (auto-start REW, custom paths, etc.)."""
    if os.path.exists(SETTINGS_FILE):
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"auto_start_rew": False, "custom_rew_path": None}


def save_altair_settings(settings: Dict[str, Any]) -> None:
    """Save persistent app settings."""
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2)
    except Exception:
        pass


def find_rew_in_windows_registry() -> Tuple[Optional[str], Optional[str]]:
    """
    Search Windows Registry for Room EQ Wizard uninstall entries.
    Returns (executable_path, version_display_name).
    """
    if sys.platform != "win32":
        return None, None

    try:
        import winreg
    except ImportError:
        return None, None

    registry_locations = [
        (winreg.HKEY_LOCAL_MACHINE, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_LOCAL_MACHINE, r"Software\Wow6432Node\Microsoft\Windows\CurrentVersion\Uninstall"),
        (winreg.HKEY_CURRENT_USER, r"Software\Microsoft\Windows\CurrentVersion\Uninstall"),
    ]

    for hkey, subkey in registry_locations:
        try:
            with winreg.OpenKey(hkey, subkey) as key:
                num_subkeys = winreg.QueryInfoKey(key)[0]
                for i in range(num_subkeys):
                    try:
                        name = winreg.EnumKey(key, i)
                        with winreg.OpenKey(key, name) as app_key:
                            disp_name = ""
                            try:
                                disp_name = winreg.QueryValueEx(app_key, "DisplayName")[0]
                            except OSError:
                                continue

                            disp_lower = disp_name.lower()
                            if "room eq wizard" in disp_lower or disp_lower.startswith("rew "):
                                try:
                                    install_loc = winreg.QueryValueEx(app_key, "InstallLocation")[0]
                                    if install_loc and os.path.isdir(install_loc):
                                        exe_path = os.path.join(install_loc, "roomeqwizard.exe")
                                        if os.path.exists(exe_path):
                                            return os.path.abspath(exe_path), disp_name
                                except OSError:
                                    pass

                                try:
                                    disp_icon = winreg.QueryValueEx(app_key, "DisplayIcon")[0]
                                    if disp_icon:
                                        folder = os.path.dirname(disp_icon)
                                        exe_cand = os.path.join(folder, "roomeqwizard.exe")
                                        if os.path.exists(exe_cand):
                                            return os.path.abspath(exe_cand), disp_name
                                        # Often icon is in .install4j subfolder
                                        parent_exe = os.path.join(os.path.dirname(folder), "roomeqwizard.exe")
                                        if os.path.exists(parent_exe):
                                            return os.path.abspath(parent_exe), disp_name
                                except OSError:
                                    pass
                    except OSError:
                        continue
        except OSError:
            continue

    return None, None


def find_rew_executable() -> Tuple[Optional[str], Optional[str]]:
    """
    Search for REW executable across Registry, settings, known paths, and PATH.
    Returns (absolute_path_to_exe, display_name).
    """
    settings = load_altair_settings()
    custom_path = settings.get("custom_rew_path")
    if custom_path and os.path.exists(custom_path):
        return os.path.abspath(custom_path), "Custom Configured REW"

    # 1. Check Windows Registry
    reg_exe, reg_name = find_rew_in_windows_registry()
    if reg_exe and os.path.exists(reg_exe):
        return reg_exe, reg_name

    # 2. Known default installation directories
    known_paths = [
        r"C:\Program Files\REW\roomeqwizard.exe",
        r"C:\Program Files\Room EQ Wizard\roomeqwizard.exe",
        r"C:\Program Files (x86)\REW\roomeqwizard.exe",
        r"C:\Program Files (x86)\Room EQ Wizard\roomeqwizard.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\REW\roomeqwizard.exe"),
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Room EQ Wizard\roomeqwizard.exe"),
        "/Applications/REW.app/Contents/MacOS/roomeqwizard",
        "/usr/local/bin/roomeqwizard",
        "/opt/REW/roomeqwizard",
    ]

    for p in known_paths:
        if os.path.exists(p):
            return os.path.abspath(p), "Room EQ Wizard"

    # 3. Search in system PATH
    which_exe = shutil.which("roomeqwizard") or shutil.which("roomeqwizard.exe")
    if which_exe:
        return os.path.abspath(which_exe), "Room EQ Wizard (PATH)"

    return None, None


def is_rew_process_active() -> bool:
    """Check if roomeqwizard process is running in the OS process table."""
    if sys.platform == "win32":
        try:
            # Quick tasklist filter
            output = subprocess.check_output(
                'tasklist /FI "IMAGENAME eq roomeqwizard.exe" /NH',
                shell=True,
                stderr=subprocess.DEVNULL,
                text=True,
            )
            return "roomeqwizard.exe" in output.lower()
        except Exception:
            return False
    else:
        try:
            output = subprocess.check_output(["pgrep", "-f", "roomeqwizard"], text=True)
            return bool(output.strip())
        except Exception:
            return False


async def check_rew_api_alive(base_url: str = "http://localhost:4735", timeout: float = 1.5) -> bool:
    """Check if REW REST API is reachable and responding."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.get(f"{base_url}/measurements")
            return resp.status_code == 200
    except Exception:
        return False


async def get_rew_status(base_url: str = "http://localhost:4735") -> Dict[str, Any]:
    """
    Get comprehensive REW status:
    - installation detection
    - executable directory
    - process running state
    - REST API readiness
    - auto-start preference
    """
    exe_path, display_name = find_rew_executable()
    installed = exe_path is not None and os.path.exists(exe_path)
    rew_dir = os.path.dirname(exe_path) if exe_path else None

    proc_running = is_rew_process_active()
    api_connected = await check_rew_api_alive(base_url=base_url)

    settings = load_altair_settings()
    auto_start = bool(settings.get("auto_start_rew", False))

    return {
        "installed": installed,
        "name": display_name or "Room EQ Wizard",
        "executable_path": exe_path,
        "directory": rew_dir,
        "process_running": proc_running,
        "api_connected": api_connected,
        "auto_start": auto_start,
        "port": 4735,
        "base_url": base_url,
    }


def apply_rew_recommended_defaults() -> Dict[str, Any]:
    """
    Pre-configure optimal acoustic measurement defaults in REW preferences (Windows Registry):
    - Sweep Level: -12.0 dBFS (safe headroom, prevents DAC inter-sample clipping)
    - Sweep Length: 262144 (256k samples, optimal modal resolution down to 10 Hz)
    - Sweep Start: 10 Hz
    - Sweep End: 20000 Hz (full audible bandwidth)
    - API Port: 4735
    - API Host: localhost
    """
    applied = {}
    if sys.platform == "win32":
        try:
            import winreg
            key_path = r"Software\JavaSoft\Prefs\room eq wizard"
            with winreg.CreateKey(winreg.HKEY_CURRENT_USER, key_path) as key:
                defaults = {
                    "last/Measurement/Level": "-12.0",
                    "sweeplength": "262144",
                    "lastsweepstart": "10",
                    "lastsweepend": "20000",
                    "apiport": "4735",
                    "apihost": "localhost",
                }
                for name, val in defaults.items():
                    winreg.SetValueEx(key, name, 0, winreg.REG_SZ, str(val))
                    applied[name] = val
            return {"success": True, "applied": applied}
        except Exception as e:
            return {"success": False, "error": str(e)}
    return {"success": False, "message": "Registry defaults only applicable on Windows"}


async def start_rew_background(
    executable_path: Optional[str] = None,
    port: int = 4735,
    timeout_s: float = 15.0,
    show_window: bool = True,
) -> Dict[str, Any]:
    """
    Launch REW with the -api flag in a background process and wait for API to become ready.
    When show_window is True (default), REW displays its full graphical user interface window on the desktop.
    Automatically seeds recommended acoustic defaults (-12 dBFS, 256k sweep, 10Hz-20kHz, :4735) prior to launch.
    """
    if not executable_path:
        exe, _ = find_rew_executable()
        executable_path = exe

    if not executable_path or not os.path.exists(executable_path):
        return {
            "success": False,
            "connected": False,
            "error": "REW executable not found. Please install Room EQ Wizard or specify directory.",
        }

    # Automatically pre-seed recommended acoustic defaults into REW configuration
    apply_rew_recommended_defaults()

    # If API is already reachable, nothing more needed
    if await check_rew_api_alive(f"http://localhost:{port}"):
        return {
            "success": True,
            "connected": True,
            "executable_path": executable_path,
            "message": f"REW API is already active and connected on port {port}.",
        }

    cwd = os.path.dirname(executable_path)
    cmd_args = [executable_path, "-api"]
    if not show_window:
        cmd_args.append("-nogui")

    # Launch REW with visible GUI window
    try:
        if sys.platform == "win32":
            creation_flags = subprocess.CREATE_NEW_PROCESS_GROUP
            startupinfo = None
            if show_window:
                # SW_SHOWNORMAL = 1 explicitly orders Windows to show the GUI window normally
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                startupinfo.wShowWindow = 1
            else:
                creation_flags |= subprocess.DETACHED_PROCESS

            p = subprocess.Popen(
                cmd_args,
                cwd=cwd,
                creationflags=creation_flags,
                startupinfo=startupinfo,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        elif sys.platform == "darwin":
            args = ["open", "-a", "REW.app"]
            if not show_window:
                args.extend(["--args", "-api", "-nogui"])
            else:
                args.extend(["--args", "-api"])
            p = subprocess.Popen(
                args,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            p = subprocess.Popen(
                cmd_args,
                cwd=cwd,
                start_new_session=True,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        pid = p.pid
    except Exception as e:
        return {
            "success": False,
            "connected": False,
            "error": f"Failed to launch REW process: {str(e)}",
        }

    # Poll API port for up to timeout_s seconds
    start_time = time.time()
    while time.time() - start_time < timeout_s:
        await asyncio.sleep(1.0)
        if await check_rew_api_alive(f"http://localhost:{port}", timeout=1.0):
            elapsed = round(time.time() - start_time, 1)
            return {
                "success": True,
                "connected": True,
                "pid": pid,
                "executable_path": executable_path,
                "elapsed_s": elapsed,
                "message": f"Room EQ Wizard started successfully and connected on port {port} ({elapsed}s).",
            }

    # If the process is running but API timed out, provide helpful guidance
    proc_alive = is_rew_process_active()
    return {
        "success": proc_alive,
        "connected": False,
        "pid": pid,
        "executable_path": executable_path,
        "message": (
            "REW was launched, but its REST API (:4735) has not responded yet. "
            "Please check REW Preferences -> API to ensure the API server is enabled and started."
        ),
    }
