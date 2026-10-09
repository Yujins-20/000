import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const Native = createRequire(import.meta.url)('../../web/native.js');

test('웹 환경에서는 네이티브로 인식하지 않는다', () => {
  assert.equal(Native.isNative, false);
  assert.equal(Native.platform, 'web');
});

test('위치 정규화: 네이티브 플러그인 형식과 웹 GeolocationPosition 이 같은 모양', () => {
  const a = Native.normalizeLocation({latitude: 41.89, longitude: 12.49, accuracy: 5, speed: 1.4, bearing: 90, time: 1});
  const b = Native.normalizeLocation({coords: {latitude: 41.89, longitude: 12.49, accuracy: 5, speed: 1.4, heading: 90}, timestamp: 1});
  assert.deepEqual(a, b);
  assert.deepEqual(Object.keys(a).sort(), ['accuracy', 'bearing', 'lat', 'lng', 'speed', 'time']);
});

test('진행방향은 충분히 움직일 때만 갱신하고, 정지/무효값이면 직전 값을 유지', () => {
  const loc = (bearing, speed) => ({bearing, speed});
  assert.equal(Native.courseFrom(loc(90, 1.4), null), 90);
  assert.equal(Native.courseFrom(loc(200, 0.2), 90), 90);          // 서 있으면 GPS 방향은 흔들림 → 유지
  assert.equal(Native.courseFrom(loc(null, 2), 90), 90);
  assert.equal(Native.courseFrom(loc(NaN, 2), 90), 90);
  assert.equal(Native.courseFrom(loc(90, null), 45), 45);          // 속도 모르면 믿지 않음
  assert.equal(Native.courseFrom(loc(-90, 1.5), null), 270);       // 음수 방위 정규화
  assert.equal(Native.courseFrom(loc(450, 1.5), null), 90);
});

test('방향 선택: 화면을 보면 나침반, 주머니 속(백그라운드)이면 걷는 방향', () => {
  assert.deepEqual(Native.chooseHeading({compass: 10, course: 100, foreground: true}), {deg: 10, source: 'compass'});
  assert.deepEqual(Native.chooseHeading({compass: 10, course: 100, foreground: false}), {deg: 100, source: 'course'});
  assert.deepEqual(Native.chooseHeading({compass: null, course: 100, foreground: true}), {deg: 100, source: 'course'});
  assert.deepEqual(Native.chooseHeading({compass: 10, course: null, foreground: false}), {deg: 10, source: 'compass'});
  assert.deepEqual(Native.chooseHeading({compass: null, course: null, foreground: true}), {deg: null, source: 'none'});
});

test('버전 비교(강제 업데이트 판단)', () => {
  const c = Native.compareVersions;
  assert.equal(c('1.0.0', '1.0.0'), 0);
  assert.equal(c('1.0.0', '1.2.0'), -1);
  assert.equal(c('1.10.0', '1.2.0'), 1);      // 문자열 비교가 아니라 숫자 비교
  assert.equal(c('2', '1.9.9'), 1);
  assert.equal(c('1.0', '1.0.0'), 0);
});
