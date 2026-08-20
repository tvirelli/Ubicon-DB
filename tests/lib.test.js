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
