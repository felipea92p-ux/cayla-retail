import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getStockPorUbicacion } from "@/lib/inventario-v2";
import { SelectorUbicacion } from "@/components/SelectorUbicacion";

// Fase UI 1 (2026-09-11): rediseño completo, no una adaptación de
// `app/(app)/inventario/page.tsx` (V1) — ese archivo separa piso de venta y
// `stock_almacen` como dos tablas distintas por sede. V2 unificó eso en una
// sola tabla `stock` por `ubicacion_id` (más simple a propósito, ver
// `supabase/migrations/0002_esquema.sql`): una integrante ve directamente su
// ubicación; un Líder puede elegir cualquiera porque `fn_puede_operar_ubicacion`
// se lo permite (RLS lo vuelve a validar, esto es solo la UI).
export default async function InventarioPage({
  searchParams,
}: {
  searchParams: Promise<{ ubicacion?: string }>;
}) {
  const persona = await requirePersonaActualV2();
  const { ubicacion: ubicacionQuery } = await searchParams;
  const ubicaciones = await getUbicaciones();

  const ubicacionActivaId =
    persona.rol === "lider" && ubicacionQuery && ubicaciones.some((u) => u.id === ubicacionQuery)
      ? ubicacionQuery
      : persona.ubicacionId;
  const ubicacionActiva = ubicaciones.find((u) => u.id === ubicacionActivaId);

  const stock = await getStockPorUbicacion(ubicacionActivaId);
  const totalUnidades = stock.reduce((acc, f) => acc + f.cantidad, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Inventario</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">{ubicacionActiva?.nombre ?? "—"}</h1>
        </div>
        {persona.rol === "lider" && (
          <SelectorUbicacion ubicaciones={ubicaciones} ubicacionActualId={ubicacionActivaId} />
        )}
      </div>

      <p className="text-sm text-tinta/65">
        {stock.length} referencia{stock.length === 1 ? "" : "s"} con stock · {totalUnidades} unidad
        {totalUnidades === 1 ? "" : "es"} en total
      </p>

      {stock.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Esta ubicación no tiene stock todavía.</p>
      ) : (
        <div className="card-cayla overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-tinta/10 text-left">
                <th className="label-cayla px-5 py-3 text-[11px] text-tinta/65">Referencia</th>
                <th className="label-cayla px-3 py-3 text-[11px] text-tinta/65">SKU</th>
                <th className="label-cayla px-3 py-3 text-[11px] text-tinta/65">Talla</th>
                <th className="label-cayla px-3 py-3 text-[11px] text-tinta/65">Color</th>
                <th className="label-cayla px-5 py-3 text-right text-[11px] text-tinta/65">Cantidad</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tinta/10">
              {stock.map((f) => (
                <tr key={f.varianteId}>
                  <td className="px-5 py-2.5 text-tinta">{f.referencia}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-tinta/75">{f.sku}</td>
                  <td className="px-3 py-2.5 text-tinta/75">{f.talla ?? "—"}</td>
                  <td className="px-3 py-2.5 text-tinta/75">{f.color ?? "—"}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-tinta">{f.cantidad}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
