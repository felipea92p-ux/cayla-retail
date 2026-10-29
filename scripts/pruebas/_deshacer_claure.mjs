/**
 * Ayudante de las pruebas viejas que fijan el md5 de una función por un candado de versión («no se reemplaza a ciegas»): las migraciones de CLAURE
 * (ADR-0560) parchan a propósito funciones del club y de la ficha de la cliente con reemplazos ANCLADOS (`pg_temp.reemplazar(firma, $v$viejo$v$, $n$nuevo$n$, 1)`).
 * Esas pruebas miran el cuerpo VIVO de la función contra el md5 de su propia migración, así que antes de mirar deshacen —dentro de su transacción— lo que una
 * migración POSTERIOR cambió a propósito. Aquí se lee ese reemplazo de la propia migración y se aplica al revés: nada se escribe dos veces.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Los reemplazos anclados de una migración para unas firmas: `[{ firma, viejo, nuevo }]`. Vacío si la migración no existe (una base que no la tiene). */
export function anclados(archivo, firmas) {
  let texto;
  try {
    texto = readFileSync(join(RAIZ, "supabase", "migrations", archivo), "utf8");
  } catch {
    return [];
  }
  const hallados = [...texto.matchAll(/pg_temp\.reemplazar\('([^']+)',\n\$v\$([\s\S]*?)\$v\$,\n\$n\$([\s\S]*?)\$n\$,\n\d+\);/g)]
    .map((m) => ({ firma: m[1], viejo: m[2], nuevo: m[3] }))
    .filter((a) => firmas.includes(a.firma));
  const sinHallar = firmas.filter((f) => !hallados.some((a) => a.firma === f));
  if (sinHallar.length) throw new Error(`No encontré el reemplazo anclado de ${sinHallar.join(", ")} en ${archivo}: el control no puede armarse.`);
  return hallados;
}

/** El SQL que devuelve esas funciones a como estaban antes de la migración (con `reset role`: se ejecuta como dueño). */
export function sqlDeshacer(archivo, firmas) {
  const lista = anclados(archivo, firmas);
  if (!lista.length) return "";
  return `reset role;\ndo $deshacer_claure$\nbegin\n${lista
    .map(({ firma, viejo, nuevo }) => `  execute replace(pg_get_functiondef('${firma}'::regprocedure), $q$${nuevo}$q$, $q$${viejo}$q$);`)
    .join("\n")}\nend $deshacer_claure$;\n`;
}
