/* Theme tags on a timeline card stay on one line: the first ones that fit, then "+N" for the rest. */

/**
 * How many of the first tags fit on one line, leaving room for a "+N" tag when any themes are left out.
 * Always at least one tag when there are any (CSS shortens a single tag that is still too wide).
 * @param {number[]} widths widths of the tags that may be shown, in order
 * @param {number} total how many themes the word has in all (can be more than widths.length)
 * @param {number} avail width of the line
 * @param {number} gap space between two tags
 * @param {number} moreW width of the "+N" tag
 * @returns {number}
 */
export function fitTagCount(widths, total, avail, gap, moreW) {
  for (let k = widths.length; k > 1; k--) {
    let used = gap * (k - 1);
    for (let i = 0; i < k; i++) used += widths[i];
    if (used + (k < total ? gap + moreW : 0) <= avail) return k;
  }
  return widths.length ? 1 : 0;
}
