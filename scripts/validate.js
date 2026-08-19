import { validateRepo } from './lib.js';
const { errors, devices } = validateRepo(process.cwd());
if (errors.length) {
  console.error(`FAILED: ${errors.length} problem(s):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`OK: ${devices.length} device(s) valid.`);
