/** Social previews show about 125 characters before truncating, so share cards stay within that. */
export const SHARE_SUMMARY_MAX = 125;

/** Collapses whitespace and trims text to `max` characters on a word boundary, ending with an ellipsis when cut. */
export function shareSummary(text: string | null | undefined, max = SHARE_SUMMARY_MAX): string | undefined {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return undefined;
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1).replace(/\s+\S*$/, '').replace(/[\s,;:.—–-]+$/, '');
  return `${cut}…`;
}
