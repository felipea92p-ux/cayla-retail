import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { traducirError } from "@/lib/error-escritura";

// POST/PATCH /api/productos/etiquetas → vocabulario cerrado de etiquetas
// (ADR-0095). Mismo mecanismo que tejidos/patrones, con un campo propio:
// `sedes_permitidas` — un dato que solo `registrar_venta`/`transferir`
// hacen cumplir de verdad, este endpoint no valida su contenido más allá
// de la forma (array de uuid o null).
export async function POST(request: Request) {
  await requirePersonaActualV2();

  const cuerpo = await request.json().catch(() => null);
  const nombre = typeof cuerpo?.nombre === "string" ? cuerpo.nombre.trim() : "";
  if (!nombre) {
    return Response.json({ error: "Falta el nombre de la etiqueta." }, { status: 400 });
  }
  const sedesPermitidas = Array.isArray(cuerpo?.sedesPermitidas) && cuerpo.sedesPermitidas.length > 0 ? cuerpo.sedesPermitidas : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("etiquetas")
    .insert({ nombre, sedes_permitidas: sedesPermitidas })
    .select("id, nombre, activo, sedes_permitidas, notas, estado")
    .single();

  if (error) {
    return Response.json({ error: traducirError(error, "agregar la etiqueta") }, { status: 400 });
  }

  return Response.json({ etiqueta: data });
}

export async function PATCH(request: Request) {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") {
    return Response.json({ error: "Solo un Líder puede editar el vocabulario de etiquetas." }, { status: 403 });
  }

  const cuerpo = await request.json().catch(() => null);
  const id = typeof cuerpo?.id === "string" ? cuerpo.id : "";
  if (!id) {
    return Response.json({ error: "Falta la etiqueta a editar." }, { status: 400 });
  }

  const cuerpoObj: Record<string, unknown> = cuerpo ?? {};
  const patch: { nombre?: string; activo?: boolean; notas?: string | null; estado?: string; sedes_permitidas?: string[] | null } = {};

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

  if ("sedesPermitidas" in cuerpoObj) {
    const sedes = cuerpoObj.sedesPermitidas;
    patch.sedes_permitidas = Array.isArray(sedes) && sedes.length > 0 ? (sedes as string[]) : null;
  }

  const supabase = await createClient();

  if ("activo" in cuerpoObj) {
    const activo = cuerpoObj.activo === true;
    if (!activo) {
      // El trigger de la base solo desactiva sola cuando rechaza una
      // propuesta pendiente — una desactivación directa sobre una etiqueta
      // aprobada no pasa por él, así que el candado "en uso" vive acá.
      const { count, error: errorConteo } = await supabase
        .from("variante_etiquetas")
        .select("variante_id", { count: "exact", head: true })
        .eq("etiqueta_id", id);
      if (errorConteo) {
        return Response.json({ error: traducirError(errorConteo, "revisar las variantes con esta etiqueta") }, { status: 400 });
      }
      if ((count ?? 0) > 0) {
        const n = count ?? 0;
        return Response.json(
          { error: `No se puede desactivar: ${n} variante${n === 1 ? "" : "s"} todavía ${n === 1 ? "tiene" : "tienen"} esta etiqueta aplicada.` },
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
    .from("etiquetas")
    .update(patch)
    .eq("id", id)
    .select("id, nombre, activo, sedes_permitidas, notas, estado")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return Response.json({ error: "No existe esa etiqueta." }, { status: 404 });
    }
    return Response.json({ error: traducirError(error, "guardar la etiqueta") }, { status: 400 });
  }

  return Response.json({ etiqueta: data });
}
