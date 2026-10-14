#!/usr/bin/env node
/**
 * Candado «probado = en pantalla» para todo el monorepo (ADR-0406, actualización del 2026-10-14; antes ADR-0234, solo en
 * `apps/web/lib/*-reglas.ts`).
 *
 * EL PROBLEMA. Una función que solo usa su propia prueba hace que el CI diga que algo funciona cuando ninguna pantalla lo
 * muestra. `pnpm knip` no la ve, porque cuenta las pruebas como uso. El 2026-10-14 había 109 piezas así en `apps/web/lib`, y
 * el candado de entonces (`reglas-sin-uso.test.ts`) veía 21: los demás no eran funciones de un `*-reglas.ts`, y contaba
 * identificadores en vez de imports (un nombre como `progreso` en otro archivo lo engañaba).
 *
 * QUÉ PROMETE. Corre `knip --production` (que parte de lo que llega a la tienda y no cuenta las pruebas) y lo compara con
 * `DEUDA` (`deuda-produccion.mjs`), lo que ya estaba así el 2026-10-14. Falla si aparece una pieza nueva y si una de la deuda ya
 * no aparece (se conectó o se borró: hay que sacarla de la lista). La deuda solo baja.
 * NO PROMETE: que lo que importa una pantalla se ejecute (un componente que se importa y nunca se dibuja cuenta como usado).
 *
 * `pnpm knip:produccion`. La configuración (qué es «la tienda», el `!` de los patrones) vive en `knip.ts`.
 */
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEUDA } from "./deuda-produccion.mjs";

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

/**
 * El informe de Knip (`--reporter json`) como una lista de textos estables: `archivo: nombre` para una exportación, `archivo`
 * para un archivo entero y `archivo: nombre (tipo)` para lo demás (un tipo, una dependencia…). Ordenada y sin repetidos.
 */
export function hallazgosDe(informe) {
  const salida = new Set();
  for (const issue of informe.issues ?? []) {
    for (const [tipo, lista] of Object.entries(issue)) {
      if (!Array.isArray(lista)) continue;
      for (const item of lista) {
        if (tipo === "files") {
          salida.add(item.name ?? issue.file);
          continue;
        }
        const nombre = Array.isArray(item) ? item.map((i) => i.name).join(" = ") : item.name;
        salida.add(tipo === "exports" ? `${issue.file}: ${nombre}` : `${issue.file}: ${nombre} (${tipo})`);
      }
    }
  }
  return [...salida].sort();
}

/** Lo que aparece y no estaba en la deuda, lo de la deuda que ya no aparece y lo que la deuda repite. */
export function compararConDeuda(hallazgos, deuda) {
  const enDeuda = new Set(deuda);
  const hallados = new Set(hallazgos);
  return {
    nuevos: hallazgos.filter((h) => !enDeuda.has(h)),
    yaNoEstan: [...enDeuda].filter((d) => !hallados.has(d)),
    repetidos: deuda.filter((d, i) => deuda.indexOf(d) !== i),
  };
}

function main() {
  let salida;
  try {
    salida = execFileSync("pnpm", ["exec", "knip", "--production", "--reporter", "json", "--no-progress", "--no-exit-code"], {
      cwd: RAIZ,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (e) {
    // Con `--no-exit-code` Knip solo sale con error si no pudo correr (una configuración rota): eso no es «sin hallazgos».
    console.error("✗ Knip no pudo correr en modo producción:\n");
    console.error(e.stderr || e.message);
    process.exit(2);
  }
  const { nuevos, yaNoEstan, repetidos } = compararConDeuda(hallazgosDe(JSON.parse(salida.slice(salida.indexOf("{")))), DEUDA);

  if (nuevos.length === 0 && yaNoEstan.length === 0 && repetidos.length === 0) {
    console.log(`✓ Nada nuevo que solo usen las pruebas (deuda de antes: ${DEUDA.length}, solo baja).`);
    return;
  }
  if (nuevos.length > 0) {
    console.error("✗ Esto solo lo usan las pruebas: ninguna pantalla lo importa.\n");
    for (const n of nuevos) console.error(`  ${n}`);
    console.error(
      "\nConéctalo a la pantalla en el mismo cambio, o bórralo con su prueba. «Lo uso cuando se commitee la pantalla» es justo\n" +
        "lo que este candado evita. Si existe PARA la prueba (una constante que la prueba cruza con la migración, el tope de un\n" +
        "placeholder, la lista de todos los valores de un tipo), decláralo junto al código: `/** @internal <motivo> */`.\n",
    );
  }
  if (yaNoEstan.length > 0) {
    console.error("✗ Esto ya se usa o ya no existe: sácalo de DEUDA en scripts/knip/deuda-produccion.mjs.\n");
    for (const d of yaNoEstan) console.error(`  ${d}`);
    console.error("");
  }
  if (repetidos.length > 0) {
    console.error("✗ DEUDA repite estas líneas (scripts/knip/deuda-produccion.mjs):\n");
    for (const d of repetidos) console.error(`  ${d}`);
  }
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
