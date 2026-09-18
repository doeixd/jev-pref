// Jev's hard input ceiling covers the complete serialized request, including
// review state and questions. Tokenization varies by content, so keep a
// conservative character guard in addition to review's smaller diff budget.
export const JEV_INPUT_TOKEN_LIMIT = 30000;
export const SAFE_SERIALIZED_INPUT_CHARS = 60000;

export function serializedInputChars(state, questions) {
  return JSON.stringify({ state, questions }).length;
}
