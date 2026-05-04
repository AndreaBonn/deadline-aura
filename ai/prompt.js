'use strict';

function buildScoringPrompt(events) {
  const now = new Date().toISOString();

  const eventList = events
    .map((e, i) => {
      const parts = [`${i + 1}. "${e.title}"`];
      if (e.due_at) {
        parts.push(`due: ${new Date(e.due_at).toISOString()}`);
      }
      if (e.source) {
        parts.push(`source: ${e.source}`);
      }
      if (e.raw_json) {
        try {
          const raw = JSON.parse(e.raw_json);
          if (raw.description) {
            parts.push(`desc: ${raw.description.slice(0, 200)}`);
          }
          if (raw.location) {
            parts.push(`location: ${raw.location}`);
          }
          if (raw.start) {
            parts.push(`start: ${raw.start.dateTime || raw.start.date}`);
          }
          if (raw.end) {
            parts.push(`end: ${raw.end.dateTime || raw.end.date}`);
          }
          if (raw.organizer) {
            parts.push(`organizer: ${raw.organizer.email || raw.organizer.displayName}`);
          }
          if (raw.attendees) {
            parts.push(`attendees: ${raw.attendees.length}`);
          }
        } catch {
          // raw_json not parseable, skip extra fields
        }
      }
      return parts.join(' | ');
    })
    .join('\n');

  return `You are a clinical psychologist specializing in occupational stress assessment. Your framework combines Cognitive Load Theory (Sweller), Attention Residue research (Leroy), and decision fatigue literature (Baumeister). You assess real psychological impact, not surface-level busyness.

Current time: ${now}

SCHEDULE:
${eventList}

CALIBRATION ANCHORS (score the REAL psychological weight — underscoring is as wrong as inflating):
1-2: Genuinely light. 1-3 low-stakes items, long recovery gaps, no travel, no deadlines this week.
3-4: Manageable. A few meetings/tasks per day, single domain, no context-switching pressure. Most people feel "fine."
5-6: Moderate load. Multiple commitments daily, some context switching, but still has breathing room. End-of-day tiredness but recoverable overnight.
7-8: Heavy. Dense schedule across multiple days, travel (especially same-day return), multiple domains/clients/topics, emotional labor (teaching, presenting, evaluating). The person FEELS the weight — planning ahead, dreading the week, sleep may suffer. This is where most "busy weeks" actually land.
9-10: Crushing. Back-to-back high-stakes across 4+ days, travel + deadlines + social performance simultaneously, zero recovery windows, decision fatigue guaranteed. Burnout risk if repeated.

IMPORTANT CALIBRATION NOTES:
- Travel (flights, trains, connections) is NOT "passive time" — it fragments the day, adds logistical stress, removes recovery, and creates anxiety about delays. Score it 4-6 per travel segment depending on complexity.
- Teaching/lecturing requires PREPARATION time that isn't on the calendar. A 2h lecture = 4-6h cognitive commitment minimum.
- Multiple video calls in one day compound: each one after the 3rd adds +1 to the day's effective stress.
- Same-day multi-city travel (flight + train + meeting) is inherently 7+ regardless of what the meeting is about.
- A week with 3+ "heavy days" (stress >= 7) should have global_stress >= 7, because recovery deficit compounds across days.

EVALUATION DIMENSIONS:
1. Cognitive complexity per event: deep analytical work (high) vs routine meeting (low) vs passive attendance (minimal)
2. Context switching cost: each topic/client/domain transition costs ~23min recovery. Adjacent events in unrelated domains = compounding tax
3. Time architecture: gaps <20min between demanding tasks = no real recovery. Fragmented schedules (many short gaps) drain more than dense-but-blocked ones
4. Emotional labor: events requiring performance, conflict management, evaluation, or high-stakes decisions carry hidden load beyond their duration
5. Cumulative compounding: a moderate task after three demanding ones hits harder than the same task after rest. Score later events in context of what precedes them
6. Invisible patterns: sequences the person cannot see from inside — creative tasks clustered without breaks, all high-stakes items in one half-day, no transition buffers before important events

Respond with ONLY valid JSON, no markdown, no text before or after:
{
  "global_stress": <1-10 integer>,
  "daily_breakdown": [
    {
      "date": "YYYY-MM-DD",
      "stress": <1-10>,
      "peak_window": "HH:MM-HH:MM",
      "reasoning": "2-3 sentences: what compounds, where recovery is missing, what makes this day specifically heavy or light"
    }
  ],
  "per_event": [
    {
      "id": <event index number>,
      "stress": <1-10>,
      "category": "work-critical|work-routine|personal|admin",
      "cognitive_type": "analytical|creative|social|passive|administrative",
      "reasoning": "1-2 sentences: specific cognitive/emotional demand AND how it interacts with adjacent events"
    }
  ],
  "cognitive_factors": {
    "context_switching": "low|medium|high",
    "fragmentation": "low|medium|high",
    "emotional_load": "low|medium|high",
    "deep_work_ratio": <0.0-1.0>,
    "decision_fatigue_risk": "low|medium|high",
    "recovery_adequacy": "sufficient|marginal|insufficient"
  },
  "patterns": [
    "Specific invisible pattern with evidence, e.g.: 3 creative tasks consecutive 14:00-17:30 with no break — decision quality degrades after 2nd"
  ],
  "clinical_note": "1-3 sentences: what a psychologist would flag about this schedule — the one thing the person does not see but should know"
}`;
}

const VALID_CATEGORIES = new Set(['work-critical', 'work-routine', 'personal', 'admin']);
const VALID_COGNITIVE_TYPES = new Set([
  'analytical',
  'creative',
  'social',
  'passive',
  'administrative',
]);
const VALID_LEVELS = new Set(['low', 'medium', 'high']);
const VALID_ADEQUACY = new Set(['sufficient', 'marginal', 'insufficient']);

function parseAiResponse(text) {
  const cleaned = text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();

  const parsed = JSON.parse(cleaned);

  if (typeof parsed.global_stress !== 'number') {
    throw new Error('Missing or invalid global_stress');
  }

  parsed.global_stress = Math.max(1, Math.min(10, Math.round(parsed.global_stress)));

  if (Array.isArray(parsed.per_event)) {
    for (const event of parsed.per_event) {
      if (typeof event.stress === 'number') {
        event.stress = Math.max(1, Math.min(10, Math.round(event.stress)));
      } else {
        console.warn(`[ai] per_event id=${event.id} missing stress, defaulting to 5`);
        event.stress = 5;
      }
      if (event.category && !VALID_CATEGORIES.has(event.category)) {
        event.category = 'work-routine';
      }
      if (event.cognitive_type && !VALID_COGNITIVE_TYPES.has(event.cognitive_type)) {
        event.cognitive_type = 'passive';
      }
    }
  }

  if (Array.isArray(parsed.daily_breakdown)) {
    for (const day of parsed.daily_breakdown) {
      if (typeof day.stress === 'number') {
        day.stress = Math.max(1, Math.min(10, Math.round(day.stress)));
      }
    }
  }

  if (parsed.cognitive_factors) {
    const cf = parsed.cognitive_factors;
    for (const key of ['context_switching', 'fragmentation', 'emotional_load']) {
      if (cf[key] && !VALID_LEVELS.has(cf[key])) {
        cf[key] = 'medium';
      }
    }
    if (cf.decision_fatigue_risk && !VALID_LEVELS.has(cf.decision_fatigue_risk)) {
      cf.decision_fatigue_risk = 'medium';
    }
    if (cf.recovery_adequacy && !VALID_ADEQUACY.has(cf.recovery_adequacy)) {
      cf.recovery_adequacy = 'marginal';
    }
    if (typeof cf.deep_work_ratio === 'number') {
      cf.deep_work_ratio = Math.max(0, Math.min(1, cf.deep_work_ratio));
    }
  }

  if (!Array.isArray(parsed.patterns)) {
    parsed.patterns = [];
  }
  if (typeof parsed.clinical_note !== 'string') {
    parsed.clinical_note = '';
  }

  return parsed;
}

module.exports = {
  buildScoringPrompt,
  parseAiResponse,
  VALID_CATEGORIES,
  VALID_COGNITIVE_TYPES,
  VALID_LEVELS,
  VALID_ADEQUACY,
};
