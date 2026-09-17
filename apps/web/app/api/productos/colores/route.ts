import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { traducirError } from "@/lib/error-escritura";

// POST /api/productos/colores → agrega un color al vocabulario cerrado.
//
// Portado de `trix/catalogo-vocabulario` (V1) tras ADR-0035: el candado real
// (`colores_clave_unica`, `retail.fn_clave_texto`) y los 30 colores de CAYLA
// ya viven en `retail.colores` — a esta pantalla le tocaba nacer.
//
// PROMETE: el color queda disponible de inmediato para cualquier prenda
//   nueva o existente — es la misma tabla que ya usa `getCatalogo()`
//   (lib/catalogo-v2.ts) para la pantalla de Productos.
// ASUME: sesión válida (cualquier persona activa, no solo Líder — decisión
//   2026-09-16: "cualquiera propone, un Líder aprueba"). Quién propone no se
//   valida acá: el estado real (`pendiente`/`aprobado`) lo decide un trigger
//   en la base (`retail.fn_colores_estado_trigger`,
//   `20260916220000_colores_proponer_aprobar.sql`) mirando si quien llama es
//   Líder — nunca lo que mande este endpoint.
// NO HACE: no normaliza duplicados por su cuenta. Si "Azul marino" ya
//   existe, `colores_clave_unica` lo rechaza y el mensaje se lo dice a la
//   persona — no se le oculta silenciosamente ni se fusiona con el existente.
//   Tampoco hace falta una pantalla de "fusionar": ese mismo candado hace
//   imposible que dos colores equivalentes convivan como filas distintas.
const FAMILIAS_COLOR = [
  "neutro",
  "azul",
  "rojo",
  "amarillo",
  "verde",
  "morado",
  "tierra",
  "metalico",
  "estampado",
] as const;

// Naturaleza visual del color (20260915230000_colores_tipo_y_muestra.sql) —
// ortogonal a FAMILIAS_COLOR (matiz): un mismo tipo cruza todas las familias.
const TIPOS_COLOR = ["solido", "textura", "estampado"] as const;

export async function POST(request: Request) {
  // Sin `requirePersonaActualV2()` guardando la puerta, esta ruta sería
  // alcanzable sin sesión — sigue siendo la puerta de entrada, solo dejó de
  // exigir Líder. El resultado (`estado`) no lo elige nadie de acá.
  await requirePersonaActualV2();

  const cuerpo = await request.json().catch(() => null);
  const nombre = typeof cuerpo?.nombre === "string" ? cuerpo.nombre.trim() : "";
  const codigo = typeof cuerpo?.codigo === "string" ? cuerpo.codigo.trim().toUpperCase() : "";
  const familiaColor = typeof cuerpo?.familiaColor === "string" ? cuerpo.familiaColor : "";
  const hex = typeof cuerpo?.hex === "string" && cuerpo.hex.trim() ? cuerpo.hex.trim() : null;
  const tipo = typeof cuerpo?.tipo === "string" && cuerpo.tipo ? cuerpo.tipo : "solido";
  const imagenMuestraUrl = typeof cuerpo?.imagenMuestraUrl === "string" && cuerpo.imagenMuestraUrl.trim() ? cuerpo.imagenMuestraUrl.trim() : null;
  const notas = typeof cuerpo?.notas === "string" && cuerpo.notas.trim() ? cuerpo.notas.trim() : null;

  if (!nombre) {
    return Response.json({ error: "Falta el nombre del color." }, { status: 400 });
  }
  if (!/^[A-Z]{3}$/.test(codigo)) {
    return Response.json({ error: "El código tiene que ser exactamente 3 letras (ej. VEB)." }, { status: 400 });
  }
  if (!FAMILIAS_COLOR.includes(familiaColor as (typeof FAMILIAS_COLOR)[number])) {
    return Response.json({ error: "Elige una familia de color de la lista." }, { status: 400 });
  }
  if (hex && !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    return Response.json({ error: "El color tiene que ser un hex válido (#RRGGBB)." }, { status: 400 });
  }
  if (!TIPOS_COLOR.includes(tipo as (typeof TIPOS_COLOR)[number])) {
    return Response.json({ error: "Elige un tipo de color de la lista (sólido, textura o estampado)." }, { status: 400 });
  }

  const supabase = await createClient();
  // orden=200: los 30 propios de CAYLA van del 10 al 92; un color agregado
  // desde esta pantalla entra después de todos ellos.
  const { data, error } = await supabase
    .from("colores")
    .insert({ codigo, nombre, familia_color: familiaColor, hex, orden: 200, tipo, imagen_muestra_url: imagenMuestraUrl, notas })
    .select("codigo, nombre, familia_color, hex, tipo, imagen_muestra_url, notas, estado")
    .single();

  if (error) {
    return Response.json({ error: traducirError(error, "agregar el color") }, { status: 400 });
  }

  return Response.json({ color: data });
}

// PATCH /api/productos/colores → edita nombre/hex/familia/orden, o
// desactiva/reactiva vía `activo`. Nunca borra la fila (principio 3 del
// CLAUDE.md): desactivar es un update de `activo`, no un DELETE.
//
// Antes de desactivar, se cuenta cuántas `variantes` activas todavía usan
// este `color_codigo` — si hay alguna, se bloquea. Dejar desactivar un color
// con prendas activas colgando de él sería el mismo estado imposible que el
// candado de nombre único ya evita del otro lado (principio 2).
export async function PATCH(request: Request) {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") {
    return Response.json({ error: "Solo un Líder puede editar el vocabulario de colores." }, { status: 403 });
  }

  const cuerpo = await request.json().catch(() => null);
  const codigo = typeof cuerpo?.codigo === "string" ? cuerpo.codigo.trim().toUpperCase() : "";
  if (!/^[A-Z]{3}$/.test(codigo)) {
    return Response.json({ error: "El código tiene que ser exactamente 3 letras (ej. VEB)." }, { status: 400 });
  }

  const cuerpoObj: Record<string, unknown> = cuerpo ?? {};
  const patch: {
    nombre?: string;
    familia_color?: string;
    hex?: string | null;
    orden?: number;
    activo?: boolean;
    tipo?: string;
    imagen_muestra_url?: string | null;
    notas?: string | null;
    estado?: string;
  } = {};

  // Aprobar (pendiente→aprobado, o rechazado→aprobado = "reactivar retira
  // el rechazo") o rechazar (pendiente→rechazado, con motivo opcional en
  // notas) — el candado real de qué transición es válida vive en el
  // trigger (`fn_colores_estado_trigger`, 20260917120000), esto solo pasa
  // el valor que pidió la persona.
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

  if ("familiaColor" in cuerpoObj) {
    if (!FAMILIAS_COLOR.includes(cuerpoObj.familiaColor as (typeof FAMILIAS_COLOR)[number])) {
      return Response.json({ error: "Elige una familia de color de la lista." }, { status: 400 });
    }
    patch.familia_color = cuerpoObj.familiaColor as string;
  }

  if ("hex" in cuerpoObj) {
    const hex = typeof cuerpoObj.hex === "string" && cuerpoObj.hex.trim() ? cuerpoObj.hex.trim() : null;
    if (hex && !/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      return Response.json({ error: "El color tiene que ser un hex válido (#RRGGBB)." }, { status: 400 });
    }
    patch.hex = hex;
  }

  if ("orden" in cuerpoObj) {
    const orden = Number(cuerpoObj.orden);
    if (!Number.isInteger(orden) || orden < 0) {
      return Response.json({ error: "El orden tiene que ser un número entero de 0 para arriba." }, { status: 400 });
    }
    patch.orden = orden;
  }

  if ("tipo" in cuerpoObj) {
    if (!TIPOS_COLOR.includes(cuerpoObj.tipo as (typeof TIPOS_COLOR)[number])) {
      return Response.json({ error: "Elige un tipo de color de la lista (sólido, textura o estampado)." }, { status: 400 });
    }
    patch.tipo = cuerpoObj.tipo as string;
  }

  if ("imagenMuestraUrl" in cuerpoObj) {
    patch.imagen_muestra_url = typeof cuerpoObj.imagenMuestraUrl === "string" && cuerpoObj.imagenMuestraUrl.trim() ? cuerpoObj.imagenMuestraUrl.trim() : null;
  }

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
        .eq("color_codigo", codigo)
        .eq("activo", true);
      if (errorConteo) {
        return Response.json({ error: traducirError(errorConteo, "revisar las variantes de este color") }, { status: 400 });
      }
      if ((count ?? 0) > 0) {
        const n = count ?? 0;
        return Response.json(
          {
            error: `No se puede desactivar: ${n} variante${n === 1 ? "" : "s"} activa${n === 1 ? "" : "s"} todavía ${n === 1 ? "usa" : "usan"} este color.`,
          },
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
    .from("colores")
    .update(patch)
    .eq("codigo", codigo)
    .select("codigo, nombre, familia_color, hex, orden, activo, tipo, imagen_muestra_url, notas, estado")
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return Response.json({ error: `No existe un color con código ${codigo}.` }, { status: 404 });
    }
    return Response.json({ error: traducirError(error, "guardar el color") }, { status: 400 });
  }

  return Response.json({ color: data });
}
