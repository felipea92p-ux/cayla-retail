import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getLineasVentaRecientes } from "@/lib/ventas-v2";
import { getCatalogo } from "@/lib/catalogo-v2";
import { CambiosLista } from "@/components/CambiosLista";

// Prioridad 1 (2026-09-12): cambio de talla/color. Ver
// supabase/migrations/0007_cambios.sql y CambioFormV2.tsx para el modelo.
export default async function CambiosPage() {
  const persona = await requirePersonaActualV2();
  const [lineas, catalogo] = await Promise.all([
    getLineasVentaRecientes(persona.ubicacionId),
    getCatalogo(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">{persona.ubicacionEtiqueta}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Cambios</h1>
        <p className="mt-1 text-sm text-tinta/65">Elige la prenda vendida que la clienta quiere cambiar por otra talla o color.</p>
      </div>

      {lineas.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Todavía no hay ventas recientes en esta ubicación.</p>
      ) : (
        <CambiosLista
          lineas={lineas}
          ubicacionId={persona.ubicacionId}
          catalogo={catalogo.map((v) => ({
            varianteId: v.varianteId,
            sku: v.sku,
            referencia: v.referencia,
            talla: v.talla,
            color: v.color,
            precio: v.precio,
          }))}
        />
      )}
    </div>
  );
}
