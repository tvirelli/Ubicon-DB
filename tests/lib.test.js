import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { CATEGORIES, validateDevice, pngInfo, validateRepo, buildIndex } from '../scripts/lib.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const good = () => ({
  id: 'lockly-smart-lock', name: 'Lockly Smart Lock', vendor: 'Lockly',
  model: 'PGD728F', category: 'smart_lock', keywords: ['deadbolt'],
  icon: 'icons/lockly-smart-lock.png',
});

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubdb-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('valid device passes', () => {
  assert.deepEqual(validateDevice(good(), new Set()), []);
});

test('bad slug, bad category, missing fields are reported', () => {
  const errs = validateDevice({ id: 'Bad Slug!', category: 'nope' }, new Set());
  assert.ok(errs.some(e => e.includes('id')));
  assert.ok(errs.some(e => e.includes('category')));
  assert.ok(errs.some(e => e.includes('name')));
});

test('duplicate id is reported', () => {
  const seen = new Set();
  validateDevice(good(), seen);
  const errs = validateDevice(good(), seen);
  assert.ok(errs.some(e => e.includes('duplicate')));
});

test('categories list is non-empty and contains smart_lock', () => {
  assert.ok(CATEGORIES.includes('smart_lock'));
});

test('schema category enum matches CATEGORIES', () => {
  const schemaPath = path.join(__dirname, '..', 'schema', 'device.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  assert.deepEqual(schema.properties.category.enum, CATEGORIES);
});

test('unknown property is rejected', () => {
  const errs = validateDevice({ ...good(), extra: 'nope' }, new Set());
  assert.ok(errs.some(e => e.includes('unknown property') && e.includes('extra')));
});

test('overlong name/vendor/model is rejected', () => {
  const errs = validateDevice({ ...good(), name: 'x'.repeat(81) }, new Set());
  assert.ok(errs.some(e => e.includes('name') && e.includes('80')));
});

test('too many or overlong keywords are rejected', () => {
  const tooMany = validateDevice({ ...good(), keywords: Array.from({ length: 21 }, (_, i) => `kw${i}`) }, new Set());
  assert.ok(tooMany.some(e => e.includes('keywords') && e.includes('20')));

  const tooLong = validateDevice({ ...good(), keywords: ['x'.repeat(41)] }, new Set());
  assert.ok(tooLong.some(e => e.includes('keyword') && e.includes('40')));
});

test('valid device with contributor passes', () => {
  assert.deepEqual(validateDevice({ ...good(), contributor: 'Jane Doe' }, new Set()), []);
});

test('overlong contributor is rejected', () => {
  const errs = validateDevice({ ...good(), contributor: 'x'.repeat(61) }, new Set());
  assert.ok(errs.some(e => e.includes('contributor') && e.includes('60')));
});

// 1x1 red PNG, 67 bytes
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64');

test('pngInfo reads dimensions and rejects non-png', () => {
  const info = pngInfo(PNG_1x1);
  assert.equal(info.ok, true);
  assert.equal(info.width, 1);
  assert.equal(info.height, 1);
  assert.equal(pngInfo(Buffer.from('not a png')).ok, false);
});

test('validateRepo catches missing icon file and wrong size', () => {
  withTempDir(dir => {
    fs.mkdirSync(path.join(dir, 'devices'));
    fs.mkdirSync(path.join(dir, 'icons'));
    fs.writeFileSync(path.join(dir, 'devices', 'lockly.json'),
      JSON.stringify([good()]));
    // icon missing entirely:
    let res = validateRepo(dir);
    assert.ok(res.errors.some(e => e.includes('lockly-smart-lock.png')));
    // icon present but 1x1 (not 128x128):
    fs.writeFileSync(path.join(dir, 'icons', 'lockly-smart-lock.png'), PNG_1x1);
    res = validateRepo(dir);
    assert.ok(res.errors.some(e => e.includes('128')));
  });
});

test('validateRepo flags orphan icons', () => {
  withTempDir(dir => {
    fs.mkdirSync(path.join(dir, 'devices'));
    fs.mkdirSync(path.join(dir, 'icons'));
    fs.writeFileSync(path.join(dir, 'icons', 'orphan.png'), PNG_1x1);
    const res = validateRepo(dir);
    assert.ok(res.errors.some(e => e.includes('orphan.png')));
  });
});

test('buildIndex throws when repo invalid', () => {
  withTempDir(dir => {
    fs.mkdirSync(path.join(dir, 'devices'));
    fs.mkdirSync(path.join(dir, 'icons'));
    fs.writeFileSync(path.join(dir, 'devices', 'lockly.json'), JSON.stringify([good()]));
    assert.throws(() => buildIndex(dir));
  });
});

test('buildIndex sorts by id and stamps metadata', () => {
  withTempDir(dir => {
    fs.mkdirSync(path.join(dir, 'devices'));
    const a = { ...good(), id: 'zz-last', icon: 'icons/zz-last.png' };
    const b = { ...good(), id: 'aa-first', icon: 'icons/aa-first.png' };
    fs.writeFileSync(path.join(dir, 'devices', 'x.json'), JSON.stringify([a, b]));
    const idx = buildIndex(dir, { skipIconChecks: true });
    assert.equal(idx.schema, 1);
    assert.equal(idx.count, 2);
    assert.deepEqual(idx.devices.map(d => d.id), ['aa-first', 'zz-last']);
    assert.ok(idx.generatedAt.includes('T'));
  });
});

test('buildIndex output devices contain only whitelisted keys', () => {
  withTempDir(dir => {
    fs.mkdirSync(path.join(dir, 'devices'));
    // A device with an unknown property never survives validation, so it can
    // never reach buildIndex's output; confirm that directly...
    fs.writeFileSync(path.join(dir, 'devices', 'x.json'), JSON.stringify([{ ...good(), extra: 'nope' }]));
    assert.throws(() => buildIndex(dir, { skipIconChecks: true }), /unknown property/);
  });

  // ...and separately confirm buildIndex projects each device through the
  // whitelist (defense in depth) rather than passing the parsed object through
  // verbatim: the output must contain exactly the allowed keys, no more.
  withTempDir(dir => {
    fs.mkdirSync(path.join(dir, 'devices'));
    fs.writeFileSync(path.join(dir, 'devices', 'x.json'), JSON.stringify([good()]));
    const idx = buildIndex(dir, { skipIconChecks: true });
    const ALLOWED = ['id', 'name', 'vendor', 'model', 'category', 'keywords', 'icon'];
    assert.deepEqual(Object.keys(idx.devices[0]).sort(), ALLOWED.slice().sort());
  });
});

test('buildIndex output includes contributor when present', () => {
  withTempDir(dir => {
    fs.mkdirSync(path.join(dir, 'devices'));
    fs.writeFileSync(path.join(dir, 'devices', 'x.json'),
      JSON.stringify([{ ...good(), contributor: 'Jane Doe' }]));
    const idx = buildIndex(dir, { skipIconChecks: true });
    assert.equal(idx.devices[0].contributor, 'Jane Doe');
  });
});

test('generic device without vendor/model passes', () => {
  const g = { id: 'generic-ip-camera', name: 'Generic IP Camera', type: 'generic', category: 'camera', keywords: ['camera'], icon: 'icons/generic-ip-camera.png' };
  assert.deepEqual(validateDevice(g, new Set()), []);
});

test('bad type value is reported; empty vendor when present is reported', () => {
  const errsType = validateDevice({ id: 'x', name: 'X', type: 'nope', category: 'other', keywords: [], icon: 'icons/x.png' }, new Set());
  assert.ok(errsType.some(e => e.includes('type')));
  const errsVendor = validateDevice({ id: 'y', name: 'Y', vendor: '  ', category: 'other', keywords: [], icon: 'icons/y.png' }, new Set());
  assert.ok(errsVendor.some(e => e.includes('vendor')));
});

// ---- transparency ----
// A tiny PNG encoder for fixtures: 8-bit, no interlace unless asked, one
// IDAT. pixels is an array of rows, each row an array of [r,g,b,a] or
// [r,g,b] depending on colorType (2 = RGB, 6 = RGBA).
import zlib from 'node:zlib';
function encodePng(pixels, { colorType = 6, interlace = 0 } = {}) {
  const height = pixels.length, width = pixels[0].length;
  const bpp = colorType === 6 ? 4 : 3;
  const raw = Buffer.alloc((width * bpp + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * bpp + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const px = pixels[y][x];
      for (let c = 0; c < bpp; c++) raw[y * (width * bpp + 1) + 1 + x * bpp + c] = px[c];
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = colorType; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = interlace;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
const cutout = (size) => Array.from({ length: size }, (_, y) => Array.from({ length: size }, (_, x) =>
  (x < 2 || y < 2 || x >= size - 2 || y >= size - 2) ? [0, 0, 0, 0] : [200, 30, 30, 255]));
const opaque = (size) => Array.from({ length: size }, () => Array.from({ length: size }, () => [255, 255, 255, 255]));
const rgb = (size) => Array.from({ length: size }, () => Array.from({ length: size }, () => [255, 255, 255]));

import { pngTransparency } from '../scripts/lib.js';

test('pngTransparency accepts a cutout on a transparent background', () => {
  const t = pngTransparency(encodePng(cutout(8)));
  assert.equal(t.ok, true);
  assert.equal(t.hasAlpha, true);
  assert.equal(t.opaqueCorners, 0);
});

test('pngTransparency reports a PNG with no alpha channel', () => {
  const t = pngTransparency(encodePng(rgb(8), { colorType: 2 }));
  assert.equal(t.ok, true);
  assert.equal(t.hasAlpha, false);
});

test('pngTransparency counts opaque corners on an alpha PNG that is all opaque', () => {
  const t = pngTransparency(encodePng(opaque(8)));
  assert.equal(t.hasAlpha, true);
  assert.equal(t.opaqueCorners, 4);
});

test('pngTransparency refuses interlaced PNGs with a clear reason', () => {
  const t = pngTransparency(encodePng(cutout(8), { interlace: 1 }));
  assert.equal(t.ok, false);
  assert.match(t.reason, /interlace/i);
});

function repoWithIcon(dir, png) {
  fs.mkdirSync(path.join(dir, 'devices'));
  fs.mkdirSync(path.join(dir, 'icons'));
  fs.writeFileSync(path.join(dir, 'devices', 'lockly.json'), JSON.stringify([good()]));
  fs.writeFileSync(path.join(dir, 'icons', 'lockly-smart-lock.png'), png);
  return validateRepo(dir).errors.filter(e => e.startsWith('icons/'));
}

test('validateRepo passes a 128x128 cutout icon', () => {
  withTempDir(dir => assert.deepEqual(repoWithIcon(dir, encodePng(cutout(128))), []));
});

test('validateRepo rejects an icon without an alpha channel', () => {
  withTempDir(dir => {
    const errs = repoWithIcon(dir, encodePng(rgb(128), { colorType: 2 }));
    assert.ok(errs.some(e => /alpha/i.test(e)), errs.join('\n'));
  });
});

test('validateRepo rejects an icon whose background is opaque', () => {
  withTempDir(dir => {
    const errs = repoWithIcon(dir, encodePng(opaque(128)));
    assert.ok(errs.some(e => /transparent/i.test(e)), errs.join('\n'));
  });
});
