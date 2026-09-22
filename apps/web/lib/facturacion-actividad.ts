import type { Comprobante, EntornoTransmision, EstadoComprobante, VentaDelDia } from "./comprobantes-reglas";
import { ESTADO_ETIQUETA, ETIQUETA_TIPO } from "./comprobantes-reglas";
import { antiguedad } from "./facturacion-resumen-reglas";

// Reglas de «Actividad de hoy» del Resumen (spec §6 y §9, ADR-0124): cruzar cada venta del día
// con su comprobante, decidir el hilo, el chip, el detalle y la acción de cada fila. Puras y sin
// servidor: el reloj entra por parámetro y el componente solo dibuja lo que sale de acá.

/** El texto del número, con la MISMA fórmula que `fn_ventas_del_dia` (`serie-` y el correlativo
 *  a 6 dígitos): es la llave que une una venta con su comprobante. */
export function textoDelNumero(c: Pick<Comprobante, "serie" | "numero">): string {
  return `${c.serie}-${String(c.numero).padStart(6, "0")}`;
}

export type FilaDeActividad = { venta: VentaDelDia; comprobante: Comprobante | null };

/** Cruza cada venta de `fn_ventas_del_dia` con su comprobante completo (el que trae el entorno, el
 *  motivo de rechazo, el PDF y cuándo se reservó) por el texto del número. Sin número, `null`; un
 *  comprobante manual sin venta no aparece: la actividad es de las ventas. Si el comprobante no
 *  está entre los de hoy (se reservó pasada la medianoche), la fila queda sin él y el estado sale
 *  de lo que trae la venta. Conserva el orden de las ventas. */
export function enlazarVentasConComprobantes(ventas: VentaDelDia[], comprobantes: Comprobante[]): FilaDeActividad[] {
  const porNumero = new Map(comprobantes.map((c) => [textoDelNumero(c), c]));
  return ventas.map((venta) => ({ venta, comprobante: venta.comprobante_texto ? (porNumero.get(venta.comprobante_texto) ?? null) : null }));
}

export type EstadoDeFila = EstadoComprobante | "sin_comprobante";

/** El estado del comprobante de la fila: el del comprobante completo manda (es el más fresco); si
 *  no está, el que trae la venta; sin ninguno, «sin comprobante». */
export function estadoDeLaFila(fila: FilaDeActividad): EstadoDeFila {
  return fila.comprobante?.estado ?? fila.venta.comprobante_estado ?? "sin_comprobante";
}

/* ------------------------------ El hilo del comprobante ------------------------------ */

/** Un nodo del hilo: `hecho` (verde), `ambar-punteado` (falta hacerlo), `ambar-pulso` (enviado,
 *  esperando a SUNAT), `rechazado` (equis roja), `vacio`, `prueba` (nunca verde: SUNAT no lo vio)
 *  y `apagado` (comprobante cerrado). */
export type NodoDelHilo = "hecho" | "ambar-punteado" | "ambar-pulso" | "rechazado" | "vacio" | "prueba" | "apagado";
export type TramoDelHilo = "lleno" | "vacio" | "prueba" | "apagado";
export type Hilo = {
  /** Venta · número · SUNAT · aceptado. */
  nodos: [NodoDelHilo, NodoDelHilo, NodoDelHilo, NodoDelHilo];
  /** Los tres tramos que unen los cuatro nodos. */
  tramos: [TramoDelHilo, TramoDelHilo, TramoDelHilo];
  /** El estado dicho con palabras, para `role="img"` y `aria-label`: el color solo no alcanza. */
  descripcion: string;
};

/** Cuánto avanzó el comprobante, en cuatro nodos (spec §9). Con `entorno === "sandbox"` un
 *  «aceptado» se dibuja distinto de uno real: Lucode lo acepta igual, pero SUNAT nunca lo vio. */
export function etapasDelHilo(estado: EstadoDeFila, entorno: EntornoTransmision): Hilo {
  switch (estado) {
    case "sin_comprobante":
      return { nodos: ["hecho", "ambar-punteado", "vacio", "vacio"], tramos: ["vacio", "vacio", "vacio"], descripcion: "Venta registrada; todavía sin comprobante" };
    case "pendiente":
      return { nodos: ["hecho", "hecho", "ambar-punteado", "vacio"], tramos: ["lleno", "vacio", "vacio"], descripcion: "Venta registrada y número reservado; pendiente de enviar a SUNAT" };
    case "enviado":
      return { nodos: ["hecho", "hecho", "ambar-pulso", "vacio"], tramos: ["lleno", "lleno", "vacio"], descripcion: "Venta registrada y número reservado; enviado a SUNAT, esperando respuesta" };
    case "aceptado":
      return entorno === "sandbox"
        ? { nodos: ["hecho", "hecho", "prueba", "prueba"], tramos: ["lleno", "prueba", "prueba"], descripcion: "Venta registrada y número reservado; aceptado en el entorno de pruebas, SUNAT no lo vio" }
        : { nodos: ["hecho", "hecho", "hecho", "hecho"], tramos: ["lleno", "lleno", "lleno"], descripcion: "Venta registrada, número reservado, enviado y aceptado por SUNAT" };
    case "rechazado":
      return { nodos: ["hecho", "hecho", "rechazado", "vacio"], tramos: ["lleno", "lleno", "vacio"], descripcion: "Venta registrada y número reservado; SUNAT rechazó el comprobante" };
    case "anulado":
      return { nodos: ["apagado", "apagado", "apagado", "apagado"], tramos: ["apagado", "apagado", "apagado"], descripcion: "Comprobante anulado" };
    case "no_emitido":
      return { nodos: ["apagado", "apagado", "apagado", "apagado"], tramos: ["apagado", "apagado", "apagado"], descripcion: "Comprobante liberado sin emitir" };
    case "interna":
      return { nodos: ["hecho", "hecho", "apagado", "apagado"], tramos: ["lleno", "apagado", "apagado"], descripcion: "Nota de venta: documento interno, no va a SUNAT" };
  }
}

/* ------------------------------ Lo que dice y hace cada fila ------------------------------ */

/** La baja se pidió pero SUNAT no la confirmó: el resumen diario de boletas se procesa diferido. Decir
 *  «anulado» antes de que confirme sería adelantarse a SUNAT. */
export function anulacionEnTramite(c: Pick<Comprobante, "estado" | "anulacion_solicitada_at">): boolean {
  return c.estado === "aceptado" && c.anulacion_solicitada_at !== null;
}

export type ChipDeFila = { tono: "neutro" | "ambar" | "verde" | "rojo" | "apagado"; texto: string; punteado: boolean };

const TONO_DEL_ESTADO: Record<EstadoComprobante, ChipDeFila["tono"]> = {
  pendiente: "ambar",
  enviado: "ambar",
  aceptado: "verde",
  rechazado: "rojo",
  anulado: "apagado",
  no_emitido: "apagado",
  interna: "apagado",
};

/** El chip de estado de un comprobante, el mismo en el Resumen y en la vista Comprobantes. Uno
 *  transmitido al sandbox lleva la palabra «prueba» y borde punteado en el estado que esté (el
 *  color solo no lo distingue, ADR-0015: SUNAT nunca lo vio); una baja pedida y aún sin confirmar
 *  por SUNAT es «Anulación en trámite» en ámbar. Las etiquetas son las de siempre
 *  (`ESTADO_ETIQUETA`). */
export function chipDelComprobante(c: Comprobante): ChipDeFila {
  const enTramite = anulacionEnTramite(c);
  const texto = enTramite ? "Anulación en trámite" : ESTADO_ETIQUETA[c.estado];
  if (c.entorno_transmision === "sandbox") return { tono: "neutro", texto: `${texto} · prueba`, punteado: true };
  return { tono: enTramite ? "ambar" : TONO_DEL_ESTADO[c.estado], texto, punteado: false };
}

/** El chip de la fila del Resumen: el del comprobante si ya se conoce completo; si no, lo que trae
 *  la venta (`comprobante_estado`); y sin comprobante, «Sin comprobante» en ámbar. */
export function chipDeLaFila(venta: VentaDelDia, comprobante: Comprobante | null): ChipDeFila {
  if (comprobante) return chipDelComprobante(comprobante);
  const estado: EstadoDeFila = venta.comprobante_estado ?? "sin_comprobante";
  if (estado === "sin_comprobante") return { tono: "ambar", texto: "Sin comprobante", punteado: false };
  return { tono: TONO_DEL_ESTADO[estado], texto: ESTADO_ETIQUETA[estado], punteado: false };
}

/** Lo que se puede escribir en el buscador para encontrar esta fila del Resumen: la hora, la tienda,
 *  quién vendió, la clienta, las prendas (referencia, talla y color), cómo pagó, el tipo y el número del
 *  comprobante y su estado. Lo consume `coincide` (`lib/facturacion-busqueda.ts`). */
export function camposDeBusquedaDeLaFila(fila: FilaDeActividad): (string | null)[] {
  const { venta, comprobante } = fila;
  return [
    venta.hora,
    venta.ubicacion_nombre,
    venta.vendedor,
    venta.cliente_nombre,
    ...venta.items.flatMap((i) => [i.referencia, i.talla, i.color]),
    venta.metodos_pago,
    venta.comprobante_tipo ? ETIQUETA_TIPO[venta.comprobante_tipo] : null,
    venta.comprobante_texto,
    chipDeLaFila(venta, comprobante).texto,
    Number(venta.total).toFixed(2),
  ];
}

/** La línea de abajo del chip: hace cuánto se reservó un pendiente, «Esperando respuesta» de un
 *  enviado, o el motivo que dio SUNAT al rechazar (sin motivo no se inventa uno). */
export function detalleDeLaFila(comprobante: Comprobante | null, ahora: Date): string | null {
  if (!comprobante) return null;
  if (comprobante.estado === "pendiente") return antiguedad(comprobante.created_at, ahora);
  if (comprobante.estado === "enviado") return "Esperando respuesta";
  if (comprobante.estado === "rechazado") return comprobante.motivo_rechazo;
  return null;
}

export type AccionDeFila = { tipo: "transmitir"; etiqueta: "Transmitir" | "Reintentar"; alerta: boolean } | { tipo: "pdf"; etiqueta: "Ver PDF"; href: string };

/** El botón de la fila: transmitir un pendiente, reintentar un rechazado (los dos por el mismo
 *  camino) o abrir el PDF de un aceptado que lo tiene. */
export function accionDeLaFila(comprobante: Comprobante | null): AccionDeFila | null {
  if (!comprobante) return null;
  if (comprobante.estado === "pendiente") return { tipo: "transmitir", etiqueta: "Transmitir", alerta: false };
  if (comprobante.estado === "rechazado") return { tipo: "transmitir", etiqueta: "Reintentar", alerta: true };
  if (comprobante.estado === "aceptado" && comprobante.pdfUrl) return { tipo: "pdf", etiqueta: "Ver PDF", href: comprobante.pdfUrl };
  return null;
}
