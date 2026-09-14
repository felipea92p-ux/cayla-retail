import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getUbicaciones } from "@/lib/ubicaciones";
import { getStockPorUbicacion, resumirInventario } from "@/lib/inventario-v2";
import { getSububicaciones, encontrarPorTipo } from "@/lib/sububicaciones";
import { SelectorUbicacion } from "@/components/SelectorUbicacion";
import { InventarioPanel } from "@/components/InventarioPanel";

// Fase UI 2 (2026-09-14): piso de venta vs. almacén de tienda
// (20260914210000_inventario_piso_almacen.sql). Sigue siendo UNA tabla
// `stock` — la separación es una columna más (`sububicacion_id`), no dos
// tablas como en V1 — pero ahora una ubicación puede tener más de una fila
// por variante, así que la pantalla necesita saber agregar antes de
// mostrar. Esa agregación vive en `getStockPorUbicacion`, no acá: esta
// página sigue siendo solo "traer los datos y elegir el layout".
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

  const [stock, sububicaciones] = await Promise.all([
    getStockPorUbicacion(ubicacionActivaId),
    getSububicaciones(ubicacionActivaId),
  ]);
  const resumen = resumirInventario(stock);
  const sububicacionPiso = encontrarPorTipo(sububicaciones, "piso_venta");
  const sububicacionAlmacen = encontrarPorTipo(sububicaciones, "almacen_tienda");

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

      <InventarioPanel
        ubicacionId={ubicacionActivaId}
        stock={stock}
        resumen={resumen}
        sububicacionPiso={sububicacionPiso}
        sububicacionAlmacen={sububicacionAlmacen}
      />
    </div>
  );
}
