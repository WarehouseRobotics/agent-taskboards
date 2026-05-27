export async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // The fallback still works in older browsers and stricter contexts.
    }
  }

  return copyTextWithInput(text);
}

function copyTextWithInput(text: string) {
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const selection = document.getSelection();
  const ranges = selection ? Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange()) : [];
  const input = document.createElement("input");

  input.type = "text";
  input.value = text;
  input.readOnly = true;
  input.style.position = "fixed";
  input.style.left = "-1000px";
  input.style.top = "-1000px";
  input.style.opacity = "0";
  document.body.append(input);
  input.focus({ preventScroll: true });
  input.select();
  input.setSelectionRange(0, text.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } catch {
    copied = false;
  } finally {
    input.remove();
    activeElement?.focus({ preventScroll: true });
    if (selection && ranges.length > 0) {
      selection.removeAllRanges();
      for (const range of ranges) {
        selection.addRange(range);
      }
    }
  }

  return copied;
}
