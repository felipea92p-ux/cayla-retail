import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
// ADR-0161: cambiar el catálogo es operación de tienda; la firma del combo «Responsable» que manda la pantalla
// viaja a la base en cada consulta de este cliente (sin firma, igual que antes).
import { firmaDeEncabezados } from "@/lib/responsable-reglas";
import { traducirError } from "@/lib/error-escritura";

// PUT /api/productos/categorias/ejes → qué tallas/tejidos/patrones ofrece
// una categoría (20260917130000). Reemplaza el conjunto completo de cada
// eje, no lo amplía: manda todo lo elegido, no un diff. El candado de
// Líder y la atomicidad entre los 3 ejes viven en el RPC, no acá.
function idsValidos(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string") : [];
}

export async function PUT(request: Request) {
  await requirePersonaActualV2();

  const cuerpo = await request.json().catch(() => null);
  const categoriaId = typeof cuerpo?.categoriaId === "string" ? cuerpo.categoriaId : "";
  if (!categoriaId) {
    return Response.json({ error: "Falta la categoría a editar." }, { status: 400 });
  }

  const supabase = await createClient({ firma: firmaDeEncabezados(request.headers) });
  const { error } = await supabase.rpc("actualizar_categoria_ejes", {
    p_categoria_id: categoriaId,
    p_talla_ids: idsValidos(cuerpo?.tallaIds),
    p_tejido_ids: idsValidos(cuerpo?.tejidoIds),
    p_patron_ids: idsValidos(cuerpo?.patronIds),
    // Sin `tallaHabitualIds` la base conserva la curva que ya tenía (20260918230100).
    // Con él, esa es la curva nueva: las tallas elegidas que vienen marcadas de antemano.
    p_talla_habitual_ids: Array.isArray(cuerpo?.tallaHabitualIds) ? idsValidos(cuerpo.tallaHabitualIds) : undefined,
  });

  if (error) {
    return Response.json({ error: traducirError(error, "guardar las tallas/tejidos/patrones de la categoría") }, { status: 400 });
  }

  return Response.json({ ok: true });
}
