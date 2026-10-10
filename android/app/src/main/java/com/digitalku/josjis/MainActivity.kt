package com.digitalku.josjis

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var web: WebView
    private val ui = Handler(Looper.getMainLooper())

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)
        web.setBackgroundColor(0xFF07070F.toInt())
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)
        }
        web.addJavascriptInterface(Bridge(), "AndroidBridge")
        web.loadUrl("https://appassets.androidplatform.net/assets/index.html")

        if (Build.VERSION.SDK_INT >= 33) requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
    }

    /** JS memanggil native secara asinkron: hasil dikirim balik lewat window.__ngResolve(id, json). */
    inner class Bridge {
        @JavascriptInterface
        fun call(id: Int, method: String, path: String, body: String) {
            Engine.async {
                val result = try {
                    Engine.handle(method, path, body)
                } catch (e: Throwable) {
                    JSONObject().put("error", e.message ?: "error").toString()
                }
                ui.post { web.evaluateJavascript("window.__ngResolve($id, ${JSONObject.quote(result)})", null) }
            }
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else moveTaskToBack(true) // tetap mengunduh di latar belakang
    }

    override fun onDestroy() {
        web.removeJavascriptInterface("AndroidBridge")
        web.destroy()
        super.onDestroy()
    }
}
