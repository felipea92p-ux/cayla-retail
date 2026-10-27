import { createClient } from "@/lib/supabase/server";
import { opcional } from "@/lib/resultado";
import type { InsumoDelTaller } from "@/lib/orden-tela-reglas";

// La PUERTA de la ficha de consumo en Editar producto (ADR-0513, actividad 6): lo que la hoja necesita y la pantalla no tiene a mano. La ficha misma la lee la hoja al abrirse
// (`fn_ficha_consumo`); aquí solo se busca el Taller (la base decide a quién se la muestra) y los avíos del estante para elegir. Es dato SECUNDARIO: si algo no se lee, la tarjeta no se
// dibuja o la hoja se abre en lectura. Nunca rompe Editar producto.

export type PuertaDeLaFicha = { tallerId: string; tallerNombre: string; insumos: InsumoDelTaller[] };

type FilaInsumo = { id: string; nombre: string; tipo: string; unidad_medida: string; merma_pct: number | string | null };

export async function getPuertaDeLaFicha(): Promise<PuertaDeLaFicha | null> {
  return opcional(
    (async () => {
      const supabase = await createClient();
      const { data: talleres, error } = await supabase.from("ubicaciones").select("id, nombre").eq("tipo", "taller").eq("activo", true).order("nombre").limit(1);
      const taller = error ? null : (talleres ?? [])[0];
      if (!taller) return null;
      // Los avíos y telas sin archivar (la hoja elige avíos). Si la cuenta no los puede leer, la lista queda vacía y la hoja solo lee.
      const { data: filas } = await (supabase.from("insumos") as unknown as {
        select: (c: string) => { is: (col: string, v: null) => { order: (c: string) => PromiseLike<{ data: FilaInsumo[] | null }> } };
      })
        .select("id, nombre, tipo, unidad_medida, merma_pct")
        .is("archivado_at", null)
        .order("nombre");
      const insumos = (filas ?? []).map<InsumoDelTaller>((i) => ({
        id: i.id,
        nombre: i.nombre,
        tipo: i.tipo === "avio" ? "avio" : "tela",
        unidad: i.unidad_medida,
        tejidoId: null,
        colorCodigo: null,
        saldo: 0,
        mermaPct: Number(i.merma_pct ?? 0),
        archivado: false,
      }));
      return { tallerId: taller.id, tallerNombre: taller.nombre, insumos };
    })(),
    "la puerta de la ficha de consumo"
  );
}
