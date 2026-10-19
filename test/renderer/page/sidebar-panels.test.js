// @vitest-environment happy-dom
'use strict';

const { loadSidebarPage, buildTask, findCard, chooseMenuItem } = require('./harness');

const TIMER_KEY = 'deadlineaura_active_timer';
const LOGGED_BADGE_MS = 3000;
const MALICIOUS_TITLE = '<img src=x onerror=alert(1)>';

let page;
afterEach(() => {
  page.dispose();
  vi.useRealTimers();
});

async function load(options = {}, tasks = [buildTask({ id: 't1', title: 'Write report' })]) {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  page = await loadSidebarPage(options);
  await page.update({ tasks });
  return page;
}

const $ = (selector) => page.document.querySelector(selector);

function breakdownPayload(driver) {
  return {
    breakdown: {
      ai: { fresh: true, global_stress: 7 },
      mechanical: {
        score: 0.4,
        reason_key: 'deadlines',
        volume_amp_applied: false,
        ooo_filtered_count: 0,
      },
      blend: { ai_weight: 0.6, mechanical_weight: 0.4 },
      global_score: 0.58,
      top_drivers: [
        { source: 'jira', hours_remaining: 5, ai_stress: 7, urgency_score: 0.8, ...driver },
      ],
    },
  };
}

describe('time log form', () => {
  async function openForm() {
    await load();
    chooseMenuItem(findCard(page.document, 'Write report'), 'Registra tempo');
    await page.flush();
    return {
      date: $('.time-log-date'),
      time: $('.time-log-time'),
      duration: $('.time-log-duration'),
      calendar: $('.time-log-calendar-select'),
      send: $('.time-log-send'),
      error: $('.time-log-error'),
    };
  }

  it('lists the calendars returned by the main process', async () => {
    const form = await openForm();

    expect([...form.calendar.options].map((o) => [o.value, o.textContent])).toEqual([
      ['', 'Seleziona calendario...'],
      ['work', 'Work'],
    ]);
    expect(form.error.hidden).toBe(true);
  });

  it.each(['0', ''])('rejects the duration %j with a visible error and no IPC', async (value) => {
    const form = await openForm();
    form.duration.value = value;
    form.calendar.value = 'work';

    form.send.click();

    expect(form.error.hidden).toBe(false);
    expect(form.error.textContent).toBe('Indica quanti minuti registrare.');
    expect(page.bridge.callsTo('logTimeToCalendar')).toEqual([]);
  });

  it('asks for a calendar before sending', async () => {
    const form = await openForm();

    form.send.click();

    expect(form.error.textContent).toBe('Scegli il calendario su cui scrivere.');
    expect(page.bridge.callsTo('logTimeToCalendar')).toEqual([]);
  });

  it('logs the typed start, duration and calendar, then shows the logged badge for 3 s', async () => {
    const form = await openForm();
    form.date.value = '2026-11-05';
    form.time.value = '09:15';
    form.duration.value = '45';
    form.calendar.value = 'work';

    form.send.click();
    await page.flush();

    expect(page.bridge.callsTo('logTimeToCalendar')).toEqual([
      [
        {
          summary: 'Write report',
          startTime: new Date(2026, 10, 5, 9, 15).toISOString(),
          durationMinutes: 45,
          calendarId: 'work',
        },
      ],
    ]);
    expect(page.bridge.callsTo('setDefaultLogCalendar')).toEqual([['work']]);
    expect($('.time-log-form')).toBeNull();
    expect($('.task-logged').textContent).toBe('Tempo registrato');

    vi.advanceTimersByTime(LOGGED_BADGE_MS);
    expect($('.task-logged')).toBeNull();
  });

  it('keeps the form and shows the reason when the log fails', async () => {
    const form = await openForm();
    page.bridge.answer('logTimeToCalendar', { ok: false, error: 'boom' });
    form.calendar.value = 'work';

    form.send.click();
    await page.flush();

    expect(form.error.hidden).toBe(false);
    expect(form.error.textContent).toBe('Registrazione non riuscita: boom');
    expect(form.send.disabled).toBe(false);
    expect($('.task-logged')).toBeNull();
    expect(page.bridge.callsTo('setDefaultLogCalendar')).toEqual([]);
  });
});

describe('live timer', () => {
  const withCalendar = { answers: { getDefaultLogCalendar: { ok: true, calendarId: 'work' } } };

  it('starts: logs a 30 min event, shows the stop button and persists the timer', async () => {
    await load(withCalendar);

    findCard(page.document, 'Write report').querySelector('.timer-play-btn').click();
    await page.flush();

    const [[logged]] = page.bridge.callsTo('logTimeToCalendar');
    expect(logged).toMatchObject({
      summary: 'Write report',
      durationMinutes: 30,
      calendarId: 'work',
    });
    expect(Math.abs(Date.now() - new Date(logged.startTime).getTime())).toBeLessThan(5000);
    expect(page.bridge.callsTo('setDefaultLogCalendar')).toEqual([['work']]);
    expect($('.timer-stop-btn')).not.toBeNull();
    expect($('.timer-play-btn')).toBeNull();
    expect($('.active-timer-label').textContent).toBe('In Corso');
    expect(JSON.parse(page.win.localStorage.getItem(TIMER_KEY))).toEqual({
      taskId: 't1',
      startTime: logged.startTime,
      calendarId: 'work',
      eventId: 'event-1',
      summary: 'Write report',
    });
  });

  it('start with an IPC failure rolls back: no timer, play button back, nothing stored', async () => {
    await load({
      answers: {
        getDefaultLogCalendar: { ok: true, calendarId: 'work' },
        logTimeToCalendar: { ok: false, error: 'offline' },
      },
    });

    findCard(page.document, 'Write report').querySelector('.timer-play-btn').click();
    await page.flush();

    expect(page.bridge.callsTo('logTimeToCalendar')).toHaveLength(1);
    expect($('.timer-stop-btn')).toBeNull();
    expect($('.active-timer-label')).toBeNull();
    expect($('.timer-play-btn')).not.toBeNull();
    expect(page.win.localStorage.getItem(TIMER_KEY)).toBeNull();
    expect(page.bridge.callsTo('setDefaultLogCalendar')).toEqual([]);
  });

  it('stop closes the calendar event at the current time and clears the stored timer', async () => {
    await load(withCalendar);
    findCard(page.document, 'Write report').querySelector('.timer-play-btn').click();
    await page.flush();

    $('.timer-stop-btn').click();
    await page.flush();

    const [[update]] = page.bridge.callsTo('updateCalendarEvent');
    expect(update).toMatchObject({ calendarId: 'work', eventId: 'event-1' });
    expect(Math.abs(Date.now() - new Date(update.endTime).getTime())).toBeLessThan(5000);
    expect($('.timer-stop-btn')).toBeNull();
    expect(page.win.localStorage.getItem(TIMER_KEY)).toBeNull();
    expect($('.task-logged').textContent).toBe('Tempo registrato');
  });

  it('without a default calendar the play button opens a picker, which needs a calendar', async () => {
    await load();

    findCard(page.document, 'Write report').querySelector('.timer-play-btn').click();
    await page.flush();
    expect($('.timer-picker-form')).not.toBeNull();

    $('.timer-start-btn').click();

    expect($('.timer-picker-form .time-log-error').textContent).toBe(
      'Scegli il calendario su cui scrivere.',
    );
    expect(page.bridge.callsTo('logTimeToCalendar')).toEqual([]);
  });
});

describe('timer restored from localStorage', () => {
  const stored = {
    taskId: 't1',
    startTime: '2026-10-19T09:00:00.000Z',
    calendarId: 'work',
    eventId: 'event-1',
    summary: 'Write report',
  };

  it('resumes a valid stored timer on its task', async () => {
    await load({ storage: { [TIMER_KEY]: JSON.stringify(stored) } });

    expect($('.timer-stop-btn')).not.toBeNull();
    expect($('.active-timer-label').textContent).toBe('In Corso');
    expect($('.timer-elapsed').textContent).toMatch(/^\d\d:\d\d(:\d\d)?$/);
  });

  it.each(['{broken', 'null', '{}', '[]', '{"taskId":"t1"}'])(
    'ignores the corrupted value %s: no crash, no timer, entry cleaned up',
    async (raw) => {
      await load({ storage: { [TIMER_KEY]: raw } });

      expect($('.task-title').textContent).toBe('Write report');
      expect($('.timer-stop-btn')).toBeNull();
      expect($('.active-timer-label')).toBeNull();
      expect($('.timer-play-btn')).not.toBeNull();
      expect(page.win.localStorage.getItem(TIMER_KEY)).toBeNull();
    },
  );
});

describe('score breakdown', () => {
  async function openBreakdown(payload) {
    await load({ answers: { getScoreBreakdown: payload } });
    $('#scoreHelpBtn').click();
    await page.flush();
    return $('#scoreBreakdownPanel');
  }

  it('shows a hostile task title as text, never as an element', async () => {
    const panel = await openBreakdown(breakdownPayload({ title: MALICIOUS_TITLE }));

    expect(panel.hidden).toBe(false);
    // Positive pair: the driver row is rendered and carries the title verbatim as text.
    expect(panel.querySelector('.breakdown-driver-title').textContent).toBe(MALICIOUS_TITLE);
    expect(panel.querySelectorAll('img')).toHaveLength(0);
    expect(page.document.querySelectorAll('img')).toHaveLength(0);
  });

  it('opens the exact link of a driver even when it contains quotes', async () => {
    const url = 'https://example.com/?a="b';
    const panel = await openBreakdown(breakdownPayload({ title: 'Driver', web_url: url }));

    panel.querySelector('.breakdown-open').click();

    expect(page.bridge.callsTo('openLink')).toEqual([[url]]);
  });

  it('a second click hides the panel', async () => {
    const panel = await openBreakdown(breakdownPayload({ title: 'Driver' }));

    $('#scoreHelpBtn').click();

    expect(panel.hidden).toBe(true);
  });

  it('shows the unavailable message when the breakdown cannot be loaded', async () => {
    const panel = await openBreakdown(() => {
      throw new Error('ipc down');
    });

    expect(panel.querySelector('.breakdown-empty').textContent).toBe('Breakdown non disponibile');
  });
});

describe('meeting flyby state', () => {
  // The icon is first painted before the translations arrive; the 1 s clock tick then
  // refreshes labels and state text, so the tests wait for one tick like a user would.
  const ONE_CLOCK_TICK_MS = 1000;
  const loadAndTick = async (options) => {
    await load(options);
    vi.advanceTimersByTime(ONE_CLOCK_TICK_MS);
  };

  it('shows a snoozed flyby as suspended with the reactivate entry', async () => {
    await loadAndTick({
      answers: { getFlybyState: { enabled: true, snoozed_until: Date.now() + 3600 * 1000 } },
    });

    expect($('#flybyToggle').classList.contains('is-snoozed')).toBe(true);
    expect($('#flybyToggle').getAttribute('aria-label')).toBe('Avvisi call sospesi');
    expect($('.flyby-menu-item--reactivate').hidden).toBe(false);
    expect($('#flybyMenuState').textContent).toMatch(/^Sospeso fino a /);
  });

  it('shows a disabled flyby as switched off', async () => {
    await loadAndTick({ answers: { getFlybyState: { enabled: false, snoozed_until: null } } });

    expect($('#flybyToggle').classList.contains('is-snoozed')).toBe(true);
    expect($('#flybyMenuState').textContent).toBe('Spento finché non lo riattivi');
  });

  it('shows an active flyby as normal, with nothing to reactivate', async () => {
    await loadAndTick();

    expect($('#flybyToggle').classList.contains('is-snoozed')).toBe(false);
    expect($('#flybyToggle').getAttribute('aria-label')).toBe('Avvisi call attivi');
    expect($('.flyby-menu-item--reactivate').hidden).toBe(true);
  });

  it('a menu entry sends its action to the main process', async () => {
    await load();

    $('.flyby-menu-item[data-action="snooze-3h"]').click();
    await page.flush();

    expect(page.bridge.callsTo('setFlybyState')).toEqual([['snooze-3h']]);
  });
});

describe('sync status', () => {
  it('shows "--" and no problem before the first sync', async () => {
    await load();

    expect($('#syncStatus').textContent).toBe('--');
    expect($('#syncProblem').hidden).toBe(true);
  });

  it('shows the update time and no problem when every source answered', async () => {
    await load({}, []);
    await page.update({ syncStatus: { at: Date.now(), failedSources: [] } });

    expect($('#syncStatus').textContent).toMatch(/^Aggiornato \S+/);
    expect($('#syncProblem').hidden).toBe(true);
  });

  it('names the sources that did not answer, and its button opens the settings', async () => {
    await load({}, []);
    await page.update({
      syncStatus: { at: Date.now(), failedSources: ['jira', 'google_calendar'] },
    });

    expect($('#syncProblem').hidden).toBe(false);
    expect($('#syncProblemText').textContent).toBe('Non risponde: Jira, Google Calendar');

    $('#syncProblemOpen').click();

    expect(page.bridge.callsTo('openConfig')).toEqual([[]]);
  });
});
