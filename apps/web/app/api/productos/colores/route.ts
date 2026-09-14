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
// ASUME: sesión válida y rol de Líder. La policy de escritura de
//   `retail.colores` ya lo exige; este chequeo es solo para devolver un
//   mensaje en idioma CAYLA en vez del 403 crudo de PostgREST.
// NO HACE: no normaliza duplicados por su cuenta. Si "Azul marino" ya
//   existe, `colores_clave_unica` lo rechaza y el mensaje se lo dice a la
//   persona — no se le oculta silenciosamente ni se fusiona con el existente.
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

export async function POST(request: Request) {
  const persona = await requirePersonaActualV2();
  if (persona.rol !== "lider") {
    return Response.json({ error: "Solo un Líder puede agregar un color al vocabulario." }, { status: 403 });
  }

  const cuerpo = await request.json().catch(() => null);
  const nombre = typeof cuerpo?.nombre === "string" ? cuerpo.nombre.trim() : "";
  const codigo = typeof cuerpo?.codigo === "string" ? cuerpo.codigo.trim().toUpperCase() : "";
  const familiaColor = typeof cuerpo?.familiaColor === "string" ? cuerpo.familiaColor : "";
  const hex = typeof cuerpo?.hex === "string" && cuerpo.hex.trim() ? cuerpo.hex.trim() : null;

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

  const supabase = await createClient();
  // orden=200: los 30 propios de CAYLA van del 10 al 92; un color agregado
  // desde esta pantalla entra después de todos ellos.
  const { data, error } = await supabase
    .from("colores")
    .insert({ codigo, nombre, familia_color: familiaColor, hex, orden: 200 })
    .select("codigo, nombre, familia_color, hex")
    .single();

  if (error) {
    return Response.json({ error: traducirError(error, "agregar el color") }, { status: 400 });
  }

  return Response.json({ color: data });
}
