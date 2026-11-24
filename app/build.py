"""Bundle the listening room and build a signed APK using the Android SDK."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import zipfile

APP = Path(__file__).resolve().parent
SCENE = APP.parent / "scenes" / "listening-room"


def run(*args):
    subprocess.run([str(arg) for arg in args], check=True)


def main():
    sdk_path = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT")
    if not sdk_path:
        raise SystemExit("Set ANDROID_HOME to your Android SDK directory.")
    sdk = Path(sdk_path)
    tools = sdk / "build-tools" / "35.0.0"
    platform = sdk / "platforms" / "android-35" / "android.jar"
    tool_names = ("aapt2", "d8", "zipalign", "apksigner")
    if sys.platform == "win32":
        tool_names = ("aapt2.exe", "d8.bat", "zipalign.exe", "apksigner.bat")
    aapt2, d8, zipalign, apksigner = [tools / name for name in tool_names]
    if not all(path.is_file() for path in (platform, aapt2, d8, zipalign, apksigner)):
        raise SystemExit("Install Android SDK Platform 35 and Build Tools 35.0.0.")
    java_home = os.environ.get("JAVA_HOME")
    java_bin = Path(java_home) / "bin" if java_home else Path(shutil.which("javac") or "javac").parent
    run(sys.executable, SCENE / "build_standalone.py")
    output = APP / "build" / "tmall_usb_speaker.apk"
    output.parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory() as directory:
        work = Path(directory)
        for name in ("gen", "classes", "dex"):
            (work / name).mkdir()
        shutil.copytree(APP / "assets", work / "assets")
        shutil.copyfile(SCENE / "output" / "listening-room.html", work / "assets" / "listening-room.html")
        run(aapt2, "compile", "--dir", APP / "res", "-o", work / "resources.zip")
        run(aapt2, "link", "-I", platform, "--manifest", APP / "AndroidManifest.xml",
            "--java", work / "gen", "-A", work / "assets", "-o", work / "unsigned.apk",
            work / "resources.zip")
        sources = sorted((APP / "src").rglob("*.java")) + sorted((work / "gen").rglob("*.java"))
        run(java_bin / "javac", "--release", "8", "-encoding", "UTF-8", "-classpath",
            platform, "-d", work / "classes", *sources)
        with zipfile.ZipFile(work / "classes.jar", "w", zipfile.ZIP_DEFLATED) as archive:
            for path in sorted((work / "classes").rglob("*.class")):
                archive.write(path, path.relative_to(work / "classes"))
        run(d8, "--min-api", 16, "--lib", platform, "--output", work / "dex", work / "classes.jar")
        with zipfile.ZipFile(work / "unsigned.apk", "a", zipfile.ZIP_DEFLATED) as archive:
            archive.write(work / "dex" / "classes.dex", "classes.dex")
        run(zipalign, "-f", 4, work / "unsigned.apk", work / "aligned.apk")

        custom_key = os.environ.get("APK_KEYSTORE")
        if custom_key:
            keystore = Path(custom_key).expanduser()
            alias = os.environ.get("APK_KEY_ALIAS", "usbspeaker")
            if not os.environ.get("APK_KEYSTORE_PASSWORD"):
                raise SystemExit("Set APK_KEYSTORE_PASSWORD when using APK_KEYSTORE.")
            credentials = ["--ks-pass", "env:APK_KEYSTORE_PASSWORD"]
        else:
            keystore = Path.home() / ".android" / "tmall-usb-speaker-dev.keystore"
            alias = "usbspeaker"
            credentials = ["--ks-pass", "pass:android", "--key-pass", "pass:android"]
            if not keystore.exists():
                keystore.parent.mkdir(parents=True, exist_ok=True)
                run(java_bin / "keytool", "-genkeypair", "-keystore", keystore,
                    "-storepass", "android", "-keypass", "android", "-alias", alias,
                    "-keyalg", "RSA", "-keysize", 2048, "-validity", 10000,
                    "-dname", "CN=Tmall USB Speaker Development", "-noprompt")
        run(apksigner, "sign", "--ks", keystore, "--ks-key-alias", alias, *credentials,
            "--out", output, work / "aligned.apk")
    print("Built", output)


if __name__ == "__main__":
    main()
