"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { VarianteInteligente } from "@/lib/inteligencia";

// "Reponer ya" accionable (decisión con Felipe, 2026-09-08): no se automatiza al
// estilo Shein — el líder decide entre mandar una orden borrador al Taller o
// posponer la alerta 7 días. Tres estados visuales, nunca más de uno a la vez:
//   rojo  = alerta activa, sin resolver
//   ámbar = ya tiene una orden borrador en camino, o está pospuesta a propósito
//   nada  = no hace falta reponer
export function AlertaReposicion({ variante: v, esLider }: { variante: VarianteInteligente; esLider: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function llamar(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setOcupado(true);
    setError(null);
    const { error } = await fn();
    setOcupado(false);
    if (error) { setError(error.message); return; }
    router.refresh();
  }

  async function mandarOrden() {
    const supabase = createClient();
    const { data: taller, error: errSede } = await supabase.from("sedes").select("id").eq("codigo", "TALLER").single();
    if (errSede || !taller?.id) { setError("No se encontró la sede del Taller."); return; }
    const tallerId = taller.id;

    const cantidad = Math.max(1, Math.ceil(v.reorderPoint - v.stockTotal));
    await llamar(() =>
      supabase.rpc("registrar_produccion", {
        p_unidad_id: tallerId,
        p_cantidad: cantidad,
        p_costo_tela: 0,
        p_costo_avios: 0,
        p_costo_maquila: 0,
        p_precio_taller: 0,
        p_variantes: [{ talla: v.talla, color: v.color, cantidad }],
        p_producto_id: v.productoId,
        p_marcar_terminado: false,
        p_nota: `Borrador desde alerta de reposición (${v.stockTotal} vs. reorden ${v.reorderPoint})`,
      })
    );
  }

  async function anular() {
    if (!v.produccionAbiertaId) return;
    if (!window.confirm("¿Anular esta orden borrador? Todavía no tocó el inventario, así que no deja rastro.")) return;
    await llamar(() => createClient().rpc("eliminar_produccion", { p_produccion_id: v.produccionAbiertaId! }));
  }

  async function ignorar() {
    await llamar(() => createClient().rpc("silenciar_alerta_reposicion", { p_variante_id: v.varianteId, p_dias: 7 }));
  }

  const chipCls = "label-cayla shrink-0 border px-2 py-1 text-[8px]";
  const botonCls =
    "label-cayla shrink-0 border border-tinta/20 px-2 py-1 text-[8px] text-tinta/70 transition-colors hover:border-rojo hover:text-rojo disabled:opacity-40";

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {v.produccionAbiertaId ? (
        <>
          <span className={`${chipCls} border-ambar/40 bg-ambar/10 text-ambar`}>En producción</span>
          {esLider && (
            <button onClick={anular} disabled={ocupado} className={botonCls}>
              Anular
            </button>
          )}
        </>
      ) : v.silenciadaHasta ? (
        <span className={`${chipCls} border-ambar/30 text-ambar/80`}>
          Pospuesta hasta {new Date(v.silenciadaHasta).toLocaleDateString("es-PE", { day: "2-digit", month: "short" })}
        </span>
      ) : v.reponerYa ? (
        <>
          <span className={`${chipCls} border-rojo/40 bg-rojo/10 text-rojo`}>Reponer ya</span>
          {esLider && (
            <>
              <button onClick={mandarOrden} disabled={ocupado} className={botonCls}>
                Mandar orden
              </button>
              <button onClick={ignorar} disabled={ocupado} className={botonCls}>
                Ignorar
              </button>
            </>
          )}
        </>
      ) : null}
      {error && <span className="text-[10px] text-rojo">{error}</span>}
    </span>
  );
}
