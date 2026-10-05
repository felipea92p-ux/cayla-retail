/* ====================================================================
   Las acciones de una tarjeta de Existencias (2026-10-05, maqueta `docs/maquetas/existencias-tactil-2026-10/`)

   La tarjeta muestra UN solo icono —la acción que le toca a esa prenda— y, al pasar el mouse (o con el botón «⋯» en tablet), una
   ventana emergente hacia arriba con TODAS las acciones y su nombre, la del icono incluida y resaltada, aunque se repita: quien abre
   la ventana ve todo en un solo lugar. Este archivo decide qué filas lleva esa ventana, en qué orden, cuáles se ven apagadas y por
   qué; el componente solo las dibuja. Lógica pura, con su prueba.

   Los nombres son los del sistema: «Colgar en el piso» (ADR-0339, Felipe 2026-10-04: el único nombre de pasar prendas del almacén al piso) y su
   inverso «Subir a almacén» (que ADR-0339 deja como está); «Enviar a otra sede» es la entrada a Traslados con esta prenda ya cargada
   (`urlTrasladar`). Una acción que la persona no puede hacer (sin el módulo) no se dibuja; una que
   puede pero hoy no tiene con qué se ve apagada y dice por qué, como en `MenuAcciones`.
   ==================================================================== */

export type ClaveAccion = "colgar" | "subir" | "enviar" | "ajustar" | "danada" | "detalle";

export type FilaAccion = {
  clave: ClaveAccion;
  etiqueta: string;
  /** Si viene, la fila se ve pero no se elige, y dice por qué. */
  motivo?: string;
  /** La que la pantalla recomienda: la del icono. Va resaltada. */
  sugerida: boolean;
  /** Empieza el segundo grupo (corregir y mirar), con una línea encima. */
  aparte: boolean;
};

export type PermisosYStock = {
  /** Colgar en el piso y Subir a almacén comparten permiso (`permisosDelDetalle`). */
  puedeReponer: boolean;
  puedeEnviar: boolean;
  puedeAjustar: boolean;
  puedeReportarDanada: boolean;
  /** Alguna talla de algún color tiene algo libre en el almacén que colgar (`tallaParaReponer`). */
  hayQueBajar: boolean;
  /** Algo libre colgado en el piso (lo apartado no se retira). */
  hayEnElPiso: boolean;
  /** Algo libre en el almacén para mandar a otra sede (`lineasParaTrasladar`). */
  hayEnAlmacen: boolean;
  /** Algo libre en el piso o el almacén para reportar como dañado. */
  hayAlgoLibre: boolean;
};

export function filasDeAcciones(x: PermisosYStock): FilaAccion[] {
  const filas: FilaAccion[] = [];
  if (x.puedeReponer) {
    filas.push({ clave: "colgar", etiqueta: "Colgar en el piso", motivo: x.hayQueBajar ? undefined : "No hay nada libre en el almacén", sugerida: x.hayQueBajar, aparte: false });
    filas.push({ clave: "subir", etiqueta: "Subir a almacén", motivo: x.hayEnElPiso ? undefined : "No hay nada colgado para subir", sugerida: false, aparte: false });
  }
  if (x.puedeEnviar) {
    filas.push({ clave: "enviar", etiqueta: "Enviar a otra sede", motivo: x.hayEnAlmacen ? undefined : "No hay nada libre en el almacén para enviar", sugerida: false, aparte: false });
  }
  let primeraDelSegundoGrupo = true;
  const segundo = (f: Omit<FilaAccion, "aparte" | "sugerida">) => {
    filas.push({ ...f, sugerida: false, aparte: primeraDelSegundoGrupo && filas.length > 0 });
    primeraDelSegundoGrupo = false;
  };
  if (x.puedeAjustar) segundo({ clave: "ajustar", etiqueta: "Ajustar stock" });
  if (x.puedeReportarDanada) segundo({ clave: "danada", etiqueta: "Reportar dañada", motivo: x.hayAlgoLibre ? undefined : "No hay prendas libres para reportar" });
  segundo({ clave: "detalle", etiqueta: "Ver detalle" });
  return filas;
}

/** El icono de la tarjeta: la acción sugerida. Sin ninguna (nada que colgar hoy), `null`: el icono es «⋯» y solo abre la ventana. */
export function accionDelIcono(filas: readonly FilaAccion[]): FilaAccion | null {
  return filas.find((f) => f.sugerida && !f.motivo) ?? null;
}
