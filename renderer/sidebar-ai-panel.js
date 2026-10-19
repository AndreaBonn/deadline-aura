'use strict';

/* global urgencyToColor */
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

if (typeof module !== 'undefined') {
  module.exports = { buildForecastColumns, stressToColor };
}
