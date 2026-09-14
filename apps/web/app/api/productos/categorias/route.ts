import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { createClient } from "@/lib/supabase/server";
import { traducirError } from "@/lib/error-escritura";
import { FAMILIAS } from "@cayla-retail/shared";

// POST /api/productos/categorias → agrega una categoría dentro de una de
// las 6 familias fijas.
//
// Portado de `trix/catalogo-vocabulario` (V1) tras ADR-0035.
//
// PROMETE: la categoría queda disponible de inmediato en Productos.
// ASUME: sesión válida y rol de Líder — la policy de escritura de
//   `retail.categorias` ya lo exige.
// NO HACE: no genera el prefijo solo — lo elige la persona, a propósito: un
//   prefijo malo (ambiguo o repetido) se rechaza en el acto por
//   `categorias_prefijo_formato`/`categorias_prefijo_unico`.
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

  if (!nombre) {
    return Response.json({ error: "Falta el nombre de la categoría." }, { status: 400 });
  }
  if (!FAMILIAS.includes(familia as (typeof FAMILIAS)[number])) {
    return Response.json({ error: "Elige una de las 6 familias." }, { status: 400 });
  }
  if (!/^[A-Z]{3}$/.test(prefijo)) {
    return Response.json({ error: "El prefijo tiene que ser exactamente 3 letras (ej. BLU)." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categorias")
    .insert({ nombre, familia, prefijo })
    .select("id, nombre, familia, prefijo")
    .single();

  if (error) {
    return Response.json({ error: traducirError(error, "agregar la categoría") }, { status: 400 });
  }

  return Response.json({ categoria: data });
}
