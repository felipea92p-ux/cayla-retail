// ADR-0184 (F3-b): la parte de una tienda en un comprobante que gestiona OTRA tienda. Lógica pura: la usan el servidor
// (lib/compras-mi-parte.ts) y los componentes cliente (el botón de pagar), así que no importa nada de Supabase.
//
// La base NO le abre a esa tienda la fila del comprobante (vería el total y los pagos de la otra): le devuelve solo su parte
// (`fn_mis_partes_de_compras`, `fn_mi_parte_de_compra`). Aquí se traduce a lo que la pantalla necesita.

import type { CompraResumen, TipoDocumentoCompra } from "@/lib/compras-reglas";

/** Una fila de `fn_mis_partes_de_compras()` tal como llega de la base. */
export type FilaParteDeCompra = {
  compra_id: string;
  documento: string | null;
  tipo: string;
  proveedor_id: string;
  proveedor_nombre: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  estado: string;
  gestora_id: string | null;
  gestora_nombre: string | null;
  ubicacion_id: string;
  ubicacion_nombre: string;
  unidades: number;
  total: number | string;
  pagado: number | string;
  saldo: number | string;
  registrada_en: string;
  parte_nueva: boolean;
};

/** Mi parte en un comprobante ajeno: SU monto y SU saldo, nunca los del comprobante entero. */
export type ParteDeCompra = {
  compraId: string;
  documento: string;
  tipo: TipoDocumentoCompra;
  proveedorId: string;
  proveedorNombre: string;
  fechaEmision: string;
  fechaVencimiento: string | null;
  vigente: boolean;
  /** La tienda que gestiona el comprobante (donde queda el papel). */
  gestoraNombre: string;
  /** Mi tienda con parte. */
  ubicacionId: string;
  ubicacionNombre: string;
  unidades: number;
  total: number;
  pagado: number;
  saldo: number;
  /** Registrado hace 7 días o menos y mi tienda aún no pagó nada: el aviso a la tienda que no lo registró. */
  parteNueva: boolean;
};

const TIPOS: readonly TipoDocumentoCompra[] = ["factura", "boleta", "nota_venta"];

export function parteDeFila(f: FilaParteDeCompra): ParteDeCompra {
  return {
    compraId: f.compra_id,
    documento: f.documento ?? "—",
    tipo: (TIPOS as readonly string[]).includes(f.tipo) ? (f.tipo as TipoDocumentoCompra) : "factura",
    proveedorId: f.proveedor_id,
    proveedorNombre: f.proveedor_nombre,
    fechaEmision: f.fecha_emision,
    fechaVencimiento: f.fecha_vencimiento,
    vigente: f.estado === "vigente",
    gestoraNombre: f.gestora_nombre ?? "otra tienda",
    ubicacionId: f.ubicacion_id,
    ubicacionNombre: f.ubicacion_nombre,
    unidades: Number(f.unidades),
    total: Number(f.total),
    pagado: Number(f.pagado),
    saldo: Number(f.saldo),
    parteNueva: !!f.parte_nueva,
  };
}

/** Las que todavía hay que pagar (Por pagar). */
export function partesPorPagar(partes: readonly ParteDeCompra[]): ParteDeCompra[] {
  return partes.filter((p) => p.vigente && p.saldo > 0);
}

/**
 * La parte con la forma de un comprobante, para reusar el modal de pago tal cual: el saldo y el total son los de MI tienda
 * (el modal no deja pagar más que eso) y el pago va con `p_ubicacion_id` = mi tienda. Los campos que el modal no usa
 * quedan en valores neutros: esto NO es el comprobante, y no debe pintarse como tal en ningún otro lado.
 */
export function compraParaPagarMiParte(p: ParteDeCompra): CompraResumen {
  return {
    id: p.compraId,
    proveedorId: p.proveedorId,
    proveedorNombre: p.proveedorNombre,
    proveedorRuc: null,
    tipo: p.tipo,
    documento: `${p.documento} · parte de ${p.ubicacionNombre}`,
    fechaEmision: p.fechaEmision,
    condicion: "credito",
    fechaVencimiento: p.fechaVencimiento,
    ubicacionesDestino: [p.ubicacionId],
    subtotal: p.total,
    igv: 0,
    total: p.total,
    pagado: p.pagado,
    saldo: p.saldo,
    estado: p.vigente ? "vigente" : "anulada",
    estadoPago: p.saldo <= 0 ? "pagada" : p.pagado > 0 ? "parcial" : "pendiente",
    facturadoCantidad: p.unidades,
    recibidoCantidad: 0,
    estadoRecepcion: "sin_recibir",
    vencida: false,
    fechaEstimadaLlegada: null,
    recepcionAtrasada: false,
    notasCredito: 0,
    cerradoCantidad: 0,
    nota: null,
    creadoEn: p.fechaEmision,
  } as CompraResumen;
}

/** Detalle de `fn_mi_parte_de_compra(compra)`. */
export type DetalleMiParte = {
  compra: {
    id: string;
    documento: string;
    tipo: TipoDocumentoCompra;
    fechaEmision: string;
    fechaVencimiento: string | null;
    vigente: boolean;
    proveedorId: string;
    proveedorNombre: string;
    gestoraNombre: string;
  };
  partes: { ubicacionId: string; ubicacionNombre: string; unidades: number; subtotal: number; igv: number; total: number; pagado: number; saldo: number }[];
  lineas: { ubicacionId: string; referencia: string; talla: string | null; color: string | null; descripcion: string | null; costoUnitario: number; cantidad: number; subtotal: number }[];
  pagos: { id: string; fecha: string; monto: number; metodo: string; referencia: string | null; ubicacionId: string }[];
};

type JsonDetalle = {
  compra: Record<string, unknown>;
  partes: Record<string, unknown>[];
  lineas: Record<string, unknown>[];
  pagos: Record<string, unknown>[];
};

const texto = (v: unknown) => (v == null ? null : String(v));

export function detalleMiParteDeJson(j: JsonDetalle): DetalleMiParte {
  const c = j.compra;
  const tipo = String(c.tipo ?? "factura");
  return {
    compra: {
      id: String(c.id),
      documento: texto(c.documento) ?? "—",
      tipo: (TIPOS as readonly string[]).includes(tipo) ? (tipo as TipoDocumentoCompra) : "factura",
      fechaEmision: String(c.fecha_emision),
      fechaVencimiento: texto(c.fecha_vencimiento),
      vigente: c.estado === "vigente",
      proveedorId: String(c.proveedor_id),
      proveedorNombre: String(c.proveedor_nombre ?? ""),
      gestoraNombre: texto(c.gestora_nombre) ?? "otra tienda",
    },
    partes: (j.partes ?? []).map((p) => ({
      ubicacionId: String(p.ubicacion_id),
      ubicacionNombre: String(p.ubicacion_nombre),
      unidades: Number(p.unidades),
      subtotal: Number(p.subtotal),
      igv: Number(p.igv),
      total: Number(p.total),
      pagado: Number(p.pagado),
      saldo: Number(p.saldo),
    })),
    lineas: (j.lineas ?? []).map((l) => ({
      ubicacionId: String(l.ubicacion_id),
      referencia: String(l.referencia ?? ""),
      talla: texto(l.talla),
      color: texto(l.color),
      descripcion: texto(l.descripcion),
      costoUnitario: Number(l.costo_unitario),
      cantidad: Number(l.cantidad),
      subtotal: Number(l.subtotal),
    })),
    pagos: (j.pagos ?? []).map((p) => ({
      id: String(p.id),
      fecha: String(p.fecha),
      monto: Number(p.monto),
      metodo: String(p.metodo),
      referencia: texto(p.referencia),
      ubicacionId: String(p.ubicacion_id),
    })),
  };
}

/** Una parte del detalle como `ParteDeCompra`, para el botón de pagar de la pantalla de detalle. */
export function parteDelDetalle(d: DetalleMiParte, i: number): ParteDeCompra {
  const p = d.partes[i];
  return {
    compraId: d.compra.id,
    documento: d.compra.documento,
    tipo: d.compra.tipo,
    proveedorId: d.compra.proveedorId,
    proveedorNombre: d.compra.proveedorNombre,
    fechaEmision: d.compra.fechaEmision,
    fechaVencimiento: d.compra.fechaVencimiento,
    vigente: d.compra.vigente,
    gestoraNombre: d.compra.gestoraNombre,
    ubicacionId: p.ubicacionId,
    ubicacionNombre: p.ubicacionNombre,
    unidades: p.unidades,
    total: p.total,
    pagado: p.pagado,
    saldo: p.saldo,
    parteNueva: false,
  };
}

// ---------- ADR-0187: Por pagar muestra la parte de MI tienda en los comprobantes que gestiono ----------

/** Una fila de `fn_deuda_visible(p_ids)`: lo que debe quien consulta en ese comprobante (montos como texto o número). */
export type FilaDeudaVisible = { compra_id: string; total: number | string; pagado: number | string; saldo: number | string; gestionada: boolean };

/**
 * Las filas de Por pagar con los montos de MI parte (quien no es líder). La factura que gestiona mi tienda llega de la base
 * entera; aquí `total`, `pagado` y `saldo` pasan a ser los de mis tiendas —el pago se llena y se topa con ESO, que es lo único
 * que la base me deja pagar— y `totalComprobante` guarda el total del papel para decir «tu parte de…». Un comprobante en el
 * que mi tienda ya pagó lo suyo (aunque la otra no) sale de la lista: ya no le debo nada.
 */
export function conMiParte(filas: readonly CompraResumen[], deuda: readonly FilaDeudaVisible[]): CompraResumen[] {
  const porId = new Map(deuda.map((d) => [d.compra_id, d]));
  const salida: CompraResumen[] = [];
  for (const f of filas) {
    const d = porId.get(f.id);
    if (!d) continue;
    const total = Number(d.total);
    const pagado = Number(d.pagado);
    const saldo = Number(d.saldo);
    // Solo se marca como parte cuando de verdad es una parte: una factura toda para mi tienda se ve como siempre.
    const esParte = Math.abs(total - f.total) > 0.005;
    salida.push({
      ...f,
      total,
      pagado,
      saldo,
      estadoPago: saldo <= 0 ? "pagada" : pagado > 0 ? "parcial" : "pendiente",
      ...(esParte ? { totalComprobante: f.total } : {}),
    });
  }
  return salida;
}
