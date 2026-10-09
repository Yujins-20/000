// ../web 을 www/ 로 복사하고 빌드 시점 설정(config.js)을 생성한다.
//   WALKGUIDE_API_BASE=https://api.example.com npm run build:web
// 릴리스 빌드(RELEASE=1)는 https API 주소가 없으면 실패한다 — 실수로 빈 주소/개발 주소로 스토어에 올라가는 것을 막는다.
import { cpSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
export const EXCLUDE = new Set(['sw.js', 'manifest.json', 'config.js']); // 서비스워커/PWA 매니페스트는 네이티브에 불필요

export function validateApiBase(base, release) {
  const b = (base || '').trim().replace(/\/+$/, '');
  if (!b) { if (release) throw new Error('RELEASE 빌드에는 WALKGUIDE_API_BASE(https) 가 필요합니다.'); return b; }
  let u; try { u = new URL(b); } catch { throw new Error(`WALKGUIDE_API_BASE 가 올바른 URL 이 아닙니다: ${b}`); }
  if (release && u.protocol !== 'https:') throw new Error('RELEASE 빌드의 API 주소는 https 여야 합니다.');
  if (release && /(localhost|127\.0\.0\.1|trycloudflare\.com)/.test(u.hostname)) throw new Error('RELEASE 빌드에 로컬/임시(Quick Tunnel) 주소를 쓸 수 없습니다. 고정 도메인을 사용하세요.');
  return b;
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 개인정보처리방침의 {{OPERATOR_NAME}}/{{CONTACT_EMAIL}} 을 채운다. 릴리스 빌드는 비어 있거나 남은 토큰이 있으면 실패.
export function fillTokens(dir, { operator, email, release }) {
  if (release && (!operator || !email)) throw new Error('RELEASE 빌드에는 OPERATOR_NAME 과 CONTACT_EMAIL 이 필요합니다(개인정보처리방침에 표시).');
  if (release && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error(`CONTACT_EMAIL 형식이 올바르지 않습니다: ${email}`);
  for (const f of readdirSync(dir).filter(n => n.endsWith('.html'))) {
    const p = join(dir, f);
    const html = readFileSync(p, 'utf8')
      .replaceAll('{{OPERATOR_NAME}}', esc(operator || '(운영자 미설정)'))
      .replaceAll('{{CONTACT_EMAIL}}', esc(email || '(이메일 미설정)'));
    if (release && /\{\{[A-Z_]+\}\}/.test(html)) throw new Error(`${f} 에 채워지지 않은 {{토큰}} 이 남아 있습니다.`);
    writeFileSync(p, html);
  }
}

// 앱 ID(applicationId / Bundle ID)는 스토어에 올린 뒤 바꿀 수 없다. 릴리스 빌드는 의도한 ID 인지 명시적으로 확인해야 한다.
export function checkAppId(release, confirm, appId) {
  if (release && confirm !== appId) throw new Error(`RELEASE 빌드에는 CONFIRM_APP_ID=${appId} 로 앱 ID 를 확인해야 합니다(스토어 등록 후에는 변경 불가). 다른 ID 를 쓰려면 먼저 capacitor.config.json 과 android/ios 프로젝트의 ID 를 바꾸세요.`);
}

export function build({ out = join(root, 'www'), src = resolve(root, '..', 'web'), apiBase = process.env.WALKGUIDE_API_BASE,
  release = process.env.RELEASE === '1', operator = process.env.OPERATOR_NAME, email = process.env.CONTACT_EMAIL,
  confirmAppId = process.env.CONFIRM_APP_ID } = {}) {
  const base = validateApiBase(apiBase, release);
  checkAppId(release, confirmAppId, JSON.parse(readFileSync(join(root, 'capacitor.config.json'), 'utf8')).appId);
  const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(src, out, { recursive: true, filter: p => !EXCLUDE.has(p.split(/[\\/]/).pop()) });
  fillTokens(out, { operator, email, release });
  writeFileSync(join(out, 'config.js'),
    `// 자동 생성(app/scripts/build-web.mjs) — 직접 수정하지 마세요.\n` +
    `window.WALKGUIDE_API_BASE = ${JSON.stringify(base)};\n` +
    `window.WALKGUIDE_APP_VERSION = ${JSON.stringify(version)};\n`);
  return { out, base, version };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = build();
    console.log(`www 생성: ${r.out} (v${r.version}, API=${r.base || '(비어 있음 — 개발용)'})`);
    if (!existsSync(join(r.out, 'index.html'))) throw new Error('index.html 이 없습니다.');
  } catch (e) { console.error('빌드 실패:', e.message); process.exit(1); }
}
