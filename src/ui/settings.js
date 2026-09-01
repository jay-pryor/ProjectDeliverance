import { el } from './dom.js';

export function renderSettings(ctx) {
  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-head' }, [
      el('span', { class: 'mark' }),
      el('span', { class: 'screen-title', text: 'Settings' }),
    ]),
    el('span', { class: 'label', text: 'Nothing yet' }),
  ]);
}
