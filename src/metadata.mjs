import exifr from 'exifr';

export function normalizeDate(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Date must use YYYY-MM-DD.');
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== value) throw new Error('Date is not a valid calendar date.');
  return value;
}

export async function captureDate(buffer) {
  try {
    // Keep camera-local capture dates: do not shift them into the server timezone.
    const tags = await exifr.parse(buffer, { pick: ['DateTimeOriginal', 'CreateDate'], reviveValues: false });
    for (const key of ['DateTimeOriginal', 'CreateDate']) {
      const match = String(tags?.[key] ?? '').match(/^(\d{4})[:-](\d{2})[:-](\d{2})[ T]\d{2}:\d{2}:\d{2}/);
      if (!match) continue;
      try { return normalizeDate(`${match[1]}-${match[2]}-${match[3]}`); } catch {}
    }
  } catch { /* Missing or malformed metadata does not invent a date. */ }
  return null;
}

const fields = ['name', 'location', 'description', 'alt', 'collection'];
export function normalizeFields(input = {}) {
  const result = {};
  for (const field of fields) {
    if (input[field] == null || input[field] === '') { result[field] = null; continue; }
    if (typeof input[field] !== 'string' || input[field].length > (field === 'description' ? 4000 : 500)) throw new Error(`Invalid ${field}.`);
    result[field] = input[field].trim() || null;
  }
  result.date = normalizeDate(input.date);
  return result;
}
