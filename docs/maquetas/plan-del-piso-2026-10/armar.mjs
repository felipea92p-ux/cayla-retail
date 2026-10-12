// Arma la maqueta metiendo cada fragmentos/<id>.html en su lugar de base.html.
//   node armar.mjs          → plan-del-piso.html con TODOS los fragmentos (la página final)
//   node armar.mjs <id>     → .tmp/plan-<id>.html con SOLO ese fragmento (copia propia: nadie la pisa mientras se trabaja)
import { readFileSync, writeFileSync, renameSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const aqui = dirname(fileURLToPath(import.meta.url));
const solo = process.argv[2];
const ids = solo ? [solo] : ["actual", "a", "b", "c"];
let html = readFileSync(join(aqui, "base.html"), "utf8");
const faltan = [];
for (const id of ["actual", "a", "b", "c"]) {
  const f = join(aqui, "fragmentos", `${id}.html`);
  let cuerpo = "";
  if (ids.includes(id)) cuerpo = existsSync(f) ? readFileSync(f, "utf8") : (faltan.push(id), `<p style="padding:40px;color:var(--color-taupe-profundo)">Fragmento «${id}» todavía no existe.</p>`);
  html = html.replace(`<!--@${id}-->`, () => cuerpo);
}
const destino = solo ? join(aqui, ".tmp", `plan-${solo}.html`) : join(aqui, "plan-del-piso.html");
if (solo) mkdirSync(join(aqui, ".tmp"), { recursive: true });
writeFileSync(destino + ".nuevo", html);
renameSync(destino + ".nuevo", destino); // atómico: una captura nunca lee un archivo a medias
console.log(`${destino.replace(aqui + "/", "")} armado${faltan.length ? ` (faltan: ${faltan.join(", ")})` : ""}`);
