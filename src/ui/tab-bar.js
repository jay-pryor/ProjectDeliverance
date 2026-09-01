import { el } from './dom.js';
import { attention } from '../core/signals.js';

/** Bottom navigation. At the bottom because that is where thumbs are. */
export function renderTabBar(ctx, screens, current) {
  const counts = attention(ctx.doc, ctx.now);
  return el('nav', { class: 'tab-bar' }, screens.map((name) => {
    const lit = (name === 'today' && counts.today > 0) || (name === 'calendar' && counts.calendar > 0);
    return el('button', {
      class: 'tab',
      attrs: {
        type: 'button',
        'data-screen': name,
        // aria-current, not a class, so assistive tech and the stylesheet read
        // the same fact rather than two that can drift apart.
        'aria-current': name === current ? 'page' : null,
      },
      on: { click: () => ctx.actions.setScreen(name) },
    }, [
      el('span', { class: lit ? 'mark live' : 'mark' }),
      el('span', { text: name }),
    ]);
  }));
}
