import { vigenteEnAnio, type ParametroFila } from "./impuestos-reglas";

// Desde cuánto algo es un activo fijo (ADR-0594, Felipe 2026-10-31, que reemplaza el «S/ 150 por unidad» de ADR-0335).
//
// La ley (Reglamento de la Ley del IR, art. 23) deja llevar a gasto un bien que cuesta hasta ¼ de la UIT por unidad, salvo que sea parte de un
// conjunto necesario para funcionar. Felipe eligió el tope de la ley y que SE ACTUALICE SOLO con la UIT: el ¼ es fijo, lo que cambia cada año es
// la UIT, y esa ya vive en Configuración ▸ Impuestos (`parametros_tributarios`, nombre «uit», con su vigencia). Por eso no hay un parámetro nuevo.
//
// Es un AVISO, nunca un candado: quien registra puede seguir (un conjunto de piezas que solo funcionan juntas sí es activo, y esa decisión es
// del contador). Sin UIT cargada no se avisa: callar es mejor que avisar con un número inventado (principio 9).

/** La fracción de la UIT hasta la que un bien puede llevarse a gasto. */
export const FRACCION_UIT_ACTIVO = 0.25;

/** El umbral en soles para el año dado, o `null` si no hay UIT vigente. */
export function umbralDeActivo(parametros: readonly ParametroFila[], anio: number): { soles: number; uit: number } | null {
  const uit = vigenteEnAnio(parametros, "uit", anio)?.valor ?? null;
  if (uit === null || !Number.isFinite(uit) || uit <= 0) return null;
  return { soles: Math.round(uit * FRACCION_UIT_ACTIVO * 100) / 100, uit };
}

/**
 * ¿Este costo (sin IGV, de UNA unidad) se puede llevar a gasto? «Hasta ¼ UIT» incluye el tope: un bien de justo S/ 1,375 con UIT de 5,500 ya cuenta.
 * Un costo vacío, cero o ilegible no avisa nada.
 */
export function sePuedeLlevarAGasto(costoSinIgv: number, umbralSoles: number | null): boolean {
  if (umbralSoles === null || !Number.isFinite(costoSinIgv) || costoSinIgv <= 0) return false;
  return Math.round(costoSinIgv * 100) <= Math.round(umbralSoles * 100);
}
