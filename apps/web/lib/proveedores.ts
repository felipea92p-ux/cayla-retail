import { createClient } from "@/lib/supabase/server";
import { exigir, exigirOpcional } from "@/lib/resultado";

// Lectura pura (principio del repo: lib/ nunca escribe). Alta, edición y archivo
// pasan por las RPC directo desde el componente cliente (registrar_proveedor /
// actualizar_proveedor / archivar_proveedor,
// 20260914150000_proveedores_administrables.sql).
export type Proveedor = {
  id: string;
  nombre: string;
  ruc: string | null;
  contacto: string | null;
  activo: boolean;
  /**
   * Lo financiero (facturas, total_facturado, saldo, ultima_compra,
   * facturas_vencidas, facturas_recibidas_completas,
   * facturas_con_recepcion_pendiente) llega `null` si quien pregunta no es
   * líder — corrección de D-27, 2026-09-17
   * (20260917240000_proveedores_lista_indicadores_y_candado_sede.sql). No es
   * "todavía no se cargó": es que a esta persona no le corresponde verlo. El
   * directorio (nombre/ruc/contacto/rubro/plazo/forma de pago) sí es para
   * cualquiera con cuenta.
   */
  facturas: number | null;
  total_facturado: number | null;
  saldo: number | null;
  ultima_compra: string | null;
  facturas_vencidas: number | null;
  facturas_recibidas_completas: number | null;
  facturas_con_recepcion_pendiente: number | null;
  /** Rubro (tela, avíos, prenda terminada, servicios...), texto libre. */
  rubro: string | null;
  plazo_credito_dias: number | null;
  forma_pago_preferida: string | null;
};

export async function getProveedores(): Promise<Proveedor[]> {
  const supabase = await createClient();
  const res = await supabase.rpc("fn_proveedores");
  // `saldo`/`total_facturado` llegan como texto (numeric de Postgres viaja
  // como string por JSON) — se normalizan acá, preservando `null` tal cual
  // (Number(null) da 0, que acá significaría "sin deuda" en vez de "no te
  // corresponde verlo": son cosas distintas, no se pueden confundir).
  return (
    exigir(res, "el directorio de proveedores") as unknown as Array<Omit<Proveedor, "saldo" | "total_facturado"> & { saldo: string | number | null; total_facturado: string | number | null }>
  ).map((p) => ({
    ...p,
    saldo: p.saldo == null ? null : Number(p.saldo),
    total_facturado: p.total_facturado == null ? null : Number(p.total_facturado),
  }));
}

// Ficha de un proveedor (pantalla de detalle,
// 20260917220000_proveedores_rubro_plazo_forma_pago.sql). Consulta directa
// —no RPC—: no agrega nada por encima de la tabla, mismo estilo que
// `getProveedoresActivos()` en compras.ts. `null` si no existe: la página
// hace `notFound()`, no es un error de lectura.
export type ProveedorFicha = {
  id: string;
  nombre: string;
  ruc: string | null;
  contacto: string | null;
  activo: boolean;
  rubro: string | null;
  plazo_credito_dias: number | null;
  forma_pago_preferida: string | null;
};

export async function getProveedor(id: string): Promise<ProveedorFicha | null> {
  const supabase = await createClient();
  return exigirOpcional(
    await supabase
      .from("proveedores")
      .select("id, nombre, ruc, contacto, activo, rubro, plazo_credito_dias, forma_pago_preferida")
      .eq("id", id)
      .maybeSingle(),
    "la ficha del proveedor"
  );
}

// Prenda terminada, vía `compras` (fn_proveedor_metricas_compras,
// 20260917230000_proveedor_metricas_compras_e_insumos.sql). Nunca se suma con
// MetricasInsumos en la pantalla — son negocios distintos aunque compartan
// la misma ficha de proveedor (decisión de Felipe, ver la migración).
export type MetricasCompras = {
  facturas_vigentes: number;
  total_facturado: number;
  saldo: number;
  ultima_compra: string | null;
  facturas_vencidas: number;
  facturas_recibidas_completas: number;
  facturas_con_recepcion_pendiente: number;
};

export async function getProveedorMetricasCompras(id: string): Promise<MetricasCompras> {
  const supabase = await createClient();
  const res = await supabase.rpc("fn_proveedor_metricas_compras", { p_proveedor_id: id });
  // La función devuelve una sola fila (son agregados sin GROUP BY), pero
  // PostgREST igual la entrega como lista de 1 — de ahí el `[0]`. Sus
  // `numeric` viajan como texto, igual que `saldo` en fn_proveedores().
  const fila = exigir(res, "las métricas de compras del proveedor")[0] as unknown as Omit<MetricasCompras, "total_facturado" | "saldo"> & {
    total_facturado: string | number;
    saldo: string | number;
  };
  return { ...fila, total_facturado: Number(fila.total_facturado), saldo: Number(fila.saldo) };
}

// Insumos del Taller (tela/avíos), vía `insumo_lotes`
// (fn_proveedor_metricas_insumos). Hoy `insumo_lotes` está vacía en toda la
// base: ceros esperados, no un bug de esta pantalla.
export type MetricasInsumos = {
  lotes: number;
  total_comprado: number;
  ultima_entrega: string | null;
};

export async function getProveedorMetricasInsumos(id: string): Promise<MetricasInsumos> {
  const supabase = await createClient();
  const res = await supabase.rpc("fn_proveedor_metricas_insumos", { p_proveedor_id: id });
  const fila = exigir(res, "las métricas de insumos del proveedor")[0] as unknown as Omit<MetricasInsumos, "total_comprado"> & {
    total_comprado: string | number;
  };
  return { ...fila, total_comprado: Number(fila.total_comprado) };
}
