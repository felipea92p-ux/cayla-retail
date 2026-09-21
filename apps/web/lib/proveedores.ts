import { createClient } from "@/lib/supabase/server";
import { exigir, exigirOpcional } from "@/lib/resultado";
import { hoyLima } from "@/lib/fechas-lima";
import { marcasPorProveedor, serie12Meses, type MarcasDeProveedor } from "@/lib/proveedores-reglas";

// Lectura pura (principio del repo: lib/ nunca escribe). Alta, edición y archivo
// pasan por las RPC directo desde el componente cliente (registrar_proveedor /
// actualizar_proveedor / archivar_proveedor,
// 20260914150000_proveedores_administrables.sql).
export type Proveedor = {
  id: string;
  nombre: string;
  ruc: string | null;
  contacto: string | null;
  /** El WhatsApp por el que se pacta el fardo. Desde ADR-0134 ya NO es el Yape: ese es `celular_billetera`. */
  telefono: string | null;
  banco: string | null;
  /** Número de cuenta del banco (texto libre). El interbancario vive en `cci` (ADR-0134). */
  cuenta_bancaria: string | null;
  /** Código de Cuenta Interbancario: 20 dígitos, solo números (ADR-0134). */
  cci: string | null;
  /** El celular al que se yapea/plinea (9 dígitos, sin +51). NO es `telefono`, que es el WhatsApp. */
  celular_billetera: string | null;
  /** Qué app tiene ese celular: `yape`, `plin` o ambas. `null` si no hay billetera. */
  billeteras: string[] | null;
  /** El nombre que muestra el banco/Yape al pagar; quien paga lo compara antes de confirmar. */
  titular_cuenta: string | null;
  activo: boolean;
  /**
   * Lo financiero (facturas, total_facturado, saldo, ultima_compra,
   * facturas_vencidas, facturas_recibidas_completas,
   * facturas_con_recepcion_pendiente, facturas_atrasadas, y desde ADR-0111
   * facturado_12m, saldo_vencido, dias_desde_ultima_compra, entregas_por_recibir)
   * llega `null` si quien pregunta no es líder — corrección de D-27, 2026-09-17
   * (20260917240000_proveedores_lista_indicadores_y_candado_sede.sql). No es
   * "todavía no se cargó": es que a esta persona no le corresponde verlo. El
   * directorio (nombre/ruc/contacto/telefono/banco/cuenta/rubro/plazo/forma
   * de pago) sí es para cualquiera con cuenta.
   */
  facturas: number | null;
  total_facturado: number | null;
  saldo: number | null;
  ultima_compra: string | null;
  facturas_vencidas: number | null;
  facturas_recibidas_completas: number | null;
  facturas_con_recepcion_pendiente: number | null;
  facturas_atrasadas: number | null;
  /** Rubro (tela, avíos, prenda terminada, servicios...), texto libre. */
  rubro: string | null;
  plazo_credito_dias: number | null;
  forma_pago_preferida: string | null;
  /** Facturado en los últimos 12 meses (la lista dejó de mostrar «desde siempre»). */
  facturado_12m: number | null;
  /** Lo que ya venció y sigue sin pagarse. */
  saldo_vencido: number | null;
  dias_desde_ultima_compra: number | null;
  /** Comprobantes vigentes con mercadería aún por llegar. */
  entregas_por_recibir: number | null;
  /** Lo que el proveedor le debe a CAYLA (nota de crédito que superó su deuda); se descuenta al pagar. `null` si no es líder. */
  saldo_favor: number | null;
};

export async function getProveedores(): Promise<Proveedor[]> {
  const supabase = await createClient();
  const filas = exigir(await supabase.rpc("fn_proveedores"), "el directorio de proveedores");
  // Los `numeric` de Postgres viajan como texto por JSON — se normalizan acá, preservando `null` tal
  // cual (Number(null) da 0, que acá significaría «sin deuda» en vez de «no te corresponde verlo»: son
  // cosas distintas, no se pueden confundir).
  const num = (v: number | string | null | undefined) => (v == null ? null : Number(v));
  return filas.map((p) => ({
    ...p,
    saldo: num(p.saldo),
    total_facturado: num(p.total_facturado),
    facturado_12m: num(p.facturado_12m),
    saldo_vencido: num(p.saldo_vencido),
    dias_desde_ultima_compra: num(p.dias_desde_ultima_compra),
    entregas_por_recibir: num(p.entregas_por_recibir),
    saldo_favor: num(p.saldo_favor),
  }));
}

// Lo facturado por proveedor y mes, últimos 12 meses (fn_proveedores_serie_12m, ADR-0128): la forma
// detrás de «Facturado 12 m». Devuelve, por id de proveedor, doce montos del mes más antiguo al actual;
// un proveedor sin compras en la ventana no aparece (quien la pinta lo trata como doce ceros).
//
// Es un ADORNO de la lista, no un dato del que dependa nada: si la función todavía no existe en la base
// (la migración 20260919150000 se pega en producción aparte del despliegue) o falla, devuelve `null` y
// la lista se pinta igual, sin tendencias — principio 9: una lectura secundaria nunca tumba la pantalla.
// A quien no es líder la base no le devuelve filas.
export async function getProveedoresSerie(): Promise<Record<string, number[]> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_proveedores_serie_12m");
  if (error) {
    console.error("[proveedores] no se pudo leer la serie mensual; la lista se muestra sin tendencias:", error.message);
    return null;
  }
  const porProveedor = new Map<string, { mes: string; monto: number }[]>();
  for (const f of data ?? []) {
    const filas = porProveedor.get(f.proveedor_id) ?? [];
    filas.push({ mes: f.mes, monto: Number(f.monto) });
    porProveedor.set(f.proveedor_id, filas);
  }
  const hoy = hoyLima();
  return Object.fromEntries([...porProveedor].map(([id, filas]) => [id, serie12Meses(filas, hoy)]));
}

// Las marcas con que se conoce a cada proveedor (ADR-0140): el nombre es la razón social, pero el equipo busca
// por «Kero», no por «Textil Ejemplo SAC». Devuelve, por id de proveedor, sus marcas activas. Lee las mismas dos
// tablas que el catálogo (`marcas` y `marca_proveedores`, abiertas a cualquiera con cuenta), sin RPC ni migración.
//
// Es un ADORNO de la lista, no un dato del que dependa nada: si la lectura falla devuelve `null` y la pantalla se
// pinta igual, sin marcas ni búsqueda por marca — principio 9: una lectura secundaria nunca tumba la pantalla.
// El tope por defecto de PostgREST (`max_rows` en supabase/config.toml).
const TOPE_FILAS = 1000;

export async function getMarcasPorProveedor(): Promise<MarcasDeProveedor | null> {
  const supabase = await createClient();
  const [resMarcas, resVinculos] = await Promise.all([supabase.from("marcas").select("id, nombre, activo"), supabase.from("marca_proveedores").select("marca_id, proveedor_id")]);
  if (resMarcas.error || resVinculos.error) {
    console.error("[proveedores] no se pudieron leer las marcas; la lista se muestra sin ellas:", (resMarcas.error ?? resVinculos.error)?.message);
    return null;
  }
  // PostgREST corta en silencio a TOPE_FILAS (200 OK, sin error): un mapa recortado se vería igual que uno completo y
  // algunos proveedores aparecerían «sin marcas». Es preferible degradar a `null` (que se nota) que mostrar a medias.
  if ((resMarcas.data?.length ?? 0) >= TOPE_FILAS || (resVinculos.data?.length ?? 0) >= TOPE_FILAS) {
    console.error(`[proveedores] las marcas llegaron al tope de ${TOPE_FILAS} filas; se muestra la lista sin ellas hasta paginar la lectura.`);
    return null;
  }
  return marcasPorProveedor(resMarcas.data ?? [], resVinculos.data ?? []);
}

// Las cifras de la cabecera de la lista (ADR-0111): activos, deuda total con proveedores,
// concentración (qué parte de la deuda está en un solo proveedor) y quiénes llevan más de 90 días
// sin comprar. Todo `null` para quien no es líder, salvo los conteos del directorio.
export type ResumenProveedores = {
  activos: number;
  desactivados: number;
  deudaTotal: number | null;
  conSaldo: number | null;
  conVencidas: number | null;
  topProveedorId: string | null;
  topProveedorNombre: string | null;
  topPct: number | null;
  top3Pct: number | null;
  sinCompras90d: number | null;
  /** Suma del saldo a favor de todos los proveedores y a cuántos les corresponde. */
  saldoFavorTotal: number | null;
  conSaldoFavor: number | null;
};

export async function getProveedoresResumen(): Promise<ResumenProveedores> {
  const supabase = await createClient();
  const filas = exigir(await supabase.rpc("fn_proveedores_resumen"), "el resumen de proveedores");
  const r = filas[0];
  if (!r) throw new Error("No se pudo leer el resumen de proveedores: la función no devolvió filas.");
  const num = (v: number | string | null | undefined) => (v == null ? null : Number(v));
  return {
    activos: Number(r.activos ?? 0),
    desactivados: Number(r.desactivados ?? 0),
    deudaTotal: num(r.deuda_total),
    conSaldo: num(r.con_saldo),
    conVencidas: num(r.con_vencidas),
    topProveedorId: r.top_proveedor_id,
    topProveedorNombre: r.top_proveedor_nombre,
    topPct: num(r.top_pct),
    top3Pct: num(r.top3_pct),
    sinCompras90d: num(r.sin_compras_90d),
    saldoFavorTotal: num(r.saldo_favor_total),
    conSaldoFavor: num(r.con_saldo_favor),
  };
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
  telefono: string | null;
  banco: string | null;
  cuenta_bancaria: string | null;
  cci: string | null;
  celular_billetera: string | null;
  billeteras: string[] | null;
  titular_cuenta: string | null;
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
      .select("id, nombre, ruc, contacto, telefono, banco, cuenta_bancaria, cci, celular_billetera, billeteras, titular_cuenta, activo, rubro, plazo_credito_dias, forma_pago_preferida")
      .eq("id", id)
      .maybeSingle(),
    "la ficha del proveedor"
  );
}

// Prenda terminada, vía `compras` (fn_proveedor_metricas_compras,
// 20260917230000_proveedor_metricas_compras_e_insumos.sql). Nunca se suma con
// MetricasInsumos en la pantalla — son negocios distintos aunque compartan
// la misma ficha de proveedor (decisión de Felipe, ver la migración).
//
// Los promedios llegan CON su muestra (ADR-0111): «11 días» de una sola entrega no es una tendencia, y
// la pantalla lo dice. `diasPagoRealPromedio` es `null` con menos de 2 comprobantes pagados por completo.
export type MetricasCompras = {
  facturas_vigentes: number;
  total_facturado: number;
  saldo: number;
  ultima_compra: string | null;
  facturas_vencidas: number;
  facturas_recibidas_completas: number;
  facturas_con_recepcion_pendiente: number;
  facturas_atrasadas: number;
  facturado_12m: number;
  monto_vencido: number;
  /** 0–100: de los comprobantes vigentes, cuántos llegaron completos. `null` sin comprobantes. */
  entregado_completo_pct: number | null;
  dias_entrega_promedio: number | null;
  dias_entrega_muestra: number;
  dias_pago_real_promedio: number | null;
  dias_pago_muestra: number;
};

export async function getProveedorMetricasCompras(id: string): Promise<MetricasCompras> {
  const supabase = await createClient();
  const res = await supabase.rpc("fn_proveedor_metricas_compras", { p_proveedor_id: id });
  // La función devuelve una sola fila (son agregados sin GROUP BY), pero PostgREST igual la entrega como
  // lista de 1 — de ahí el `[0]`. Sus `numeric` viajan como texto, igual que `saldo` en fn_proveedores().
  const f = exigir(res, "las métricas de compras del proveedor")[0];
  const n = (v: number | string | null | undefined) => (v == null ? null : Number(v));
  return {
    facturas_vigentes: Number(f.facturas_vigentes),
    total_facturado: Number(f.total_facturado),
    saldo: Number(f.saldo),
    ultima_compra: f.ultima_compra,
    facturas_vencidas: Number(f.facturas_vencidas),
    facturas_recibidas_completas: Number(f.facturas_recibidas_completas),
    facturas_con_recepcion_pendiente: Number(f.facturas_con_recepcion_pendiente),
    facturas_atrasadas: Number(f.facturas_atrasadas),
    facturado_12m: Number(f.facturado_12m),
    monto_vencido: Number(f.monto_vencido),
    entregado_completo_pct: n(f.entregado_completo_pct),
    dias_entrega_promedio: n(f.dias_entrega_promedio),
    dias_entrega_muestra: Number(f.dias_entrega_muestra ?? 0),
    dias_pago_real_promedio: n(f.dias_pago_real_promedio),
    dias_pago_muestra: Number(f.dias_pago_muestra ?? 0),
  };
}

// Lo que cobra ESTE proveedor por la prenda que más se le compra, compra a compra
// (fn_proveedor_costo_evolucion). Sale de `compra_items`, no de `costo_historial`: ése mezcla
// proveedores. `null` si nunca se le compró nada.
export type EvolucionCosto = { referencia: string; puntos: { fecha: string; documento: string; costo: number }[] };

export async function getProveedorCostoEvolucion(id: string): Promise<EvolucionCosto | null> {
  const supabase = await createClient();
  const filas = exigir(await supabase.rpc("fn_proveedor_costo_evolucion", { p_proveedor_id: id }), "la evolución del costo del proveedor");
  if (filas.length === 0) return null;
  return { referencia: filas[0].referencia, puntos: filas.map((f) => ({ fecha: f.fecha, documento: f.documento, costo: Number(f.costo_unitario) })) };
}

// Unidades devueltas a este proveedor desde cuarentena (ADR-0094).
export type DevolucionesProveedor = { unidades: number; ultima: string | null };

export async function getProveedorDevoluciones(id: string): Promise<DevolucionesProveedor> {
  const supabase = await createClient();
  const f = exigir(await supabase.rpc("fn_proveedor_devoluciones", { p_proveedor_id: id }), "las devoluciones al proveedor")[0];
  return { unidades: Number(f?.unidades ?? 0), ultima: f?.ultima ?? null };
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
