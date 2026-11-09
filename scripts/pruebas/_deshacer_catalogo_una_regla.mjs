/**
 * Las pruebas de la tienda (tienda_empresas, tienda_rapida, tienda_precio_por_lotes) vuelven a pegar migraciones viejas que parchan
 * `tienda_catalogo` con reemplazos ANCLADOS: buscan un texto exacto del cuerpo y, si ya ven su texto nuevo, no hacen nada.
 * 20261109181000 (una sola regla de «lo nuevo» y «lo más vendido») escribe `tienda_catalogo` entero con la MISMA respuesta pero otro
 * texto, así que el ancla ya no está y el pegado viejo aborta.
 *
 * Igual que `_deshacer_0622.mjs`, dentro de la transacción de la prueba (que se deshace), `DESHACER_UNA_REGLA` devuelve el catálogo al
 * cuerpo de main de antes de esa migración (`_antes_catalogo_una_regla.sql`): ahí el pegado viejo no hace nada.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const MIGRACION = join(AQUI, "..", "..", "supabase", "migrations", "20261109181000_tienda_catalogo_una_sola_regla.sql");

let unaRegla = "";
try {
  unaRegla = readFileSync(MIGRACION, "utf8");
} catch {
  // Una rama sin 20261109181000: no hay nada que deshacer.
}

export const DESHACER_UNA_REGLA = unaRegla ? `reset role;\n${readFileSync(join(AQUI, "_antes_catalogo_una_regla.sql"), "utf8")}\n` : "";
