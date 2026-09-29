// Packs the game for itch.io (Kind of project: HTML) into dist/cryptfall-itch.zip.
// Only the files the game loads go in: no server, tools, prototype or docs.
// Writes the zip itself (Node's zlib), so it runs anywhere without a zip program.
// Usage: npm run itch
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';

const INCLUDE = [/^index\.html$/, /^manifest\.webmanifest$/, /^sw\.js$/, /^icons\//, /^src\//, /^vendor\//, /^voice\//, /^proto3d\/models\/.+\.glb$/];

const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(f => INCLUDE.some(re => re.test(f)));

const CRC = new Uint32Array(256).map((_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Fixed timestamp (1 Jan 2020), so the same files always give the same zip.
const DOS_TIME = 0, DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;
const parts = [], central = [];
let offset = 0;
for (const name of files) {
  const data = readFileSync(name);
  const packed = deflateRawSync(data, { level: 9 });
  const method = packed.length < data.length ? 8 : 0;
  const body = method ? packed : data;
  const fname = Buffer.from(name, 'utf8');
  const crc = crc32(data);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);            // version needed
  local.writeUInt16LE(0x0800, 6);        // UTF-8 names
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(DOS_TIME, 10);
  local.writeUInt16LE(DOS_DATE, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(fname.length, 26);
  parts.push(local, fname, body);

  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);               // version made by
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0x0800, 8);
  cd.writeUInt16LE(method, 10);
  cd.writeUInt16LE(DOS_TIME, 12);
  cd.writeUInt16LE(DOS_DATE, 14);
  cd.writeUInt32LE(crc, 16);
  cd.writeUInt32LE(body.length, 20);
  cd.writeUInt32LE(data.length, 24);
  cd.writeUInt16LE(fname.length, 28);
  cd.writeUInt32LE(offset, 42);
  central.push(cd, fname);
  offset += local.length + fname.length + body.length;
}
const cdSize = central.reduce((n, b) => n + b.length, 0);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cdSize, 12);
end.writeUInt32LE(offset, 16);

const out = 'dist/cryptfall-itch.zip';
mkdirSync('dist', { recursive: true });
writeFileSync(out, Buffer.concat([...parts, ...central, end]));
console.log(`${out}: ${files.length} files, ${(offset / 1048576).toFixed(1)} MB`);
