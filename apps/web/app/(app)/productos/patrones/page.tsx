import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { Ayuda } from "@/components/Ayuda";
import { PatronesLista } from "@/components/PatronesLista";

// Vocabulario cerrado de patrones (ADR-0072/0073) — atributo del PRODUCTO
// (no cambia entre tallas de la misma prenda), mismo mecanismo que Colores.
export default async function PatronesPage() {
  const persona = await requirePersonaActualV2();
  const supabase = await createClient();

  const res = await supabase.from("patrones").select("id, nombre, activo, notas, estado").order("nombre");
  const filas = exigir(res, "los patrones del vocabulario");
  const activos = filas.filter((p) => p.activo);

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Productos · Catálogo</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">
          Patrones
          <Ayuda titulo="Patrones">
            El vocabulario cerrado de patrón/estampado: {activos.length} nombres. Igual que
            tejido, es atributo del producto, no de la variante. Cualquiera propone, un Líder
            aprueba o rechaza.
          </Ayuda>
        </h1>
      </div>

      <PatronesLista
        patronesIniciales={filas.map((p) => ({
          id: p.id,
          nombre: p.nombre,
          activo: p.activo,
          notas: p.notas,
          estado: p.estado as "pendiente" | "aprobado" | "rechazado",
        }))}
        puedeEditar={persona.rol === "lider"}
      />
    </div>
  );
}
