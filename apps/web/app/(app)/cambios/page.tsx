import { Banknote, CalendarDays, RefreshCw } from "lucide-react";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getVentasRecientes } from "@/lib/ventas-v2";
import { getCatalogo } from "@/lib/catalogo-v2";
import { getStockPorUbicacion } from "@/lib/inventario-v2";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getCajaAbierta } from "@/lib/caja";
import { agruparStockPorSede } from "@/lib/stock-por-sede";
import { getEstadisticasCambios, getTallasQueNoCalzan } from "@/lib/cambios-estadisticas";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { CambiosPanel } from "@/components/CambiosPanel";
import { ResumenSede } from "@/components/ui/ResumenSede";

// Cambio de talla/color (Prioridad 1, 2026-09-12; rediseño completo 2026-09-18). El
// modelo vive en supabase/migrations/0007_cambios.sql y
// 20260918150000_cambios_motivo_y_estado_de_prenda.sql; la pantalla, en CambiosPanel.
export default async function CambiosPage({ searchParams }: { searchParams: Promise<{ q?: string; todas?: string; item?: string }> }) {
  const persona = await requirePersonaActualV2();
  // `item`: llegar desde Devoluciones con «Cambiar por otra prenda» (R-37) abre el flujo
  // sobre esa prenda exacta.
  const { q, todas, item } = await searchParams;
  const esLider = persona.rol === "lider";
  // Solo un líder ve otras sedes (RLS de ventas): a una integrante, "todas" no le
  // traería nada y la pantalla mentiría diciendo "no encontramos".
  const todasLasSedes = esLider && todas === "1";
  const supabase = await createClient();
  // Mismas lecturas de stock que Vender (vender/page.tsx): el piso de ESTA ubicación
  // decide qué se puede entregar (`registrar_cambio` rechaza lo que no está), y
  // `fn_stock_por_sede` dice dónde más hay cuando aquí no queda la talla.
  const [lineas, catalogo, stock, resStockSedes, ubicaciones, estadisticas, tallasQueNoCalzan, caja] = await Promise.all([
    getVentasRecientes(persona.ubicacionId, { busqueda: q, todasLasSedes, ventaItemId: item }),
    getCatalogo(),
    getStockPorUbicacion(persona.ubicacionId),
    supabase.rpc("fn_stock_por_sede"),
    getUbicaciones(),
    getEstadisticasCambios(persona.ubicacionId),
    esLider ? getTallasQueNoCalzan() : Promise.resolve([]),
    getCajaAbierta(persona.ubicacionId),
  ]);
  const stockAquiPorVariante = new Map(stock.map((f) => [f.varianteId, f.piso ?? f.total]));
  const stockPorSede = agruparStockPorSede(exigir(resStockSedes, "el stock de las sedes"), ubicaciones, persona.ubicacionId);

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-x-10 gap-y-5">
        <div>
          <h1 className="font-display text-3xl text-tinta">Cambios</h1>
          <p className="mt-1.5 text-[15px] text-tinta/70">Gestiona cambios de prendas de manera rápida y segura.</p>
        </div>
        {/* Tres cifras chicas, no un tablero: acompañan al título sin competir con él. Van
            juntas en un recuadro con el nombre de la sede —son de ESTA sede—, cada cifra
            centrada sobre su etiqueta. */}
        <ResumenSede
          sede={persona.ubicacionEtiqueta}
          cifras={[
            { valor: estadisticas.cambiosHoy, etiqueta: "Cambios hoy", icono: RefreshCw },
            { valor: estadisticas.cambiosMes, etiqueta: "Este mes", icono: CalendarDays },
            { valor: estadisticas.valorMes, formato: "soles", etiqueta: "Valor cambiado", icono: Banknote },
          ]}
        />
      </header>

      <CambiosPanel
        lineas={lineas}
        busqueda={q?.trim() ?? ""}
        todasLasSedes={todasLasSedes}
        puedeVerTodas={esLider}
        sede={persona.ubicacionEtiqueta}
        ubicacionId={persona.ubicacionId}
        colaboradora={persona.nombre}
        cajaAbierta={caja !== null}
        tallasQueNoCalzan={tallasQueNoCalzan}
        abrirItemId={item}
        catalogo={catalogo
          .filter((v) => v.activo)
          .map((v) => ({
            varianteId: v.varianteId,
            productoId: v.productoId,
            sku: v.sku,
            codigo: v.codigo,
            referencia: v.referencia,
            talla: v.talla,
            color: v.color,
            colorHex: v.colorHex,
            fotoUrl: v.fotoUrl,
            precio: v.precio,
            stockAqui: stockAquiPorVariante.get(v.varianteId) ?? 0,
            stockOtrasSedes: stockPorSede.get(v.varianteId)?.otrasSedes ?? [],
          }))}
      />
    </div>
  );
}
