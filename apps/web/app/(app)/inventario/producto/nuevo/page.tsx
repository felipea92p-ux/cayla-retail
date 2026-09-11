import { redirect } from "next/navigation";
import { requirePersonaActual } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { getColores } from "@/lib/conteo";
import { InventarioNav } from "@/components/InventarioNav";
import { NuevoProductoForm } from "@/components/NuevoProductoForm";

export default async function NuevoProductoPage() {
  const persona = await requirePersonaActual();
  // Dar de alta catálogo es de Líder (mismo candado que retail.productos_insert_lider
  // y el RPC crear_producto_con_variantes) — se corta acá para no mostrar un
  // formulario que al final la base va a rechazar.
  if (persona.rol !== "lider") redirect("/inventario");

  const supabase = await createClient();
  const [resCategorias, resProveedores, colores] = await Promise.all([
    supabase.from("categorias").select("id, familia, nombre, tallas_sugeridas").order("familia").order("nombre"),
    supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
    // El vocabulario cerrado (0046): `getColores` es `exigir`, no `tolerar` — sin colores
    // el formulario dejaría crear prendas sin color por un fallo de red, que es justo lo
    // que 0057 vino a cerrar.
    getColores(),
  ]);

  // Sin categorías el formulario se dibuja igual, pero con el desplegable vacío: la
  // prenda nueva nacería sin familia ni tallas sugeridas y habría que corregirla después,
  // una por una. Mejor no dejar empezar.
  const categoriasRows = exigir(resCategorias, "las categorías del catálogo");
  const proveedoresRows = exigir(resProveedores, "el directorio de proveedores");

  const categorias = categoriasRows.map((c) => ({
    id: c.id,
    familia: c.familia,
    nombre: c.nombre,
    tallasSugeridas: c.tallas_sugeridas,
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Inventario · Catálogo</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Nuevo producto</h1>
      </div>

      <InventarioNav />

      <NuevoProductoForm categorias={categorias} proveedores={proveedoresRows ?? []} colores={colores} />
    </div>
  );
}
