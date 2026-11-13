import { core } from "@/utils/project";

export const duplicateClip = async (
  clipId: string,
) => {
  try {
    await (core.clip as any).duplicate?.(clipId);
  } catch (e) {
    console.error("Failed to duplicate clip:", e);
  }
};

export const deleteClip = async (
  clipId: string,
) => {
  try {
    await core.clip.remove([clipId]);
  } catch (e) {
    console.error("Failed to delete clip:", e);
  }
};

export const splitClip = async (
  clipId: string,
  splitTime: number,
) => {
  try {
    await core.clip.split(Math.round(splitTime * 1e6), clipId);
  } catch (e) {
    console.error("Failed to split clip:", e);
  }
};

export const trimClip = async (
  clipId: string,
  timeline: { from: number; to: number },
  display: { from: number; to: number },
) => {
  try {
    await core.clip.update(clipId, {
      timing: {
        display: {
          from: display.from * 1e6,
          to: display.to * 1e6,
        },
        trim: {
          from: timeline.from * 1e6,
          to: timeline.to * 1e6,
        },
      } as any,
    });
  } catch (e) {
    console.error("Failed to trim clip:", e);
  }
};

export const applyEffectClip = async (
  name: string,
  timeline: { from: number; to: number },
) => {
  try {
    await core.clip.add({
      type: "Effect" as any,
      name,
      timing: {
        display: {
          from: timeline.from * 1e6,
          to: timeline.to * 1e6,
        },
      } as any,
    });
  } catch (e) {
    console.error("Failed to apply effect:", e);
  }
};
