import { el } from './dom.js';

/**
 * The screen shown when the document could not be read.
 *
 * Deliberately not one of the RENDERERS: it replaces the whole app rather than
 * occupying a tab, and it is drawn with no `doc` in hand, which every other
 * screen assumes it has. It also never offers a repair — the damaged file is
 * left exactly as found so a human can still rescue it by hand.
 */
export function renderRecovery(problem) {
  return el('div', { class: 'screen' }, [
    el('div', { class: 'screen-head' }, [
      el('span', { class: 'mark', style: { background: 'var(--crit)' } }),
      el('span', { class: 'screen-title', text: 'Recovery' }),
    ]),
    el('p', { text: 'Your data could not be read, so nothing has been changed.' }),
    el('p', { class: 'mono', text: problem }),
  ]);
}
