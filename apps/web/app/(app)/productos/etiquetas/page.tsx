import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { Ayuda } from "@/components/Ayuda";
import { EtiquetasLista } from "@/components/EtiquetasLista";

// Vocabulario cerrado de etiquetas de catálogo (ADR-0072) — folksonomy tipo
// "Oferta"/"Verano 2026" por VARIANTE, distinto de la etiqueta física de
// código de barras. `sedes_permitidas` es opcional: sin elegir ninguna
// sede, la etiqueta no restringe nada.
export default async function EtiquetasPage() {
  const persona = await requirePersonaActualV2();
  const supabase = await createClient();

  const [resEtiquetas, resUbicaciones] = await Promise.all([
    supabase.from("etiquetas").select("id, nombre, activo, sedes_permitidas, notas, estado").order("nombre"),
    supabase.from("ubicaciones").select("id, nombre").eq("activo", true).order("nombre"),
  ]);
  const filas = exigir(resEtiquetas, "las etiquetas del vocabulario");
  const sedes = exigir(resUbicaciones, "las sedes");
  const activas = filas.filter((e) => e.activo);

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Productos · Catálogo</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">
          Etiquetas
          <Ayuda titulo="Etiquetas">
            El vocabulario cerrado de etiquetas de catálogo: {activas.length} valores. Se aplican a una
            variante puntual (no al producto), no a la etiqueta física de código de barras. Restringir a
            sedes es opcional — sin elegir ninguna, la etiqueta no bloquea venta ni traslado en ninguna
            sede.
          </Ayuda>
        </h1>
      </div>

      <EtiquetasLista
        etiquetasIniciales={filas.map((e) => ({
          id: e.id,
          nombre: e.nombre,
          activo: e.activo,
          sedesPermitidas: e.sedes_permitidas,
          notas: e.notas,
          estado: e.estado as "pendiente" | "aprobado" | "rechazado",
        }))}
        sedes={sedes}
        puedeEditar={persona.rol === "lider"}
      />
    </div>
  );
}
