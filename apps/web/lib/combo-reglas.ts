/* ====================================================================
   combo-reglas · la regla global de todo combo del sistema (ADR-0194)

   Por qué existe: cada combo decidía por su cuenta cuánto mostrar —
   `ComboBuscable` cortaba en 40 y pedía "sigue tipeando para acortar";
   `Desplegable`/`CampoSelectNativo` no cortaban nunca, y un desplegable de
   292 proveedores metía 292 filas al DOM sin buscador. Felipe pidió UNA
   regla, la misma en todo el sistema: más de 8 opciones, aparece un campo
   para buscar; más de 50 (ya filtradas), la lista se completa sola al
   bajar el scroll en vez de cortar de golpe.

   Puro y testeado — `campos.tsx` ya dice "ningún componente valida,
   transforma ni decide": el componente solo pinta lo que esto calcula.
   ==================================================================== */

/** Con más de esto, el combo suma un campo para escribir y filtrar. */
export const UMBRAL_BUSCAR_COMBO = 8;

/** Cuánto se revela de entrada y cuánto se suma cada vez que el scroll llega al fondo. */
export const TAMANO_PAGINA_COMBO = 50;

export function comboNecesitaBuscador(totalOpciones: number): boolean {
  return totalOpciones > UMBRAL_BUSCAR_COMBO;
}

/** El scroll de la lista llegó al fondo (con margen): momento de revelar más. */
export function comboLlegoAlFinal(medida: { scrollTop: number; clientHeight: number; scrollHeight: number }, margen = 32): boolean {
  return medida.scrollTop + medida.clientHeight >= medida.scrollHeight - margen;
}
