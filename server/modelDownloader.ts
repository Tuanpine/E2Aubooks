import fs from 'fs';
import path from 'path';
import https from 'https';
import http from 'http';
import { URL } from 'url';
import { DownloadableTTSModel, ModelDownloadProgressPayload } from '../src/types/models.js';
import { VERIFIED_TTS_MODELS } from '../src/data/modelCatalog.js';

const MODELS_BASE_DIR = path.resolve(process.cwd(), 'models');

// Ensure base models directory exists
if (!fs.existsSync(MODELS_BASE_DIR)) {
  fs.mkdirSync(MODELS_BASE_DIR, { recursive: true });
}

interface ActiveDownloadState {
  modelId: string;
  isDownloading: boolean;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  currentFileName: string;
  speedMBps: number;
  abortController?: AbortController;
  errorMessage?: string;
}

const activeDownloads = new Map<string, ActiveDownloadState>();

/**
 * Downloads a file with redirect support and progress tracking
 */
function downloadFileWithRedirect(
  fileUrl: string,
  destPath: string,
  onProgress: (downloaded: number, total: number) => void,
  signal?: AbortSignal,
  maxRedirects = 10
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) {
      return reject(new Error('Quá nhiều lần chuyển hướng HTTP (Too many redirects)'));
    }

    if (signal?.aborted) {
      return reject(new Error('Download cancelled by user'));
    }

    const parsedUrl = new URL(fileUrl);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const request = client.get(
      fileUrl,
      {
        headers: {
          'User-Agent': 'LA-Studio-Model-Downloader/1.0',
          Accept: '*/*',
        },
      },
      (res) => {
        // Handle Redirects (301, 302, 307, 308)
        if (
          res.statusCode &&
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location
        ) {
          const redirectUrl = new URL(res.headers.location, fileUrl).href;
          res.resume(); // consume response data to free up memory
          return resolve(
            downloadFileWithRedirect(redirectUrl, destPath, onProgress, signal, maxRedirects - 1)
          );
        }

        if (res.statusCode !== 200) {
          res.resume();
          return reject(
            new Error(`Lỗi tải tệp: HTTP ${res.statusCode} ${res.statusMessage || ''} từ ${fileUrl}`)
          );
        }

        const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedBytes = 0;

        // Ensure parent folder exists
        const dir = path.dirname(destPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        const fileStream = fs.createWriteStream(destPath);

        res.on('data', (chunk) => {
          downloadedBytes += chunk.length;
          onProgress(downloadedBytes, totalBytes);
        });

        res.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close(() => resolve());
        });

        fileStream.on('error', (err) => {
          fs.unlink(destPath, () => {}); // clean up partial file
          reject(err);
        });

        res.on('error', (err) => {
          fs.unlink(destPath, () => {});
          reject(err);
        });
      }
    );

    request.on('error', (err) => {
      reject(err);
    });

    if (signal) {
      signal.addEventListener('abort', () => {
        request.destroy();
        fs.unlink(destPath, () => {});
        reject(new Error('Download cancelled by user'));
      });
    }
  });
}

/**
 * Validates a remote URL via HTTP HEAD request with redirect support
 */
export function verifyRemoteUrl(urlStr: string, maxRedirects = 6): Promise<{ ok: boolean; status: number; contentLength?: number; location?: string }> {
  return new Promise((resolve) => {
    if (maxRedirects <= 0) {
      return resolve({ ok: false, status: 310 });
    }

    try {
      const parsedUrl = new URL(urlStr);
      const client = parsedUrl.protocol === 'https:' ? https : http;

      const req = client.request(
        urlStr,
        {
          method: 'HEAD',
          headers: {
            'User-Agent': 'LA-Studio-Model-Downloader/1.0',
          },
        },
        (res) => {
          if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
            const redirectUrl = new URL(res.headers.location, urlStr).href;
            return resolve(verifyRemoteUrl(redirectUrl, maxRedirects - 1));
          }

          const contentLength = res.headers['content-length'] ? parseInt(res.headers['content-length'], 10) : undefined;
          resolve({
            ok: res.statusCode === 200,
            status: res.statusCode || 0,
            contentLength,
          });
        }
      );

      req.on('error', () => {
        resolve({ ok: false, status: 500 });
      });

      req.setTimeout(8000, () => {
        req.destroy();
        resolve({ ok: false, status: 408 });
      });

      req.end();
    } catch {
      resolve({ ok: false, status: 400 });
    }
  });
}

/**
 * Returns model status with real disk checks
 */
export function getModelCatalogWithDiskStatus(): DownloadableTTSModel[] {
  return VERIFIED_TTS_MODELS.map((model) => {
    const modelDir = path.join(MODELS_BASE_DIR, model.id);
    let installedBytes = 0;
    let allFilesExist = true;

    for (const file of model.files) {
      const localFilePath = path.join(modelDir, file.fileName);
      if (fs.existsSync(localFilePath)) {
        try {
          const stat = fs.statSync(localFilePath);
          installedBytes += stat.size;
        } catch {
          allFilesExist = false;
        }
      } else {
        allFilesExist = false;
      }
    }

    const active = activeDownloads.get(model.id);

    return {
      ...model,
      isInstalled: allFilesExist,
      installedSizeBytes: installedBytes,
      status: active?.isDownloading ? 'downloading' : allFilesExist ? 'installed' : 'not_installed',
      downloadProgress: active?.progress || (allFilesExist ? 100 : 0),
      downloadSpeedMBs: active?.speedMBps || 0,
      downloadedBytes: active?.downloadedBytes || installedBytes,
      errorMessage: active?.errorMessage,
    };
  });
}

/**
 * Starts download process for a model
 */
export async function startModelDownload(modelId: string): Promise<void> {
  const model = VERIFIED_TTS_MODELS.find((m) => m.id === modelId);
  if (!model) {
    throw new Error(`Mô hình ${modelId} không tồn tại trong danh mục.`);
  }

  if (activeDownloads.get(modelId)?.isDownloading) {
    return; // Already in progress
  }

  const abortController = new AbortController();
  const state: ActiveDownloadState = {
    modelId,
    isDownloading: true,
    progress: 0,
    downloadedBytes: 0,
    totalBytes: model.totalSizeBytes,
    currentFileName: '',
    speedMBps: 0,
    abortController,
  };

  activeDownloads.set(modelId, state);

  const modelDir = path.join(MODELS_BASE_DIR, modelId);
  if (!fs.existsSync(modelDir)) {
    fs.mkdirSync(modelDir, { recursive: true });
  }

  // Start background sequential download of all files
  (async () => {
    let startTime = Date.now();
    let prevBytes = 0;

    try {
      let cumulativeDownloaded = 0;

      for (let i = 0; i < model.files.length; i++) {
        const file = model.files[i];
        state.currentFileName = file.fileName;
        const targetPath = path.join(modelDir, file.fileName);

        let fileDownloadedBytes = 0;

        await downloadFileWithRedirect(
          file.url,
          targetPath,
          (chunkDownloaded, chunkTotal) => {
            fileDownloadedBytes = chunkDownloaded;
            const currentTotal = cumulativeDownloaded + fileDownloadedBytes;
            state.downloadedBytes = currentTotal;
            state.progress = Math.min(99, Math.round((currentTotal / model.totalSizeBytes) * 100));

            // Speed calculation every second
            const now = Date.now();
            const elapsed = (now - startTime) / 1000;
            if (elapsed >= 1) {
              const bytesDiff = currentTotal - prevBytes;
              state.speedMBps = parseFloat((bytesDiff / (1024 * 1024 * elapsed)).toFixed(2));
              startTime = now;
              prevBytes = currentTotal;
            }
          },
          abortController.signal
        );

        cumulativeDownloaded += file.sizeBytes;
      }

      state.progress = 100;
      state.isDownloading = false;
      state.speedMBps = 0;
    } catch (err: any) {
      console.error(`Download error for model ${modelId}:`, err);
      state.isDownloading = false;
      state.errorMessage = err.message || 'Lỗi khi tải tệp mô hình';
    }
  })();
}

/**
 * Cancel download
 */
export function cancelModelDownload(modelId: string): boolean {
  const active = activeDownloads.get(modelId);
  if (active && active.isDownloading) {
    active.abortController?.abort();
    active.isDownloading = false;
    activeDownloads.delete(modelId);
    return true;
  }
  return false;
}

/**
 * Delete model files from disk
 */
export function deleteModelFiles(modelId: string): boolean {
  cancelModelDownload(modelId);
  const modelDir = path.join(MODELS_BASE_DIR, modelId);
  if (fs.existsSync(modelDir)) {
    fs.rmSync(modelDir, { recursive: true, force: true });
    activeDownloads.delete(modelId);
    return true;
  }
  return false;
}

/**
 * Get single model download progress
 */
export function getModelProgress(modelId: string): ModelDownloadProgressPayload {
  const active = activeDownloads.get(modelId);
  if (active) {
    return {
      modelId,
      status: active.isDownloading ? 'downloading' : active.progress === 100 ? 'completed' : 'idle',
      progress: active.progress,
      downloadedBytes: active.downloadedBytes,
      totalBytes: active.totalBytes,
      currentFileName: active.currentFileName,
      speedMBps: active.speedMBps,
      errorMessage: active.errorMessage,
    };
  }

  // Check if fully installed on disk
  const catalog = getModelCatalogWithDiskStatus();
  const found = catalog.find((m) => m.id === modelId);

  return {
    modelId,
    status: found?.isInstalled ? 'completed' : 'idle',
    progress: found?.isInstalled ? 100 : 0,
    downloadedBytes: found?.installedSizeBytes || 0,
    totalBytes: found?.totalSizeBytes || 0,
    currentFileName: '',
    speedMBps: 0,
  };
}
