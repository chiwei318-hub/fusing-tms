import * as fs from "node:fs";
import * as path from "node:path";

function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eqIndex = trimmed.indexOf("=");
  if (eqIndex <= 0) return null;
  const key = trimmed.slice(0, eqIndex).trim();
  let value = trimmed.slice(eqIndex + 1).trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  return [key, value];
}

function loadFile(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const entry = parseEnvLine(line);
    if (!entry) continue;
    const [key, value] = entry;
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function loadEnvFiles() {
  const visited = new Set<string>();
  let current = process.cwd();

  for (let i = 0; i < 6; i++) {
    const localEnv = path.resolve(current, ".env.local");
    const env = path.resolve(current, ".env");
    for (const filePath of [env, localEnv]) {
      if (!visited.has(filePath)) {
        loadFile(filePath);
        visited.add(filePath);
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

