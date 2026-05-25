'use strict';

const MAX_TITLE_LENGTH = 150;
const MAX_DESCRIPTION_LENGTH = 200;
const MAX_FIELD_LENGTH = 100;

function sanitizeField(value, maxLength) {
  if (typeof value !== 'string') {
    return '';
  }
  return value
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function buildScoringPrompt(events, language = 'it') {
  const outputLanguage = language === 'en' ? 'English' : 'Italian';
  const now = new Date().toISOString();

  const calendarEvents = [];
  const backlogTasks = [];

  events.forEach((e, i) => {
    const title = sanitizeField(e.title, MAX_TITLE_LENGTH);
    const parts = [`${i + 1}. "${title}"`];
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
          parts.push(`desc: ${sanitizeField(raw.description, MAX_DESCRIPTION_LENGTH)}`);
        }
        if (raw.location) {
          parts.push(`location: ${sanitizeField(raw.location, MAX_FIELD_LENGTH)}`);
        }
        if (raw.start) {
          parts.push(`start: ${raw.start.dateTime || raw.start.date}`);
        }
        if (raw.end) {
          parts.push(`end: ${raw.end.dateTime || raw.end.date}`);
        }
        if (raw.organizer) {
          const org = raw.organizer.email || raw.organizer.displayName;
          parts.push(`organizer: ${sanitizeField(org, MAX_FIELD_LENGTH)}`);
        }
        if (raw.attendees) {
          parts.push(`attendees: ${raw.attendees.length}`);
        }
      } catch {
        // raw_json not parseable, skip extra fields
      }
    }
    const line = parts.join(' | ');
    if (e.source === 'gcal') {
      calendarEvents.push(line);
    } else {
      backlogTasks.push(line);
    }
  });

  const scheduleSections = [];
  if (calendarEvents.length > 0) {
    scheduleSections.push(`CALENDAR EVENTS (committed time blocks):\n${calendarEvents.join('\n')}`);
  }
  if (backlogTasks.length > 0) {
    scheduleSections.push(
      `BACKLOG TASKS (Jira, local — work pool, not concurrent obligations):\n${backlogTasks.join('\n')}`,
    );
  }
  const eventList = scheduleSections.join('\n\n');

  return `You are a work-life strategist who understands cognitive load, attention residue, and decision fatigue. You read schedules the way a coach reads game tape: noticing what works well, where energy leaks, and what small adjustments would make the biggest difference. You are honest about real weight but equally honest about when things are fine.

Current time: ${now}

SCHEDULE:
${eventList}

SOURCE WEIGHTING:
- CALENDAR EVENTS are the primary stress drivers. They are committed time blocks with real people waiting. Their density, spacing, and content determine the shape of the day.
- BACKLOG TASKS (Jira, local) are a pool of available work. Having 20 backlog items does NOT mean 20 things to do this week. Most will be done later. Score each backlog item individually by deadline proximity and complexity, but do NOT let backlog volume inflate global_stress. A person with 3 calendar events and 30 backlog tasks is NOT more stressed than someone with 8 back-to-back meetings and 2 backlog tasks.
- When computing global_stress, weight calendar event density and quality 3-4x more than backlog task count.

READING EVENT SIGNALS (use title, description, attendees, organizer to infer real weight):
- External attendees (domains different from the organizer) signal client-facing work: higher stakes, performance pressure, preparation needed.
- Keywords signaling urgency: "deadline", "release", "go-live", "review finale", "consegna", "demo", "presentazione", "escalation", "blocco", "critico", "urgente".
- Recurring topic across multiple events (same project/client name appearing 3+ times in the week) signals sustained focus on a single deliverable: this compounds pressure even if individual events are short.
- Events with many attendees (>5) often require more preparation and carry social performance load.
- 1-on-1 meetings are generally low stress unless the title or description suggests evaluation, feedback, or conflict.
- Events with video call links (Meet, Teams, Zoom) are active participation. Events without may be optional or informational.

CALIBRATION ANCHORS (accuracy matters in both directions - underscoring a hard week is as wrong as inflating a light one):
1-2: Restful. Few commitments, generous gaps between them, single domain. The schedule actively supports recovery. The person has margin to think, plan, or do nothing. This is a good week - acknowledge it.
3-4: Comfortable. A steady rhythm of meetings or tasks, mostly in one domain, with natural breaks. No rushing between commitments. The person can be present in each event without worrying about the next. Sustainable long-term.
5-6: Moderate. Multiple commitments daily with some context switching. Still has breathing room, but needs to be intentional about breaks. End-of-day tiredness that recovers overnight. A normal "working week" for most knowledge workers.
7-8: Heavy. Dense schedule across multiple days, possible travel, multiple domains or clients, emotional labor (teaching, presenting, evaluating). The weight is felt: the person plans ahead, thinks about the week before it starts. Sleep or downtime may be affected. Where most "really busy weeks" actually land.
9-10: Unsustainable. Back-to-back high-stakes across 4+ days, travel combined with deadlines and social performance, zero recovery windows. Decision quality degrades. Not a crisis if it happens once, but a clear signal if recurring.

CALIBRATION NOTES:
- Travel (flights, trains, connections) fragments the day and removes recovery. Score 4-6 per travel segment depending on complexity.
- Teaching/lecturing requires preparation time not on the calendar. A 2h lecture = 4-6h cognitive commitment minimum.
- Video calls compound: each one after the 3rd in a day adds +1 to effective load.
- Same-day multi-city travel (flight + train + meeting) is inherently 7+ regardless of meeting content.
- A week with 3+ days scoring >= 7 should have global_stress >= 7 due to compounding recovery deficit.

EVALUATION DIMENSIONS:
1. Cognitive complexity per event: deep analytical work (high) vs routine meeting (low) vs passive attendance (minimal)
2. Context switching cost: each topic/client/domain transition costs ~23min recovery. Adjacent events in unrelated domains = compounding tax
3. Time architecture: gaps <20min between demanding tasks = no real recovery. Fragmented schedules (many short gaps) drain more than dense-but-blocked ones
4. Emotional labor: events requiring performance, conflict management, evaluation, or high-stakes decisions carry hidden load beyond their duration
5. Cumulative compounding: a moderate task after three demanding ones hits harder than the same task after rest. Score later events in context of what precedes them
6. Schedule quality: well-placed breaks, similar topics grouped together, demanding work in peak-energy hours, buffer time before important events. Good scheduling deserves recognition.

Respond with ONLY valid JSON, no markdown, no text before or after:
{
  "global_stress": <1-10 integer>,
  "daily_breakdown": [
    {
      "date": "YYYY-MM-DD",
      "stress": <1-10>,
      "peak_window": "HH:MM-HH:MM",
      "reasoning": "2-3 sentences: what compounds, where recovery is missing, OR what makes this day well-structured and sustainable"
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
    "Notable pattern with evidence. Can be positive (good grouping, natural recovery gaps) or concerning (3 creative tasks consecutive with no break). Always cite specific times and events."
  ],
  "note": "Write in ${outputLanguage}. 2-3 sentences as a sharp, supportive colleague who understands how cognitive load works. ADAPT TONE TO THE ACTUAL SCORE: If global_stress <= 4, lead with what is working well in this schedule and why it supports good energy - only add a suggestion if something genuinely stands out. If global_stress 5-6, balance acknowledgment of the manageable load with one concrete observation about where a small tweak would help. If global_stress >= 7, focus on the specific pattern that makes this week heavy - name which events compound and where recovery is missing, then suggest one practical micro-adjustment (move X, add a buffer before Y, protect morning for Z). In ALL cases: be specific to THIS schedule, never generic. Never alarmist. Never patronizing. Think of a friend who is good at noticing things you miss about your own week."
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
  if (typeof parsed.note !== 'string') {
    parsed.note = parsed.clinical_note || '';
  }
  delete parsed.clinical_note;

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
