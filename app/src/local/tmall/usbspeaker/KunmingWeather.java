package local.tmall.usbspeaker;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.util.JsonReader;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.io.StringReader;

/** Fixed-city daily forecast from the China Meteorological Administration. */
public final class KunmingWeather {
    public interface Listener { void onWeather(String payload, boolean cached); }
    private static final String TAG = "KunmingWeather";
    private static final String ENDPOINT = "https://weather.cma.cn/api/weather/view?stationid=56778";
    private static final long INTERVAL = 30L * 60L * 1000L;
    private final SharedPreferences preferences;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Listener listener;
    private volatile boolean disposed;
    private boolean fetching;
    private final Runnable tick = new Runnable() {
        @Override public void run() {
            refresh();
            handler.postDelayed(this, INTERVAL);
        }
    };

    public KunmingWeather(Context context, Listener value) {
        preferences = context.getApplicationContext().getSharedPreferences("kunming_weather", Context.MODE_PRIVATE);
        listener = value;
    }

    public void start() {
        if (disposed) return;
        handler.removeCallbacks(tick);
        String cached = preferences.getString("forecast", null);
        if (cached != null) {
            try { validate(cached); listener.onWeather(cached, true); }
            catch (Exception ignored) { }
        }
        handler.post(tick);
    }

    public void stop() { handler.removeCallbacks(tick); }
    public void dispose() { disposed = true; stop(); }

    private static String validate(String response) throws Exception {
        int code = -1, days = 0;
        String station = "", city = "", updated = "";
        JsonReader reader = new JsonReader(new StringReader(response));
        try {
            reader.beginObject();
            while (reader.hasNext()) {
                String key = reader.nextName();
                if ("code".equals(key)) code = reader.nextInt();
                else if ("data".equals(key)) {
                    reader.beginObject();
                    while (reader.hasNext()) {
                        String field = reader.nextName();
                        if ("location".equals(field)) {
                            reader.beginObject();
                            while (reader.hasNext()) {
                                String part = reader.nextName();
                                if ("id".equals(part)) station = reader.nextString();
                                else if ("name".equals(part)) city = reader.nextString();
                                else reader.skipValue();
                            }
                            reader.endObject();
                        } else if ("daily".equals(field)) {
                            reader.beginArray();
                            while (reader.hasNext()) { reader.skipValue(); days++; }
                            reader.endArray();
                        } else if ("lastUpdate".equals(field)) updated = reader.nextString();
                        else reader.skipValue();
                    }
                    reader.endObject();
                } else reader.skipValue();
            }
            reader.endObject();
        } finally { reader.close(); }
        if (code != 0 || !"56778".equals(station) || !"昆明".equals(city) || days == 0) {
            throw new IllegalArgumentException("Not a Kunming daily forecast");
        }
        return updated;
    }

    private void refresh() {
        if (disposed || fetching) return;
        fetching = true;
        new Thread(new Runnable() {
            @Override public void run() {
                HttpURLConnection connection = null;
                try {
                    connection = (HttpURLConnection) new URL(ENDPOINT).openConnection();
                    connection.setConnectTimeout(7000);
                    connection.setReadTimeout(9000);
                    connection.setRequestProperty("User-Agent", "Mozilla/5.0 TmallListeningRoom/0.13");
                    connection.setRequestProperty("Referer", "https://weather.cma.cn/");
                    connection.setUseCaches(false);
                    if (connection.getResponseCode() != 200) throw new IllegalStateException("Weather HTTP " + connection.getResponseCode());
                    StringBuilder body = new StringBuilder();
                    BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), "UTF-8"));
                    try { String line; while ((line = reader.readLine()) != null) body.append(line); }
                    finally { reader.close(); }
                    String response = body.toString().trim();
                    String updated = validate(response);
                    final String payload = response.substring(0, response.length() - 1)
                            + ",\"_fetchedAt\":" + System.currentTimeMillis() + "}";
                    preferences.edit().putString("forecast", payload).apply();
                    Log.i(TAG, "昆明预报已更新: " + updated);
                    handler.post(new Runnable() {
                        @Override public void run() { if (!disposed) listener.onWeather(payload, false); }
                    });
                } catch (Exception error) {
                    Log.w(TAG, "Weather refresh unavailable; keeping cached forecast", error);
                } finally {
                    if (connection != null) connection.disconnect();
                    handler.post(new Runnable() { @Override public void run() { fetching = false; } });
                }
            }
        }, "KunmingWeather").start();
    }
}
