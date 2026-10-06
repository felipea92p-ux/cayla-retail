/* ====================================================================
   Las acciones de una tarjeta de Existencias (2026-10-05 y 2026-10-06, maqueta `docs/maquetas/existencias-tactil-2026-10/`, «filaEstado»)

   La tarjeta muestra UN solo icono —la acción que le toca a esa prenda— y, al pasar el mouse (o con el botón «⋯» en tablet), una
   ventana emergente hacia arriba con las acciones de mover prendas y su nombre, la del icono primera y resaltada aunque se repita:
   quien abre la ventana ve todo en un solo lugar. Este archivo decide qué filas lleva, en qué orden, cuáles se ven apagadas y por
   qué; el componente solo las dibuja. Lógica pura, con su prueba.

   Como la maqueta: el icono es «Colgar en el piso» (resaltado si al modelo le falta algo en el piso); si no falta nada y el color
   está agotado y otra tienda lo tiene, «Pedir a otra sede»; con un filtro que no es «Por colgar», «Ver» (abre el panel en la talla
   que más se vende de las que cumplen). Ajustar, Reportar dañada y la ficha viven en el panel de la talla: la tarjeta no se llena.

   Los nombres son los del sistema: «Colgar en el piso» (ADR-0339) y su inverso «Subir a almacén». Una acción que la persona no
   puede hacer (sin el módulo) no se dibuja; una que puede pero hoy no tiene con qué se ve apagada y dice por qué.
   ==================================================================== */

export type ClaveAccion = "colgar" | "subir" | "enviar" | "pedir" | "ver";

export type FilaAccion = {
  clave: ClaveAccion;
  etiqueta: string;
  /** Si viene, la fila se ve pero no se elige, y dice por qué. */
  motivo?: string;
  /** La que la pantalla recomienda: la del icono. Va resaltada. */
  sugerida: boolean;
  /** Empieza un segundo grupo, con una línea encima. */
  aparte: boolean;
};

export type PermisosYStock = {
  /** Colgar en el piso y Subir a almacén comparten permiso (`permisosDelDetalle`). */
  puedeReponer: boolean;
  puedeEnviar: boolean;
  /** Alguna talla de algún color tiene algo libre en el almacén que colgar (`tallaParaReponer`). */
  hayQueBajar: boolean;
  /** Al modelo le falta algo en el piso hoy (`tallasQueFaltan`): Colgar va resaltada. */
  hayPorColgar: boolean;
  /** Algo libre colgado en el piso (lo apartado no se sube). */
  hayEnElPiso: boolean;
  /** Algo libre en el almacén para mandar a otra sede (`lineasParaTrasladar`). */
  hayEnAlmacen: boolean;
  /** La acción principal cuando no es colgar: «Pedir a otra sede» (agotado aquí) o «Ver» (con un filtro). */
  principal?: { clave: "pedir" | "ver"; etiqueta: string } | null;
};

export function filasDeAcciones(x: PermisosYStock): FilaAccion[] {
  const filas: FilaAccion[] = [];
  if (x.principal) filas.push({ clave: x.principal.clave, etiqueta: x.principal.etiqueta, sugerida: true, aparte: false });
  if (x.puedeReponer) {
    filas.push({
      clave: "colgar",
      etiqueta: "Colgar en el piso",
      motivo: x.hayQueBajar ? undefined : "No hay nada libre en el almacén",
      sugerida: !x.principal && x.hayPorColgar && x.hayQueBajar,
      aparte: false,
    });
    filas.push({ clave: "subir", etiqueta: "Subir a almacén", motivo: x.hayEnElPiso ? undefined : "No hay nada colgado para subir", sugerida: false, aparte: false });
  }
  if (x.puedeEnviar) {
    filas.push({ clave: "enviar", etiqueta: "Enviar a otra sede", motivo: x.hayEnAlmacen ? undefined : "No hay nada libre en el almacén para enviar", sugerida: false, aparte: false });
  }
  return filas;
}

/** El icono de la tarjeta: la sugerida; sin ninguna, Colgar en el piso (como la maqueta, sin resaltar); si tampoco se puede, `null`
 *  (el icono es «⋯» y solo abre la ventana). */
export function accionDelIcono(filas: readonly FilaAccion[]): FilaAccion | null {
  return filas.find((f) => f.sugerida && !f.motivo) ?? filas.find((f) => f.clave === "colgar" && !f.motivo) ?? null;
}
