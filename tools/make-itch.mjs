// Packs the game for itch.io (Kind of project: HTML) into dist/cryptfall-itch.zip.
// Only the files the game loads go in: no server, tools, prototype or docs.
// Usage: npm run itch
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';

const INCLUDE = [/^index\.html$/, /^manifest\.webmanifest$/, /^sw\.js$/, /^icons\//, /^src\//, /^vendor\//, /^voice\//, /^proto3d\/models\/.+\.glb$/];

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split('\n')
  .filter(f => INCLUDE.some(re => re.test(f)));

const out = 'dist/cryptfall-itch.zip';
mkdirSync('dist', { recursive: true });
rmSync(out, { force: true });
execFileSync('zip', ['-q', '-9', out, '-@'], { input: files.join('\n') });
console.log(`${out}: ${files.length} files`);
