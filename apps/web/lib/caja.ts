import { createClient } from "@/lib/supabase/server";
import { exigirOpcional, exigir } from "@/lib/resultado";

// Caja/POS V2 (2026-09-12) — ver supabase/migrations/0008_caja_y_pagos.sql.
// `resumen` se calcula acá con las MISMAS reglas que cerrar_caja() en SQL
// (apertura + ventas en efectivo + ingresos − egresos): es lo que la
// Encargada ve ANTES de cerrar, para que el número de cierre no la
// sorprenda. Si algún día cambia la fórmula del cuadre, cambia en los dos
// lugares — están separados porque uno es "vista previa" (puede leerse
// cien veces sin efecto) y el otro es la escritura real que congela el
// cierre; unificarlos exigiría que la vista previa mutara algo, que es
// justo lo que no debe hacer.
export type CajaAbierta = {
  id: string;
  ubicacionId: string;
  montoApertura: number;
  abiertaEn: string;
  abiertaPorNombre: string | null;
};

export type ResumenCaja = {
  ventasEfectivo: number;
  ventasOtros: number;
  ingresos: number;
  egresos: number;
  esperadoEnCajon: number;
};

export type MovimientoCaja = {
  id: string;
  tipo: "ingreso" | "egreso";
  monto: number;
  motivo: string;
  creadoEn: string;
};

export async function getCajaAbierta(ubicacionId: string): Promise<CajaAbierta | null> {
  const supabase = await createClient();
  const res = await supabase
    .from("cajas")
    .select("id, ubicacion_id, monto_apertura, abierta_en, abierta_por")
    .eq("ubicacion_id", ubicacionId)
    .eq("estado", "abierta")
    .maybeSingle();
  const fila = exigirOpcional(res, "la caja abierta de esta ubicación");
  if (!fila) return null;

  // `abierta_por` referencia public.personas (Dynamic) — PostgREST no
  // embebe entre schemas, así que se resuelve aparte, en lote (ver
  // fn_nombres_personas en 0009_integracion_dynamic.sql).
  let abiertaPorNombre: string | null = null;
  if (fila.abierta_por) {
    const nombres = exigir(
      await supabase.rpc("fn_nombres_personas", { p_ids: [fila.abierta_por] }),
      "quién abrió esta caja"
    );
    abiertaPorNombre = nombres[0]?.nombre ?? null;
  }

  return {
    id: fila.id,
    ubicacionId: fila.ubicacion_id,
    montoApertura: Number(fila.monto_apertura),
    abiertaEn: fila.abierta_en,
    abiertaPorNombre,
  };
}

export async function getResumenCaja(cajaId: string, montoApertura: number): Promise<ResumenCaja> {
  const supabase = await createClient();
  const [ventasRes, movimientos] = await Promise.all([
    supabase.from("ventas").select("id").eq("caja_id", cajaId),
    supabase.from("caja_movimientos").select("tipo, monto").eq("caja_id", cajaId),
  ]);
  const ventaIds = exigir(ventasRes, "las ventas de esta caja").map((v) => v.id);
  const filasPagos =
    ventaIds.length === 0
      ? []
      : exigir(
          await supabase.from("venta_pagos").select("metodo, monto").in("venta_id", ventaIds),
          "los pagos de esta caja"
        );
  const filasMovs = exigir(movimientos, "los movimientos de esta caja");

  const ventasEfectivo = filasPagos.filter((p) => p.metodo === "efectivo").reduce((a, p) => a + Number(p.monto), 0);
  const ventasOtros = filasPagos.filter((p) => p.metodo !== "efectivo").reduce((a, p) => a + Number(p.monto), 0);
  const ingresos = filasMovs.filter((m) => m.tipo === "ingreso").reduce((a, m) => a + Number(m.monto), 0);
  const egresos = filasMovs.filter((m) => m.tipo === "egreso").reduce((a, m) => a + Number(m.monto), 0);

  return {
    ventasEfectivo,
    ventasOtros,
    ingresos,
    egresos,
    esperadoEnCajon: montoApertura + ventasEfectivo + ingresos - egresos,
  };
}

export async function getMovimientosCaja(cajaId: string): Promise<MovimientoCaja[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase
      .from("caja_movimientos")
      .select("id, tipo, monto, motivo, created_at")
      .eq("caja_id", cajaId)
      .order("created_at", { ascending: false }),
    "los movimientos de caja"
  );
  return filas.map((m) => ({
    id: m.id,
    tipo: m.tipo as "ingreso" | "egreso",
    monto: Number(m.monto),
    motivo: m.motivo,
    creadoEn: m.created_at,
  }));
}
