import { el } from './dom.js';

export function renderCalendar(ctx) {
  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-head' }, [
      el('span', { class: 'mark' }),
      el('span', { class: 'screen-title', text: 'Calendar' }),
    ]),
    el('span', { class: 'label', text: 'Nothing yet' }),
  ]);
}
