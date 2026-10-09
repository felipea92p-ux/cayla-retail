/**
 * Textos de la hoja que descontinúa o reactiva prendas (`CambiarEstadoProductosHoja`; ADR-0254, y el botón «Desactivar» de la
 * vista rápida, 2026-10-09).
 *
 * La REGLA de qué se puede cambiar no vive aquí: la decide `cambiar_estado_productos` en la base (permiso, marca y proveedor
 * activos al reactivar, todo o nada). Este archivo solo redacta lo que se le dice a quien confirma.
 *
 * Dos vocabularios para el MISMO cambio de `productos.estado` (activo ⇄ descontinuado):
 *  - «descontinuar»: el de la barra de prendas marcadas de la Tabla, que es el de siempre y no cambia.
 *  - «desactivar»: el del botón de la vista rápida de la Grilla (pedido por Felipe el 2026-10-09). La prenda queda igual
 *    «Descontinuada» (el chip y el filtro no cambian); solo el verbo del botón y de su hoja es otro.
 */

export type EstadoProducto = "activo" | "descontinuado";
export type VocabularioEstado = "descontinuar" | "desactivar";

export type TextosCambioEstado = {
  /** «Reactivar», «Descontinuar» o «Desactivar». */
  verbo: string;
  titulo: string;
  /** El botón que confirma: «Descontinuar 3»; con UNA sola prenda en el vocabulario «desactivar», sin el número («Desactivar»). */
  boton: string;
  subtitulo: string;
  /** La nota al pie de la hoja. */
  nota: string;
  /** Lo que se avisa al terminar. */
  exito: string;
  /** Para `traducirError`: «descontinuar las prendas». */
  accionError: string;
  /** Lo que dice la fila de una prenda que ya estaba en el estado de destino. */
  yaEsta: string;
};

const prendas = (n: number) => (n === 1 ? "prenda" : "prendas");

/** «Verbo N», salvo con UNA prenda del botón de la vista rápida, donde el número sobra («Desactivar 1» suena a otra cosa). */
const botonCon = (verbo: string, cuantas: number, vocabulario: VocabularioEstado) =>
  vocabulario === "desactivar" && cuantas === 1 ? verbo : `${verbo} ${cuantas}`;

/** Cuántas cambian de verdad (`cuantas`) y hacia dónde van (`destino`), en el vocabulario de quien abrió la hoja. */
export function textosCambioEstado(destino: EstadoProducto, cuantas: number, vocabulario: VocabularioEstado = "descontinuar"): TextosCambioEstado {
  const s = cuantas === 1 ? "" : "s";
  if (destino === "activo") {
    return {
      verbo: "Reactivar",
      titulo: `¿Reactivar ${cuantas} ${prendas(cuantas)}?`,
      boton: botonCon("Reactivar", cuantas, vocabulario),
      subtitulo: "Vuelven a contar para «Para pedir» y a verse como activas. Antes se revisa que su marca y su proveedor sigan activos.",
      nota: "Si una prenda tiene su marca o su proveedor dado de baja, no se reactiva ninguna y te decimos cuál corregir.",
      exito: `${cuantas} ${prendas(cuantas)} reactivada${s}`,
      accionError: "reactivar las prendas",
      yaEsta: "Ya está activa: queda igual",
    };
  }
  if (vocabulario === "desactivar") {
    return {
      verbo: "Desactivar",
      titulo: `¿Desactivar ${cuantas} ${prendas(cuantas)}?`,
      boton: botonCon("Desactivar", cuantas, vocabulario),
      subtitulo:
        "Sale de la lista de activas y deja de contar para «Para pedir». No se borra nada: su historia, sus ventas y su stock se conservan, y la encuentras con el filtro «Descontinuados».",
      nota: "Para volver atrás, búscala con el filtro «Descontinuados», ábrela y usa «Reactivar». El historial de la prenda guarda quién hizo el cambio.",
      exito: `${cuantas} ${prendas(cuantas)} desactivada${s}`,
      accionError: "desactivar las prendas",
      yaEsta: "Ya está desactivada: queda igual",
    };
  }
  return {
    verbo: "Descontinuar",
    titulo: `¿Descontinuar ${cuantas} ${prendas(cuantas)}?`,
    boton: botonCon("Descontinuar", cuantas, vocabulario),
    subtitulo: "Dejan de contar para «Para pedir» y se ven marcadas en la Grilla y en la Tabla. Se pueden reactivar cuando quieras.",
    nota: "Para volver atrás, márcalas y usa «Reactivar». El historial de cada prenda guarda quién hizo el cambio.",
    exito: `${cuantas} ${prendas(cuantas)} descontinuada${s}`,
    accionError: "descontinuar las prendas",
    yaEsta: "Ya está descontinuada: queda igual",
  };
}

/** La prenda a la que apunta el botón de la vista rápida: activa → se desactiva; descontinuada → se reactiva. */
export function destinoDelBoton(estado: string | null | undefined): EstadoProducto {
  return estado === "activo" ? "descontinuado" : "activo";
}
