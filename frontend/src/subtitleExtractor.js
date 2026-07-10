/**
 * Subtitle Extractor - ffmpeg.wasm ile embedded altyazı çıkarma
 * Lazy-load: sadece video seçildiğinde yüklenir.
 */

let ffmpegInstance = null;
let ffmpegLoading = false;
let ffmpegLoadPromise = null;

/**
 * ffmpeg.wasm'ı lazy-load ile yükler
 */
export async function loadFFmpeg() {
  if (ffmpegInstance) return ffmpegInstance;
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  ffmpegLoading = true;
  ffmpegLoadPromise = (async () => {
    try {
      const { FFmpeg } = await import("@ffmpeg/ffmpeg");
      const { toBlobURL } = await import("@ffmpeg/util");

      const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm";
      const ffmpeg = new FFmpeg();

      ffmpeg.on("log", ({ message }) => {
        console.log("[FFmpeg]", message);
      });

      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });

      ffmpegInstance = ffmpeg;
      ffmpegLoading = false;
      console.log("[FFmpeg] Yüklendi");
      return ffmpeg;
    } catch (err) {
      ffmpegLoading = false;
      ffmpegLoadPromise = null;
      console.error("[FFmpeg] Yükleme hatası:", err);
      throw err;
    }
  })();

  return ffmpegLoadPromise;
}

/**
 * Videodaki embedded altyazı track'lerini tespit eder ve VTT'ye çevirir.
 * @param {File} file - Video dosyası
 * @param {function} onProgress - İlerleme callback'i (0-100)
 * @returns {Promise<Array<{id: string, language: string, name: string, vttContent: string}>>}
 */
export async function extractEmbeddedSubtitles(file, onProgress) {
  let ffmpeg;
  try {
    ffmpeg = await loadFFmpeg();
  } catch (err) {
    console.error("[FFmpeg] Yüklenemedi, atlanıyor:", err.message);
    throw err;
  }

  if (onProgress) onProgress(10);

  const inputName = "input" + getExtension(file.name);
  const fileData = new Uint8Array(await file.arrayBuffer());

  try {
    await ffmpeg.writeFile(inputName, fileData);
  } catch (err) {
    console.error("[FFmpeg] Dosya yazılamadı:", err.message);
    throw err;
  }

  if (onProgress) onProgress(30);

  if (onProgress) onProgress(50);

  // Altyazı stream'lerini bul
  const tracks = await detectSubtitleStreams(ffmpeg, inputName);

  console.log(`[FFmpeg] Tespit edilen altyazı track sayısı: ${tracks.length}`);

  if (tracks.length === 0) {
    await ffmpeg.deleteFile(inputName);
    return [];
  }

  if (onProgress) onProgress(60);

  // Her track'i VTT'ye çevir
  const results = [];
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const outputName = `sub_${i}.vtt`;

    try {
      const args = [
        "-i", inputName,
        "-map", `0:s:${i}`,
        "-c:s:0", "webvtt",
        "-f", "webvtt",
        outputName
      ];

      await ffmpeg.exec(args);

      try {
        const data = await ffmpeg.readFile(outputName, "utf-8");
        if (data && data.trim().length > 0) {
          results.push({
            id: `embedded_${i}`,
            language: track.language || "und",
            name: track.name || `Altyazı ${i + 1}`,
            vttContent: data,
          });
          console.log(`[FFmpeg] Track ${i} başarıyla çıkarıldı (${data.length} byte)`);
        }
      } catch (_) {}

      try { await ffmpeg.deleteFile(outputName); } catch (_) {}
    } catch (err) {
      console.warn(`[FFmpeg] Track ${i} dönüştürme hatası:`, err.message);
    }

    if (onProgress) onProgress(60 + Math.floor((i / tracks.length) * 35));
  }

  try { await ffmpeg.deleteFile(inputName); } catch (_) {}
  if (onProgress) onProgress(100);

  return results;
}

/**
 * Dosyadaki altyazı stream'lerini tespit eder
 */
async function detectSubtitleStreams(ffmpeg, inputName) {
  const tracks = [];

  try {
    let stderr = "";

    // stderr'i yakalamak için log handler kullan
    await new Promise((resolve) => {
      const handler = ({ message }) => {
        stderr += message + "\n";
      };
      ffmpeg.on("log", handler);
      ffmpeg.exec(["-i", inputName]).then(() => {
        ffmpeg.off("log", handler);
        resolve();
      }).catch(() => {
        ffmpeg.off("log", handler);
        resolve();
      });
    });

    console.log("[FFmpeg] Probe çıktısı:\n", stderr);

    // Stream satırlarını parse et — ffmpeg.wasm farklı format kullanabilir
    const lines = stderr.split("\n");
    for (const line of lines) {
      // Hem "Stream #0:1(trk): Subtitle" hem de "Stream #0:1: Subtitle" formatını destekle
      if (line.includes("Stream #") && (line.includes("Subtitle") || line.includes("subtitle") || line.includes("sub"))) {
        const langMatch = line.match(/(?:Language|lang)[:\s]+(\w+)/i) || line.match(/\((\w{2,3})\)/);
        const nameMatch = line.match(/"([^"]+)"/);
        const indexMatch = line.match(/Stream #\d+:(\d+)/);

        tracks.push({
          index: indexMatch ? parseInt(indexMatch[1]) : tracks.length,
          language: langMatch ? langMatch[1] : "und",
          name: nameMatch ? nameMatch[1] : `Altyazı ${tracks.length + 1}`,
        });
      }
    }
  } catch (err) {
    console.warn("[FFmpeg] Stream tespit hatası:", err.message);
  }

  return tracks;
}

/**
 * Dosya uzantısını çıkarır
 */
function getExtension(filename) {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot) : ".mp4";
}

/**
 * VTT içeriğini cue listesine parse eder
 * @param {string} vttContent - VTT dosya içeriği
 * @returns {Array<{id: string, start: number, end: number, text: string}>}
 */
export function parseVTT(vttContent) {
  if (!vttContent) return [];

  const cues = [];
  const lines = vttContent.split("\n");
  let i = 0;

  // WEBVTT başlığını atla
  while (i < lines.length && !lines[i].includes("-->")) {
    i++;
  }

  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.includes("-->")) {
      const [timePart, ...textParts] = line.split("-->");
      const timeRange = timePart.trim() + "-->" + (textParts.join("-->")).trim();
      const timeParts = timeRange.split("-->").map(s => s.trim());

      if (timeParts.length === 2) {
        const start = parseVTTTime(timeParts[0]);
        const end = parseVTTTime(timeParts[1]);

        // Text satırlarını topla
        i++;
        const textLines = [];
        while (i < lines.length && lines[i].trim() !== "" && !lines[i].includes("-->")) {
          textLines.push(lines[i].trim());
          i++;
        }

        if (textLines.length > 0 && start >= 0 && end > start) {
          cues.push({
            id: `cue_${cues.length}`,
            start,
            end,
            text: textLines.join("\n").replace(/<[^>]+>/g, ""),
          });
        }
        continue;
      }
    }
    i++;
  }

  return cues;
}

/**
 * VTT zaman damgasını saniyeye çevirir
 * @param {string} time - "HH:MM:SS.mmm" veya "MM:SS.mmm"
 * @returns {number}
 */
function parseVTTTime(time) {
  const parts = time.trim().split(":");
  if (parts.length === 3) {
    const [h, m, rest] = parts;
    const [s, ms] = rest.split(".");
    return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + (parseInt(ms || 0) / 1000);
  } else if (parts.length === 2) {
    const [m, rest] = parts;
    const [s, ms] = rest.split(".");
    return parseInt(m) * 60 + parseInt(s) + (parseInt(ms || 0) / 1000);
  }
  return 0;
}

/**
 * Belirli bir zamandaki aktif cue'u bulur
 * @param {Array} cues - Parse edilmiş cue listesi
 * @param {number} currentTime - Video şu anki zamanı (saniye)
 * @returns {string} Aktif cue metni
 */
export function getActiveCueText(cues, currentTime) {
  if (!cues || cues.length === 0) return "";

  const activeCues = cues.filter(
    (cue) => currentTime >= cue.start && currentTime <= cue.end
  );

  return activeCues.map((c) => c.text).join("\n");
}
