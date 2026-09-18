import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { Ayuda } from "@/components/Ayuda";
import { EtiquetasLista } from "@/components/EtiquetasLista";

// Vocabulario cerrado de etiquetas de catálogo (ADR-0095) — folksonomy tipo
// "Oferta"/"Verano 2026" por VARIANTE, distinto de la etiqueta física de
// código de barras. Aplica igual en todas las sedes a propósito (Felipe,
// 2026-09-18: "empresa uniforme") — sin restricción por sede en pantalla.
export default async function EtiquetasPage() {
  const persona = await requirePersonaActualV2();
  const supabase = await createClient();

  const resEtiquetas = await supabase.from("etiquetas").select("id, nombre, activo, notas, estado").order("nombre");
  const filas = exigir(resEtiquetas, "las etiquetas del vocabulario");
  const activas = filas.filter((e) => e.activo);

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Productos · Catálogo</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">
          Etiquetas
          <Ayuda titulo="Etiquetas">
            El vocabulario cerrado de etiquetas de catálogo: {activas.length} valores. Se aplican a una
            variante puntual (no al producto), no a la etiqueta física de código de barras. Aplican igual
            en las 4 sedes — ninguna etiqueta se restringe a una sede en particular.
          </Ayuda>
        </h1>
      </div>

      <EtiquetasLista
        etiquetasIniciales={filas.map((e) => ({
          id: e.id,
          nombre: e.nombre,
          activo: e.activo,
          notas: e.notas,
          estado: e.estado as "pendiente" | "aprobado" | "rechazado",
        }))}
        puedeEditar={persona.rol === "lider"}
      />
    </div>
  );
}
