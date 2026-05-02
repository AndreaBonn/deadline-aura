'use strict';

function buildScoringPrompt(events) {
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
            parts.push(`description: ${raw.description.slice(0, 200)}`);
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

  return `You are a cognitive load analyzer. Evaluate the following list of upcoming calendar events and tasks for a knowledge worker.

Current time: ${new Date().toISOString()}

Events/Tasks:
${eventList}

Analyze the HOLISTIC cognitive and psychological load. Consider:
- Context switching frequency (many different topics/clients = higher load)
- Cognitive complexity of each event (deep work vs routine meeting vs admin)
- Time fragmentation (many short gaps vs focused blocks)
- Emotional weight (performance reviews, client escalations, deadlines vs casual syncs)
- Cumulative pressure (dense schedule compounds stress)
- Type of work required (creative/analytical vs passive/attendance)

Respond with ONLY valid JSON, no markdown:
{
  "global_stress": <1-10>,
  "daily_breakdown": [
    { "date": "YYYY-MM-DD", "stress": <1-10>, "reasoning": "<brief>" }
  ],
  "per_event": [
    { "id": "<event id>", "stress": <1-10>, "category": "work-critical|work-routine|personal|admin", "reasoning": "<brief>" }
  ],
  "cognitive_factors": {
    "context_switching": "low|medium|high",
    "fragmentation": "low|medium|high",
    "emotional_load": "low|medium|high",
    "deep_work_ratio": <0.0-1.0>
  }
}`;
}

function parseAiResponse(text) {
  const cleaned = text
    .replace(/```json\n?/g, '')
    .replace(/```\n?/g, '')
    .trim();
  return JSON.parse(cleaned);
}

module.exports = { buildScoringPrompt, parseAiResponse };
