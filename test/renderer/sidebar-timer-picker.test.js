// @vitest-environment happy-dom
'use strict';

/* global createJiraKeyPicker, document, MouseEvent, window */

const {
  createTimerButton,
  createTimerCalendarPicker,
} = require('../../renderer/sidebar-timer-picker');

let state;
let controller;
let api;
let rerender;
let picker;
let formError;

function stubPage() {
  state = { activeTimer: null, timerPickerTaskId: null };
  controller = { start: vi.fn(), stop: vi.fn() };
  api = { getDefaultLogCalendar: vi.fn() };
  rerender = vi.fn();
  window.deadlineAura = api;
  picker = { element: document.createElement('div'), getKey: vi.fn().mockReturnValue(null) };
  formError = {
    element: document.createElement('p'),
    show: vi.fn(),
    clear: vi.fn(),
  };
  const element = (tag, className, text) =>
    Object.assign(document.createElement(tag), { className, textContent: text || '' });
  vi.stubGlobal('sidebarState', state);
  vi.stubGlobal('timerController', controller);
  vi.stubGlobal('rerender', rerender);
  vi.stubGlobal('t', (key) => key);
  vi.stubGlobal('formatElapsed', () => '12:34');
  vi.stubGlobal('extractJiraKey', (title) => (/^\[(\w+-\d+)\]/.exec(title) || [])[1] || null);
  vi.stubGlobal('createIcon', (name) => Object.assign(document.createElement('i'), { id: name }));
  vi.stubGlobal('createIconButton', ({ icon, label, className, onClick }) => {
    const btn = element('button', className || '');
    btn.dataset.icon = icon;
    btn.title = label;
    btn.addEventListener('click', onClick);
    return btn;
  });
  vi.stubGlobal(
    'createJiraKeyPicker',
    vi.fn(() => picker),
  );
  vi.stubGlobal('createLabelledField', (label, control, id) => {
    const wrap = element('div', 'field', label);
    control.id = id;
    wrap.appendChild(control);
    return wrap;
  });
  vi.stubGlobal('createFormError', () => formError);
  vi.stubGlobal('loadCalendarOptions', (select) => {
    select.appendChild(Object.assign(document.createElement('option'), { value: 'work' }));
    select.value = 'work';
  });
  vi.stubGlobal('createTimeLogElement', element);
}

beforeEach(stubPage);
afterEach(() => {
  vi.unstubAllGlobals();
  delete window.deadlineAura;
});

describe('createTimerButton', () => {
  const task = { id: 't1', title: 'Write', source: 'local' };

  it('renders the elapsed stop button for the running task and stops it on click', () => {
    state.activeTimer = { taskId: 't1', startTime: '2026-10-19T09:00:00.000Z' };
    const btn = createTimerButton(task);
    expect(btn.className).toBe('timer-stop-btn');
    expect(btn.getAttribute('aria-label')).toBe('sidebar.timer_stop');
    const elapsed = btn.querySelector('.timer-elapsed');
    expect(elapsed.textContent).toBe('12:34');
    expect(elapsed.dataset.taskId).toBe('t1');
    const click = new MouseEvent('click', { bubbles: true });
    const stop = vi.spyOn(click, 'stopPropagation');
    btn.dispatchEvent(click);
    expect(controller.stop).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalled();
  });

  it('starts the timer with the default calendar when one is saved', async () => {
    api.getDefaultLogCalendar.mockResolvedValue({ ok: true, calendarId: 'work' });
    createTimerButton(task).click();
    await vi.waitFor(() => expect(controller.start).toHaveBeenCalledWith(task, 'work'));
    expect(controller.stop).not.toHaveBeenCalled();
  });

  it('opens the calendar picker when no default calendar exists and closes it on the next click', async () => {
    api.getDefaultLogCalendar.mockResolvedValue({ ok: false });
    createTimerButton(task).click();
    await vi.waitFor(() => expect(state.timerPickerTaskId).toBe('t1'));
    expect(rerender).toHaveBeenCalledTimes(1);
    createTimerButton(task).click();
    await vi.waitFor(() => expect(state.timerPickerTaskId).toBeNull());
    expect(controller.start).not.toHaveBeenCalled();
  });

  it('stops the other running timer before starting this one', async () => {
    state.activeTimer = { taskId: 'other', startTime: '2026-10-19T09:00:00.000Z' };
    api.getDefaultLogCalendar.mockResolvedValue({ ok: true, calendarId: 'work' });
    const btn = createTimerButton(task);
    expect(btn.className).toBe('timer-play-btn disabled');
    btn.click();
    expect(controller.stop).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(controller.start).toHaveBeenCalledWith(task, 'work'));
  });
});

describe('createTimerCalendarPicker', () => {
  const startBtn = (form) => form.querySelector('.timer-start-btn');

  it('lists the calendars with an id derived from the task id and starts on the selection', () => {
    const task = { id: 'a/b c', title: 'Plain', source: 'jira' };
    const form = createTimerCalendarPicker(task);
    expect(form.querySelector('.time-log-header').textContent).toBe(
      'sidebar.timer_select_calendar',
    );
    expect(form.querySelector('select').id).toBe('tp-a_b_c-calendar');
    startBtn(form).click();
    expect(formError.clear).toHaveBeenCalled();
    expect(controller.start).toHaveBeenCalledWith(task, 'work');
  });

  it('asks for a calendar and does not start when none is selected', () => {
    const form = createTimerCalendarPicker({ id: 't', title: 'x', source: 'jira' });
    const select = form.querySelector('select');
    select.innerHTML = '';
    startBtn(form).click();
    expect(formError.show).toHaveBeenCalledWith('sidebar.error_calendar');
    expect(controller.start).not.toHaveBeenCalled();
  });

  it('offers a Jira key picker only for local tasks without a key and prefixes the title', () => {
    picker.getKey.mockReturnValue('ABC-12');
    const task = { id: 't', title: 'Fix', source: 'local' };
    const form = createTimerCalendarPicker(task);
    expect(form.contains(picker.element)).toBe(true);
    startBtn(form).click();
    expect(controller.start).toHaveBeenCalledWith(
      { id: 't', title: '[ABC-12] - Fix', source: 'local' },
      'work',
    );
    expect(task.title).toBe('Fix');
  });

  it.each([
    ['a local task that already has a key', { id: 't', title: '[ABC-1] Fix', source: 'local' }],
    ['a task from another source', { id: 't', title: 'Fix', source: 'jira' }],
  ])('skips the Jira key picker for %s', (_label, task) => {
    createTimerCalendarPicker(task);
    expect(createJiraKeyPicker).not.toHaveBeenCalled();
  });

  it('starts untouched when the picker returns no key', () => {
    const task = { id: 't', title: 'Fix', source: 'local' };
    startBtn(createTimerCalendarPicker(task)).click();
    expect(controller.start).toHaveBeenCalledWith(task, 'work');
  });

  it('cancel closes the picker and rerenders', () => {
    state.timerPickerTaskId = 't';
    const form = createTimerCalendarPicker({ id: 't', title: 'x', source: 'jira' });
    form.querySelector('[data-icon="close"]').click();
    expect(state.timerPickerTaskId).toBeNull();
    expect(rerender).toHaveBeenCalledTimes(1);
  });
});
