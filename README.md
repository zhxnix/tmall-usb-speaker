# 天猫精灵 CCH USB 音箱

把改造后的天猫精灵 CCH（TG-Z02、MT8167）用作电脑的 USB 音箱。Android 应用支持低延迟播放、原生流体可视化和离线 3D「冬日音响店」。场景随真实音频活动切换阅读和听歌状态，日期和昆明天气显示在店内时钟上。

**原厂音箱仅安装 APK 无法开启 USB 声卡模式。** 目标设备使用 AOSP Android 8.1、ARM32、Linux 4.4.95+，需要预先运行适配该内核的 UAC1 接收模块和设备端 PCM 桥接。参见[改造原理和接口](docs/speaker-integration.md)。

## 安装与使用

1. 从 [GitHub Releases](https://github.com/zhxnix/tmall-usb-speaker/releases) 下载 APK。在已配置兼容音频桥接的音箱上，用 ADB 安装。
   ```sh
   adb install -r tmall_usb_speaker.apk
   ```
2. 音箱用原电源供电，以 USB 数据线连接电脑。打开「USB 音箱」，选择「进入音箱模式」。
3. 在电脑的声音输出中选择 **Tmall USB Speaker**，然后播放音频。点击音箱画面可唤出控制并切换可视化。点击「退出音箱模式」会请求设备端恢复原 USB 配置。

公开版使用独立发布签名。设备若装有旧开发签名且包名相同的版本，Android 会拒绝覆盖安装。更换签名前可先保留应用设置，卸载旧版会清除其本地数据。后续公开版本可用相同发布签名覆盖更新。

## 从源码构建

需要 Python 3.9+、JDK 17、Android SDK Platform 35 和 Build Tools 35.0.0。既可用 Android Studio SDK Manager 安装，也可用命令行。

```sh
sdkmanager "platforms;android-35" "build-tools;35.0.0"
export ANDROID_HOME="/path/to/android-sdk"
python3 app/build.py
```

产物为 `app/build/tmall_usb_speaker.apk`。默认使用本机开发密钥。自带签名可设置 `APK_KEYSTORE`、`APK_KEY_ALIAS`（默认 `usbspeaker`）及 `APK_KEYSTORE_PASSWORD`，密钥文件留在仓库之外。

只预览 3D 场景时，在仓库根目录运行 `python3 -m http.server 8000 --bind 127.0.0.1 --directory scenes/listening-room`，打开 [本地预览](http://127.0.0.1:8000/)。浏览器模式可试听合成音频或选择本地音乐。APK 由 Android 原生服务将音频分析结果传给 WebView。

## 公开版内容

- `app/` 包含原生 Java 应用、资源和打包脚本。
- `scenes/listening-room/` 包含 Three.js 场景、离线打包脚本和可再分发的模型。零售专辑封面已替换为程序绘制的虚构封面。
- `docs/speaker-integration.md` 说明音箱端的改造、桥接协议和使用范围。仓库提供应用和配套接口文档，设备固件、分区备份、刷写工具和签名密钥由设备维护方管理。

原设备的音频链路曾在 macOS 上实机验证。公开版完成了 APK 构建和签名验证，打包后的场景在内置浏览器中验证。此公开版的 USB 播放尚未在实机复测，Windows 和 Linux 也暂无实机验证记录。

## 许可证

项目原创代码使用 [MIT 许可证](LICENSE)。Three.js、SiriWave 及 WebGL Fluid Simulation 的 MIT 声明随 APK 放在 [app/assets](app/assets)。小猫来自 Vuena / Popyca Studio 的 CC0 免费样本，顾客模型来自 Kenney、Quaternius 和 Kay Lousberg 的 CC0 模型集。模型目录保留了各自的许可证和可用的来源记录。
