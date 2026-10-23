import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createServer, resolveSafe } from './open-simulator.mjs';

const root = resolve('/srv/web');
test('어떤 경로를 줘도 결과는 웹 폴더 안이거나 거부(경로 탈출 불가)', () => {
  const evil = ['/../etc/passwd', '/%2e%2e/%2e%2e/etc/passwd', '/a/../../b', '/..%2f..%2fetc/passwd', '//etc/passwd', '/x\0y', '/%zz', '/..\\..\\x'];
  for (const p of evil) {
    const r = resolveSafe(root, p);
    assert.ok(r === null || r === root || r.startsWith(root + '/'), `${p} -> ${r}`);
  }
  assert.equal(resolveSafe(root, '/x\0y'), null);
  assert.equal(resolveSafe(root, '/app-sim.html?x=1'), resolve(root, 'app-sim.html'));
});

test('실제 web/ 을 서빙: 시뮬레이터 페이지·스크립트 200, 탈출/미존재 404, POST 405', async () => {
  const s = createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${s.address().port}`;
  try {
    const page = await fetch(base + '/app-sim.html'); assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /text\/html/); assert.match(await page.text(), /앱 시뮬레이터/);
    assert.match((await fetch(base + '/sim-mock.js')).headers.get('content-type'), /javascript/);
    assert.equal((await fetch(base + '/')).status, 200);                                  // index.html
    assert.equal((await fetch(base + '/..%2fREADME.md')).status, 404);
    assert.equal((await fetch(base + '/nope.html')).status, 404);
    assert.equal((await fetch(base + '/app-sim.html', {method: 'POST'})).status, 405);
  } finally { s.close(); }
});
