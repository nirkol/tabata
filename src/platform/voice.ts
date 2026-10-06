import type { Beeper } from '../audio/beeper';
import { isNative } from './native';

/** The spoken cues: "Start!" when a work period begins, "Ten!" 10 s before it ends. */
export type VoiceCue = 'start' | 'ten';

const WORDS: Record<VoiceCue, string> = { start: 'Start!', ten: 'Ten!' };

/**
 * Speaks a cue. The Mac app uses macOS's built-in `say` command (always available);
 * the browser uses the Web Speech API with a loud, slightly fast and high voice.
 */
export function sayCue(cue: VoiceCue, volume: number): void {
  const v = Math.min(1, Math.max(0, volume));
  if (v === 0) return;
  if (isNative()) {
    // Pre-rendered clip through Web Audio: instant and clear (see prepareNativeCues).
    const say = () =>
      void import('@tauri-apps/api/core')
        .then((core) => core.invoke('say_cue', { cue, volume: v }))
        .catch(() => speakInBrowser(WORDS[cue], v));
    if (!cueBeeper?.playClip(`cue-${cue}`, say)) say();
    return;
  }
  speakInBrowser(WORDS[cue], v);
}

let cueBeeper: Beeper | null = null;

/**
 * Mac app: renders "Start!" and "Ten!" once with macOS's voice and hands the audio to the
 * beeper, so the cues play instantly (like the beeps) instead of starting `say` every time,
 * which made them late and clipped. If rendering fails, `say` is used as before.
 */
export async function prepareNativeCues(beeper: Beeper): Promise<void> {
  if (!isNative()) return;
  const core = await import('@tauri-apps/api/core');
  for (const cue of ['start', 'ten'] as const) {
    try {
      const data = await core.invoke<ArrayBuffer>('render_cue', { cue });
      if (data && data.byteLength > 44) beeper.addClip(`cue-${cue}`, data);
    } catch {
      // Keep the `say` fallback for this cue.
    }
  }
  cueBeeper = beeper;
}

/** Makes a statement sound right when spoken (e.g. "yFit" → "Why Fit"). */
export function forSpeech(text: string): string {
  return text.replace(/\byFit\b/gi, 'Why Fit').trim();
}

/**
 * Speaks a free-text statement (the end-of-cycle encouragement) with an upbeat, excited
 * delivery: higher pitch, a bit faster, full energy, and the most natural voice available.
 */
export function sayText(text: string, volume: number): void {
  const v = Math.min(1, Math.max(0, volume));
  const spoken = forSpeech(text);
  if (v === 0 || !spoken) return;
  if (isNative()) {
    void import('@tauri-apps/api/core')
      .then((core) => core.invoke('say_text', { text: spoken, volume: v }))
      .catch(() => speakInBrowser(spoken, v, EXCITED));
    return;
  }
  speakInBrowser(spoken, v, EXCITED);
}

interface Delivery {
  rate: number;
  pitch: number;
  /** Preferred voices, best first (matched by name). */
  voices?: RegExp[];
}
/** Short commands ("Start!", "Ten!"): loud and crisp. */
const CRISP: Delivery = { rate: 1.15, pitch: 1.2 };
/** Encouragement: upbeat and lively, with a natural-sounding voice when there is one. */
const EXCITED: Delivery = {
  rate: 1.08,
  pitch: 1.4,
  voices: [/samantha/i, /ava/i, /allison/i, /zoe/i, /susan/i, /google us english/i, /natural/i, /premium|enhanced/i],
};

function pickVoice(prefs: RegExp[] | undefined): SpeechSynthesisVoice | null {
  const synth = window.speechSynthesis;
  const english = (synth.getVoices?.() ?? []).filter((v) => /^en(-|_|$)/i.test(v.lang));
  for (const re of prefs ?? []) {
    const hit = english.find((v) => re.test(v.name));
    if (hit) return hit;
  }
  return null;
}

function speakInBrowser(text: string, volume: number, delivery: Delivery = CRISP): void {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.volume = volume;
  u.rate = delivery.rate;
  u.pitch = delivery.pitch;
  const voice = pickVoice(delivery.voices);
  if (voice) u.voice = voice;
  synth.cancel(); // never queue behind an older utterance
  synth.speak(u);
}
