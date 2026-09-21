import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { traducirError } from "@/lib/error-escritura";

// POST /api/productos/familias → agrega una familia nueva (Indumentaria, Calzado...).
//
// A diferencia de /api/productos/categorias: sin proponer/aprobar y sin
// elegir un código a mano — `retail.fn_familias_generar_codigo` lo deriva
// del nombre (20260918010000_familias_tabla_propia.sql). Es una decisión de
// marca, no operativa (ver esa migración para el porqué), así que solo un
// Líder la toca, igual que categorías.
//
// PROMETE: la familia queda disponible de inmediato para categorizar.
// ASUME: sesión válida y rol de Líder — la policy `familias_write_lider`
//   ya lo exige, esto solo da un mensaje de error legible antes de llegar ahí.
export async function POST(request: Request) {
  const persona = await requirePersonaActualV2();
  if (!puede(persona, "editarCatalogo")) {
    return Response.json({ error: "Solo un Líder puede agregar una familia." }, { status: 403 });
  }

  const cuerpo = await request.json().catch(() => null);
  const nombre = typeof cuerpo?.nombre === "string" ? cuerpo.nombre.trim() : "";

  if (!nombre) {
    return Response.json({ error: "Falta el nombre de la familia." }, { status: 400 });
  }

  const supabase = await createClient();
  // `codigo: ""` es el contrato del trigger `familias_generar_codigo_biu`
  // ("vacío = derívalo del nombre"). Se manda porque el tipo generado lo pide
  // obligatorio: la columna no tiene DEFAULT y el generador de tipos no ve
  // triggers. Sin esto el PR no compilaba (y Vercel no podía desplegar).
  const { data, error } = await supabase
    .from("familias")
    .insert({ nombre, codigo: "" })
    .select("codigo, nombre, activo, orden")
    .single();

  if (error) {
    return Response.json({ error: traducirError(error, "agregar la familia") }, { status: 400 });
  }

  return Response.json({ familia: data });
}

// PUT /api/productos/familias → edita el nombre visible (el código nunca cambia).
export async function PUT(request: Request) {
  const persona = await requirePersonaActualV2();
  if (!puede(persona, "editarCatalogo")) {
    return Response.json({ error: "Solo un Líder puede editar una familia." }, { status: 403 });
  }

  const cuerpo = await request.json().catch(() => null);
  const codigo = typeof cuerpo?.codigo === "string" ? cuerpo.codigo : "";
  const nombre = typeof cuerpo?.nombre === "string" ? cuerpo.nombre.trim() : "";

  if (!codigo) {
    return Response.json({ error: "Falta la familia a editar." }, { status: 400 });
  }
  if (!nombre) {
    return Response.json({ error: "Falta el nombre de la familia." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("familias")
    .update({ nombre })
    .eq("codigo", codigo)
    .select("codigo, nombre, activo, orden")
    .single();

  if (error) {
    return Response.json({ error: traducirError(error, "editar la familia") }, { status: 400 });
  }

  return Response.json({ familia: data });
}

// PATCH /api/productos/familias → desactiva o reactiva (nunca DELETE).
//
// Desactivar SE BLOQUEA si alguna categoría activa todavía la usa —
// `fn_familias_desactivar_candado` cuenta y avisa cuántas en el mensaje de
// error, mismo criterio que `desactivar_categoria`.
export async function PATCH(request: Request) {
  const persona = await requirePersonaActualV2();
  if (!puede(persona, "editarCatalogo")) {
    return Response.json({ error: "Solo un Líder puede desactivar o reactivar una familia." }, { status: 403 });
  }

  const cuerpo = await request.json().catch(() => null);
  const codigo = typeof cuerpo?.codigo === "string" ? cuerpo.codigo : "";
  const activo = typeof cuerpo?.activo === "boolean" ? cuerpo.activo : null;

  if (!codigo) {
    return Response.json({ error: "Falta la familia." }, { status: 400 });
  }
  if (activo === null) {
    return Response.json({ error: "Falta indicar si se activa o desactiva." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.from("familias").update({ activo }).eq("codigo", codigo);

  if (error) {
    return Response.json(
      { error: traducirError(error, activo ? "reactivar la familia" : "desactivar la familia") },
      { status: 400 }
    );
  }

  return Response.json({ ok: true });
}
