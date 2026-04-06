/**
 * 非同步 LINE 推播佇列
 * 解決爆單時大量 push 導致 HTTP 請求阻塞的問題。
 * 所有推播工作進入佇列後立即返回，後台以最大 CONCURRENCY 平行處理。
 * 使用方式：enqueueNotification(() => pushFlex(uid, altText, bubble))
 */

type Job = () => Promise<void>;

const CONCURRENCY = 10;  // 同時最多 10 個 LINE API 請求
const RETRY_MAX = 2;      // 失敗重試次數

interface JobEntry {
  fn: Job;
  retries: number;
  label: string;
}

const queue: JobEntry[] = [];
let running = 0;
let stats = { pending: 0, running: 0, completed: 0, failed: 0 };

function processNext(): void {
  if (running >= CONCURRENCY || queue.length === 0) return;
  const entry = queue.shift()!;
  stats.pending = Math.max(0, stats.pending - 1);
  running++;
  stats.running = running;

  entry
    .fn()
    .then(() => {
      stats.completed++;
    })
    .catch(async (err) => {
      if (entry.retries < RETRY_MAX) {
        // 指數退避後重新入隊
        await new Promise(r => setTimeout(r, 500 * (entry.retries + 1)));
        entry.retries++;
        queue.push(entry);
        stats.pending++;
      } else {
        stats.failed++;
        console.warn(`[NotifQueue] Job "${entry.label}" failed after ${RETRY_MAX} retries:`, String(err).slice(0, 120));
      }
    })
    .finally(() => {
      running--;
      stats.running = running;
      // 立即嘗試啟動更多工作
      for (let i = 0; i < CONCURRENCY; i++) processNext();
    });
}

/**
 * 將推播工作加入佇列（非阻塞）
 * @param job   實際的推播 async function
 * @param label 識別用標籤（出現在錯誤日誌）
 */
export function enqueueNotification(job: Job, label = "push"): void {
  queue.push({ fn: job, retries: 0, label });
  stats.pending++;
  // 嘗試填滿 CONCURRENCY 並行槽
  for (let i = 0; i < CONCURRENCY; i++) processNext();
}

/** 取得佇列即時狀態（供 /api/line/queue-status 用） */
export function getQueueStats() {
  return { ...stats, queueLength: queue.length, concurrency: CONCURRENCY };
}

/** 等待佇列清空（測試用，最長等 ms 毫秒） */
export async function drainQueue(ms = 30000): Promise<void> {
  const deadline = Date.now() + ms;
  while ((queue.length > 0 || running > 0) && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 100));
  }
}
