#!/usr/bin/env node
// 앱 시뮬레이터를 한 줄로 실행: 정적 서버를 띄우고 기본 브라우저로 연다. 의존성 없음(Node 18+).
//   node app/scripts/open-simulator.mjs                 # 앱 시뮬레이터(app-sim.html)
//   node app/scripts/open-simulator.mjs --page sim.html # 위치 시뮬레이터
//   node app/scripts/open-simulator.mjs --port 9000 --no-open
import { createServer as httpServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const WEB = resolve(here, '..', '..', 'web');
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.wav': 'audio/wav'};

// 웹 폴더 밖(예: /../README.md)은 절대 서빙하지 않는다.
export function resolveSafe(root, urlPath) {
  let p; try { p = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  if (p.includes('\0')) return null;
  const full = resolve(root, '.' + normalize('/' + p));
  return full === root || full.startsWith(root + sep) ? full : null;
}

export function createServer(root = WEB) {
  return httpServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    let file = resolveSafe(root, req.url);
    if (!file) { res.writeHead(404).end('not found'); return; }
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, {'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store'});
      res.end(req.method === 'HEAD' ? undefined : body);
    } catch { res.writeHead(404).end('not found'); }
  });
}

function listen(server, port, tries = 20) {
  return new Promise((ok, fail) => {
    const go = p => {
      server.once('error', e => (e.code === 'EADDRINUSE' && tries-- > 0 ? go(p + 1) : fail(e)));
      server.listen(p, '127.0.0.1', () => ok(p));          // 로컬에서만 접속 가능(외부 노출 없음)
    };
    go(port);
  });
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, {stdio: 'ignore', detached: true}).on('error', () => {}).unref(); } catch { /* 수동으로 열면 됨 */ }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = n => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
  const page = arg('--page') || 'app-sim.html';
  const port = await listen(createServer(), parseInt(arg('--port') || '8777', 10));
  const url = `http://localhost:${port}/${page}`;
  console.log(`\n워크가이드 시뮬레이터: ${url}\n(종료: Ctrl+C)\n`);
  if (!process.argv.includes('--no-open')) openBrowser(url);
}
