/**
 * The routine editor.
 *
 * Steps are edited as one textarea, one step per line, rather than as a list of
 * inputs with add and remove buttons. Typing four lines is faster than four
 * taps plus four focus changes, and there is nothing a per-step control would
 * offer that reordering the text does not.
 */

import { el } from './dom.js';
import { renderRuleInput } from './rule-input.js';
import { ROUTINE_FIELDS } from '../core/routines.js';
import { minutesToLabel, labelToMinutes } from '../core/time.js';

function field(label, control) {
  return el('label', { class: 'field' }, [el('span', { class: 'label', text: label }), control]);
}

export function renderRoutineEditor(ctx, routine) {
  const form = el('form', { class: 'editor', attrs: { novalidate: true } });
  let rule = routine?.rule || { kind: 'weekly', days: [] };

  const name = el('input', {
    attrs: { name: 'name', type: 'text', value: routine?.name || '',
             placeholder: 'What you do', autocomplete: 'off' },
  });
  const timeMin = el('input', {
    attrs: { name: 'timeMin', type: 'time',
             value: minutesToLabel(routine?.timeMin ?? ROUTINE_FIELDS.timeMin) },
  });
  const steps = el('textarea', {
    attrs: { name: 'steps', rows: 5, placeholder: 'One step per line' },
    text: (routine?.steps || []).join('\n'),
  });

  function save() {
    ctx.actions.saveRoutine({
      name: name.value.trim() || ROUTINE_FIELDS.name,
      rule,
      timeMin: labelToMinutes(timeMin.value) ?? ROUTINE_FIELDS.timeMin,
      steps: steps.value.split('\n').map((s) => s.trim()).filter(Boolean),
    });
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); save(); });

  form.append(
    el('div', { class: 'editor-head' }, [
      el('span', { class: 'label', text: routine ? `Routine ${routine.ref}` : 'New routine' }),
    ]),
    field('Name', name),
    field('At', timeMin),
    field('Repeats', renderRuleInput(rule, (next) => { rule = next; })),
    field('Steps', steps),
    el('div', { class: 'editor-actions' }, [
      routine ? el('button', { class: 'btn danger editor-delete', attrs: { type: 'button' },
                               text: 'Delete', on: { click: () => ctx.actions.archiveRoutine(routine.id) } }) : null,
      el('span', { style: { flex: '1' } }),
      el('button', { class: 'btn editor-cancel', attrs: { type: 'button' }, text: 'Cancel',
                     on: { click: () => ctx.actions.closeEditor() } }),
      el('button', { class: 'btn primary editor-save', attrs: { type: 'button' }, text: 'Save',
                     on: { click: save } }),
    ]),
  );

  return form;
}
