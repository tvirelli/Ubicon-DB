import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { CATEGORIES, validateDevice, pngInfo, validateRepo } from '../scripts/lib.js';

const good = () => ({
  id: 'lockly-smart-lock', name: 'Lockly Smart Lock', vendor: 'Lockly',
  model: 'PGD728F', category: 'smart_lock', keywords: ['deadbolt'],
  icon: 'icons/lockly-smart-lock.png',
});

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubdb-'));
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

test('validateRepo flags orphan icons', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ubdb-'));
  fs.mkdirSync(path.join(dir, 'devices'));
  fs.mkdirSync(path.join(dir, 'icons'));
  fs.writeFileSync(path.join(dir, 'icons', 'orphan.png'), PNG_1x1);
  const res = validateRepo(dir);
  assert.ok(res.errors.some(e => e.includes('orphan.png')));
});
