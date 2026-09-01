import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderRuleInput } from '../../src/ui/rule-input.js';

function setup(rule) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;
  const seen = [];
  const node = renderRuleInput(rule, (r) => seen.push(r), '2026-08-31');
  dom.window.document.body.appendChild(node);
  return { node, seen };
}

test('every rule kind is offered', () => {
  const { node } = setup({ kind: 'weekly', days: [0] });
  const kinds = [...node.querySelectorAll('[name="kind"] option')].map((o) => o.value);
  assert.deepEqual(kinds, ['once', 'daily', 'weekly', 'monthly']);
});

test('weekly shows seven day toggles, Monday first', () => {
  const { node } = setup({ kind: 'weekly', days: [0] });
  const days = node.querySelectorAll('.rule-day');
  assert.equal(days.length, 7);
  assert.equal(days[0].textContent, 'Mon');
  assert.equal(days[0].getAttribute('aria-pressed'), 'true');
  assert.equal(days[1].getAttribute('aria-pressed'), 'false');
});

test('toggling a day emits a complete rule', () => {
  const { node, seen } = setup({ kind: 'weekly', days: [0] });
  node.querySelectorAll('.rule-day')[2].click();
  assert.deepEqual(seen.at(-1), { kind: 'weekly', days: [0, 2] });
});

test('untoggling the last day emits an empty list rather than dropping the key', () => {
  // describeRule reports "Never — no days chosen" for this, which is the honest
  // state to be in mid-edit. Deleting `days` would make the rule malformed.
  const { node, seen } = setup({ kind: 'weekly', days: [0] });
  node.querySelectorAll('.rule-day')[0].click();
  assert.deepEqual(seen.at(-1), { kind: 'weekly', days: [] });
});

test('switching kind emits a usable rule of the new kind, not a half-built one', () => {
  const { node, seen } = setup({ kind: 'weekly', days: [0] });
  const select = node.querySelector('[name="kind"]');
  select.value = 'monthly';
  select.dispatchEvent(new window.Event('change'));
  assert.equal(seen.at(-1).kind, 'monthly');
  assert.ok(Number.isFinite(seen.at(-1).day), 'monthly must arrive with a day set');
});

test('the rule is described in words as it is edited', () => {
  const { node } = setup({ kind: 'weekly', days: [0, 2] });
  assert.match(node.querySelector('.rule-summary').textContent, /Every Mon, Wed/);
});
