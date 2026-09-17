import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { traducirError } from "@/lib/error-escritura";

// POST/PATCH /api/productos/tejidos → vocabulario cerrado de tejidos
// (ADR-0072/0073), mismo mecanismo y misma forma que
// /api/productos/colores: cualquiera con sesión propone (nace 'pendiente'
// y usable al instante, salvo `fn_es_lider()`), un Líder aprueba/rechaza.
// El estado real lo decide el trigger en la base
// (`fn_tejidos_estado_trigger`), nunca lo que mande este endpoint.
export async function POST(request: Request) {
  await requirePersonaActualV2();

  const cuerpo = await request.json().catch(() => null);
  const nombre = typeof cuerpo?.nombre === "string" ? cuerpo.nombre.trim() : "";
  if (!nombre) {
    return Response.json({ error: "Falta el nombre del tejido." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.from("tejidos").insert({ nombre }).select("id, nombre, activo, notas, estado").single();

  if (error) {
    return Response.json({ error: traducirError(error, "agregar el tejido") }, { status: 400 });
  }

  return Response.json({ tejido: data });
}

// PATCH: aprobar (pendiente→aprobado, o rechazado→aprobado = reactivar),
// rechazar (pendiente→rechazado, motivo opcional en notas), o
// activar/desactivar directo — igual que colores, sin candado de rol
// especial más allá de `puede_editar` (RLS: `tejidos_update_lider`, la
// base es quien de verdad lo hace cumplir).
export async function PATCH(request: Request) {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") {
    return Response.json({ error: "Solo un Líder puede editar el vocabulario de tejidos." }, { status: 403 });
  }

  const cuerpo = await request.json().catch(() => null);
  const id = typeof cuerpo?.id === "string" ? cuerpo.id : "";
  if (!id) {
    return Response.json({ error: "Falta el tejido a editar." }, { status: 400 });
  }

  const cuerpoObj: Record<string, unknown> = cuerpo ?? {};
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

  const supabase = await createClient();

  if ("activo" in cuerpoObj) {
    const activo = cuerpoObj.activo === true;
    if (!activo) {
      const { count, error: errorConteo } = await supabase
        .from("productos")
        .select("id", { count: "exact", head: true })
        .eq("tejido_id", id)
        .eq("estado", "activo");
      if (errorConteo) {
        return Response.json({ error: traducirError(errorConteo, "revisar los productos de este tejido") }, { status: 400 });
      }
      if ((count ?? 0) > 0) {
        const n = count ?? 0;
        return Response.json(
          { error: `No se puede desactivar: ${n} producto${n === 1 ? "" : "s"} activo${n === 1 ? "" : "s"} todavía ${n === 1 ? "usa" : "usan"} este tejido.` },
          { status: 409 }
        );
      }
    }
    patch.activo = activo;
  }

  if (Object.keys(patch).length === 0) {
    return Response.json({ error: "No hay cambios para guardar." }, { status: 400 });
  }

  const { data, error } = await supabase.from("tejidos").update(patch).eq("id", id).select("id, nombre, activo, notas, estado").single();

  if (error) {
    if (error.code === "PGRST116") {
      return Response.json({ error: "No existe ese tejido." }, { status: 404 });
    }
    return Response.json({ error: traducirError(error, "guardar el tejido") }, { status: 400 });
  }

  return Response.json({ tejido: data });
}
