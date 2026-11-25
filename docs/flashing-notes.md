# TG-Z02 刷机实录与踩坑

这份记录来自 2026 年 11 月 1–3 日在一台天猫精灵 CCH（TG-Z02、MT8167）上的 AOSP 8.1 移植和 USB 音频调试。起点是已解锁、运行 2023-01-06 版 system 的设备。成功刷入的是针对本机适配的镜像。原厂云端语音、设备绑定应用、账号和配网数据会随系统更换或数据分区重建而丢失，恢复时用本机备份。

## 实际走通的路线

1. **确认机型、固件和读取通道。** 实机是 ARMv7、32 位 Binder、A-only、独立 `vendor`、非 system-as-root。标准 macOS Platform Tools 的 fastboot 通过产品和分区只读查询后，才用于写入。原厂阶段曾出现 ADB 显示 `device`、普通 shell 却返回 `closed`，两种状态需分别验证。
2. **备份当时这台机器。** 通过 BROM 读取 GPT、整个 eMMC user 区和两个硬件 boot 区，再导出独立分区，包括 `boot`、`system`、`vendor`、`userdata`、`cache` 和 `miscdata`。BROM 在本机需完全关机后按住静音键插 USB，枚举窗口约四五秒。一次读取仅约 0.74–0.80 MiB/s，完成情况以实际读到的长度和分区能否导出为准。含账号和设备身份的备份保存在本地。
3. **准备匹配镜像。** 以 [phh Treble v32 的 ARM A-only Android 8.1 镜像](https://github.com/phhusson/treble_experimentations/releases/tag/v32) 为 system 基础，以本机当时的 boot 为适配基础。保留原内核、板级设备树、vendor、DTBO、LK、preloader 及身份和校准分区。对照本机 vendor 核对 SELinux、挂载和音频库依赖，并为新系统准备有效的 userdata、cache 文件系统。
4. **分开验证写入和启动。** 实际用 fastboot 写入 `boot`、`system`、`userdata`、`cache` 四个分区。重启后检查 `sys.boot_completed`、原生 Settings 与 Launcher2、触摸导航、亮度、Wi-Fi 扫描和原机扬声器出声。后续修好 Wi-Fi 连接及 DNS，并重启验证。蓝牙服务能开启，配对、蓝牙音频接收、相机和麦克风未完成验收。
5. **系统稳定后再接 USB 音频。** 后续在 AOSP 上加入 UAC1 接收模块、桥接和 APK，重启后验证 macOS 能识别设备、连续收音频并由原机扬声器播放。退出音箱模式后也验证了普通 ADB 恢复。组件职责见 [改造与 APK 接口](speaker-integration.md)。

## 当时遇到的问题

| 现象 | 查到的原因与处理 |
| --- | --- |
| 老 boot 曾经能开机，为什么不能直接用来恢复？ | 旧 system 备份是 2021-05-18，刷机前现机是 2023-01-06。回退基线应采用同一轮、同一台机器读出的匹配镜像，特别是 boot、system 和 vendor。 |
| fastboot 在 Windows 旧工具下能枚举，传输却超时 | 当时的 UsbDk 通道、自写客户端和设备状态都有变量。后来标准 macOS fastboot 的只读查询及正式刷入均成功。先验证读操作，再判断通道能否用于刷写。 |
| system 下载后看似能放进分区，实际超大 | 解压后的文件仍是 Android sparse；按头部展开约 1,253 MiB，system 只有 976 MiB。这次先调整 ext4 文件系统到目标大小，再检查文件系统结构。直接截断镜像会破坏文件系统。 |
| userdata 的 fastboot 容量与 GPT 不一致 | LK 报 800 MiB，GPT 上约 1.83 GiB。初次安装用匹配 fastboot 上限的有效 ext4，挂载后自动扩展。原 userdata 备份保留完整大小，不能拿这个初装办法裁剪回退镜像。 |
| 擦除 data/cache 或清包数据库后，问题变得更多 | 这个 vendor 布局下不能指望空分区自动格式化。删除 `packages.xml`、冻结系统组件和改启动脚本曾叠在一起，随后出现第三方应用消失及启动异常，无法定位单个原因。改为写入有效的初始 ext4，每次只改一处。 |
| 刷写显示极端用时或 0 KB/s | 大量零填充使进度很慢，工具的用时估计出现异常，实际写入仍在推进。结合连续进度和分区 `OKAY` 判断写入，再以重启结果判断启动。 |
| 原生设置装不上、导航栏缺失、扬声器需要额外适配 | 原厂 Settings 共享系统 UID，平台签名和 AOSP 不同，普通 APK 无法覆盖。启动类路径含原厂框架引用，vendor 属性还优先关闭导航键。移植时适配了类路径和导航属性，并为原音频 HAL 补齐 `libUS_resample.so`、`libblisrc32.so`。 |
| Wi-Fi 能扫描却无法保存网络，或能连但域名超时 | `/data/misc` 位于独立 `miscdata` 分区，重建 userdata 仍保留了含 MTK `SimSlot` 字段的旧配置。保留旧文件后让 AOSP 重建，解决保存失败。域名超时另有 IPv6 link-local DNS 兼容问题，使用同一网络下发的 IPv4 DNS 后恢复。 |
| 电脑识别声卡，但音箱不连续出声 | MT8167 MUSB 的 non-QMU 路径漏设音频 OUT 的 ISO 位，实测只收首包。修正后看 PCM 计数是否连续增长并实际听音。退出后 ADB 恢复曾受 configfs 相对链接影响，保存原配置时改用绝对链接目标。 |

## 回退时怎么判断

- 用同一台音箱、同一时间点的备份作基线。仅改过 boot 的实验和已替换四个分区的 AOSP 移植，恢复范围不同。原版桌面的切换设置也不能替代固件还原。
- 完整回退需核对所有实际变更过的分区。若还要恢复移植前的 Wi-Fi 状态，将后续改过的 `miscdata` 一并纳入。保留设备自己的身份和校准分区。
- 如果 fastboot 按 800 MiB 拒绝全长 userdata 镜像，保留原备份，采用能按实际 GPT 访问分区的恢复通道。这个项目验证了 BROM 备份读取和 AOSP 刷入，AOSP 启动成功后未执行整套原系统回刷。
