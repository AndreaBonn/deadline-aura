'use strict';

/* eslint-disable no-unused-vars */
/* global t */
/* Field rendering helpers for settings UI — consumed by settings.js via <script> */

function createToggle(value, onChange) {
  const label = document.createElement('label');
  label.className = 'toggle';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  const track = document.createElement('span');
  track.className = 'toggle-track';
  label.append(input, track);
  return label;
}

function createNumberInput(value, { min, max, step = 1 } = {}, onChange) {
  const input = document.createElement('input');
  input.type = 'number';
  input.value = value;
  if (min !== undefined) {
    input.min = min;
  }
  if (max !== undefined) {
    input.max = max;
  }
  input.step = step;
  input.addEventListener('change', () => onChange(Number(input.value)));
  return input;
}

function createRangeWithValue(value, { min, max, step = 0.01 } = {}, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'field-input';
  const range = document.createElement('input');
  range.type = 'range';
  range.min = min;
  range.max = max;
  range.step = step;
  range.value = value;
  const num = document.createElement('input');
  num.type = 'number';
  num.min = min;
  num.max = max;
  num.step = step;
  num.value = value;
  num.style.width = '60px';
  range.addEventListener('input', () => {
    num.value = range.value;
    onChange(Number(range.value));
  });
  num.addEventListener('change', () => {
    range.value = num.value;
    onChange(Number(num.value));
  });
  wrap.append(range, num);
  return wrap;
}

function createSelect(value, options, onChange) {
  const select = document.createElement('select');
  for (const opt of options) {
    const o = document.createElement('option');
    o.value = opt.value || opt;
    o.textContent = opt.label || opt;
    if ((opt.value || opt) === value) {
      o.selected = true;
    }
    select.appendChild(o);
  }
  select.addEventListener('change', () => onChange(select.value));
  return select;
}

function createTextInput(value, { placeholder = '' } = {}, onChange) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = value;
  input.placeholder = placeholder;
  input.addEventListener('change', () => onChange(input.value));
  return input;
}

function createSecretInput(value, { placeholder = '' } = {}, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'field-input secret-input';
  const input = document.createElement('input');
  input.type = 'password';
  input.value = value;
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.addEventListener('change', () => onChange(input.value));

  const show = typeof t === 'function' ? t('settings.secret_show') : 'Show';
  const hide = typeof t === 'function' ? t('settings.secret_hide') : 'Hide';
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'secret-toggle';
  toggle.textContent = show;
  toggle.addEventListener('click', () => {
    const masked = input.type === 'password';
    input.type = masked ? 'text' : 'password';
    toggle.textContent = masked ? hide : show;
  });

  wrap.append(input, toggle);
  return wrap;
}

function createTagInput(values, { placeholder } = {}, onChange) {
  const defaultPlaceholder =
    typeof t === 'function' ? t('settings.tag_add_placeholder') : 'Aggiungi...';
  placeholder = placeholder || defaultPlaceholder;
  const container = document.createElement('div');
  container.className = 'tag-container';
  const currentValues = [...values];

  function render() {
    container.innerHTML = '';
    for (let i = 0; i < currentValues.length; i++) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = currentValues[i];
      const btn = document.createElement('button');
      btn.className = 'tag-remove';
      btn.textContent = '\u00d7';
      btn.addEventListener('click', () => {
        currentValues.splice(i, 1);
        onChange([...currentValues]);
        render();
      });
      tag.appendChild(btn);
      container.appendChild(tag);
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'tag-input';
    input.placeholder = placeholder;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        e.preventDefault();
        currentValues.push(input.value.trim());
        onChange([...currentValues]);
        render();
      }
    });
    container.appendChild(input);
  }

  render();
  return container;
}

function createPriorityList(values, onChange) {
  const container = document.createElement('div');
  container.className = 'priority-list';
  const current = [...values];

  function render() {
    container.innerHTML = '';
    for (let i = 0; i < current.length; i++) {
      const item = document.createElement('div');
      item.className = 'priority-item';
      const idx = document.createElement('span');
      idx.textContent = `${i + 1}. ${current[i]}`;
      idx.style.flex = '1';
      const up = document.createElement('button');
      up.className = 'priority-btn';
      up.textContent = '\u25b2';
      up.disabled = i === 0;
      up.addEventListener('click', () => {
        [current[i - 1], current[i]] = [current[i], current[i - 1]];
        onChange([...current]);
        render();
      });
      const down = document.createElement('button');
      down.className = 'priority-btn';
      down.textContent = '\u25bc';
      down.disabled = i === current.length - 1;
      down.addEventListener('click', () => {
        [current[i], current[i + 1]] = [current[i + 1], current[i]];
        onChange([...current]);
        render();
      });
      item.append(idx, up, down);
      container.appendChild(item);
    }
  }

  render();
  return container;
}

function createField(label, control, hint) {
  const div = document.createElement('div');
  div.className = 'field';
  const labelDiv = document.createElement('div');
  const labelSpan = document.createElement('div');
  labelSpan.className = 'field-label';
  labelSpan.textContent = label;
  labelDiv.appendChild(labelSpan);
  if (hint) {
    const hintSpan = document.createElement('div');
    hintSpan.className = 'field-hint';
    hintSpan.textContent = hint;
    labelDiv.appendChild(hintSpan);
  }
  div.append(labelDiv, control);
  return div;
}

function createFieldGroup(title) {
  const group = document.createElement('div');
  group.className = 'field-group';
  if (title) {
    const h = document.createElement('div');
    h.className = 'field-group-title';
    h.textContent = title;
    group.appendChild(h);
  }
  return group;
}

function createCheckboxGroup(selectedValues, options, onChange) {
  const container = document.createElement('div');
  container.className = 'checkbox-group';
  const current = new Set(selectedValues);

  for (const opt of options) {
    const label = document.createElement('label');
    label.className = 'checkbox-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = current.has(opt.value);
    cb.addEventListener('change', () => {
      if (cb.checked) {
        current.add(opt.value);
      } else {
        current.delete(opt.value);
      }
      onChange([...current].sort((a, b) => a - b));
    });
    const span = document.createElement('span');
    span.className = 'checkbox-label';
    span.textContent = opt.label;
    label.append(cb, span);
    container.appendChild(label);
  }

  return container;
}

function createDateList(dates, onChange) {
  const container = document.createElement('div');
  container.className = 'date-list';
  const currentDates = [...dates];

  function render() {
    container.innerHTML = '';
    for (let i = 0; i < currentDates.length; i++) {
      const row = document.createElement('div');
      row.className = 'date-list-row';
      const input = document.createElement('input');
      input.type = 'date';
      input.className = 'date-list-input';
      input.value = currentDates[i];
      input.addEventListener('change', () => {
        currentDates[i] = input.value;
        onChange([...currentDates]);
      });
      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn btn--danger btn--small';
      removeBtn.textContent = '\u00d7';
      removeBtn.addEventListener('click', () => {
        currentDates.splice(i, 1);
        onChange([...currentDates]);
        render();
      });
      row.append(input, removeBtn);
      container.appendChild(row);
    }
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn--secondary btn--small';
    addBtn.textContent =
      typeof t === 'function' ? t('settings.work_shift_add_holiday') : '+ Add date';
    addBtn.addEventListener('click', () => {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const y = tomorrow.getFullYear();
      const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
      const d = String(tomorrow.getDate()).padStart(2, '0');
      currentDates.push(`${y}-${m}-${d}`);
      onChange([...currentDates]);
      render();
    });
    container.appendChild(addBtn);
  }

  render();
  return container;
}

function createTimeSlotList(slots, onChange) {
  const container = document.createElement('div');
  container.className = 'time-slot-list';
  const current = slots.map((s) => ({ ...s }));

  function render() {
    container.innerHTML = '';
    for (let i = 0; i < current.length; i++) {
      const row = document.createElement('div');
      row.className = 'time-slot-row';

      const label = document.createElement('span');
      label.className = 'time-slot-label';
      label.textContent =
        typeof t === 'function' ? t('settings.work_shift_slot_n', { n: i + 1 }) : `Slot ${i + 1}`;

      const startInput = document.createElement('input');
      startInput.type = 'time';
      startInput.className = 'time-slot-input';
      startInput.value = current[i].start;
      startInput.addEventListener('change', () => {
        current[i].start = startInput.value;
        onChange(current.map((s) => ({ ...s })));
      });

      const endInput = document.createElement('input');
      endInput.type = 'time';
      endInput.className = 'time-slot-input';
      endInput.value = current[i].end;
      endInput.addEventListener('change', () => {
        current[i].end = endInput.value;
        onChange(current.map((s) => ({ ...s })));
      });

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn btn--danger btn--small';
      removeBtn.textContent = '\u00d7';
      removeBtn.disabled = current.length <= 1;
      removeBtn.addEventListener('click', () => {
        current.splice(i, 1);
        onChange(current.map((s) => ({ ...s })));
        render();
      });

      row.append(label, startInput, endInput, removeBtn);
      container.appendChild(row);
    }

    if (current.length < 4) {
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn--secondary btn--small';
      addBtn.textContent =
        typeof t === 'function' ? t('settings.work_shift_add_slot') : '+ Add slot';
      addBtn.addEventListener('click', () => {
        current.push({ start: '09:00', end: '17:00' });
        onChange(current.map((s) => ({ ...s })));
        render();
      });
      container.appendChild(addBtn);
    }
  }

  render();
  return container;
}

function createVariableMonthGrid(monthKey, monthData, onChange) {
  const container = document.createElement('div');
  container.className = 'variable-month-grid';

  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;

  const headerEl = document.createElement('div');
  headerEl.className = 'variable-month-header';
  const dateForTitle = new Date(year, month, 1);
  headerEl.textContent = dateForTitle.toLocaleDateString(
    typeof t === 'function' ? t('meta.dateLocale') : 'it-IT',
    { month: 'long', year: 'numeric' },
  );
  container.appendChild(headerEl);

  const dayHeaders = document.createElement('div');
  dayHeaders.className = 'variable-grid-row variable-grid-header';
  for (let d = 1; d <= 7; d++) {
    const dayIdx = d % 7;
    const cell = document.createElement('div');
    cell.className = 'variable-grid-cell variable-grid-day-header';
    cell.textContent =
      typeof t === 'function'
        ? t(`settings.work_shift_day_short_${dayIdx}`)
        : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayIdx];
    dayHeaders.appendChild(cell);
  }
  container.appendChild(dayHeaders);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const startOffset = firstDow === 0 ? 6 : firstDow - 1;

  let row = document.createElement('div');
  row.className = 'variable-grid-row';

  for (let blank = 0; blank < startOffset; blank++) {
    const cell = document.createElement('div');
    cell.className = 'variable-grid-cell variable-grid-empty';
    row.appendChild(cell);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cellIdx = (startOffset + day - 1) % 7;
    if (cellIdx === 0 && day > 1) {
      container.appendChild(row);
      row = document.createElement('div');
      row.className = 'variable-grid-row';
    }

    const cell = document.createElement('div');
    cell.className = 'variable-grid-cell';
    const dayStr = String(day);
    const hasShift = monthData[dayStr] && monthData[dayStr].length > 0;

    const dayLabel = document.createElement('div');
    dayLabel.className = 'variable-grid-day-num';
    dayLabel.textContent = day;
    cell.appendChild(dayLabel);

    if (hasShift) {
      cell.classList.add('has-shift');
      const slotInfo = document.createElement('div');
      slotInfo.className = 'variable-grid-slot-info';
      slotInfo.textContent = monthData[dayStr].map((s) => `${s.start}-${s.end}`).join(', ');
      cell.appendChild(slotInfo);
    }

    cell.addEventListener('click', () => {
      showDayShiftEditor(container, monthKey, dayStr, monthData, onChange);
    });

    row.appendChild(cell);
  }

  const remaining = 7 - row.children.length;
  for (let blank = 0; blank < remaining; blank++) {
    const cell = document.createElement('div');
    cell.className = 'variable-grid-cell variable-grid-empty';
    row.appendChild(cell);
  }
  container.appendChild(row);

  const actions = document.createElement('div');
  actions.className = 'variable-month-actions';

  const clearBtn = document.createElement('button');
  clearBtn.className = 'btn btn--danger btn--small';
  clearBtn.textContent =
    typeof t === 'function' ? t('settings.work_shift_clear_month') : 'Clear month';
  clearBtn.addEventListener('click', () => {
    for (const key of Object.keys(monthData)) {
      delete monthData[key];
    }
    onChange({ ...monthData });
    container.replaceWith(createVariableMonthGrid(monthKey, monthData, onChange));
  });
  actions.appendChild(clearBtn);
  container.appendChild(actions);

  return container;
}

function showDayShiftEditor(gridContainer, monthKey, dayStr, monthData, onChange) {
  const existing = gridContainer.querySelector('.day-shift-editor');
  if (existing) {
    existing.remove();
  }

  const editor = document.createElement('div');
  editor.className = 'day-shift-editor';

  const title = document.createElement('div');
  title.className = 'day-shift-editor-title';
  title.textContent = `${dayStr}/${monthKey.split('-')[1]}`;
  editor.appendChild(title);

  const slots = monthData[dayStr] ? [...monthData[dayStr].map((s) => ({ ...s }))] : [];

  function renderEditorSlots() {
    const slotsWrap = editor.querySelector('.day-shift-slots');
    if (slotsWrap) {
      slotsWrap.remove();
    }

    const wrap = document.createElement('div');
    wrap.className = 'day-shift-slots';

    for (let i = 0; i < slots.length; i++) {
      const slotRow = document.createElement('div');
      slotRow.className = 'day-shift-slot-row';

      const startIn = document.createElement('input');
      startIn.type = 'time';
      startIn.className = 'time-slot-input';
      startIn.value = slots[i].start;
      startIn.addEventListener('change', () => {
        slots[i].start = startIn.value;
      });

      const endIn = document.createElement('input');
      endIn.type = 'time';
      endIn.className = 'time-slot-input';
      endIn.value = slots[i].end;
      endIn.addEventListener('change', () => {
        slots[i].end = endIn.value;
      });

      const rmBtn = document.createElement('button');
      rmBtn.className = 'btn btn--danger btn--small';
      rmBtn.textContent = '\u00d7';
      rmBtn.addEventListener('click', () => {
        slots.splice(i, 1);
        renderEditorSlots();
      });

      slotRow.append(startIn, endIn, rmBtn);
      wrap.appendChild(slotRow);
    }

    const addSlot = document.createElement('button');
    addSlot.className = 'btn btn--secondary btn--small';
    addSlot.textContent = '+';
    addSlot.addEventListener('click', () => {
      slots.push({ start: '09:00', end: '17:00' });
      renderEditorSlots();
    });
    wrap.appendChild(addSlot);

    editor.insertBefore(wrap, editor.querySelector('.day-shift-actions'));
  }

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'day-shift-actions';

  const noShiftLabel = typeof t === 'function' ? t('settings.work_shift_no_shift') : 'Off';

  const offBtn = document.createElement('button');
  offBtn.className = 'btn btn--secondary btn--small';
  offBtn.textContent = noShiftLabel;
  offBtn.addEventListener('click', () => {
    delete monthData[dayStr];
    onChange({ ...monthData });
    editor.remove();
    gridContainer.replaceWith(createVariableMonthGrid(monthKey, monthData, onChange));
  });

  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn btn--primary btn--small';
  saveBtn.textContent = typeof t === 'function' ? t('common.save') : 'Save';
  saveBtn.addEventListener('click', () => {
    if (slots.length > 0) {
      monthData[dayStr] = slots.map((s) => ({ ...s }));
    } else {
      delete monthData[dayStr];
    }
    onChange({ ...monthData });
    editor.remove();
    gridContainer.replaceWith(createVariableMonthGrid(monthKey, monthData, onChange));
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'btn btn--secondary btn--small';
  cancelBtn.textContent = typeof t === 'function' ? t('common.cancel') : 'Cancel';
  cancelBtn.addEventListener('click', () => {
    editor.remove();
  });

  actionsDiv.append(offBtn, cancelBtn, saveBtn);
  editor.appendChild(actionsDiv);

  renderEditorSlots();
  gridContainer.appendChild(editor);
}
