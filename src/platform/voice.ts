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
