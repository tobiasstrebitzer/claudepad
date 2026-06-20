// Deep-link playback params (PRD-08 §7/§8). These live in the QUERY STRING only
// - never the `#…` key fragment - so they never read, write, or echo a key.
// Parsed defensively: unknown/invalid values fall back to defaults, never throw.

import { SPEEDS, type Speed, type AppearMode } from './pacing';
import type { PlaybackMode } from './buildTimeline';

export interface PlaybackParams {
  play: boolean;
  mode?: PlaybackMode;
  speed?: Speed;
  appear?: AppearMode;
  /** reading-speed override (chars/sec), the one exposed pacing knob (Q-5a). */
  readingSpeed?: number;
}

export function parsePlaybackParams(search: string): PlaybackParams {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  } catch {
    return { play: false };
  }

  const play = params.get('play') === '1' || params.get('play') === 'true';

  const modeRaw = params.get('mode');
  const mode: PlaybackMode | undefined =
    modeRaw === 'present' || modeRaw === 'realtime' ? modeRaw : undefined;

  const speedRaw = Number(params.get('speed'));
  const speed = SPEEDS.includes(speedRaw as Speed) ? (speedRaw as Speed) : undefined;

  const appearRaw = params.get('appear');
  const appear: AppearMode | undefined =
    appearRaw === 'type' || appearRaw === 'instant' ? appearRaw : undefined;

  const rsRaw = Number(params.get('rs'));
  const readingSpeed = Number.isFinite(rsRaw) && rsRaw >= 4 && rsRaw <= 200 ? rsRaw : undefined;

  return { play, mode, speed, appear, readingSpeed };
}
