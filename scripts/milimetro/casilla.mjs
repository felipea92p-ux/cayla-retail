#!/usr/bin/env node
/**
 * Check «Al milímetro» — un PR que cambia la cara del ERP dice que pasó por `/milimetro` (CLAUDE.md «Al milímetro»).
 *
 * EL PROBLEMA QUE RESUELVE. Felipe, 2026-11-12: «cada que se haga un cambio visual o se cree una nueva pantalla o se quiera
 * auditar las pantallas ya existentes se usen esas skills obligatoriamente, y que todos los que estén trabajando en el proyecto
 * las tengan que usar». Una regla que solo vive en `CLAUDE.md` depende de que cada sesión se acuerde; este check la vuelve visible
 * en el PR, como «SQL pegado» con su casilla.
 *
 * QUÉ PROMETE. Con la lista de archivos del PR (de la API de GitHub) y su cuerpo, sale con código 1 si el PR agrega o cambia un
 * archivo que se ve en el ERP —un `.tsx` de `apps/web/components/` o `apps/web/app/`, o un `.css` de `apps/web/app/`— y no marcó
 * ninguna de las dos casillas del formulario: «pasó por `/milimetro`» o «Al milímetro no aplica». Las pruebas (`*.test.tsx`) y lo
 * que solo se borra no cuentan. La tienda (`apps/tienda`) queda fuera: tiene su propia identidad (ADR-0616).
 *
 * QUÉ NO PROMETE. No comprueba que la auditoría se haya hecho bien ni lee su informe: eso lo mira quien revisa el PR. Es la misma
 * confianza que la casilla de `/chaos` o la de modo oscuro, ahora con un check que la pide.
 *
 * USO (lo corre `.github/workflows/al-milimetro.yml`)
 *   node scripts/milimetro/casilla.mjs <archivos.json> <cuerpo.md>
 *   archivos.json = la respuesta de `gh api repos/<dueño>/<repo>/pulls/<n>/files --paginate --slurp`
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const VISUAL = [/^apps\/web\/(components|app)\/.+\.tsx$/, /^apps\/web\/app\/.+\.css$/];
const PRUEBA = /\.test\.tsx$/;
const PASO = /^\s*[-*]\s*\[[xX]\][^\n]*\/milimetro/m;
const NO_APLICA = /^\s*[-*]\s*\[[xX]\][^\n]*Al mil[ií]metro no aplica/im;

/** ¿El archivo se ve en el ERP? */
export function esVisual(ruta) {
  return !PRUEBA.test(ruta) && VISUAL.some((r) => r.test(ruta));
}

/**
 * `archivos`: `[{ filename, status }]` como los da la API de GitHub (o páginas de eso, con `--slurp`).
 * Devuelve `{ visuales, casilla, motivos }`; `motivos` vacío = verde.
 */
export function revisar(archivos, cuerpo) {
  const lista = archivos.flat();
  const visuales = lista.filter((a) => a.status !== "removed" && esVisual(a.filename)).map((a) => a.filename);
  const texto = cuerpo ?? "";
  const casilla = PASO.test(texto) ? "paso" : NO_APLICA.test(texto) ? "no-aplica" : null;
  const motivos = [];
  if (visuales.length > 0 && casilla === null) {
    motivos.push(
      `Este PR cambia ${visuales.length} archivo(s) que se ven en el ERP y no marcó la casilla «Al milímetro».\n` +
        "Corre `/milimetro auditar <ruta>` (o `/milimetro diseñar <pieza>` si es nueva) y marca la casilla en el cuerpo del PR;\n" +
        "si el cambio no altera nada de lo que se ve, marca «Al milímetro no aplica» y di por qué. Archivos:\n" +
        visuales.slice(0, 20).map((v) => `  - ${v}`).join("\n") +
        (visuales.length > 20 ? `\n  … y ${visuales.length - 20} más` : ""),
    );
  }
  return { visuales, casilla, motivos };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [rutaArchivos, rutaCuerpo] = process.argv.slice(2);
  if (!rutaArchivos || !rutaCuerpo) {
    console.error("Uso: node scripts/milimetro/casilla.mjs <archivos.json> <cuerpo.md>");
    process.exit(2);
  }
  const { visuales, casilla, motivos } = revisar(
    JSON.parse(readFileSync(rutaArchivos, "utf8")),
    readFileSync(rutaCuerpo, "utf8"),
  );
  if (motivos.length > 0) {
    for (const m of motivos) console.error(`✗ ${m}`);
    process.exit(1);
  }
  console.log(
    visuales.length === 0
      ? "✓ El PR no cambia nada que se vea en el ERP: «Al milímetro» no aplica."
      : `✓ ${visuales.length} archivo(s) visual(es); casilla: ${casilla === "paso" ? "pasó por /milimetro" : "no aplica"}.`,
  );
}
