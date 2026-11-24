package local.tmall.usbspeaker;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioTrack;
import android.net.LocalSocket;
import android.net.LocalSocketAddress;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.Process;
import android.util.Log;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.Charset;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/** Bridges real PCM from the native USB UAC endpoint into the built-in AudioTrack. */
public final class UsbAudioService extends Service {
    private static final String TAG = "UsbAudioService";
    private static final int SAMPLE_RATE = 48000;
    private static final int FRAME_BYTES = 4;
    private static final int PLAYBACK_BLOCK_BYTES = 256 * FRAME_BYTES;
    // Four HAL periods absorb USB/bridge scheduling jitter without DEEP_BUFFER latency.
    private static final int PLAYBACK_BUFFER_BYTES = 1024 * FRAME_BYTES;
    private static final int ANALYSIS_SAMPLES = 256;
    // These sockets belong to the bridge on the modified speaker itself.
    // The computer only sees the UAC1 USB gadget. Android talks to the bridge
    // for configfs mode changes and receives raw stereo PCM over loopback.
    private static final int CONTROL_PORT = 18767;
    private static final int PCM_PORT = 18768;
    private static final int MAX_BOOT_RETRIES = 5;
    private static final long PCM_IDLE_MS = 500L;
    private static final float DISPLAY_SILENCE_GATE = 0.0015f;
    private static final float DISPLAY_TARGET_PEAK = 0.60f;
    private static final float DISPLAY_MAX_GAIN = 25.0f;
    private static final int NOTIFICATION_ID = 0x5342;
    private static final String CHANNEL_ID = "usb_speaker_audio";
    private static final Charset UTF8 = Charset.forName("UTF-8");
    private static final Object STATE_LOCK = new Object();
    private static String currentState = "stopped";
    private static String currentMessage = "尚未进入 USB 音箱模式";

    private final BlockingQueue<String> commands = new LinkedBlockingQueue<String>();
    private volatile boolean destroyed;
    private volatile boolean stopRequested;
    private Thread commandThread;
    private volatile Thread playbackThread;
    private volatile boolean playbackActive;
    private volatile boolean controlActive;
    private volatile boolean explicitStopRequested;
    private boolean bootRecovery;
    private int bootRetryCount;
    private final android.os.Handler mainHandler = new android.os.Handler(android.os.Looper.getMainLooper());
    private final Runnable bootRetryRunnable = new Runnable() {
        @Override public void run() {
            if (!destroyed && bootRecovery && !playbackActive) commands.offer("BOOT_RETRY");
        }
    };
    private long generationCounter;
    private volatile long activeGeneration;
    private volatile String playbackFailure;
    private AudioTrack audioTrack;
    private LocalSocket pcmSocket;
    private Socket pcmTcpSocket;
    private PowerManager.WakeLock wakeLock;
    private float[] analysis = new float[ANALYSIS_SAMPLES];
    private int analysisPosition;
    private int analysisCount;
    private long lastUi;
    private volatile long lastPcmUptime;
    private float displayGain = 1.0f;
    private AudioManager audioManager;
    private final BlockingQueue<float[]> analysisQueue = new LinkedBlockingQueue<float[]>(2);
    private volatile boolean analysisStopped;
    private Thread analysisThread;

    @Override public void onCreate() {
        super.onCreate();
        audioManager = (AudioManager) getSystemService(AUDIO_SERVICE);
        commandThread = new Thread(new Runnable() {
            @Override public void run() { commandLoop(); }
        }, "UsbSpeakerControl");
        commandThread.start();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        boolean enabled = getSharedPreferences(UsbSpeakerContract.PREFS_NAME, MODE_PRIVATE)
                .getBoolean(UsbSpeakerContract.PREF_ENABLED, false);
        String action = intent == null
                ? (enabled ? UsbSpeakerContract.ACTION_BOOT_START : UsbSpeakerContract.ACTION_STATUS)
                : intent.getAction();
        boolean explicitStopAction = UsbSpeakerContract.ACTION_STOP.equals(action);
        if (UsbSpeakerContract.ACTION_START.equals(action)) commands.offer("START");
        else if (UsbSpeakerContract.ACTION_BOOT_START.equals(action)) commands.offer("BOOT_START");
        else if (UsbSpeakerContract.ACTION_STOP.equals(action)) {
            // Close the blocking stream from the binder/main thread. The control thread then
            // joins the old PCM worker before it sends STOP or accepts another START.
            stopRequested = true;
            explicitStopRequested = true;
            bootRecovery = false;
            mainHandler.removeCallbacks(bootRetryRunnable);
            closePcm();
            Thread worker = playbackThread;
            if (worker != null) worker.interrupt();
            commands.offer("STOP");
        }
        else commands.offer("STATUS");
        boolean wantsSticky = enabled || UsbSpeakerContract.ACTION_START.equals(action)
                || UsbSpeakerContract.ACTION_BOOT_START.equals(action);
        return explicitStopAction ? START_NOT_STICKY : (wantsSticky ? START_STICKY : START_NOT_STICKY);
    }

    private void commandLoop() {
        while (!destroyed) {
            try {
                String command = commands.poll(500, TimeUnit.MILLISECONDS);
                if (command == null) {
                    checkPcmIdle();
                    continue;
                }
                if ("START".equals(command)) {
                    bootRecovery = false;
                    mainHandler.removeCallbacks(bootRetryRunnable);
                    startPlayback();
                }
                else if ("BOOT_START".equals(command)) {
                    bootRecovery = true;
                    bootRetryCount = 0;
                    mainHandler.removeCallbacks(bootRetryRunnable);
                    startPlayback();
                }
                else if ("BOOT_RETRY".equals(command)) startPlayback();
                else if (command.startsWith("PLAYBACK_END:")) {
                    try {
                        handlePlaybackEnd(Long.parseLong(command.substring("PLAYBACK_END:".length())));
                    } catch (NumberFormatException ignored) { }
                }
                else if ("STOP".equals(command)) {
                    boolean explicit = explicitStopRequested;
                    explicitStopRequested = false;
                    stopPlayback(true, explicit);
                }
                else broadcastState(0f, null, null);
            } catch (InterruptedException e) {
                if (destroyed) return;
            }
        }
    }

    private void startPlayback() {
        if (explicitStopRequested) {
            explicitStopRequested = false;
            stopPlayback(false, true);
            return;
        }
        synchronized (STATE_LOCK) {
            if (playbackActive || "streaming".equals(currentState) || "waiting".equals(currentState)) {
                broadcastState(0f, null, null);
                return;
            }
            currentState = "waiting";
            currentMessage = "正在连接 USB 音频驱动…";
        }
        broadcastState(0f, null, null);
        stopRequested = false;
        lastPcmUptime = 0L;
        resetAnalysisDisplay();
        playbackFailure = null;
        activeGeneration = ++generationCounter;
        playbackActive = true;
        acquireWakeLock();
        startForeground(NOTIFICATION_ID, makeNotification());

        String error = sendControl("START");
        if (error != null) {
            playbackActive = false;
            if (stopRequested && explicitStopRequested) {
                boolean explicit = explicitStopRequested;
                explicitStopRequested = false;
                stopPlayback(false, explicit);
            } else {
                fail(error);
                scheduleBootRetry();
            }
            return;
        }
        controlActive = true;
        saveEnabled(true);
        bootRetryCount = 0;
        if (stopRequested) {
            boolean explicit = explicitStopRequested;
            explicitStopRequested = false;
            stopPlayback(false, explicit);
            return;
        }
        try {
            final InputStream pcmInput = openPcmInput();
            audioTrack = createAudioTrack();
            audioTrack.play();
            synchronized (STATE_LOCK) {
                // A connected PCM socket is only a ready transport. Keep the UI in waiting
                // until at least one complete audio block has actually arrived.
                currentState = "waiting";
                currentMessage = "USB 音频通道已连接，等待电脑播放";
            }
            broadcastState(0f, null, null);
            startAnalysisWorker();
            if (stopRequested) {
                boolean explicit = explicitStopRequested;
                explicitStopRequested = false;
                stopPlayback(false, explicit);
                return;
            }
            final long token = activeGeneration;
            playbackThread = new Thread(new Runnable() {
                @Override public void run() {
                    runPlayback(token, pcmInput);
                }
            }, "UsbSpeakerPcm");
            playbackThread.start();
        } catch (Exception e) {
            if (stopRequested) {
                boolean explicit = explicitStopRequested;
                explicitStopRequested = false;
                stopPlayback(false, explicit);
            } else {
                fail("USB 音频接收失败：" + safeMessage(e));
                scheduleBootRetry();
            }
        }
    }

    /**
     * API 26+ devices need the Builder performance hint to avoid selecting DEEP_BUFFER.
     * The compile-time jar in this project is API 16, so the low-latency path is reflected.
     */
    private AudioTrack createAudioTrack() throws Exception {
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                AudioTrack track = createLowLatencyAudioTrack();
                logAudioTrackConfiguration(track, "LOW_LATENCY");
                return track;
            } catch (Exception e) {
                Log.w(TAG, "AudioTrack.Builder LOW_LATENCY failed; fallback: " + safeMessage(e));
            }
        } else {
            Log.i(TAG, "AudioTrack.Builder LOW_LATENCY unavailable on API " + Build.VERSION.SDK_INT);
        }
        int min = AudioTrack.getMinBufferSize(SAMPLE_RATE, AudioFormat.CHANNEL_OUT_STEREO,
                AudioFormat.ENCODING_PCM_16BIT);
        if (min <= 0) throw new IOException("设备不支持 48 kHz 立体声 PCM");
        Log.w(TAG, "AudioTrack fallback constructor; minBufferSize=" + min);
        AudioTrack track = new AudioTrack(AudioManager.STREAM_MUSIC, SAMPLE_RATE,
                AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_16BIT,
                min, AudioTrack.MODE_STREAM);
        logAudioTrackConfiguration(track, "FALLBACK");
        return track;
    }

    private AudioTrack createLowLatencyAudioTrack() throws Exception {
        Class<?> formatBuilderClass = Class.forName("android.media.AudioFormat$Builder");
        Object formatBuilder = formatBuilderClass.newInstance();
        formatBuilderClass.getMethod("setSampleRate", Integer.TYPE)
                .invoke(formatBuilder, SAMPLE_RATE);
        formatBuilderClass.getMethod("setChannelMask", Integer.TYPE)
                .invoke(formatBuilder, AudioFormat.CHANNEL_OUT_STEREO);
        formatBuilderClass.getMethod("setEncoding", Integer.TYPE)
                .invoke(formatBuilder, AudioFormat.ENCODING_PCM_16BIT);
        Object format = formatBuilderClass.getMethod("build").invoke(formatBuilder);

        Class<?> trackBuilderClass = Class.forName("android.media.AudioTrack$Builder");
        Object trackBuilder = trackBuilderClass.newInstance();
        trackBuilderClass.getMethod("setAudioFormat", Class.forName("android.media.AudioFormat"))
                .invoke(trackBuilder, format);
        trackBuilderClass.getMethod("setBufferSizeInBytes", Integer.TYPE)
                .invoke(trackBuilder, PLAYBACK_BUFFER_BYTES);
        trackBuilderClass.getMethod("setTransferMode", Integer.TYPE)
                .invoke(trackBuilder, AudioTrack.MODE_STREAM);
        // PERFORMANCE_MODE_LOW_LATENCY is 1. Keep it reflected because API 16's jar has no
        // Builder or performance constants even though the target device is API 27.
        trackBuilderClass.getMethod("setPerformanceMode", Integer.TYPE)
                .invoke(trackBuilder, 1);

        try {
            Class<?> attributesBuilderClass = Class.forName("android.media.AudioAttributes$Builder");
            Object attributesBuilder = attributesBuilderClass.newInstance();
            attributesBuilderClass.getMethod("setUsage", Integer.TYPE).invoke(attributesBuilder, 1); // MEDIA
            attributesBuilderClass.getMethod("setContentType", Integer.TYPE).invoke(attributesBuilder, 2); // MUSIC
            Object attributes = attributesBuilderClass.getMethod("build").invoke(attributesBuilder);
            trackBuilderClass.getMethod("setAudioAttributes", Class.forName("android.media.AudioAttributes"))
                    .invoke(trackBuilder, attributes);
        } catch (Exception e) {
            Log.w(TAG, "AudioAttributes MEDIA/MUSIC reflection unavailable: " + safeMessage(e));
        }
        return (AudioTrack) trackBuilderClass.getMethod("build").invoke(trackBuilder);
    }

    private void logAudioTrackConfiguration(AudioTrack track, String mode) {
        StringBuilder detail = new StringBuilder("AudioTrack ").append(mode);
        appendIntMethod(detail, track, "performance", "getPerformanceMode");
        appendIntMethod(detail, track, "bufferFrames", "getBufferSizeInFrames");
        appendIntMethod(detail, track, "capacityFrames", "getBufferCapacityInFrames");
        Log.i(TAG, detail.toString());
    }

    private void appendIntMethod(StringBuilder detail, AudioTrack track, String label, String method) {
        try {
            Object value = track.getClass().getMethod(method).invoke(track);
            detail.append(' ').append(label).append('=').append(value);
        } catch (Exception ignored) { }
    }

    private void runPlayback(long token, InputStream input) {
        String failure = null;
        try {
            streamPcm(input, token);
        } catch (Exception e) {
            if (!stopRequested && !destroyed && token == activeGeneration) {
                failure = "USB 音频接收失败：" + safeMessage(e);
            }
        }
        playbackFailure = failure;
        commands.offer("PLAYBACK_END:" + token);
    }

    private void handlePlaybackEnd(long token) {
        if (!playbackActive || token != activeGeneration) return;
        if (explicitStopRequested) return;
        String failure = playbackFailure;
        playbackFailure = null;
        String stopError = cleanupPlayback(true);
        synchronized (STATE_LOCK) {
            if (failure != null || stopError != null) {
                currentState = "error";
                currentMessage = failure != null ? failure : "停止 USB 音频驱动失败：" + stopError;
            } else {
                currentState = "stopped";
                currentMessage = "USB 音频连接已断开";
            }
        }
        broadcastVisualClearedState();
    }

    private void checkPcmIdle() {
        long last = lastPcmUptime;
        if (!playbackActive || last <= 0L || android.os.SystemClock.uptimeMillis() - last <= PCM_IDLE_MS) return;
        boolean changed = false;
        synchronized (STATE_LOCK) {
            if ("streaming".equals(currentState)) {
                currentState = "waiting";
                currentMessage = "等待电脑音频";
                changed = true;
            }
        }
        if (changed) broadcastVisualClearedState();
    }

    private void resetAnalysisDisplay() {
        analysisPosition = 0;
        analysisCount = 0;
        lastUi = 0L;
        displayGain = 1.0f;
        analysisQueue.clear();
    }

    private void scheduleBootRetry() {
        if (!bootRecovery || destroyed || playbackActive || bootRetryCount >= MAX_BOOT_RETRIES) {
            if (bootRetryCount >= MAX_BOOT_RETRIES) bootRecovery = false;
            return;
        }
        bootRetryCount++;
        long delay = 350L + bootRetryCount * 250L;
        mainHandler.removeCallbacks(bootRetryRunnable);
        mainHandler.postDelayed(bootRetryRunnable, delay);
    }

    private void saveEnabled(boolean enabled) {
        getSharedPreferences(UsbSpeakerContract.PREFS_NAME, MODE_PRIVATE)
                .edit().putBoolean(UsbSpeakerContract.PREF_ENABLED, enabled).apply();
    }

    private void streamPcm(InputStream input, long token) throws IOException {
        Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO);
        byte[] read = new byte[8192];
        byte[] buffer = new byte[32768];
        int pending = 0;
        while (!stopRequested && !destroyed && token == activeGeneration) {
            int room = buffer.length - pending;
            if (room < FRAME_BYTES) {
                pending = 0;
                room = buffer.length;
            }
            int count = input.read(read, 0, Math.min(read.length, room));
            if (count < 0) break;
            if (count == 0) continue;
            System.arraycopy(read, 0, buffer, pending, count);
            pending += count;
            // Keep writes at 256 stereo frames (5.33 ms at 48 kHz). A USB read may end on
            // any byte boundary; the carry bytes stay in the buffer until a complete block.
            int usable = pending - pending % PLAYBACK_BLOCK_BYTES;
            if (usable > 0) {
                writeAudio(buffer, usable, token);
                lastPcmUptime = android.os.SystemClock.uptimeMillis();
                markStreaming(token);
                analyze(buffer, usable, token);
            }
            int remain = pending - usable;
            if (remain > 0) System.arraycopy(buffer, usable, buffer, 0, remain);
            pending = remain;
        }
    }

    private void markStreaming(long token) {
        boolean changed = false;
        synchronized (STATE_LOCK) {
            if (!stopRequested && token == activeGeneration && "waiting".equals(currentState)) {
                currentState = "streaming";
                currentMessage = "正在播放电脑音频";
                changed = true;
            }
        }
        if (changed) broadcastState(0f, null, null);
    }

    private void writeAudio(byte[] bytes, int length, long token) throws IOException {
        if (audioTrack == null) return;
        int offset = 0;
        while (offset < length && !stopRequested && !destroyed && token == activeGeneration) {
            int wrote = audioTrack.write(bytes, offset, length - offset);
            if (wrote < 0) throw new IOException("AudioTrack.write=" + wrote);
            if (wrote == 0) continue;
            offset += wrote;
        }
    }

    private void analyze(byte[] bytes, int length, long token) {
        if (token != activeGeneration || stopRequested || destroyed) return;
        for (int i = 0; i + 3 < length; i += FRAME_BYTES) {
            short left = (short) ((bytes[i] & 0xff) | (bytes[i + 1] << 8));
            short right = (short) ((bytes[i + 2] & 0xff) | (bytes[i + 3] << 8));
            float sample = (left + right) / 65536f;
            analysis[analysisPosition] = sample;
            analysisPosition = (analysisPosition + 1) % ANALYSIS_SAMPLES;
            if (analysisCount < ANALYSIS_SAMPLES) analysisCount++;
        }
        long now = android.os.SystemClock.uptimeMillis();
        if (now - lastUi < 33) return;
        lastUi = now;
        float[] window = orderedAnalysis();
        // Only the ring copy happens on the audio thread. DFT, allocation and broadcasts run
        // on analysisThread so they cannot add jitter to AudioTrack.write().
        if (!analysisQueue.offer(window)) {
            analysisQueue.poll();
            analysisQueue.offer(window);
        }
    }

    private void startAnalysisWorker() {
        stopAnalysisWorker();
        analysisStopped = false;
        analysisQueue.clear();
        analysisThread = new Thread(new Runnable() {
            @Override public void run() {
                while (!analysisStopped && !destroyed) {
                    try {
                        float[] window = analysisQueue.take();
                        publishAnalysis(window);
                    } catch (InterruptedException e) {
                        if (analysisStopped || destroyed) return;
                    }
                }
            }
        }, "UsbSpeakerViz");
        analysisThread.start();
    }

    private void stopAnalysisWorker() {
        analysisStopped = true;
        if (analysisThread != null) {
            analysisThread.interrupt();
            analysisThread = null;
        }
        analysisQueue.clear();
    }

    private void publishAnalysis(float[] window) {
        if (analysisStopped || destroyed) return;
        float peak = 0f;
        for (float value : window) peak = Math.max(peak, Math.abs(value));
        if (peak <= DISPLAY_SILENCE_GATE) {
            displayGain = 1.0f;
            if (!analysisStopped && !destroyed) {
                broadcastState(0f, new float[64], new float[24]);
            }
            return;
        }
        float targetGain = Math.min(DISPLAY_MAX_GAIN, DISPLAY_TARGET_PEAK / peak);
        displayGain += (targetGain - displayGain) * 0.24f;
        float[] wave = new float[64];
        for (int i = 0; i < wave.length; i++) {
            int from = i * window.length / wave.length;
            int to = Math.max(from + 1, (i + 1) * window.length / wave.length);
            float average = 0f;
            for (int j = from; j < to; j++) average += window[j];
            wave[i] = clampDisplay(average / (to - from) * displayGain);
        }
        float displayPeak = Math.min(1.0f, peak * displayGain);
        if (!analysisStopped && !destroyed) broadcastState(displayPeak, wave, spectrum(window));
    }

    private static float clampDisplay(float value) {
        return Math.max(-0.95f, Math.min(0.95f, value));
    }

    private float[] orderedAnalysis() {
        float[] result = new float[ANALYSIS_SAMPLES];
        int missing = ANALYSIS_SAMPLES - analysisCount;
        for (int i = 0; i < ANALYSIS_SAMPLES; i++) {
            int index = (analysisPosition + i) % ANALYSIS_SAMPLES;
            result[i] = i < missing ? 0f : analysis[index];
        }
        return result;
    }

    /** Small DFT over the actual last 256 samples; enough for the visualizer on this ARM board. */
    private float[] spectrum(float[] samples) {
        float[] result = new float[24];
        int n = samples.length;
        for (int band = 0; band < result.length; band++) {
            double fraction = band / (double) (result.length - 1);
            double frequency = 70.0 * Math.pow(170.0, fraction);
            int bin = Math.max(1, Math.min(n / 2 - 1, (int) (frequency * n / SAMPLE_RATE)));
            double real = 0.0;
            double imag = 0.0;
            for (int i = 0; i < n; i++) {
                double phase = 2.0 * Math.PI * bin * i / n;
                real += samples[i] * Math.cos(phase);
                imag -= samples[i] * Math.sin(phase);
            }
            float magnitude = (float) (Math.sqrt(real * real + imag * imag) * 4.0 / n);
            if (magnitude <= 0.001f) {
                result[band] = 0f;
            } else {
                float db = (float) (20.0 * Math.log10(magnitude));
                result[band] = Math.max(0f, Math.min(1f, (db + 60f) / 60f));
            }
        }
        return result;
    }

    private void stopPlayback(boolean stopService, boolean explicitStop) {
        stopRequested = true;
        String stopError = cleanupPlayback(true);
        if (explicitStop) saveEnabled(false);
        synchronized (STATE_LOCK) {
            if (stopError != null) {
                currentState = "error";
                currentMessage = "停止 USB 音频驱动失败：" + stopError;
            } else {
                currentState = "stopped";
                currentMessage = "已退出 USB 音箱模式";
            }
        }
        broadcastVisualClearedState();
        if (stopService && !destroyed && stopError == null) stopSelf();
    }

    private void fail(String reason) {
        stopRequested = true;
        String stopError = cleanupPlayback(true);
        synchronized (STATE_LOCK) {
            currentState = "error";
            currentMessage = stopError == null ? reason : reason + "；停止驱动失败：" + stopError;
        }
        broadcastVisualClearedState();
    }

    /** Runs only on the control thread; the PCM worker never sends a control STOP itself. */
    private String cleanupPlayback(boolean sendStop) {
        stopRequested = true;
        closePcm();
        Thread worker = playbackThread;
        if (worker != null && worker != Thread.currentThread()) {
            worker.interrupt();
            try { worker.join(800); } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }
        playbackThread = null;
        stopAnalysisWorker();
        releaseAudioTrack();
        String stopError = null;
        if (sendStop && controlActive) {
            controlActive = false;
            stopError = sendControl("STOP");
        } else {
            controlActive = false;
        }
        releaseWakeLock();
        stopForeground(true);
        playbackActive = false;
        activeGeneration++;
        return stopError;
    }

    /** TCP loopback is the primary bridge on SELinux enforcing builds; LocalSocket is fallback. */
    private InputStream openPcmInput() throws IOException {
        IOException tcpFailure;
        try {
            pcmTcpSocket = new Socket();
            pcmTcpSocket.setTcpNoDelay(true);
            // Keep the kernel receive queue close to one 256-frame playback block. The
            // bridge already uses a small SO_SNDBUF; a large default receive queue can hide
            // tens of milliseconds of latency before AudioTrack sees the samples.
            pcmTcpSocket.setReceiveBufferSize(2048);
            pcmTcpSocket.connect(new InetSocketAddress("127.0.0.1", PCM_PORT), 900);
            Log.i(TAG, "PCM loopback receive buffer=" + pcmTcpSocket.getReceiveBufferSize());
            return pcmTcpSocket.getInputStream();
        } catch (IOException e) {
            tcpFailure = e;
            if (pcmTcpSocket != null) {
                try { pcmTcpSocket.close(); } catch (IOException ignored) { }
                pcmTcpSocket = null;
            }
        }
        try {
            pcmSocket = new LocalSocket();
            pcmSocket.connect(new LocalSocketAddress(UsbSpeakerContract.PCM_SOCKET,
                    LocalSocketAddress.Namespace.ABSTRACT));
            return pcmSocket.getInputStream();
        } catch (IOException localFailure) {
            throw new IOException("TCP 127.0.0.1:" + PCM_PORT + " / LocalSocket 均未就绪", tcpFailure);
        }
    }

    private String sendControl(String command) {
        try {
            return sendTcpControl(command);
        } catch (IOException tcpFailure) {
            try {
                return sendLocalControl(command);
            } catch (IOException localFailure) {
                return "音频驱动未就绪：TCP/LocalSocket 均不可用";
            }
        }
    }

    private String sendTcpControl(String command) throws IOException {
        Socket socket = new Socket();
        try {
            socket.connect(new InetSocketAddress("127.0.0.1", CONTROL_PORT), 900);
            socket.setSoTimeout(1800);
            OutputStream out = socket.getOutputStream();
            out.write((command + "\n").getBytes(UTF8));
            out.flush();
            return parseControlResponse(socket.getInputStream());
        } finally {
            try { socket.close(); } catch (IOException ignored) { }
        }
    }

    private String sendLocalControl(String command) throws IOException {
        LocalSocket socket = new LocalSocket();
        try {
            socket.connect(new LocalSocketAddress(UsbSpeakerContract.CONTROL_SOCKET,
                    LocalSocketAddress.Namespace.ABSTRACT));
            socket.setSoTimeout(1800);
            OutputStream out = socket.getOutputStream();
            out.write((command + "\n").getBytes(UTF8));
            out.flush();
            return parseControlResponse(socket.getInputStream());
        } finally {
            try { socket.close(); } catch (IOException ignored) { }
        }
    }

    private String parseControlResponse(InputStream input) throws IOException {
        BufferedReader reader = new BufferedReader(new InputStreamReader(input, UTF8));
        String line = reader.readLine();
        if (line == null) return "音频驱动未返回状态";
        if (!jsonBoolean(line, "ok")) return jsonString(line, "message", "音频驱动拒绝请求");
        return null;
    }

    // Keep the bridge protocol dependency-free: this accepts the tiny one-line JSON response
    // emitted by the native helper without bundling a second JSON library in the APK.
    private static boolean jsonBoolean(String json, String key) {
        String token = "\"" + key + "\"";
        int at = json.indexOf(token);
        if (at < 0) return false;
        int colon = json.indexOf(':', at + token.length());
        return colon >= 0 && json.substring(colon + 1).trim().startsWith("true");
    }

    private static String jsonString(String json, String key, String fallback) {
        String token = "\"" + key + "\"";
        int at = json.indexOf(token);
        if (at < 0) return fallback;
        int colon = json.indexOf(':', at + token.length());
        if (colon < 0) return fallback;
        int first = json.indexOf('"', colon + 1);
        if (first < 0) return fallback;
        int second = json.indexOf('"', first + 1);
        if (second <= first) return fallback;
        return json.substring(first + 1, second);
    }

    private static String safeMessage(Exception e) {
        String message = e.getMessage();
        return message == null || message.length() == 0 ? e.getClass().getSimpleName() : message;
    }

    private void closePcm() {
        if (pcmSocket != null) {
            try { pcmSocket.close(); } catch (IOException ignored) { }
            pcmSocket = null;
        }
        if (pcmTcpSocket != null) {
            try { pcmTcpSocket.close(); } catch (IOException ignored) { }
            pcmTcpSocket = null;
        }
    }

    private void releaseAudioTrack() {
        AudioTrack track = audioTrack;
        audioTrack = null;
        if (track != null) {
            try { track.pause(); } catch (RuntimeException ignored) { }
            try { track.flush(); } catch (RuntimeException ignored) { }
            try { track.release(); } catch (RuntimeException ignored) { }
        }
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "UsbSpeaker:Audio");
        wakeLock.setReferenceCounted(false);
        wakeLock.acquire();
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
    }

    private Notification makeNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26) {
            try {
                Class<?> channelClass = Class.forName("android.app.NotificationChannel");
                Object channel = channelClass.getConstructor(String.class, CharSequence.class, int.class)
                        .newInstance(CHANNEL_ID, "USB 音箱", 2);
                manager.getClass().getMethod("createNotificationChannel", channelClass).invoke(manager, channel);
            } catch (Exception ignored) { }
        }
        Intent launch = new Intent(this, MainActivity.class);
        PendingIntent pending = PendingIntent.getActivity(this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder builder = new Notification.Builder(this)
                .setContentTitle("USB 音箱")
                .setContentText("正在等待电脑音频")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setOngoing(true)
                .setContentIntent(pending);
        if (Build.VERSION.SDK_INT >= 26) {
            try { builder.getClass().getMethod("setChannelId", String.class).invoke(builder, CHANNEL_ID); }
            catch (Exception ignored) { }
        }
        return builder.build();
    }

    private void broadcastState(float amplitude, float[] wave, float[] bars) {
        Intent intent = new Intent(UsbSpeakerContract.ACTION_STATE);
        intent.setPackage(getPackageName());
        synchronized (STATE_LOCK) {
            intent.putExtra(UsbSpeakerContract.EXTRA_STATE, currentState);
            intent.putExtra(UsbSpeakerContract.EXTRA_MESSAGE, currentMessage);
        }
        intent.putExtra(UsbSpeakerContract.EXTRA_AMPLITUDE, amplitude);
        if (wave != null) intent.putExtra(UsbSpeakerContract.EXTRA_WAVE, wave);
        if (bars != null) intent.putExtra(UsbSpeakerContract.EXTRA_SPECTRUM, bars);
        if (audioManager != null) {
            intent.putExtra(UsbSpeakerContract.EXTRA_VOLUME,
                    audioManager.getStreamVolume(AudioManager.STREAM_MUSIC));
            intent.putExtra(UsbSpeakerContract.EXTRA_MAX_VOLUME,
                    audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC));
        }
        sendBroadcast(intent);
    }

    private void broadcastVisualClearedState() {
        broadcastState(0f, new float[64], new float[24]);
    }

    @Override public void onDestroy() {
        destroyed = true;
        stopRequested = true;
        closePcm();
        if (commandThread != null) commandThread.interrupt();
        stopPlayback(false, false);
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
