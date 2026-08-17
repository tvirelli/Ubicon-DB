import { Resvg } from '@resvg/resvg-js';
import fs from 'node:fs';
const [svgPath, outPath] = process.argv.slice(2);
if (!svgPath || !outPath) { console.error('usage: node tools/svg2icon.mjs <in.svg> <out.png>'); process.exit(1); }
const svg = fs.readFileSync(svgPath, 'utf8');
const viewBoxMatch = svg.match(/viewBox\s*=\s*["']([^"']+)["']/);
if (viewBoxMatch) {
  const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
  const [, , vbWidth, vbHeight] = parts;
  if (parts.length === 4 && Number.isFinite(vbWidth) && Number.isFinite(vbHeight) && vbWidth !== vbHeight) {
    console.error(`${svgPath}: SVG viewBox must be square (got ${vbWidth}x${vbHeight})`);
    process.exit(1);
  }
}
const png = new Resvg(svg, { fitTo: { mode: 'width', value: 128 } }).render().asPng();
fs.writeFileSync(outPath, png);
console.log(`${outPath}: ${png.length} bytes`);
