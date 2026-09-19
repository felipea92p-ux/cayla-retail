import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import type { TarjetaSede } from "@/lib/gastos-reglas";

// Lectura de los gastos (ADR-0117; contrato en `20260918193000_gastos.sql`). Solo LEE: escribir
// es de `registrar_gasto`, `anular_gasto` y `marcar_egreso_no_gasto`, que se llaman desde los
// modales. Las sumas se hacen en Postgres, nunca aquí. Los `numeric` viajan como texto por JSON:
// se normalizan una sola vez en este archivo para que las pantallas reciban `number`.

const n = (v: unknown): number => (v == null ? 0 : Number(v));

export type CategoriaGasto = { codigo: string; nombre: string };

export async function getCategoriasGasto(): Promise<CategoriaGasto[]> {
  const supabase = await createClient();
  return exigir(
    await supabase.from("categorias_gasto").select("codigo, nombre").eq("activo", true).order("orden"),
    "las categorías de gasto",
  );
}

/** Una tarjeta por sede activa (aunque esté en cero) más «De la empresa». Los anulados no suman. */
export async function getResumenGastos(desde: string, hasta: string): Promise<TarjetaSede[]> {
  const supabase = await createClient();
  const filas = exigir(await supabase.rpc("fn_egresos_resumen", { p_desde: desde, p_hasta: hasta }), "el resumen de gastos");
  return filas.map((r) => ({
    ubicacionId: (r.ubicacion_id as string | null) ?? null,
    nombre: r.nombre,
    total: n(r.total),
    nGastos: n(r.n_gastos),
    igv: n(r.igv),
    porCategoria: ((r.por_categoria as { categoria: string; nombre: string; monto: number | string }[] | null) ?? []).map((c) => ({
      categoria: c.categoria,
      nombre: c.nombre,
      monto: n(c.monto),
    })),
  }));
}

export type EgresoSinClasificar = {
  id: string;
  cajaId: string;
  ubicacionId: string;
  ubicacionNombre: string;
  monto: number;
  motivo: string;
  nota: string | null;
  esAjuste: boolean;
  registradoPor: string | null;
  registradoPorNombre: string | null;
  /** Instante en que se registró el egreso (ISO); la pantalla lo muestra en hora de Lima. */
  creadoEn: string;
};

export type SinClasificar = { egresos: EgresoSinClasificar[]; total: number };

/** Los egresos de caja que todavía nadie dijo si son gasto. `total` es el conteo completo aunque la lista se recorte. */
export async function getEgresosSinClasificar(limite = 100): Promise<SinClasificar> {
  const supabase = await createClient();
  const filas = exigir(await supabase.rpc("fn_egresos_sin_clasificar", { p_limite: limite }), "los egresos sin clasificar");
  const nombres = await nombresDePersonas(filas.map((f) => f.registrado_por as string | null));
  return {
    total: filas.length ? n(filas[0].total) : 0,
    egresos: filas.map((f) => ({
      id: f.id,
      cajaId: f.caja_id,
      ubicacionId: f.ubicacion_id,
      ubicacionNombre: f.ubicacion_nombre,
      monto: n(f.monto),
      motivo: f.motivo,
      nota: (f.nota as string | null) ?? null,
      esAjuste: !!f.es_ajuste,
      registradoPor: (f.registrado_por as string | null) ?? null,
      registradoPorNombre: nombres.get((f.registrado_por as string | null) ?? "") ?? null,
      creadoEn: f.creado_en,
    })),
  };
}

export type EgresoNoGasto = {
  /** Id de la MARCA (lo que se revierte), no del movimiento de caja. */
  id: string;
  ubicacionNombre: string;
  monto: number;
  motivoEgreso: string;
  /** Lo que dijo quien lo marcó: «Depósito al banco», «Retiro del dueño»… */
  motivo: string;
  marcadoPorNombre: string | null;
  marcadoEn: string;
};

/** Egresos que alguien marcó «no es gasto» y siguen marcados: el único camino para revertir una marca equivocada. */
export async function getEgresosNoGasto(limite = 100): Promise<{ marcas: EgresoNoGasto[]; total: number }> {
  const supabase = await createClient();
  const filas = exigir(await supabase.rpc("fn_egresos_no_gasto_lista", { p_limite: limite }), "los egresos marcados como «no es gasto»");
  const nombres = await nombresDePersonas(filas.map((f) => f.revisado_por as string | null));
  return {
    total: filas.length ? n(filas[0].total) : 0,
    marcas: filas.map((f) => ({
      id: f.id,
      ubicacionNombre: f.ubicacion_nombre,
      monto: n(f.monto),
      motivoEgreso: f.motivo_egreso,
      motivo: f.motivo,
      marcadoPorNombre: nombres.get((f.revisado_por as string | null) ?? "") ?? null,
      marcadoEn: f.revisado_en,
    })),
  };
}

export type GastoFila = {
  id: string;
  ubicacionId: string | null;
  /** `null` = «De la empresa». */
  ubicacionNombre: string | null;
  categoria: string;
  categoriaNombre: string;
  descripcion: string;
  fecha: string;
  montoTotal: number;
  igv: number;
  comprobanteTipo: string;
  comprobanteNumero: string | null;
  proveedorNombre: string | null;
  medioPago: string;
  conEgresoDeCaja: boolean;
  estado: "vigente" | "anulado";
  motivoAnulacion: string | null;
  registradoPorNombre: string | null;
};

/** Gastos del rango, vigentes y anulados (para poder auditar). Máx. `limite` filas. */
export async function getGastos(desde: string, hasta: string, limite = 200): Promise<GastoFila[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase.rpc("fn_gastos_lista", { p_desde: desde, p_hasta: hasta, p_limite: limite }),
    "la lista de gastos",
  );
  const nombres = await nombresDePersonas(filas.map((f) => f.registrado_por as string | null));
  return filas.map((f) => ({
    id: f.id,
    ubicacionId: (f.ubicacion_id as string | null) ?? null,
    ubicacionNombre: (f.ubicacion_nombre as string | null) ?? null,
    categoria: f.categoria,
    categoriaNombre: f.categoria_nombre,
    descripcion: f.descripcion,
    fecha: f.fecha,
    montoTotal: n(f.monto_total),
    igv: n(f.igv),
    comprobanteTipo: f.comprobante_tipo,
    comprobanteNumero: (f.comprobante_numero as string | null) ?? null,
    proveedorNombre: (f.proveedor_nombre as string | null) ?? null,
    medioPago: f.medio_pago,
    conEgresoDeCaja: !!f.caja_movimiento_id,
    estado: f.estado === "anulado" ? "anulado" : "vigente",
    motivoAnulacion: (f.motivo_anulacion as string | null) ?? null,
    registradoPorNombre: nombres.get((f.registrado_por as string | null) ?? "") ?? null,
  }));
}

export type CajaAbiertaGasto = { id: string; ubicacionId: string; ubicacionNombre: string };

/** Cajas abiertas ahora mismo en cualquier sede: de ellas puede salir el efectivo de un gasto (camino B). */
export async function getCajasAbiertas(): Promise<CajaAbiertaGasto[]> {
  const supabase = await createClient();
  const cajas = exigir(await supabase.from("cajas").select("id, ubicacion_id").eq("estado", "abierta"), "las cajas abiertas");
  if (cajas.length === 0) return [];
  const ubic = exigir(
    await supabase.from("ubicaciones").select("id, nombre").in("id", cajas.map((c) => c.ubicacion_id)),
    "las sedes de las cajas abiertas",
  );
  const nombre = new Map(ubic.map((u) => [u.id, u.nombre]));
  return cajas.map((c) => ({ id: c.id, ubicacionId: c.ubicacion_id, ubicacionNombre: nombre.get(c.ubicacion_id) ?? "Sede" })).sort((a, b) => a.ubicacionNombre.localeCompare(b.ubicacionNombre));
}

/** `personas` vive en Dynamic: PostgREST no embebe entre schemas, así que se resuelve aparte, en lote. */
async function nombresDePersonas(ids: (string | null)[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  if (unicos.length === 0) return new Map();
  const supabase = await createClient();
  const filas = exigir(await supabase.rpc("fn_nombres_personas", { p_ids: unicos }), "quién registró los gastos");
  return new Map(filas.map((f) => [f.id as string, f.nombre as string]));
}
