// La clave de una PRENDA: un modelo en un color, con todas sus tallas (ADR-0208, decisión 4: «la unidad es el
// modelo+color por sede»). La usa Frescura (`frescura-reglas.ts`, para el reloj de novedad y el estado de cada prenda).
// Vive aquí, sola, para que toda pantalla que junte tallas lo haga de la misma forma: con dos claves, una prenda podía
// ser una fila en el Análisis de antes de la v4 y dos en Frescura (plan 3c, corrección 8). Pura: sin React ni supabase.
//
// El código del color manda; si la variante no lo tiene, cae al nombre del color; si tampoco, la prenda es el modelo
// solo. (Existencias arma su «percha» con `clavePercha`, que junta por el NOMBRE del color: es otra pregunta —qué
// cuelga junto en el perchero— y no se toca aquí.)

export function clavePrendaDe(productoId: string, colorCodigo: string | null | undefined, colorNombre: string | null | undefined): string {
  return `${productoId}|${colorCodigo ?? colorNombre ?? ""}`;
}
