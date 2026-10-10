package com.digitalku.josjis

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import androidx.core.content.ContextCompat

/** Menjaga proses tetap hidup selama ada unduhan aktif. */
class DownloadService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL, "Unduhan", NotificationManager.IMPORTANCE_LOW))
        val n = intent?.getIntExtra("n", 1) ?: 1
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val notif = Notification.Builder(this, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Downloader Josjis")
            .setContentText("$n unduhan berjalan")
            .setContentIntent(open)
            .setOngoing(true)
            .build()
        startForeground(1, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        return START_NOT_STICKY
    }

    companion object {
        private const val CHANNEL = "downloads"

        fun sync(ctx: Context, active: Int) {
            try {
                val i = Intent(ctx, DownloadService::class.java).putExtra("n", active)
                if (active > 0) ContextCompat.startForegroundService(ctx, i) else ctx.stopService(i)
            } catch (_: Throwable) {
            }
        }
    }
}
