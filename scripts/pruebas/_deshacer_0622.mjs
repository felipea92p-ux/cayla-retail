/**
 * Las pruebas de CLAURE y del Club vuelven a pegar migraciones viejas (20261029023000, 20261029035000, 20261029041000) que parchan
 * `fn_observatorio`, `fn_club_compras_netas` y `fn_calidad` con reemplazos ANCLADOS: buscan un texto exacto del cuerpo y, si ya ven
 * su texto nuevo, no hacen nada. 20261107171000 (ADR-0622, rendimiento) reescribe esas tres funciones enteras con la MISMA respuesta
 * pero otro texto, así que el ancla ya no está y el pegado viejo aborta.
 *
 * Igual que `_deshacer_claure.mjs`, dentro de la transacción de la prueba (que se deshace):
 *   · `DESHACER_0622` devuelve las tres al cuerpo de main de antes de ADR-0622 (`_antes_0622.sql`); ahí el pegado viejo no hace nada;
 *   · `REHACER_0622` vuelve a pegar 20261107171000 (su candado acepta el cuerpo de main), así la prueba mide la versión rápida.
 * `PEGAR_DE_NUEVO(migracion)` envuelve un pegado viejo con las dos.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIGRACION_0622 = join(AQUI, "..", "..", "supabase", "migrations", "20261107171000_rendimiento_lecturas_de_tienda.sql");

let rapida = "";
try {
  rapida = readFileSync(MIGRACION_0622, "utf8");
} catch {
  // Una rama sin ADR-0622: no hay nada que deshacer ni rehacer.
}

export const DESHACER_0622 = rapida ? `reset role;\n${readFileSync(join(AQUI, "_antes_0622.sql"), "utf8")}\n` : "";
export const REHACER_0622 = rapida ? `reset role;\n${rapida}\nreset lock_timeout;\n` : "";
export const PEGAR_DE_NUEVO = (migracion) => `${DESHACER_0622}${migracion}\n${REHACER_0622}`;
