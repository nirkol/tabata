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
    void import('@tauri-apps/api/core')
      .then((core) => core.invoke('say_cue', { cue, volume: v }))
      .catch(() => speakInBrowser(WORDS[cue], v));
    return;
  }
  speakInBrowser(WORDS[cue], v);
}

/** Makes a statement sound right when spoken (e.g. "yFit" → "Why Fit"). */
export function forSpeech(text: string): string {
  return text.replace(/\byFit\b/gi, 'Why Fit').trim();
}

/** Speaks a free-text statement (the end-of-cycle encouragement). */
export function sayText(text: string, volume: number): void {
  const v = Math.min(1, Math.max(0, volume));
  const spoken = forSpeech(text);
  if (v === 0 || !spoken) return;
  if (isNative()) {
    void import('@tauri-apps/api/core')
      .then((core) => core.invoke('say_text', { text: spoken, volume: v }))
      .catch(() => speakInBrowser(spoken, v));
    return;
  }
  speakInBrowser(spoken, v);
}

function speakInBrowser(text: string, volume: number): void {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.volume = volume;
  u.rate = 1.15;
  u.pitch = 1.2;
  synth.cancel(); // never queue behind an older utterance
  synth.speak(u);
}
