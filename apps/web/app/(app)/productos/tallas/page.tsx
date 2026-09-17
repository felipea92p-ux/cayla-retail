import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { exigir } from "@/lib/resultado";
import { Ayuda } from "@/components/Ayuda";
import { TallasLista } from "@/components/TallasLista";

// Vocabulario cerrado de tallas (ADR-0095/0096) — reemplaza el texto libre
// que tenía `variantes.talla` antes del censo real. Aprobar exige un
// comentario, a diferencia de colores/tejidos/patrones/etiquetas.
export default async function TallasPage() {
  const persona = await requirePersonaActualV2();
  const supabase = await createClient();

  const res = await supabase.from("tallas").select("id, valor, activo, notas, estado").order("valor");
  const filas = exigir(res, "las tallas del vocabulario");
  const activas = filas.filter((t) => t.activo);

  return (
    <div className="space-y-6">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Productos · Catálogo</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">
          Tallas
          <Ayuda titulo="Tallas">
            El vocabulario cerrado de talla: {activas.length} valores. A diferencia de colores,
            tejidos y patrones, aprobar una talla exige un comentario — es más cara de deshacer
            una vez que hay SKUs colgando. Qué categorías ofrecen cada talla se configura aparte.
          </Ayuda>
        </h1>
      </div>

      <TallasLista
        tallasIniciales={filas.map((t) => ({
          id: t.id,
          valor: t.valor,
          activo: t.activo,
          notas: t.notas,
          estado: t.estado as "pendiente" | "aprobado" | "rechazado",
        }))}
        puedeEditar={persona.rol === "lider"}
      />
    </div>
  );
}
