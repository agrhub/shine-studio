import { core } from "@/utils/project";
import { duplicateClip, splitClip, trimClip } from "./action-handlers";

async function fetchPexelsVideo(query: string) {
  try {
    const res = await fetch(`/api/pexels?type=video&query=${encodeURIComponent(query || 'trending')}`);
    if (res.ok) {
      const data = await res.json();
      if (data.videos && data.videos.length > 0) {
        const video = data.videos[0];
        const files = video.video_files || [];
        const videoFile = files.find((f: any) => f.quality === 'hd') || files[0];
        if (videoFile?.link) {
          return {
            link: videoFile.link,
            duration: video.duration || 5,
            width: video.width || 1920,
            height: video.height || 1080,
            image: video.image || '',
            name: video.user?.name ? `Video by ${video.user.name}` : `Video ${query}`,
          };
        }
      }
    }
  } catch (e) {
    console.warn("Failed to fetch Pexels video:", e);
  }
  return null;
}

async function fetchPexelsImage(query: string) {
  try {
    const res = await fetch(`/api/pexels?type=image&query=${encodeURIComponent(query || 'nature')}`);
    if (res.ok) {
      const data = await res.json();
      if (data.photos && data.photos.length > 0) {
        const photo = data.photos[0];
        return {
          link: photo.src?.large || photo.src?.medium || photo.src?.original,
          width: photo.width || 1920,
          height: photo.height || 1080,
          name: photo.alt || `Image ${query}`,
        };
      }
    }
  } catch (e) {
    console.warn("Failed to fetch Pexels image:", e);
  }
  return null;
}

async function fetchMusicAudio(query: string) {
  try {
    const res = await fetch('/api/audio/music', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 20,
        page: 1,
        query: query ? { keys: [query] } : {},
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.musics && data.musics.length > 0) {
        const music = data.musics[0];
        return {
          link: music.src,
          name: music.name || `Music ${query}`,
          duration: music.duration || 30,
        };
      }
    }
  } catch (e) {
    console.warn("Failed to fetch music audio:", e);
  }
  return null;
}

import { useMediaPanelStore } from "@/composables/useMediaPanelStore";

export const handleAddClip = async (input: any) => {
  const {
    text,
    prompt,
    url,
    assetType,
    action,
  } = input;
  const from = input.from ?? 0;
  const to = input.to;

  const type =
    assetType ||
    (action === "add_text"
      ? "text"
      : action === "add_image"
        ? "image"
        : action === "add_video"
          ? "video"
          : action === "add_audio"
            ? "audio"
            : "video");

  const queryText = prompt || text || input.query || "trending";
  const mediaStore = useMediaPanelStore();

  try {
    if (type === "video") {
      mediaStore.setSearchQuery("videos", queryText);
      const pexelsVideo = await fetchPexelsVideo(queryText);
      const mediaUrl = url || pexelsVideo?.link;
      if (mediaUrl) {
        const durationUs = Math.round((pexelsVideo?.duration || 5) * 1e6);
        const currentTimeUs = Math.round((core.store.getState().currentTime || 0));
        const fromUs = from > 0 ? from * 1e6 : currentTimeUs;
        const toUs = to ? to * 1e6 : fromUs + durationUs;

        const added = await core.clip.add(
          {
            type: "Video",
            src: mediaUrl,
            name: pexelsVideo?.name || `Video ${queryText}`,
            width: pexelsVideo?.width || 1920,
            height: pexelsVideo?.height || 1080,
            timing: {
              display: { from: fromUs, to: toUs },
              trim: { from: 0, to: durationUs },
            },
            preview: pexelsVideo?.image || '',
            metadata: {
              previewUrl: pexelsVideo?.image || '',
            },
          },
          { objectFit: "contain" }
        );
        if (added?.id) {
          core.store.setState({ selectedIds: [added.id], selectedClipIds: [added.id] } as any);
        }
      }
    } else if (type === "image") {
      mediaStore.setSearchQuery("images", queryText);
      const pexelsImage = await fetchPexelsImage(queryText);
      const mediaUrl = url || pexelsImage?.link;
      if (mediaUrl) {
        const currentTimeUs = Math.round((core.store.getState().currentTime || 0));
        const fromUs = from > 0 ? from * 1e6 : currentTimeUs;
        const toUs = to ? to * 1e6 : fromUs + 5_000_000;

        const added = await core.clip.add(
          {
            type: "Image",
            src: mediaUrl,
            name: pexelsImage?.name || `Image ${queryText}`,
            width: pexelsImage?.width || 1920,
            height: pexelsImage?.height || 1080,
            timing: {
              display: { from: fromUs, to: toUs },
            },
          },
          { objectFit: "contain" }
        );
        if (added?.id) {
          core.store.setState({ selectedIds: [added.id], selectedClipIds: [added.id] } as any);
        }
      }
    } else if (type === "text" && (text || input.text || prompt)) {
      mediaStore.setActiveTab("text");
      const currentTimeUs = Math.round((core.store.getState().currentTime || 0));
      const fromUs = from > 0 ? from * 1e6 : currentTimeUs;
      const toUs = to ? to * 1e6 : fromUs + 5_000_000;

      const added = await core.clip.add({
        type: "Text",
        text: text || input.text || prompt || "Text",
        timing: {
          display: { from: fromUs, to: toUs },
        },
      });
      if (added?.id) {
        core.store.setState({ selectedIds: [added.id], selectedClipIds: [added.id] } as any);
      }
    } else if (type === "audio") {
      mediaStore.setSearchQuery("music", queryText);
      const musicAudio = await fetchMusicAudio(queryText);
      const mediaUrl = url || musicAudio?.link;
      if (mediaUrl) {
        const durationUs = Math.round((musicAudio?.duration || 30) * 1e6);
        const currentTimeUs = Math.round((core.store.getState().currentTime || 0));
        const fromUs = from > 0 ? from * 1e6 : currentTimeUs;
        const toUs = to ? to * 1e6 : fromUs + durationUs;

        const added = await core.clip.add({
          type: "Audio",
          src: mediaUrl,
          name: musicAudio?.name || `Audio ${queryText}`,
          timing: {
            display: { from: fromUs, to: toUs },
            trim: { from: 0, to: durationUs },
          },
        });
        if (added?.id) {
          core.store.setState({ selectedIds: [added.id], selectedClipIds: [added.id] } as any);
        }
      }
    }
  } catch (error) {
    console.error("Failed to add clip:", error);
  }
};

export const handleUpdateClip = async (input: any) => {
  const { left, top, width, height, targetId, clipId, fontSize, opacity } = input;
  const id = targetId || clipId;
  if (!id) return;

  try {
    const updates: any = {};
    if (left !== undefined) updates.left = left;
    if (top !== undefined) updates.top = top;
    if (width !== undefined) updates.width = width;
    if (height !== undefined) updates.height = height;
    if (opacity !== undefined) updates.opacity = opacity;
    if (fontSize !== undefined) updates.fontSize = fontSize;

    await core.clip.update(id, updates);
  } catch (error) {
    console.error("Failed to update clip:", error);
  }
};

export const handleRemoveClip = async (input: any) => {
  const id = input.targetId || input.clipId;
  if (id) {
    await core.clip.remove([id]);
  }
};

export const handleSplitClip = async (input: any) => {
  const id = input.targetId || input.clipId;
  const splitTime = input.time || 0;
  if (id && splitTime) {
    await splitClip(id, splitTime);
  }
};

export const handleTrimClip = async (input: any) => {
  const id = input.targetId || input.clipId;
  if (id) {
    await trimClip(id, { from: input.trimFrom || 0, to: 5 }, { from: 0, to: 5 });
  }
};

export const handleAddTransition = async (input: any) => {
  useMediaPanelStore().setActiveTab("transitions");

  const state = core.store.getState();
  const clipsMap = state.clips || {};
  const tracks = state.tracks || [];
  const selectedIds = state.selectedIds || (state as any).selectedClipIds || [];

  let fromClipId: string | undefined = undefined;
  let toClipId: string | undefined = undefined;

  for (const track of tracks) {
    const clipIds = track.clipIds || [];
    if (clipIds.length >= 2) {
      if (selectedIds.length > 0) {
        const idx = clipIds.indexOf(selectedIds[0]);
        if (idx >= 0 && idx < clipIds.length - 1) {
          fromClipId = clipIds[idx];
          toClipId = clipIds[idx + 1];
          break;
        } else if (idx > 0) {
          fromClipId = clipIds[idx - 1];
          toClipId = clipIds[idx];
          break;
        }
      }
      fromClipId = clipIds[0];
      toClipId = clipIds[1];
      break;
    }
  }

  if (!fromClipId || !toClipId) {
    const sortedClips = Object.values(clipsMap).sort((a: any, b: any) => (a.display?.from || 0) - (b.display?.from || 0));
    if (sortedClips.length >= 2) {
      fromClipId = (sortedClips[0] as any).id;
      toClipId = (sortedClips[1] as any).id;
    }
  }

  if (fromClipId && toClipId) {
    await core.clip.add({
      type: "Transition",
      name: input.transitionType || "Transition",
      transitionKey: input.transitionKey || "GridFlip",
      duration: 2_000_000,
      fromClipId,
      toClipId,
    });
  } else {
    console.warn("Transition requires at least 2 adjacent clips on the timeline");
  }
};

export const handleAddEffect = async (input: any) => {
  useMediaPanelStore().setActiveTab("effects");
  console.log("Add effect:", input);
};

export const handleDuplicateClip = async (input: any) => {
  const id = input.targetId || input.clipId;
  if (id) {
    await duplicateClip(id);
  }
};

export const handleSearchAndAddMedia = async (input: any) => {
  const { query, type = "video", url } = input;
  const queryText = query || input.prompt || "trending";
  const mediaStore = useMediaPanelStore();

  try {
    if (type === "image") {
      mediaStore.setSearchQuery("images", queryText);
      const pexelsImage = await fetchPexelsImage(queryText);
      const mediaUrl = url || pexelsImage?.link;
      if (mediaUrl) {
        const currentTimeUs = Math.round((core.store.getState().currentTime || 0));
        await core.clip.add(
          {
            type: "Image",
            src: mediaUrl,
            name: pexelsImage?.name || `Image ${queryText}`,
            width: pexelsImage?.width || 1920,
            height: pexelsImage?.height || 1080,
            timing: {
              display: { from: currentTimeUs, to: currentTimeUs + 5_000_000 },
            },
          },
          { objectFit: "contain" }
        );
      }
    } else if (type === "audio") {
      mediaStore.setSearchQuery("music", queryText);
      const musicAudio = await fetchMusicAudio(queryText);
      const mediaUrl = url || musicAudio?.link;
      if (mediaUrl) {
        const durationUs = Math.round((musicAudio?.duration || 30) * 1e6);
        const currentTimeUs = Math.round((core.store.getState().currentTime || 0));
        await core.clip.add({
          type: "Audio",
          src: mediaUrl,
          name: musicAudio?.name || `Audio ${queryText}`,
          timing: {
            display: { from: currentTimeUs, to: currentTimeUs + durationUs },
            trim: { from: 0, to: durationUs },
          },
        });
      }
    } else {
      mediaStore.setSearchQuery("videos", queryText);
      const pexelsVideo = await fetchPexelsVideo(queryText);
      const mediaUrl = url || pexelsVideo?.link;
      if (mediaUrl) {
        const durationUs = Math.round((pexelsVideo?.duration || 5) * 1e6);
        const currentTimeUs = Math.round((core.store.getState().currentTime || 0));
        await core.clip.add(
          {
            type: "Video",
            src: mediaUrl,
            name: pexelsVideo?.name || `Video ${queryText}`,
            width: pexelsVideo?.width || 1920,
            height: pexelsVideo?.height || 1080,
            timing: {
              display: { from: currentTimeUs, to: currentTimeUs + durationUs },
              trim: { from: 0, to: durationUs },
            },
            preview: pexelsVideo?.image || '',
            metadata: {
              previewUrl: pexelsVideo?.image || '',
            },
          },
          { objectFit: "contain" }
        );
      }
    }
  } catch (error) {
    console.error("Failed to search and add media:", error);
  }
};

export const handleGenerateVoiceover = async (input: any) => {
  const { text, voiceId } = input;
  useMediaPanelStore().setSearchQuery("voiceovers", text || "Voiceover");
  try {
    // Neural TTS endpoint (Gemini voices); stores the audio and returns its URL.
    const response = await fetch("/api/voices/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice_id: voiceId }),
    });
    const payload = await response.json();
    const data = payload?.data || {};

    if (response.ok && data.url) {
      const currentTimeUs = Math.round((core.store.getState().currentTime || 0));
      await core.clip.add({
        type: "Audio",
        src: data.url,
        name: text || "Voiceover",
        timing: {
          display: { from: currentTimeUs, to: currentTimeUs + 10_000_000 },
        },
      });
    }
  } catch (error) {
    console.error("Failed to generate voiceover:", error);
  }
};

export const handleSeekToTime = async (input: any) => {
  const { time } = input;
  if (time !== undefined) {
    core.seek(Math.round(time * 1_000_000));
  }
};

export const handleGenerateCaptions = async (input?: any) => {
  useMediaPanelStore().setActiveTab("captions");
  console.log("Generate captions:", input);
};

export const handleOpenUploads = async (input: any) => {
  useMediaPanelStore().setActiveTab("uploads");
};
