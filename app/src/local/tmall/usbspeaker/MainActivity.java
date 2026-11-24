package local.tmall.usbspeaker;

import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioManager;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import android.view.View;
import android.widget.FrameLayout;

/** Full-screen entry point. Audio remains in UsbAudioService when this screen is backgrounded. */
public final class MainActivity extends Activity implements SpeakerView.Listener, MiniatureView.Listener {
    private SpeakerView view;
    private FluidView fluid;
    private MiniatureView miniature;
    private FrameLayout stage;
    private boolean miniatureSelected, resumed;
    private String uiState = "stopped";
    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            if (!UsbSpeakerContract.ACTION_STATE.equals(intent.getAction())) return;
            uiState = intent.getStringExtra(UsbSpeakerContract.EXTRA_STATE);
            if (uiState == null) uiState = "error";
            fluid.update(uiState, intent.getFloatExtra(UsbSpeakerContract.EXTRA_AMPLITUDE, 0f),
                    intent.getFloatArrayExtra(UsbSpeakerContract.EXTRA_SPECTRUM));
            if (miniature != null) miniature.updateAudio(uiState,
                    intent.getFloatExtra(UsbSpeakerContract.EXTRA_AMPLITUDE, 0f),
                    intent.getFloatArrayExtra(UsbSpeakerContract.EXTRA_SPECTRUM));
            view.update(intent.getStringExtra(UsbSpeakerContract.EXTRA_STATE),
                    intent.getStringExtra(UsbSpeakerContract.EXTRA_MESSAGE),
                    intent.getFloatExtra(UsbSpeakerContract.EXTRA_AMPLITUDE, 0f),
                    intent.getFloatArrayExtra(UsbSpeakerContract.EXTRA_WAVE),
                    intent.getFloatArrayExtra(UsbSpeakerContract.EXTRA_SPECTRUM),
                    intent.getIntExtra(UsbSpeakerContract.EXTRA_VOLUME, 0),
                    intent.getIntExtra(UsbSpeakerContract.EXTRA_MAX_VOLUME, 15));
        }
    };
    private boolean receiverRegistered;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN,
                WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(0x1706);
        stage = new FrameLayout(this);
        fluid = new FluidView(this);
        view = new SpeakerView(this);
        view.setListener(this);
        view.setFluidView(fluid);
        stage.addView(fluid, new FrameLayout.LayoutParams(-1, -1));
        stage.addView(view, new FrameLayout.LayoutParams(-1, -1));
        setContentView(stage);
        miniatureSelected = getSharedPreferences(UsbSpeakerContract.PREFS_NAME, MODE_PRIVATE)
                .getBoolean("miniature_scene", true);
        applyScene();
    }

    @Override public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) getWindow().getDecorView().setSystemUiVisibility(0x1706);
    }

    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        if (miniatureSelected && miniature != null) miniature.resumeScene();
        else fluid.onResume();
    }

    @Override protected void onPause() {
        resumed = false;
        if (miniatureSelected && miniature != null) miniature.pauseScene();
        else fluid.onPause();
        super.onPause();
    }

    @Override protected void onStart() {
        super.onStart();
        if (!receiverRegistered) {
            IntentFilter filter = new IntentFilter(UsbSpeakerContract.ACTION_STATE);
            registerReceiver(receiver, filter);
            receiverRegistered = true;
        }
        boolean enabled = getSharedPreferences(UsbSpeakerContract.PREFS_NAME, MODE_PRIVATE)
                .getBoolean(UsbSpeakerContract.PREF_ENABLED, false);
        sendService(enabled ? UsbSpeakerContract.ACTION_BOOT_START : UsbSpeakerContract.ACTION_STATUS);
    }

    @Override protected void onStop() {
        if (receiverRegistered) {
            unregisterReceiver(receiver);
            receiverRegistered = false;
        }
        super.onStop();
    }

    private void sendService(String action) {
        Intent intent = new Intent(this, UsbAudioService.class);
        intent.setAction(action);
        startService(intent);
    }

    private void applyScene() {
        if (miniatureSelected && miniature == null) {
            miniature = new MiniatureView(this);
            miniature.setListener(this);
            stage.addView(miniature, 1, new FrameLayout.LayoutParams(-1, -1));
            view.setSceneMessage("正在打开微缩音响店…");
        }
        fluid.setVisibility(miniatureSelected ? View.GONE : View.VISIBLE);
        if (miniature != null) miniature.setVisibility(miniatureSelected ? View.VISIBLE : View.GONE);
        view.setMiniatureScene(miniatureSelected);
        if (resumed) {
            if (miniatureSelected) { fluid.onPause(); miniature.resumeScene(); }
            else { if (miniature != null) miniature.pauseScene(); fluid.onResume(); }
        }
    }

    @Override public void onScenePressed() {
        miniatureSelected = !miniatureSelected;
        getSharedPreferences(UsbSpeakerContract.PREFS_NAME, MODE_PRIVATE).edit()
                .putBoolean("miniature_scene", miniatureSelected).apply();
        applyScene();
        sendService(UsbSpeakerContract.ACTION_STATUS);
    }

    @Override public void onSceneTouch(float x, float y) {
        if (miniatureSelected && miniature != null) miniature.peek(x, y);
    }

    @Override public void onSceneStatus(String message) { view.setSceneMessage(message); }

    @Override protected void onDestroy() {
        if (miniature != null) { stage.removeView(miniature); miniature.disposeScene(); }
        super.onDestroy();
    }

    @Override public void onModePressed() {
        if ("streaming".equals(uiState) || "waiting".equals(uiState)) {
            sendService(UsbSpeakerContract.ACTION_STOP);
        } else {
            sendService(UsbSpeakerContract.ACTION_START);
        }
    }

    @Override public void onHomePressed() {
        Intent home = new Intent(Intent.ACTION_MAIN);
        home.addCategory(Intent.CATEGORY_HOME);
        home.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(home);
    }

    @Override public void onVolumePressed(boolean raise) {
        AudioManager audio = (AudioManager) getSystemService(AUDIO_SERVICE);
        audio.adjustStreamVolume(AudioManager.STREAM_MUSIC,
                raise ? AudioManager.ADJUST_RAISE : AudioManager.ADJUST_LOWER,
                0);
        sendService(UsbSpeakerContract.ACTION_STATUS);
    }
}
