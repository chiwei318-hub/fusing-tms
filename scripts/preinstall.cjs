/** Cross-platform preinstall: remove npm/yarn lockfiles; require pnpm. */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
for (const name of ["package-lock.json", "yarn.lock"]) {
  const p = path.join(root, name);
  try {
    fs.unlinkSync(p);
  } catch (e) {
    if (e && e.code !== "ENOENT") throw e;
  }
}

const ua = process.env.npm_config_user_agent ?? "";
if (!ua.startsWith("pnpm/")) {
  console.error("Use pnpm instead");
  process.exit(1);
}
