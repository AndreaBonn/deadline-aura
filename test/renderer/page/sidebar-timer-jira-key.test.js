// @vitest-environment happy-dom
'use strict';

const { loadSidebarPage, buildTask, findCard } = require('./harness');

let page;
afterEach(() => {
  page.dispose();
  vi.useRealTimers();
});

async function startWithManualKey(key, title) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  page = await loadSidebarPage();
  await page.update({ tasks: [buildTask({ id: 't1', title })] });

  findCard(page.document, title).querySelector('.timer-play-btn').click();
  await page.flush();
  const input = page.document.querySelector('.time-log-manual-key');
  input.value = key;
  input.dispatchEvent(new page.win.Event('input', { bubbles: true }));
  page.document.querySelector('.time-log-calendar-select').value = 'work';
  page.document.querySelector('.timer-start-btn').click();
  await page.flush();
}

describe('timer started with a manually entered Jira key', () => {
  it('logs the calendar event as "[KEY] - title", with the key once', async () => {
    await startWithManualKey('ABC-12', 'Fix login');

    const [[logged]] = page.bridge.callsTo('logTimeToCalendar');
    expect(logged.summary).toBe('[ABC-12] - Fix login');
  });

  it('keeps the plain title for a task without a key (paired positive case)', async () => {
    await startWithManualKey('', 'Fix login');

    const [[logged]] = page.bridge.callsTo('logTimeToCalendar');
    expect(logged.summary).toBe('Fix login');
  });
});
