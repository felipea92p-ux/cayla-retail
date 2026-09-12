import Link from "next/link";
import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getCajaAbierta } from "@/lib/caja";
import { getCatalogo } from "@/lib/catalogo-v2";
import { VenderFormV2 } from "@/components/VenderFormV2";

// Prioridad 1 (2026-09-12): rediseño completo, no una adaptación de la
// versión V1 — esa depende de `lib/finanzas.ts`/`lib/catalogo.ts` (V1). Ver
// `VenderFormV2.tsx` para el alcance real de esta versión mínima.
export default async function VenderPage() {
  const persona = await requirePersonaActualV2();
  const caja = await getCajaAbierta(persona.ubicacionId);

  if (!caja) {
    return (
      <div className="space-y-6">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Vender</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">No hay caja abierta</h1>
        </div>
        <p className="card-cayla p-5 text-sm text-tinta/75">
          {persona.ubicacionEtiqueta} necesita una caja abierta antes de poder vender.{" "}
          <Link href="/caja" className="text-rojo hover:underline">
            Abrir caja →
          </Link>
        </p>
      </div>
    );
  }

  const catalogo = await getCatalogo();

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Vender · {persona.ubicacionEtiqueta}</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Nueva venta</h1>
      </div>

      {catalogo.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Todavía no hay productos en el catálogo.</p>
      ) : (
        <VenderFormV2
          ubicacionId={persona.ubicacionId}
          ubicacionEtiqueta={persona.ubicacionEtiqueta}
          variantes={catalogo.map((v) => ({
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
