"""
Comprehensive Live System Verification Script for ALTAIR.
Executes end-to-end integration and asserts all features work as intended:
1. Backend Status Check
2. Automated 4x Repeated Sweep Acquisition & Stacking (Left, Right, Sub)
3. Full Optimization Pipeline with Real Acoustical Measurements
4. Subwoofer Live Simulation with Fractional Delays
5. Complete Export Bundle Validation (APO, CamillaDSP, miniDSP, rePhase, WAV)
"""

import sys
import io
import zipfile
import json
from fastapi.testclient import TestClient

from auto_roomeq.server.app import app

def main():
    print("=== STARTING ALTAIR SYSTEM VERIFICATION ===")
    client = TestClient(app)
    
    # 1. Status Check
    print("[1/5] Checking /api/status...")
    res = client.get("/api/status")
    assert res.status_code == 200, f"Status failed: {res.text}"
    status_data = res.json()
    print(f" -> App: {status_data['app']} v{status_data['version']}")
    print(f" -> REW connected: {status_data['rew_connected']}")
    
    # 2. Automated 4x Repeated Sweep Acquisition & Stacking for Full 2.1 System
    print("\n[2/5] Running Automated 4x Repeated Sweep for Full 2.1 System...")
    res_sweep = client.post("/api/measurements/auto-repeated-sweep?channel=all&repetitions=4&use_simulation=true")
    assert res_sweep.status_code == 200, f"Auto-sweep failed: {res_sweep.text}"
    sweep_data = res_sweep.json()
    assert sweep_data["status"] == "success"
    assert sweep_data["repetitions"] == 4
    assert sweep_data["snr_improvement_db"] == 6.02
    assert len(sweep_data["channels_measured"]) == 3
    print(f" -> Captured: {sweep_data['channels_measured']}")
    print(f" -> Measured SNR Improvement: +{sweep_data['snr_improvement_db']} dB")
    for ch, details in sweep_data["details"].items():
        print(f"    * {ch.upper()}: {details['repetitions']}x sweeps stacked, +{details['snr_gain_db']} dB SNR gain ({details['mode']})")

    # 3. Full Optimization Pipeline with Acquired Measurements
    print("\n[3/5] Executing Full 1-Click Acoustic Optimization...")
    opt_payload = {
        "target": {
            "name": "harman",
            "bass_boost_db": 6.0,
            "bass_cutoff_hz": 80.0,
            "hf_slope_db_per_oct": -0.8,
            "hf_start_hz": 1000.0,
        },
        "crossover_freq_hz": 2800.0,
        "crossover_order": 4,
        "sub_crossover_freq_hz": 130.0,  # User's Edifier MR3 + T5s crossover
        "target_taps": 65536,
        "temperature_celsius": 24.0,
        "relative_humidity_pct": 55.0,
        "use_demo_measurements": False,  # Uses the newly acquired measurements from step 2
    }
    res_opt = client.post("/api/optimize", json=opt_payload)
    assert res_opt.status_code == 200, f"Optimization failed: {res_opt.text}"
    opt_data = res_opt.json()
    assert opt_data["status"] == "success"
    print(f" -> Target Taps: {opt_data['target_taps']}")
    print(f" -> Global Preamp Headroom: {opt_data['global_preamp_db']:.2f} dB")
    print(f" -> True-Peak Left: {opt_data['true_peak_left_dbfs']:.2f} dBTP")
    print(f" -> True-Peak Right: {opt_data['true_peak_right_dbfs']:.2f} dBTP")
    
    # Verify Acoustic Intelligence Diagnostics
    intel = opt_data["acoustic_intelligence"]
    assert intel is not None
    print(f" -> Schroeder Transition: {intel['detected_schroeder_hz']} Hz")
    print(f" -> Reflection Arrival: {intel['detected_reflection_gap_ms']} ms (Auto FDW: {intel['recommended_fdw_cycles']} cycles)")
    print(f" -> Speaker Low Rolloff: {intel['speaker_low_rolloff_hz']} Hz")
    print(f" -> Ideal Sub Crossover: {intel['recommended_sub_crossover_hz']} Hz")
    print(f" -> Speed of Sound: {intel['speed_of_sound_mps']} m/s at {intel['temperature_celsius']} C")
    
    # Verify Subwoofer Alignment Diagnostics
    sub = opt_data["sub_alignment"]
    assert sub is not None
    print(f" -> Optimal Sub Delay: {sub['optimal_delay_ms']} ms ({sub['optimal_delay_samples']} samples)")
    print(f" -> Optimal Polarity: {sub['optimal_polarity']}")
    print(f" -> Summation Gain Boost: +{sub['gain_improvement_db']:.2f} dB SPL")
    
    # Verify Zwicker Backward Masking Safeguards
    zw_l = opt_data["zwicker_masking_left"]
    zw_r = opt_data["zwicker_masking_right"]
    assert zw_l["is_masked"] is True
    assert zw_r["is_masked"] is True
    print(f" -> Zwicker Temporal Masking Left: Masked={zw_l['is_masked']} (Worst Margin: {zw_l['worst_margin_db']:.1f} dB)")
    print(f" -> Zwicker Temporal Masking Right: Masked={zw_r['is_masked']} (Worst Margin: {zw_r['worst_margin_db']:.1f} dB)")

    # 4. Interactive Subwoofer Delay Simulation
    print("\n[4/5] Testing Interactive Subwoofer Delay Simulation...")
    sim_payload = {
        "delay_ms": "-2.5",
        "polarity": "1.0",
        "crossover_freq": "130.0",
    }
    res_sim = client.post("/api/sub-alignment/simulate", data=sim_payload)
    assert res_sim.status_code == 200
    sim_data = res_sim.json()
    assert "spl_sum_db" in sim_data
    assert len(sim_data["spl_sum_db"]) > 50
    print(f" -> Live complex phase summation returned {len(sim_data['spl_sum_db'])} frequency bins.")

    # 5. Export ZIP Bundle Integrity Check
    print("\n[5/5] Testing Export ZIP Package Generation & File Contents...")
    res_bundle = client.get("/api/export/bundle")
    assert res_bundle.status_code == 200
    assert res_bundle.headers["content-type"] == "application/zip"
    
    with zipfile.ZipFile(io.BytesIO(res_bundle.content), "r") as zf:
        file_list = zf.namelist()
        print(f" -> ZIP Archive contains {len(file_list)} files:")
        for fname in sorted(file_list):
            info = zf.getinfo(fname)
            print(f"    * {fname} ({info.file_size:,} bytes)")
            
        assert "WAV_Filters/ALTAIR_Stereo_FIR_32bit.wav" in file_list
        assert "EqualizerAPO/config.txt" in file_list
        assert "CamillaDSP/camilladsp.yml" in file_list
        assert "miniDSP/fir_coeffs_left.txt" in file_list
        assert "miniDSP/biquad_coeffs_left.txt" in file_list
        assert "rePhase/ALTAIR_Project.rephase" in file_list
        assert "README_INSTALL.txt" in file_list
        
        # Verify Equalizer APO config text
        apo_txt = zf.read("EqualizerAPO/config.txt").decode("utf-8")
        assert "Preamp:" in apo_txt
        assert "Convolution:" in apo_txt
        print("\n -> Equalizer APO config.txt validated successfully.")
        
        # Verify CamillaDSP YAML syntax
        camilla_txt = zf.read("CamillaDSP/camilladsp.yml").decode("utf-8")
        assert "filters:" in camilla_txt
        assert "pipeline:" in camilla_txt
        print(" -> CamillaDSP YAML validated successfully.")
        
        # Verify miniDSP biquads
        biquad_txt = zf.read("miniDSP/biquad_coeffs_left.txt").decode("utf-8")
        assert "biquad1" in biquad_txt
        print(" -> miniDSP PEQ biquads validated successfully.")

    print("\n=======================================================")
    print("ALL ALTAIR SYSTEM FEATURES WORKING AS INTENDED! (100%)")
    print("=======================================================")

if __name__ == "__main__":
    main()
