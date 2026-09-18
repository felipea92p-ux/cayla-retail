import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { traducirError } from "@/lib/error-escritura";

// POST/PATCH /api/productos/patrones → vocabulario cerrado de patrones
// (ADR-0095/0096), mismo mecanismo y misma forma que
// /api/productos/tejidos: cualquiera con sesión propone (nace 'pendiente'
// y usable al instante, salvo `fn_es_lider()`), un Líder aprueba/rechaza.
// `imagenMuestraUrl` (20260918140000) es igual que en /colores: la URL ya
// viene subida al bucket desde el navegador, acá solo se guarda.
export async function POST(request: Request) {
  await requirePersonaActualV2();

  const cuerpo = await request.json().catch(() => null);
  const nombre = typeof cuerpo?.nombre === "string" ? cuerpo.nombre.trim() : "";
  if (!nombre) {
    return Response.json({ error: "Falta el nombre del patrón." }, { status: 400 });
  }
  const imagenMuestraUrl = typeof cuerpo?.imagenMuestraUrl === "string" && cuerpo.imagenMuestraUrl.trim() ? cuerpo.imagenMuestraUrl.trim() : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("patrones")
    .insert({ nombre, imagen_muestra_url: imagenMuestraUrl })
    .select("id, nombre, activo, notas, estado, imagen_muestra_url")
    .single();

  if (error) {
    return Response.json({ error: traducirError(error, "agregar el patrón") }, { status: 400 });
  }

  return Response.json({ patron: data });
}

export async function PATCH(request: Request) {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") {
    return Response.json({ error: "Solo un Líder puede editar el vocabulario de patrones." }, { status: 403 });
  }

  const cuerpo = await request.json().catch(() => null);
  const id = typeof cuerpo?.id === "string" ? cuerpo.id : "";
  if (!id) {
    return Response.json({ error: "Falta el patrón a editar." }, { status: 400 });
  }

  const cuerpoObj: Record<string, unknown> = cuerpo ?? {};
  const patch: { nombre?: string; activo?: boolean; notas?: string | null; estado?: string; imagen_muestra_url?: string | null } = {};

  if ("estado" in cuerpoObj) {
    if (cuerpoObj.estado !== "aprobado" && cuerpoObj.estado !== "rechazado") {
      return Response.json({ error: "El estado solo puede pasar a 'aprobado' o 'rechazado'." }, { status: 400 });
    }
    patch.estado = cuerpoObj.estado;
  }

  if ("nombre" in cuerpoObj) {
    const nombre = typeof cuerpoObj.nombre === "string" ? cuerpoObj.nombre.trim() : "";
    if (!nombre) {
      return Response.json({ error: "El nombre no puede quedar vacío." }, { status: 400 });
    }
    patch.nombre = nombre;
  }

  if ("notas" in cuerpoObj) {
    patch.notas = typeof cuerpoObj.notas === "string" && cuerpoObj.notas.trim() ? cuerpoObj.notas.trim() : null;
  }

  if ("imagenMuestraUrl" in cuerpoObj) {
    patch.imagen_muestra_url = typeof cuerpoObj.imagenMuestraUrl === "string" && cuerpoObj.imagenMuestraUrl.trim() ? cuerpoObj.imagenMuestraUrl.trim() : null;
  }

  const supabase = await createClient();

  if ("activo" in cuerpoObj) {
    const activo = cuerpoObj.activo === true;
    if (!activo) {
      const { count, error: errorConteo } = await supabase
        .from("productos")
        .select("id", { count: "exact", head: true })
        .eq("patron_id", id)
        .eq("estado", "activo");
      if (errorConteo) {
        return Response.json({ error: traducirError(errorConteo, "revisar los productos de este patrón") }, { status: 400 });
      }
      if ((count ?? 0) > 0) {
        const n = count ?? 0;
        return Response.json(
          { error: `No se puede desactivar: ${n} producto${n === 1 ? "" : "s"} activo${n === 1 ? "" : "s"} todavía ${n === 1 ? "usa" : "usan"} este patrón.` },
          { status: 409 }
        );
      }
    }
    patch.activo = activo;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "No hay cambios para guardar." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("patrones")
    .update(patch)
    .eq("id", id)
    .select("id, nombre, activo, notas, estado, imagen_muestra_url")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return Response.json({ error: "No existe ese patrón." }, { status: 404 });
    }
    return Response.json({ error: traducirError(error, "guardar el patrón") }, { status: 400 });
  }

  return Response.json({ patron: data });
}
