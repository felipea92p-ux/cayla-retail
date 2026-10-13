// Ronda 8: copia las capturas de los censos del 6 y 7 de octubre (las formas de HOY) a elegir-ronda8/img y escribe su fotos.json.
import { readFileSync, writeFileSync, copyFileSync, existsSync } from "node:fs";
const censos = { c1007: ["r8-viejo-1007", "censo del 7 oct"], c1006: ["r8-viejo-1006", "censo del 6 oct"] };
const datos = Object.fromEntries(Object.entries(censos).map(([k, [d]]) => [k, JSON.parse(readFileSync(`${d}/censo.json`, "utf8"))]));
const out = {};
const poner = (clave, refs) => {
  out[clave] = [];
  for (const [c, fam, letra, n = 1] of refs) {
    const f = datos[c].familias.find((x) => x.id === fam);
    const v = f.subgrupos.flatMap((s) => s.variantes).find((x) => x.letra === letra);
    for (const cap of v.capturas.slice(0, n)) {
      const nombre = `img/${fam}-${letra}-${cap.archivo.split("/").pop()}`;
      const src = `${censos[c][0]}/${cap.archivo}`;
      if (existsSync(src)) copyFileSync(src, `elegir-ronda8/${nombre}`);
      out[clave].push({ src: nombre, pie: `${(cap.ruta ?? v.pantallas[0] ?? "").replace(/^\//, "") || "inicio"} · ${censos[c][1]}` });
    }
  }
};
poner("frase.A", [["c1007", "enlace", "F"], ["c1007", "enlace", "K"]]);
poner("frase.B", [["c1007", "enlace", "C"], ["c1007", "enlace", "M"], ["c1007", "enlace", "H"], ["c1007", "enlace", "J"]]);
poner("ver.A", [["c1007", "enlace", "I"]]);
poner("ver.B", [["c1007", "enlace", "B"], ["c1007", "enlace", "E"]]);
poner("ref.A", [["c1007", "enlace", "A", 2]]);
poner("pag.A", [["c1006", "paginacion", "A"], ["c1006", "paginacion", "B"]]);
poner("pag.C", [["c1007", "accion.siguiente", "A"], ["c1007", "enlace", "D"]]);
poner("av.A", [["c1007", "avatar", "A"], ["c1007", "avatar", "B"], ["c1007", "avatar", "C"], ["c1007", "avatar", "D"]]);
poner("av.D", [["c1007", "avatar", "G"]]);
writeFileSync("elegir-ronda8/fotos.json", JSON.stringify(out, null, 1));
console.log(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.length])));
