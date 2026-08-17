import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
const [svgPath, outPath] = process.argv.slice(2);
if (!svgPath || !outPath) { console.error('usage: node tools/svg2icon.mjs <in.svg> <out.png>'); process.exit(1); }
const png = new Resvg(fs.readFileSync(svgPath, 'utf8'), { fitTo: { mode: 'width', value: 128 } }).render().asPng();
fs.writeFileSync(outPath, png);
console.log(`${outPath}: ${png.length} bytes`);
