import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { aperturaDesde, atributos } from "./etiquetas.mjs";
const arch = [];
const rec = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) rec(p); else if (/\.tsx$/.test(n)) arch.push(p); } };
rec(process.cwd() + "/components"); rec(process.cwd() + "/app");
const filas = [];
for (const f of arch) {
  if (/ui\/Modal(Ruta)?\.tsx$/.test(f)) continue;
  const t = readFileSync(f, "utf8");
  const re = /<(Modal|ModalRuta)\b/g; let m;
  while ((m = re.exec(t))) {
    const ap = aperturaDesde(t, m.index); if (!ap) continue;
    const at = atributos(ap.abre);
    const v = at.find((a) => a.nombre === "variante")?.valor ?? "";
    if (/camara|ticket/.test(v)) continue;
    const cc = at.find((a) => a.nombre === "conCerrar");
    const conX = m[1] === "ModalRuta" || /papel/.test(v) || (cc && cc.valor !== "{false}");
    // el cuerpo hasta su cierre (contando anidadas)
    let prof = 1, k = ap.fin; const reT = new RegExp(`<${m[1]}\\b|</${m[1]}>`, "g"); reT.lastIndex = ap.fin; let x; let fin = -1;
    if (ap.abre.endsWith("/>")) fin = ap.fin; else while ((x = reT.exec(t))) { if (x[0].startsWith("</")) { if (--prof === 0) { fin = x.index; break; } } else { const a2 = aperturaDesde(t, x.index); if (a2 && !a2.abre.endsWith("/>")) prof++; } }
    const cuerpo = t.slice(ap.fin, fin < 0 ? ap.fin : fin);
    const cancelar = />\s*(Cancelar|Mejor no|Ahora no|No, )/.test(cuerpo) || /botonCancelar|pie-acciones|<PieAcciones|type="submit"/.test(cuerpo);
    const textos = [...cuerpo.matchAll(/<(?:Boton\w*|button|BotonEnlace|Link)\b(?:[^>]|=>)*>\s*([^<{\n]{2,40})/g)].map((y) => y[1].trim()).filter(Boolean);
    const comps = [...new Set([...cuerpo.matchAll(/<([A-Z]\w+)\b/g)].map((y) => y[1]))].filter((c) => !/^(Fragment|Campo\w*|Chip|Aviso|Vacio|Tabla|Encabezado|Icono|Foto\w*|Miniatura\w*|CifraQueCuenta|TituloSeccion|TituloGrupo|Casilla|Interruptor|Desplegable|ComboBuscable|ComboResponsable|BarraApilada|AvatarPersona)$/.test(c));
    const linea = t.slice(0, m.index).split("\n").length;
    filas.push({ f: f.replace(process.cwd() + "/", ""), linea, conX: !!conX, cancelar, titulo: (at.find((a) => a.nombre === "titulo")?.valor ?? "").slice(0, 50), textos: textos.slice(0, 6), comps: comps.slice(0, 6), largo: cuerpo.length });
  }
}
const modo = process.argv[2];
const sel = modo === "conX" ? filas.filter((r) => r.conX && r.cancelar) : filas.filter((r) => !r.conX && !r.cancelar);
console.log(sel.length, "de", filas.length);
for (const r of sel) console.log(`${r.f}:${r.linea} | ${r.titulo} | botones: ${r.textos.join(" / ")} | comps: ${r.comps.join(",")} | ${r.largo}`);
