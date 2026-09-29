import { Beeper } from '../audio/beeper';
import type { Routine } from '../routines/model';
import type { AppStorage, Settings } from '../storage/storage';
import { h } from './dom';
import { isDialogOpen } from './dialog';
import { editorScreen } from './editorScreen';
import { listScreen } from './listScreen';
import { runScreen } from './runScreen';
import { settingsScreen } from './settingsScreen';

export interface Screen {
  el: HTMLElement;
  /** Called when the screen is left. */
  destroy?(): void;
  /** Keyboard shortcuts for this screen (not called while a dialog is open). */
  onKey?(e: KeyboardEvent): void;
  /** Hides the top navigation (the Run screen is full-window). */
  fullWindow?: boolean;
}

type Route = { name: 'list' } | { name: 'editor'; routineId: string | null } | { name: 'settings' } | { name: 'run'; routineId: string };

export class App {
  routines: Routine[];
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
    this.settings = storage.loadSettings();
    const last = storage.loadLastUsedId();
    this.lastUsedId = this.routines.some((r) => r.id === last) ? last : null;
    this.applySettings();

    this.nav = h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'brand', 'data-testid': 'brand' }, h('span', { class: 'brand-accent' }, 'yFit'), ' Tabata Timer'),
      h(
        'nav',
        { class: 'tabs' },
        h('button', { class: 'tab', 'data-route': 'list', 'data-testid': 'nav-routines', onclick: () => this.go({ name: 'list' }) }, 'Routines'),
        h('button', { class: 'tab', 'data-route': 'settings', 'data-testid': 'nav-settings', onclick: () => this.go({ name: 'settings' }) }, 'Settings'),
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
      case 'settings':
        screen = settingsScreen(this);
        break;
      case 'run': {
        const routine = this.routines.find((r) => r.id === route.routineId);
        if (!routine) return this.go({ name: 'list' });
        screen = runScreen(this, routine);
        break;
      }
    }
    this.screen = screen;
    this.nav.hidden = !!screen.fullWindow;
    for (const tab of this.nav.querySelectorAll<HTMLElement>('.tab')) {
      tab.classList.toggle('active', tab.dataset.route === route.name || (route.name === 'editor' && tab.dataset.route === 'list'));
    }
    this.main.replaceChildren(screen.el);
    document.title = 'yFit Tabata Timer';
  }

  /** Starts a routine. Must be called from a user gesture so audio can start. */
  startRoutine(id: string): void {
    this.beeper.unlock();
    this.setLastUsed(id);
    this.go({ name: 'run', routineId: id });
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
    style.setProperty('--digit-color', this.settings.digitColor);
    style.setProperty('--digit-size', String(this.settings.digitSizePct));
  }
}
