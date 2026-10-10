import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, validateApiBase, checkAppId } from './build-web.mjs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const APP_ID = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'capacitor.config.json'), 'utf8')).appId;

test('릴리스 빌드는 https 고정 도메인만 허용', () => {
  assert.throws(() => validateApiBase('', true), /필요/);
  assert.throws(() => validateApiBase('http://api.example.com', true), /https/);
  assert.throws(() => validateApiBase('https://abc.trycloudflare.com', true), /임시/);
  assert.throws(() => validateApiBase('https://localhost:8082', true), /임시|로컬/);
  assert.equal(validateApiBase('https://api.example.com/', true), 'https://api.example.com');
  assert.equal(validateApiBase('', false), '');
});

test('www 에 웹 자산이 복사되고 config.js 가 생성되며 SW/매니페스트는 제외', () => {
  const out = mkdtempSync(join(tmpdir(), 'www-'));
  const r = build({ out, apiBase: 'https://api.example.com', release: true, operator: 'Acme <Co>', email: 'privacy@acme.example', confirmAppId: APP_ID });
  for (const f of ['index.html', 'app.js', 'tts.js', 'sim.html']) assert.ok(existsSync(join(out, f)), f);
  assert.ok(!existsSync(join(out, 'sw.js')) && !existsSync(join(out, 'manifest.json')));
  assert.ok(!existsSync(join(out, 'sim-mock.js')) && !existsSync(join(out, 'app-sim.html')), '시뮬레이터 모의 계층은 앱에 포함되면 안 된다');
  const cfg = readFileSync(join(out, 'config.js'), 'utf8');
  assert.match(cfg, /WALKGUIDE_API_BASE = "https:\/\/api\.example\.com"/);
  assert.match(cfg, new RegExp(`WALKGUIDE_APP_VERSION = "${r.version}"`));
});

test('릴리스 빌드는 운영자 정보가 없거나 형식이 틀리면 실패, 채워지면 토큰이 남지 않음', () => {
  const mk = () => mkdtempSync(join(tmpdir(), 'www-'));
  const base = { apiBase: 'https://api.example.com', release: true, confirmAppId: APP_ID };
  assert.throws(() => build({ out: mk(), ...base }), /OPERATOR_NAME/);
  assert.throws(() => build({ out: mk(), ...base, operator: 'Acme', email: 'not-an-email' }), /형식/);
  const out = mk();
  build({ out, ...base, operator: 'Acme <Co>', email: 'privacy@acme.example' });
  const html = readFileSync(join(out, 'privacy.html'), 'utf8');
  assert.ok(!html.includes('{{') && html.includes('Acme &lt;Co&gt;') && html.includes('mailto:privacy@acme.example'));
});

test('개발 빌드는 운영자 정보가 없어도 되고 표시용 대체 문구가 들어감', () => {
  const out = mkdtempSync(join(tmpdir(), 'www-'));
  build({ out, apiBase: '', release: false });
  assert.ok(readFileSync(join(out, 'privacy.html'), 'utf8').includes('운영자 미설정'));
});

test('릴리스 빌드는 앱 ID 확인(CONFIRM_APP_ID) 없이는 실패', () => {
  assert.throws(() => checkAppId(true, undefined, 'a.b.c'), /CONFIRM_APP_ID=a\.b\.c/);
  assert.throws(() => checkAppId(true, 'x.y.z', 'a.b.c'), /CONFIRM_APP_ID/);
  assert.doesNotThrow(() => checkAppId(true, 'a.b.c', 'a.b.c'));
  assert.doesNotThrow(() => checkAppId(false, undefined, 'a.b.c'));   // 개발 빌드는 불필요
});
