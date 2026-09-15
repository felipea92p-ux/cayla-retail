import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";

// Tanda 3 del diagnóstico de Venta y Caja (2026-09-15): `retail.codigos_descuento`
// (20260914215103_codigos_descuento.sql) se administraba en Studio — un Líder no
// tenía ninguna pantalla para crear, apagar o ver la vigencia de un código, aunque
// la RPC `registrar_venta` ya sabe validarlos (20260914215103) desde el mismo día
// que se creó la tabla.
export type CodigoDescuento = {
  codigo: string;
  porcentaje: number;
  vigenteDesde: string | null;
  vigenteHasta: string | null;
  activo: boolean;
  ubicacionId: string | null;
  ubicacionNombre: string | null;
  createdAt: string;
};

export async function getCodigosDescuento(): Promise<CodigoDescuento[]> {
  const supabase = await createClient();
  const filas = exigir(
    await supabase
      .from("codigos_descuento")
      .select("codigo, porcentaje, vigente_desde, vigente_hasta, activo, ubicacion_id, created_at, ubicacion:ubicaciones ( nombre )")
      .order("created_at", { ascending: false }),
    "los códigos de descuento"
  );
  return filas.map((f) => ({
    codigo: f.codigo,
    porcentaje: Number(f.porcentaje),
    vigenteDesde: f.vigente_desde,
    vigenteHasta: f.vigente_hasta,
    activo: f.activo,
    ubicacionId: f.ubicacion_id,
    ubicacionNombre: f.ubicacion?.nombre ?? null,
    createdAt: f.created_at,
  }));
}
