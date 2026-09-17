import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { Ayuda } from "@/components/Ayuda";
import { TejidosLista } from "@/components/TejidosLista";

// Vocabulario cerrado de tejidos (ADR-0075/0076) — atributo del PRODUCTO
// (no cambia entre tallas de la misma prenda), mismo mecanismo que Colores.
export default async function TejidosPage() {
  const persona = await requirePersonaActualV2();
  const supabase = await createClient();

  const res = await supabase.from("tejidos").select("id, nombre, activo, notas, estado").order("nombre");
  const filas = exigir(res, "los tejidos del vocabulario");
  const activos = filas.filter((t) => t.activo);

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Productos · Catálogo</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">
          Tejidos
          <Ayuda titulo="Tejidos">
            El vocabulario cerrado de tejido: {activos.length} nombres. Un tejido es atributo del
            producto, no de la variante — no cambia entre tallas de la misma prenda. Cualquiera
            propone, un Líder aprueba o rechaza.
          </Ayuda>
        </h1>
      </div>

      <TejidosLista
        tejidosIniciales={filas.map((t) => ({
          id: t.id,
          nombre: t.nombre,
          activo: t.activo,
          notas: t.notas,
          estado: t.estado as "pendiente" | "aprobado" | "rechazado",
        }))}
        puedeEditar={persona.rol === "lider"}
      />
    </div>
  );
}
