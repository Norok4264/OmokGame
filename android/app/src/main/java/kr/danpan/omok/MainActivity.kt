package kr.danpan.omok

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ContentValues
import android.os.Environment
import android.provider.MediaStore
import android.widget.Toast
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.FileNotFoundException
import java.util.concurrent.Executors

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private var lanService: LanSessionService? = null
    private var serviceBound = false
    private val pngWorker = Executors.newSingleThreadExecutor()
    @Volatile private var pendingPngBytes: ByteArray? = null
    @Volatile private var openAfterPngSave = false
    private val lanServiceConnection = object : ServiceConnection {
        override fun onServiceConnected(name: ComponentName?, binder: android.os.IBinder?) {
            lanService = (binder as? LanSessionService.LocalBinder)?.service
            lanService?.observe(::onLanSnapshot)
        }
        override fun onServiceDisconnected(name: ComponentName?) { lanService = null }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(255, 241, 230)
        window.navigationBarColor = Color.rgb(255, 241, 230)
        window.decorView.systemUiVisibility = window.decorView.systemUiVisibility or
            android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        window.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE)

        serviceBound = bindService(Intent(this, LanSessionService::class.java), lanServiceConnection, Context.BIND_AUTO_CREATE)
        webView = WebView(this).apply {
            setBackgroundColor(Color.rgb(255, 241, 230))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            addJavascriptInterface(AndroidBridge(), "AndroidOmok")
            webViewClient = AndroidAssetsClient()
        }
        setContentView(webView)
        webView.loadUrl("https://$ASSET_HOST/index.html")
    }

    private fun onLanSnapshot(snapshot: JSONObject) {
        if (!::webView.isInitialized || isFinishing || isDestroyed) return
        val payload = snapshot.toString()
        runOnUiThread {
            if (!isFinishing && !isDestroyed) {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('omok-native-lan',{detail:$payload}));",
                    null,
                )
            }
        }
    }

    private inner class AndroidBridge {
        @JavascriptInterface
        fun startHosting(nickname: String) = runOnUiThread { startLanSession(nickname) }

        @JavascriptInterface
        fun startDiscovery() = lanService?.lanTransport()?.startDiscovery()

        @JavascriptInterface
        fun createChallenge(peerId: String, nickname: String) = lanService?.lanTransport()?.createChallenge(peerId, nickname)

        @JavascriptInterface
        fun respondChallenge(challengeId: String, accept: Boolean, revision: Int) = lanService?.lanTransport()?.respondChallenge(challengeId, accept, revision)

        @JavascriptInterface
        fun cancelChallenge() = lanService?.lanTransport()?.cancelChallenge()

        @JavascriptInterface
        fun submitMove(gameId: String, revision: Int, x: Int, y: Int) = lanService?.lanTransport()?.submitMove(gameId, revision, x, y)

        @JavascriptInterface
        fun resign(gameId: String, revision: Int) = lanService?.lanTransport()?.resign(gameId, revision)

        @JavascriptInterface
        fun dismissResult(gameId: String) = lanService?.lanTransport()?.dismissResult(gameId)

        @JavascriptInterface
        fun submitChat(gameId: String, messageId: String, body: String) = lanService?.lanTransport()?.submitChat(gameId, messageId, body)

        @JavascriptInterface
        fun requestRematch(gameId: String) = lanService?.lanTransport()?.requestRematch(gameId)

        @JavascriptInterface
        fun respondRematch(gameId: String, rematchId: String, accept: Boolean) = lanService?.lanTransport()?.respondRematch(gameId, rematchId, accept)

        @JavascriptInterface
        fun cancelRematch(gameId: String, rematchId: String) = lanService?.lanTransport()?.cancelRematch(gameId, rematchId)

        @JavascriptInterface
        fun saveResultPng(payload: String, openAfterSave: Boolean) = savePng(payload, openAfterSave)

        @JavascriptInterface
        fun openLastPng() = openLastPngUri()

        @JavascriptInterface
        fun shareLastPng() = shareLastPngUri()

        @JavascriptInterface
        fun refresh() = lanService?.lanTransport()?.refresh()

        @JavascriptInterface
        fun stop() = lanService?.stopSession()

        @JavascriptInterface
        fun snapshot(): String = lanService?.currentSnapshot()?.toString() ?: JSONObject().put("status", "LAN 세션을 준비하고 있습니다.").toString()
    }

    private fun startLanSession(nickname: String) {
        if (android.os.Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), REQUEST_POST_NOTIFICATIONS)
        }
        val intent = Intent(this, LanSessionService::class.java)
            .setAction(LanSessionService.ACTION_START)
            .putExtra(LanSessionService.EXTRA_NICKNAME, nickname)
        if (android.os.Build.VERSION.SDK_INT >= 26) startForegroundService(intent) else startService(intent)
    }

    private fun savePng(payload: String, openAfterSave: Boolean) {
        this.openAfterPngSave = openAfterSave
        pngWorker.execute {
            try {
                val bytes = LanResultPng.render(payload)
                if (android.os.Build.VERSION.SDK_INT >= 29) {
                    val values = ContentValues().apply {
                        put(MediaStore.Images.Media.DISPLAY_NAME, "danpan-omok-${System.currentTimeMillis()}.png")
                        put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                        put(MediaStore.Images.Media.RELATIVE_PATH, "${Environment.DIRECTORY_PICTURES}/DanpanOmok")
                        put(MediaStore.Images.Media.IS_PENDING, 1)
                    }
                    val uri = contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values) ?: error("PNG 저장 위치를 만들지 못했습니다.")
                    try {
                        contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: error("저장 파일을 열지 못했습니다.")
                        values.clear(); values.put(MediaStore.Images.Media.IS_PENDING, 0)
                        contentResolver.update(uri, values, null, null)
                        getSharedPreferences("lan-profile", MODE_PRIVATE).edit().putString("lastResultPngUri", uri.toString()).apply()
                        runOnUiThread { notifyPng("저장 완료 · 사진 > DanpanOmok", true); if (this.openAfterPngSave) openUri(uri) }
                    } catch (error: Exception) {
                        contentResolver.delete(uri, null, null); throw error
                    }
                } else {
                    pendingPngBytes = bytes
                    runOnUiThread {
                        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                            addCategory(Intent.CATEGORY_OPENABLE); type = "image/png"
                            putExtra(Intent.EXTRA_TITLE, "danpan-omok-${System.currentTimeMillis()}.png")
                        }
                        startActivityForResult(intent, REQUEST_CREATE_PNG)
                    }
                }
            } catch (error: Exception) {
                runOnUiThread { notifyPng("PNG 저장 실패 · 결과는 유지됩니다. 다시 저장해 주세요. (${error.localizedMessage ?: error.javaClass.simpleName})", false) }
            }
        }
    }

    @Suppress("DEPRECATION")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != REQUEST_CREATE_PNG) return
        val bytes = pendingPngBytes.also { pendingPngBytes = null }
        val uri = data?.data
        if (resultCode != RESULT_OK || bytes == null || uri == null) { notifyPng("PNG 저장을 취소했습니다. 결과는 유지됩니다.", false); return }
        val persistableFlags = data.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
        if (persistableFlags != 0) runCatching { contentResolver.takePersistableUriPermission(uri, persistableFlags) }
        pngWorker.execute {
            try {
                contentResolver.openOutputStream(uri)?.use { it.write(bytes) } ?: error("선택한 파일을 열지 못했습니다.")
                getSharedPreferences("lan-profile", MODE_PRIVATE).edit().putString("lastResultPngUri", uri.toString()).apply()
                runOnUiThread { notifyPng("PNG 저장 완료", true); if (openAfterPngSave) openUri(uri) }
            } catch (error: Exception) { runOnUiThread { notifyPng("PNG 저장 실패 · 다시 저장해 주세요. (${error.localizedMessage ?: error.javaClass.simpleName})", false) } }
        }
    }

    private fun notifyPng(message: String, saved: Boolean) {
        if (!::webView.isInitialized) return
        val detail = JSONObject().put("message", message).put("saved", saved).toString()
        webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('omok-native-png',{detail:$detail}));", null)
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }

    private fun lastPngUri(): Uri? = getSharedPreferences("lan-profile", MODE_PRIVATE).getString("lastResultPngUri", null)?.let(Uri::parse)
    private fun openLastPngUri() { lastPngUri()?.let(::openUri) ?: notifyPng("먼저 결과 PNG를 저장해 주세요.", false) }
    private fun openUri(uri: Uri) {
        val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "image/png").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        try { startActivity(intent) } catch (_: Exception) { notifyPng("PNG는 저장됐습니다. 갤러리에서 DanpanOmok 폴더를 여세요.", true) }
    }
    private fun shareLastPngUri() {
        val uri = lastPngUri() ?: return notifyPng("먼저 결과 PNG를 저장해 주세요.", false)
        val intent = Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM, uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        startActivity(Intent.createChooser(intent, "결과 PNG 공유"))
    }

    private inner class AndroidAssetsClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
            !isTrustedAssetUrl(request.url)

        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse =
            serveAsset(request.url)

        @Suppress("DEPRECATION")
        override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean =
            runCatching { !isTrustedAssetUrl(Uri.parse(url)) }.getOrDefault(true)

        private fun isTrustedAssetUrl(uri: Uri): Boolean =
            uri.scheme == "https" && uri.host == ASSET_HOST && uri.userInfo == null

        private fun serveAsset(uri: Uri): WebResourceResponse {
            if (!isTrustedAssetUrl(uri)) return response(403, "Forbidden", "text/plain", "외부 자원은 차단했습니다.")
            val path = uri.path.orEmpty().trimStart('/').ifBlank { "index.html" }
            if (path.split('/').any { it == "." || it == ".." } || '\\' in path || path.startsWith("/") || '\u0000' in path) {
                return response(400, "Bad Request", "text/plain", "잘못된 자원 경로입니다.")
            }
            return try {
                // Gradle adds apps/web/dist as an Android assets source root,
                // so index.html and assets/* live directly under AssetManager.
                val stream = assets.open(path)
                WebResourceResponse(mimeType(path), charset(path), stream).apply {
                    responseHeaders = mapOf("Cache-Control" to "no-store", "X-Content-Type-Options" to "nosniff")
                }
            } catch (_: FileNotFoundException) {
                response(404, "Not Found", "text/plain", "앱 자원을 찾지 못했습니다.")
            } catch (_: Exception) {
                response(500, "Internal Server Error", "text/plain", "앱 자원을 읽지 못했습니다.")
            }
        }

        private fun response(code: Int, reason: String, mime: String, text: String) =
            WebResourceResponse(
                mime,
                "UTF-8",
                code,
                reason,
                mapOf("Cache-Control" to "no-store", "X-Content-Type-Options" to "nosniff"),
                ByteArrayInputStream(text.toByteArray(Charsets.UTF_8)),
            )

        private fun charset(path: String): String? = when (path.substringAfterLast('.', "").lowercase()) {
            "html", "htm", "js", "mjs", "css", "json", "webmanifest", "svg", "txt" -> "UTF-8"
            else -> null
        }

        private fun mimeType(path: String): String = when (path.substringAfterLast('.', "").lowercase()) {
            "html", "htm" -> "text/html"
            "js", "mjs" -> "application/javascript"
            "css" -> "text/css"
            "json", "webmanifest" -> "application/json"
            "svg" -> "image/svg+xml"
            "png" -> "image/png"
            "jpg", "jpeg" -> "image/jpeg"
            "webp" -> "image/webp"
            "ttf" -> "font/ttf"
            "woff" -> "font/woff"
            "woff2" -> "font/woff2"
            "wasm" -> "application/wasm"
            "ico" -> "image/x-icon"
            else -> "application/octet-stream"
        }
    }

    override fun onDestroy() {
        lanService?.observe(null)
        if (serviceBound) unbindService(lanServiceConnection)
        if (::webView.isInitialized) {
            webView.removeJavascriptInterface("AndroidOmok")
            webView.stopLoading()
            webView.destroy()
        }
        pngWorker.shutdown()
        super.onDestroy()
    }

    override fun onResume() {
        super.onResume()
        lanService?.refreshAfterResume()
    }

    private companion object {
        const val ASSET_HOST = "appassets.androidplatform.net"
        const val REQUEST_POST_NOTIFICATIONS = 7016
        const val REQUEST_CREATE_PNG = 7017
    }
}
