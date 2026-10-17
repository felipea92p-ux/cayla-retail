// Ronda 12 (ADR-0358): el botón que cambia su palabra a «Guardando…» a mano pasa a <Boton cargando> (la pieza lo dice sola).
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { aperturaDesde, atributos } from "./etiquetas.mjs";
const ESCRIBIR = process.argv[2] === "--escribir";
const arch = [];
const rec = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) rec(p); else if (/\.tsx$/.test(n) && !/\.test\./.test(n)) arch.push(p); } };
rec(process.cwd() + "/components"); rec(process.cwd() + "/app");
const PESO = { "btn-primario": "primario", "btn-secundario": null, "btn-sutil": "discreto", "btn-peligro": "peligro" };
const hechos = [], saltados = [];
// cierre del elemento (cuenta anidados del mismo nombre)
function cierre(t, desde, nombre) {
  const re = new RegExp(`<${nombre}\\b|</${nombre}>`, "g"); re.lastIndex = desde; let prof = 1, m;
  while ((m = re.exec(t))) { if (m[0].startsWith("</")) { if (--prof === 0) return m.index; } else { const a = aperturaDesde(t, m.index); if (a && !a.abre.endsWith("/>")) prof++; } }
  return -1;
}
for (const f of arch) {
  let t = readFileSync(f, "utf8"); const cambios = [];
  const re = /<(Boton|button)\b/g; let m;
  while ((m = re.exec(t))) {
    const comp = m[1]; const ap = aperturaDesde(t, m.index); if (!ap || ap.abre.endsWith("/>")) continue;
    const fin = cierre(t, ap.fin, comp); if (fin < 0) continue;
    const cuerpo = t.slice(ap.fin, fin);
    const c = cuerpo.trim().match(/^\{\s*([\s\S]+?)\s*\?\s*"([A-ZÁÉÍÓÚ][a-záéíóúñ]+(?:ando|iendo|endo)…)"\s*:\s*([\s\S]+?)\s*\}$/);
    if (!c) continue;
    const [, cond, verbo, resto] = c;
    if (/\?/.test(cond) || /\n/.test(cond)) { saltados.push(`${f}:${t.slice(0, m.index).split("\n").length} cond compleja: ${cond.slice(0, 60)}`); continue; }
    const at = atributos(ap.abre);
    let nombre = comp, extra = [], quitar = [];
    if (comp === "button") {
      const cls = at.find((a) => a.nombre === "className");
      let v = cls?.valor ?? "";
      // las constantes de clase de siempre: botonPrimario (Modal.tsx) = "btn-cayla btn-primario flex-1"; BTN_PRIMARIO = "btn-cayla btn-primario"
      if (v === "{botonPrimario}") v = "btn-cayla btn-primario flex-1";
      else if (v === "{BTN_PRIMARIO}") v = "btn-cayla btn-primario";
      else v = v.replace("${botonPrimario}", "btn-cayla btn-primario flex-1");
      const pm = v.match(/\bbtn-(primario|secundario|sutil|peligro)\b/);
      if (!/\bbtn-cayla\b/.test(v) || !pm) { saltados.push(`${f}:${t.slice(0, m.index).split("\n").length} button sin btn-cayla: ${v.slice(0, 60)}`); continue; }
      nombre = "Boton";
      const peso = PESO[`btn-${pm[1]}`];
      if (peso) extra.push(`peso="${peso}"`);
      // la clase sin btn-cayla ni el peso; `valor` de un texto entre comillas viene SIN comillas, el de llaves con ellas
      const limpia = (x) => x.replace(/\bbtn-cayla\b\s*/, "").replace(/\bbtn-(primario|secundario|sutil|peligro)\b\s*/, "").replace(/\s+/g, " ");
      const entreLlaves = v.startsWith("{");
      if (!entreLlaves) { const n2 = limpia(v).trim(); if (!n2) quitar.push(cls); else cls.nuevo = `"${n2}"`; }
      else { const n2 = limpia(v).replace(/`\s+/, "`").replace(/\s+`/, "`"); if (/^\{`\s*`\}$/.test(n2)) quitar.push(cls); else cls.nuevo = n2; }
    }
    const tieneCargando = at.some((a) => a.nombre === "cargando");
    if (!tieneCargando) extra.push(`cargando={${cond}}`);
    if (verbo !== "Guardando…") extra.push(`textoCargando="${verbo}"`);
    // armar la nueva apertura
    let abre = ap.abre;
    for (const a of [...at].sort((x, y) => y.ini - x.ini)) {
      if (quitar.includes(a)) { let i = a.ini; while (i > 0 && /\s/.test(abre[i - 1])) i--; abre = abre.slice(0, i) + abre.slice(a.fin); }
      else if (a.nuevo !== undefined) abre = abre.slice(0, a.ini) + `className=${a.nuevo}` + abre.slice(a.fin);
    }
    abre = abre.replace(new RegExp(`^<${comp}\\b`), `<${nombre}${extra.length ? " " + extra.join(" ") : ""}`);
    const sangria = (cuerpo.match(/^\n([ \t]*)/) || [])[1];
    const nuevoCuerpo = /^"[^"]*"$/.test(resto) ? resto.slice(1, -1) : `{${resto}}`;
    const cuerpoFinal = sangria !== undefined ? `\n${sangria}${nuevoCuerpo}\n${sangria.slice(2)}` : nuevoCuerpo;
    cambios.push({ ini: m.index, fin: fin + `</${comp}>`.length, por: `${abre}${cuerpoFinal}</${nombre}>`, linea: t.slice(0, m.index).split("\n").length, verbo, comp });
  }
  if (!cambios.length) continue;
  for (const c of cambios.sort((a, b) => b.ini - a.ini)) t = t.slice(0, c.ini) + c.por + t.slice(c.fin);
  if (cambios.some((c) => c.comp === "button") && !/import \{[^}]*\bBoton\b[^}]*\} from "@\/components\/ui\/campos"/.test(t)) {
    if (/import \{([^}]*)\} from "@\/components\/ui\/campos";/.test(t)) t = t.replace(/import \{([^}]*)\} from "@\/components\/ui\/campos";/, (x, n) => `import {${n.replace(/\s*$/, "")}, Boton } from "@/components/ui/campos";`.replace("{ ", "{ ").replace(/\{\s*,/, "{"));
    else { const l = t.split("\n"); const u = l.map((x, i) => (/^import /.test(x) ? i : -1)).filter((i) => i >= 0).pop(); let k = u; while (k < l.length && !/;\s*$/.test(l[k])) k++; l.splice(k + 1, 0, 'import { Boton } from "@/components/ui/campos";'); t = l.join("\n"); }
  }
  if (ESCRIBIR) writeFileSync(f, t);
  for (const c of cambios) hechos.push(`${f.replace(process.cwd() + "/", "")}:${c.linea} ${c.comp} ${c.verbo}`);
}
console.log("migrados", hechos.length); console.log(hechos.join("\n")); console.log("\nsaltados", saltados.length); console.log(saltados.map((s) => s.replace(process.cwd() + "/", "")).join("\n"));
