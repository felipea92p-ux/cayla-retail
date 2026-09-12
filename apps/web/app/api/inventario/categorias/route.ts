import { requirePersonaActual } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";
import { traducirError } from "@/lib/error-escritura";
import { FAMILIAS } from "@cayla-retail/shared";

// POST /api/inventario/categorias → agrega una categoría dentro de una de las 6
// familias fijas.
//
// PROMETE: la categoría queda disponible de inmediato en el desplegable de
//   "Recibir mercadería" y "Nuevo producto" — es la misma tabla `categorias`.
// ASUME: sesión válida y rol de Líder (`categorias_insert_lider`,
//   `with check (fn_es_lider())`, 0009_categorias.sql).
// NO HACE: no genera el prefijo solo. Es la persona quien lo elige, a propósito
//   (0047_codigos.sql): un prefijo malo (ambiguo o repetido) se rechaza en el
//   acto por `categorias_prefijo_formato`/`categorias_prefijo_unico`, en vez de
//   que el sistema le entregue uno que no significa nada.
export async function POST(request: Request) {
  const persona = await requirePersonaActual();
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
