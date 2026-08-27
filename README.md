# ALTAIR: Automated Linear-phase Tuning & Acoustic Inversion Routine

**ALTAIR** is an automated, audiophile-grade digital room correction (DRC) and acoustic optimization suite. It bridges Room EQ Wizard (REW) via its local REST API (`http://localhost:4735`) and runs an end-to-end Python DSP engine to deliver automated, phase-linearized digital room correction in a **1-Click workflow**.

---

## Architecture & DSP Pipeline

```mermaid
flowchart TD
    subgraph Signal_Acquisition["1. Signal Ingestion & Preprocessing"]
        Sweeps["Log Sine Sweeps / REW API / .mdat / Files"]
        Deconv["Deconvolution: H(f) = Y(f)X*(f) / (|X(f)|^2 + eps)"]
        MicCal["Mic Calibration (.cal) Integration"]
        CrossCorr["Cross-Correlation Alignment: tau = argmax (h1 * h2)(t)"]
        VectorAvg["Vector Averaging: H_avg(f) = 1/N sum H_i(f)"]
        Sweeps --> Deconv --> MicCal --> CrossCorr --> VectorAvg
    end

    subgraph Acoustic_Intelligence["2. Acoustic Intelligence (Statistical & Envelope Engine)"]
        Schroeder["Statistical Schroeder Frequency Detection (Modal vs Diffuse)"]
        HilbertGap["Hilbert Envelope 1st Reflection Arrival & Auto FDW Cycles"]
        SpeakerRolloff["Loudspeaker -6dB Rolloff & Optimal Sub Crossover"]
        VectorAvg --> Schroeder & HilbertGap & SpeakerRolloff
    end

    subgraph Three_Filter_DSP["3. Core 3-Module DSP Pipeline"]
        subgraph Mod1["Module 1: Virtual Bass Array (VBA)"]
            ModalExtract["Modal Peak & Dip Scan (20-150Hz) +/-10% Window"]
            LPF_Synth["4th-Order 24dB/oct Min-Phase LPF (f_cutoff = 3.5 * f_opt)"]
            VBA_Pulse["Delayed Pulse: h_VBA[n] = delta[n] - 0.5 * h_LPF[n - d]"]
            ModalExtract --> LPF_Synth --> VBA_Pulse
        end

        subgraph Mod2["Module 2: Regularized Magnitude Inversion"]
            TargetCurve["House Target T(f) (Harman, B&K, RMS Anchored 300Hz-1kHz)"]
            Tikhonov["Tikhonov Inversion: H_inv = T*H1* / (|H1|^2 + beta*|T|^2)"]
            BoostCap["Cap Max Boost <= +5 dB, Full Cuts to -20 dB"]
            HilbertMin["Hilbert Minimum-Phase: phi_min = -H{ln|H_inv|}"]
            TargetCurve --> Tikhonov --> BoostCap --> HilbertMin
        end

        subgraph Mod3["Module 3: Crossover & Phase Linearization"]
            FDW_1Cycle["1-Cycle Frequency-Dependent Windowing (FDW)"]
            CrossoverAP["Crossover All-Pass Reversal: H_phase(s) = A*(-s) / A(s)"]
            LowQ_Unwrap["Low-Frequency Phase Unwrap (Q <= 1.0, dTheta <= 45 deg)"]
            FDW_1Cycle --> CrossoverAP --> LowQ_Unwrap
        end

        Schroeder --> Mod1
        Mod1 --> Mod2
        Mod2 --> Mod3
    end

    subgraph Safeguards_Convolve["4. Convolution & Safeguards"]
        Convolution["Impulse Convolution: h_final = h_VBA * h_inv * h_phase"]
        PreRingingGuard{"Pre-Ringing Test: Ampl > 10% between -20ms & -5ms?"}
        AttenuateQ["Auto-Attenuate Q-Factor & Regularization"]
        HeadroomCheck["Headroom Peak Offset (-3dB to -6dB Preamp)"]
        TukeyWindow["Tukey Tap Windowing (alpha=0.05) to 65,536 / 131,072 Taps"]

        Mod1 & Mod2 & Mod3 --> Convolution
        Convolution --> PreRingingGuard
        PreRingingGuard -- "Failed (>10%)" --> AttenuateQ --> Convolution
        PreRingingGuard -- "Passed" --> HeadroomCheck --> TukeyWindow
    end

    subgraph Exporters_UI["5. Multi-Platform Exporters & 1-Click UI"]
        SubAlign["Subwoofer + Mains Time & Polarity Optimizer"]
        WAV_IR["32/64-bit IEEE Float WAV FIR (44.1k - 192kHz)"]
        EqAPO_Cfg["Equalizer APO (config.txt + Convolution & Preamp)"]
        Camilla_YML["CamillaDSP Config (camilladsp.yml)"]
        MiniDSP_Txt["miniDSP Biquad & Flex FIR Coefficients"]
        RePhase_XML["rePhase Project (.rephase XML)"]
        WebDashboard["Interactive Audiophile Web/Desktop Dashboard"]

        TukeyWindow --> SubAlign
        SubAlign --> WAV_IR & EqAPO_Cfg & Camilla_YML & MiniDSP_Txt & RePhase_XML & WebDashboard
    end
```

---

## Technical Safeguards & Intelligence

### 1. Statistical Schroeder Frequency Detection
Rather than assuming a static transition frequency (~200–300 Hz), ALTAIR analyzes the moving variance of the modal spectrum. At low frequencies (modal zone), room resonance variance is high. Above the Schroeder transition frequency, modal density causes variance to settle into a stochastic baseline. This precisely identifies where to switch between modal cancellation and diffuse EQ.

### 2. Hilbert Analytic Reflection Gap & Auto FDW Tuning
Computes the Hilbert analytic signal envelope to detect the time gap $\Delta t$ between direct sound arrival and the first strong boundary reflection. Automatically calculates optimal Frequency-Dependent Window (FDW) cycles ($\text{Cycles} = \Delta t \cdot f_{\text{ref}}$) to isolate direct sound without cutting off bass transients or letting room reflections corrupt phase correction.

### 3. Harmonic Peak Matching ($\pm 10\%$ Room Tolerance Window)
In real rooms, wall boundary materials and furniture shift room mode frequencies from idealized rectangular room formulas ($f_k = k \cdot \frac{c}{2L}$). ALTAIR searches with a $\pm 10\%$ harmonic tolerance band for fundamental $P_1, P_2, P_3$ modes and boundary cancellation dips $D_1, D_2$, applying full modal cuts while capping anti-null boosts to $+5\text{ dB}$ to prevent driver damage and clipping.

### 4. Pre-Ringing Safeguard & Time-Domain Step Response Evaluation
Sharp linear-phase filters can produce audible pre-ringing before transients ($t < 0\text{ ms}$). ALTAIR evaluates the synthesized time-domain step response $s(t)$ and impulse response $h(t)$ in the pre-transient window $[-20\text{ ms}, -5\text{ ms}]$. If pre-ringing exceeds **$10\%$ normalized amplitude**, the algorithm automatically attenuates filter Q-factors and increases regularization damping.

### 5. Subwoofer + Mains Time & Phase Alignment
Calculates the optimal delay ($\Delta t$ in milliseconds and samples) and acoustic polarity across the crossover overlap band ($40\text{ Hz} - 160\text{ Hz}$) to eliminate acoustic phase cancellation dips.

---

## Multi-Platform Hardware & Convolver Export Profiles

| Platform | Generated Files | Use Case |
| :--- | :--- | :--- |
| **Equalizer APO** | `EqualizerAPO/config.txt`, `ALTAIR_Stereo_FIR_32bit.wav` | System-wide Windows PC audio / gaming / streaming |
| **CamillaDSP** | `CamillaDSP/camilladsp.yml`, `ALTAIR_Left_FIR_32bit.wav`, `ALTAIR_Right_FIR_32bit.wav` | Raspberry Pi streamer, Linux DACs, macOS |
| **miniDSP Flex / SHD** | `miniDSP/fir_coeffs_left.txt`, `miniDSP/fir_coeffs_right.txt` | Hardware DSP FIR convolution slots (4,096 taps) |
| **Roon / JRiver / HQPlayer**| `WAV_Filters/ALTAIR_Stereo_FIR_32bit.wav` | Audiophile bit-perfect convolution playback |
| **rePhase** | `rePhase/ALTAIR_Project.rephase` | Opening directly in rePhase for manual curve inspection |

---

## Quick Start Guide

### 1. Installation
```bash
git clone https://github.com/Hungbocluaqua/ALTAIR.git
cd ALTAIR
pip install -r requirements.txt
pip install -e .
```

### 2. Launch the Application
```bash
python -m auto_roomeq.main
```
This starts the backend at `http://127.0.0.1:8000` and automatically opens the interactive Web Dashboard in your browser.

### 3. 1-Click Workflow
1. **Choose Input**: Select **Demo Audiophile Room** or **Pull from REW API** (with REW open at `localhost:4735`) or upload your measurement files.
2. **Select Target House Curve**: Choose **Harman Reference (+6dB bass)**, **B&K 1974**, **OCA Audiophile**, or **Custom**.
3. **Click 🚀 "RUN 1-CLICK OPTIMIZATION"**:
   - Watch the live 8-stage progress checklist complete.
   - Inspect the Before vs Target vs After interactive SPL magnitude, phase, step response pre-ringing, and subwoofer summation curves.
4. **Click "📦 DOWNLOAD 1-CLICK PACKAGE (.ZIP)"**:
   - Unpack your ready-to-use Equalizer APO, CamillaDSP, miniDSP, and WAV FIR filters!

---

## Testing & Verification
Run the automated test suite with pytest:
```bash
pytest tests/ -v
```
All **89 tests** verify DSP acquisition, deconvolution, vector averaging, Module 1 VBA, Module 2 Tikhonov inversion (incl. SBIR/wavelet-decay hard-clamping and spatial variance weighting), Module 3 phase linearization (incl. regularized excess-phase inversion), acoustic intelligence (Schroeder, reflection gap, ISO 9613-1), Farina sweep ingestion, mic .cal application, pre-ringing safeguards with the Zwicker audibility gate, multi-sub MSO, WFIR exports, `.mdat` parsing, SSE streaming, session persistence, and end-to-end orchestrator execution.

## Recent Enhancements (Roadmap Activation)
- **Live pipeline wiring**: Farina harmonic separation (recorded-sweep uploads), mic `.cal` ingestion, multi-seat spatial variance weighting, wavelet modal-decay gating, SBIR hard clamps, closed-loop pre-ringing attenuation with Zwicker masking gate, and Multi-Sub Matrix Optimization (2–4 subwoofers).
- **Physics & psychoacoustics**: ISO 9613-1 air-absorption target adaptation and continuous ERB smoothing for multi-seat averaging.
- **DSP/export**: regularized excess-phase deconvolution in Module 3, hybrid IIR+FIR miniDSP setup file, and optional Warped FIR (WFIR) exports for embedded DSPs.
- **System & UX**: live SSE progress streaming (`POST /api/optimize/stream`) into the UI, best-effort `.mdat` parsing, and JSON project session persistence (`altair_project.json`).
See `ARCHITECTURE_ANALYSIS.md` for the complete architecture reference.
