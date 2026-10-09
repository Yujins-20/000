import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { patchManifest, patchBuildGradle, patchStrings, semverToCode } from './patch-android.mjs';

const fx = n => readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', n), 'utf8');
const repo = p => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', p), 'utf8');

test('매니페스트: 백업 끄기·평문 금지·불필요 권한 제거·하드웨어 비필수', () => {
  const x = patchManifest(fx('AndroidManifest.pristine.xml'));
  assert.match(x, /android:allowBackup="false"/);
  assert.match(x, /usesCleartextTraffic="false"/);
  assert.match(x, /RECEIVE_BOOT_COMPLETED" tools:node="remove"/);
  assert.match(x, /GeofenceBootReceiver" tools:node="remove"/);
  assert.match(x, /hardware\.microphone" android:required="false"/);
  assert.match(x, /hardware\.location\.gps" android:required="false"/);
  assert.match(x, /xmlns:tools=/);
  assert.ok(!/android:name="android.permission.CAMERA"/.test(x), '카메라는 시스템 카메라 인텐트를 쓰므로 CAMERA 권한을 선언하지 않는다');
});

test('패치는 멱등', () => {
  const once = patchManifest(fx('AndroidManifest.pristine.xml'));
  assert.equal(patchManifest(once), once);
  const g = patchBuildGradle(fx('build.pristine.gradle'), { versionName: '1.2.3', versionCode: 10203 });
  assert.equal(patchBuildGradle(g, { versionName: '1.2.3', versionCode: 10203 }), g);
  const s = patchStrings(fx('strings.pristine.xml'));
  assert.equal(patchStrings(s), s);
});

test('Gradle: 버전 동기화, 서명 정보는 환경변수로만(저장소에 비밀 없음)', () => {
  const g = patchBuildGradle(fx('build.pristine.gradle'), { versionName: '1.2.3', versionCode: 10203 });
  assert.match(g, /versionCode 10203/); assert.match(g, /versionName "1.2.3"/);
  assert.match(g, /System\.getenv\("ANDROID_KEYSTORE_FILE"\)/);
  assert.ok(!/storePassword\s+["'][^"']+["']/.test(g) && !/keyPassword\s+["'][^"']+["']/.test(g));
});

test('semver → versionCode 는 단조 증가', () => {
  assert.equal(semverToCode('1.0.0'), 10000);
  assert.ok(semverToCode('1.0.1') > semverToCode('1.0.0') && semverToCode('1.1.0') > semverToCode('1.0.99') && semverToCode('2.0.0') > semverToCode('1.99.99'));
});

test('저장소의 실제 android/ 가 패치된 상태이고 앱 ID 가 일관됨', () => {
  assert.match(repo('src/main/AndroidManifest.xml'), /walkguide:patched/);
  const gradle = repo('build.gradle');
  const id = /applicationId "([^"]+)"/.exec(gradle)[1], ns = /namespace = "([^"]+)"/.exec(gradle)[1];
  const cfg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'capacitor.config.json'), 'utf8'));
  assert.equal(id, cfg.appId); assert.equal(ns, cfg.appId);
  assert.match(repo('src/main/res/values/strings.xml'), /notification_icon/);
});
