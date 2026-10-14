import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { aperturaDesde, atributos } from "./etiquetas.mjs";
const MAPA = {
  "max-w-sm": "angosta", "max-w-md": "angosta", "max-w-[480px]": "angosta",
  "max-w-lg": "mediana", "max-w-[520px]": "mediana", "max-w-[560px]": "mediana", "max-w-xl": "mediana", "sm:max-w-xl": "mediana", "max-w-[580px]": "mediana", "max-w-[600px]": "mediana", "sm:max-w-[40rem]": "mediana", "max-w-[620px]": "mediana",
  "max-w-2xl": "ancha", "max-w-[680px]": "ancha", "max-w-3xl": "ancha", "max-w-4xl": "ancha",
};
const SOLO_VER = process.argv[2] === "--ver";
const arch = [];
const rec = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) rec(p); else if (/\.tsx$/.test(n)) arch.push(p); } };
rec(process.cwd() + "/components"); rec(process.cwd() + "/app");
let cambios = 0; const raros = [];
for (const f of arch) {
  if (f.endsWith("ui/Modal.tsx") || f.endsWith("ui/ModalRuta.tsx")) continue;
  let t = readFileSync(f, "utf8"); let n = 0;
  const re = /<(Modal|ModalRuta)\b/g; let m; const reemplazos = [];
  while ((m = re.exec(t))) {
    const ap = aperturaDesde(t, m.index); if (!ap) continue;
    const at = atributos(ap.abre).find((a) => a.nombre === "ancho"); if (!at) continue;
    const linea = t.slice(0, m.index + at.ini).split("\n").length;
    const lineaTxt = t.split("\n")[linea - 1];
    if (/unificar-fijo/.test(lineaTxt) || /unificar-fijo/.test(ap.abre)) continue;
    const v = (at.valor ?? "").replace(/^\{?"|"\}?$/g, "");
    const tam = MAPA[v];
    if (!tam) { raros.push(`${f.replace(process.cwd() + "/", "")}:${linea} ${at.valor}`); continue; }
    reemplazos.push({ ini: m.index + at.ini, fin: m.index + at.fin, por: m[1] === "ModalRuta" ? `tamano="${tam}"` : tam === "angosta" ? null : `tamano="${tam}"` });
  }
  for (const r of reemplazos.reverse()) {
    if (r.por === null) { // quitar el atributo y el espacio o el salto de línea que lo antecede
      let a = r.ini; while (a > 0 && /[ \t]/.test(t[a - 1])) a--; if (t[a - 1] === "\n") { a--; } t = t.slice(0, a) + t.slice(r.fin);
    } else t = t.slice(0, r.ini) + r.por + t.slice(r.fin);
    n++;
  }
  if (n && !SOLO_VER) writeFileSync(f, t);
  if (n) cambios += n;
}
console.log({ cambios }); console.log("sin mapear:\n" + raros.join("\n"));
