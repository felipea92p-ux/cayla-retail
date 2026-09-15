import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getLineasVentaRecientes } from "@/lib/ventas-v2";
import { getCatalogo } from "@/lib/catalogo-v2";
import { getStockPorUbicacion } from "@/lib/inventario-v2";
import { CambiosLista } from "@/components/CambiosLista";

// Prioridad 1 (2026-09-12): cambio de talla/color. Ver
// supabase/migrations/0007_cambios.sql y CambioFormV2.tsx para el modelo.
export default async function CambiosPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const persona = await requirePersonaActualV2();
  const { q } = await searchParams;
  // Mismo par de lecturas que Vender (vender/page.tsx): el catálogo entero más el piso
  // de ESTA ubicación, para que el selector de "entregar en su lugar" no ofrezca una
  // talla que `registrar_cambio` va a rechazar por falta de stock.
  const [lineas, catalogo, stock] = await Promise.all([
    getLineasVentaRecientes(persona.ubicacionId, { busqueda: q }),
    getCatalogo(),
    getStockPorUbicacion(persona.ubicacionId),
  ]);
  const stockAquiPorVariante = new Map(stock.map((f) => [f.varianteId, f.piso ?? f.total]));

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">{persona.ubicacionEtiqueta}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Cambios</h1>
        <p className="mt-1 text-sm text-tinta/65">Elige la prenda vendida que la clienta quiere cambiar por otra talla o color.</p>
      </div>

      {lineas.length === 0 && !q ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Todavía no hay ventas recientes en esta ubicación.</p>
      ) : (
        <CambiosLista
          lineas={lineas}
          ubicacionId={persona.ubicacionId}
          busqueda={q ?? ""}
          catalogo={catalogo
            .filter((v) => v.activo)
            .map((v) => ({
              varianteId: v.varianteId,
              sku: v.sku,
              referencia: v.referencia,
              talla: v.talla,
              color: v.color,
              precio: v.precio,
              stockAqui: stockAquiPorVariante.get(v.varianteId) ?? 0,
            }))}
        />
      )}
    </div>
  );
}
