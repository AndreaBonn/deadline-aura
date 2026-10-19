'use strict';

/* global t, sidebarState, createTimeLogElement, createTimeLogOption */

// eslint-disable-next-line no-unused-vars -- called by sidebar-time-log.js (separate script)
function createTimeLogCalendarSelect() {
  const select = createTimeLogElement('select', 'time-log-calendar-select');
  select.appendChild(createTimeLogOption('', t('sidebar.select_calendar')));
  loadCalendarOptions(select);
  return select;
}

// The default calendar is a preference: failing to store it must not disturb the logged event.
// eslint-disable-next-line no-unused-vars -- called by sidebar-time-log.js (separate script)
function saveDefaultLogCalendar(calendarId) {
  Promise.resolve(window.deadlineAura.setDefaultLogCalendar(calendarId)).catch(function (err) {
    console.error('saving the default calendar failed:', err.message);
  });
}

// A failed list is logged, not cached: the next form asks again. No translated message exists
// for it yet, so the select simply keeps its placeholder.
function loadCalendarOptions(selectEl) {
  if (sidebarState.cachedCalendars) {
    populateCalendarSelect(selectEl, sidebarState.cachedCalendars);
    return;
  }
  window.deadlineAura.listCalendars().then(
    function (result) {
      if (result.ok && result.calendars) {
        sidebarState.cachedCalendars = result.calendars;
        populateCalendarSelect(selectEl, result.calendars);
      } else {
        console.error('calendar list failed:', result.error);
      }
    },
    function (err) {
      console.error('calendar list failed:', err.message);
    },
  );
}

function populateCalendarSelect(selectEl, calendars) {
  selectEl.innerHTML = '';
  selectEl.appendChild(createTimeLogOption('', t('sidebar.select_calendar')));
  for (const calendar of calendars) {
    selectEl.appendChild(createTimeLogOption(calendar.id, calendar.summary));
  }
  window.deadlineAura.getDefaultLogCalendar().then(
    function (result) {
      if (result.ok && result.calendarId) {
        selectEl.value = result.calendarId;
      }
    },
    function (err) {
      console.error('default calendar lookup failed:', err.message);
    },
  );
}
