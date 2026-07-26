const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';

/**
 * Returns a short plain-English root-cause guess for an incident.
 * Falls back to a rule-based message if no GROQ_API_KEY is configured,
 * so the watcher works fully without any AI dependency.
 */
async function getRootCauseSummary(type, detail) {
  if (!GROQ_API_KEY) {
    return ruleBasedSummary(type, detail);
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a concise SRE assistant. In under 25 words, give a likely root cause and nothing else. No preamble.'
          },
          {
            role: 'user',
            content: `Incident type: ${type}. Detail: ${detail}`
          }
        ],
        max_tokens: 60,
        temperature: 0.3
      }),
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) return ruleBasedSummary(type, detail);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || ruleBasedSummary(type, detail);
  } catch {
    return ruleBasedSummary(type, detail);
  }
}

function ruleBasedSummary(type, detail) {
  if (type === 'DOWN') {
    return 'Likely cause: app process crashed or DB connection was lost. Auto-restart initiated.';
  }
  if (type === 'HIGH_LATENCY') {
    return 'Likely cause: DB query slowdown or resource contention on the app container.';
  }
  return 'Anomaly detected. Investigate container logs for details.';
}

module.exports = { getRootCauseSummary };
