import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const APP_URL = process.env.APP_URL || "http://127.0.0.1:3001";
const RECORD_VIDEO = process.env.RECORD_VIDEO === "1";
const RECORD_HOLD_MS = Number(process.env.RECORD_HOLD_MS || 2500);
const ROOT = dirname(fileURLToPath(import.meta.url));
const VIDEO_DIR = join(ROOT, "test-results", "voice-videos");
const videoRecords = [];
if (RECORD_VIDEO) {
  rmSync(VIDEO_DIR, { recursive: true, force: true });
  mkdirSync(VIDEO_DIR, { recursive: true });
}

function fail(message) {
  throw new Error(message);
}

function assert(ok, message) {
  if (!ok) fail(message);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForApp(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function startApp() {
  if (await waitForApp(APP_URL, 1500)) return null;
  const child = spawn(
    process.platform === "win32" ? "cmd.exe" : "npm",
    process.platform === "win32"
      ? ["/c", "npm", "run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3001"]
      : ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3001"],
  {
    cwd: process.cwd(),
    stdio: "pipe",
    env: { ...process.env, NEXT_PUBLIC_API_URL: "http://127.0.0.1:8000" },
  });
  child.stdout.on("data", (b) => process.stdout.write(b));
  child.stderr.on("data", (b) => process.stderr.write(b));
  if (!(await waitForApp(APP_URL))) {
    child.kill();
    fail(`Next dev server tidak naik di ${APP_URL}`);
  }
  return child;
}

function stopApp(child) {
  if (!child) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
}

function b64url(text) {
  return Buffer.from(text, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function slug(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "scenario";
}

async function closePage(page, name) {
  if (RECORD_VIDEO) await page.waitForTimeout(RECORD_HOLD_MS);
  const video = page.video?.();
  await page.context().close();
  if (!RECORD_VIDEO || !video) return;
  const source = await video.path().catch(() => null);
  if (!source || !existsSync(source)) return;
  const file = join(VIDEO_DIR, `${String(videoRecords.length + 1).padStart(2, "0")}-${slug(name)}.webm`);
  renameSync(source, file);
  videoRecords.push({ name, file: relative(ROOT, file).replace(/\\/g, "/") });
}

async function newPage(browser, calls, viewport = { width: 1280, height: 820 }) {
  const context = await browser.newContext({
    viewport,
    ...(RECORD_VIDEO ? { recordVideo: { dir: VIDEO_DIR, size: viewport } } : {}),
  });
  const page = await context.newPage();
  page.on("pageerror", (err) => console.error("PAGE ERROR:", err.message));
  page.on("console", (msg) => {
    const text = msg.text();
    if (/Failed to load resource|THREE\.Clock|GL Driver Message/.test(text)) return;
    if (["error", "warning"].includes(msg.type())) console.error(`BROWSER ${msg.type()}:`, text);
  });

  await page.addInitScript(() => {
    window.__mockTranscript = "";
    window.__mockWsAnswer = "Jawaban mock dari backend.";
    window.__wsSends = [];
    window.__audioDelay = 25;
    window.__recognitionStarts = 0;
    window.__ttsStreams = 0;
    window.__ttsStreamUrls = [];

    navigator.vibrate = () => true;

    class MockAudio {
      constructor(src = "") {
        this._src = "";
        this.src = src;
        this.currentTime = 0;
        this.duration = 0.2;
        this.paused = true;
        this.ended = false;
        this.volume = 1;
        this.onplay = null;
        this.onended = null;
      }
      set src(value) {
        this._src = value;
        if (String(value).includes("/speak-kira-stream")) {
          window.__ttsStreams += 1;
          window.__ttsStreamUrls.push(String(value));
        }
      }
      get src() {
        return this._src;
      }
      play() {
        this.paused = false;
        this.onplay?.();
        if (this._src && String(this._src).startsWith("blob:")) window.__lastAudioObjectUrl = this._src;
        setTimeout(() => {
          this.paused = true;
          this.ended = true;
          this.onended?.();
        }, window.__audioDelay);
        return Promise.resolve();
      }
      pause() {
        this.paused = true;
      }
    }
    window.Audio = MockAudio;

    class MockAudioContext {
      createMediaElementSource() {
        return { connect() {} };
      }
      createAnalyser() {
        return {
          fftSize: 128,
          frequencyBinCount: 64,
          connect() {},
          getByteFrequencyData(data) { data.fill(0); },
        };
      }
      close() {
        return Promise.resolve();
      }
      get destination() {
        return {};
      }
    }
    window.AudioContext = MockAudioContext;
    window.webkitAudioContext = MockAudioContext;

    class MockSpeechRecognition {
      constructor() {
        this.lang = "";
        this.interimResults = false;
        this.continuous = false;
        this.onresult = null;
        this.onend = null;
        this.onerror = null;
      }
      start() {
        window.__recognitionStarts += 1;
        const transcript = window.__mockTranscript;
        setTimeout(() => {
          this.onresult?.({
            results: {
              length: 1,
              0: { 0: { transcript }, isFinal: true },
            },
          });
        }, 20);
        setTimeout(() => this.onend?.(), 45);
      }
      stop() {
        this.onend?.();
      }
    }
    window.SpeechRecognition = MockSpeechRecognition;
    window.webkitSpeechRecognition = MockSpeechRecognition;

    const NativeWebSocket = window.WebSocket;
    class MockWebSocket {
      constructor(url) {
        this.url = url;
        setTimeout(() => this.onopen?.(), 5);
      }
      send(data) {
        window.__wsSends.push(data);
        setTimeout(() => {
          this.onmessage?.({ data: JSON.stringify({ type: "answer", text: window.__mockWsAnswer }) });
        }, 20);
      }
      close() {}
    }
    window.WebSocket = function RoutedWebSocket(url, protocols) {
      if (String(url).includes("127.0.0.1:8000/ws/chat")) return new MockWebSocket(url);
      return new NativeWebSocket(url, protocols);
    };
    window.WebSocket.prototype = NativeWebSocket.prototype;
  });

  if (RECORD_VIDEO) {
    await page.addStyleTag({ content: `
      .test-recorder-caption {
        position: fixed;
        left: 50%;
        bottom: 22px;
        transform: translateX(-50%);
        z-index: 999999;
        max-width: min(760px, 92vw);
        padding: 12px 16px;
        border-radius: 18px;
        background: rgba(2, 8, 23, 0.82);
        border: 1px solid rgba(125, 211, 252, 0.4);
        color: #e0f2fe;
        font: 600 15px/1.45 ui-sans-serif, system-ui, sans-serif;
        text-align: center;
        box-shadow: 0 16px 48px rgba(0, 0, 0, 0.35);
        pointer-events: none;
      }
    `});
  }

  await page.route("**/chat/history**", (route) => route.fulfill({ json: [] }));
  await page.route("**/speak-template", async (route) => {
    const data = route.request().postDataJSON();
    calls.templates.push(data.category);
    route.fulfill({
      status: 200,
      headers: {
        "content-type": "audio/mpeg",
        "x-anta-text": b64url(`${data.category} test`),
      },
      body: Buffer.from([0]),
    });
  });
  await page.route("**/speak-kira", async (route) => {
    const data = route.request().postDataJSON();
    calls.speak.push(data.text || "");
    route.fulfill({ status: 200, headers: { "content-type": "audio/mpeg" }, body: Buffer.from([0]) });
  });

  await page.goto(APP_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".shader-frame button");
  await page.waitForTimeout(500);
  return page;
}

async function subtitleText(page) {
  return page.locator(".subtitle-live, .menu-subtitle").first().textContent().catch(() => "");
}

async function voice(page, text, waitMs = 800) {
  await page.evaluate((cmd) => {
    window.__mockTranscript = cmd;
    window.__wsSends = [];
    document.querySelector(".test-recorder-caption")?.remove();
  }, text);
  await page.evaluate(() => document.querySelector(".shader-frame button")?.click());
  await page.waitForTimeout(waitMs);
  return page.evaluate(() => window.__wsSends.length);
}

async function caption(page, text) {
  if (!RECORD_VIDEO) return;
  await page.evaluate((value) => {
    let el = document.querySelector(".test-recorder-caption");
    if (!el) {
      el = document.createElement("div");
      el.className = "test-recorder-caption";
      document.body.appendChild(el);
    }
    el.textContent = value;
  }, text);
}

async function noOverflow(page) {
  const box = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    panel: document.querySelector(".menu-panel")?.getBoundingClientRect().toJSON?.(),
    active: document.querySelector(".menu-card-3d.is-active")?.getBoundingClientRect().toJSON?.(),
  }));
  assert(box.width <= box.viewport + 2, `UI overflow horizontal: ${box.width} > ${box.viewport}`);
  if (box.panel) {
    assert(box.panel.left >= -1 && box.panel.right <= box.viewport + 1, "panel keluar dari viewport");
  }
  if (box.active) {
    assert(box.active.right > 0 && box.active.left < box.viewport, "card aktif tidak terlihat");
  }
}

async function runCommandCase(browser, name, command, expectedTemplates, options = {}) {
  const calls = { templates: [], speak: [] };
  const page = await newPage(browser, calls, options.viewport);
  const wsCount = await voice(page, command, options.waitMs || 1400);

  const subtitle = await subtitleText(page);
  assert(JSON.stringify(calls.templates) === JSON.stringify(expectedTemplates), `${name}: template ${JSON.stringify(calls.templates)} != ${JSON.stringify(expectedTemplates)}; subtitle="${subtitle}"`);
  assert(!calls.templates.includes("Hasil ditemukan"), `${name}: tidak boleh memutar template Hasil ditemukan`);
  if (options.noWs !== false) assert(wsCount === 0, `${name}: command lokal tidak boleh masuk WebSocket`);
  if (options.expectSpeak !== undefined) {
    const streams = await page.evaluate(() => window.__ttsStreams);
    assert(calls.speak.length + streams === options.expectSpeak, `${name}: TTS ${calls.speak.length + streams} != ${options.expectSpeak}`);
  }
  if (options.expectMenu) assert(await page.locator(".menu-screen").isVisible(), `${name}: menu tidak terbuka`);
  if (options.expectPanel) assert(await page.locator(".menu-panel").isVisible(), `${name}: panel tidak terbuka`);
  await noOverflow(page);
  await caption(page, options.caption || `Anta: ${command}`);
  await closePage(page, name);
}

async function runSequence(browser) {
  const calls = { templates: [], speak: [] };
  const page = await newPage(browser, calls);

  let wsCount = await voice(page, "buka menu", 1000);
  assert(wsCount === 0, "buka menu tidak boleh masuk WebSocket");
  assert(await page.locator(".menu-screen").isVisible(), "menu harus terbuka");
  assert(JSON.stringify(calls.templates) === JSON.stringify(["Membuka aplikasi"]), "buka menu harus hanya memutar Membuka aplikasi");
  await caption(page, "Anta: Menu saya buka.");

  wsCount = await voice(page, "tutup halaman", 700);
  assert(wsCount === 0, "tutup halaman tidak boleh masuk WebSocket");
  assert(!(await page.locator(".menu-screen").isVisible()), "menu harus tertutup");
  assert(!calls.templates.includes("Hasil ditemukan"), "tutup halaman tidak boleh memutar Hasil ditemukan");
  await caption(page, "Anta: Saya tutup.");

  await closePage(page, "sequence buka menu lalu tutup halaman");
}

async function runPanelSearch(browser) {
  const calls = { templates: [], speak: [] };
  const page = await newPage(browser, calls);

  await voice(page, "buka google", 1400);
  assert(await page.locator(".menu-panel").isVisible(), "Google panel harus terbuka");

  const wsCount = await voice(page, "cari cuaca jakarta", 900);
  assert(wsCount === 0, "cari di panel Google harus ditangani lokal, bukan WebSocket");
  assert(JSON.stringify(calls.templates) === JSON.stringify(["Membuka aplikasi", "Loading / mencari"]), `panel search template salah: ${JSON.stringify(calls.templates)}`);
  assert(!calls.templates.includes("Hasil ditemukan"), "panel search tidak boleh memutar Hasil ditemukan");
  await noOverflow(page);
  await caption(page, "Anta: Saya cari cuaca jakarta di Google.");
  await closePage(page, "panel search google");
}

async function runGeneralSearch(browser) {
  const calls = { templates: [], speak: [] };
  const page = await newPage(browser, calls);

  const wsCount = await voice(page, "cari berita ai hari ini", 900);
  assert(wsCount === 1, "search umum harus masuk WebSocket sekali");
  assert(JSON.stringify(calls.templates) === JSON.stringify(["Loading / mencari"]), `search umum template salah: ${JSON.stringify(calls.templates)}`);
  const streams = await page.evaluate(() => window.__ttsStreams);
  assert(calls.speak.length + streams === 1, "jawaban search umum harus dibacakan via TTS natural");
  assert(!calls.templates.includes("Hasil ditemukan"), "search umum tidak boleh memutar Hasil ditemukan");
  await caption(page, "Anta: Jawaban mock dari backend.");
  await closePage(page, "general search");
}

async function runLongAnswerSpeech(browser) {
  const calls = { templates: [], speak: [] };
  const page = await newPage(browser, calls);
  const longAnswer = "Anta sudah cek datanya. Bagian paling penting adalah performa respons suara harus terasa cepat, natural, dan tidak bicara terlalu panjang. Detail teknisnya tetap bisa ditampilkan di layar supaya user tidak kehilangan informasi. Kalau semua isi dibacakan, percakapan akan terasa lambat dan melelahkan.";

  await page.evaluate((answer) => { window.__mockWsAnswer = answer; }, longAnswer);
  const wsCount = await voice(page, "jelaskan hasilnya", 1200);
  assert(wsCount === 1, "jawaban panjang harus masuk WebSocket");

  const spoken = await page.evaluate(() => {
    const url = window.__ttsStreamUrls[0] || "";
    return new URL(url, location.href).searchParams.get("text") || "";
  });
  assert(spoken.startsWith("Intinya begini, Bos."), `jawaban panjang harus dibuka dengan gaya Anta, spoken="${spoken}"`);
  assert(spoken.includes("Kalau mau, saya lanjutkan detailnya."), "jawaban panjang harus menawarkan lanjut detail via suara");
  assert(spoken.length < longAnswer.length, "teks TTS harus lebih pendek dari jawaban penuh");
  await caption(page, `Anta: ${spoken}`);

  await closePage(page, "long answer speech summary");
}

async function runBargeIn(browser) {
  const calls = { templates: [], speak: [] };
  const page = await newPage(browser, calls);

  await page.evaluate(() => { window.__audioDelay = 1000; window.__mockWsAnswer = "Jawaban panjang yang sedang dibacakan Anta."; });
  const firstWs = await voice(page, "cerita sesuatu", 700);
  assert(firstWs === 1, "barge-in: command pertama harus masuk WebSocket");

  await page.evaluate(() => { window.__audioDelay = 25; });
  const secondWs = await voice(page, "halo anta", 900);
  assert(secondWs === 0, "barge-in: sapaan setelah menyela tidak boleh masuk WebSocket");
  assert(calls.templates.includes("Pembuka"), `barge-in: sapaan setelah interrupt tidak diproses, templates=${JSON.stringify(calls.templates)}`);
  const streams = await page.evaluate(() => window.__ttsStreams);
  assert(calls.speak.length + streams === 1, `barge-in: tidak boleh ada TTS tambahan setelah sapaan, speak=${JSON.stringify(calls.speak)}, streams=${streams}`);
  await caption(page, "Anta: Halo, Bos. Anta siap.");

  await closePage(page, "barge in interrupt");
}

async function runPseudoLive(browser) {
  const calls = { templates: [], speak: [] };
  const page = await newPage(browser, calls);

  await page.locator(".auto-listen-corner").click();
  await voice(page, "halo anta", 1500);
  const starts = await page.evaluate(() => window.__recognitionStarts);
  assert(starts >= 2, `pseudo-live: mic harus otomatis start lagi, starts=${starts}`);
  await caption(page, "Anta: Halo, Bos. Anta siap. Live aktif, mic mendengar lagi.");

  await closePage(page, "pseudo live auto listen");
}

async function runSubtitleCasing(browser) {
  const calls = { templates: [], speak: [] };
  const page = await newPage(browser, calls);

  await page.evaluate(() => { window.__audioDelay = 1000; });
  await voice(page, "halo anta", 80);
  const text = await subtitleText(page);
  assert(text.startsWith("Halo Anta"), `subtitle harus kapital rapi, dapat "${text}"`);
  await caption(page, `Subtitle: ${text}`);

  await closePage(page, "subtitle casing");
}

async function runMenuMotion(browser) {
  const calls = { templates: [], speak: [] };
  const page = await newPage(browser, calls);
  await voice(page, "buka menu", 1400);
  await page.waitForSelector(".menu-pipeline");

  const xOf = (value) => {
    if (!value || value === "none") return 0;
    const raw = value.slice(value.indexOf("(") + 1, value.lastIndexOf(")"));
    const nums = raw.match(/-?\d+\.?\d*/g)?.map(Number) || [];
    if (value.startsWith("translate3d")) return nums[1] || 0;
    if (value.startsWith("translate")) return nums[0] || 0;
    return value.startsWith("matrix3d") ? nums[12] || 0 : nums[4] || 0;
  };

  const start = xOf(await page.locator(".menu-pipeline").evaluate((el) => getComputedStyle(el).transform));
  await page.evaluate(() => document.querySelector(".menu-nav-right")?.click());
  await page.waitForTimeout(120);
  const midTransform = await page.locator(".menu-pipeline").evaluate((el) => getComputedStyle(el).transform);
  const mid = xOf(midTransform);
  await page.waitForTimeout(850);
  const endTransform = await page.locator(".menu-pipeline").evaluate((el) => getComputedStyle(el).transform);
  const end = xOf(endTransform);
  const activeName = await page.locator(".menu-card-3d.is-active .menu-card-name").textContent();
  const disabled = await page.locator(".menu-nav-right").evaluate((el) => el.disabled);

  assert(start > -5, `menu motion: posisi awal salah ${start}`);
  assert(mid < -5 && mid > -315, `menu motion: transisi snap, mid=${mid}, transform=${midTransform}, active=${activeName}, disabled=${disabled}`);
  assert(end < -300, `menu motion: posisi akhir belum sampai, end=${end}, transform=${endTransform}, active=${activeName}, disabled=${disabled}`);
  await caption(page, `Anta: Menu berpindah ke ${activeName}.`);
  await closePage(page, "menu motion");
}

const server = await startApp();
const browser = await chromium.launch();
let runError = null;

try {
  for (const text of ["halo", "halo anta", "hai bos", "pagi anta"]) {
    await runCommandCase(browser, `sapaan: ${text}`, text, ["Pembuka"], { expectSpeak: 0, caption: "Anta: Halo, Bos. Anta siap." });
  }

  for (const [command, panel] of [
    ["buka menu", false],
    ["buka google", true],
    ["buka youtube", true],
    ["buka spotify", true],
    ["buka notepad", true],
    ["buka folder", true],
  ]) {
    const app = command.replace(/^buka\s+/, "");
    await runCommandCase(browser, command, command, ["Membuka aplikasi"], { expectMenu: true, expectPanel: panel, expectSpeak: 0, caption: `Anta: ${app === "menu" ? "Menu" : app} saya buka.` });
  }

  await runCommandCase(browser, "tutup tanpa menu", "tutup halaman", [], { caption: "Anta: Tidak ada halaman yang sedang terbuka." });
  await runSequence(browser);
  await runPanelSearch(browser);
  await runGeneralSearch(browser);
  await runLongAnswerSpeech(browser);
  await runSubtitleCasing(browser);
  await runBargeIn(browser);
  await runPseudoLive(browser);
  await runMenuMotion(browser);
  await runCommandCase(browser, "mobile folder panel", "buka folder", ["Membuka aplikasi"], {
    viewport: { width: 390, height: 844 },
    expectMenu: true,
    expectPanel: true,
    caption: "Anta: Folder saya buka.",
  });

  console.log("PASS voice/menu regression tests");
} catch (err) {
  runError = err;
  console.error(err);
} finally {
  stopApp(server);
  await Promise.race([browser.close(), sleep(3000)]);
  if (RECORD_VIDEO) {
    writeFileSync(
      join(VIDEO_DIR, "manifest.json"),
      JSON.stringify({ ok: !runError, videos: videoRecords }, null, 2),
    );
  }
}

process.exit(runError ? 1 : 0);
