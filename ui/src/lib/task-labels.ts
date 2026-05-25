export function parseTaskLabels(input: string) {
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const part of input.split(",")) {
    const label = part.trim();
    if (!label || seen.has(label)) {
      continue;
    }

    labels.push(label);
    seen.add(label);
  }

  return labels;
}

export function formatTaskLabels(labels: string[]) {
  return parseTaskLabels(labels.join(",")).join(", ");
}

export function taskLabelsEqual(left: string[], right: string[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((label, index) => label === right[index]);
}
