'use strict';

/* global t, _i18nReady, urgencyToColor */
const forecastUrgencyColor =
  typeof module !== 'undefined' ? require('./sidebar-utils').urgencyToColor : urgencyToColor;
const FORECAST_DAY_LIMIT = 5;
const FORECAST_MAX_STRESS = 10;

function stressToColor(stress) {
  const score = Math.max(0, Math.min(stress, FORECAST_MAX_STRESS)) / FORECAST_MAX_STRESS;
  return forecastUrgencyColor(score);
}

function buildForecastColumns(daily, { todayKey, locale }) {
  if (!daily || daily.length === 0) {
    return [];
  }
  const dateLocale = locale.includes('-') ? locale : 'it-IT';
  return daily.slice(0, FORECAST_DAY_LIMIT).map((day) => {
    const date = new Date(day.date + 'T00:00:00');
    const column = {
      label: date.toLocaleDateString(dateLocale, { weekday: 'short' }).slice(0, 3),
      value: `${day.stress * FORECAST_MAX_STRESS}%`,
      color: stressToColor(day.stress),
      isToday: day.date === todayKey,
    };
    if (day.reasoning) {
      column.title = day.reasoning;
    }
    return column;
  });
}

function createForecastColumn(column) {
  const col = document.createElement('div');
  col.className = 'forecast-col';

  const value = document.createElement('div');
  value.className = 'forecast-value';
  value.textContent = column.value;
  value.style.color = column.color;

  const labelEl = document.createElement('div');
  labelEl.className = 'forecast-label';
  labelEl.textContent = column.label;

  if (column.isToday) {
    col.classList.add('forecast-today');
  }

  if (column.title) {
    col.title = column.title;
  }

  col.appendChild(value);
  col.appendChild(labelEl);
  return col;
}

function renderStressForecast(dailyBreakdown) {
  const container = document.getElementById('stressForecast');
  if (!container) {
    return;
  }
  container.innerHTML = '';

  if (!dailyBreakdown || dailyBreakdown.length === 0) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'flex';

  const todayStr = new Date().toISOString().slice(0, 10);
  const rawLocale = _i18nReady ? t('meta.dateLocale') : 'it-IT';
  const columns = buildForecastColumns(dailyBreakdown, { todayKey: todayStr, locale: rawLocale });

  for (const column of columns) {
    container.appendChild(createForecastColumn(column));
  }
}

function renderClinicalNote(note) {
  const el = document.getElementById('clinicalNote');
  if (!el) {
    return;
  }
  if (!note) {
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  el.textContent = note;
}

// The toggle is shown only when there is a note or a forecast to open.
function updateAiNotesToggle(hasNote, hasForecast) {
  const btn = document.getElementById('aiNotesToggle');
  if (btn) {
    btn.hidden = !hasNote && !hasForecast;
  }
}

// Toggle the AI note and 5-day forecast with an explicit button.
function initAiNotesToggle() {
  const btn = document.getElementById('aiNotesToggle');
  const aiPanel = document.getElementById('aiNotesPanel');
  if (!btn || !aiPanel) {
    return;
  }
  btn.addEventListener('click', function () {
    const isExpanded = aiPanel.classList.toggle('expanded');
    btn.setAttribute('aria-expanded', String(isExpanded));
  });
}

if (typeof module !== 'undefined') {
  module.exports = {
    buildForecastColumns,
    stressToColor,
    renderStressForecast,
    renderClinicalNote,
    updateAiNotesToggle,
    initAiNotesToggle,
  };
}
