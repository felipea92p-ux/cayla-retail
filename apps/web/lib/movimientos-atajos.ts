// Tipos de los atajos de Movimientos (ADR-0241): lo que la pantalla sabe del apartado de un movimiento y de qué módulos
// ve quien mira. Las funciones que armaban la lista de atajos (`atajosDeMovimiento`, `atajosDeOperacion`) se borraron:
// ninguna pantalla las llamaba.

/** Lo que Movimientos sabe del apartado de un movimiento (`apartados.movimiento_id` o `movimiento_cierre_id` →
 *  `separaciones`). Lo lee `getApartadosDeMovimientos`; null si no se pudo leer o el apartado es anterior a
 *  Apartados v2 (sin separación). */
export type ApartadoDeMovimiento = {
  separacionId: string;
  codigo: string;
  /** «María P.»: nombre y la inicial del apellido, como en la lista de Apartados. */
  clienta: string;
  estado: "abierta" | "entregada" | "liberada" | "devuelta" | string;
  /** `aaaa-mm-dd`. */
  venceEl: string | null;
};

export type AccesosAtajos = {
  /** Las claves de módulo que la cuenta ve (`persona.modulos`). */
  modulos: readonly string[];
  /** `puede(persona, "ajustarStock")`: el mismo candado que el botón «Ajustar» de Existencias (ADR-0250). */
  puedeAjustar: boolean;
};
