/**
 * The event editor. Same sheet shape as the task editor.
 *
 * Times are typed as "HH:MM" and stored as minutes from midnight — the
 * document's convention throughout. Blank means all-day, which is a real state
 * rather than a missing value.
 */

import { el } from './dom.js';
import { renderRuleInput } from './rule-input.js';
import { EVENT_FIELDS } from '../core/events.js';
import { minutesToLabel, labelToMinutes, todayKey } from '../core/time.js';

function field(label, control) {
  return el('label', { class: 'field' }, [el('span', { class: 'label', text: label }), control]);
}

const timeValue = (min) => (Number.isFinite(min) ? minutesToLabel(min) : '');

export function renderEventEditor(ctx, event) {
  const form = el('form', { class: 'editor', attrs: { novalidate: true } });
  // The day the user is looking at, not the day it happens to be. A new event
  // is only ever created from the CALENDAR screen, where a day is always
  // selected — so that day is what they meant. Falls back to today for safety;
  // `selectedDay` is null only before boot has finished, when no editor can be
  // open anyway.
  const seedDay = ctx.selectedDay || todayKey(ctx.now);

  // A new event defaults to a rule that ACTUALLY FIRES. `{kind:'once', date:null}`
  // would be stored happily and rejected by occursOn for every date, so an event
  // saved without opening the Repeats control would exist in the document and
  // appear nowhere — permanently. There is no other field for picking a date, so
  // the default has to be a real one.
  let rule = event?.rule || { kind: 'once', date: seedDay };

  const name = el('input', {
    attrs: { name: 'name', type: 'text', value: event?.name || '',
             placeholder: 'What is happening', autocomplete: 'off' },
  });
  const startMin = el('input', { attrs: { name: 'startMin', type: 'time', value: timeValue(event?.startMin) } });
  const endMin = el('input', { attrs: { name: 'endMin', type: 'time', value: timeValue(event?.endMin) } });
  const spanDays = el('input', {
    attrs: { name: 'spanDays', type: 'number', min: '0', max: '92',
             value: String(event?.spanDays ?? 0) },
  });
  const leadMin = el('input', {
    attrs: { name: 'leadMin', type: 'number', min: '0', placeholder: String(ctx.doc.settings.eventLeadMin),
             value: Number.isFinite(event?.leadMin) ? String(event.leadMin) : '' },
  });
  const detail = el('textarea', { attrs: { name: 'detail', rows: 3, placeholder: 'Notes' },
                                  text: event?.detail || '' });

  function save() {
    ctx.actions.saveEvent({
      name: name.value.trim() || EVENT_FIELDS.name,
      rule,
      startMin: labelToMinutes(startMin.value),
      endMin: labelToMinutes(endMin.value),
      spanDays: Math.min(92, Math.max(0, Number(spanDays.value) || 0)),
      leadMin: leadMin.value === '' ? null : Math.max(0, Number(leadMin.value) || 0),
      detail: detail.value,
    });
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });

  form.append(
    el('div', { class: 'editor-head' }, [
      el('span', { class: 'label', text: event ? `Event ${event.ref}` : 'New event' }),
    ]),
    field('Name', name),
    field('Repeats', renderRuleInput(rule, (next) => { rule = next; }, seedDay)),
    field('Starts', startMin),
    field('Ends', endMin),
    field('Extra days', spanDays),
    field('Notify (minutes before)', leadMin),
    field('Notes', detail),
    el('div', { class: 'editor-actions' }, [
      event ? el('button', { class: 'btn danger editor-delete', attrs: { type: 'button' },
                             text: 'Delete', on: { click: () => ctx.actions.archiveEvent(event.id) } }) : null,
      el('span', { style: { flex: '1' } }),
      el('button', { class: 'btn editor-cancel', attrs: { type: 'button' }, text: 'Cancel',
                     on: { click: () => ctx.actions.closeEditor() } }),
      el('button', { class: 'btn primary editor-save', attrs: { type: 'button' }, text: 'Save',
                     on: { click: save } }),
    ]),
  );

  return form;
}
