package id.antasiar.app;

import android.Manifest;
import android.app.Activity;
import android.app.DownloadManager;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.view.Gravity;
import android.view.View;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.Toast;

public class MainActivity extends Activity {
    private static final String HOME = "https://antasiar.my.id";
    private static final int FILE_CHOOSER = 10;
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private MediaPlayer introPlayer;

    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= 21) {
            getWindow().setStatusBarColor(Color.BLACK);
            getWindow().setNavigationBarColor(Color.BLACK);
        }
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(true);
        }
        requestNeededPermissions();

        FrameLayout root = new FrameLayout(this);
        root.setFitsSystemWindows(true);
        webView = new WebView(this);
        webView.setFitsSystemWindows(true);
        root.addView(webView, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        showIntroIfNeeded(root);

        CookieManager.getInstance().setAcceptCookie(true);
        if (android.os.Build.VERSION.SDK_INT >= 21) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        }

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                request.grant(request.getResources());
            }

            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = params.createIntent();
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                try {
                    startActivityForResult(intent, FILE_CHOOSER);
                } catch (Exception e) {
                    fileCallback = null;
                    Toast.makeText(MainActivity.this, "File picker tidak tersedia", Toast.LENGTH_SHORT).show();
                    return false;
                }
                return true;
            }
        });

        webView.setDownloadListener(new DownloadListener() {
            @Override public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimeType, long contentLength) {
                DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                req.setMimeType(mimeType);
                req.addRequestHeader("User-Agent", userAgent);
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                req.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, URLUtil.guessFileName(url, contentDisposition, mimeType));
                ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(req);
                Toast.makeText(MainActivity.this, "Download dimulai", Toast.LENGTH_SHORT).show();
            }
        });

        webView.loadUrl(HOME);
    }

    private void showIntroIfNeeded(FrameLayout root) {
        SharedPreferences prefs = getSharedPreferences("intro", MODE_PRIVATE);
        if (prefs.getBoolean("seen", false)) return;

        FrameLayout intro = new FrameLayout(this);
        intro.setBackgroundColor(Color.rgb(5, 5, 8));
        root.addView(intro, new FrameLayout.LayoutParams(-1, -1));

        View aura = new View(this);
        GradientDrawable glow = new GradientDrawable();
        glow.setShape(GradientDrawable.OVAL);
        glow.setColor(Color.argb(70, 255, 91, 176));
        aura.setBackground(glow);
        FrameLayout.LayoutParams auraLp = new FrameLayout.LayoutParams(dp(420), dp(420), Gravity.CENTER);
        intro.addView(aura, auraLp);
        aura.animate().scaleX(1.18f).scaleY(1.18f).alpha(0.75f).setDuration(2200).start();

        ImageView logo = new ImageView(this);
        logo.setImageResource(getResources().getIdentifier("intro_logo", "drawable", getPackageName()));
        logo.setScaleType(ImageView.ScaleType.FIT_CENTER);
        logo.setAlpha(0f);
        logo.setScaleX(0.15f);
        logo.setScaleY(0.15f);
        logo.setRotation(-180f);
        intro.addView(logo, new FrameLayout.LayoutParams(dp(260), dp(260), Gravity.CENTER));
        logo.animate().alpha(1f).scaleX(1f).scaleY(1f).rotation(0f).setDuration(1400).start();

        introPlayer = MediaPlayer.create(this, getResources().getIdentifier("intro_open", "raw", getPackageName()));
        if (introPlayer != null) {
            introPlayer.setVolume(0.75f, 0.75f);
            introPlayer.start();
        }

        intro.postDelayed(() -> {
            prefs.edit().putBoolean("seen", true).apply();
            intro.animate().alpha(0f).setDuration(700).withEndAction(() -> root.removeView(intro)).start();
            if (introPlayer != null) {
                introPlayer.release();
                introPlayer = null;
            }
        }, 4000);
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void requestNeededPermissions() {
        if (android.os.Build.VERSION.SDK_INT < 23) return;
        requestPermissions(new String[]{
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.READ_MEDIA_IMAGES,
            Manifest.permission.READ_MEDIA_VIDEO,
            Manifest.permission.READ_MEDIA_AUDIO
        }, 1);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER || fileCallback == null) return;
        Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    @Override public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
