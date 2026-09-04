import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";
import { InventarioNav } from "@/components/InventarioNav";
import { NuevoProductoForm } from "@/components/NuevoProductoForm";

export default async function NuevoProductoPage() {
  const persona = await requirePersonaActual();
  // Dar de alta catálogo es de Líder (mismo candado que retail.productos_insert_lider
  // y el RPC crear_producto_con_variantes) — se corta acá para no mostrar un
  // formulario que al final la base va a rechazar.
  if (persona.rol !== "lider") redirect("/inventario");

  const supabase = await createClient();
  const { data: categoriasRows } = await supabase
    .from("categorias")
    .select("id, familia, nombre, tallas_sugeridas")
    .order("familia")
    .order("nombre");

  const categorias = (categoriasRows ?? []).map((c) => ({
    id: c.id,
    familia: c.familia,
    nombre: c.nombre,
    tallasSugeridas: c.tallas_sugeridas,
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[10px] text-tinta/45">Inventario · Catálogo</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Nuevo producto</h1>
      </div>

      <InventarioNav />

      <NuevoProductoForm categorias={categorias} />
    </div>
  );
}
