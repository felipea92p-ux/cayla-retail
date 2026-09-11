/**
 * La versión FIJADA del estándar universal (ADR-0030), en un solo lugar.
 *
 * La leen los tres scripts de esta carpeta: `cargar.mjs` (qué release bajar y
 * cómo se llama el seed), `preparar-produccion.mjs` (qué seed empaquetar) y
 * `revisar-version.mjs` (contra qué comparar). Antes cada uno tenía la suya, y
 * subir de versión era editar tres archivos — o dos, y que preparar siguiera
 * empaquetando el seed viejo que quedó en disco. Revisión del 2026-09-11.
 *
 * Subir de versión es editar ESTA línea a conciencia, con la lista de
 * `revisar-version.mjs` delante, y correr `cargar.mjs --aplicar`.
 */
export const VERSION_FIJADA = "2026-08";
