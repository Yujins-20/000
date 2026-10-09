// Capacitor 가 생성한 android/ 를 스토어 배포용으로 조정한다 (멱등: 여러 번 실행해도 결과 동일).
//   node scripts/patch-android.mjs         (BUILD_NUMBER 환경변수로 versionCode 지정 가능)
//  - 백업 끄기(위치·대화 데이터가 클라우드 백업에 섞이지 않게), 평문 HTTP 금지
//  - 쓰지 않는 부팅 수신/지오펜스 권한 제거(스토어 심사 범위 축소)
//  - 마이크·카메라·GPS 는 필수 하드웨어가 아님(없어도 설치 가능)
//  - versionName/versionCode 를 package.json 과 동기화, 릴리스 서명은 환경변수로 주입
//  - 백그라운드 위치 알림 채널 이름/아이콘
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const GEO = 'com.capgo.capacitor_background_geolocation';

export function patchManifest(xml) {
  let x = xml;
  if (!x.includes('xmlns:tools')) x = x.replace('<manifest xmlns:android="http://schemas.android.com/apk/res/android">', '<manifest xmlns:android="http://schemas.android.com/apk/res/android"\n    xmlns:tools="http://schemas.android.com/tools">');
  x = x.replace(/android:allowBackup="[^"]*"/, 'android:allowBackup="false"');
  if (!x.includes('usesCleartextTraffic')) x = x.replace('android:allowBackup="false"', 'android:allowBackup="false"\n        android:usesCleartextTraffic="false"');
  const MARK = '<!-- walkguide:patched -->';
  if (!x.includes(MARK)) {
    const block = `    ${MARK}
    <!-- 플러그인이 기본으로 넣는, 우리가 쓰지 않는 항목 제거 (지오펜스 부팅 수신) -->
    <uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" tools:node="remove" />
    <!-- 센서/하드웨어는 필수가 아님: 없는 기기에서도 설치 가능(기능만 제한) -->
    <uses-feature android:name="android.hardware.location.gps" android:required="false" tools:node="replace" />
    <uses-feature android:name="android.hardware.microphone" android:required="false" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
`;
    x = x.replace('    <!-- Permissions -->', block + '\n    <!-- Permissions -->');
    x = x.replace('    </application>', `        <receiver android:name="${GEO}.GeofenceBootReceiver" tools:node="remove" />\n    </application>`);
  }
  return x;
}

export function patchBuildGradle(gradle, { versionName, versionCode }) {
  let g = gradle.replace(/versionCode \d+/, `versionCode ${versionCode}`).replace(/versionName "[^"]*"/, `versionName "${versionName}"`);
  if (!g.includes('walkguide-signing')) {
    g = g.replace('    buildTypes {', `    // walkguide-signing: 릴리스 서명은 환경변수(CI 비밀값)로만 주입한다. 키스토어를 저장소에 넣지 않는다.
    signingConfigs {
        release {
            if (System.getenv("ANDROID_KEYSTORE_FILE")) {
                storeFile file(System.getenv("ANDROID_KEYSTORE_FILE"))
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }
    buildTypes {`);
    g = g.replace("        release {\n            minifyEnabled false", "        release {\n            if (System.getenv(\"ANDROID_KEYSTORE_FILE\")) { signingConfig signingConfigs.release }\n            minifyEnabled false");
  }
  return g;
}

export function patchStrings(xml) {
  if (xml.includes('capacitor_background_geolocation_notification_channel_name')) return xml;
  return xml.replace('</resources>', `    <string name="capacitor_background_geolocation_notification_channel_name">안내 중 알림</string>
    <string name="capacitor_background_geolocation_notification_icon">drawable/ic_tracking</string>
    <string name="capacitor_background_geolocation_notification_color">#C1440E</string>
</resources>`);
}

export const IC_TRACKING = `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <!-- 알림 아이콘은 투명 배경의 단색(흰색)이어야 한다 -->
    <path android:fillColor="#FFFFFFFF" android:pathData="M12,3a9,9 0,0 0,-9 9v7a3,3 0,0 0,3 3h1a1,1 0,0 0,1 -1v-6a1,1 0,0 0,-1 -1H5v-2a7,7 0,0 1,14 0v2h-2a1,1 0,0 0,-1 1v6a1,1 0,0 0,1 1h1a3,3 0,0 0,3 -3v-7a9,9 0,0 0,-9 -9z" />
</vector>
`;

export function semverToCode(v) { const [a = 0, b = 0, c = 0] = v.split('.').map(n => parseInt(n, 10) || 0); return a * 10000 + b * 100 + c; }

function run() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const code = parseInt(process.env.BUILD_NUMBER || '', 10) || semverToCode(pkg.version);
  const app = join(root, 'android', 'app');
  const edit = (p, fn) => { const f = join(app, p); const before = readFileSync(f, 'utf8'); const after = fn(before); if (after !== before) writeFileSync(f, after); };
  edit('src/main/AndroidManifest.xml', patchManifest);
  edit('build.gradle', g => patchBuildGradle(g, { versionName: pkg.version, versionCode: code }));
  edit('src/main/res/values/strings.xml', patchStrings);
  const dr = join(app, 'src/main/res/drawable'); mkdirSync(dr, { recursive: true });
  writeFileSync(join(dr, 'ic_tracking.xml'), IC_TRACKING);
  console.log(`android 패치 완료 (versionName=${pkg.version}, versionCode=${code})`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) run();
