export interface HardwareProfile {
  cpuCores: number;
  gpuRenderer: string;
  gpuVendor: string;
  gpuCount: number;
  isNvidiaGpu: boolean;
  nvidiaModel?: string;
  recommendedAcceleration: 'nvidia_cuda' | 'cpu_onnx';
  hardwareSummary: string;
  /** True while the server has not answered yet, or if the request failed. */
  isDetecting: boolean;
}

/**
 * Asks the server, not the browser. WebGL reports the *viewer's* GPU, which
 * on a phone or a remote desktop says nothing about the machine actually
 * running the models.
 */
async function fetchServerHardware(): Promise<Partial<HardwareProfile>> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`health ${res.status}`);
  const data = await res.json();
  return data.hardware ?? {};
}

export async function detectSystemHardware(): Promise<HardwareProfile> {
  const cpuCores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;

  let hw: Partial<HardwareProfile> = {};
  let failed = false;
  try {
    hw = await fetchServerHardware();
  } catch {
    failed = true;
  }

  const gpuCount = hw.gpuCount ?? 0;
  const isNvidiaGpu = Boolean(hw.isNvidiaGpu) || gpuCount > 0;
  const nvidiaModel = hw.nvidiaModel;
  const gpuRenderer = hw.gpuRenderer || 'Không xác định';
  const gpuVendor = hw.gpuVendor || (isNvidiaGpu ? 'NVIDIA' : 'Generic');

  const recommendedAcceleration = isNvidiaGpu ? 'nvidia_cuda' : 'cpu_onnx';

  const coreText = hw.cpuCores ? `${hw.cpuCores} cores` : `${cpuCores} cores`;
  const hardwareSummary = isNvidiaGpu
    ? `${gpuCount}× ${nvidiaModel || 'NVIDIA GPU'} — CUDA FP16 / 48kHz`
    : `CPU đa nhân (${coreText}) — ONNX`;

  return {
    cpuCores: hw.cpuCores ?? cpuCores,
    gpuRenderer,
    gpuVendor,
    gpuCount,
    isNvidiaGpu,
    nvidiaModel,
    recommendedAcceleration,
    hardwareSummary,
    isDetecting: failed,
  };
}
