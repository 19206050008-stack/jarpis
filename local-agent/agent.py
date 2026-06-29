import os
import sys
import time
import json
import httpx
import win32gui
import win32process
import psutil

# Anta Local Agent
# Runs on Windows/Mac/Linux to report active windows to the Anta web application.

API_URL = os.getenv("ANTA_API_URL") or os.getenv("JARPIS_API_URL", "https://jarpis-production-a270.up.railway.app")
INTERVAL = int(os.getenv("CHECK_INTERVAL", "3"))
AGENT_ID = os.getenv("ANTA_AGENT_ID") or os.getenv("JARPIS_AGENT_ID", "default")

def get_active_window_title_win():
    hwnd = win32gui.GetForegroundWindow()
    if not hwnd:
        return None
    title = win32gui.GetWindowText(hwnd)
    
    # Get process name
    try:
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        proc = psutil.Process(pid)
        proc_name = proc.name()
    except Exception:
        proc_name = "unknown"
        
    return {"title": title, "process": proc_name}

def get_active_window():
    if sys.platform.startswith("win"):
        try:
            return get_active_window_title_win()
        except Exception as e:
            return {"error": str(e)}
    # Fallback/stub for mac/linux
    return {"title": "Unsupported Platform (Directly)", "process": sys.platform}

def main():
    print(f"Anta Local Agent started. Reporting to {API_URL} every {INTERVAL}s.")
    last_reported = None
    
    while True:
        info = get_active_window()
        if info and info != last_reported and "error" not in info:
            print(f"Active window: {info['title']} ({info['process']})")
            try:
                # Post active window state to backend API
                httpx.post(f"{API_URL}/agent/state", json={**info, "agent_id": AGENT_ID}, timeout=5)
                last_reported = info
            except Exception as e:
                print(f"Failed to report to Anta: {e}")
        time.sleep(INTERVAL)

if __name__ == "__main__":
    main()
