'use strict';

/* global escapeHtml */
const escapeScoreHtml =
  typeof module !== 'undefined' ? require('./sidebar-utils').escapeHtml : escapeHtml;

const SOURCE_LABEL_KEYS = {
  gcal: 'sidebar.google_calendar',
  gtasks: 'sidebar.google_tasks',
  jira: 'sidebar.jira',
  local: 'sidebar.local',
  outlook: 'sidebar.outlook',
};

function formatHoursRemaining(hours, t) {
  if (hours === null || hours === undefined) {
    return '\u2014';
  }
  if (hours < 0) {
    return t('postit.expired');
  }
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return minutes < 60 ? `${minutes}m` : '1h';
  }
  if (hours < 24) {
    return `${Math.floor(hours)}h`;
  }
  return `${Math.round(hours / 24)}${t('countdown.days_short')}`;
}

function buildBreakdownSection(titleKey, bodyHtml, t) {
  return `
    <div class="breakdown-section">
      <div class="breakdown-section-title">${escapeScoreHtml(t(titleKey))}</div>
      ${bodyHtml}
    </div>
  `;
}

function buildBreakdownRow(labelKey, value, t, muted = false) {
  const mutedClass = muted ? ' breakdown-muted' : '';
  return `<div class="breakdown-row">
    <span class="breakdown-label">${escapeScoreHtml(t(labelKey))}</span>
    <span class="breakdown-value${mutedClass}">${escapeScoreHtml(value)}</span>
  </div>`;
}

function buildAiSection(breakdown, t) {
  const ai = breakdown.ai;
  if (!ai) {
    return buildBreakdownSection(
      'score_breakdown.ai_title',
      `<div class="breakdown-empty">${escapeScoreHtml(t('score_breakdown.ai_unavailable'))}</div>`,
      t,
    );
  }
  const weightPct = Math.round(breakdown.blend.ai_weight * 100);
  const freshness = ai.fresh
    ? ''
    : `<div class="breakdown-warning">${escapeScoreHtml(t('score_breakdown.ai_stale'))}</div>`;
  const formula = ai.fresh
    ? `<div class="breakdown-formula">${escapeScoreHtml(ai.global_stress)}/10 × ${weightPct}%</div>`
    : '';
  return buildBreakdownSection(
    'score_breakdown.ai_title',
    `${buildBreakdownRow('score_breakdown.ai_global', `${ai.global_stress}/10`, t)}
     ${buildBreakdownRow('score_breakdown.weight', `${weightPct}%`, t)}
     ${formula}
     ${freshness}`,
    t,
  );
}

function buildMechanicalSection(breakdown, t) {
  const mech = breakdown.mechanical;
  const weightPct = Math.round(breakdown.blend.mechanical_weight * 100);
  const reasonLabel = escapeScoreHtml(t(`score_breakdown.reason_${mech.reason_key}`));
  const ampValue = t(
    mech.volume_amp_applied ? 'score_breakdown.volume_amp_yes' : 'score_breakdown.volume_amp_no',
  );
  const ampLine = buildBreakdownRow(
    'score_breakdown.volume_amp',
    ampValue,
    t,
    !mech.volume_amp_applied,
  );
  const oooLine =
    mech.ooo_filtered_count > 0
      ? buildBreakdownRow('score_breakdown.ooo_filtered', mech.ooo_filtered_count, t)
      : '';
  return buildBreakdownSection(
    'score_breakdown.mechanical_title',
    `${buildBreakdownRow('score_breakdown.score', mech.score.toFixed(2), t)}
     ${buildBreakdownRow('score_breakdown.weight', `${weightPct}%`, t)}
     ${ampLine}
     ${oooLine}
     <div class="breakdown-reason">${reasonLabel}</div>`,
    t,
  );
}

function buildTopDriversSection(breakdown, t) {
  if (!breakdown.top_drivers || breakdown.top_drivers.length === 0) {
    return '';
  }
  const rows = breakdown.top_drivers.map((driver) => buildDriverRow(driver, t)).join('');
  return buildBreakdownSection('score_breakdown.drivers_title', rows, t);
}

function buildDriverRow(d, t) {
  const sourceKey = SOURCE_LABEL_KEYS[d.source] || null;
  const sourceLabel = sourceKey ? t(sourceKey) : d.source;
  const aiTag =
    d.ai_stress !== null
      ? `<span class="breakdown-driver-ai">AI ${escapeScoreHtml(d.ai_stress)}/10</span>`
      : '';
  const eta = formatHoursRemaining(d.hours_remaining, t);
  const safeTitle = escapeScoreHtml(d.title);
  const openBtn = d.web_url
    ? `<button type="button" class="breakdown-open" data-url="${escapeScoreHtml(d.web_url)}">${escapeScoreHtml(t('score_breakdown.open'))}</button>`
    : '';
  return `
        <div class="breakdown-driver">
          <div class="breakdown-driver-main">
            <span class="breakdown-driver-title" title="${safeTitle}">${safeTitle}</span>
            <span class="breakdown-driver-urgency">${(d.urgency_score * 100).toFixed(0)}%</span>
          </div>
          <div class="breakdown-driver-meta">
            <span>${escapeScoreHtml(sourceLabel)}</span>
            <span>${escapeScoreHtml(eta)}</span>
            ${aiTag}
            ${openBtn}
          </div>
        </div>
      `;
}

// Plain-language reading of the score; the formula stays one click away.
function buildWhySection(breakdown, t) {
  const ai = breakdown.ai;
  const aiLine =
    ai && ai.fresh
      ? t('score_breakdown.ai_sentence', { n: ai.global_stress })
      : t('score_breakdown.ai_off_sentence');
  const reasonLine = t(`score_breakdown.reason_${breakdown.mechanical.reason_key}`);
  return buildBreakdownSection(
    'score_breakdown.why_title',
    `<p class="breakdown-plain">${escapeScoreHtml(aiLine)}</p>
     <p class="breakdown-plain">${escapeScoreHtml(reasonLine)}</p>`,
    t,
  );
}

function buildBlendFooter(breakdown, t) {
  const aiW = Math.round(breakdown.blend.ai_weight * 100);
  const mechW = Math.round(breakdown.blend.mechanical_weight * 100);
  const total = breakdown.global_score.toFixed(2);
  return `
    <div class="breakdown-footer">
      <span>${escapeScoreHtml(t('score_breakdown.total'))}</span>
      <span class="breakdown-footer-value">${total}</span>
      <span class="breakdown-footer-formula">(AI ${aiW}% + Mech ${mechW}%)</span>
    </div>
  `;
}

function buildScoreBreakdownHtml(payload, t) {
  if (!payload || !payload.breakdown) {
    return `<div class="breakdown-empty">${escapeScoreHtml(t('score_breakdown.unavailable'))}</div>`;
  }
  const { breakdown } = payload;
  return [
    buildTopDriversSection(breakdown, t),
    buildWhySection(breakdown, t),
    `<details class="breakdown-details">
       <summary>${escapeScoreHtml(t('score_breakdown.how_title'))}</summary>
       ${buildAiSection(breakdown, t)}
       ${buildMechanicalSection(breakdown, t)}
       ${buildBlendFooter(breakdown, t)}
     </details>`,
  ].join('');
}

if (typeof module !== 'undefined') {
  module.exports = {
    formatHoursRemaining,
    buildBreakdownSection,
    buildAiSection,
    buildMechanicalSection,
    buildTopDriversSection,
    buildWhySection,
    buildBlendFooter,
    buildScoreBreakdownHtml,
  };
}
