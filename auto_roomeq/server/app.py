"""
FastAPI Server for ALTAIR (Automated Linear-phase Tuning & Acoustic Inversion Routine).
"""

import os
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from .routes import router

app = FastAPI(
    title="ALTAIR API",
    description="Automated Linear-phase Tuning & Acoustic Inversion Routine",
    version="1.0.0",
)

# Enable CORS for local Vite dev server and desktop webview
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:[0-9]+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)

app.include_router(router)

# Mount frontend static build if present
static_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "dist")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
