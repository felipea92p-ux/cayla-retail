import { Banknote, CalendarDays, RefreshCw } from "lucide-react";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getVentasRecientes } from "@/lib/ventas-v2";
import { getCatalogo } from "@/lib/catalogo-v2";
import { getDisponibleEnSede, leerStockDeLasSedes } from "@/lib/inventario-v2";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getCajaAbierta } from "@/lib/caja";
import { agruparStockPorSede } from "@/lib/stock-por-sede";
import { getEstadisticasCambios, getTallasQueNoCalzan } from "@/lib/cambios-estadisticas";
import { exigir } from "@/lib/resultado";
import { CambiosPanel } from "@/components/CambiosPanel";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { ResumenSede } from "@/components/ui/ResumenSede";

// Cambio de talla/color (Prioridad 1, 2026-09-12; rediseño completo 2026-09-18). El
// modelo vive en supabase/migrations/0007_cambios.sql y
// 20260919000100_cambios_motivo_y_estado_de_prenda.sql; la pantalla, en CambiosPanel.
export default async function CambiosPage({ searchParams }: { searchParams: Promise<{ q?: string; todas?: string; item?: string }> }) {
  const persona = await requirePersonaActualV2();
  // `item`: llegar desde Devoluciones con «Cambiar por otra prenda» (R-37) abre el flujo
  // sobre esa prenda exacta.
  const { q, todas, item } = await searchParams;
  const esLider = persona.rol === "lider";
  // Solo un líder ve otras sedes (RLS de ventas): a una integrante, "todas" no le
  // traería nada y la pantalla mentiría diciendo "no encontramos".
  const todasLasSedes = esLider && todas === "1";
  // Mismas lecturas de stock que Vender (vender/page.tsx): el piso de ESTA ubicación
  // decide qué se puede entregar (`registrar_cambio` rechaza lo que no está), y
  // `fn_stock_por_sede` dice dónde más hay cuando aquí no queda la talla.
  const [lineas, catalogo, stock, resStockSedes, ubicaciones, estadisticas, tallasQueNoCalzan, caja] = await Promise.all([
    getVentasRecientes(persona.ubicacionId, { busqueda: q, todasLasSedes, ventaItemId: item }),
    getCatalogo(),
    getDisponibleEnSede(persona.ubicacionId),
    leerStockDeLasSedes(),
    getUbicaciones(),
    getEstadisticasCambios(persona.ubicacionId),
    esLider ? getTallasQueNoCalzan() : Promise.resolve([]),
    getCajaAbierta(persona.ubicacionId),
  ]);
  // Lo que se entrega a cambio sale del piso y solo puede ser lo DISPONIBLE: lo apartado para otra
  // clienta no se ofrece (ADR-0141).
  const stockAquiPorVariante = new Map([...stock].map(([id, c]) => [id, c.pisoDisponible ?? c.disponible]));
  const stockPorSede = agruparStockPorSede(exigir(resStockSedes, "el stock de las sedes"), ubicaciones, persona.ubicacionId);

  return (
    <div className="space-y-7">
      <EncabezadoPagina sede={persona.ubicacionEtiqueta} titulo="Cambios" subtitulo="Gestiona cambios de prendas de manera rápida y segura.">
        {/* Tres cifras chicas, no un tablero: acompañan al título sin competir con él. Son de
            ESTA sede —lo dice la línea de arriba del título—, cada cifra centrada sobre su
            etiqueta. */}
        <ResumenSede
          sede={persona.ubicacionEtiqueta}
          cifras={[
            { valor: estadisticas.cambiosHoy, etiqueta: "Cambios hoy", icono: RefreshCw },
            { valor: estadisticas.cambiosMes, etiqueta: "Este mes", icono: CalendarDays },
            { valor: estadisticas.valorMes, formato: "soles", etiqueta: "Valor cambiado", icono: Banknote },
          ]}
        />
      </EncabezadoPagina>

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
