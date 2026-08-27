import { StatusResponse, OptimizationRequest, OptimizationResponse } from '../types';

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

export function getExportBundleUrl(): string {
  return `${API_BASE}/export/bundle`;
}

export async function uploadMeasurementFile(file: File, channel: string): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('channel', channel);
  formData.append('sample_rate', '48000');

  const resp = await fetch(`${API_BASE}/measurements/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!resp.ok) {
    throw new Error(`Upload failed: ${resp.statusText}`);
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

