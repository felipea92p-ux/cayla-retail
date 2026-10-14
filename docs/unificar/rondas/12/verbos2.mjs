// A cada botón con `cargando` cuyo verbo no es guardar, su palabra de espera (ADR-0358, ronda 12).
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { aperturaDesde, atributos } from "./etiquetas.mjs";
const ESCRIBIR = process.argv[2] === "--escribir";
const G = [
  [/^(Sí, )?[Dd]esactivar\b/, "Desactivando…"], [/^(Sí, )?[Rr]eactivar\b/, "Reactivando…"], [/^(Sí, )?[Ee]liminar\b/, "Eliminando…"],
  [/^(Sí, )?[Aa]rchivar\b/, "Archivando…"], [/^(Sí, )?[Aa]nular\b/, "Anulando…"], [/^Dar de baja\b/, "Dando de baja…"], [/^(Sí, )?[Rr]etirar\b/, "Retirando…"],
  [/^(Sí, )?[Bb]orrar\b/, "Borrando…"], [/^(Sí, )?[Qq]uitar\b/, "Quitando…"], [/^(Sí, )?[Ll]iberar\b/, "Liberando…"], [/^Restaurar\b/, "Restaurando…"],
  [/^Reabrir\b/, "Reabriendo…"], [/^Unir\b/, "Uniendo…"], [/^Subir\b/, "Subiendo…"], [/^Devolver\b/, "Devolviendo…"], [/^Anonimizar\b/, "Anonimizando…"],
];
const gerundio = (texto) => (G.find(([re]) => re.test(texto)) ?? [])[1] ?? null;
const arch = [];
const rec = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) rec(p); else if (/\.tsx$/.test(n) && !/\.test\./.test(n)) arch.push(p); } };
rec(process.cwd() + "/components"); rec(process.cwd() + "/app");
const hechos = [], dudas = [];
for (const f of arch) {
  let t = readFileSync(f, "utf8"); const cambios = [];
  for (const comp of ["Boton", "BotonCompacto", "BotonPrincipal", "BotonRojo"]) {
    const re = new RegExp(`<${comp}\\b`, "g"); let m;
    while ((m = re.exec(t))) {
      const ap = aperturaDesde(t, m.index); if (!ap || ap.abre.endsWith("/>")) continue;
      const at = atributos(ap.abre);
      if (!at.some((a) => a.nombre === "cargando") || at.some((a) => a.nombre === "textoCargando")) continue;
      const fin = t.indexOf(`</${comp}>`, ap.fin);
      const crudo = t.slice(ap.fin, fin).replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
      const texto = crudo.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      let valor = null;
      const ter = texto.match(/^\{\s*([^?{}]+?)\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"\s*\}$/);
      if (ter) { const a = gerundio(ter[2]), b = gerundio(ter[3]); if (a || b) valor = `{${ter[1]} ? "${a ?? "Guardando…"}" : "${b ?? "Guardando…"}"}`; }
      else { const g = gerundio(texto.replace(/^\+\s*/, "")); if (g) valor = `"${g}"`; }
      if (!valor) continue;
      const linea = t.slice(0, m.index).split("\n").length;
      cambios.push({ pos: m.index + `<${comp}`.length, ins: ` textoCargando=${valor}` });
      hechos.push(`${f.replace(process.cwd() + "/", "")}:${linea} ${comp} «${texto.slice(0, 40)}» → ${valor}`);
    }
  }
  if (!cambios.length) continue;
  for (const c of cambios.sort((a, b) => b.pos - a.pos)) t = t.slice(0, c.pos) + c.ins + t.slice(c.pos);
  if (ESCRIBIR) writeFileSync(f, t);
}
console.log(hechos.length); console.log(hechos.join("\n"));
