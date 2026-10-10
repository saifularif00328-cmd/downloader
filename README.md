# Downloader Josjis by Digitalku

Bulk downloader (YouTube, TikTok, Facebook, dll via yt-dlp) dengan konversi ffmpeg.

## Menjalankan
1. Pasang [Node.js](https://nodejs.org) ≥ 18, [yt-dlp](https://github.com/yt-dlp/yt-dlp) dan [ffmpeg](https://ffmpeg.org) (harus ada di PATH).
   - Windows: `winget install yt-dlp.yt-dlp Gyan.FFmpeg`
2. `node server.js` lalu buka http://127.0.0.1:8787
3. File tersimpan di `~/Downloads/Josjis` (ubah dengan env `JOSJIS_DIR`).

Tanpa backend, `index.html` tetap bisa dibuka sebagai demo UI (data simulasi).

## Preset head unit
Preset `Head unit (terbukti jalan)` = `ffmpeg -target ntsc-dvd`, 720×480, 29,97 fps, MPEG-2 9000k, AC-3 448k 48 kHz (`.mpg`).
Nama file preset perangkat otomatis dibuat ASCII ≤ 30 karakter. Gunakan flashdisk FAT32.

## Keamanan
Server hanya listen di 127.0.0.1, hanya menerima Host lokal, tidak memakai shell, dan folder tujuan dikunci di dalam folder dasar.
Unduh hanya konten milik Anda atau yang berizin.

## Versi .exe (Windows)
Bangun sendiri: `npm run build:exe` → `dist/Downloader-Josjis.exe`. Atau jalankan workflow *Build Downloader-Josjis.exe* di tab Actions.
Letakkan `yt-dlp.exe` (dan `ffmpeg.exe` bila belum ada di PATH) di folder yang sama dengan `Downloader-Josjis.exe`, lalu klik dua kali. Browser terbuka otomatis; tutup jendela hitam untuk berhenti.

## Versi Android (APK)
Mandiri: yt-dlp + ffmpeg tertanam di app (hanya MP4 & MP3). Kode di folder `android/`.
Build lewat GitHub Actions → *Build Android APK* → unduh artifact `Josjis-apk`
(pasang `app-arm64-v8a-debug.apk` untuk HP modern, `armeabi-v7a` untuk HP lama).
File tersimpan di `Download/Josjis`. Build lokal: `./android/prepare-assets.sh && gradle -p android assembleDebug` (butuh Android SDK + JDK 17).
