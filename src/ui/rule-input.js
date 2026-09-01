/**
 * The recurrence editor.
 *
 * Emits a COMPLETE rule on every change — never a partial one. A half-built
 * rule reaching the document would be stored, and `occursOn` would quietly
 * report false for it forever, which reads to the user as "the app forgot".
 */

import { el } from './dom.js';
import { RULE_KINDS, describeRule } from '../core/recurrence.js';
import { DAY_NAMES, todayKey } from '../core/time.js';

/** A usable rule of each kind, so switching kind never yields a broken one. */
function seedRule(kind, previous) {
  const today = todayKey();
  switch (kind) {
    case 'once':    return { kind: 'once', date: previous.date || today };
    case 'daily':   return { kind: 'daily', from: previous.from || today, every: previous.every || 1 };
    case 'weekly':  return { kind: 'weekly', days: previous.days || [] };
    case 'monthly': return { kind: 'monthly', day: Number.isFinite(previous.day) ? previous.day
                                                : Number(today.slice(8, 10)) };
    default:        return { kind: 'weekly', days: [] };
  }
}

export function renderRuleInput(initial, onChange) {
  let rule = { ...(initial && initial.kind ? initial : { kind: 'weekly', days: [] }) };
  const wrap = el('div', { class: 'rule-input' });

  function emit() {
    onChange({ ...rule });
    draw();
  }

  function body() {
    if (rule.kind === 'once') {
      return el('input', {
        attrs: { name: 'date', type: 'date', value: rule.date || '' },
        on: { change: (e) => { rule = { ...rule, date: e.target.value }; emit(); } },
      });
    }
    if (rule.kind === 'daily') {
      return el('label', { class: 'field' }, [
        el('span', { class: 'label', text: 'Every N days' }),
        el('input', {
          attrs: { name: 'every', type: 'number', min: '1', value: String(rule.every || 1) },
          on: { change: (e) => {
            rule = { ...rule, every: Math.max(1, Number(e.target.value) || 1) }; emit();
          } },
        }),
      ]);
    }
    if (rule.kind === 'weekly') {
      const days = rule.days || [];
      return el('div', { class: 'rule-days' }, DAY_NAMES.map((name, index) => el('button', {
        class: 'rule-day',
        attrs: { type: 'button', 'aria-pressed': days.includes(index) },
        text: name,
        on: { click: () => {
          const next = days.includes(index)
            ? days.filter((d) => d !== index)
            : [...days, index].sort((a, b) => a - b);
          rule = { ...rule, days: next };
          emit();
        } },
      })));
    }
    return el('label', { class: 'field' }, [
      el('span', { class: 'label', text: 'Day of month' }),
      el('input', {
        attrs: { name: 'day', type: 'number', min: '1', max: '31', value: String(rule.day || 1) },
        on: { change: (e) => {
          rule = { ...rule, day: Math.min(31, Math.max(1, Number(e.target.value) || 1)) }; emit();
        } },
      }),
    ]);
  }

  function draw() {
    wrap.textContent = '';
    wrap.append(
      el('select', {
        attrs: { name: 'kind' },
        on: { change: (e) => { rule = seedRule(e.target.value, rule); emit(); } },
      }, RULE_KINDS.map((k) => el('option', {
        attrs: { value: k, selected: rule.kind === k }, text: k,
      }))),
      body(),
      el('span', { class: 'rule-summary label', text: describeRule(rule) }),
    );
  }

  draw();
  return wrap;
}
