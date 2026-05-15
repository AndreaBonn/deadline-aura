# ADR 003 — 70/30 blend of AI score and mechanical urgency score

**Date:** 2025
**Status:** Accepted

## Context

The urgency engine computes a global pressure score (0–1) used to set the wallpaper color, the sidebar urgency bar, and notification thresholds. Two scoring signals are available:

1. **Mechanical score** — deterministic, time-based: exponential decay `urgency = 1 - exp(-k * weight/hours)` with priority weights and a volume amplifier above 5 concurrent events.
2. **AI score** — non-deterministic, holistic: a language model (Groq/Gemini/OpenAI/Anthropic) evaluates the full event window using a clinical psychologist framework (Cognitive Load Theory + Attention Residue) and returns a `global_stress` value on a 1–10 scale.

## Decision

When a valid AI score is available (age < 12 hours, hash matches current events), blend:

```
global_score = 0.70 × ai_score_normalised + 0.30 × mechanical_score
```

Fall back to `mechanical_score` alone when AI scoring is unavailable or stale.

## Rationale

**Why not 100% AI?** The mechanical score is always available (zero latency, zero cost, zero failure modes). Giving AI 100% weight would make the widget non-functional when no API key is configured or all providers are down.

**Why not 100% mechanical?** The mechanical formula is blind to qualitative load: it treats a 30-minute dentist appointment the same as a 30-minute multi-stakeholder business review. The AI component captures context-switching cost, emotional load, and schedule fragmentation — factors that humans experience as stress but that timestamp-based formulas cannot model.

**Why 70/30?** The mechanical score uses a calibrated exponential with `k = 0.05` tuned to feel "right" at personal deadlines. At 70% weight, the AI score dominates perception while the mechanical baseline prevents the AI from returning implausibly low scores during genuinely busy periods. The 12-hour cache window means the AI score reflects the recent planning horizon, not real-time changes — the mechanical component handles the real-time sensitivity.

The 70/30 ratio was chosen empirically after testing with real workload data. It is configurable (not hardcoded) via `config.engine` if users want to adjust the balance.

## Trade-offs accepted

- The blended score can diverge from the AI score if a burst of new tasks arrives between AI recalculations. This is intentional — the mechanical component absorbs real-time sensitivity.
- LLM scores are not perfectly reproducible (temperature = 0.15 reduces variance but does not eliminate it). The 30% mechanical floor limits the impact of AI score variance on the final output.

## Alternatives considered

- **AI only** — rejected: unacceptable failure mode when no API key is configured.
- **Mechanical only** — rejected: misses qualitative load that users report as the primary stress driver.
- **Weighted average with user-tunable weights** — implemented: the weights are in `config.engine` and can be overridden.
