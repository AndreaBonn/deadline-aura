// @vitest-environment happy-dom
'use strict';

// The main process sends an update every minute. A form open on the task list must survive it:
// rebuilding the list would wipe what is being typed and re-enable a send still in flight.

const { loadSidebarPage, buildTask, findCard, chooseMenuItem } = require('./harness');

let page;
afterEach(() => {
  page.dispose();
  vi.useRealTimers();
});

const report = buildTask({ id: 't1', title: 'Write report' });
const other = buildTask({ id: 't2', title: 'Call client' });
const $ = (selector) => page.document.querySelector(selector);

async function load(tasks = [report, other], answers = {}) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  page = await loadSidebarPage({ answers });
  await page.update({ tasks });
  return page;
}

async function openTimeLog() {
  chooseMenuItem(findCard(page.document, 'Write report'), 'Registra tempo');
  await page.flush();
}

describe('a background update while a form is open', () => {
  it('keeps the values typed in the time log form', async () => {
    await load();
    await openTimeLog();
    $('.time-log-duration').value = '45';
    $('.time-log-calendar-select').value = 'work';

    await page.update({ tasks: [report, other] });

    expect($('.time-log-duration').value).toBe('45');
    expect($('.time-log-calendar-select').value).toBe('work');
  });

  it('keeps a send in flight disabled, so the time cannot be logged twice', async () => {
    await load([report, other], { logTimeToCalendar: () => new Promise(() => {}) });
    await openTimeLog();
    $('.time-log-calendar-select').value = 'work';
    $('.time-log-send').click();

    await page.update({ tasks: [report, other] });
    $('.time-log-send').click();

    expect($('.time-log-send').disabled).toBe(true);
    expect(page.bridge.callsTo('logTimeToCalendar')).toHaveLength(1);
  });

  it('keeps the title typed in the quick-add form', async () => {
    await load();
    $('.local-add-toggle').click();
    $('#quickAddTitle').value = 'Half typed';

    await page.update({ tasks: [report, other] });

    expect($('#quickAddTitle').value).toBe('Half typed');
  });

  it('shows the tasks that arrived meanwhile as soon as the form closes', async () => {
    await load();
    await openTimeLog();
    const added = buildTask({ id: 't3', title: 'New from sync' });

    await page.update({ tasks: [report, other, added] });
    expect(findCard(page.document, 'New from sync')).toBeNull();
    $('.time-log-form button[aria-label="Annulla"]').click();

    expect(findCard(page.document, 'New from sync')).not.toBeNull();
  });

  it('closes a form whose task left the list and renders the new list', async () => {
    await load();
    await openTimeLog();

    await page.update({ tasks: [other] });

    expect($('.time-log-form')).toBeNull();
    expect(findCard(page.document, 'Write report')).toBeNull();
    expect(findCard(page.document, 'Call client')).not.toBeNull();
  });

  it('still repaints the list when no form is open', async () => {
    await load();
    await page.update({ tasks: [other] });
    expect(findCard(page.document, 'Write report')).toBeNull();
  });
});

describe('one panel per card', () => {
  it('opening the time log closes the calendar picker of the timer, and vice versa', async () => {
    await load();
    findCard(page.document, 'Write report').querySelector('.timer-play-btn').click();
    await page.flush();
    expect($('.timer-picker-form')).not.toBeNull();

    await openTimeLog();
    expect($('.timer-picker-form')).toBeNull();
    $('.time-log-form button[aria-label="Annulla"]').click();

    expect($('.timer-picker-form')).toBeNull();
    expect($('.time-log-form')).toBeNull();
  });
});

describe('a background update while the actions menu is open', () => {
  it('keeps the menu open under the pointer', async () => {
    await load();
    findCard(page.document, 'Write report').querySelector('.action-menu-wrap > .card-btn').click();

    await page.update({ tasks: [report, other] });

    const menu = findCard(page.document, 'Write report').querySelector('.action-menu');
    expect(menu.hidden).toBe(false);
  });

  it('does not freeze the list for a menu left open in a window without focus', async () => {
    await load();
    findCard(page.document, 'Write report').querySelector('.action-menu-wrap > .card-btn').click();
    vi.spyOn(page.document, 'hasFocus').mockReturnValue(false);

    await page.update({ tasks: [other] });

    expect(findCard(page.document, 'Write report')).toBeNull();
  });
});

describe('a form left open in a window without focus', () => {
  it('an untouched form does not freeze the list', async () => {
    await load();
    $('.local-add-toggle').click();
    vi.spyOn(page.document, 'hasFocus').mockReturnValue(false);

    await page.update({ tasks: [other] });

    expect(findCard(page.document, 'Write report')).toBeNull();
  });

  it('a draft typed before leaving the window survives the update', async () => {
    await load();
    $('.local-add-toggle').click();
    const title = $('#quickAddTitle');
    title.value = 'Copied from the browser';
    title.dispatchEvent(new page.win.Event('input', { bubbles: true }));
    vi.spyOn(page.document, 'hasFocus').mockReturnValue(false);

    await page.update({ tasks: [report, other] });

    expect($('#quickAddTitle').value).toBe('Copied from the browser');
  });
});
