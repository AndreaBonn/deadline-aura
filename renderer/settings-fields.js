'use strict';

/* eslint-disable no-unused-vars */
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
  if (min !== undefined) { input.min = min; }
  if (max !== undefined) { input.max = max; }
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
    if ((opt.value || opt) === value) { o.selected = true; }
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

function createTagInput(values, { placeholder = 'Aggiungi...' } = {}, onChange) {
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
