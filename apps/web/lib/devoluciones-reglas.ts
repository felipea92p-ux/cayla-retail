// Reglas puras de Devoluciones — sin `createClient`, cero dependencia de servidor, mismo
// patrón que `cambios-reglas.ts` (ADR-0121) y `vender-reglas.ts`: los componentes de
// Devoluciones son cliente y necesitan esto como VALOR. Reusa de Cambios lo que es de los
// dos: el plazo (R-38), el estado visual de una prenda, las validaciones y el impacto.
//
// Una devolución tiene DOS tiempos, y de ahí sale casi todo lo distinto a Cambios: la
// colaboradora la REGISTRA (`crear_devolucion`, queda pendiente) y un líder la APRUEBA
// (`aprobar_devolucion`: recién ahí se mueve el stock, se emite la nota de crédito y sale
// el reembolso). Por eso lo que se valida al registrar es la solicitud, y lo de la caja se
// valida al aprobar.

import { DIAS_PLAZO_CAMBIO, estadoPlazoCambio, fechaLimiteCambio, unidadesDisponibles, type EstadoVisual, type ImpactoOperacion, type Validacion } from "./cambios-reglas";
import { soles } from "./compras-reglas";

// ============================================================================
// Motivo. `crear_devolucion(p_motivo text)` lo guarda como texto libre: no hay columna
// estructurada (para no chocar con la migración de la otra sesión sobre esa función; queda
// en BACKLOG). Una lista cerrada que compone el texto ya da "6 de 8 devoluciones fueron
// por defecto" con un `group by`, que el texto libre nunca dio (R-45: una lista se suma).
// ============================================================================

export const MOTIVOS_DEVOLUCION = [
  { valor: "no_le_queda", etiqueta: "No le queda bien" },
  { valor: "no_esperaba", etiqueta: "No es lo que esperaba" },
  { valor: "defecto", etiqueta: "Tiene un defecto" },
  { valor: "cambio_de_opinion", etiqueta: "Cambió de opinión" },
  { valor: "otro", etiqueta: "Otro motivo" },
] as const;

export type MotivoDevolucion = (typeof MOTIVOS_DEVOLUCION)[number]["valor"];

export function etiquetaMotivoDevolucion(motivo: MotivoDevolucion): string {
  return MOTIVOS_DEVOLUCION.find((m) => m.valor === motivo)?.etiqueta ?? motivo;
}

/** El texto que viaja a `p_motivo`: «Tiene un defecto — costura abierta». Vacío si todavía
 *  no hay motivo elegido. */
export function textoMotivo(motivo: MotivoDevolucion | null, detalle: string): string {
  if (!motivo) return "";
  const extra = detalle.trim();
  return extra ? `${etiquetaMotivoDevolucion(motivo)} — ${extra}` : etiquetaMotivoDevolucion(motivo);
}

// ============================================================================
// Estado en que vuelve la prenda (R-39). Los valores son los del `check` de
// `devolucion_items.condicion`. Las tres no vendibles hacen LO MISMO al aprobar (entran a
// cuarentena); lo que cambia es la intención que queda anotada, y el destino final lo
// decide después un líder con `resolver_prenda_danada`.
// ============================================================================

export type CondicionDevolucion = "vendible" | "danada_reparacion" | "danada_donar" | "devolver_proveedor";
export type DestinoDanada = Exclude<CondicionDevolucion, "vendible">;

export const DESTINOS_DANADA = [
  { valor: "danada_reparacion", etiqueta: "Reparar" },
  { valor: "danada_donar", etiqueta: "Donar" },
  { valor: "devolver_proveedor", etiqueta: "Devolver al proveedor" },
] as const;

const ETIQUETA_CONDICION: Record<CondicionDevolucion, string> = {
  vendible: "Impecable",
  danada_reparacion: "Dañada · reparar",
  danada_donar: "Dañada · donar",
  devolver_proveedor: "Devolver al proveedor",
};

/** Acepta el texto crudo de la base: una condición que esta pantalla no conoce se muestra tal cual. */
export function etiquetaCondicion(condicion: string): string {
  return ETIQUETA_CONDICION[condicion as CondicionDevolucion] ?? condicion;
}

/** Lo que la colaboradora va marcando de cada prenda elegida. `grupo` es la pregunta
 *  «¿cómo vuelve?»; `destino` solo importa si no vuelve impecable. */
export type ItemElegido = {
  cantidad: number;
  grupo: "vendible" | "danada";
  destino: DestinoDanada | null;
};

/** null = todavía falta decir qué se hará con una prenda dañada. */
export function condicionDeItem(item: ItemElegido): CondicionDevolucion | null {
  return item.grupo === "vendible" ? "vendible" : item.destino;
}

// ============================================================================
// Estado de una prenda vendida frente a una devolución (2026-09-18). A diferencia de
// Cambios, FUERA DE PLAZO NO BLOQUEA: toda devolución ya pasa por la aprobación de un
// líder, y él es quien decide (R-38 dice que dentro de los 15 días lo aplica cualquiera en
// caja; después, no está escrito quién). El plazo se muestra —en la lista, en la solicitud
// y a quien aprueba— pero no se inventa un bloqueo nuevo sobre algo que hoy la base permite.
// ============================================================================

export type EstadoPrendaDevolucion = EstadoVisual & { devolvible: boolean };

export function estadoPrendaDevolucion(
  linea: {
    cantidad: number;
    yaCambiado: number;
    yaDevuelto: number;
    devolucionesHechas: readonly { cantidad: number; estado: "pendiente" | "aprobada" }[];
    anulada: boolean;
    creadoEn: string;
  },
  ahora: Date
): EstadoPrendaDevolucion {
  if (linea.anulada) return { clave: "anulada", texto: "Venta anulada", tono: "apagado", icono: null, devolvible: false };
  if (unidadesDisponibles(linea) <= 0) {
    if (linea.devolucionesHechas.some((d) => d.estado === "pendiente")) {
      return { clave: "pendiente", texto: "Devolución pendiente", tono: "ambar", icono: "reloj", devolvible: false };
    }
    // Todo lo que ya no queda se fue por una devolución aprobada o por un cambio.
    return linea.yaDevuelto >= linea.yaCambiado
      ? { clave: "devuelta", texto: "Ya devuelta", tono: "verde", icono: "check", devolvible: false }
      : { clave: "cambiada", texto: "Ya cambiada", tono: "neutro", icono: "check", devolvible: false };
  }
  const { estado, diasRestantes } = estadoPlazoCambio(linea.creadoEn, ahora);
  // Igual que en Cambios: verde dentro del plazo (también los últimos días), rojo al vencer.
  // Rojo aquí NO bloquea (`devolvible` sigue en true): solo dice que un líder tiene que decidir.
  if (estado === "fuera_de_plazo") return { clave: "fuera_de_plazo", texto: "Fuera del plazo", tono: "rojo", icono: "alerta", devolvible: true };
  if (estado === "por_vencer") {
    const texto = diasRestantes === 0 ? "Último día del plazo" : `Vence en ${diasRestantes} día${diasRestantes === 1 ? "" : "s"}`;
    return { clave: "por_vencer", texto, tono: "verde", icono: "reloj", devolvible: true };
  }
  return { clave: "dentro_del_plazo", texto: "Dentro del plazo", tono: "verde", icono: "reloj", devolvible: true };
}

/** Lo que la clienta pagó de verdad por `cantidad` unidades: precio menos el descuento que
 *  se le hizo al venderla. A 2 decimales, como los montos de la base. */
export function valorPagado(linea: { precioUnitario: number; descuentoUnitario: number }, cantidad: number): number {
  return Math.round((linea.precioUnitario - linea.descuentoUnitario) * cantidad * 100) / 100;
}

/** Espejo del cálculo de `aprobar_devolucion` para elegir el motivo 06 (devolución total) o
 *  07 (parcial) de la nota de crédito: es total si ESTA devolución cubre el 100% de cada
 *  línea de la venta. (La base no mira devoluciones anteriores sobre la misma venta; acá
 *  tampoco, para decir lo mismo que va a hacer.) */
export function esDevolucionTotal(lineasDeLaVenta: readonly { ventaItemId: string; cantidad: number }[], elegidas: Readonly<Record<string, number>>): boolean {
  return lineasDeLaVenta.every((l) => (elegidas[l.ventaItemId] ?? 0) === l.cantidad);
}

// ============================================================================
// Validaciones de la solicitud, en el orden del recorrido: la compra, el plazo, las
// prendas, el motivo, el estado de cada una. Mismo patrón que `validarCambio`; el plazo es
// un `aviso` (informa, no frena — ver arriba).
// ============================================================================

export type PrendaParaValidar = {
  referencia: string;
  /** Lo que todavía se puede devolver de esa línea. */
  disponible: number;
  item: ItemElegido;
};

export function validarDevolucion(e: {
  venta: { comprobante: string | null; creadoEn: string; anulada: boolean };
  ahora: Date;
  elegidas: readonly PrendaParaValidar[];
  motivo: MotivoDevolucion | null;
  detalle: string;
}): Validacion[] {
  const lista: Validacion[] = [];
  const fecha = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "long" }).format(new Date(e.venta.creadoEn));

  lista.push(
    e.venta.anulada
      ? { clave: "compra", estado: "alerta", titulo: "La venta está anulada", detalle: "Sus prendas ya volvieron al stock." }
      : { clave: "compra", estado: "ok", titulo: "Compra encontrada", detalle: `${e.venta.comprobante ?? "Venta sin comprobante"} · ${fecha}` }
  );

  const plazo = estadoPlazoCambio(e.venta.creadoEn, e.ahora);
  const diasDesdeLaCompra = DIAS_PLAZO_CAMBIO - plazo.diasRestantes;
  lista.push(
    plazo.estado === "fuera_de_plazo"
      ? {
          clave: "plazo",
          estado: "aviso",
          tono: "rojo",
          titulo: "Fuera del plazo",
          detalle: `La compra fue hace ${diasDesdeLaCompra} días; el plazo es de ${DIAS_PLAZO_CAMBIO}. Puedes registrarla: un líder decide si la acepta.`,
        }
      : {
          clave: "plazo",
          estado: "ok",
          titulo: "Dentro del plazo",
          detalle:
            plazo.diasRestantes === 0
              ? "Hoy es el último día."
              : `Quedan ${plazo.diasRestantes} día${plazo.diasRestantes === 1 ? "" : "s"} (hasta el ${fechaLimiteCambio(e.venta.creadoEn)}).`,
        }
  );

  const unidades = e.elegidas.reduce((suma, p) => suma + p.item.cantidad, 0);
  const excedida = e.elegidas.find((p) => p.item.cantidad < 1 || p.item.cantidad > p.disponible);
  if (e.elegidas.length === 0) lista.push({ clave: "prendas", estado: "pendiente", titulo: "Falta elegir qué prendas devuelve" });
  else if (excedida)
    lista.push({
      clave: "prendas",
      estado: "alerta",
      titulo: `Revisa la cantidad de ${excedida.referencia}`,
      detalle: `Solo quedan ${excedida.disponible} por devolver.`,
    });
  else
    lista.push({
      clave: "prendas",
      estado: "ok",
      titulo: e.elegidas.length === 1 ? "1 prenda elegida" : `${e.elegidas.length} prendas elegidas`,
      detalle: unidades === e.elegidas.length ? undefined : `${unidades} unidades en total.`,
    });

  if (!e.motivo) lista.push({ clave: "motivo", estado: "pendiente", titulo: "Falta elegir por qué la devuelve" });
  else if (e.motivo === "otro" && !e.detalle.trim()) lista.push({ clave: "motivo", estado: "pendiente", titulo: "Cuenta cuál es el otro motivo" });
  else lista.push({ clave: "motivo", estado: "ok", titulo: `Motivo: ${etiquetaMotivoDevolucion(e.motivo).toLowerCase()}` });

  if (e.elegidas.length > 0) {
    const sinDestino = e.elegidas.find((p) => condicionDeItem(p.item) === null);
    lista.push(
      sinDestino
        ? { clave: "estado", estado: "pendiente", titulo: `Falta decir qué se hará con ${sinDestino.referencia}` }
        : { clave: "estado", estado: "ok", titulo: "Estado de cada prenda indicado" }
    );
    if (e.motivo === "defecto" && e.elegidas.some((p) => p.item.grupo === "vendible")) {
      lista.push({
        clave: "coherencia",
        estado: "aviso",
        titulo: "Dijo que tiene un defecto, pero una vuelve al piso",
        detalle: "Si de verdad tiene un defecto, márcala como dañada: si no, se vuelve a vender.",
      });
    }
  }
  return lista;
}

// ============================================================================
// Impacto de la devolución, dicho ANTES de registrarla y sin prometer lo que todavía no
// pasa: registrar no mueve nada; todo ocurre cuando un líder la aprueba
// (`aprobar_devolucion`): la prenda entra al piso o a cuarentena, se emite la nota de
// crédito si la venta tiene un comprobante aceptado por SUNAT (ADR-0100), y el reembolso
// —solo si lo decide quien aprueba— sale de la caja si es en efectivo.
// ============================================================================

export function impactoDevolucion(e: {
  prendas: readonly { prenda: string; cantidad: number; condicion: CondicionDevolucion }[];
  sede: string;
  valorPagado: number;
  comprobanteAceptado: boolean;
  esTotal: boolean;
}): ImpactoOperacion {
  return {
    inventario: e.prendas.map((p) => ({
      signo: "+" as const,
      cantidad: p.cantidad,
      prenda: p.prenda,
      donde: p.condicion === "vendible" ? `volverá al piso de ${e.sede} al aprobarla` : `entrará a cuarentena en ${e.sede} al aprobarla`,
    })),
    caja: {
      titulo: "Al registrarla, la caja no se mueve",
      detalle: `La clienta pagó ${soles(e.valorPagado)} por lo que devuelve. Si se le reembolsa, lo decide quien la apruebe.`,
    },
    documento: e.comprobanteAceptado
      ? {
          titulo: `Nota de crédito ${e.esTotal ? "por devolución total" : "por devolución parcial"}`,
          detalle: "La venta tiene un comprobante aceptado por SUNAT: al aprobar la devolución se emite sola la nota de crédito, lista para transmitir desde Facturación.",
        }
      : undefined,
  };
}

// ============================================================================
// Aprobación (solo un líder). El reembolso es opcional y es la ÚLTIMA opción (R-37:
// primero un cambio, después nota de crédito o vale). `aprobar_devolucion` rechaza el
// efectivo sin caja abierta (20260916180000): mejor decirlo antes de apretar el botón.
// ============================================================================

export function revisarAprobacion(e: {
  monto: number | null;
  metodo: string;
  cajaAbierta: boolean;
  valorPagado: number;
}): { bloqueo: string | null; aviso: string | null } {
  if (e.monto !== null && (Number.isNaN(e.monto) || e.monto < 0)) return { bloqueo: "El monto del reembolso no puede ser negativo.", aviso: null };
  if (e.monto !== null && e.monto > 0 && e.metodo === "efectivo" && !e.cajaAbierta) {
    return { bloqueo: "La caja está cerrada: ábrela en Caja, o reembolsa con otro método.", aviso: null };
  }
  if (e.monto !== null && e.monto > e.valorPagado) {
    return { bloqueo: null, aviso: `Es más de lo que pagó la clienta (${soles(e.valorPagado)}).` };
  }
  return { bloqueo: null, aviso: null };
}
