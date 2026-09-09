import { requirePersonaActual } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";
import { InventarioNav } from "@/components/InventarioNav";
import { exigir } from "@/lib/resultado";
import { ProveedoresManager } from "@/components/ProveedoresManager";

export default async function ProveedoresPage() {
  const persona = await requirePersonaActual();
  const supabase = await createClient();

  // Trae también los inactivos: el Líder los necesita para poder reactivarlos
  // (ProveedoresManager los oculta por defecto con un toggle "Mostrar inactivos").
  // Toda la pantalla ES esta lista: si falla y se dibuja vacía, el Líder concluye que no
  // tiene proveedores registrados y vuelve a dar de alta los que ya estaban.
  const proveedores = exigir(
    await supabase
      .from("proveedores")
      .select("id, nombre, ruc, categoria, marca, score, contacto, telefono, direccion, banco, cuenta_bancaria, activo")
      .order("nombre"),
    "el directorio de proveedores"
  );

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Inventario</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Proveedores</h1>
        <p className="mt-1 text-sm text-tinta/70">
          Directorio único para las 3 sedes — se acabaron las copias desincronizadas.
        </p>
      </div>

      <InventarioNav />

      <ProveedoresManager
        proveedores={(proveedores ?? []).map((p) => ({
          ...p,
          score: p.score != null ? Number(p.score) : null,
          cuentaBancaria: p.cuenta_bancaria,
        }))}
        esLider={persona.rol === "lider"}
      />
    </div>
  );
}
