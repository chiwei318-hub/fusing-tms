import 'leaflet/dist/leaflet.css';
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

/* ──────────────────────────────────────────────────────────────
   全域 chunk 載入失敗自動重新整理
   每次部署後 chunk hash 改變，舊 HTML 快取的 URL 會失效。
   偵測到此類錯誤時自動 reload，最多只 reload 一次（避免無限迴圈）。
────────────────────────────────────────────────────────────── */
const CHUNK_RELOAD_KEY = "chunk_reload_ts";
const RELOAD_COOLDOWN_MS = 10_000; // 10 秒內不重複 reload

function isChunkErr(msg: string): boolean {
  return (
    msg.includes("dynamically imported module") ||
    msg.includes("Failed to fetch") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("ChunkLoadError") ||
    /Loading (CSS )?chunk .+ failed/.test(msg)
  );
}

function tryAutoReload(source: string, msg: string) {
  if (!isChunkErr(msg)) return;
  const lastReload = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) ?? "0");
  const now = Date.now();
  if (now - lastReload < RELOAD_COOLDOWN_MS) {
    console.warn(`[ChunkGuard] ${source} chunk error, but already reloaded recently — skipping.`);
    return;
  }
  console.warn(`[ChunkGuard] ${source} chunk load error — reloading page to pick up latest bundles…`);
  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now));
  window.location.reload();
}

window.addEventListener("unhandledrejection", (evt) => {
  const msg = String(evt.reason?.message ?? evt.reason ?? "");
  tryAutoReload("unhandledrejection", msg);
});

window.addEventListener("error", (evt) => {
  const msg = String(evt.message ?? "");
  tryAutoReload("window.error", msg);
});

createRoot(document.getElementById("root")!).render(<App />);
