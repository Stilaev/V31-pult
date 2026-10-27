package ru.v31.pult;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

/**
 * Главный экран. Интерфейс пульта — assets/index.html (общий с iPad),
 * связь с модулем (Bluetooth MIDI и USB) — MidiLink через системный MidiManager.
 */
public class MainActivity extends Activity {

    private static final int REQ_BLE = 7;
    private static final int REQ_SAVE = 8;
    private static final int REQ_OPEN = 9;

    private WebView web;
    private MidiLink link;
    private final Handler main = new Handler(Looper.getMainLooper());
    private Runnable pendingGranted;
    private String pendingSaveText;
    private ValueCallback<Uri[]> pendingChooser;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(0xFF171B20);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingChooser != null) pendingChooser.onReceiveValue(null);
                pendingChooser = callback;
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    startActivityForResult(i, REQ_OPEN);
                } catch (Exception e) {
                    pendingChooser = null;
                    return false;
                }
                return true;
            }
        });

        link = new MidiLink(this, this::emit);
        web.addJavascriptInterface(new Bridge(), "V31Native");
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    /** Передаёт событие в интерфейс: window.v31NativeEvent({...}). */
    void emit(JSONObject event) {
        final String js = "window.v31NativeEvent&&window.v31NativeEvent(" + event.toString() + ")";
        main.post(() -> {
            if (web != null) web.evaluateJavascript(js, null);
        });
    }

    /** Методы, которые вызывает JavaScript интерфейса. Вызываются не в главном потоке. */
    final class Bridge {
        @JavascriptInterface
        public void connect(String kind, boolean showAll) {
            main.post(() -> {
                if ("ble".equals(kind)) withBlePermissions(() -> link.connectBle(showAll));
                else link.connectUsb();
            });
        }

        @JavascriptInterface
        public void disconnect() {
            main.post(() -> link.close(true));
        }

        @JavascriptInterface
        public void send(String hex) {
            link.send(hexToBytes(hex));
        }

        /** Сохранить файл (резервная копия кита, журнал): системный диалог «Сохранить как». */
        @JavascriptInterface
        public void share(String name, String text) {
            main.post(() -> {
                pendingSaveText = text;
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(name.endsWith(".txt") ? "text/plain" : "application/json");
                i.putExtra(Intent.EXTRA_TITLE, name);
                try {
                    startActivityForResult(i, REQ_SAVE);
                } catch (Exception e) {
                    link.error("Не удалось открыть окно сохранения файла.");
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_OPEN) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) result = new Uri[]{data.getData()};
            if (pendingChooser != null) pendingChooser.onReceiveValue(result);
            pendingChooser = null;
        } else if (requestCode == REQ_SAVE) {
            String text = pendingSaveText;
            pendingSaveText = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || text == null) return;
            try (OutputStream out = getContentResolver().openOutputStream(data.getData())) {
                if (out != null) out.write(text.getBytes(StandardCharsets.UTF_8));
                JSONObject e = new JSONObject();
                e.put("type", "status");
                e.put("message", "Файл сохранён");
                emit(e);
            } catch (Exception ex) {
                link.error("Не удалось сохранить файл: " + ex.getMessage());
            }
        }
    }

    // ---------- Разрешения Bluetooth ----------

    private void withBlePermissions(Runnable onGranted) {
        String[] needed = Build.VERSION.SDK_INT >= 31
                ? new String[]{Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT}
                : new String[]{Manifest.permission.ACCESS_FINE_LOCATION};
        List<String> missing = new ArrayList<>();
        for (String p : needed) {
            if (checkSelfPermission(p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
        }
        if (missing.isEmpty()) {
            onGranted.run();
            return;
        }
        pendingGranted = onGranted;
        requestPermissions(missing.toArray(new String[0]), REQ_BLE);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQ_BLE) return;
        boolean ok = grantResults.length > 0;
        for (int r : grantResults) if (r != PackageManager.PERMISSION_GRANTED) ok = false;
        Runnable r = pendingGranted;
        pendingGranted = null;
        if (ok && r != null) {
            r.run();
        } else {
            link.error(Build.VERSION.SDK_INT >= 31
                    ? "Нет разрешения «Устройства поблизости». Разрешите его в настройках приложения и попробуйте снова."
                    : "Нет разрешения на геолокацию — без него Android не ищет Bluetooth-устройства.");
        }
    }

    // ---------- Жизненный цикл ----------

    @Override
    public void onBackPressed() {
        if (web == null) {
            super.onBackPressed();
            return;
        }
        // Сначала закрываем открытое окно интерфейса, потом выходим.
        web.evaluateJavascript("window.v31Back?String(window.v31Back()):'false'", value -> {
            if (value == null || !value.contains("true")) finish();
        });
    }

    @Override
    protected void onDestroy() {
        link.close(true);
        if (web != null) {
            web.removeJavascriptInterface("V31Native");
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    static byte[] hexToBytes(String hex) {
        String[] parts = hex.trim().split("\\s+");
        byte[] out = new byte[parts.length];
        int n = 0;
        for (String p : parts) {
            if (p.isEmpty()) continue;
            out[n++] = (byte) Integer.parseInt(p, 16);
        }
        if (n == out.length) return out;
        byte[] trimmed = new byte[n];
        System.arraycopy(out, 0, trimmed, 0, n);
        return trimmed;
    }
}
