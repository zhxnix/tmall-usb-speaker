package local.tmall.usbspeaker;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import java.lang.reflect.Method;

/** Restores the user-enabled USB speaker mode after Android boot. */
public final class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        SharedPreferences preferences = context.getSharedPreferences(UsbSpeakerContract.PREFS_NAME,
                Context.MODE_PRIVATE);
        if (!preferences.getBoolean(UsbSpeakerContract.PREF_ENABLED, false)) return;

        Intent service = new Intent(context, UsbAudioService.class);
        service.setAction(UsbSpeakerContract.ACTION_BOOT_START);
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                Method method = Context.class.getMethod("startForegroundService", Intent.class);
                method.invoke(context, service);
            } else {
                context.startService(service);
            }
        } catch (Exception ignored) {
            // API 27 boot receivers still permit startService; this also covers a vendor
            // framework that does not expose the reflected foreground method.
            try { context.startService(service); } catch (RuntimeException ignoredAgain) { }
        }

        Intent activity = new Intent(context, MainActivity.class);
        activity.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        try { context.startActivity(activity); } catch (RuntimeException ignored) { }
    }
}
