import * as fs from "node:fs";
import * as path from "node:path";

function uniquePaths(items: string[]): string[] {
  return [...new Set(items.map((p) => path.resolve(p)))];
}

export function getStorageRoots(): string[] {
  const roots = [
    process.env.DATA_DIR,
    process.env.CACHE_DIR,
    path.resolve(__dirname, "../../../data"),
    path.resolve(__dirname, "../../../cache"),
    path.resolve(__dirname, "../../../attached_assets"),
  ].filter((v): v is string => Boolean(v && v.trim()));
  return uniquePaths(roots);
}

export function resolveReadableStoragePath(candidates: string[]): string | null {
  const roots = getStorageRoots();
  for (const candidate of candidates) {
    if (!candidate) continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    if (path.isAbsolute(trimmed) && fs.existsSync(trimmed)) return trimmed;
    for (const root of roots) {
      const full = path.resolve(root, trimmed);
      if (fs.existsSync(full)) return full;
    }
  }
  return null;
}

