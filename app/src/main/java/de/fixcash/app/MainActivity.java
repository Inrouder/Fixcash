package de.fixcash.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private static final int CREATE_DOCUMENT_REQUEST = 1;
    private WebView webView;
    private String exportContents;
    private String exportMimeType;

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
        }
    }

    private void writeExport(Uri uri) {
        if (uri == null || exportContents == null) return;
        try (OutputStream output = getContentResolver().openOutputStream(uri)) {
            if (output == null) {
                throw new IOException("Die Zieldatei konnte nicht geöffnet werden.");
            }
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
