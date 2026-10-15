import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, sep } from 'node:path';

// Explicit allowlist: never bundle repository sources, tests or credentials.
export const WEB_ASSETS = Object.freeze([
  'index.html',
  'styles.css',
  'assets/favicon.svg',
  'js/app.js',
  'js/commands.js',
  'js/command-engine.js',
  'js/platform.js',
  'js/platform-ui.js',
  'js/voice-session.js',
  'docs/ROADMAP.md'
]);

export async function buildWeb({ sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'), outputRoot = join(sourceRoot, 'dist') } = {}) {
  const source = resolve(sourceRoot);
  const output = resolve(outputRoot);
  if (!output.startsWith(source + sep)) throw new Error('Output must be inside source root');
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  for (const relative of WEB_ASSETS) {
    const src = resolve(source, relative);
    const dst = resolve(output, relative);
    if (!src.startsWith(source + sep) || !dst.startsWith(output + sep)) throw new Error('Invalid asset path');
    const info = await stat(src);
    if (!info.isFile()) throw new Error('Expected file: ' + relative);
    await mkdir(dirname(dst), { recursive: true });
    await cp(src, dst, { force: true });
  }
  return WEB_ASSETS.length;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildWeb().then(count => console.log('LUMEN web assets: ' + count + ' files copied to dist/')).catch(error => { console.error(error); process.exitCode = 1; });
}
