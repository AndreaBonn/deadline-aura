// @vitest-environment happy-dom
'use strict';

const { loadSidebarPage, buildTask } = require('./harness');

let page;
afterEach(() => {
  page.dispose();
  vi.useRealTimers();
});

async function load(options = {}) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  page = await loadSidebarPage(options);
  await page.update({ tasks: [buildTask({ id: 't1', title: 'Write report' })] });
  return page;
}

const $ = (selector) => page.document.querySelector(selector);

describe('meeting flyby icon at page load', () => {
  it('is labelled and described as soon as the translations arrive, without a clock tick', async () => {
    await load({
      answers: { getFlybyState: { enabled: true, snoozed_until: Date.now() + 3600 * 1000 } },
    });

    expect($('#flybyToggle').getAttribute('aria-label')).toBe('Avvisi call sospesi');
    expect($('#flybyMenuState').textContent).toMatch(/^Sospeso fino a /);
  });

  it('shows a disabled flyby as switched off without a clock tick', async () => {
    await load({ answers: { getFlybyState: { enabled: false, snoozed_until: null } } });

    expect($('#flybyToggle').getAttribute('aria-label')).toBe('Avvisi call sospesi');
    expect($('#flybyMenuState').textContent).toBe('Spento finché non lo riattivi');
  });

  it('labels an active flyby as active without a clock tick', async () => {
    await load();

    expect($('#flybyToggle').getAttribute('aria-label')).toBe('Avvisi call attivi');
  });
});

describe('time log form when the IPC call rejects', () => {
  it('re-enables the send button and shows the reason, like a failed result', async () => {
    await load();
    const { chooseMenuItem, findCard } = require('./harness');
    chooseMenuItem(findCard(page.document, 'Write report'), 'Registra tempo');
    await page.flush();
    page.bridge.answer('logTimeToCalendar', () => {
      throw new Error('ipc down');
    });
    $('.time-log-calendar-select').value = 'work';

    $('.time-log-send').click();
    await page.flush();

    expect($('.time-log-send').disabled).toBe(false);
    expect($('.time-log-send').textContent).toBe('Registra tempo');
    expect($('.time-log-error').hidden).toBe(false);
    expect($('.time-log-error').textContent).toBe('Registrazione non riuscita: ipc down');
    expect($('.task-logged')).toBeNull();
  });
});
