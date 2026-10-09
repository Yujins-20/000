// Capacitor 가 생성한 ios/ 를 스토어 배포용으로 조정한다 (멱등).
//   node scripts/patch-ios.mjs      (BUILD_NUMBER 환경변수로 빌드 번호 지정 가능)
//  - Info.plist: 권한 사용 목적 문구, 백그라운드 모드(location, audio), 수출 규정 응답
//  - AppDelegate: 오디오 세션을 '재생(음성 안내)'으로 — 무음 스위치/백그라운드에서도 안내가 들리게
//  - PrivacyInfo.xcprivacy: Apple 개인정보 매니페스트(추적 없음, 수집 데이터 유형) 추가 + Xcode 프로젝트에 등록
//  - MARKETING_VERSION / CURRENT_PROJECT_VERSION 을 package.json 과 동기화
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const MARK = '<!-- walkguide:patched -->';

const PLIST_ENTRIES = `	${MARK}
	<key>NSLocationWhenInUseUsageDescription</key>
	<string>걷는 동안 주변 장소를 찾고 '오른쪽/왼쪽'을 구분해 설명하기 위해 현재 위치를 사용합니다.</string>
	<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
	<string>화면이 잠겨 있거나 다른 앱을 쓰는 중에도 가까운 장소에 다가가면 안내해 드리기 위해 위치를 사용합니다. 앱의 '안내 종료'로 언제든 끌 수 있어요.</string>
	<key>NSMicrophoneUsageDescription</key>
	<string>"저 건물 뭐야?"처럼 말로 질문할 때만 마이크를 사용합니다.</string>
	<key>NSSpeechRecognitionUsageDescription</key>
	<string>말로 한 질문을 글자로 바꾸기 위해 음성 인식을 사용합니다.</string>
	<key>NSCameraUsageDescription</key>
	<string>'사진으로 물어보기'를 누를 때 지금 보는 건물을 확인하기 위해 카메라를 사용합니다. 사진은 저장하지 않습니다.</string>
	<key>NSPhotoLibraryUsageDescription</key>
	<string>사진으로 질문할 때 앨범에서 사진을 고를 수 있도록 사진 보관함에 접근합니다.</string>
	<key>NSPhotoLibraryAddUsageDescription</key>
	<string>사진 저장 기능은 사용하지 않습니다.</string>
	<key>UIBackgroundModes</key>
	<array>
		<string>location</string>
		<string>audio</string>
	</array>
	<key>ITSAppUsesNonExemptEncryption</key>
	<false/>
`;

export function patchInfoPlist(plist) {
  if (plist.includes(MARK)) return plist;
  return plist.replace('<string>armv7</string>', '<string>arm64</string>').replace('</dict>\n</plist>', `${PLIST_ENTRIES}</dict>\n</plist>`);
}

const AUDIO_SNIPPET = `        // 음성 안내: '재생' 카테고리 + 음성(spokenAudio) 모드. 안내가 나올 때만 다른 앱 소리를 잠시 낮춘다. (walkguide)
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .spokenAudio, options: [.interruptSpokenAudioAndMixWithOthers])
`;
export function patchAppDelegate(src) {
  if (src.includes('walkguide')) return src;
  return src.replace('import Capacitor\n', 'import Capacitor\nimport AVFoundation\n')
    .replace('        // Override point for customization after application launch.\n', `${AUDIO_SNIPPET}        // Override point for customization after application launch.\n`);
}

export const PRIVACY_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>NSPrivacyTracking</key>
	<false/>
	<key>NSPrivacyTrackingDomains</key>
	<array/>
	<key>NSPrivacyCollectedDataTypes</key>
	<array>
		<dict>
			<key>NSPrivacyCollectedDataType</key>
			<string>NSPrivacyCollectedDataTypePreciseLocation</string>
			<key>NSPrivacyCollectedDataTypeLinked</key>
			<false/>
			<key>NSPrivacyCollectedDataTypeTracking</key>
			<false/>
			<key>NSPrivacyCollectedDataTypePurposes</key>
			<array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
		</dict>
		<dict>
			<key>NSPrivacyCollectedDataType</key>
			<string>NSPrivacyCollectedDataTypeOtherUserContent</string>
			<key>NSPrivacyCollectedDataTypeLinked</key>
			<false/>
			<key>NSPrivacyCollectedDataTypeTracking</key>
			<false/>
			<key>NSPrivacyCollectedDataTypePurposes</key>
			<array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
		</dict>
		<dict>
			<key>NSPrivacyCollectedDataType</key>
			<string>NSPrivacyCollectedDataTypePhotosorVideos</string>
			<key>NSPrivacyCollectedDataTypeLinked</key>
			<false/>
			<key>NSPrivacyCollectedDataTypeTracking</key>
			<false/>
			<key>NSPrivacyCollectedDataTypePurposes</key>
			<array><string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string></array>
		</dict>
	</array>
	<key>NSPrivacyAccessedAPITypes</key>
	<array>
		<dict>
			<key>NSPrivacyAccessedAPIType</key>
			<string>NSPrivacyAccessedAPICategoryUserDefaults</string>
			<key>NSPrivacyAccessedAPITypeReasons</key>
			<array><string>CA92.1</string></array>
		</dict>
	</array>
</dict>
</plist>
`;

const FILE_REF = 'A1B2C3D4E5F60718293A4B5C', BUILD_FILE = 'A1B2C3D4E5F60718293A4B5D';
export function patchPbxproj(src, { version, build }) {
  let p = src.replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
             .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
  if (!p.includes('PrivacyInfo.xcprivacy')) {
    p = p.replace('/* Begin PBXBuildFile section */\n', `/* Begin PBXBuildFile section */\n\t\t${BUILD_FILE} /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = ${FILE_REF} /* PrivacyInfo.xcprivacy */; };\n`)
         .replace('/* Begin PBXFileReference section */\n', `/* Begin PBXFileReference section */\n\t\t${FILE_REF} /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };\n`)
         .replace(/(\t+)(504EC3131FED79650016851F \/\* Info\.plist \*\/,\n)/, `$1$2$1${FILE_REF} /* PrivacyInfo.xcprivacy */,\n`)
         .replace(/(\t+)(504EC3121FED79650016851F \/\* LaunchScreen\.storyboard in Resources \*\/,\n)/, `$1$2$1${BUILD_FILE} /* PrivacyInfo.xcprivacy in Resources */,\n`);
  }
  return p;
}

export function semverToCode(v) { const [a = 0, b = 0, c = 0] = v.split('.').map(n => parseInt(n, 10) || 0); return a * 10000 + b * 100 + c; }

function run() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const build = parseInt(process.env.BUILD_NUMBER || '', 10) || semverToCode(pkg.version);
  const dir = join(root, 'ios', 'App');
  const edit = (p, fn) => { const f = join(dir, p); const before = readFileSync(f, 'utf8'); const after = fn(before); if (after !== before) writeFileSync(f, after); };
  edit('App/Info.plist', patchInfoPlist);
  edit('App/AppDelegate.swift', patchAppDelegate);
  writeFileSync(join(dir, 'App', 'PrivacyInfo.xcprivacy'), PRIVACY_MANIFEST);
  edit('App.xcodeproj/project.pbxproj', p => patchPbxproj(p, { version: pkg.version, build }));
  console.log(`ios 패치 완료 (version=${pkg.version}, build=${build})`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
