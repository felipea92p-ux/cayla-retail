import type { FilaHistorial } from "./ventas-historial-reglas";

// Historial conectado (ADR-0230, spike docs/maquetas/historial-spike-2026-09/): lo que la pantalla ofrece para
// ENCONTRAR una venta (los atajos) y para ACTUAR sobre ella (las acciones y su recorrido). Reglas puras: sin Supabase
// ni React, las importan la página, los componentes cliente y las pruebas.
//
// Historial sigue siendo de solo lectura: ninguna acción cambia la venta desde aquí. Cada una LLEVA a la pantalla que
// hace ese proceso (Cambios, Devoluciones, Comprobantes, Apartados, Punto de Venta) con la venta ya buscada, y esa
// pantalla —y su función en la base— decide si se puede.

// ---------------------------------------------------------------------------
// Atajos: filtros de un toque. Cada uno es un conjunto de parámetros de la URL que ya entiende `filtrosDesdeParams`.
// ---------------------------------------------------------------------------

export type ClaveAtajo = "mias" | "por_enviar" | "sin_comprobante" | "posventa" | "apartado" | "facturas" | "clienta" | "anuladas" | "yape";

export type Atajo = {
  clave: ClaveAtajo;
  etiqueta: string;
  /** De fábrica: siempre a la vista. Los demás los elige cada persona en «+ Atajo». */
  deFabrica: boolean;
  params: Record<string, string>;
};

export const ATAJOS: readonly Atajo[] = [
  { clave: "mias", etiqueta: "Mis ventas", deFabrica: true, params: { mias: "1" } },
  { clave: "por_enviar", etiqueta: "Por enviar", deFabrica: true, params: { comp: "por_enviar" } },
  { clave: "sin_comprobante", etiqueta: "Sin comprobante", deFabrica: false, params: { comp: "sin" } },
  { clave: "posventa", etiqueta: "Con cambio o devolución", deFabrica: false, params: { posventa: "1" } },
  { clave: "apartado", etiqueta: "Desde apartado", deFabrica: false, params: { pago: "anticipo" } },
  { clave: "facturas", etiqueta: "Facturas", deFabrica: false, params: { comp: "factura" } },
  { clave: "clienta", etiqueta: "Con clienta", deFabrica: false, params: { clienta: "1" } },
  { clave: "anuladas", etiqueta: "Anuladas", deFabrica: false, params: { estado: "anulada" } },
  { clave: "yape", etiqueta: "Pagó con Yape", deFabrica: false, params: { pago: "yape" } },
];

/** Dónde guarda cada navegador los atajos que eligió su colaboradora (decisión 2026-09-26: en el navegador, sin base —
 *  si cambia de teléfono vuelve a elegirlos; los de fábrica no se pierden nunca). */
export const CLAVE_ATAJOS_ELEGIDOS = "cayla.historial.atajos";

/** Los atajos elegidos que se guardaron, validados: lo que no sea una clave conocida (o sea de fábrica) se descarta. */
export function leerAtajosElegidos(guardado: string | null): ClaveAtajo[] {
  if (!guardado) return [];
  try {
    const lista: unknown = JSON.parse(guardado);
    if (!Array.isArray(lista)) return [];
    const validas = new Set(ATAJOS.filter((a) => !a.deFabrica).map((a) => a.clave as string));
    return [...new Set(lista.filter((c): c is ClaveAtajo => typeof c === "string" && validas.has(c)))];
  } catch {
    return [];
  }
}

/** Los atajos que se ven: los de fábrica y, después, los elegidos, en el orden del catálogo. */
export function atajosVisibles(elegidos: readonly ClaveAtajo[]): Atajo[] {
  return ATAJOS.filter((a) => a.deFabrica || elegidos.includes(a.clave));
}

/** Un atajo está puesto si la URL tiene TODOS sus parámetros con su valor. */
export function atajoActivo(a: Atajo, params: Record<string, string | undefined>): boolean {
  return Object.entries(a.params).every(([k, v]) => params[k] === v);
}

/** Los cambios de URL al tocar un atajo: ponerlo escribe sus parámetros (reemplaza otro atajo que use la misma llave,
 *  p. ej. «Facturas» y «Sin comprobante» son los dos `comp`); quitarlo los borra. */
export function cambiosDeAtajo(a: Atajo, activo: boolean): Record<string, string> {
  return Object.fromEntries(Object.entries(a.params).map(([k, v]) => [k, activo ? "" : v]));
}

// ---------------------------------------------------------------------------
// Acciones sobre una venta
// ---------------------------------------------------------------------------

export type ClaveAccion = "reintentar" | "cambiar" | "devolver" | "clienta" | "apartado" | "volver" | "comprobante" | "anular";

export type AccionVenta = {
  clave: ClaveAccion;
  etiqueta: string;
  /** Adónde lleva, en palabras («Posventa ▸ Cambios»). */
  detalle: string;
  href: string;
  /** La acción principal (la que va en negro): enviar a SUNAT si está pendiente; si no, cambiar. */
  destacada?: boolean;
  peligro?: boolean;
};

export type ContextoAcciones = {
  /** Los módulos que ve la cuenta (`persona.modulos`): una acción hacia un módulo que no ve no se ofrece. */
  modulos: ReadonlySet<string>;
  /** Comprobantes vive en Facturación, que además pide el poder «facturar». */
  puedeFacturar: boolean;
  esLider: boolean;
  /** La sede donde está parada la persona: Cambios y Devoluciones buscan ahí salvo que un líder pida «todas». */
  ubicacionId: string;
  /** Hoy en Lima (`aaaa-mm-dd`): anular solo se puede el mismo día de la venta (PL-29, `anular_venta`). */
  hoy: string;
};

type VentaParaAcciones = Pick<FilaHistorial, "id" | "fecha" | "ubicacionId" | "ventaItemIds" | "comprobante" | "anulada" | "clienta" | "apartado" | "conAnticipo">;

const qs = (p: Record<string, string | undefined>) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) u.set(k, v);
  return u.toString();
};

/** Cómo llega la venta a Cambios o Devoluciones: con una sola prenda, directo a esa línea (`item`, la abre de cualquier
 *  sede); con varias, buscando su comprobante (`q`) —y «todas las tiendas» si es de otra sede y quien mira es líder—. */
export function paramsDePosventa(v: VentaParaAcciones, ctx: Pick<ContextoAcciones, "esLider" | "ubicacionId">): string {
  if (v.ventaItemIds.length === 1 || !v.comprobante) return qs({ item: v.ventaItemIds[0] });
  return qs({ q: v.comprobante.numero, todas: ctx.esLider && v.ubicacionId !== ctx.ubicacionId ? "1" : undefined });
}

/** El mes de una fecha como lo lee Comprobantes ▸ Emitidos (`?m=2026-9`). */
const mesDeFecha = (fecha: string) => `${Number(fecha.slice(0, 4))}-${Number(fecha.slice(5, 7))}`;

const POR_ENVIAR = new Set(["pendiente", "pendiente_reintento", "rechazado"]);

/** Lo que se puede hacer con una venta, en el orden en que se ofrece. Una venta anulada ya no se cambia ni se devuelve. */
export function accionesDeVenta(v: VentaParaAcciones, ctx: ContextoAcciones): AccionVenta[] {
  const ve = (m: string) => ctx.modulos.has(m);
  const porEnviar = !!v.comprobante && POR_ENVIAR.has(v.comprobante.estado);
  const acciones: AccionVenta[] = [];

  if (porEnviar && ctx.puedeFacturar) {
    acciones.push({
      clave: "reintentar",
      etiqueta: v.comprobante!.estado === "rechazado" ? "Corregir y reenviar" : "Enviar a SUNAT",
      detalle: "Comprobantes ▸ Por reintentar",
      href: "/vender/comprobantes/por-reintentar",
      destacada: true,
    });
  }
  if (!v.anulada && v.ventaItemIds.length > 0) {
    const params = paramsDePosventa(v, ctx);
    if (ve("cambios")) acciones.push({ clave: "cambiar", etiqueta: "Cambiar prenda", detalle: "Posventa ▸ Cambios", href: `/cambios?${params}`, destacada: !porEnviar || !ctx.puedeFacturar });
    if (ve("devoluciones")) acciones.push({ clave: "devolver", etiqueta: "Devolver", detalle: "Posventa ▸ Devoluciones", href: `/devoluciones?${params}` });
  }
  if (v.clienta) acciones.push({ clave: "clienta", etiqueta: "Ficha de la clienta", detalle: "Sus datos y compras", href: `/clientas?${qs({ q: v.clienta })}` });
  if ((v.apartado || v.conAnticipo) && ve("apartados")) {
    // Apartados todavía no recibe una búsqueda por la URL: se llega a la pantalla y el código queda a la vista aquí.
    acciones.push({ clave: "apartado", etiqueta: "Ver el apartado", detalle: v.apartado ? `Apartados · ${v.apartado.codigo}` : "Apartados", href: "/vender/apartados" });
  }
  if (ve("vender")) acciones.push({ clave: "volver", etiqueta: "Volver a vender", detalle: "Mismas prendas en el Punto de Venta", href: `/vender?${qs({ repetir: v.id })}` });
  if (v.comprobante && ctx.puedeFacturar) {
    acciones.push({ clave: "comprobante", etiqueta: "Ver comprobante", detalle: `Comprobantes ▸ Emitidos`, href: `/vender/comprobantes/emitidos?${qs({ m: mesDeFecha(v.fecha) })}` });
  }
  if (ctx.esLider && !v.anulada && v.fecha === ctx.hoy && ve("devoluciones")) {
    acciones.push({ clave: "anular", etiqueta: "Anular venta", detalle: "Solo hoy · en Devoluciones", href: `/devoluciones?${paramsDePosventa(v, ctx)}`, peligro: true });
  }
  return acciones;
}

/** El chip del comprobante lleva a resolverlo solo si espera a SUNAT y la cuenta puede facturar. */
export function comprobanteAccionable(v: Pick<FilaHistorial, "comprobante" | "anulada">, puedeFacturar: boolean): boolean {
  return puedeFacturar && !v.anulada && !!v.comprobante && POR_ENVIAR.has(v.comprobante.estado);
}

// ---------------------------------------------------------------------------
// Recorrido: lo que le pasó a la venta, del primer paso al último
// ---------------------------------------------------------------------------

export type PasoRecorrido = {
  texto: string;
  /** Cuándo, en ISO; null si la base no guarda el instante (se ordena al lado del paso anterior). */
  fecha: string | null;
  tono: "hecho" | "aviso" | "posventa" | "apagado";
};

type VentaParaRecorrido = Pick<FilaHistorial, "creadoEn" | "vendedor" | "comprobante" | "anulada" | "anuladaEn" | "posventa" | "apartado">;

/** Apartada → vendida → SUNAT → cambios y devoluciones → anulada. Una nota de venta interna no va a SUNAT: no suma paso. */
export function recorridoDeVenta(v: VentaParaRecorrido): PasoRecorrido[] {
  const pasos: PasoRecorrido[] = [];
  if (v.apartado) pasos.push({ texto: `Apartada como ${v.apartado.codigo}`, fecha: v.apartado.creadoEn, tono: "posventa" });
  pasos.push({ texto: v.vendedor ? `Vendida por ${v.vendedor}` : "Vendida", fecha: v.creadoEn, tono: "hecho" });
  const c = v.comprobante;
  if (c && c.tipo !== "nota_venta") {
    const doc = c.tipo === "factura" ? "la factura" : "la boleta";
    const texto: Partial<Record<string, [string, PasoRecorrido["tono"]]>> = {
      aceptado: [`SUNAT aceptó ${doc}`, "hecho"],
      enviado: [`${doc[0].toUpperCase()}${doc.slice(1)} está en SUNAT, esperando respuesta`, "aviso"],
      pendiente: [`${doc[0].toUpperCase()}${doc.slice(1)} espera ser enviada a SUNAT`, "aviso"],
      pendiente_reintento: [`${doc[0].toUpperCase()}${doc.slice(1)} espera un reintento a SUNAT`, "aviso"],
      rechazado: [`SUNAT rechazó ${doc}`, "aviso"],
      anulado: [`Se anuló ${doc}`, "apagado"],
      no_emitido: [`${doc[0].toUpperCase()}${doc.slice(1)} quedó sin emitir`, "apagado"],
    };
    const t = texto[c.estado];
    if (t) pasos.push({ texto: t[0], fecha: c.enviadoEn ?? c.emitidoEn, tono: t[1] });
  }
  for (const p of v.posventa) {
    pasos.push({
      texto: p.tipo === "cambio" ? "Cambio de prenda" : p.pendiente ? "Devolución por aprobar" : "Devolución",
      fecha: p.fecha,
      tono: "posventa",
    });
  }
  if (v.anulada) pasos.push({ texto: "Venta anulada", fecha: v.anuladaEn, tono: "apagado" });
  // Orden estable por instante; un paso sin fecha se queda donde se agregó.
  return pasos.map((p, i) => ({ p, i })).sort((a, b) => (a.p.fecha && b.p.fecha ? a.p.fecha.localeCompare(b.p.fecha) : a.i - b.i)).map(({ p }) => p);
}

/** El texto del chip de posventa: «Tuvo cambio · 26 set», «Devuelta · 25 set», «Devolución por aprobar». */
export function textoMarcaPosventa(m: { tipo: "cambio" | "devolucion"; fecha: string; pendiente: boolean }): string {
  const dia = new Intl.DateTimeFormat("es-PE", { timeZone: "America/Lima", day: "numeric", month: "short" }).format(new Date(m.fecha)).replace(".", "");
  if (m.tipo === "cambio") return `Tuvo cambio · ${dia}`;
  return m.pendiente ? "Devolución por aprobar" : `Devuelta · ${dia}`;
}
