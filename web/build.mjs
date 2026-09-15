import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'static', 'js'), { recursive: true });
fs.mkdirSync(path.join(dist, 'static', 'css'), { recursive: true });

const common = {
  bundle: true,
  minify: true,
  sourcemap: false,
  target: ['es2017'],
  loader: { '.js': 'jsx' },
  jsx: 'transform',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning'
};

await esbuild.build({
  ...common,
  entryPoints: [path.join(root, 'src/index.js')],
  outfile: path.join(dist, 'static/js/main.js')
});

await esbuild.build({
  ...common,
  entryPoints: [path.join(root, 'src/index.css')],
  outfile: path.join(dist, 'static/css/main.css')
});

function hashFile(outfile) {
  const data = fs.readFileSync(outfile);
  const hash = crypto.createHash('sha256').update(data).digest('hex').slice(0, 8);
  const ext = path.extname(outfile);
  const named = outfile.slice(0, -ext.length) + '.' + hash + ext;
  fs.renameSync(outfile, named);
  return named;
}

const jsFile = hashFile(path.join(dist, 'static/js/main.js'));
const cssFile = hashFile(path.join(dist, 'static/css/main.css'));
const jsRel = '/' + path.relative(dist, jsFile).split(path.sep).join('/');
const cssRel = '/' + path.relative(dist, cssFile).split(path.sep).join('/');

for (const file of ['favicon.svg', 'manifest.json']) {
  fs.copyFileSync(path.join(root, 'public', file), path.join(dist, file));
}

fs.writeFileSync(
  path.join(dist, 'index.html'),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"/>` +
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>` +
    `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>` +
    `<meta name="theme-color" content="#1a0b2e"/>` +
    `<meta name="apple-mobile-web-app-capable" content="yes"/>` +
    `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"/>` +
    `<meta name="description" content="A tiny universe for two: video call, chat and watch together."/>` +
    `<link rel="manifest" href="/manifest.json"/>` +
    `<title>CoupleRoom</title>` +
    `<link href="${cssRel}" rel="stylesheet">` +
    `</head><body><noscript>You need to enable JavaScript to run CoupleRoom.</noscript>` +
    `<div id="root"></div><script src="${jsRel}"></script></body></html>\n`
);

console.log('JS :', jsRel);
console.log('CSS:', cssRel);
