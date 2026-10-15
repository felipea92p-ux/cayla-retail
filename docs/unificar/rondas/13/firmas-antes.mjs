// Cuenta, en el código de HEAD (antes de migrar), cuántos archivos reconoce cada firma nueva.
import { execFileSync } from "node:child_process";
import { DECISIONES } from "../../../../apps/web/unificar/familias.mjs";
// Uso: node docs/unificar/rondas/13/firmas-antes.mjs   (desde apps/web; lee el código de HEAD, antes de migrar)
const archivos = execFileSync("git", ["ls-tree", "-r", "--name-only", "HEAD", "components", "app"], { encoding: "utf8" }).split("\n").filter((f) => /\.(tsx|ts|css)$/.test(f) && !/\.test\./.test(f));
for (const id of ["grafico.avance", "grafico.anillo", "accion.copiar", "accion.menu"]) {
  const d = DECISIONES[id];
  const fuera = new Set([d.pieza, ...(d.tambien ?? []), ...(d.excepciones ?? []).map((e) => e.archivo)]);
  const firmas = d.firmas.map((f) => new RegExp(f));
  const n = d.ventana ?? 1;
  const hallados = [];
  for (const f of archivos) {
    if (fuera.has(f)) continue;
    let t; try { t = execFileSync("git", ["show", `HEAD:apps/web/${f}`], { encoding: "utf8" }); } catch { continue; }
    const ls = t.split("\n");
    const hay = ls.some((l, i) => !/^\s*(\/\/|\/\*|\*|\{\s*\/\*)/.test(l) && !/unificar-fijo:/.test(l) && firmas.some((re) => { const m = re.exec(ls.slice(i, i + n).join("\n")); return m && m.index < l.length; }));
    if (hay) hallados.push(f);
  }
  console.log(`${id}: ${hallados.length} archivos con el código de antes\n  ${hallados.join("\n  ")}`);
}
