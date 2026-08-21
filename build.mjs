import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'assets'), { recursive: true });

const entries = {
  app: 'js/wormhole-app-v90.js',
  version: 'js/version-check.js',
  device: 'js/device-layout.js',
  consent: 'js/storage-consent-ui.js',
  controls: 'js/ui-controls.js',
  signal: 'js/lost-signal-game.js',
  appearance: 'js/appearance-boot.js'
};

const result = await build({
  entryPoints: Object.values(entries),
  bundle: true,
  minify: true,
  sourcemap: false,
  target: ['es2020'],
  format: 'esm',
  outdir: path.join(dist, 'assets'),
  entryNames: '[name]-[hash]',
  metafile: true,
  write: true,
  logLevel: 'info'
});

const byEntry = {};
for (const [outfile, meta] of Object.entries(result.metafile.outputs)) {
  if (!meta.entryPoint) continue;
  const key = Object.entries(entries).find(([,src]) => meta.entryPoint.endsWith(src))?.[0];
  if (key) byEntry[key] = '/' + path.relative(dist, outfile).replaceAll('\\','/');
}

for (const css of ['styles.css','mobile.css','signal.css']) {
  const src = path.join(root,'css',css);
  const text = await readFile(src,'utf8');
  const min = text.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\s+/g,' ').replace(/\s*([{}:;,>])\s*/g,'$1').trim();
  const hash=createHash('sha256').update(min).digest('hex').slice(0,8);
  const name=css.replace('.css',`-${hash}.css`);
  await writeFile(path.join(dist,'assets',name),min);
  const cssKey = css === 'styles.css' ? 'styles' : css === 'mobile.css' ? 'mobile' : 'signalCss';
  byEntry[cssKey]='/assets/'+name;
}

await cp(path.join(root,'assets'),path.join(dist,'assets'),{recursive:true});
for (const file of ['_headers','version.json']) await cp(path.join(root,file),path.join(dist,file));

for (const page of ['index.html','privacy.html','signal.html','sponsorship.html']) {
  let html=await readFile(path.join(root,page),'utf8');
  html=html.replace(/<script src="js\/appearance-boot\.js\?v=90"><\/script>/,`<script type="module" src="${byEntry.appearance}"></script>`)
    .replace(/<script type="module" src="js\/version-check\.js\?v=90"><\/script>/,`<script type="module" src="${byEntry.version}"></script>`)
    .replace(/<script type="module" src="js\/device-layout\.js\?v=90"><\/script>/,`<script type="module" src="${byEntry.device}"></script>`)
    .replace(/<script type="module" src="js\/storage-consent-ui\.js\?v=90"><\/script>/,`<script type="module" src="${byEntry.consent}"></script>`)
    .replace(/<script type="module" src="js\/ui-controls\.js\?v=90"><\/script>/,`<script type="module" src="${byEntry.controls}"></script>`)
    .replace(/<script type="module" src="js\/wormhole-app-v90\.js\?v=90"><\/script>/,`<script type="module" src="${byEntry.app}"></script>`)
    .replace(/<script type="module" src="js\/lost-signal-game\.js\?v=90"><\/script>/,`<script type="module" src="${byEntry.signal}"></script>`)
    .replace(/href="css\/styles\.css\?v=90"/g,`href="${byEntry.styles}"`)
    .replace(/href="css\/mobile\.css\?v=90"/g,`href="${byEntry.mobile}"`)
    .replace(/href="css\/signal\.css\?v=90"/g,`href="${byEntry.signalCss}"`);
  await writeFile(path.join(dist,page),html);
}
await writeFile(path.join(dist,'build-manifest.json'),JSON.stringify({version:'0.0.90',assets:byEntry},null,2));
console.log('Built Wormhole Alpha-0.0.90 into dist/');
