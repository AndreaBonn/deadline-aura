'use strict';

/* global t, buildMonthGridCells, shiftText, createShiftButton, DEFAULT_SHIFT_SLOT */
/* Month grid of the variable work-shift tab and the editor for a single day. */

const DAYS_PER_WEEK = 7;
const FALLBACK_DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function buildMonthTitle(monthKey) {
  const [yearStr, monthStr] = monthKey.split('-');
  const header = document.createElement('div');
  header.className = 'variable-month-header';
  header.textContent = new Date(Number(yearStr), Number(monthStr) - 1, 1).toLocaleDateString(
    typeof t === 'function' ? t('meta.dateLocale') : 'it-IT',
    { month: 'long', year: 'numeric' },
  );
  return header;
}

function buildDayHeaderRow() {
  const dayHeaders = document.createElement('div');
  dayHeaders.className = 'variable-grid-row variable-grid-header';
  for (let d = 1; d <= DAYS_PER_WEEK; d++) {
    const dayIdx = d % DAYS_PER_WEEK;
    const cell = document.createElement('div');
    cell.className = 'variable-grid-cell variable-grid-day-header';
    cell.textContent = shiftText(
      `settings.work_shift_day_short_${dayIdx}`,
      FALLBACK_DAY_NAMES[dayIdx],
    );
    dayHeaders.appendChild(cell);
  }
  return dayHeaders;
}

function buildDayCell(dayCell) {
  const cell = document.createElement('div');
  cell.className = 'variable-grid-cell';
  if (!dayCell) {
    cell.classList.add('variable-grid-empty');
    return cell;
  }
  const dayLabel = document.createElement('div');
  dayLabel.className = 'variable-grid-day-num';
  dayLabel.textContent = dayCell.day;
  cell.appendChild(dayLabel);
  if (dayCell.hasShift) {
    cell.classList.add('has-shift');
    const slotInfo = document.createElement('div');
    slotInfo.className = 'variable-grid-slot-info';
    slotInfo.textContent = dayCell.slots.map((s) => `${s.start}-${s.end}`).join(', ');
    cell.appendChild(slotInfo);
  }
  return cell;
}

function buildMonthRows(container, shiftMonth) {
  let row;
  buildMonthGridCells(shiftMonth.monthKey, shiftMonth.monthData).forEach((dayCell, index) => {
    if (index % DAYS_PER_WEEK === 0) {
      row = document.createElement('div');
      row.className = 'variable-grid-row';
      container.appendChild(row);
    }
    const cell = buildDayCell(dayCell);
    row.appendChild(cell);
    if (dayCell) {
      cell.addEventListener('click', () => {
        showDayShiftEditor(container, shiftMonth, dayCell.dayStr);
      });
    }
  });
}

function buildClearMonthActions(container, shiftMonth) {
  const { monthKey, monthData, onChange } = shiftMonth;
  const actions = document.createElement('div');
  actions.className = 'variable-month-actions';
  actions.appendChild(
    createShiftButton(
      'btn btn--danger btn--small',
      shiftText('settings.work_shift_clear_month', 'Clear month'),
      () => {
        for (const key of Object.keys(monthData)) {
          delete monthData[key];
        }
        onChange({ ...monthData });
        container.replaceWith(createVariableMonthGrid(monthKey, monthData, onChange));
      },
    ),
  );
  return actions;
}

function createVariableMonthGrid(monthKey, monthData, onChange) {
  const shiftMonth = { monthKey, monthData, onChange };
  const container = document.createElement('div');
  container.className = 'variable-month-grid';
  container.appendChild(buildMonthTitle(monthKey));
  container.appendChild(buildDayHeaderRow());
  buildMonthRows(container, shiftMonth);
  container.appendChild(buildClearMonthActions(container, shiftMonth));
  return container;
}

function buildEditorSlotRow(slots, index, rerender) {
  const row = document.createElement('div');
  row.className = 'day-shift-slot-row';
  for (const field of ['start', 'end']) {
    const input = document.createElement('input');
    input.type = 'time';
    input.className = 'time-slot-input';
    input.value = slots[index][field];
    input.addEventListener('change', () => {
      slots[index][field] = input.value;
    });
    row.appendChild(input);
  }
  row.appendChild(
    createShiftButton('btn btn--danger btn--small', '×', () => {
      slots.splice(index, 1);
      rerender();
    }),
  );
  return row;
}

function buildEditorSlots(slots, rerender) {
  const wrap = document.createElement('div');
  wrap.className = 'day-shift-slots';
  slots.forEach((_, i) => wrap.appendChild(buildEditorSlotRow(slots, i, rerender)));
  wrap.appendChild(
    createShiftButton('btn btn--secondary btn--small', '+', () => {
      slots.push({ ...DEFAULT_SHIFT_SLOT });
      rerender();
    }),
  );
  return wrap;
}

function buildEditorActions({ onOff, onCancel, onSave }) {
  const actions = document.createElement('div');
  actions.className = 'day-shift-actions';
  actions.append(
    createShiftButton(
      'btn btn--secondary btn--small',
      shiftText('settings.work_shift_no_shift', 'Off'),
      onOff,
    ),
    createShiftButton(
      'btn btn--secondary btn--small',
      shiftText('common.cancel', 'Cancel'),
      onCancel,
    ),
    createShiftButton('btn btn--primary btn--small', shiftText('common.save', 'Save'), onSave),
  );
  return actions;
}

function buildEditorTitle(shiftMonth, dayStr) {
  const title = document.createElement('div');
  title.className = 'day-shift-editor-title';
  title.textContent = `${dayStr}/${shiftMonth.monthKey.split('-')[1]}`;
  return title;
}

// Stores the day's slots (or clears the day), then swaps the grid for a fresh one.
function createDayCommit(gridContainer, shiftMonth, dayStr) {
  const { monthKey, monthData, onChange } = shiftMonth;
  return (nextSlots) => {
    if (nextSlots && nextSlots.length > 0) {
      monthData[dayStr] = nextSlots.map((s) => ({ ...s }));
    } else {
      delete monthData[dayStr];
    }
    onChange({ ...monthData });
    gridContainer.replaceWith(createVariableMonthGrid(monthKey, monthData, onChange));
  };
}

function showDayShiftEditor(gridContainer, shiftMonth, dayStr) {
  gridContainer.querySelector('.day-shift-editor')?.remove();
  const editor = document.createElement('div');
  editor.className = 'day-shift-editor';
  editor.appendChild(buildEditorTitle(shiftMonth, dayStr));

  const slots = shiftMonth.monthData[dayStr]
    ? shiftMonth.monthData[dayStr].map((s) => ({ ...s }))
    : [];
  const commit = createDayCommit(gridContainer, shiftMonth, dayStr);
  editor.appendChild(
    buildEditorActions({
      onOff: () => commit(null),
      onCancel: () => editor.remove(),
      onSave: () => commit(slots),
    }),
  );

  function renderEditorSlots() {
    editor.querySelector('.day-shift-slots')?.remove();
    editor.insertBefore(
      buildEditorSlots(slots, renderEditorSlots),
      editor.querySelector('.day-shift-actions'),
    );
  }
  renderEditorSlots();
  gridContainer.appendChild(editor);
}

if (typeof module !== 'undefined') {
  module.exports = { createVariableMonthGrid, showDayShiftEditor };
}
