import { Segment } from "@/types";

export const SPEAKER_COLORS = [
  {
    dot:   "bg-indigo-400 dark:bg-indigo-500",
    line:  "bg-indigo-200 dark:bg-indigo-800",
    label: "text-indigo-500 dark:text-indigo-400",
    badge: "bg-indigo-100 dark:bg-indigo-900/55 text-indigo-600 dark:text-indigo-400",
  },
  {
    dot:   "bg-emerald-400 dark:bg-emerald-500",
    line:  "bg-emerald-200 dark:bg-emerald-800",
    label: "text-emerald-600 dark:text-emerald-400",
    badge: "bg-emerald-100 dark:bg-emerald-900/55 text-emerald-600 dark:text-emerald-400",
  },
  {
    dot:   "bg-rose-400 dark:bg-rose-500",
    line:  "bg-rose-200 dark:bg-rose-800",
    label: "text-rose-500 dark:text-rose-400",
    badge: "bg-rose-100 dark:bg-rose-900/55 text-rose-500 dark:text-rose-400",
  },
] as const;

export function buildSpeakerColorMap(segments: Segment[]): Map<string, number> {
  const map = new Map<string, number>();
  segments.forEach(s => {
    if (s.speakerLabel && !map.has(s.speakerLabel)) {
      map.set(s.speakerLabel, map.size % SPEAKER_COLORS.length);
    }
  });
  return map;
}

export function buildEffectiveSpeakers(segments: Segment[]): (string | null)[] {
  return segments.map((s, i) => {
    if (s.speakerLabel) return s.speakerLabel;
    for (let j = i - 1; j >= 0; j--) {
      if (segments[j].speakerLabel) return segments[j].speakerLabel;
    }
    return null;
  });
}
