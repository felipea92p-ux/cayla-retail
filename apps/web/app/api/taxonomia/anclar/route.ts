import { requirePersonaActual } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";
import { anclar } from "@/lib/taxonomia/anclar-ia";
import { permitirLlamada, traducirErrorIA } from "@/lib/ia/cliente";
import {
  getCategoriasPropias,
  getCategoriasUniversales,
  getColoresPropios,
  getColoresUniversales,
} from "@/lib/taxonomia/consultas";

// POST /api/taxonomia/anclar   → PROPONE (llama a la IA, no escribe nada)
// PUT  /api/taxonomia/anclar   → GUARDA los anclajes que la persona confirmó
//
// CONTRATO
//   PROMETE: POST nunca escribe. Lo que la IA propone se ve en pantalla antes de
//            tocar la base, y lo que se guarda es lo que la persona confirmó —
//            no lo que el modelo dijo.
//   ASUME:   sesión válida y rol de Líder (el vocabulario de la marca es suyo).
//   NO HACE: no crea colores ni categorías, no borra nada. Solo rellena las dos
//            columnas de anclaje que agregó 0052.
//
// POR QUÉ DOS VERBOS Y NO UNO. Un solo endpoint "ancla todo" haría que un error
// del modelo entrara a la base sin que nadie lo mire, y anclar mal es invisible:
// nada falla, simplemente "Palo rosa" queda colgando de Beige y nadie se entera
// hasta que un reporte agrupa mal. La separación obliga a que haya un par de
// ojos entre la propuesta y la escritura.

type QueAnclar = "colores" | "categorias";

function esQueValido(q: unknown): q is QueAnclar {
  return q === "colores" || q === "categorias";
}

export async function POST(request: Request) {
  const persona = await requirePersonaActual();
  if (persona.rol !== "lider") {
    return Response.json({ error: "Solo un Líder puede anclar el vocabulario de la marca." }, { status: 403 });
  }

  const cuerpo = await request.json().catch(() => null);
  const que = cuerpo?.que;
  if (!esQueValido(que)) {
    return Response.json({ error: "Falta indicar qué anclar: 'colores' o 'categorias'." }, { status: 400 });
  }

  // Sin la clave, el endpoint no revienta con un stack: dice qué falta y dónde
  // ponerlo. Es la misma degradación con gracia que usa /api/padron.
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      {
        error:
          "El anclaje automático todavía no está activado: falta ANTHROPIC_API_KEY en el entorno. " +
          "El vocabulario se puede anclar a mano mientras tanto.",
      },
      { status: 503 }
    );
  }

  const [propios, universales] =
    que === "colores"
      ? await Promise.all([getColoresPropios(), getColoresUniversales()])
      : await Promise.all([getCategoriasPropias(), getCategoriasUniversales()]);

  // Solo se propone para lo que todavía no está anclado. Volver a preguntar por
  // lo ya decidido costaría tokens y, peor, invitaría a pisar una corrección
  // que una persona ya hizo a mano.
  const pendientes = propios.filter((p) => p.ancladoA === null).map((p) => p.termino);
  if (pendientes.length === 0) {
    return Response.json({ anclajes: [], conIA: 0, mensaje: "Ya está todo anclado." });
  }

  const freno = permitirLlamada(persona.id);
  if (!freno.ok) return Response.json({ error: freno.mensaje }, { status: 429 });

  try {
    const { anclajes, conIA } = await anclar(
      pendientes,
      universales,
      que === "colores" ? "colores" : "categorías de producto"
    );
    // `nombreUniversal` viaja resuelto para que la pantalla no tenga que cruzar
    // 1.849 filas en el navegador solo para mostrar una etiqueta.
    const porId = new Map(universales.map((u) => [u.id, u.ruta ?? u.nombre]));
    return Response.json({
      anclajes: anclajes.map((a) => ({
        ...a,
        nombrePropio: pendientes.find((p) => p.clave === a.clave)?.nombre ?? a.clave,
        nombreUniversal: a.universalId ? porId.get(a.universalId) ?? null : null,
      })),
      conIA,
    });
  } catch (e) {
    // El traductor a idioma CAYLA vive en lib/ia/cliente.ts, compartido con los
    // tres endpoints del importador — antes cada uno tenía el suyo, o ninguno.
    const { mensaje, status } = traducirErrorIA(
      e,
      "El anclaje automático",
      "Mientras tanto el vocabulario se puede anclar a mano."
    );
    return Response.json({ error: mensaje }, { status });
  }
}


export async function PUT(request: Request) {
  const persona = await requirePersonaActual();
  if (persona.rol !== "lider") {
    return Response.json({ error: "Solo un Líder puede anclar el vocabulario de la marca." }, { status: 403 });
  }

  const cuerpo = await request.json().catch(() => null);
  const que = cuerpo?.que;
  const anclajes: Array<{ clave: string; universalId: string | null }> = cuerpo?.anclajes ?? [];
  if (!esQueValido(que) || !Array.isArray(anclajes)) {
    return Response.json({ error: "Cuerpo inválido: falta 'que' o 'anclajes'." }, { status: 400 });
  }

  const supabase = await createClient();

  // Un update por término. Son decenas, no miles: el viaje de más no se nota, y
  // a cambio un anclaje que falle no arrastra a los demás — se reporta cuál fue.
  const fallidos: string[] = [];
  let guardados = 0;

  for (const a of anclajes) {
    if (!a.universalId) continue; // sin universal no hay nada que guardar
    const res =
      que === "colores"
        ? await supabase.from("colores").update({ taxonomia_valor_id: a.universalId }).eq("codigo", a.clave)
        : await supabase.from("categorias").update({ taxonomia_categoria_id: a.universalId }).eq("id", a.clave);

    if (res.error) fallidos.push(a.clave);
    else guardados++;
  }

  if (fallidos.length > 0) {
    return Response.json(
      { guardados, fallidos, error: `No se pudieron guardar ${fallidos.length} anclajes.` },
      { status: 207 }
    );
  }
  return Response.json({ guardados });
}
