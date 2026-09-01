/**
 * Element construction.
 *
 * One helper rather than a template language: the whole UI is built by calling
 * this, so there is no string-to-DOM path anywhere and therefore no place for an
 * injection bug to live. `text` sets textContent, never innerHTML.
 */

/**
 * @param {string} tag
 * @param {{class?: string, text?: string, attrs?: object, style?: object,
 *          on?: Record<string, Function>}} [opts]
 * @param {Array<Node|null|undefined|false>} [children]
 * @returns {HTMLElement}
 */
export function el(tag, opts = {}, children = []) {
  const node = document.createElement(tag);
  if (opts.class) node.className = opts.class;
  if (opts.text != null) node.textContent = String(opts.text);
  for (const [k, v] of Object.entries(opts.attrs || {})) {
    if (v == null || v === false) continue;
    node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const [k, v] of Object.entries(opts.style || {})) node.style[k] = v;
  for (const [event, fn] of Object.entries(opts.on || {})) node.addEventListener(event, fn);
  for (const child of children) if (child) node.appendChild(child);
  return node;
}

/** Replace everything under `node` with `children`. */
export function mount(node, ...children) {
  node.textContent = '';
  for (const child of children) if (child) node.appendChild(child);
  return node;
}
