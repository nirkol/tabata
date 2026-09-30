import { isNative } from './native';

/**
 * The spoken "Ten!" call. The Mac app uses macOS's built-in `say` command (always available);
 * the browser uses the Web Speech API with a loud, slightly fast and high voice.
 */
export function sayTen(volume: number): void {
  const v = Math.min(1, Math.max(0, volume));
  if (v === 0) return;
  if (isNative()) {
    void import('@tauri-apps/api/core').then((core) => core.invoke('say_ten', { volume: v })).catch(() => speakInBrowser(v));
    return;
  }
  speakInBrowser(v);
}

function speakInBrowser(volume: number): void {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;
  const u = new SpeechSynthesisUtterance('Ten!');
  u.lang = 'en-US';
  u.volume = volume;
  u.rate = 1.15;
  u.pitch = 1.2;
  synth.cancel(); // never queue behind an older utterance
  synth.speak(u);
}
