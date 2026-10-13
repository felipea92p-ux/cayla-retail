// Copia las capturas del censo (las formas de HOY) a cada página de elegir y escribe su fotos.json.
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
const censos = { viejo: JSON.parse(readFileSync("r6-viejo-admin/censo.json", "utf8")), hoy: JSON.parse(readFileSync("r6-admin/censo.json", "utf8")) };
const dirDe = { viejo: "r6-viejo-admin", hoy: "r6-admin" };
const fecha = { viejo: "censo del 7 oct", hoy: "censo de hoy" };
function variante(c, fam, letra) {
  const f = censos[c].familias.find((x) => x.id === fam);
  for (const s of f.subgrupos) for (const v of s.variantes) if (v.letra === letra) return v;
  throw new Error(`${c} ${fam} ${letra}`);
}
function fotos(destino, mapa) {
  const out = {};
  for (const [clave, refs] of Object.entries(mapa)) {
    out[clave] = [];
    for (const [c, fam, letra, n = 1] of refs) {
      const v = variante(c, fam, letra);
      for (const cap of v.capturas.slice(0, n)) {
        const nombre = `img/${fam}-${letra}-${cap.archivo.split("/").pop()}`;
        const src = `${dirDe[c]}/${cap.archivo}`;
        if (existsSync(src)) copyFileSync(src, `${destino}/${nombre}`);
        const pantalla = (cap.ruta ?? v.pantallas[0] ?? "").replace(/^\//, "") || "inicio";
        out[clave].push({ src: nombre, pie: `${pantalla} · ${fecha[c]}` });
      }
    }
  }
  writeFileSync(`${destino}/fotos.json`, JSON.stringify(out, null, 1));
  console.log(destino, Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])));
}
fotos("elegir-ronda6", {
  "form.A": [["viejo", "combo", "B"], ["viejo", "combo", "J"], ["viejo", "combo", "C"], ["hoy", "campo", "B"], ["hoy", "campo", "C"]],
  "form.F": [["viejo", "combo", "A"], ["hoy", "campo", "A"]],
  "lista.B": [["viejo", "combo", "AE"]],
  "filtro.A": [["viejo", "combo", "D"], ["viejo", "combo", "G"], ["viejo", "combo", "H"]],
  "filtro.B": [["viejo", "combo", "C", 2]],
  "filtro.V": [["viejo", "combo", "V"], ["viejo", "combo", "AJ"]],
  "filtro.F": [["viejo", "combo", "T"], ["viejo", "combo", "Y"]],
  "etq.A": [["hoy", "etiqueta-campo", "A"]],
  "etq.B": [["hoy", "etiqueta-campo", "C"], ["hoy", "etiqueta-campo", "D"]],
  "etq.F": [["hoy", "etiqueta-campo", "B"], ["hoy", "etiqueta-campo", "E"]],
  "cas.A": [["hoy", "casilla", "B"], ["hoy", "casilla", "C"]],
  "cas.B": [["hoy", "casilla", "A"]],
});
fotos("elegir-ronda7", {
  "tabla.A": [["viejo", "tabla", "L"], ["viejo", "tabla", "J"], ["viejo", "tabla", "K"]],
  "tabla.B": [["viejo", "tabla", "C"], ["viejo", "tabla", "O"]],
  "tabla.C": [["viejo", "tabla", "AL"]],
  "tabla.D": [["viejo", "tabla", "D"]],
  "tabla.F": [["viejo", "tabla", "B"], ["viejo", "tabla", "F"]],
  "tit.A": [["viejo", "titulo-seccion", "C"], ["viejo", "titulo-seccion", "I"], ["viejo", "titulo-seccion", "H"], ["viejo", "titulo-seccion", "Y"]],
  "tit.B": [["viejo", "titulo-seccion", "G"], ["viejo", "titulo-seccion", "T"], ["viejo", "titulo-seccion", "F"]],
  "tit.C": [["viejo", "titulo-seccion", "U"], ["viejo", "titulo-seccion", "X"]],
  "tit.F": [["viejo", "titulo-seccion", "S"], ["viejo", "titulo-seccion", "AP"]],
  "grp.A": [["viejo", "titulo-seccion", "J"], ["viejo", "titulo-seccion", "AH"]],
  "grp.B": [["viejo", "titulo-seccion", "M"], ["viejo", "titulo-seccion", "Z"]],
  "dia.A": [["viejo", "titulo-seccion", "A"], ["viejo", "titulo-seccion", "K"]],
  "dia.B": [["viejo", "titulo-seccion", "E"]],
  "dia.C": [["viejo", "titulo-seccion", "O"]],
});
