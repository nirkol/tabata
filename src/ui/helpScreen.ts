import type { App, Screen } from './app';
import { h } from './dom';

type Block = string | [string, string]; // plain paragraph, or [bold lead-in, text]

const SECTIONS: { title: string; items: Block[] }[] = [
  {
    title: '1. Create a routine',
    items: [
      'Go to Routines and click “+ New Routine” (or the pencil icon to edit one). Give it a name (Hebrew or English) and set:',
      ['Work time', ' – how long each work period lasts (up to 10:00).'],
      ['Rest time', ' – the rest after each work period (0 = no rest, up to 3:00).'],
      ['Rounds', ' – how many Work + Rest pairs make one cycle (1–20).'],
      ['Cycles', ' – how many times the whole block of rounds repeats (1–10).'],
      ['Rest between cycles', ' – a longer recovery between two cycles (used when there are 2+ cycles).'],
      'Use − / + (hold to go faster) or type a value such as 1:30 or 90. The total duration is shown as you edit. Click Save.',
    ],
  },
  {
    title: '2. Run a workout',
    items: [
      'Click ▶ Start on a routine (or press Enter to start the highlighted one). A 5-second Get Ready comes first.',
      ['Colors', ' – the counter is green during work (your chosen work color) and red during Get Ready and rest.'],
      ['Progress bar', ' – the bar at the top shows the whole workout; the white marker is where you are.'],
      ['Next', ' – shown next to the counter: what comes after the current phase.'],
      ['Below the counter', ' – current cycle, work/rest times, rounds left, and time left in the cycle and in total.'],
      ['Pause', ' – click PAUSE or press Space. Resume continues exactly where you stopped.'],
      ['Stop', ' – click STOP or press Esc; the workout pauses while you confirm.'],
      ['Fullscreen', ' – press F or click the button at the top right.'],
      ['Volume', ' – the Work / Rest sliders and mute button are at the lower right.'],
      'At the end, choose “↻ Start over” or “← Back to routines”.',
    ],
  },
  {
    title: '3. Sounds and voice',
    items: [
      ['Countdown beeps', ' – the last 5 seconds of every phase: 4 short beeps and a long one when the next phase starts. Work and rest have different sounds.'],
      ['“Start!”', ' – said when a work period begins (instead of the long beep at the end of rest).'],
      ['“Ten!”', ' – said 10 seconds before the end of each work period.'],
      ['Encouragement', ' – at the end of each cycle a short fanfare plays and a random encouraging statement is said and shown on screen.'],
      'Each of these can be switched off in Settings.',
    ],
  },
  {
    title: '4. Manage routines',
    items: [
      ['Edit / delete', ' – the pencil and trash icons on each routine.'],
      ['Reorder', ' – drag the ☰ handle up or down, or click it and press ↑ / ↓.'],
      ['Last used', ' – the routine you used last is highlighted and marked “Last used”.'],
    ],
  },
  {
    title: '5. Timers',
    items: [
      'Simple countdowns (e.g. 1, 2 or 10 minutes) are on the Timers tab, sorted from shortest to longest.',
      ['New / edit', ' – click “+ New Timer” or the pencil icon; set the minutes and seconds.'],
      ['Start', ' – click ▶ Start: a large countdown with the progress ring. PAUSE (or Space) and STOP (or Esc) work as in a workout; “Start!” and “Ten!” are said as in a workout, and beeps mark the last seconds.'],
    ],
  },
  {
    title: '6. Stopwatch',
    items: [
      'The Stopwatch tab counts up from 00:00:00 (hours:minutes:seconds).',
      ['▶ Start / Pause', ' – starts, pauses and resumes (or press Space).'],
      ['Reset', ' – back to 00:00:00 (or press R).'],
      ['Stop', ' – stops and keeps the time on screen (or press Esc). While the stopwatch runs or is paused, the other pages are locked until you click Stop.'],
    ],
  },
  {
    title: '7. Settings',
    items: [
      ['Sound', ' – volume and sound style for work and rest beeps (with Test buttons), mute, and the “Start!” / “Ten!” voice calls.'],
      ['Counter display', ' – work color, counter size, and whether to show the remaining times.'],
      ['Encouragement', ' – turn it on or off and edit the 10 statements.'],
      'Everything is saved automatically. “Reset to defaults” restores the original settings (routines are not affected).',
    ],
  },
  {
    title: 'Tips',
    items: [
      'The timer and beeps stay accurate even if the window is in the background, and the screen stays awake during a workout.',
      'In the Mac app your routines and settings are saved on the Mac and kept when the app is updated.',
    ],
  },
];

/** Instructions page: how to use the timer. */
export function helpScreen(_app: App): Screen {
  const el = h(
    'section',
    { class: 'help-screen' },
    h('div', { class: 'screen-header' }, h('h1', {}, 'Instructions')),
    ...SECTIONS.map((section) =>
      h(
        'div',
        { class: 'panel help-section' },
        h('h2', {}, section.title),
        h(
          'ul',
          { class: 'help-list' },
          ...section.items.map((item) => (typeof item === 'string' ? h('li', {}, item) : h('li', {}, h('strong', {}, item[0]), item[1]))),
        ),
      ),
    ),
  );
  return { el };
}
