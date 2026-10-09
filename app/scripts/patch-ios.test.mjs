import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { patchInfoPlist, patchAppDelegate, patchPbxproj, PRIVACY_MANIFEST } from './patch-ios.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fx = n => readFileSync(join(here, 'fixtures', n), 'utf8');

test('Info.plist: 권한 문구·백그라운드 모드·수출규정', () => {
  const x = patchInfoPlist(fx('Info.pristine.plist'));
  for (const k of ['NSLocationWhenInUseUsageDescription', 'NSLocationAlwaysAndWhenInUseUsageDescription', 'NSMicrophoneUsageDescription',
    'NSSpeechRecognitionUsageDescription', 'NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'ITSAppUsesNonExemptEncryption'])
    assert.ok(x.includes(`<key>${k}</key>`), k);
  assert.match(x, /UIBackgroundModes<\/key>\s*<array>\s*<string>location<\/string>\s*<string>audio<\/string>/);
  assert.ok(x.includes('<string>arm64</string>') && !x.includes('armv7'));
  assert.equal(patchInfoPlist(x), x, '멱등');
});

test('AppDelegate: 오디오 세션을 재생/음성 모드로, 멱등', () => {
  const s = patchAppDelegate(fx('AppDelegate.pristine.swift'));
  assert.ok(s.includes('import AVFoundation') && s.includes('.playback, mode: .spokenAudio'));
  assert.ok(s.indexOf('setCategory') < s.indexOf('return true'));
  assert.equal(patchAppDelegate(s), s);
});

test('pbxproj: 버전 동기화 + 개인정보 매니페스트를 파일/빌드/리소스 단계에 등록, 멱등', () => {
  const p = patchPbxproj(fx('project.pristine.pbxproj'), { version: '1.2.3', build: 10203 });
  assert.ok(!/MARKETING_VERSION = 1\.0;/.test(p) && /MARKETING_VERSION = 1\.2\.3;/.test(p) && /CURRENT_PROJECT_VERSION = 10203;/.test(p));
  const lines = p.split('\n').filter(l => l.includes('PrivacyInfo.xcprivacy'));
  assert.equal(lines.length, 4, 'PBXBuildFile / PBXFileReference / 그룹 children / 리소스 빌드 단계, 각 1줄');
  assert.ok(lines.some(l => l.includes('in Resources') && l.includes('isa = PBXBuildFile')));
  assert.ok(lines.some(l => l.trim().startsWith(`${'A1B2C3D4E5F60718293A4B5C'} /* PrivacyInfo.xcprivacy */,`)));
  assert.match(p, /isa = PBXFileReference; lastKnownFileType = text\.xml; path = PrivacyInfo\.xcprivacy/);
  assert.equal(patchPbxproj(p, { version: '1.2.3', build: 10203 }), p);
});

test('개인정보 매니페스트: 추적 안 함 + 수집 데이터 3종은 앱 기능 목적이며 계정과 연결되지 않음', () => {
  assert.match(PRIVACY_MANIFEST, /NSPrivacyTracking<\/key>\s*<false\/>/);
  for (const t of ['PreciseLocation', 'OtherUserContent', 'PhotosorVideos']) assert.ok(PRIVACY_MANIFEST.includes(`NSPrivacyCollectedDataType${t}`), t);
  assert.equal((PRIVACY_MANIFEST.match(/NSPrivacyCollectedDataTypeLinked<\/key>\s*<false\/>/g) || []).length, 3);
});

test('저장소의 실제 ios/ 가 패치된 상태이고 번들 ID 가 capacitor.config 와 일치', () => {
  const repo = p => readFileSync(join(here, '..', 'ios', 'App', p), 'utf8');
  const cfg = JSON.parse(readFileSync(join(here, '..', 'capacitor.config.json'), 'utf8'));
  const ids = [...repo('App.xcodeproj/project.pbxproj').matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map(m => m[1]);
  assert.ok(ids.length >= 2 && ids.every(i => i === cfg.appId), ids.join(','));
  assert.ok(repo('App/Info.plist').includes('walkguide:patched') && repo('App/AppDelegate.swift').includes('spokenAudio'));
  assert.ok(repo('App/PrivacyInfo.xcprivacy').includes('NSPrivacyCollectedDataTypePreciseLocation'));
});
