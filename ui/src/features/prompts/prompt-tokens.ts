export const promptTokenNames = [
  "TASK",
  "PARENT_TASK",
  "BOARD",
  "PROJECT",
] as const;

export type PromptTokenName = (typeof promptTokenNames)[number];

export type PromptTokenValues = Partial<Record<PromptTokenName, string>>;

// Built from the registry so adding a token means touching one list. Token
// names are bare `[A-Z_]` words, so they need no regex escaping.
const knownTokenPattern = new RegExp(
  `\\{\\{(${promptTokenNames.join("|")})\\}\\}`,
  "g",
);

// Tokens are exact and case-sensitive. A token with no value is replaced by
// its bare name (braces stripped) so it stays easy to spot and fill in by
// hand after pasting. Unknown {{...}} sequences pass through untouched.
export function renderPromptBody(body: string, values: PromptTokenValues) {
  return body.replace(
    knownTokenPattern,
    (_match, name: PromptTokenName) => values[name] ?? name,
  );
}

export function promptBodyTokens(body: string): PromptTokenName[] {
  const found = new Set<PromptTokenName>();
  for (const match of body.matchAll(knownTokenPattern)) {
    found.add(match[1] as PromptTokenName);
  }
  return promptTokenNames.filter((name) => found.has(name));
}
