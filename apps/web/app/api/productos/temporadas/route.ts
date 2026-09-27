import { puede, requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { traducirError } from "@/lib/error-escritura";
// ADR-0161: cambiar el catálogo es operación de tienda; la firma del combo «Responsable» que manda la pantalla viaja a la
// base en cada consulta de este cliente (las tres funciones firman con `fn_actor_persona_id(true)`).
import { firmaDeEncabezados } from "@/lib/responsable-reglas";
import { MAX_ASIGNAR_POR_VEZ, ORDEN_ESTACIONES } from "@/lib/temporadas-pantalla";
import type { Estacion } from "@/lib/temporada-reglas";

// PATCH /api/productos/temporadas → la pestaña «Temporadas» de Atributos (ADR-0246, 20260928100000). Tres acciones:
//   · `fecha`     — corrige (o agrega) el inicio de una o más estaciones del calendario, todo o nada. SOLO el líder (los
//                   Admin lo son).
//   · `categoria` — la temporada por defecto de una categoría. Quien edita el catálogo.
//   · `asignar`   — la temporada de varias prendas, en UN llamado todo o nada. Quien edita el catálogo.
// El permiso se pregunta aquí para responder rápido y claro, pero quien manda es la base: cada función vuelve a
// revisarlo (`fn_es_lider`, `fn_puede_editar_catalogo`) y las reglas del calendario viven en su disparador. Los rechazos
// se traducen con `traducirError` (una sola lista de huellas, en `error-escritura.ts`).

const FUENTES = ["senamhi", "usno", "ajustada"] as const;
type Fuente = (typeof FUENTES)[number];
type FechaPedida = { anio: number; estacion: Estacion; inicio: string; fuente: Fuente };

function leerFechas(valor: unknown): FechaPedida[] | null {
  if (!Array.isArray(valor) || valor.length === 0 || valor.length > ORDEN_ESTACIONES.length) return null;
  const fechas: FechaPedida[] = [];
  for (const f of valor) {
    const anio = Number(f?.anio);
    const estacion = f?.estacion;
    const inicio = typeof f?.inicio === "string" ? f.inicio : "";
    const fuente = f?.fuente ?? "ajustada";
    if (!Number.isInteger(anio) || !ORDEN_ESTACIONES.includes(estacion) || Number.isNaN(Date.parse(inicio)) || !FUENTES.includes(fuente)) {
      return null;
    }
    fechas.push({ anio, estacion, inicio, fuente });
  }
  return fechas;
}

export async function PATCH(request: Request) {
  const persona = await requirePersonaActualV2();
  const cuerpo = await request.json().catch(() => null);
  const accion = cuerpo?.accion;
  const supabase = await createClient({ firma: firmaDeEncabezados(request.headers) });

  if (accion === "fecha") {
    if (persona.rol !== "lider") {
      return Response.json({ error: "Solo el líder puede cambiar el calendario de temporadas." }, { status: 403 });
    }
    const fechas = leerFechas(cuerpo?.fechas);
    if (!fechas) {
      return Response.json({ error: "Faltan la estación o la fecha, o no son válidas." }, { status: 400 });
    }
    // TODO O NADA: una sola llamada con todas las fechas (`fijar_fechas_temporada`, 20260928100000). La base revisa el
    // orden del ciclo con todas ya escritas; si una falla, no se guarda ninguna y el líder corrige y reintenta.
    const { data, error } = await supabase.rpc("fijar_fechas_temporada", { p_fechas: fechas });
    if (error) {
      return Response.json({ error: traducirError(error, "guardar las fechas del calendario") }, { status: error.code === "42501" ? 403 : 400 });
    }
    const guardadas = typeof data === "number" ? data : fechas.length;
    return Response.json({ ok: true, guardadas });
  }

  if (accion === "categoria" || accion === "asignar") {
    if (!puede(persona, "editarCatalogo")) {
      return Response.json({ error: "No tienes permiso para cambiar la temporada de las prendas." }, { status: 403 });
    }
  }

  if (accion === "categoria") {
    const categoriaId = typeof cuerpo?.categoriaId === "string" ? cuerpo.categoriaId : "";
    const temporada = typeof cuerpo?.temporada === "string" ? cuerpo.temporada.trim() : "";
    if (!categoriaId) {
      return Response.json({ error: "Falta la categoría." }, { status: 400 });
    }
    // Vacío = la categoría queda sin temporada por defecto (la base lo guarda como null).
    const { error } = await supabase.rpc("asignar_temporada_categoria", { p_categoria_id: categoriaId, p_temporada: temporada || null });
    if (error) {
      return Response.json({ error: traducirError(error, "cambiar la temporada de la categoría") }, { status: error.code === "42501" ? 403 : 400 });
    }
    return Response.json({ ok: true });
  }

  if (accion === "asignar") {
    const temporada = typeof cuerpo?.temporada === "string" ? cuerpo.temporada.trim() : "";
    const crudos: unknown[] = Array.isArray(cuerpo?.productoIds) ? cuerpo.productoIds : [];
    const ids = [...new Set(crudos.filter((v): v is string => typeof v === "string" && v.length > 0))];
    if (!temporada) {
      return Response.json({ error: "Elige la temporada que se les pone." }, { status: 400 });
    }
    if (ids.length === 0) {
      return Response.json({ error: "Marca al menos una prenda." }, { status: 400 });
    }
    if (ids.length > MAX_ASIGNAR_POR_VEZ) {
      return Response.json({ error: `Son demasiadas prendas de una vez (máximo ${MAX_ASIGNAR_POR_VEZ}).` }, { status: 400 });
    }

    // Una sola llamada: todas o ninguna. Se asigna al PRODUCTO (lo normal); la excepción por color se pone en la ficha.
    // `p_solo_sin_temporada`: la lista pudo cargarse hace rato; si desde entonces alguien le puso temporada a una de las
    // marcadas (en su ficha, o a su categoría), la base la salta en vez de pisarla, con la fila ya bloqueada.
    const { data, error } = await supabase.rpc("asignar_temporadas", {
      p_items: ids.map((producto_id) => ({ producto_id, temporada })),
      p_solo_sin_temporada: true,
    });
    if (error) {
      return Response.json({ error: traducirError(error, "asignar la temporada") }, { status: error.code === "42501" ? 403 : 400 });
    }
    const asignadas = typeof data === "number" ? data : 0;
    return Response.json({ ok: true, cambios: asignadas, asignadas, saltadas: ids.length - asignadas });
  }

  return Response.json({ error: "Acción desconocida." }, { status: 400 });
}
