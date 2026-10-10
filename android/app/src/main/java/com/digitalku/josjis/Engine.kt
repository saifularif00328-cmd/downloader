package com.digitalku.josjis

import android.content.ContentValues
import android.content.Context
import android.os.Environment
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLException
import com.yausername.youtubedl_android.YoutubeDLRequest
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import kotlin.math.max
import kotlin.math.min

class Job(val id: Int, val url: String) {
    @Volatile var title = ""
    @Volatile var site = ""
    var fmt = "mp4"
    var ext = "mp4"
    var q = 3
    var qLabel = ""
    var dest = ""
    var sub = false
    var meta = true
    var num = 0
    @Volatile var status = "wait"
    @Volatile var stage = ""
    @Volatile var pct = 0.0
    @Volatile var speed = 0.0
    @Volatile var eta = 0L
    @Volatile var size = 0.0
    @Volatile var error = ""
    @Volatile var file = ""
    var tries = 0
    var attempt = 0
    var infoDone = false

    fun json(): JSONObject = JSONObject()
        .put("id", id).put("url", url).put("title", title).put("site", site)
        .put("fmt", fmt).put("ext", ext).put("q", qLabel).put("status", status)
        .put("stage", if (status == "run") stage else "")
        .put("pct", pct).put("speed", speed).put("eta", eta).put("size", size)
        .put("file", file).put("error", error).put("num", num).put("cspeed", 0)
}

/** Port dari server.js: antrian unduhan + yt-dlp (tertanam) dan penyimpanan ke folder Download/Josjis. */
object Engine {
    private val HEIGHTS = intArrayOf(360, 480, 720, 1080, 1440, 2160)
    private val ABR = intArrayOf(64, 96, 128, 192, 256, 320)
    private const val BASE = "Josjis"

    private lateinit var ctx: Context
    private val lock = Any()
    private val jobs = LinkedHashMap<Int, Job>()
    private var nextId = 1
    private val pool = Executors.newCachedThreadPool()
    private val readyLatch = CountDownLatch(1)

    @Volatile var parallel = 3
    @Volatile var ready = false
    @Volatile var initError: String? = null

    fun async(block: () -> Unit) = pool.execute(block)

    fun init(app: Context) {
        ctx = app.applicationContext
        pool.execute {
            try {
                YoutubeDL.init(ctx)
                FFmpeg.init(ctx)
                ready = true
            } catch (e: Throwable) {
                initError = e.message ?: e.toString()
            }
            readyLatch.countDown()
            if (ready) {
                // yt-dlp perlu versi terbaru agar YouTube dkk tetap bisa diunduh
                try { YoutubeDL.updateYoutubeDL(ctx, YoutubeDL.UpdateChannel.STABLE) } catch (_: Throwable) {}
            }
        }
    }

    private fun awaitReady() { readyLatch.await() }

    /* ---------------- API (sama dengan server.js) ---------------- */

    fun handle(method: String, path: String, body: String): String {
        val b = if (body.isBlank()) JSONObject() else JSONObject(body)
        when {
            path == "/api/health" -> {
                awaitReady()
                return JSONObject().put("ok", true).put("ytdlp", ready).put("ffmpeg", ready)
                    .put("base", "Download/$BASE").put("parallel", parallel).put("convert", 1)
                    .put("error", initError ?: "").toString()
            }
            path == "/api/jobs" && method == "GET" -> {
                val arr = JSONArray()
                synchronized(lock) { jobs.values.forEach { arr.put(it.json()) } }
                return arr.toString()
            }
            path == "/api/playlist" -> return playlist(b.optString("url"))
            path == "/api/jobs" && method == "POST" -> return addJobs(b)
            path == "/api/settings" -> {
                if (b.has("parallel")) parallel = b.optInt("parallel", 3).coerceIn(1, 8)
                pump()
                return JSONObject().put("parallel", parallel).toString()
            }
            path == "/api/clear-done" -> {
                synchronized(lock) { jobs.values.removeAll { it.status == "done" } }
                return "{}"
            }
        }
        val m = Regex("^/api/jobs/(\\d+)/(pause|resume|cancel|retry)$").find(path)
        if (m != null) {
            val j = synchronized(lock) { jobs[m.groupValues[1].toInt()] } ?: return err("tidak ada")
            when (m.groupValues[2]) {
                "pause" -> if (j.status == "run" || j.status == "wait") stop(j, "paused")
                "resume" -> if (j.status == "paused") j.status = "wait"
                "retry" -> if (j.status == "error") { j.status = "wait"; j.pct = 0.0; j.tries = 0 }
                "cancel" -> {
                    stop(j, "cancel")
                    synchronized(lock) { jobs.remove(j.id) }
                    tmpDir(j).deleteRecursively()
                }
            }
            pump()
            return "{}"
        }
        return err("endpoint tidak dikenal")
    }

    private fun err(msg: String) = JSONObject().put("error", msg).toString()

    private fun validUrl(u: String) = try {
        java.net.URI(u).scheme?.lowercase() in setOf("http", "https")
    } catch (_: Exception) { false }

    private fun clean(s: String, max: Int = 100): String =
        s.replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "").replace(Regex("\\s+"), " ").trim().take(max).ifBlank { "video" }

    private fun safeSub(s: String): String =
        s.split(Regex("[\\\\/]+")).filter { it.isNotBlank() && it != "." && it != ".." }.joinToString("/") { clean(it, 60) }

    private fun playlist(url: String): String {
        if (!validUrl(url)) return err("URL tidak valid")
        awaitReady()
        if (!ready) return err(initError ?: "yt-dlp belum siap")
        return try {
            val req = YoutubeDLRequest(url)
            req.addOption("--flat-playlist")
            req.addOption("-J")
            req.addOption("--no-warnings")
            val root = JSONObject(YoutubeDL.execute(req, null, null).out)
            val entries = root.optJSONArray("entries") ?: JSONArray().put(root)
            val items = JSONArray()
            for (i in 0 until entries.length()) {
                val e = entries.optJSONObject(i) ?: continue
                val u = e.optString("url").takeIf { validUrl(it) } ?: e.optString("webpage_url").takeIf { validUrl(it) } ?: url
                items.put(JSONObject().put("title", e.optString("title", e.optString("id"))).put("url", u).put("dur", e.optDouble("duration", 0.0).let { if (it.isNaN()) 0.0 else it }))
            }
            JSONObject().put("title", root.optString("title")).put("items", items).toString()
        } catch (e: Throwable) {
            err(shortError(e))
        }
    }

    private fun addJobs(b: JSONObject): String {
        val dest = safeSub(b.optString("dest"))
        val fmt = if (b.optString("fmt") == "mp3") "mp3" else "mp4"
        val ext = b.optString("ext", fmt).lowercase()
        val q = b.optInt("q", 3).coerceIn(0, 5)
        val items = b.optJSONArray("items") ?: JSONArray()
        val ids = JSONArray()
        synchronized(lock) {
            for (i in 0 until min(items.length(), 500)) {
                val it = items.optJSONObject(i) ?: continue
                val url = it.optString("url")
                if (!validUrl(url)) continue
                val j = Job(nextId++, url)
                j.title = it.optString("title").let { t -> if (t.isBlank()) "" else clean(t) }
                j.site = try { java.net.URI(url).host?.removePrefix("www.") ?: "" } catch (_: Exception) { "" }
                j.fmt = fmt; j.ext = ext; j.q = q; j.qLabel = b.optString("qLabel")
                j.dest = dest; j.sub = b.optBoolean("sub"); j.meta = b.optBoolean("meta", true)
                j.num = if (b.optBoolean("number")) j.id else 0
                if (ext != "mp4" && ext != "mp3") { j.status = "error"; j.error = "Versi Android hanya mendukung MP4 & MP3" }
                jobs[j.id] = j
                ids.put(j.id)
            }
        }
        pump()
        return JSONObject().put("ids", ids).toString()
    }

    /* ---------------- antrian ---------------- */

    private fun pump() {
        val toStart = ArrayList<Job>()
        val active: Int
        synchronized(lock) {
            var running = jobs.values.count { it.status == "run" }
            for (j in jobs.values) {
                if (j.status == "wait" && running < parallel) {
                    j.status = "run"; j.stage = "info"; j.error = ""; running++; toStart.add(j)
                }
            }
            active = jobs.values.count { it.status == "run" || it.status == "wait" }
        }
        toStart.forEach { j -> pool.execute { runJob(j) } }
        DownloadService.sync(ctx, active)
    }

    private fun stop(j: Job, status: String) {
        j.status = status
        j.speed = 0.0
        try { YoutubeDL.destroyProcessById("job${j.id}-${j.attempt}") } catch (_: Throwable) {}
    }

    private fun fail(j: Job, msg: String) {
        if (j.status != "run") return
        j.status = "error"; j.error = msg; j.speed = 0.0
        pump()
    }

    private fun shortError(e: Throwable): String {
        val m = e.message ?: e.toString()
        return m.lines().lastOrNull { it.contains("ERROR") }?.removePrefix("ERROR: ") ?: m.takeLast(200)
    }

    private fun tmpDir(j: Job) = File(ctx.filesDir, "tmp/${j.id}")

    private fun toMb(n: String, unit: String): Double {
        val v = n.toDoubleOrNull() ?: return 0.0
        return when (unit) { "K" -> v / 1024; "G" -> v * 1024; else -> v }
    }

    private fun runJob(j: Job) {
        val attempt = ++j.attempt
        val procId = "job${j.id}-$attempt"
        try {
            awaitReady()
            if (!ready) { fail(j, initError ?: "yt-dlp gagal dimuat"); return }

            if (!j.infoDone) {
                val req = YoutubeDLRequest(j.url)
                req.addOption("--no-playlist")
                val info = YoutubeDL.getInfo(req)
                if (j.title.isBlank()) j.title = clean(info.title ?: "video")
                if (j.site.isBlank() || info.extractorKey != null) j.site = info.extractorKey ?: j.site
                j.size = max(info.fileSize, info.fileSizeApproximate) / 1048576.0
                j.infoDone = true
            }
            if (j.status != "run") return

            val tmp = tmpDir(j)
            tmp.mkdirs()
            val h = HEIGHTS[j.q]
            val req = YoutubeDLRequest(j.url)
            req.addOption("--no-playlist")
            req.addOption("--newline")
            req.addOption("--no-warnings")
            req.addOption("--continue")
            req.addOption("-o", tmp.absolutePath + "/src.%(ext)s")
            if (j.fmt == "mp3") {
                req.addOption("-f", "ba/b")
                req.addOption("-x")
                req.addOption("--audio-format", "mp3")
                req.addOption("--audio-quality", "${ABR[j.q]}K")
            } else {
                req.addOption("-f", "bv*[height<=$h][vcodec^=avc]+ba[acodec^=mp4a]/bv*[height<=$h]+ba/b[height<=$h]/b")
                req.addOption("--merge-output-format", "mp4")
            }
            if (j.meta) req.addOption("--embed-metadata")
            if (j.sub) {
                req.addOption("--write-subs")
                req.addOption("--sub-langs", "id.*,en.*")
                req.addOption("--convert-subs", "srt")
            }

            j.stage = "download"
            val cb: (Float, Long, String) -> Unit = { p, eta, line ->
                if (j.status == "run") {
                    if (line.contains("[Merger]") || line.contains("[ExtractAudio]") || line.contains("[VideoConvertor]") || line.contains("[Metadata]")) {
                        j.stage = "convert"; j.speed = 0.0; j.eta = 0; j.pct = max(j.pct, 95.0)
                    } else {
                        if (j.stage != "convert") j.stage = "download"
                        if (p >= 0f) j.pct = max(j.pct, min(94.0, p * 0.94))
                        if (eta >= 0) j.eta = eta
                        Regex("at\\s+(\\d+(?:\\.\\d+)?)([KMG]?)i?B/s").find(line)?.let { m -> j.speed = toMb(m.groupValues[1], m.groupValues[2]) }
                        Regex("of\\s+~?\\s*(\\d+(?:\\.\\d+)?)([KMG]?)i?B").find(line)?.let { m -> j.size = toMb(m.groupValues[1], m.groupValues[2]) }
                    }
                }
            }
            YoutubeDL.execute(req, procId, cb)
            if (j.status != "run") return

            j.stage = "convert"; j.pct = 97.0
            val files = tmp.listFiles()?.toList().orEmpty().filter { it.isFile && it.name.startsWith("src.") }
            val skip = setOf("srt", "vtt", "part", "ytdl", "jpg", "jpeg", "png", "webp", "json")
            val media = files.filter { it.extension.lowercase() !in skip }
            val out = media.firstOrNull { it.extension.equals(j.ext, true) } ?: media.maxByOrNull { it.length() }
                ?: throw IOException("File hasil tidak ditemukan")

            var base = clean(j.title)
            if (j.num > 0) base = j.num.toString().padStart(2, '0') + " " + base
            val saved = saveToDownloads(out, "$base.${out.extension}", j.dest)
            files.filter { it.extension.equals("srt", true) }.forEach {
                saveToDownloads(it, "$base${it.name.removePrefix("src")}", j.dest)
            }
            tmp.deleteRecursively()
            j.size = max(j.size, out.length() / 1048576.0)
            j.file = saved; j.pct = 100.0; j.speed = 0.0; j.eta = 0; j.stage = ""; j.status = "done"
            pump()
        } catch (e: YoutubeDL.CanceledException) {
            // dijeda atau dibatalkan pengguna: status sudah diatur oleh stop()
        } catch (e: InterruptedException) {
        } catch (e: Throwable) {
            if (j.status != "run") return
            val msg = if (e is YoutubeDLException) shortError(e) else (e.message ?: e.toString())
            if (j.tries++ < 1) { j.status = "wait"; j.pct = 0.0; pump() } else fail(j, msg)
        }
    }

    private fun saveToDownloads(file: File, displayName: String, sub: String): String {
        val rel = Environment.DIRECTORY_DOWNLOADS + "/" + BASE + if (sub.isNotEmpty()) "/$sub" else ""
        val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(file.extension.lowercase())
            ?: if (file.extension.equals("srt", true)) "application/x-subrip" else "application/octet-stream"
        val values = ContentValues().apply {
            put(MediaStore.MediaColumns.DISPLAY_NAME, displayName)
            put(MediaStore.MediaColumns.MIME_TYPE, mime)
            put(MediaStore.MediaColumns.RELATIVE_PATH, rel)
            put(MediaStore.MediaColumns.IS_PENDING, 1)
        }
        val resolver = ctx.contentResolver
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: throw IOException("Gagal membuat file di Download")
        resolver.openOutputStream(uri)?.use { o -> file.inputStream().use { it.copyTo(o) } } ?: throw IOException("Gagal menulis file")
        values.clear()
        values.put(MediaStore.MediaColumns.IS_PENDING, 0)
        resolver.update(uri, values, null, null)
        return "$rel/$displayName"
    }
}
