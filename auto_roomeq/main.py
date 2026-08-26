"""
Main Entry Point for AutoRoomEQ Application.
"""

import sys
import argparse
import webbrowser
import uvicorn


def main():
    parser = argparse.ArgumentParser(
        description="AutoRoomEQ: High-Fidelity Automated Digital Room Correction & REW/rePhase Studio"
    )
    parser.add_argument("--host", type=str, default="127.0.0.1", help="Host address to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port to run server on (default: 8000)")
    parser.add_argument("--no-browser", action="store_true", help="Do not automatically open web browser")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload for development")
    
    args = parser.parse_args()
    
    url = f"http://{args.host}:{args.port}"
    print("=" * 65)
    print(" 🚀 AutoRoomEQ: High-Fidelity Digital Room Correction Studio")
    print(f" 🌐 Web Dashboard: {url}")
    print(" 📡 REW REST API:  http://localhost:4735 (Auto-detecting)")
    print("=" * 65)
    
    if not args.no_browser and not args.reload:
        try:
            webbrowser.open(url)
        except Exception:
            pass
            
    uvicorn.run(
        "auto_roomeq.server.app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
    )


if __name__ == "__main__":
    main()
