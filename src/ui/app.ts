import { Beeper } from '../audio/beeper';
import type { Routine } from '../routines/model';
import { sortTimers, type PresetTimer } from '../timers/model';
import { pruneClass, resolveItem, type WorkoutClass } from '../classes/model';
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
import { stopwatchScreen } from './stopwatchScreen';
import { classesScreen } from './classesScreen';
import { classEditorScreen, classScreen } from './classScreen';

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
  /**
   * Paused sessions (SPEC §4.7): a routine run, timer run or stopwatch that is left while
   * `keepAlive()` is true is hidden instead of destroyed, and shown again (as it was) the next
   * time its section (Routines / Timers / Stopwatch) is opened.
   */
  session?: SessionKind;
  keepAlive?(): boolean;
  /** Called when a kept screen is taken off the page (stop loops, release the wake lock). */
  hide?(): void;
  /** Called when a kept screen is put back on the page. */
  show?(): void;
  /** Resumes a paused run (Continue class). */
  play?(): void;
}

/** 'class' is a routine or timer playing as part of a class. */
export type SessionKind = 'routine' | 'timer' | 'stopwatch' | 'class';

/** The top-bar section of each kind of paused session. */
const SESSION_TABS: Record<SessionKind, string> = { routine: 'list', timer: 'timers', stopwatch: 'stopwatch', class: 'classes' };

/** A class being played: items before `done` have finished; item `done` is the current one. */
export interface ClassRun {
  classId: string;
  done: number;
}

/** What the Run and Timer screens need to know when they play an item of a class. */
export interface ClassContext {
  /** The class name. */
  name: string;
  /** "2 / 5" */
  position: string;
  /** The item that plays after this one, or null if this is the last. */
  next: string | null;
  /** Marks this item as played (called once, when it finishes). */
  finished(): void;
  /** Plays the next item (or opens the class page after the last one). */
  advance(): void;
  /** Opens the class page. */
  back(): void;
}

type Route =
  | { name: 'list' }
  | { name: 'editor'; routineId: string | null }
  | { name: 'settings' }
  | { name: 'help' }
  | { name: 'about' }
  | { name: 'run'; routineId: string; inClass?: boolean }
  | { name: 'timers' }
  | { name: 'timerEditor'; timerId: string | null }
  | { name: 'timerRun'; timerId: string; inClass?: boolean }
  | { name: 'stopwatch' }
  | { name: 'classes' }
  | { name: 'class'; classId: string }
  | { name: 'classEditor'; classId: string | null }
  | { name: 'classResume' };

export class App {
  routines: Routine[];
  /** Preset timers, always sorted from short to long. */
  timers: PresetTimer[];
  settings: Settings;
  lastUsedId: string | null;
  classes: WorkoutClass[];
  /** The class being played (only one at a time); kept in memory only. */
  classRun: ClassRun | null = null;
  readonly beeper = new Beeper();
  private screen: Screen | null = null;
  /** Paused sessions kept while the user is on other pages. */
  private readonly sessions: Partial<Record<SessionKind, Screen>> = {};
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
    this.classes = storage.loadClasses().map((c) => pruneClass(c, this.routines, this.timers));
    const last = storage.loadLastUsedId();
    this.lastUsedId = this.routines.some((r) => r.id === last) ? last : null;
    this.applySettings();
    void prepareNativeCues(this.beeper).catch(() => undefined);

    this.nav = h(
      'header',
      { class: 'topbar' },
      h('div', { class: 'brand', 'data-testid': 'brand' }, h('span', { class: 'brand-accent' }, 'yFit'), ' Workout Timer'),
      // Main sections as large buttons in the center; the rest as text links on the right.
      h(
        'nav',
        { class: 'tabs tabs-main' },
        h('button', { class: 'tab tab-main', 'data-route': 'classes', 'data-testid': 'nav-classes', onclick: () => this.openClasses() }, 'Classes'),
        h('button', { class: 'tab tab-main', 'data-route': 'list', 'data-testid': 'nav-routines', onclick: () => this.go({ name: 'list' }) }, 'Routines'),
        h('button', { class: 'tab tab-main', 'data-route': 'timers', 'data-testid': 'nav-timers', onclick: () => this.go({ name: 'timers' }) }, 'Timers'),
        h('button', { class: 'tab tab-main', 'data-route': 'stopwatch', 'data-testid': 'nav-stopwatch', onclick: () => this.go({ name: 'stopwatch' }) }, 'Stopwatch'),
      ),
      h(
        'nav',
        { class: 'tabs tabs-side' },
        h('button', { class: 'tab', 'data-route': 'settings', 'data-testid': 'nav-settings', onclick: () => this.go({ name: 'settings' }) }, 'Settings'),
        h('button', { class: 'tab', 'data-route': 'help', 'data-testid': 'nav-help', onclick: () => this.go({ name: 'help' }) }, 'Instructions'),
        h('button', { class: 'tab', 'data-route': 'about', 'data-testid': 'nav-about', onclick: () => this.go({ name: 'about' }) }, 'About'),
      ),
    );
    this.root.append(this.nav, this.main);
    document.addEventListener('keydown', (e) => {
      if (isDialogOpen() || e.defaultPrevented) return;
      this.screen?.onKey?.(e);
    });
  }

  go(route: Route): void {
    // Leaving a paused session keeps it (hidden); anything else is closed.
    const prev = this.screen;
    if (prev) {
      if (prev.session && prev.keepAlive?.()) {
        prev.hide?.();
        this.sessions[prev.session] = prev;
      } else {
        prev.destroy?.();
        if (prev.session && this.sessions[prev.session] === prev) delete this.sessions[prev.session];
      }
      this.screen = null;
    }
    let screen: Screen;
    let resumed = false;
    /** Takes a kept session of this kind back, if there is one. */
    const resume = (kind: SessionKind): Screen | null => {
      const s = this.sessions[kind];
      if (!s) return null;
      delete this.sessions[kind];
      resumed = true;
      return s;
    };
    /** Starting a new run of this kind replaces the kept one. */
    const drop = (kind: SessionKind): void => {
      this.sessions[kind]?.destroy?.();
      delete this.sessions[kind];
    };
    switch (route.name) {
      case 'list':
        screen = resume('routine') ?? listScreen(this);
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
        screen = resume('timer') ?? timersScreen(this);
        break;
      case 'timerEditor':
        screen = timerEditorScreen(this, route.timerId);
        break;
      case 'stopwatch':
        screen = resume('stopwatch') ?? stopwatchScreen(this);
        break;
      case 'timerRun': {
        drop(route.inClass ? 'class' : 'timer');
        const timer = this.timers.find((t) => t.id === route.timerId);
        if (!timer) return this.go({ name: 'timers' });
        screen = timerRunScreen(this, timer, route.inClass ? this.classContext() ?? undefined : undefined);
        break;
      }
      case 'run': {
        drop(route.inClass ? 'class' : 'routine');
        const routine = this.routines.find((r) => r.id === route.routineId);
        if (!routine) return this.go({ name: 'list' });
        screen = runScreen(this, routine, route.inClass ? this.classContext() ?? undefined : undefined);
        break;
      }
      case 'classes':
        screen = classesScreen(this);
        break;
      case 'class': {
        if (!this.classes.some((c) => c.id === route.classId)) return this.go({ name: 'classes' });
        screen = classScreen(this, route.classId);
        break;
      }
      case 'classEditor':
        screen = classEditorScreen(this, route.classId);
        break;
      case 'classResume': {
        const kept = resume('class');
        if (!kept) return this.continueClass();
        screen = kept;
        break;
      }
    }
    this.screen = screen;
    this.nav.hidden = !!screen.fullWindow;
    const section = screen.session
      ? SESSION_TABS[screen.session]
      : route.name === 'editor' ? 'list' : route.name === 'timerEditor' ? 'timers' : route.name === 'class' || route.name === 'classEditor' ? 'classes' : route.name;
    for (const tab of this.nav.querySelectorAll<HTMLButtonElement>('.tab')) tab.classList.toggle('active', tab.dataset.route === section);
    this.setNavLock(screen.lockNav ?? null);
    // A "paused" mark on the tabs whose section has a paused session waiting.
    for (const kind of Object.keys(SESSION_TABS) as SessionKind[]) {
      const tab = this.nav.querySelector<HTMLElement>(`.tab[data-route="${SESSION_TABS[kind]}"]`);
      tab?.classList.toggle('tab-paused', !!this.sessions[kind]);
    }
    this.main.replaceChildren(screen.el);
    document.title = 'yFit Workout Timer';
    if (resumed) screen.show?.();
    if (route.name === 'classResume') screen.play?.();
  }

  // --- Classes (SPEC §5d) ---

  /** The Class tab: the class being played (if any), otherwise the list of classes. */
  openClasses(): void {
    const run = this.classRun;
    const active = run && this.classes.find((c) => c.id === run.classId);
    if (active && run.done < active.items.length) this.go({ name: 'class', classId: active.id });
    else this.go({ name: 'classes' });
  }

  /** True while a routine or timer of a class is kept paused (Continue resumes it). */
  hasClassSession(): boolean {
    return !!this.sessions.class;
  }

  saveClasses(classes: WorkoutClass[]): void {
    this.classes = classes;
    this.storage.saveClasses(classes);
  }

  /** Opens the class editor for a new class (saved only with Save class). */
  newClass(): void {
    this.go({ name: 'classEditor', classId: null });
  }

  /** Starts a class from its first item. Must be called from a user gesture so audio can start. */
  startClass(classId: string): void {
    this.endClass();
    this.classRun = { classId, done: 0 };
    this.beeper.unlock();
    this.playClassItem();
  }

  /** Continue: resumes the paused item, or starts the current one. */
  continueClass(): void {
    this.beeper.unlock();
    if (this.sessions.class) this.go({ name: 'classResume' });
    else this.playClassItem();
  }

  /** Ends the class being played (and drops its paused item). */
  endClass(): void {
    this.sessions.class?.destroy?.();
    delete this.sessions.class;
    this.classRun = null;
    this.nav.querySelector('.tab[data-route="classes"]')?.classList.remove('tab-paused');
  }

  /** Plays the current item of the class run, or opens the class page when it's over. */
  private playClassItem(): void {
    const run = this.classRun;
    const c = run && this.classes.find((x) => x.id === run.classId);
    if (!run || !c) return this.go({ name: 'classes' });
    const item = c.items[run.done];
    const resolved = item && resolveItem(item, this.routines, this.timers);
    if (!resolved) return this.go({ name: 'class', classId: c.id });
    if (resolved.kind === 'routine') this.go({ name: 'run', routineId: resolved.routine.id, inClass: true });
    else this.go({ name: 'timerRun', timerId: resolved.timer.id, inClass: true });
  }

  /** Built when a class item starts playing. */
  private classContext(): ClassContext | null {
    const run = this.classRun;
    const c = run && this.classes.find((x) => x.id === run.classId);
    if (!run || !c) return null;
    const index = run.done;
    const nextItem = c.items[index + 1];
    const next = nextItem ? resolveItem(nextItem, this.routines, this.timers)?.label ?? null : null;
    const same = () => this.classRun === run;
    return {
      name: c.name,
      position: `${index + 1} / ${c.items.length}`,
      next,
      finished: () => {
        if (same() && run.done === index) run.done = index + 1;
      },
      advance: () => {
        if (same()) this.playClassItem();
        else this.go({ name: 'classes' });
      },
      back: () => (this.classes.some((x) => x.id === c.id) ? this.go({ name: 'class', classId: c.id }) : this.go({ name: 'classes' })),
    };
  }

  /** Removes class items whose routine or timer was deleted; a class being played that changes is ended. */
  private pruneClasses(): void {
    let changed = false;
    const next = this.classes.map((c) => {
      const p = pruneClass(c, this.routines, this.timers);
      if (p !== c) {
        changed = true;
        if (this.classRun?.classId === c.id) this.endClass();
      }
      return p;
    });
    if (changed) this.saveClasses(next);
  }

  /** Hides the top bar (a running workout fills the window) or shows it again (paused). */
  setFullWindow(full: boolean): void {
    this.nav.hidden = full;
  }

  /**
   * Disables the top navigation (with the reason as a tooltip), or enables it with null.
   * Screens whose lock changes while open (the Stopwatch) call this directly.
   */
  setNavLock(reason: string | null): void {
    for (const tab of this.nav.querySelectorAll<HTMLButtonElement>('.tab')) {
      tab.disabled = reason !== null;
      if (reason !== null) tab.title = reason;
      else tab.removeAttribute('title');
    }
  }

  /** Starts a routine. Must be called from a user gesture so audio can start. */
  startRoutine(id: string): void {
    this.beeper.unlock();
    this.setLastUsed(id);
    // Most recently used first: the started routine moves to the top of the list (SPEC §5.1).
    const started = this.routines.find((r) => r.id === id);
    if (started && this.routines[0] !== started) {
      this.saveRoutines([started, ...this.routines.filter((r) => r !== started)]);
    }
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
    this.pruneClasses();
  }

  setLastUsed(id: string | null): void {
    this.lastUsedId = id;
    this.storage.saveLastUsedId(id);
  }

  saveRoutines(routines: Routine[]): void {
    this.routines = routines;
    this.storage.saveRoutines(routines);
    if (this.lastUsedId && !routines.some((r) => r.id === this.lastUsedId)) this.setLastUsed(null);
    this.pruneClasses();
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
