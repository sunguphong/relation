// 사용법: node tools/set-password.mjs <비밀번호>
// tools/seed.local.json(평문, git에 올라가지 않음)을 비밀번호로 암호화해서 index.html의 SEED_ENC 줄에 넣는다.
// index.html의 deriveKey/encrypt와 같은 방식(PBKDF2-SHA256 20만 회 → AES-GCM 256)을 쓴다.
import { readFileSync, writeFileSync } from 'node:fs';
import { webcrypto as crypto } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const pw = process.argv[2];
if (!pw) { console.error('사용법: node tools/set-password.mjs <비밀번호>'); process.exit(1); }

const here = dirname(fileURLToPath(import.meta.url));
const htmlPath = join(here, '..', 'index.html');
const seed = readFileSync(join(here, 'seed.local.json'), 'utf8');

const b64 = u8 => Buffer.from(u8).toString('base64');
const salt = crypto.getRandomValues(new Uint8Array(16));
const iv = crypto.getRandomValues(new Uint8Array(12));
const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(JSON.parse(seed))));

const line = `const SEED_ENC = ${JSON.stringify({ salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) })};`;
const html = readFileSync(htmlPath, 'utf8');
if (!/^const SEED_ENC = .*;$/m.test(html)) { console.error('index.html에서 SEED_ENC 줄을 찾지 못했어요.'); process.exit(1); }
writeFileSync(htmlPath, html.replace(/^const SEED_ENC = .*;$/m, line));
console.log('비밀번호를 설정했어요. 이제 커밋하고 푸시하면 됩니다.');
