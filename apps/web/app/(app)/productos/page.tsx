import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getCatalogo } from "@/lib/catalogo-v2";

// Fase UI 1 (2026-09-11): pantalla nueva, no una migración de
// `inventario/producto` (V1) — esa ruta es un formulario de alta que depende
// de `marca`, `foto_url` y `categorias.tallas_sugeridas` (ninguno existe en
// V2). Esta es solo lectura del catálogo V2: producto, categoría, variante
// (SKU/talla/color/precio/costo) y sus códigos de barra. Alta de producto
// queda para Fase 2 (requiere decidir con Felipe el flujo, no solo el CRUD).
export default async function ProductosPage() {
  await requirePersonaActualV2();
  const catalogo = await getCatalogo();

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Catálogo</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Productos</h1>
      </div>

      {catalogo.length === 0 ? (
        <p className="card-cayla p-5 text-sm text-tinta/75">Todavía no hay productos en el catálogo.</p>
      ) : (
        <div className="card-cayla overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-tinta/10 text-left">
                <th className="label-cayla px-5 py-3 text-[11px] text-tinta/65">Referencia</th>
                <th className="label-cayla px-3 py-3 text-[11px] text-tinta/65">Categoría</th>
                <th className="label-cayla px-3 py-3 text-[11px] text-tinta/65">SKU</th>
                <th className="label-cayla px-3 py-3 text-[11px] text-tinta/65">Talla</th>
                <th className="label-cayla px-3 py-3 text-[11px] text-tinta/65">Color</th>
                <th className="label-cayla px-3 py-3 text-right text-[11px] text-tinta/65">Precio</th>
                <th className="label-cayla px-3 py-3 text-right text-[11px] text-tinta/65">Costo</th>
                <th className="label-cayla px-5 py-3 text-[11px] text-tinta/65">Barras</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tinta/10">
              {catalogo.map((v) => (
                <tr key={v.varianteId} className={v.activo ? "" : "opacity-50"}>
                  <td className="px-5 py-2.5 text-tinta">{v.referencia}</td>
                  <td className="px-3 py-2.5 text-tinta/75">{v.categoria ?? "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-tinta/75">{v.sku}</td>
                  <td className="px-3 py-2.5 text-tinta/75">{v.talla ?? "—"}</td>
                  <td className="px-3 py-2.5 text-tinta/75">
                    {v.color ? (
                      <span className="inline-flex items-center gap-1.5">
                        {v.colorHex && (
                          <span
                            aria-hidden
                            className="inline-block h-3 w-3 rounded-full border border-tinta/15"
                            style={{ backgroundColor: v.colorHex }}
                          />
                        )}
                        {v.color}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-tinta">S/{v.precio.toFixed(2)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-tinta/65">S/{v.costo.toFixed(2)}</td>
                  <td className="px-5 py-2.5 text-xs text-tinta/65">{v.codigosBarras.join(", ") || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
