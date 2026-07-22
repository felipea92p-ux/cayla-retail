import Link from "next/link";
import { requirePersonaActual } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";
import { AlmacenStockList } from "@/components/AlmacenStockList";
import { InventarioNav } from "@/components/InventarioNav";

export default async function AlmacenPage() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();

  const { data: almacen } = await supabase
    .from("sedes")
    .select("id, codigo")
    .eq("tienda_asociada_id", persona.sedeId)
    .eq("tipo", "almacen")
    .maybeSingle();

  if (!almacen) {
    return (
      <div className="space-y-6">
        <div>
          <p className="label-cayla text-[10px] text-tinta/45">Inventario</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Almacén</h1>
        </div>
        <InventarioNav />
        <p className="card-cayla p-5 text-sm text-tinta/60">
          Tu sede ({persona.sedeCodigo}) no tiene un almacén asociado.
        </p>
      </div>
    );
  }

  const { data: stockRows } = await supabase
    .from("stock")
    .select("variante_id, cantidad, variantes(sku, talla, color, productos(referencia)), contenedores(codigo)")
    .eq("sede_id", almacen.id)
    .gt("cantidad", 0);

  const items = (stockRows ?? [])
    .map((r) => {
      const variante = Array.isArray(r.variantes) ? r.variantes[0] : r.variantes;
      const producto = variante ? (Array.isArray(variante.productos) ? variante.productos[0] : variante.productos) : null;
      const contenedor = Array.isArray(r.contenedores) ? r.contenedores[0] : r.contenedores;
      return {
        varianteId: r.variante_id,
        sku: variante?.sku ?? "",
        referencia: producto?.referencia ?? "(sin referencia)",
        talla: variante?.talla ?? null,
        color: variante?.color ?? null,
        cantidad: r.cantidad,
        contenedorCodigo: contenedor?.codigo ?? null,
      };
    })
    .sort((a, b) => a.referencia.localeCompare(b.referencia));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="label-cayla text-[10px] text-tinta/45">Inventario · {almacen.codigo}</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Almacén</h1>
          <p className="mt-1 text-xs text-tinta/45">{items.length} referencias con stock</p>
        </div>
        <Link
          href="/inventario/recibir"
          className="label-cayla border border-tinta/25 px-4 py-2.5 text-[10px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
        >
          + Recibir
        </Link>
      </div>

      <InventarioNav />

      <AlmacenStockList
        items={items}
        sedeAlmacenId={almacen.id}
        sedeTiendaId={persona.sedeId}
        sedeTiendaCodigo={persona.sedeCodigo}
      />
    </div>
  );
}
