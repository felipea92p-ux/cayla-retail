import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { traducirError } from "@/lib/error-escritura";

// POST /api/productos/categorias → agrega una categoría dentro de una de
// las 6 familias fijas. También sirve para agregar una SUBCATEGORÍA
// (`categoriaPadreId` apunta a una categoría de primer nivel ya existente):
// es la misma alta, solo que queda anidada bajo su padre.
//
// Portado de `trix/catalogo-vocabulario` (V1) tras ADR-0095.
//
// PROMETE: la categoría queda disponible de inmediato en Productos.
// ASUME: sesión válida y rol de Líder — la policy de escritura de
//   `retail.categorias` ya lo exige.
// NO HACE: no genera el prefijo solo — lo elige la persona, a propósito: un
//   prefijo malo (ambiguo o repetido) se rechaza en el acto por
//   `categorias_prefijo_formato`/`categorias_prefijo_unico`. Tampoco valida
//   el candado de un solo nivel de subcategoría ni la familia heredada del
//   padre — de eso se encarga `retail.fn_valida_categoria_subcategoria`
//   (20260915224500), no confiar en que esta pantalla sea el único camino.
// DIFERENCIA CON V1: acá `categorias.nombre` es único GLOBAL, no por
//   familia — dos familias no pueden compartir un nombre de categoría.
export async function POST(request: Request) {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") {
    return Response.json({ error: "Solo un Líder puede agregar una categoría." }, { status: 403 });
  }

  const cuerpo = await request.json().catch(() => null);
  const nombre = typeof cuerpo?.nombre === "string" ? cuerpo.nombre.trim() : "";
  const familia = typeof cuerpo?.familia === "string" ? cuerpo.familia : "";
  const prefijo = typeof cuerpo?.prefijo === "string" ? cuerpo.prefijo.trim().toUpperCase() : "";
  const categoriaPadreId = typeof cuerpo?.categoriaPadreId === "string" ? cuerpo.categoriaPadreId : null;
  const notas = typeof cuerpo?.notas === "string" ? cuerpo.notas.trim() : "";

  if (!nombre) {
    return Response.json({ error: "Falta el nombre de la categoría." }, { status: 400 });
  }
  if (!familia) {
    return Response.json({ error: "Elige una familia." }, { status: 400 });
  }
  if (!/^[A-Z]{3}$/.test(prefijo)) {
    return Response.json({ error: "El prefijo tiene que ser exactamente 3 letras (ej. BLU)." }, { status: 400 });
  }

  // No revalida `familia` contra una lista acá: `categorias_familia_fk`
  // (20260918010000) ya rechaza un código que no exista en retail.familias,
  // con mensaje traducido por error-escritura.ts — una sola fuente de verdad.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categorias")
    .insert({ nombre, familia, prefijo, categoria_padre_id: categoriaPadreId, notas: notas || null })
    .select("id, nombre, familia, prefijo, categoria_padre_id, notas")
    .single();

  if (error) {
    return Response.json({ error: traducirError(error, "agregar la categoría") }, { status: 400 });
  }

  return Response.json({ categoria: { ...data, categoriaPadreId: data.categoria_padre_id } });
}

// PUT /api/productos/categorias → edita nombre/familia/prefijo/notas.
//
// El prefijo y el candado de nombre (por acentos/mayúsculas) los cierra
// `retail.actualizar_categoria` (20260915224500, que extendió la versión
// 20260915160000 con notas): el prefijo se rechaza si ya hay productos con
// esa categoria_id (fijo hacia adelante, decidido con Felipe 2026-09-15), y
// el nombre choca contra `categorias_nombre_clave_unica` igual que en el
// alta. Si la categoría es una hija, la familia que se manda acá se
// re-deriva sola desde el padre (mismo trigger del alta) — nunca queda
// desincronizada.
export async function PUT(request: Request) {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") {
    return Response.json({ error: "Solo un Líder puede editar una categoría." }, { status: 403 });
  }

  const cuerpo = await request.json().catch(() => null);
  const id = typeof cuerpo?.id === "string" ? cuerpo.id : "";
  const nombre = typeof cuerpo?.nombre === "string" ? cuerpo.nombre.trim() : "";
  const familia = typeof cuerpo?.familia === "string" ? cuerpo.familia : "";
  const prefijo = typeof cuerpo?.prefijo === "string" ? cuerpo.prefijo.trim().toUpperCase() : "";
  const notas = typeof cuerpo?.notas === "string" ? cuerpo.notas.trim() : "";

  if (!id) {
    return Response.json({ error: "Falta la categoría a editar." }, { status: 400 });
  }
  if (!nombre) {
    return Response.json({ error: "Falta el nombre de la categoría." }, { status: 400 });
  }
  if (!familia) {
    return Response.json({ error: "Elige una familia." }, { status: 400 });
  }
  if (!/^[A-Z]{3}$/.test(prefijo)) {
    return Response.json({ error: "El prefijo tiene que ser exactamente 3 letras (ej. BLU)." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error: errorRpc } = await supabase.rpc("actualizar_categoria", {
    p_categoria_id: id,
    p_nombre: nombre,
    p_familia: familia,
    p_prefijo: prefijo,
    p_notas: notas || null,
  });
  if (errorRpc) {
    return Response.json({ error: traducirError(errorRpc, "editar la categoría") }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("categorias")
    .select("id, nombre, familia, prefijo, activo, categoria_padre_id, notas")
    .eq("id", id)
    .single();
  if (error) {
    return Response.json({ error: traducirError(error, "leer la categoría editada") }, { status: 400 });
  }

  return Response.json({ categoria: { ...data, categoriaPadreId: data.categoria_padre_id } });
}

// PATCH /api/productos/categorias → desactiva o reactiva (nunca DELETE).
//
// Desactivar SE BLOQUEA si hay productos activos con esa categoría —
// decidido con Felipe 2026-09-15: `retail.desactivar_categoria` cuenta y
// avisa cuántos en el mensaje de error en vez de dejar seguir.
export async function PATCH(request: Request) {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") {
    return Response.json({ error: "Solo un Líder puede desactivar o reactivar una categoría." }, { status: 403 });
  }

  const cuerpo = await request.json().catch(() => null);
  const id = typeof cuerpo?.id === "string" ? cuerpo.id : "";
  const activo = typeof cuerpo?.activo === "boolean" ? cuerpo.activo : null;

  if (!id) {
    return Response.json({ error: "Falta la categoría." }, { status: 400 });
  }
  if (activo === null) {
    return Response.json({ error: "Falta indicar si se activa o desactiva." }, { status: 400 });
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc(activo ? "reactivar_categoria" : "desactivar_categoria", {
    p_categoria_id: id,
  });
  if (error) {
    return Response.json(
      { error: traducirError(error, activo ? "reactivar la categoría" : "desactivar la categoría") },
      { status: 400 }
    );
  }

  return Response.json({ ok: true });
}
