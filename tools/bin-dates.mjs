// Turns the bin pages' day labels (Today, Tomorrow, Wed 18...) into dates.
export const iso = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
function resolveLabel(label, today) {
  const m = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?\s+(\d{1,2})\b/.exec(label);
  if (!m) return null;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(m[1]);
  let best = null, dist = 99;
  for (let k = -14; k <= 14; k++) {
    const s = addDays(today, k), d = new Date(s + 'T00:00:00Z');
    if (d.getUTCDay() === wd && d.getUTCDate() === Number(m[2]) && Math.abs(k) < dist) { best = s; dist = Math.abs(k); }
  }
  return best;
}
/** day rows -> [{date, items}] using the explicit "Wed 18" labels to pin down which date "Today" is */
export function datesFor(days, today) {
  let base = null;
  days.some((d, k) => { const r = resolveLabel(d.label, today); if (r) { base = addDays(r, -k); return true; } return false; });
  base = base || today;
  return days.map((d, k) => {
    const low = d.label.toLowerCase();
    const date = low.includes('today') ? base : low.includes('tomorrow') ? addDays(base, 1) : (resolveLabel(d.label, today) || addDays(base, k));
    return { date, items: d.items };
  });
}

