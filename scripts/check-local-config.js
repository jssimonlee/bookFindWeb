import { readFile } from "node:fs/promises";

const raw = await readFile(new URL("../.dev.vars", import.meta.url), "utf8");
const values = Object.fromEntries(
  raw.split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "")];
    })
);

const required = ["DATA4LIBRARY_API_KEY", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"];
const missing = required.filter((name) => !values[name]);
if (missing.length) {
  console.error(`비어 있는 설정: ${missing.join(", ")}`);
  process.exit(1);
}
console.log("API 키와 Turnstile 키가 모두 입력되어 있습니다. 값은 출력하지 않았습니다.");
