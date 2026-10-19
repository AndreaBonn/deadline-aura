'use strict';

/* global t */
/* Date list and time-slot list controls of the work-shift tab. */

const MAX_TIME_SLOTS = 4;
const DEFAULT_SHIFT_SLOT = { start: '09:00', end: '17:00' };

function shiftText(key, fallback, params) {
  return typeof t === 'function' ? t(key, params) : fallback;
}

function createShiftButton(className, text, onClick) {
  const button = document.createElement('button');
  button.className = className;
  button.textContent = text;
  button.addEventListener('click', onClick);
  return button;
}

function tomorrowIsoDate() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const y = tomorrow.getFullYear();
  const m = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const d = String(tomorrow.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function buildDateRow(dates, index, onChange, render) {
  const row = document.createElement('div');
  row.className = 'date-list-row';
  const input = document.createElement('input');
  input.type = 'date';
  input.className = 'date-list-input';
  input.value = dates[index];
  input.addEventListener('change', () => {
    dates[index] = input.value;
    onChange([...dates]);
  });
  const removeBtn = createShiftButton('btn btn--danger btn--small', '×', () => {
    dates.splice(index, 1);
    onChange([...dates]);
    render();
  });
  row.append(input, removeBtn);
  return row;
}

function createDateList(dates, onChange) {
  const container = document.createElement('div');
  container.className = 'date-list';
  const currentDates = [...dates];

  function render() {
    container.innerHTML = '';
    currentDates.forEach((_, i) => {
      container.appendChild(buildDateRow(currentDates, i, onChange, render));
    });
    container.appendChild(
      createShiftButton(
        'btn btn--secondary btn--small',
        shiftText('settings.work_shift_add_holiday', '+ Add date'),
        () => {
          currentDates.push(tomorrowIsoDate());
          onChange([...currentDates]);
          render();
        },
      ),
    );
  }

  render();
  return container;
}

function buildSlotTimeInput(value, onValue) {
  const input = document.createElement('input');
  input.type = 'time';
  input.className = 'time-slot-input';
  input.value = value;
  input.addEventListener('change', () => onValue(input.value));
  return input;
}

function buildSlotRow(slots, index, onChange, render) {
  const snapshot = () => slots.map((s) => ({ ...s }));
  const row = document.createElement('div');
  row.className = 'time-slot-row';

  const label = document.createElement('span');
  label.className = 'time-slot-label';
  label.textContent = shiftText('settings.work_shift_slot_n', `Slot ${index + 1}`, {
    n: index + 1,
  });

  const startInput = buildSlotTimeInput(slots[index].start, (value) => {
    slots[index].start = value;
    onChange(snapshot());
  });
  const endInput = buildSlotTimeInput(slots[index].end, (value) => {
    slots[index].end = value;
    onChange(snapshot());
  });
  const removeBtn = createShiftButton('btn btn--danger btn--small', '×', () => {
    slots.splice(index, 1);
    onChange(snapshot());
    render();
  });
  removeBtn.disabled = slots.length <= 1;

  row.append(label, startInput, endInput, removeBtn);
  return row;
}

function createTimeSlotList(slots, onChange) {
  const container = document.createElement('div');
  container.className = 'time-slot-list';
  const current = slots.map((s) => ({ ...s }));

  function render() {
    container.innerHTML = '';
    current.forEach((_, i) => {
      container.appendChild(buildSlotRow(current, i, onChange, render));
    });
    if (current.length < MAX_TIME_SLOTS) {
      container.appendChild(
        createShiftButton(
          'btn btn--secondary btn--small',
          shiftText('settings.work_shift_add_slot', '+ Add slot'),
          () => {
            current.push({ ...DEFAULT_SHIFT_SLOT });
            onChange(current.map((s) => ({ ...s })));
            render();
          },
        ),
      );
    }
  }

  render();
  return container;
}

if (typeof module !== 'undefined') {
  module.exports = { createDateList, createTimeSlotList, MAX_TIME_SLOTS, DEFAULT_SHIFT_SLOT };
}
