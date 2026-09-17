import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { traducirError } from "@/lib/error-escritura";

// POST/PATCH /api/productos/tallas → vocabulario cerrado de tallas
// (ADR-0075/0076). Mismo mecanismo que colores/tejidos/patrones, con una
// diferencia real: aprobar exige `notas` no vacío — el trigger
// (`fn_tallas_estado_trigger`) lo rechaza si llega vacío, este endpoint
// solo pasa lo que mandó la persona, no valida el contenido del comentario.
export async function POST(request: Request) {
  await requirePersonaActualV2();

  const cuerpo = await request.json().catch(() => null);
  const valor = typeof cuerpo?.valor === "string" ? cuerpo.valor.trim() : "";
  if (!valor) {
    return Response.json({ error: "Falta el valor de la talla." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("tallas").insert({ valor }).select("id, valor, activo, notas, estado").single();

  if (error) {
    return Response.json({ error: traducirError(error, "agregar la talla") }, { status: 400 });
  }

  return Response.json({ talla: data });
}

export async function PATCH(request: Request) {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") {
    return Response.json({ error: "Solo un Líder puede editar el vocabulario de tallas." }, { status: 403 });
  }

  const cuerpo = await request.json().catch(() => null);
  const id = typeof cuerpo?.id === "string" ? cuerpo.id : "";
  if (!id) {
    return Response.json({ error: "Falta la talla a editar." }, { status: 400 });
  }

  const cuerpoObj: Record<string, unknown> = cuerpo ?? {};
  const patch: { valor?: string; activo?: boolean; notas?: string | null; estado?: string } = {};

  if ("estado" in cuerpoObj) {
    if (cuerpoObj.estado !== "aprobado" && cuerpoObj.estado !== "rechazado") {
      return Response.json({ error: "El estado solo puede pasar a 'aprobado' o 'rechazado'." }, { status: 400 });
    }
    patch.estado = cuerpoObj.estado;
  }

  if ("valor" in cuerpoObj) {
    const valor = typeof cuerpoObj.valor === "string" ? cuerpoObj.valor.trim() : "";
    if (!valor) {
      return Response.json({ error: "El valor no puede quedar vacío." }, { status: 400 });
    }
    patch.valor = valor;
  }

  // Sin normalizar acá: si `estado` pasa a 'aprobado' y `notas` llega
  // vacío, el trigger de la base lo rechaza igual — este endpoint no
  // duplica esa regla, solo la deja pasar hasta la base (principio 2:
  // el candado real vive en un solo lugar).
  if ("notas" in cuerpoObj) {
    patch.notas = typeof cuerpoObj.notas === "string" && cuerpoObj.notas.trim() ? cuerpoObj.notas.trim() : null;
  }

  const supabase = await createClient();

  if ("activo" in cuerpoObj) {
    const activo = cuerpoObj.activo === true;
    if (!activo) {
      const { count, error: errorConteo } = await supabase
        .from("variantes")
        .select("id", { count: "exact", head: true })
        .eq("talla_id", id)
        .eq("activo", true);
      if (errorConteo) {
        return Response.json({ error: traducirError(errorConteo, "revisar las variantes de esta talla") }, { status: 400 });
      }
      if ((count ?? 0) > 0) {
        const n = count ?? 0;
        return Response.json(
          { error: `No se puede desactivar: ${n} variante${n === 1 ? "" : "s"} activa${n === 1 ? "" : "s"} todavía ${n === 1 ? "usa" : "usan"} esta talla.` },
          { status: 409 }
        );
      }
    }
    patch.activo = activo;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "No hay cambios para guardar." }, { status: 400 });
  }

  const { data, error } = await supabase.from("tallas").update(patch).eq("id", id).select("id, valor, activo, notas, estado").single();

  if (error) {
    if (error.code === "PGRST116") {
      return Response.json({ error: "No existe esa talla." }, { status: 404 });
    }
    return Response.json({ error: traducirError(error, "guardar la talla") }, { status: 400 });
  }

  return Response.json({ talla: data });
}
