package de.fixcash.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Environment;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.core.content.FileProvider;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final int CREATE_DOCUMENT_REQUEST = 1;
    private static final int INSTALL_PERMISSION_REQUEST = 72;
    private static final String RELEASES_API = "https://api.github.com/repos/Inrouder/Fixcash/releases/latest";
    private WebView webView;
    private String exportContents;
    private String exportMimeType;
    private File downloadedUpdate;
    private String availableVersion;
    private String updateDownloadUrl;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new AppBridge(), "Fixcash");
        setContentView(webView);
        webView.loadUrl("file:///android_asset/index.html");
        checkForUpdates();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O
                && downloadedUpdate != null && downloadedUpdate.exists()
                && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O
                && getPackageManager().canRequestPackageInstalls()) {
            installDownloadedUpdate();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == CREATE_DOCUMENT_REQUEST && resultCode == RESULT_OK && data != null) {
            writeExport(data.getData());
        } else if (requestCode == INSTALL_PERMISSION_REQUEST && downloadedUpdate != null
                && getPackageManager().canRequestPackageInstalls()) {
            installDownloadedUpdate();
        }
    }

    private void checkForUpdates() {
        new Thread(() -> {
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(RELEASES_API).openConnection();
                connection.setRequestMethod("GET");
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(10000);
                connection.setRequestProperty("Accept", "application/vnd.github+json");
                connection.setRequestProperty("User-Agent", "Fixcash-Android-Updater");
                if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) return;
                StringBuilder response = new StringBuilder();
                try (InputStream input = connection.getInputStream()) {
                    byte[] buffer = new byte[4096];
                    int count;
                    while ((count = input.read(buffer)) != -1) {
                        response.append(new String(buffer, 0, count, StandardCharsets.UTF_8));
                    }
                }
                JSONObject release = new JSONObject(response.toString());
                String tag = release.optString("tag_name", "").replaceFirst("^[vV]", "");
                if (tag.isEmpty() || compareVersions(tag, BuildConfig.VERSION_NAME) <= 0) return;
                JSONArray assets = release.optJSONArray("assets");
                if (assets == null) return;
                String downloadUrl = null;
                for (int i = 0; i < assets.length(); i++) {
                    JSONObject asset = assets.optJSONObject(i);
                    if (asset != null && "Fixcash.apk".equals(asset.optString("name"))) {
                        downloadUrl = asset.optString("browser_download_url", null);
                        break;
                    }
                }
                if (downloadUrl == null || !downloadUrl.startsWith("https://")) return;
                availableVersion = tag;
                updateDownloadUrl = downloadUrl;
                mainHandler.post(() -> showUpdateDialog(release.optString("name", "Version " + tag),
                        release.optString("body", "")));
            } catch (Exception ignored) {
                // Updates are optional; keep the app usable when offline or GitHub is unavailable.
            } finally {
                if (connection != null) connection.disconnect();
            }
        }, "fixcash-update-check").start();
    }

    private int compareVersions(String left, String right) {
        try {
            String[] a = left.split("[.-]");
            String[] b = right.replaceFirst("^[vV]", "").split("[.-]");
            for (int i = 0; i < Math.max(a.length, b.length); i++) {
                int av = i < a.length ? Integer.parseInt(a[i].replaceAll("[^0-9].*$", "")) : 0;
                int bv = i < b.length ? Integer.parseInt(b[i].replaceAll("[^0-9].*$", "")) : 0;
                if (av != bv) return Integer.compare(av, bv);
            }
        } catch (Exception ignored) {
            return left.compareToIgnoreCase(right);
        }
        return 0;
    }

    private void showUpdateDialog(String releaseName, String notes) {
        if (isFinishing() || isDestroyed()) return;
        String message = "Installierte Version: " + BuildConfig.VERSION_NAME
                + "\nNeue Version: " + availableVersion
                + (notes == null || notes.trim().isEmpty() ? "" : "\n\n" + notes.trim());
        new AlertDialog.Builder(this)
                .setTitle("Fixcash-Update verfügbar")
                .setMessage(message)
                .setPositiveButton("Herunterladen", (dialog, which) -> downloadUpdate())
                .setNegativeButton("Später", (dialog, which) -> { })
                .show();
    }

    private void downloadUpdate() {
        Toast.makeText(this, "Update wird heruntergeladen …", Toast.LENGTH_LONG).show();
        new Thread(() -> {
            HttpURLConnection connection = null;
            File target = null;
            try {
                connection = (HttpURLConnection) new URL(updateDownloadUrl).openConnection();
                connection.setConnectTimeout(15000);
                connection.setReadTimeout(30000);
                connection.setRequestProperty("User-Agent", "Fixcash-Android-Updater");
                if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                    throw new IOException("Download fehlgeschlagen (HTTP " + connection.getResponseCode() + ").");
                }
                File directory = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (directory == null) throw new IOException("Download-Ordner nicht verfügbar.");
                target = new File(directory, "Fixcash-update.apk");
                try (InputStream input = connection.getInputStream();
                     OutputStream output = new java.io.FileOutputStream(target)) {
                    byte[] buffer = new byte[8192];
                    int count;
                    while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                }
                downloadedUpdate = target;
                mainHandler.post(() -> {
                    Toast.makeText(this, "Download abgeschlossen.", Toast.LENGTH_SHORT).show();
                    beginInstall();
                });
            } catch (Exception exception) {
                if (target != null) target.delete();
                mainHandler.post(() -> new AlertDialog.Builder(this)
                        .setTitle("Update fehlgeschlagen")
                        .setMessage(exception.getMessage() == null ? "Die neue Version konnte nicht geladen werden." : exception.getMessage())
                        .setPositiveButton("OK", null)
                        .show());
            } finally {
                if (connection != null) connection.disconnect();
            }
        }, "fixcash-update-download").start();
    }

    private void beginInstall() {
        if (downloadedUpdate == null || !downloadedUpdate.exists()) return;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O
                && !getPackageManager().canRequestPackageInstalls()) {
            new AlertDialog.Builder(this)
                    .setTitle("Installation erlauben")
                    .setMessage("Android benötigt einmalig die Erlaubnis, Updates für Fixcash aus dieser App zu installieren. Aktiviere „Unbekannte Apps installieren“ und kehre danach zu Fixcash zurück.")
                    .setPositiveButton("Einstellungen öffnen", (dialog, which) -> {
                        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                                Uri.parse("package:" + getPackageName()));
                        startActivityForResult(intent, INSTALL_PERMISSION_REQUEST);
                    })
                    .setNegativeButton("Abbrechen", null)
                    .show();
            return;
        }
        installDownloadedUpdate();
    }

    private void installDownloadedUpdate() {
        if (downloadedUpdate == null || !downloadedUpdate.exists()) return;
        try {
            Uri apkUri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", downloadedUpdate);
            Intent install = new Intent(Intent.ACTION_VIEW);
            install.setDataAndType(apkUri, "application/vnd.android.package-archive");
            install.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            install.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(install);
        } catch (Exception exception) {
            Toast.makeText(this, "Installer konnte nicht geöffnet werden: " + exception.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private void writeExport(Uri uri) {
        if (uri == null || exportContents == null) return;
        try (OutputStream output = getContentResolver().openOutputStream(uri)) {
            if (output == null) throw new IOException("Die Zieldatei konnte nicht geöffnet werden.");
            output.write(exportContents.getBytes(StandardCharsets.UTF_8));
            Toast.makeText(this, "Export gespeichert", Toast.LENGTH_SHORT).show();
        } catch (IOException exception) {
            Toast.makeText(this, "Export fehlgeschlagen: " + exception.getMessage(), Toast.LENGTH_LONG).show();
        }
    }

    private class AppBridge {
        @JavascriptInterface
        public void exportFile(String filename, String mimeType, String contents) {
            runOnUiThread(() -> {
                exportContents = contents;
                exportMimeType = mimeType;
                Intent create = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                create.addCategory(Intent.CATEGORY_OPENABLE);
                create.setType(exportMimeType);
                create.putExtra(Intent.EXTRA_TITLE, filename);
                startActivityForResult(create, CREATE_DOCUMENT_REQUEST);
            });
        }

        @JavascriptInterface
        public void shareText(String subject, String contents) {
            runOnUiThread(() -> {
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("text/plain");
                send.putExtra(Intent.EXTRA_SUBJECT, subject);
                send.putExtra(Intent.EXTRA_TEXT, contents);
                startActivity(Intent.createChooser(send, "Kündigungsschreiben teilen"));
            });
        }
    }
}
