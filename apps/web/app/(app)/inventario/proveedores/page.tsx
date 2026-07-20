import { requirePersonaActual } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";
import { InventarioNav } from "@/components/InventarioNav";
import { ProveedoresManager } from "@/components/ProveedoresManager";

export default async function ProveedoresPage() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();

  const { data: proveedores } = await supabase
    .from("proveedores")
    .select("id, nombre, ruc, categoria, marca, score, contacto, telefono, direccion")
    .eq("activo", true)
    .order("nombre");

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[10px] text-tinta/45">Inventario</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Proveedores</h1>
        <p className="mt-1 text-sm text-tinta/50">
          Directorio único para las 3 sedes — se acabaron las copias desincronizadas.
        </p>
      </div>

      <InventarioNav />

      <ProveedoresManager
        proveedores={(proveedores ?? []).map((p) => ({ ...p, score: p.score != null ? Number(p.score) : null }))}
        esLider={persona.rol === "lider"}
      />
    </div>
  );
}
