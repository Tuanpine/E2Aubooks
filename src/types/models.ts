export interface ModelFileSpec {
  fileName: string;
  url: string;
  sizeBytes: number;
  description: string;
  isOptional?: boolean;
}

export interface DownloadableTTSModel {
  id: string;
  name: string;
  // One value per engine that actually has a daemon. f5tts and qwen3 were
  // listed but no engine was ever wired up for either.
  engine: 'kokoro' | 'vieneu' | 'mms';
  author: string;
  repoUrl: string;
  license: string;
  totalSizeBytes: number;
  files: ModelFileSpec[];
  description: string;
  recommendedHardware: string;
  hardwareType: 'CPU' | 'NVIDIA CUDA' | 'CPU / GPU';
  vramRequiredMB?: number;
  isInstalled: boolean;
  installedSizeBytes: number;
  isDownloading?: boolean;
  downloadProgress?: number; // 0 - 100
  downloadSpeedMBs?: number;
  downloadedBytes?: number;
  status: 'not_installed' | 'downloading' | 'installed' | 'error';
  errorMessage?: string;
}

export interface ModelDownloadProgressPayload {
  modelId: string;
  status: 'idle' | 'downloading' | 'completed' | 'error';
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  currentFileName: string;
  speedMBps: number;
  errorMessage?: string;
}
