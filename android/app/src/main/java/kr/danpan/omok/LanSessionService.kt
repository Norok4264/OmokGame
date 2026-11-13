package kr.danpan.omok

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Binder
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import org.json.JSONObject

/** User-visible LAN session owner. It improves background continuity but cannot prevent OS process death. */
class LanSessionService : Service() {
    inner class LocalBinder : Binder() { val service: LanSessionService get() = this@LanSessionService }

    private val binder = LocalBinder()
    private lateinit var transport: LanTransport
    @Volatile private var listener: ((JSONObject) -> Unit)? = null
    private var foreground = false
    private var lastNotificationText: String? = null
    private var gameWakeLock: PowerManager.WakeLock? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        gameWakeLock = (getSystemService(POWER_SERVICE) as PowerManager)
            .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "danpan:LanGameClock").apply { setReferenceCounted(false) }
        transport = LanTransport(applicationContext, ::onSnapshot)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                promoteToForeground()
                transport.startHosting(intent.getStringExtra(EXTRA_NICKNAME).orEmpty())
                updateNotification("상대를 검색하고 대국 연결을 유지합니다")
            }
            ACTION_STOP -> stopSession(startId)
            else -> stopSelf(startId)
        }
        // No silent restart after process death. Reopening the app creates a new repository,
        // which atomically cancels pending invitations and aborts unfinished host games.
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder = binder

    fun startFromVisibleActivity(nickname: String) {
        promoteToForeground()
        transport.startHosting(nickname)
        updateNotification("화면을 닫아도 연결을 유지하려고 시도합니다")
    }

    fun observe(callback: ((JSONObject) -> Unit)?) {
        listener = callback
        callback?.invoke(transport.currentSnapshot())
    }

    fun currentSnapshot(): JSONObject = transport.currentSnapshot()
    internal fun lanTransport(): LanTransport = transport
    fun stopSession() = stopSession(0)
    fun refreshAfterResume() = transport.refreshAfterResume()

    private fun stopSession(startId: Int) {
        runCatching { transport.stopForUser() }
        if (gameWakeLock?.isHeld == true) runCatching { gameWakeLock?.release() }
        if (foreground) {
            if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE) else @Suppress("DEPRECATION") stopForeground(true)
            foreground = false
        }
        if (startId != 0) stopSelf(startId) else stopSelf()
    }

    private fun promoteToForeground() {
        if (foreground) return
        val notification = buildNotification("LAN 대국 연결을 유지합니다")
        if (Build.VERSION.SDK_INT >= 29) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        } else startForeground(NOTIFICATION_ID, notification)
        foreground = true
    }

    private fun onSnapshot(snapshot: JSONObject) {
        listener?.invoke(snapshot)
        val game = snapshot.optJSONObject("game")
        val activeGame = game?.optString("status") == "ACTIVE"
        if (activeGame && gameWakeLock?.isHeld == false) runCatching { gameWakeLock?.acquire() }
        if (!activeGame && gameWakeLock?.isHeld == true) runCatching { gameWakeLock?.release() }
        val line = when {
            game?.optString("status") == "ACTIVE" -> "대국 진행 중 · 권위 호스트가 시계를 관리합니다"
            game?.optString("status") == "ABORTED" -> "대국 무효 · 시스템 중단"
            else -> snapshot.optString("status", "같은 Wi-Fi의 상대를 검색 중")
        }
        if (foreground) updateNotification(line)
    }

    private fun updateNotification(text: String) {
        if (!foreground || text == lastNotificationText) return
        lastNotificationText = text
        (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIFICATION_ID, buildNotification(text))
    }

    private fun buildNotification(text: String): Notification {
        val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 1, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        val stop = PendingIntent.getService(
            this, 2, Intent(this, LanSessionService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL_ID) else @Suppress("DEPRECATION") Notification.Builder(this)
        builder.setSmallIcon(android.R.drawable.stat_notify_sync_noanim)
            .setContentTitle("단판 오목 · LAN 연결")
            .setContentText(text)
            .setOngoing(true)
            .setCategory(Notification.CATEGORY_SERVICE)
            .setOnlyAlertOnce(true)
            .addAction(Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "연결 종료", stop).build())
        if (open != null) builder.setContentIntent(open)
        return builder.build()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            val channel = NotificationChannel(CHANNEL_ID, "LAN 대국 연결", NotificationManager.IMPORTANCE_LOW)
            channel.description = "같은 Wi-Fi 대국 중 연결 유지 상태를 표시합니다."
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
        }
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        if (transport.currentSnapshot().optJSONObject("game")?.optString("status") != "ACTIVE") stopSession()
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        listener = null
        if (gameWakeLock?.isHeld == true) runCatching { gameWakeLock?.release() }
        if (::transport.isInitialized) transport.close()
        super.onDestroy()
    }

    companion object {
        const val ACTION_START = "kr.danpan.omok.action.START_LAN"
        const val ACTION_STOP = "kr.danpan.omok.action.STOP_LAN"
        const val EXTRA_NICKNAME = "nickname"
        private const val CHANNEL_ID = "lan-session"
        private const val NOTIFICATION_ID = 7015
    }
}
