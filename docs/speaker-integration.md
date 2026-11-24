# 音箱端改造与 APK 接口

目标是天猫精灵 CCH 的 TG-Z02（MT8167、ARM32）。现有适配以 Android 8.1 AOSP、Linux 4.4.95+ 和原机扬声器驱动为基础。

```text
电脑的 USB 音频输出（UAC1）
  → 音箱 USB gadget 接收模块（tmall_uac1.ko）
  → /dev/tmall_usb_audio
  → 音箱进程 tmall-usb-bridge
  → 本机 TCP PCM
  → Android UsbAudioService / AudioTrack
  → 原机扬声器
```

## 音箱系统做了什么

| 组件 | 职责 |
| --- | --- |
| USB gadget 内核模块 | 给原系统增加 UAC1 接收功能。适配 MT8167 的 MUSB 等时 OUT 端点，并提供设备节点供桥接进程读取。模块需与设备内核的 ABI 匹配。 |
| USB 模式脚本 | 用 configfs 切换至 USB Audio + ADB。退出时恢复切换前的 USB 配置。 |
| PCM 桥接及 init 服务 | 加载模块、运行桥接和转发 PCM。桥接只绑定到音箱本机回环地址。 |

此前适配保留原机显示、触摸和音频驱动。系统组件需要由有设备维护权限的人针对对应固件准备。安装前应保留本机恢复备份，设备型号或内核版本变化时需重新确认模块兼容性。

## 应用怎样连接

| 通道 | 协议 |
| --- | --- |
| `127.0.0.1:18767` | 每个连接发送一条 UTF-8 文本命令，末尾为换行。命令为 `START`、`STOP` 或 `STATUS`。桥接返回一行 JSON，包含布尔型 `ok`、字符串型 `state` 和 `message`。 |
| `127.0.0.1:18768` | 音箱模式开启后，桥接推送 48 kHz、16-bit 小端、双声道交错 PCM。字节流无文件头。 |

应用优先使用上述 TCP 通道，并保留旧版抽象 LocalSocket 的回退路径。电脑只需选择 USB 音频输出，无需访问这两个端口。接口实现见 [UsbAudioService.java](../app/src/local/tmall/usbspeaker/UsbAudioService.java)。

`UsbAudioService` 将收到的 PCM 写入 `AudioTrack`，同时在单独线程计算振幅和频谱。可视化使用这份 PCM，无需麦克风权限。应用的网络权限还用于向中国气象局查询固定昆明站的天气，场景模型、纹理和动画均随 APK 离线打包。
