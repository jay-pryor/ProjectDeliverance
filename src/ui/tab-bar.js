import { el } from './dom.js';

/** Bottom navigation. At the bottom because that is where thumbs are. */
export function renderTabBar(ctx, screens, current) {
  return el('nav', { class: 'tab-bar' }, screens.map((name) => el('button', {
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
    el('span', { class: 'mark' }),
    el('span', { text: name }),
  ])));
}
