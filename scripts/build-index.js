import fs from 'node:fs';
import { buildIndex } from './lib.js';
const idx = buildIndex(process.cwd());
fs.writeFileSync('index.json', JSON.stringify(idx, null, 1) + '\n');
console.log(`index.json written: ${idx.count} device(s).`);
