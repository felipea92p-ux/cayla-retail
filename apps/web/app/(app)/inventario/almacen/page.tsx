import Link from "next/link";
import { requirePersonaActual } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";
import { AlmacenStockList } from "@/components/AlmacenStockList";
import { InventarioNav } from "@/components/InventarioNav";
import { exigir, exigirOpcional } from "@/lib/resultado";

export default async function AlmacenPage() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();

  // Que la sede no tenga almacén es una respuesta válida (abajo se explica en pantalla);
  // que la consulta FALLE no lo es. Antes ambos llegaban como null y se le decía a la
  // Encargada "tu sede no tiene almacén configurado" cuando en realidad se cayó la red.
  const resContenedor = await supabase
    .from("contenedores")
    .select("id, codigo")
    .eq("sede_id", persona.sedeId)
    .eq("tipo", "almacen")
    .maybeSingle();
  const contenedorAlmacen = exigirOpcional(resContenedor, "el almacén de la sede");

  if (!contenedorAlmacen) {
    return (
      <div className="space-y-6">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Inventario</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Almacén</h1>
        </div>
        <InventarioNav />
        <p className="card-cayla p-5 text-sm text-tinta/75">
          Tu sede ({persona.sedeCodigo}) no tiene un almacén configurado.
        </p>
      </div>
    );
  }

  // Stock: falla en duro. Un almacén que se dibuja vacío manda a comprar lo que ya está.
  const stockRows = exigir(
    await supabase
      .from("stock_almacen")
    .select("variante_id, cantidad, variantes(sku, talla, color, productos(referencia))")
      .eq("sede_id", persona.sedeId)
      .gt("cantidad", 0),
    "el stock del almacén"
  );

  const items = stockRows
    .map((r) => {
      const variante = Array.isArray(r.variantes) ? r.variantes[0] : r.variantes;
      const producto = variante ? (Array.isArray(variante.productos) ? variante.productos[0] : variante.productos) : null;
      return {
        varianteId: r.variante_id,
        sku: variante?.sku ?? "",
        referencia: producto?.referencia ?? "(sin referencia)",
        talla: variante?.talla ?? null,
        color: variante?.color ?? null,
        cantidad: r.cantidad,
      };
    })
    .sort((a, b) => a.referencia.localeCompare(b.referencia));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Inventario · {persona.sedeCodigo}</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Almacén</h1>
          <p className="mt-1 text-xs text-tinta/65">{items.length} referencias con stock</p>
        </div>
        <Link
          href="/inventario/recibir"
          className="label-cayla rounded-md border border-tinta/25 px-4 py-2.5 text-[11px] text-tinta transition-colors hover:border-rojo hover:text-rojo"
        >
          + Recibir
        </Link>
      </div>

      <InventarioNav />

      <AlmacenStockList items={items} sedeId={persona.sedeId} sedeCodigo={persona.sedeCodigo} />
    </div>
  );
}
