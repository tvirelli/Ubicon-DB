import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

export const CATEGORIES = [
  'camera', 'doorbell', 'smart_lock', 'smart_plug', 'light', 'sensor',
  'thermostat', 'hvac', 'speaker', 'av', 'tv', 'game_console', 'computer',
  'phone', 'tablet', 'printer', '3d_printer', 'nas', 'network', 'appliance',
  'energy', 'vehicle', 'iot_hub', 'wearable', 'other',
];

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_ICON_BYTES = 51200;
const ALLOWED = new Set(['id', 'name', 'type', 'vendor', 'model', 'category', 'keywords', 'icon', 'contributor']);
const MAX_FIELD_LEN = 80;
const MAX_KEYWORDS = 20;
const MAX_KEYWORD_LEN = 40;
const MAX_CONTRIBUTOR_LEN = 60;

export function validateDevice(d, seenIds) {
  const errs = [];
  const where = d && d.id ? `device "${d.id}"` : 'device (no id)';
  if (!d || typeof d !== 'object') return ['record is not an object'];
  for (const k of Object.keys(d)) {
    if (!ALLOWED.has(k)) errs.push(`${where}: unknown property "${k}"`);
  }
  if (typeof d.id !== 'string' || !SLUG.test(d.id)) errs.push(`${where}: id must match ${SLUG}`);
  else if (seenIds.has(d.id)) errs.push(`${where}: duplicate id`);
  else seenIds.add(d.id);
  if (typeof d.name !== 'string' || !d.name.trim()) errs.push(`${where}: missing/empty "name"`);
  else if (d.name.length > MAX_FIELD_LEN) errs.push(`${where}: "name" exceeds ${MAX_FIELD_LEN} characters`);
  // vendor/model are required for real devices but omitted for generic ones;
  // validate them only when present.
  for (const f of ['vendor', 'model']) {
    if (!(f in d)) continue;
    if (typeof d[f] !== 'string' || !d[f].trim()) errs.push(`${where}: "${f}" must be a non-empty string when present`);
    else if (d[f].length > MAX_FIELD_LEN) errs.push(`${where}: "${f}" exceeds ${MAX_FIELD_LEN} characters`);
  }
  if ('type' in d && d.type !== 'real' && d.type !== 'generic') errs.push(`${where}: type must be "real" or "generic"`);
  if (!CATEGORIES.includes(d.category)) errs.push(`${where}: category must be one of the schema enum`);
  if (!Array.isArray(d.keywords) || d.keywords.some(k => typeof k !== 'string')) {
    errs.push(`${where}: keywords must be an array of strings`);
  } else {
    if (d.keywords.length > MAX_KEYWORDS) errs.push(`${where}: keywords exceeds ${MAX_KEYWORDS} items`);
    if (d.keywords.some(k => k.length > MAX_KEYWORD_LEN)) errs.push(`${where}: a keyword exceeds ${MAX_KEYWORD_LEN} characters`);
  }
  if (typeof d.icon !== 'string' || !/^icons\/[a-z0-9-]+\.png$/.test(d.icon)) {
    errs.push(`${where}: icon must be "icons/<slug>.png"`);
  } else if (d.id && d.icon !== `icons/${d.id}.png`) {
    errs.push(`${where}: icon filename must match the device id`);
  }
  if ('contributor' in d) {
    if (typeof d.contributor !== 'string' || !d.contributor.trim()) {
      errs.push(`${where}: "contributor" must be a non-empty string`);
    } else if (d.contributor.length > MAX_CONTRIBUTOR_LEN) {
      errs.push(`${where}: "contributor" exceeds ${MAX_CONTRIBUTOR_LEN} characters`);
    }
  }
  return errs;
}

export function pngInfo(buf) {
  const MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length < 24 || !buf.subarray(0, 8).equals(MAGIC)) {
    return { ok: false, reason: 'not a PNG' };
  }
  return { ok: true, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

// Reads enough of a PNG to say whether it can be transparent (an alpha
// channel, or a tRNS chunk) and whether its four corner pixels actually
// are. Icons are cutouts on a transparent background, so opaque corners
// mean the background was baked in. Non-interlaced 8-bit and 16-bit PNGs
// of every colour type are decoded; interlaced files are refused with a
// message that says how to re-save.
export function pngTransparency(buf) {
  const info = pngInfo(buf);
  if (!info.ok) return { ok: false, reason: info.reason };
  const { width, height } = info;
  const bitDepth = buf[24], colorType = buf[25], interlace = buf[28];
  if (interlace !== 0) return { ok: false, reason: 'interlaced PNG; re-save without interlacing (Adam7)' };
  if (bitDepth !== 8 && bitDepth !== 16) return { ok: false, reason: `${bitDepth}-bit PNG; re-save as 8-bit` };
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) return { ok: false, reason: `unknown PNG colour type ${colorType}` };
  let pos = 8;
  const idat = [];
  let trns = null;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IDAT') idat.push(data);
    else if (type === 'tRNS') trns = data;
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const hasAlpha = colorType === 4 || colorType === 6 || trns !== null;
  if (!hasAlpha) return { ok: true, hasAlpha: false, opaqueCorners: 4 };
  let raw;
  try { raw = zlib.inflateSync(Buffer.concat(idat)); } catch (e) { return { ok: false, reason: `PNG image data does not inflate (${e.message})` }; }
  const bytesPerSample = bitDepth / 8;
  const bpp = channels * bytesPerSample;
  const stride = width * bpp;
  if (raw.length < (stride + 1) * height) return { ok: false, reason: 'PNG image data is truncated' };
  // Undo the per-row filters (PNG filter types 0 to 4).
  const out = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      else if (f !== 0) return { ok: false, reason: `PNG row ${y} uses unknown filter ${f}` };
      cur[i] = v & 0xff;
    }
    prev = cur;
  }
  const alphaAt = (x, y) => {
    const base = y * stride + x * bpp;
    if (colorType === 6) return out[base + 3 * bytesPerSample];
    if (colorType === 4) return out[base + 1 * bytesPerSample];
    if (colorType === 3) { const idx = out[base]; return trns && idx < trns.length ? trns[idx] : 255; }
    // Grey or RGB with a tRNS colour key: that one colour is transparent.
    if (!trns) return 255;
    if (colorType === 0) return out[base] === trns[1] ? 0 : 255;
    return (out[base] === trns[1] && out[base + bytesPerSample] === trns[3] && out[base + 2 * bytesPerSample] === trns[5]) ? 0 : 255;
  };
  const corners = [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
  const opaqueCorners = corners.filter(([x, y]) => alphaAt(x, y) === 255).length;
  return { ok: true, hasAlpha: true, opaqueCorners };
}

export function validateRepo(rootDir) {
  const errors = [];
  const devices = [];
  const seenIds = new Set();
  const referencedIcons = new Set();
  const devDir = path.join(rootDir, 'devices');
  const iconDir = path.join(rootDir, 'icons');

  for (const file of fs.existsSync(devDir) ? fs.readdirSync(devDir).sort() : []) {
    if (!file.endsWith('.json')) { errors.push(`devices/${file}: not a .json file`); continue; }
    let arr;
    try { arr = JSON.parse(fs.readFileSync(path.join(devDir, file), 'utf8')); }
    catch (e) { errors.push(`devices/${file}: invalid JSON (${e.message})`); continue; }
    if (!Array.isArray(arr)) { errors.push(`devices/${file}: must be a JSON array`); continue; }
    for (const d of arr) {
      const errs = validateDevice(d, seenIds).map(e => `devices/${file}: ${e}`);
      errors.push(...errs);
      if (errs.length === 0) { devices.push(d); referencedIcons.add(path.basename(d.icon)); }
    }
  }
  for (const iconName of referencedIcons) {
    const p = path.join(iconDir, iconName);
    if (!fs.existsSync(p)) { errors.push(`icons/${iconName}: referenced but missing`); continue; }
    const buf = fs.readFileSync(p);
    const info = pngInfo(buf);
    if (!info.ok) errors.push(`icons/${iconName}: ${info.reason}`);
    else if (info.width !== 128 || info.height !== 128) errors.push(`icons/${iconName}: must be 128x128 (got ${info.width}x${info.height})`);
    if (buf.length > MAX_ICON_BYTES) errors.push(`icons/${iconName}: ${buf.length} bytes exceeds ${MAX_ICON_BYTES}`);
    if (info.ok) {
      const t = pngTransparency(buf);
      if (!t.ok) errors.push(`icons/${iconName}: ${t.reason}`);
      else if (!t.hasAlpha) errors.push(`icons/${iconName}: has no alpha channel; export as PNG with a transparent background`);
      else if (t.opaqueCorners === 4) errors.push(`icons/${iconName}: background is not transparent (all four corners are opaque); cut the device out and export with a transparent background`);
    }
  }
  for (const f of fs.existsSync(iconDir) ? fs.readdirSync(iconDir) : []) {
    if (!referencedIcons.has(f)) errors.push(`icons/${f}: orphan (no device references it)`);
  }
  return { errors, devices };
}

export function buildIndex(rootDir, opts = {}) {
  const { errors, devices } = validateRepo(rootDir);
  const blocking = opts.skipIconChecks ? errors.filter(e => !e.startsWith('icons/')) : errors;
  if (blocking.length) throw new Error('repo invalid:\n' + blocking.join('\n'));
  const projected = devices.map(d => {
    const out = {};
    for (const k of ALLOWED) if (k in d) out[k] = d[k];
    return out;
  });
  projected.sort((a, b) => a.id.localeCompare(b.id));
  return { schema: 1, generatedAt: new Date().toISOString(), count: projected.length, devices: projected };
}
