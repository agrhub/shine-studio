import { useStudioStore } from './useStudioStore';
import { useDownloadStore } from '@/stores/useDownloadStore';
import { generateThumbnail } from '@/utils/thumbnail-generator';
import { Compositor, Log } from '@openvideo/engine-pixi';
import { core } from '@/utils/project';
import { toast } from 'vue-sonner';

export interface ExportSettings {
  includeVideo: boolean;
  videoCodec: string;
  quality: string;
  format: string;
  fps: string;
  resolution: string;
  includeAudio: boolean;
  audioCodec: string;
  audioSampleRate: string;
  autoCommit?: boolean;
}

export function formatBytes(bytes?: number) {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return '—';
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

function exportFileName(format: string) {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  return `${stamp}.${format}`;
}

function suppressRenderLoop(): () => void {
  const originalRAF = window.requestAnimationFrame.bind(window);
  const originalCAF = window.cancelAnimationFrame.bind(window);
  const queued = new Map<number, FrameRequestCallback>();
  let idCounter = 0x70000000;

  const win = window as any;

  win.requestAnimationFrame = (cb: FrameRequestCallback) => {
    const id = ++idCounter;
    queued.set(id, cb);
    return id;
  };
  win.cancelAnimationFrame = (id: number) => {
    if (id >= 0x70000000) {
      queued.delete(id);
    }
  };

  return () => {
    win.requestAnimationFrame = originalRAF;
    win.cancelAnimationFrame = originalCAF;
    queued.forEach((cb) => originalRAF(cb));
    queued.clear();
  };
}

export function handleDownload(url: string, format: string) {
  const aEl = document.createElement('a');
  document.body.appendChild(aEl);
  aEl.setAttribute('href', url);
  aEl.setAttribute('download', `openvideo-export-${Date.now()}.${format}`);
  aEl.setAttribute('target', '_self');
  aEl.click();
  setTimeout(() => {
    if (document.body.contains(aEl)) document.body.removeChild(aEl);
  }, 100);
}

export function useExport() {
  const studioStore = useStudioStore();
  const downloadStore = useDownloadStore();

  const startExport = async (
    settings: ExportSettings,
    targetPreset?: any,
    onProgress?: (p: number) => void,
    customProjectData?: any
  ) => {
    const studio = studioStore.state.value.studio;
    if (!studio) return null;

    let exportVideo: any = null;
    let thumbnail: any = null;
    const activeFormat = targetPreset ? targetPreset.format : settings.format;
    const downloadId = downloadStore.addDownload({
      type: 'export',
      name: exportFileName(activeFormat),
      format: activeFormat,
      created_at: Date.now(),
    });

    toast.info('Export render in progress...');
    downloadStore.updateDownload(downloadId, { status: 'processing' });

    const wasPlaying = (studio as any).getIsPlaying?.() ?? false;
    const restoreRAF = suppressRenderLoop();
    let compositor: Compositor | null = null;

    try {
      (studio as any).pause?.();
      (studio as any).suspendRendering?.();

      const json = customProjectData || core.project.export();
      if (!json || !json.clips || Object.keys(json.clips).length === 0) {
        throw new Error('No clips to export');
      }

      const coreSettings = core.store.getState().settings;
      const studioOpts = {
        width: coreSettings.width ?? 1920,
        height: coreSettings.height ?? 1080,
        fps: coreSettings.fps ?? 30,
      };
      const projectSettings = json.settings || {};
      const resolvedPreset = targetPreset;

      const activeQuality = targetPreset ? String(targetPreset.bitrate) : settings.quality;
      const activeFps = targetPreset ? String(targetPreset.fps) : settings.fps;
      const activeCodec = targetPreset ? targetPreset.codec : settings.videoCodec;

      const projectWidth = projectSettings.width || studioOpts.width || 1920;
      const projectHeight = projectSettings.height || studioOpts.height || 1080;
      const isProjectPortrait = projectHeight > projectWidth;

      let exportWidth: number;
      let exportHeight: number;

      if (resolvedPreset?.value?.includes('x')) {
        const [presetW, presetH] = resolvedPreset.value.split('x').map(Number);
        const isPresetPortrait = presetH > presetW;
        if (isProjectPortrait !== isPresetPortrait) {
          exportWidth = presetH;
          exportHeight = presetW;
        } else {
          exportWidth = presetW;
          exportHeight = presetH;
        }
      } else {
        exportWidth = projectWidth;
        exportHeight = projectHeight;
      }

      const compositorOptions: any = {
        width: settings.includeVideo ? exportWidth : 0,
        height: settings.includeVideo ? exportHeight : 0,
        fps: Number(activeFps),
        backgroundColor: projectSettings.backgroundColor || '#000000',
        format: activeFormat,
        videoCodec: settings.includeVideo ? activeCodec : undefined,
        bitrate: Number(activeQuality),
        audio: settings.includeAudio ? true : false,
        audioCodec: settings.includeAudio ? settings.audioCodec : undefined,
        audioSampleRate: settings.includeAudio ? Number(settings.audioSampleRate) : undefined,
        prioritizeSpeed: true,
      };

      compositor = new Compositor(compositorOptions);
      if (settings.includeVideo) await compositor.initPixiApp();

      compositor.on('export:progress', (v: number) => {
        downloadStore.updateDownload(downloadId, { progress: v });
        onProgress?.(v);
      });

      await compositor.loadFromJSON(json as any);
      const stream = compositor.output();
      let blob: Blob;
      try {
        const reader = stream.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        blob = new Blob(chunks as any, { type: `video/${activeFormat}` });
      } catch (streamErr) {
        Log.warn('Stream reader fallback to Response.blob:', streamErr);
        blob = await new Response(stream).blob();
      }
      const blobUrl = URL.createObjectURL(blob);

      downloadStore.updateDownload(downloadId, {
        status: 'completed',
        progress: 1,
        url: blobUrl,
        completed_at: Date.now(),
        name: exportFileName(activeFormat),
        size: blob.size,
      });

      let finalDownloadUrl = blobUrl;
      if(settings.autoCommit){
        try {
          const fileName = exportFileName(activeFormat);
          const formData = new FormData();
          const videoFile = new File([blob], fileName, { type: blob.type || `video/${activeFormat}` });
          formData.append('files', videoFile);

          const uploadRes = await fetch('/api/assets/upload', {
            method: 'POST',
            body: formData,
          });

          if (uploadRes.ok) {
            const data = await uploadRes.json();
            if (data.success && data.uploads?.[0]?.url) {
              finalDownloadUrl = data.uploads[0].url; // Relative URL e.g. /api/media/...
              // Save rendered video URL & preview URL to current project in SQLite database
              try {
                const projectId = (useStudioStore().state.value as any)?.projectId || (window as any).currentProjectId;
                const currentUrlId = new URLSearchParams(window.location.search).get('id');
                const targetId = projectId || currentUrlId;

                if (targetId) {
                  await fetch(`/api/projects/${targetId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      video: finalDownloadUrl,
                      preview: finalDownloadUrl,
                    }),
                  });
                }
              } catch (dbErr) {
                console.warn('Failed to update project video URL in database:', dbErr);
              }
            }
          }
        } catch (uploadErr) {
          console.warn('Backend video upload failed, using local download URL:', uploadErr);
        }
      }

      handleDownload(finalDownloadUrl, activeFormat);
      downloadStore.markDownloaded(downloadId);
      toast.success('Rendering complete! Your video has been saved.');
      exportVideo = finalDownloadUrl;
      try {
        const exportFile = new File([blob], exportFileName(activeFormat), { type: blob.type });
        const thumbBlob = await generateThumbnail(exportFile);
        if (thumbBlob) {
          thumbnail = URL.createObjectURL(thumbBlob);
        }
      } catch (thumbErr) {
        console.warn('Thumbnail generation failed, continuing:', thumbErr);
      }
    } catch (error: any) {
      Log.error('Export error:', error);
      const message = error.message || 'Unknown error';
      downloadStore.updateDownload(downloadId, { status: 'failed', error: message });
      toast.error(`Export failed: ${message}`);
      throw error;
    } finally {
      restoreRAF();
      (studio as any).resumeRendering?.();
      if (wasPlaying) (studio as any).play?.().catch?.(() => undefined);
      if (compositor) {
        try {
          compositor.destroy();
        } catch (e) {
          // ignore destroy errors
        }
      }
    }
    if (!exportVideo) {
      return null;
    }

    return {
      video: exportVideo,
      thumbnail: thumbnail,
    };
  };

  return { startExport };
}
