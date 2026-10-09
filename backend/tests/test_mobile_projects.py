"""네이티브 프로젝트 파일의 구조적 올바름(Xcode/Android Studio 없이 확인 가능한 범위)."""
import plistlib
import pathlib
import xml.etree.ElementTree as ET

APP = pathlib.Path(__file__).parents[2] / "app"
IOS = APP / "ios" / "App" / "App"
AND = APP / "android" / "app" / "src" / "main"


def test_ios_plists_are_valid_and_complete():
    info = plistlib.loads((IOS / "Info.plist").read_bytes())
    for k in ("NSLocationWhenInUseUsageDescription", "NSLocationAlwaysAndWhenInUseUsageDescription", "NSMicrophoneUsageDescription",
              "NSSpeechRecognitionUsageDescription", "NSCameraUsageDescription", "NSPhotoLibraryUsageDescription"):
        assert info[k].strip(), k
    assert set(info["UIBackgroundModes"]) == {"location", "audio"}
    assert info["ITSAppUsesNonExemptEncryption"] is False
    pm = plistlib.loads((IOS / "PrivacyInfo.xcprivacy").read_bytes())
    assert pm["NSPrivacyTracking"] is False
    types = {d["NSPrivacyCollectedDataType"] for d in pm["NSPrivacyCollectedDataTypes"]}
    assert {"NSPrivacyCollectedDataTypePreciseLocation", "NSPrivacyCollectedDataTypeOtherUserContent",
            "NSPrivacyCollectedDataTypePhotosorVideos"} <= types
    assert all(d["NSPrivacyCollectedDataTypeLinked"] is False and d["NSPrivacyCollectedDataTypeTracking"] is False
               for d in pm["NSPrivacyCollectedDataTypes"])


def test_android_manifest_is_wellformed_and_minimal():
    ns = {"a": "http://schemas.android.com/apk/res/android"}
    root = ET.parse(AND / "AndroidManifest.xml").getroot()
    app = root.find("application")
    assert app.get("{%s}allowBackup" % ns["a"]) == "false"
    perms = {p.get("{%s}name" % ns["a"]): p.get("{http://schemas.android.com/tools}node") for p in root.findall("uses-permission")}
    assert perms["android.permission.RECEIVE_BOOT_COMPLETED"] == "remove"
    assert "android.permission.CAMERA" not in perms and "android.permission.ACCESS_BACKGROUND_LOCATION" not in perms


def test_privacy_manifest_matches_privacy_policy_claims():
    """방침에서 '추적 없음/계정 없음'이라 했으면 매니페스트도 같아야 한다."""
    policy = (pathlib.Path(__file__).parents[2] / "web" / "privacy.html").read_text()
    assert "추적 SDK를 사용하지 않습니다" in policy
    assert plistlib.loads((IOS / "PrivacyInfo.xcprivacy").read_bytes())["NSPrivacyTracking"] is False
