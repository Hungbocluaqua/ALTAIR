# AutoRoomEQ: 1-Click High-Fidelity Room Correction & REW/rePhase Studio

AutoRoomEQ is an automated, audiophile-grade digital room correction suite inspired by OCA (Obsessive Compulsive Audiophile / Audyssey One / A1 Evo). It seamlessly bridges Room EQ Wizard (REW) via its local REST API (`http://localhost:4735`) and runs an end-to-end Python DSP engine to deliver automated, phase-linearized digital room correction in a **1-Click workflow**.

---

## Key Features & DSP Pipeline

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

    subgraph Three_Filter_DSP["2. Core 3-Module DSP Pipeline"]
        subgraph Mod1["Module 1: Virtual Bass Array (VBA)"]
            ModalExtract["Modal Peak & Dip Scan (20-150Hz) +/-10% Window"]
            LPF_Synth["8th-Order 48dB/oct Min-Phase LPF (f_cutoff = 3.5 * f_opt)"]
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

        VectorAvg --> Mod1
        Mod1 --> Mod2
        Mod2 --> Mod3
    end

    subgraph Safeguards_Convolve["3. Convolution & Safeguards"]
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

    subgraph Exporters_UI["4. Multi-Platform Exporters & 1-Click UI"]
        WAV_IR["32/64-bit IEEE Float WAV FIR (44.1k - 192kHz)"]
        EqAPO_Cfg["Equalizer APO (config.txt + Convolution & Preamp)"]
        Camilla_YML["CamillaDSP Config (camilladsp.yml)"]
        MiniDSP_Txt["miniDSP Biquad & Flex FIR Coefficients"]
        RePhase_XML["rePhase Project (.rephase XML)"]
        WebDashboard["Interactive Audiophile Web/Desktop Dashboard"]

        TukeyWindow --> WAV_IR
        TukeyWindow --> EqAPO_Cfg
        TukeyWindow --> Camilla_YML
        TukeyWindow --> MiniDSP_Txt
        TukeyWindow --> RePhase_XML
        TukeyWindow --> WebDashboard
    end
```

---

## Technical Safeguards & Innovations

### 1. Harmonic Peak Matching ($\pm 10\%$ Room Tolerance Window)
In real rooms, wall boundary materials (drywall compliance, glass, concrete) and furniture shift room mode frequencies from idealized rectangular room formulas ($f_k = k \cdot \frac{c}{2L}$). AutoRoomEQ searches with a $\pm 10\%$ harmonic tolerance band for fundamental $P_1, P_2, P_3$ modes and boundary cancellation dips $D_1, D_2$, applying full modal cuts while capping anti-null boosts to $+5\text{ dB}$ to prevent driver damage and clipping.

### 2. Pre-Ringing Safeguard & Time-Domain Step Response Evaluation
Sharp linear-phase filters can produce audible pre-ringing before transients ($t < 0\text{ ms}$). AutoRoomEQ evaluates the synthesized time-domain step response $s(t)$ and impulse response $h(t)$ in the pre-transient window $[-20\text{ ms}, -5\text{ ms}]$. If pre-ringing exceeds **$10\%$ normalized amplitude**, the algorithm automatically attenuates filter Q-factors and increases regularization damping.

### 3. Automated Tap Trimming & Headroom Protection
Filters are smoothly tapered (using Tukey $\alpha = 0.05$ or Blackman-Harris windows) to exact hardware tap counts ($4,096$, $65,536$, or $131,072$ taps) with zero truncation clicks. Peak gains are analyzed to compute the required global preamp headroom offset ($-3\text{ dB}$ to $-6\text{ dB}$) preventing inter-sample DAC clipping.

### 4. Subwoofer + Mains Time & Phase Alignment
Calculates the optimal delay ($\Delta t$ in milliseconds and samples) and acoustic polarity across the crossover overlap band ($40\text{ Hz} - 160\text{ Hz}$) to eliminate acoustic phase cancellation dips.

---

## Multi-Platform Hardware & Convolver Export Profiles

| Platform | Generated Files | Use Case |
| :--- | :--- | :--- |
| **Equalizer APO** | `EqualizerAPO/config.txt`, `AutoRoomEQ_Stereo_FIR_32bit.wav` | System-wide Windows PC audio / gaming / streaming |
| **CamillaDSP** | `CamillaDSP/camilladsp.yml`, `AutoRoomEQ_Left_FIR_32bit.wav`, `AutoRoomEQ_Right_FIR_32bit.wav` | Raspberry Pi streamer, Linux DACs, macOS |
| **miniDSP Flex / SHD** | `miniDSP/fir_coeffs_left.txt`, `miniDSP/fir_coeffs_right.txt` | Hardware DSP FIR convolution slots (4,096 taps) |
| **Roon / JRiver / HQPlayer**| `WAV_Filters/AutoRoomEQ_Stereo_FIR_32bit.wav` | Audiophile bit-perfect convolution playback |
| **rePhase** | `rePhase/AutoRoomEQ_Project.rephase` | Opening directly in rePhase for manual curve inspection |

---

## Quick Start Guide

### 1. Installation
```bash
git clone https://github.com/your-username/AutomaticDigitalRoomeq.git
cd AutomaticDigitalRoomeq
pip install -r requirements.txt
```

### 2. Launch the Application
```bash
python -m auto_roomeq.main
```
This starts the backend at `http://127.0.0.1:8000` and automatically opens the interactive Web Dashboard in your browser.

### 3. 1-Click Workflow
1. **Choose Input**: Select **Demo Audiophile Room** (for instant testing) or **Pull from REW API** (with REW open at `localhost:4735`) or upload your own files.
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
All 10 tests verify DSP acquisition, deconvolution, vector averaging, Module 1 VBA, Module 2 Tikhonov inversion, Module 3 phase linearization, pre-ringing safeguards, and end-to-end orchestrator execution.
