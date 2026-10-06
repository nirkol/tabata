import { Beeper } from '../audio/beeper';
import type { Routine } from '../routines/model';
import { sortTimers, type PresetTimer } from '../timers/model';
import type { AppStorage, Settings } from '../storage/storage';
import { h } from './dom';
import { prepareNativeCues } from '../platform/voice';
import { isDialogOpen } from './dialog';
import { editorScreen } from './editorScreen';
import { listScreen } from './listScreen';
import { runScreen } from './runScreen';
import { settingsScreen } from './settingsScreen';
import { helpScreen } from './helpScreen';
import { aboutScreen } from './aboutScreen';
import { timersScreen } from './timersScreen';
import { timerEditorScreen } from './timerEditorScreen';
import { timerRunScreen } from './timerRunScreen';

const ICON_HELP =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 1.9-2.7 2.4-2.7 4"/><circle cx="12" cy="17.4" r="0.6" fill="currentColor"/></svg>';
const ICON_ABOUT =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v6"/><circle cx="12" cy="7.6" r="0.6" fill="currentColor"/></svg>';

/** An icon-only navigation tab with a tooltip and an accessible name. */
function iconTab(route: string, label: string, svg: string, onclick: () => void): HTMLButtonElement {
  const b = h('button', { class: 'tab tab-icon', 'data-route': route, 'data-testid': `nav-${route}`, 'aria-label': label, 'data-tip': label, onclick });
  b.innerHTML = svg;
  return b;
}

export interface Screen {
  el: HTMLElement;
  /** Called when the screen is left. */
  destroy?(): void;
  /** Keyboard shortcuts for this screen (not called while a dialog is open). */
  onKey?(e: KeyboardEvent): void;
  /** Hides the top navigation (the Run screen is full-window). */
  fullWindow?: boolean;
  /** Disables the top navigation: the screen can only be left with its own buttons (e.g. Save / Cancel). */
  lockNav?: string;
}

type Route =
  | { name: 'list' }
  | { name: 'editor'; routineId: string | null }
  | { name: 'settings' }
  | { name: 'help' }
  | { name: 'about' }
  | { name: 'run'; routineId: string }
  | { name: 'timers' }
  | { name: 'timerEditor'; timerId: string | null }
  | { name: 'timerRun'; timerId: string };

export class App {
  routines: Routine[];
  /** Preset timers, always sorted from short to long. */
  timers: PresetTimer[];
  settings: Settings;
  lastUsedId: string | null;
  readonly beeper = new Beeper();
  private screen: Screen | null = null;
  private readonly main = h('main', { class: 'screen' });
  private readonly nav: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly storage: AppStorage,
    /** Dev-only time multiplier (SPEC §8 speed flag). */
    readonly speed: number,
  ) {
    this.routines = storage.loadRoutines();
    this.timers = sortTimers(storage.loadTimers());
    this.settings = storage.loadSettings();
    const last = storage.loadLastUsedId();
    this.lastUsedId = this.routines.some((r) => r.id === last) ? last : null;
    this.applySettings();
    void prepareNativeCues(this.beeper).catch(() => undefined);

    this.nav = h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'brand', 'data-testid': 'brand' }, h('span', { class: 'brand-accent' }, 'yFit'), ' Workout Timer'),
      h(
        'nav',
        { class: 'tabs' },
        h('button', { class: 'tab', 'data-route': 'list', 'data-testid': 'nav-routines', onclick: () => this.go({ name: 'list' }) }, 'Routines'),
        h('button', { class: 'tab', 'data-route': 'timers', 'data-testid': 'nav-timers', onclick: () => this.go({ name: 'timers' }) }, 'Timers'),
        h('button', { class: 'tab', 'data-route': 'settings', 'data-testid': 'nav-settings', onclick: () => this.go({ name: 'settings' }) }, 'Settings'),
        iconTab('help', 'Instructions', ICON_HELP, () => this.go({ name: 'help' })),
        iconTab('about', 'About', ICON_ABOUT, () => this.go({ name: 'about' })),
      ),
    );
    this.root.append(this.nav, this.main);
    document.addEventListener('keydown', (e) => {
      if (isDialogOpen() || e.defaultPrevented) return;
      this.screen?.onKey?.(e);
    });
  }

  go(route: Route): void {
    this.screen?.destroy?.();
    let screen: Screen;
    switch (route.name) {
      case 'list':
        screen = listScreen(this);
        break;
      case 'editor':
        screen = editorScreen(this, route.routineId);
        break;
      case 'help':
        screen = helpScreen(this);
        break;
      case 'about':
        screen = aboutScreen(this);
        break;
      case 'settings':
        screen = settingsScreen(this);
        break;
      case 'timers':
        screen = timersScreen(this);
        break;
      case 'timerEditor':
        screen = timerEditorScreen(this, route.timerId);
        break;
      case 'timerRun': {
        const timer = this.timers.find((t) => t.id === route.timerId);
        if (!timer) return this.go({ name: 'timers' });
        screen = timerRunScreen(this, timer);
        break;
      }
      case 'run': {
        const routine = this.routines.find((r) => r.id === route.routineId);
        if (!routine) return this.go({ name: 'list' });
        screen = runScreen(this, routine);
        break;
      }
    }
    this.screen = screen;
    this.nav.hidden = !!screen.fullWindow;
    for (const tab of this.nav.querySelectorAll<HTMLButtonElement>('.tab')) {
      const section = route.name === 'editor' ? 'list' : route.name === 'timerEditor' ? 'timers' : route.name;
      tab.classList.toggle('active', tab.dataset.route === section);
      tab.disabled = !!screen.lockNav;
      // Tooltip: why it's locked, else the icon tab's name ("Instructions" / "About").
      if (screen.lockNav) tab.title = screen.lockNav;
      else if (tab.dataset.tip) tab.title = tab.dataset.tip;
      else tab.removeAttribute('title');
    }
    this.main.replaceChildren(screen.el);
    document.title = 'yFit Workout Timer';
  }

  /** Starts a routine. Must be called from a user gesture so audio can start. */
  startRoutine(id: string): void {
    this.beeper.unlock();
    this.setLastUsed(id);
    this.go({ name: 'run', routineId: id });
  }

  /** Starts a preset timer. Must be called from a user gesture so audio can start. */
  startTimer(id: string): void {
    this.beeper.unlock();
    this.go({ name: 'timerRun', timerId: id });
  }

  saveTimers(timers: PresetTimer[]): void {
    this.timers = sortTimers(timers);
    this.storage.saveTimers(this.timers);
  }

  setLastUsed(id: string | null): void {
    this.lastUsedId = id;
    this.storage.saveLastUsedId(id);
  }

  saveRoutines(routines: Routine[]): void {
    this.routines = routines;
    this.storage.saveRoutines(routines);
    if (this.lastUsedId && !routines.some((r) => r.id === this.lastUsedId)) this.setLastUsed(null);
  }

  updateSettings(patch: Partial<Settings>): void {
    this.settings = { ...this.settings, ...patch };
    this.storage.saveSettings(this.settings);
    this.applySettings();
  }

  /** Settings apply immediately (SPEC §6). */
  private applySettings(): void {
    this.beeper.setVolume('work', this.settings.volume);
    this.beeper.setVolume('rest', this.settings.restVolume);
    this.beeper.setStyle('work', this.settings.workStyle);
    this.beeper.setStyle('rest', this.settings.restStyle);
    this.beeper.setMuted(this.settings.muted);
    const style = document.documentElement.style;
    // The chosen color is the work color; rest is always red.
    style.setProperty('--work-color', this.settings.digitColor);
    style.setProperty('--digit-size', String(this.settings.digitSizePct));
  }
}
