/**
 * Working-memory retrieval query (T-MIG-060 tranche 1) — frozen source
 * @ 6cad6ef: KaRagService.retrievalQuery :550-577 + budgets :100-105,
 * line-against-line.
 *
 * Retrieval query for a conversational ask: the final question plus the most
 * recent turns' text, oldest material trimmed first so the question and the
 * immediately preceding exchange always survive. No labels — the KG
 * tokenizer and the embedding model both want plain content. With no history
 * this is the question verbatim (single-turn asks are unchanged).
 */

/** s139 budgets (KaRagService.java :104-105). */
export const RETRIEVAL_WINDOW_TURNS = 4;
export const RETRIEVAL_QUERY_MAX_CHARS = 1200;

export function retrievalQuery(
  question: string,
  history: ReadonlyArray<{ role: string; text: string }> | null,
): string {
  if (history == null || history.length === 0) return question;
  const parts: string[] = [];
  let used = question.length;
  const from = Math.max(0, history.length - RETRIEVAL_WINDOW_TURNS);
  for (let i = history.length - 1; i >= from; i--) {
    const turn = history[i];
    if (turn == null) continue;
    const text = turn.text.trim();
    if (text.length === 0) continue;
    if (used + text.length > RETRIEVAL_QUERY_MAX_CHARS && parts.length > 0) {
      break;
    }
    parts.push(text);
    used += text.length;
    if (used >= RETRIEVAL_QUERY_MAX_CHARS) break;
  }
  // collected newest-first; render oldest-first with the question last
  let out = "";
  for (let i = parts.length - 1; i >= 0; i--) {
    out += parts[i] + " ";
  }
  return (out + question).trim();
}
