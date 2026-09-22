import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
// ADR-0161: cambiar el catálogo es operación de tienda; la firma del combo «Responsable» que manda la pantalla
// viaja a la base en cada consulta de este cliente (sin firma, igual que antes).
import { firmaDeEncabezados } from "@/lib/responsable-reglas";
import { traducirError } from "@/lib/error-escritura";
import { objecionVigencia, parsearDescuento, parsearFecha } from "@/lib/etiqueta-campana";

// POST/PATCH /api/productos/etiquetas → vocabulario cerrado de etiquetas
// (ADR-0095). Mismo mecanismo que tejidos/patrones. Sin restricción por
// sede a propósito (Felipe, 2026-09-18: "empresa uniforme") — la columna
// `sedes_permitidas` sigue en el esquema, dormida, pero este endpoint ya
// no la lee ni la escribe.
export async function POST(request: Request) {
  await requirePersonaActualV2();

  const cuerpo = await request.json().catch(() => null);
  const nombre = typeof cuerpo?.nombre === "string" ? cuerpo.nombre.trim() : "";
  if (!nombre) {
    return Response.json({ error: "Falta el nombre de la etiqueta." }, { status: 400 });
  }

  const supabase = await createClient({ firma: firmaDeEncabezados(request.headers) });
  const { data, error } = await supabase.from("etiquetas").insert({ nombre }).select("id, nombre, activo, notas, estado").single();

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

  // Configurar la campaña (descuento + fechas + categorías) es una sola
  // operación: el RPC las guarda juntas o no guarda nada (`actualizar_campana_etiqueta`).
  // Se atiende aparte de los demás cambios para no dejar un PATCH a medias.
  if ("campana" in cuerpoObj) {
    const c = (cuerpoObj.campana ?? {}) as Record<string, unknown>;
    const descuento = parsearDescuento(c.descuentoPct === null || c.descuentoPct === undefined ? "" : String(c.descuentoPct));
    if (!descuento.ok) return Response.json({ error: descuento.error }, { status: 400 });
    const desde = parsearFecha(typeof c.vigenteDesde === "string" ? c.vigenteDesde : "");
    if (!desde.ok) return Response.json({ error: desde.error }, { status: 400 });
    const hasta = parsearFecha(typeof c.vigenteHasta === "string" ? c.vigenteHasta : "");
    if (!hasta.ok) return Response.json({ error: hasta.error }, { status: 400 });
    const objecion = objecionVigencia(desde.valor, hasta.valor);
    if (objecion) return Response.json({ error: objecion }, { status: 400 });
    const categoriaIds = Array.isArray(c.categoriaIds) ? c.categoriaIds : [];
    if (!categoriaIds.every((x) => typeof x === "string")) {
      return Response.json({ error: "Las categorías elegidas no son válidas." }, { status: 400 });
    }

    const supabase = await createClient({ firma: firmaDeEncabezados(request.headers) });
    const { error } = await supabase.rpc("actualizar_campana_etiqueta", {
      p_etiqueta_id: id,
      p_descuento_pct: descuento.valor as number,
      p_vigente_desde: desde.valor as string,
      p_vigente_hasta: hasta.valor as string,
      p_categoria_ids: categoriaIds as string[],
    });
    if (error) return Response.json({ error: traducirError(error, "guardar la campaña") }, { status: 400 });
    return Response.json({ ok: true });
  }

  const patch: { nombre?: string; activo?: boolean; notas?: string | null; estado?: string } = {};

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

  const supabase = await createClient({ firma: firmaDeEncabezados(request.headers) });

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

  const { data, error } = await supabase.from("etiquetas").update(patch).eq("id", id).select("id, nombre, activo, notas, estado").single();

  if (error) {
    if (error.code === "PGRST116") {
      return Response.json({ error: "No existe esa etiqueta." }, { status: 404 });
    }
    return Response.json({ error: traducirError(error, "guardar la etiqueta") }, { status: 400 });
  }

  return Response.json({ etiqueta: data });
}
