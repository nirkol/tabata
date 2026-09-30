import type { App, Screen } from './app';
import { h } from './dom';
import { isNative } from '../platform/native';

/** About page: app name, version and credits. */
export function aboutScreen(_app: App): Screen {
  const el = h(
    'section',
    { class: 'about-screen' },
    h(
      'div',
      { class: 'about-card' },
      h('img', { class: 'about-icon', src: './app-icon.png', alt: '', width: 112, height: 112 }),
      h('h1', { class: 'about-name' }, h('span', { class: 'brand-accent' }, 'yFit'), ' Workout Timer'),
      h('p', { class: 'about-version', 'data-testid': 'about-version' }, `Version ${__APP_VERSION__}`),
      h('p', { class: 'about-credit', 'data-testid': 'about-credit' }, 'Created by yFit · © 2026'),
      h('p', { class: 'about-note' }, isNative() ? 'Mac app' : 'Web version'),
    ),
  );
  return { el };
}
