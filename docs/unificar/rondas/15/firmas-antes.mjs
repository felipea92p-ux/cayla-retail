// Cuántos archivos reconocen las firmas de la ronda 15 en el código de ANTES (la rama base, sin la migración). Desde apps/web:
//   node ../../docs/unificar/rondas/15/firmas-antes.mjs [ref]   (de fábrica, origin/main)
import { execFileSync } from "node:child_process";
import { DECISIONES, MARCA_FIJA } from "../../../../apps/web/unificar/familias.mjs";
const REF = process.argv[2] ?? "origin/main";
const RAIZ = new URL("../../../../", import.meta.url).pathname;
const git = (...a) => execFileSync("git", ["-C", RAIZ, ...a], { encoding: "utf8", maxBuffer: 1 << 28 });
const archivos = git("ls-tree", "-r", "--name-only", REF, "--", "apps/web/components", "apps/web/app").split("\n").filter((f) => /\.(tsx|ts|css)$/.test(f) && !/\.test\.tsx?$/.test(f));
for (const id of ["icono", "contador", "accion.siguiente", "accion.deshacer", "accion.buscar"]) {
  const d = DECISIONES[id];
  const fuera = new Set([d.pieza, ...(d.tambien ?? []), ...(d.excepciones ?? []).map((e) => e.archivo)].map((x) => "apps/web/" + x));
  const fs = d.firmas.map((f) => new RegExp(f));
  const n = d.ventana ?? 1;
  let cuenta = 0;
  for (const a of archivos) {
    if (fuera.has(a)) continue;
    const L = git("show", `${REF}:${a}`).split("\n");
    const tiene = L.some((l, i) => !/^\s*(\/\/|\/\*|\*|\{\s*\/\*)/.test(l) && !MARCA_FIJA.test(l) && fs.some((f) => { const m = f.exec(L.slice(i, i + n).join("\n")); return m && m.index < l.length; }));
    if (tiene) cuenta++;
  }
  console.log(id, cuenta);
}
