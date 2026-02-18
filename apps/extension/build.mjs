import * as esbuild from 'esbuild';
import { copyFileSync, mkdirSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');
const dist = join(__dirname, 'dist');

// Ensure dist directories exist
for (const dir of ['dist', 'dist/icons', 'dist/popup', 'dist/styles']) {
  const fullPath = join(__dirname, dir);
  if (!existsSync(fullPath)) mkdirSync(fullPath, { recursive: true });
}

// Copy static files
const staticFiles = [
  ['manifest.json', 'dist/manifest.json'],
  ['popup/index.html', 'dist/popup/index.html'],
  ['styles/popup.css', 'dist/styles/popup.css'],
];

for (const [src, dest] of staticFiles) {
  copyFileSync(join(__dirname, src), join(__dirname, dest));
}

// Copy icons
const iconsDir = join(__dirname, 'icons');
if (existsSync(iconsDir)) {
  for (const file of readdirSync(iconsDir)) {
    copyFileSync(join(iconsDir, file), join(__dirname, 'dist/icons', file));
  }
}

// Bundle config
const sharedConfig = {
  bundle: true,
  format: 'esm',
  target: 'chrome120',
  minify: !isWatch,
  sourcemap: isWatch,
  logLevel: 'info',
};

// Entry points — each one becomes a self-contained bundle
const entryPoints = [
  {
    entryPoints: [join(__dirname, 'background/service-worker.ts')],
    outfile: join(dist, 'background/service-worker.js'),
    // Service worker must be a single file, no imports
    format: 'iife',
  },
  {
    entryPoints: [join(__dirname, 'content/axiom.ts')],
    outfile: join(dist, 'content/axiom.js'),
    format: 'iife',
  },
  {
    entryPoints: [join(__dirname, 'content/pumpfun.ts')],
    outfile: join(dist, 'content/pumpfun.js'),
    format: 'iife',
  },
  {
    entryPoints: [join(__dirname, 'content/photon.ts')],
    outfile: join(dist, 'content/photon.js'),
    format: 'iife',
  },
  {
    entryPoints: [join(__dirname, 'content/bullx.ts')],
    outfile: join(dist, 'content/bullx.js'),
    format: 'iife',
  },
  {
    entryPoints: [join(__dirname, 'content/dexscreener.ts')],
    outfile: join(dist, 'content/dexscreener.js'),
    format: 'iife',
  },
  {
    entryPoints: [join(__dirname, 'popup/popup.ts')],
    outfile: join(dist, 'popup/popup.js'),
    format: 'iife',
  },
];

async function build() {
  for (const entry of entryPoints) {
    if (isWatch) {
      const ctx = await esbuild.context({ ...sharedConfig, ...entry });
      await ctx.watch();
      console.log(`[watch] ${entry.outfile}`);
    } else {
      await esbuild.build({ ...sharedConfig, ...entry });
    }
  }
  console.log(isWatch ? '\n  Watching for changes...' : '\n  Extension built to dist/');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
