'use strict';

/* global t, sidebarState, rerender, extractJiraKey, buildEventSummary,
   defaultLogStart, validateTimeLog, formatCountdown, createIconButton */

const DURATION_PRESETS_MIN = [15, 30, 60, 90];
const LOGGED_BADGE_MS = 3000;

function createTimeLogElement(tag, className, text) {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function createTimeLogOption(value, text) {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  return option;
}

function createJiraTaskSelect() {
  const select = createTimeLogElement('select', 'time-log-jira-select');
  select.setAttribute('aria-label', t('sidebar.select_jira_task'));
  select.appendChild(createTimeLogOption('', t('sidebar.select_jira_task')));
  const tasks = (sidebarState.lastTasks || []).filter((item) => item.source === 'jira');
  for (const task of tasks) {
    select.appendChild(createTimeLogOption(extractJiraKey(task.title) || '', task.title));
  }
  return select;
}

function bindJiraKeyInputs(select, input, onKeyChange) {
  function currentKey() {
    return input.value.trim().toUpperCase() || select.value || null;
  }
  select.addEventListener('change', function () {
    if (select.value) {
      input.value = '';
    }
    onKeyChange(currentKey());
  });
  input.addEventListener('input', function () {
    if (input.value.trim()) {
      select.value = '';
    }
    onKeyChange(currentKey());
  });
  return currentKey;
}

function createJiraKeyPicker(_task, onKeyChange) {
  const wrap = createTimeLogElement('div', 'jira-key-picker');
  const reveal = createTimeLogElement('button', 'time-log-link', t('sidebar.link_jira_optional'));
  reveal.type = 'button';
  const fields = document.createElement('div');
  fields.hidden = true;
  const select = createJiraTaskSelect();
  const orLabel = createTimeLogElement('div', 'time-log-or-label', t('sidebar.or_manual_code'));
  const input = createTimeLogElement('input', 'time-log-manual-key');
  input.type = 'text';
  input.placeholder = t('sidebar.manual_code_placeholder');
  input.setAttribute('aria-label', t('sidebar.or_manual_code'));
  const getKey = bindJiraKeyInputs(select, input, onKeyChange);
  reveal.addEventListener('click', function () {
    reveal.hidden = true;
    fields.hidden = false;
    select.focus();
  });
  fields.append(select, orLabel, input);
  wrap.append(reveal, fields);
  return { element: wrap, getKey };
}

function appendTimeLogSummary(form, task) {
  const key = extractJiraKey(task.title);
  const summary = createTimeLogElement(
    'div',
    'time-log-summary',
    buildEventSummary(key, task.title),
  );
  form.appendChild(summary);
  if (task.source === 'local' && !key) {
    const picker = createJiraKeyPicker(task, function (value) {
      summary.textContent = value ? '[' + value + '] - ' + task.title : task.title;
    });
    form.appendChild(picker.element);
  }
  return summary;
}

function createTimeLogInput(type, value) {
  const input = createTimeLogElement('input', 'time-log-' + type);
  input.type = type;
  input.value = value;
  return input;
}

function createTimeLogPresets(input) {
  const presets = createTimeLogElement('div', 'time-log-presets');
  function syncPresets() {
    presets.querySelectorAll('button').forEach(function (button) {
      const active = button.dataset.minutes === input.value;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  for (const minutes of DURATION_PRESETS_MIN) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.dataset.minutes = String(minutes);
    chip.textContent = minutes < 60 ? minutes + ' min' : formatCountdown(minutes / 60);
    chip.addEventListener('click', function () {
      input.value = String(minutes);
      syncPresets();
    });
    presets.appendChild(chip);
  }
  input.addEventListener('input', syncPresets);
  syncPresets();
  return presets;
}

function createTimeLogCalendarSelect() {
  const select = createTimeLogElement('select', 'time-log-calendar-select');
  select.appendChild(createTimeLogOption('', t('sidebar.select_calendar')));
  loadCalendarOptions(select);
  return select;
}

function appendTimeLogFields(form, idBase) {
  const start = defaultLogStart(new Date());
  const date = createTimeLogInput('date', start.slice(0, 10));
  const time = createTimeLogInput('time', start.slice(11));
  const row = createTimeLogElement('div', 'time-log-row');
  row.appendChild(createLabelledField(t('sidebar.label_day'), date, idBase + '-date'));
  row.appendChild(createLabelledField(t('sidebar.label_start'), time, idBase + '-time'));
  form.appendChild(row);
  const duration = createTimeLogInput('number', '60');
  duration.className = 'time-log-duration';
  duration.min = '15';
  duration.max = '480';
  duration.step = '15';
  const durationField = createLabelledField(
    t('sidebar.label_duration'),
    duration,
    idBase + '-duration',
  );
  durationField.appendChild(createTimeLogPresets(duration));
  form.appendChild(durationField);
  const calendar = createTimeLogCalendarSelect();
  form.appendChild(
    createLabelledField(t('sidebar.label_calendar'), calendar, idBase + '-calendar'),
  );
  return { date, time, duration, calendar };
}

function finishTimeLog(task, calendarId) {
  window.deadlineAura.setDefaultLogCalendar(calendarId);
  sidebarState.timeLogTaskId = null;
  sidebarState.temporaryLoggedTaskId = task.id;
  rerender();
  setTimeout(function () {
    sidebarState.temporaryLoggedTaskId = null;
    rerender();
  }, LOGGED_BADGE_MS);
}

function readTimeLogFields(fields, error) {
  error.clear();
  const values = validateTimeLog({
    duration: fields.duration.value,
    calendarId: fields.calendar.value,
    date: fields.date.value,
    time: fields.time.value,
  });
  if (values.error) {
    error.show(t(values.error));
    fields[values.field].focus();
    return null;
  }
  return values;
}

function submitTimeLog(task, fields, summary, controls) {
  const values = readTimeLogFields(fields, controls.error);
  if (!values) {
    return;
  }
  controls.send.disabled = true;
  controls.send.textContent = t('sidebar.logging');
  window.deadlineAura
    .logTimeToCalendar({
      summary: summary.textContent,
      startTime: values.startTime,
      durationMinutes: values.duration,
      calendarId: values.calendarId,
    })
    .then(function (result) {
      if (result.ok) {
        finishTimeLog(task, values.calendarId);
      } else {
        controls.send.disabled = false;
        controls.send.textContent = t('sidebar.log_time');
        controls.error.show(t('sidebar.log_failed', { error: result.error || '?' }));
      }
    });
}

function appendTimeLogActions(form, task, fields, summary) {
  const error = createFormError();
  const send = createTimeLogElement('button', 'time-log-send', t('sidebar.log_time'));
  send.type = 'button';
  const cancel = createIconButton({
    icon: 'close',
    label: t('common.cancel'),
    onClick: function () {
      sidebarState.timeLogTaskId = null;
      rerender();
    },
  });
  send.addEventListener('click', function () {
    submitTimeLog(task, fields, summary, { send, error });
  });
  const row = createTimeLogElement('div', 'time-log-row time-log-actions');
  row.append(send, cancel);
  form.append(row, error.element);
}

function createTimeLogForm(task) {
  const form = createTimeLogElement('div', 'time-log-form');
  const idBase = 'tl-' + String(task.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  form.appendChild(createTimeLogElement('div', 'time-log-header', t('sidebar.log_time_title')));
  const summary = appendTimeLogSummary(form, task);
  const fields = appendTimeLogFields(form, idBase);
  appendTimeLogActions(form, task, fields, summary);
  return form;
}

function createLabelledField(labelText, control, id) {
  const field = createTimeLogElement('div', 'time-log-field');
  const label = createTimeLogElement('label', 'time-log-label', labelText);
  label.htmlFor = id;
  control.id = id;
  field.appendChild(label);
  field.appendChild(control);
  return field;
}

function createFormError() {
  const error = createTimeLogElement('p', 'time-log-error');
  error.setAttribute('role', 'alert');
  error.hidden = true;
  return {
    element: error,
    show: function (message) {
      error.textContent = message;
      error.hidden = false;
    },
    clear: function () {
      error.hidden = true;
    },
  };
}

function loadCalendarOptions(selectEl) {
  if (sidebarState.cachedCalendars) {
    populateCalendarSelect(selectEl, sidebarState.cachedCalendars);
    return;
  }
  window.deadlineAura.listCalendars().then(function (result) {
    if (result.ok && result.calendars) {
      sidebarState.cachedCalendars = result.calendars;
      populateCalendarSelect(selectEl, result.calendars);
    }
  });
}

function populateCalendarSelect(selectEl, calendars) {
  selectEl.innerHTML = '';
  selectEl.appendChild(createTimeLogOption('', t('sidebar.select_calendar')));
  for (const calendar of calendars) {
    selectEl.appendChild(createTimeLogOption(calendar.id, calendar.summary));
  }
  window.deadlineAura.getDefaultLogCalendar().then(function (result) {
    if (result.ok && result.calendarId) {
      selectEl.value = result.calendarId;
    }
  });
}

if (typeof module !== 'undefined') {
  module.exports = { createTimeLogForm };
}
