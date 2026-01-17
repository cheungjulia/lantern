export const SUMMARY_PROMPT = `You are summarizing an introspective conversation. The user has reached an insight or "aha" moment.

Create a summary with these sections:

1. **Insights** - 3-5 bullet points capturing the key realizations, in the user's voice (use "I" statements)
2. **Suggested Links** - Based on the themes discussed, suggest 3-5 potential note titles that might exist in their vault that could be related (format as [[Note Title]])

Keep insights concise but meaningful. Each insight should be a complete thought.

Respond in this exact format:
INSIGHTS:
- [insight 1]
- [insight 2]
- [insight 3]

LINKS:
- [[Suggested Note 1]]
- [[Suggested Note 2]]
- [[Suggested Note 3]]`;

export function formatSummaryRequest(conversation: string): string {
  return `Here is the conversation to summarize:\n\n${conversation}\n\nPlease provide the summary.`;
}
