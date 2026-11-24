package local.tmall.usbspeaker;

import android.content.Context;
import android.os.SystemClock;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.lang.reflect.Method;

/** Offline WebGL second scene; the existing service remains the sole audio player. */
public final class MiniatureView extends WebView {
    public interface Listener { void onSceneStatus(String message); }
    private static final String TAG = "MiniatureScene";
    private Listener listener;
    private final Method evaluate;
    private final KunmingWeather weather;
    private String weatherPayload;
    private boolean weatherDirty;
    private boolean active, ready, dirty = true, streaming, transportStreaming, disposed;
    private float amplitude;
    private final float[] bass = new float[3];
    private int probes;
    private long lastPeek, lastAudible;

    private final Runnable pump = new Runnable() {
        @Override public void run() {
            if (!active || disposed) return;
            boolean audibleNow = transportStreaming && lastAudible > 0L
                    && SystemClock.uptimeMillis() - lastAudible < 2200L;
            if (audibleNow != streaming) { streaming = audibleNow; dirty = true; }
            if (ready && weatherDirty && weatherPayload != null) {
                weatherDirty = false;
                javascript("if(window.ListeningRoom)ListeningRoom.setWeather(" + weatherPayload + ");", null);
            }
            if (ready && dirty) {
                dirty = false;
                String script = "if(window.ListeningRoom){ListeningRoom.setPlaying(" + streaming
                        + ");ListeningRoom.updateFromPCM(" + amplitude + ",[" + bass[0] + ","
                        + bass[1] + "," + bass[2] + "]);}";
                javascript(script, null);
            }
            postDelayed(this, 100);
        }
    };
    private final Runnable probe = new Runnable() {
        @Override public void run() {
            if (!active || disposed) return;
            javascript("window.ListeningRoom ? JSON.stringify(ListeningRoom.stats()) : null",
                    new ValueCallback<String>() {
                @Override public void onReceiveValue(String value) {
                    if (disposed) return;
                    if (value != null && value.indexOf("fps") >= 0) {
                        if (!ready) { ready = true; dirty = true; status(""); }
                        Log.i(TAG, "render " + value.replace("\\\"", "\""));
                    }
                    if (!ready && ++probes >= 20) {
                        status("小店暂时未能打开，可轻触屏幕切回流体界面");
                    }
                    if (active) postDelayed(probe, ready ? 5000 : 1000);
                }
            });
        }
    };

    public MiniatureView(Context context) {
        super(context);
        Method method = null;
        try { method = WebView.class.getMethod("evaluateJavascript", String.class, ValueCallback.class); }
        catch (Exception ignored) { }
        evaluate = method;
        weather = new KunmingWeather(context, new KunmingWeather.Listener() {
            @Override public void onWeather(String payload, boolean cached) {
                // Cache status travels alongside the provider response as data.
                weatherPayload = "{forecast:" + payload + ",cached:" + cached + "}";
                weatherDirty = true;
            }
        });
        setBackgroundColor(0xff080e14);
        WebSettings settings = getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(false);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDefaultTextEncodingName("UTF-8");
        setHorizontalScrollBarEnabled(false);
        setVerticalScrollBarEnabled(false);
        setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                String text = message.message() + " @ " + message.lineNumber();
                if (message.messageLevel() == ConsoleMessage.MessageLevel.ERROR) Log.e(TAG, text);
                else Log.i(TAG, text);
                return true;
            }
        });
        setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                Log.i(TAG, "offline page loaded: " + getSettings().getUserAgentString());
                removeCallbacks(probe);
                if (active) postDelayed(probe, 300);
            }
            @Override public void onReceivedError(WebView view, int code, String description, String url) {
                Log.e(TAG, "load failed: " + code + " " + description);
                status("小店加载失败，可轻触屏幕切回流体界面");
            }
        });
        loadUrl("file:///android_asset/listening-room.html?device=1&quality=low");
    }

    public void setListener(Listener value) { listener = value; }
    private void status(String message) { if (listener != null) listener.onSceneStatus(message); }
    private static float clean(float value) {
        return Float.isNaN(value) || Float.isInfinite(value) ? 0f : Math.max(0f, Math.min(1f, value));
    }
    public void updateAudio(String state, float level, float[] spectrum) {
        transportStreaming = "streaming".equals(state);
        amplitude = transportStreaming ? clean(level) : 0f;
        // React to the first audible sample, with a short silence hold to avoid
        // changing activities between beats or during a quiet musical phrase.
        if (amplitude > 0.002f) lastAudible = SystemClock.uptimeMillis();
        streaming = transportStreaming && lastAudible > 0L
                && SystemClock.uptimeMillis() - lastAudible < 2200L;
        for (int i = 0; i < bass.length; i++) bass[i] = transportStreaming && spectrum != null && i < spectrum.length
                ? clean(spectrum[i]) : 0f;
        dirty = true;
    }
    public void peek(float x, float y) {
        long now = SystemClock.uptimeMillis();
        if (!ready || !active || now - lastPeek < 80) return;
        lastPeek = now;
        javascript("if(window.ListeningRoom)ListeningRoom.setObserver(" + clean(x) + "," + clean(y) + ");", null);
    }
    public void resumeScene() {
        if (disposed) return;
        active = true;
        weather.start();
        onResume();
        resumeTimers();
        if (ready) javascript("if(window.ListeningRoom)ListeningRoom.invalidateFrame();", null);
        dirty = true;
        removeCallbacks(pump); removeCallbacks(probe);
        post(pump); postDelayed(probe, 400);
    }
    public void pauseScene() {
        active = false;
        weather.stop();
        removeCallbacks(pump); removeCallbacks(probe);
        onPause();
        pauseTimers();
    }
    public void disposeScene() {
        disposed = true;
        weather.dispose();
        removeCallbacks(pump); removeCallbacks(probe);
        stopLoading();
        destroy();
    }
    private void javascript(String script, ValueCallback<String> callback) {
        if (disposed) return;
        try {
            if (evaluate != null) evaluate.invoke(this, script, callback);
            else { loadUrl("javascript:" + script); if (callback != null) callback.onReceiveValue("null"); }
        } catch (Exception e) {
            Log.e(TAG, "javascript bridge failed", e);
            if (callback != null) callback.onReceiveValue("null");
        }
    }
}
