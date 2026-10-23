import { puede, requirePersonaActualV2, veModulo } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
// ADR-0161: cambiar el catálogo es operación de tienda; la firma del combo «Responsable» que manda la pantalla
// viaja a la base en cada consulta de este cliente (sin firma, igual que antes).
import { firmaDeEncabezados } from "@/lib/responsable-reglas";
import { traducirError } from "@/lib/error-escritura";
import { objecionVigencia, parsearDescuento, parsearFecha } from "@/lib/etiqueta-campana";
import { estiloConocido } from "@/lib/etiqueta-grupos";
import { dibujoElegido } from "@cayla-retail/shared/insignias-visual";
import { esRutaDeImagenDeInsignia, imagenEsDeLaInsignia } from "@cayla-retail/shared/insignia-imagen";

// POST/PATCH /api/productos/etiquetas → vocabulario cerrado de etiquetas
// (ADR-0095). Mismo mecanismo que tejidos/patrones. Sin restricción por
// sede a propósito (Felipe, 2026-09-18: "empresa uniforme") — la columna
// `sedes_permitidas` sigue en el esquema, dormida, pero este endpoint ya
// no la lee ni la escribe.
const COLUMNAS_FILA = "id, nombre, activo, notas, estado, icono, icono_imagen";

/** La función todavía no está en esta base (PostgREST no la encuentra): se sigue por el camino de antes. */
const faltaLaFuncion = (e: { code?: string }) => e.code === "PGRST202" || e.code === "42883";

export async function POST(request: Request) {
  await requirePersonaActualV2();

  const cuerpo = await request.json().catch(() => null);
  const nombre = typeof cuerpo?.nombre === "string" ? cuerpo.nombre.trim() : "";
  if (!nombre) {
    return Response.json({ error: "Falta el nombre de la etiqueta." }, { status: 400 });
  }

  // El dibujo que se eligió al crearla (ADR-0490): una clave de la lista de `shared`, o nada (se dibuja por el nombre).
  const iconoPedido = cuerpo?.icono;
  const icono = iconoPedido === undefined || iconoPedido === null ? null : dibujoElegido(iconoPedido);
  if (iconoPedido !== undefined && iconoPedido !== null && icono === null) {
    return Response.json({ error: "Ese dibujo no existe. Elige uno de la lista." }, { status: 400 });
  }
  // Desde Catálogo ▸ Campañas nace con estilo `campana`; desde Insignias, sin estilo (la base pone «neutral»). ADR-0473.
  const estilo = cuerpo?.estilo === undefined ? undefined : estiloConocido(String(cuerpo.estilo));
  const supabase = await createClient({ firma: firmaDeEncabezados(request.headers) });
  // Una campaña se crea con `crear_campana` (ADR-0476): corre con permisos propios y pide la llave de los tres módulos (Campañas,
  // Campañas de la tienda web o Insignias); un alta directa en la tabla la dejaría «por aprobar» para quien no ve Insignias.
  if (estilo === "campana") {
    // Sin tipos generados todavía (ADR-0476 no está en el volcado): se nombra a mano.
    const creada = (await supabase.rpc("crear_campana" as never, { p_nombre: nombre } as never)) as unknown as { data: string | null; error: { code?: string; message: string } | null };
    if (!creada.error) {
      const { data: fila, error: errorFila } = await supabase.from("etiquetas").select(COLUMNAS_FILA).eq("id", creada.data as string).single();
      if (errorFila) return Response.json({ error: traducirError(errorFila, "leer la campaña recién creada", { lectura: true }) }, { status: 400 });
      // Su dibujo se fija después, por la misma puerta que usa cambiarlo (`crear_campana` no cambia de firma). Si esa segunda escritura
      // falla, la campaña ya existe y se ve por su nombre: se crea igual y se dice.
      if (icono) {
        const fijado = await supabase.rpc("fijar_icono_etiqueta", { p_etiqueta_id: creada.data as string, p_icono: icono });
        if (fijado.error) return Response.json({ etiqueta: fila, avisoDibujo: traducirError(fijado.error, "guardar el dibujo de la campaña") });
        return Response.json({ etiqueta: { ...fila, icono } });
      }
      return Response.json({ etiqueta: fila });
    }
    if (!faltaLaFuncion(creada.error)) return Response.json({ error: traducirError(creada.error, "agregar la campaña") }, { status: 400 });
    // Una base sin ADR-0476 todavía: el camino de antes (el alta directa, con su estilo).
  }
  const { data, error } = await supabase
    .from("etiquetas")
    .insert({ nombre, ...(estilo ? { estilo } : {}), ...(icono ? { icono } : {}) })
    .select(COLUMNAS_FILA)
    .single();

  if (error) {
    return Response.json({ error: traducirError(error, estilo === "campana" ? "agregar la campaña" : "agregar la insignia") }, { status: 400 });
  }

  return Response.json({ etiqueta: data });
}

export async function PATCH(request: Request) {
  // 20260923130000: el líder o un rol con el módulo Etiquetas (`editarEtiquetas`). Lo que lleva descuento sigue siendo del
  // líder: se dice aquí con palabras y la base lo vuelve a exigir (política `etiquetas_update`, `fn_puede_tocar_etiqueta`).
  const persona = await requirePersonaActualV2();
  // Una campaña también la edita quien ve Campañas o Campañas de la tienda web (Felipe 2026-10-22, ADR-0473); la base decide
  // fila por fila (`fn_puede_tocar_etiqueta`: una campaña pide `fn_puede_campanas`, una insignia `fn_puede_editar_etiquetas`).
  if (!puede(persona, "editarEtiquetas") && !veModulo(persona, "campanas") && !veModulo(persona, "campanas_web")) {
    return Response.json({ error: "Editar insignias o campañas necesita el módulo Insignias o Campañas en tu rol." }, { status: 403 });
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
    // Quién pone el descuento lo decide la base (`actualizar_campana_etiqueta`): ADR-0293 lo abrió a Insignias y ADR-0476 a los tres
    // módulos de campañas. Aquí ya no se pide ser líder.
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

    // ADR-0486: dónde rige el descuento. Si la hoja no manda `sedeIds` (no las ofreció), no se toca lo que tiene la campaña; si manda
    // una lista, la base la guarda junto con lo demás (vacía = todas las sedes).
    const sedeIds = "sedeIds" in c ? c.sedeIds : undefined;
    if (sedeIds !== undefined && (!Array.isArray(sedeIds) || !sedeIds.every((x) => typeof x === "string"))) {
      return Response.json({ error: "Las sedes elegidas no son válidas." }, { status: 400 });
    }

    const supabase = await createClient({ firma: firmaDeEncabezados(request.headers) });
    const argumentos = {
      p_etiqueta_id: id,
      p_descuento_pct: descuento.valor as number,
      p_vigente_desde: desde.valor as string,
      p_vigente_hasta: hasta.valor as string,
      p_categoria_ids: categoriaIds as string[],
    };
    const { error } =
      sedeIds === undefined
        ? await supabase.rpc("actualizar_campana_etiqueta", argumentos)
        : await supabase.rpc("actualizar_campana_etiqueta_con_sedes", { ...argumentos, p_sede_ids: sedeIds as string[] });
    if (error) return Response.json({ error: traducirError(error, "guardar la campaña") }, { status: 400 });
    return Response.json({ ok: true });
  }

  // El dibujo (ADR-0490) se cambia por su función (`fijar_icono_etiqueta`): la llave es la de cada etiqueta (una campaña, la de las
  // campañas; otra insignia, Insignias) y la fila se toma primero. Un dibujo de la lista (`icono`) o una imagen propia ya subida al almacén
  // (`imagen`, su ruta); nunca los dos, y fijar uno borra el otro. Solo ese cambio: nada más viaja en el mismo pedido.
  if ("icono" in cuerpoObj || "imagen" in cuerpoObj) {
    const pedidoIcono = cuerpoObj.icono ?? null;
    const pedidoImagen = cuerpoObj.imagen ?? null;
    const icono = pedidoIcono === null ? null : dibujoElegido(pedidoIcono);
    if (pedidoIcono !== null && icono === null) return Response.json({ error: "Ese dibujo no existe. Elige uno de la lista." }, { status: 400 });
    // La imagen tiene que ser una ruta que el ERP pudo subir y de ESTA insignia: nunca una dirección ni la de otra.
    const imagen = pedidoImagen === null ? null : esRutaDeImagenDeInsignia(pedidoImagen) && imagenEsDeLaInsignia(pedidoImagen, id) ? pedidoImagen : undefined;
    if (imagen === undefined) return Response.json({ error: "Esa imagen no es válida para esta insignia." }, { status: 400 });
    if (icono !== null && imagen !== null) return Response.json({ error: "Elige un dibujo de la lista o una imagen propia, no los dos." }, { status: 400 });
    const supabase = await createClient({ firma: firmaDeEncabezados(request.headers) });
    const { error } = await supabase.rpc("fijar_icono_etiqueta", { p_etiqueta_id: id, p_icono: icono, p_imagen: imagen });
    if (error) return Response.json({ error: traducirError(error, "cambiar el dibujo") }, { status: 400 });
    return Response.json({ ok: true, icono, imagen });
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
        return Response.json({ error: traducirError(errorConteo, "revisar las variantes con esta etiqueta", { lectura: true }) }, { status: 400 });
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

  // Desactivar o reactivar una CAMPAÑA va por `activar_campana` (ADR-0476): la política de la tabla sigue pidiendo Insignias, y con solo
  // Campañas o Campañas de la tienda web el cambio directo no encontraría la fila. La función repite el candado de «en uso».
  if (Object.keys(patch).length === 1 && "activo" in patch) {
    const { data: fila } = await supabase.from("etiquetas").select("estilo").eq("id", id).maybeSingle();
    if (fila?.estilo === "campana") {
      const r = (await supabase.rpc("activar_campana" as never, { p_id: id, p_activo: patch.activo } as never)) as unknown as { error: { code?: string; message: string } | null };
      if (!r.error) {
        const { data: lista, error: errorLista } = await supabase.from("etiquetas").select(COLUMNAS_FILA).eq("id", id).single();
        if (errorLista) return Response.json({ error: traducirError(errorLista, "leer la campaña", { lectura: true }) }, { status: 400 });
        return Response.json({ etiqueta: lista });
      }
      if (!faltaLaFuncion(r.error)) return Response.json({ error: traducirError(r.error, "guardar los cambios") }, { status: 400 });
      // Una base sin ADR-0476 todavía: el camino de antes.
    }
  }

  const { data, error } = await supabase.from("etiquetas").update(patch).eq("id", id).select(COLUMNAS_FILA).single();

  if (error) {
    if (error.code === "PGRST116") {
      return Response.json({ error: "No existe esa etiqueta." }, { status: 404 });
    }
    return Response.json({ error: traducirError(error, "guardar los cambios") }, { status: 400 });
  }

  return Response.json({ etiqueta: data });
}
