// Prueba firmas candidatas contra el código de antes (HEAD) y el de ahora. Uso: node unificar/.salida/elegir-ronda14/firmas.mjs
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
const CANDIDATAS = {
  linea: ["<polyline\\b", "\\bd=\\{(?:trazo|camino|linea)\\("],
  barras: ["[\"'`](?=[^\"'`]*(?<![\\w-])flex(?![\\w-]))(?=[^\"'`]*(?<![\\w-])items-end(?![\\w-]))(?=[^\"'`]*(?<![\\w-])h-(?:\\d+|\\[\\d+px\\])(?![\\w.\\[-]))"],
  escala: ["[\"'`](?=[^\"'`]*(?<![\\w-])h-(?:1|1\\.5|2|\\[3px\\]|\\[5px\\])(?![\\w.\\[-]))(?=[^\"'`]*(?<![\\w-])overflow-hidden(?![\\w-]))(?=[^\"'`]*(?<![\\w-])rounded-full(?![\\w-]))(?=[^\"'`]*(?<![\\w-])bg-(?:sand|hueso|tinta/10)(?![\\w-]))"],
};
const archivos = execFileSync("git", ["ls-files", "components", "app"], { encoding: "utf8" }).split("\n").filter((f) => /\.tsx$/.test(f));
for (const [id, fs] of Object.entries(CANDIDATAS)) {
  const res = fs.map((f) => new RegExp(f));
  const antes = [], ahora = [];
  for (const f of archivos) {
    let t = ""; try { t = execFileSync("git", ["show", `HEAD:apps/web/${f}`], { encoding: "utf8" }); } catch {}
    const tiene = (txt) => txt.split("\n").some((l) => !/^\s*(\/\/|\/\*|\*|\{\s*\/\*)/.test(l) && !/unificar-fijo:/.test(l) && res.some((r) => r.test(l)));
    if (t && tiene(t)) antes.push(f);
    if (existsSync(f) && tiene(readFileSync(f, "utf8"))) ahora.push(f);
  }
  console.log(`\n${id}: antes ${antes.length} · ahora ${ahora.length}\n  ahora: ${ahora.join("\n         ")}`);
}
