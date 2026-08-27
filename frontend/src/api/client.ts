import { StatusResponse, OptimizationRequest, OptimizationResponse, ProgressEvent, SessionStatus } from '../types';

const API_BASE = '/api';

export async function fetchStatus(): Promise<StatusResponse> {
  const resp = await fetch(`${API_BASE}/status`);
  if (!resp.ok) {
    throw new Error(`Failed to fetch status: ${resp.statusText}`);
  }
  return resp.json();
}

export async function runOptimization(req: OptimizationRequest): Promise<OptimizationResponse> {
  const resp = await fetch(`${API_BASE}/optimize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.detail || `Optimization failed with status ${resp.status}`);
  }
  return resp.json();
}

export interface StreamHandlers {
  onProgress: (evt: ProgressEvent) => void;
  onResult: (result: OptimizationResponse) => void;
  onError: (message: string) => void;
}

/**
 * Run the optimization with live Server-Sent Events progress streaming.
 * Falls back to the plain endpoint when streaming fails.
 */
export async function runOptimizationStreamed(req: OptimizationRequest, handlers: StreamHandlers): Promise<OptimizationResponse> {
  let sawAnyEvent = false;
  let serverError: string | null = null;

  try {
    const resp = await fetch(`${API_BASE}/optimize/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!resp.ok || !resp.body) {
      throw new Error(`Stream failed with status ${resp.status}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: OptimizationResponse | null = null;

    const dispatch = (eventName: string, data: string) => {
      if (!data.trim()) return;
      try {
        const payload = JSON.parse(data);
        if (eventName === 'progress') {
          sawAnyEvent = true;
          handlers.onProgress(payload as ProgressEvent);
        } else if (eventName === 'result') {
          sawAnyEvent = true;
          result = payload as OptimizationResponse;
          handlers.onResult(payload as OptimizationResponse);
        } else if (eventName === 'error') {
          sawAnyEvent = true;
          const msg = payload.detail || 'Optimization failed';
          serverError = msg;
          handlers.onError(msg);
        }
      } catch (_) {
        /* ignore malformed frames */
      }
    };

    let eventName = 'message';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';
      for (const frame of frames) {
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dispatch(eventName, line.slice(5).trim());
          }
        }
      }
    }
    if (buffer.trim()) {
      for (const line of buffer.split('\n')) {
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dispatch(eventName, line.slice(5).trim());
        }
      }
    }

    if (serverError) {
      throw new Error(serverError);
    }
    if (!result) {
      throw new Error('Optimization stream ended without a result event');
    }
    return result;
  } catch (e: any) {
    // Fall back to the plain endpoint ONLY on transport failure before the
    // server emitted any event. Once the server spoke (progress/result/error),
    // its answer is authoritative — never silently re-run the optimization.
    if (sawAnyEvent || serverError) {
      throw e;
    }
    return runOptimization(req);
  }
}

export function getExportBundleUrl(): string {
  return `${API_BASE}/export/bundle`;
}

export async function uploadMeasurementFile(
  file: File,
  channel: string,
  measurementType: 'ir' | 'sweep' = 'ir'
): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('channel', channel);
  formData.append('sample_rate', '48000');
  formData.append('measurement_type', measurementType);

  const resp = await fetch(`${API_BASE}/measurements/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.detail || `Upload failed: ${resp.statusText}`);
  }
  return resp.json();
}

export async function uploadCalFile(file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);

  const resp = await fetch(`${API_BASE}/measurements/upload-cal`, {
    method: 'POST',
    body: formData,
  });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.detail || `Calibration upload failed: ${resp.statusText}`);
  }
  return resp.json();
}

export async function uploadMultiSubMeasurementFiles(files: FileList | File[]): Promise<any> {
  const formData = new FormData();
  Array.from(files).forEach((file) => {
    formData.append('files', file);
  });
  formData.append('sample_rate', '48000');

  const resp = await fetch(`${API_BASE}/measurements/upload-multi-sub`, {
    method: 'POST',
    body: formData,
  });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.detail || `Multi-sub upload failed: ${resp.statusText}`);
  }
  return resp.json();
}

export async function simulateSubDelay(delayMs: number, polarity: number, crossoverFreq: number): Promise<any> {
  const formData = new FormData();
  formData.append('delay_ms', delayMs.toString());
  formData.append('polarity', polarity.toString());
  formData.append('crossover_freq', crossoverFreq.toString());

  const resp = await fetch(`${API_BASE}/sub-alignment/simulate`, {
    method: 'POST',
    body: formData,
  });
  if (!resp.ok) {
    throw new Error(`Sub simulation failed: ${resp.statusText}`);
  }
  return resp.json();
}

export async function uploadRepeatedMeasurementFiles(files: FileList | File[], channel: string): Promise<any> {
  const formData = new FormData();
  Array.from(files).forEach((file) => {
    formData.append('files', file);
  });
  formData.append('channel', channel);
  formData.append('sample_rate', '48000');

  const resp = await fetch(`${API_BASE}/measurements/upload-repeated`, {
    method: 'POST',
    body: formData,
  });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.detail || `Repeated upload failed: ${resp.statusText}`);
  }
  return resp.json();
}

export async function uploadMultiSeatMeasurementFiles(files: FileList | File[], channel: string, schroederFreq: number = 300): Promise<any> {
  const formData = new FormData();
  Array.from(files).forEach((file) => {
    formData.append('files', file);
  });
  formData.append('channel', channel);
  formData.append('sample_rate', '48000');
  formData.append('schroeder_freq', schroederFreq.toString());

  const resp = await fetch(`${API_BASE}/measurements/upload-multi-seat`, {
    method: 'POST',
    body: formData,
  });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.detail || `Multi-seat upload failed: ${resp.statusText}`);
  }
  return resp.json();
}

export function getAutoSweepDownloadUrl(channel: string = 'left', repetitions: number = 2): string {
  return `${API_BASE}/measurements/auto-sweep?channel=${channel}&repetitions=${repetitions}`;
}

export async function triggerAutoRepeatedSweep(
  channel: string = 'left',
  repetitions: number = 4,
  sampleRate: number = 48000,
  useSimulation: boolean = false
): Promise<any> {
  const resp = await fetch(`${API_BASE}/measurements/auto-repeated-sweep?channel=${channel}&repetitions=${repetitions}&sample_rate=${sampleRate}&use_simulation=${useSimulation}`, {
    method: 'POST',
  });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.detail || `Auto repeated sweep failed: ${resp.statusText}`);
  }
  return resp.json();
}

// ---------------------------------------------------------------------------
// Session persistence
// ---------------------------------------------------------------------------
export async function getSessionStatus(): Promise<SessionStatus> {
  const resp = await fetch(`${API_BASE}/session`);
  if (!resp.ok) throw new Error(`Session status failed: ${resp.statusText}`);
  return resp.json();
}

export async function saveSession(): Promise<any> {
  const resp = await fetch(`${API_BASE}/session/save`, { method: 'POST' });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.detail || `Session save failed: ${resp.statusText}`);
  }
  return resp.json();
}

export async function loadSession(): Promise<any> {
  const resp = await fetch(`${API_BASE}/session/load`, { method: 'POST' });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.detail || `Session load failed: ${resp.statusText}`);
  }
  return resp.json();
}

export async function clearSession(): Promise<any> {
  const resp = await fetch(`${API_BASE}/session/clear`, { method: 'POST' });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.detail || `Session clear failed: ${resp.statusText}`);
  }
  return resp.json();
}

export interface RepeatedSweepResult {
  status: string;
  channel: string;
  mode: string;
  estimated_snr_db: number;
  valid_sweeps: number;
  repetitions_requested: number;
  snr_improvement_db?: number;
  repetitions?: number;
  channels_measured?: string[];
  details?: Record<string, any>;
  message?: string;
}

/**
 * Run N repeated sweeps on a channel and return the coherently stacked result.
 * Mirrors the backend /api/measurements/auto-repeated-sweep endpoint, renaming
 * its response fields to the names the editorial UI expects.
 * 'both' is mapped to the backend's 'all' (left + right + sub).
 */
export async function runRepeatedSweeps(opts: {
  channel: string;
  repetitions: number;
  outlier_rejection?: boolean;
  use_simulation?: boolean;
}): Promise<RepeatedSweepResult> {
  const channel = opts.channel === 'both' ? 'all' : opts.channel;
  const data = await triggerAutoRepeatedSweep(channel, opts.repetitions, 48000, opts.use_simulation ?? false);
  return {
    status: data.status ?? 'success',
    channel: data.channel ?? channel,
    mode: data.mode ?? 'unknown',
    estimated_snr_db: typeof data.snr_improvement_db === 'number' ? data.snr_improvement_db : 0,
    valid_sweeps: typeof data.repetitions === 'number' ? data.repetitions : opts.repetitions,
    repetitions_requested: opts.repetitions,
    snr_improvement_db: data.snr_improvement_db,
    repetitions: data.repetitions,
    channels_measured: data.channels_measured,
    details: data.details,
    message: data.message,
  };
}

// ---------------------------------------------------------------------------
// REW Lifecycle & Auto-Start Management
// ---------------------------------------------------------------------------
export async function fetchRewStatus(): Promise<any> {
  const resp = await fetch(`${API_BASE}/rew/status`);
  if (!resp.ok) throw new Error(`REW status failed: ${resp.statusText}`);
  return resp.json();
}

export async function detectRew(): Promise<any> {
  const resp = await fetch(`${API_BASE}/rew/detect`, { method: 'POST' });
  if (!resp.ok) throw new Error(`REW detection failed: ${resp.statusText}`);
  return resp.json();
}

export async function startRew(
  executablePath?: string,
  autoStartPreference?: boolean,
  showWindow: boolean = true
): Promise<any> {
  const resp = await fetch(`${API_BASE}/rew/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      executable_path: executablePath || null,
      auto_start_preference: autoStartPreference !== undefined ? autoStartPreference : null,
      show_window: showWindow,
    }),
  });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to start REW: ${resp.statusText}`);
  }
  return resp.json();
}

export async function updateRewSettings(autoStart?: boolean, customPath?: string): Promise<any> {
  const resp = await fetch(`${API_BASE}/rew/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auto_start: autoStart !== undefined ? autoStart : null,
      custom_rew_path: customPath || null,
    }),
  });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to update REW settings: ${resp.statusText}`);
  }
  return resp.json();
}

export async function applyRewDefaults(): Promise<any> {
  const resp = await fetch(`${API_BASE}/rew/apply-defaults`, { method: 'POST' });
  if (!resp.ok) {
    const errorData = await resp.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to apply REW defaults: ${resp.statusText}`);
  }
  return resp.json();
}



