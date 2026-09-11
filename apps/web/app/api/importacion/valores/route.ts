import { requirePersonaActual } from "@/lib/persona";
import { aplicarMapeo, type PlanDeMapeo } from "@/lib/importacion/mapeo";
import { resolverValores } from "@/lib/importacion/resolver-valores";
import {
  getCategoriasPropias,
  getCategoriasUniversales,
  getColoresPropios,
  getColoresUniversales,
} from "@/lib/taxonomia/consultas";

// POST /api/importacion/valores
//   { filas, filaCabecera, plan } → qué hacer con cada color y cada categoría
//
// CONTRATO
//   PROMETE: no escribir nada. Devuelve qué valores ya existen en el vocabulario
//            de la marca y cuáles habría que crear, con el universal del que
//            colgarían. Crear de verdad es el paso siguiente.
//   ASUME:   sesión válida y rol de Líder.
//
// LO QUE HACE BARATO ESTE PASO: no se resuelven las 3.000 filas, se resuelve el
// DICCIONARIO. Un catálogo de 3.000 prendas tiene ~40 colores distintos, y de
// esos, los que ya están en el vocabulario los cruza `claveTexto` gratis. Al
// modelo solo llega lo que de verdad es nuevo — a veces, nada.

export async function POST(request: Request) {
  const persona = await requirePersonaActual();
  if (persona.rol !== "lider") {
    return Response.json({ error: "Solo un Líder puede importar un catálogo." }, { status: 403 });
  }

  const cuerpo = (await request.json().catch(() => null)) as {
    filas?: string[][];
    filaCabecera?: number;
    plan?: PlanDeMapeo;
  } | null;

  if (!Array.isArray(cuerpo?.filas) || !cuerpo?.plan) {
    return Response.json({ error: "Faltan las filas o el plan de columnas." }, { status: 400 });
  }

  const variantes = aplicarMapeo(cuerpo.filas, cuerpo.plan, cuerpo.filaCabecera ?? 0);
  if (variantes.length === 0) {
    return Response.json({ error: "Con este plan no sale ninguna prenda del archivo." }, { status: 422 });
  }

  // Las cuatro consultas son independientes: una sola ronda.
  const [coloresPropios, categoriasPropias, coloresUniv, categoriasUniv] = await Promise.all([
    getColoresPropios(),
    getCategoriasPropias(),
    getColoresUniversales(),
    getCategoriasUniversales(),
  ]);

  const vocabulario = {
    colores: coloresPropios.map((c) => ({ clave: c.termino.clave, nombre: c.termino.nombre })),
    categorias: categoriasPropias.map((c) => ({ clave: c.termino.clave, nombre: c.termino.nombre })),
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    // Sin clave no se puede clasificar lo nuevo, pero lo que YA existe en el
    // vocabulario sí se resuelve — es puro código. Devolver eso en vez de un
    // error deja seguir trabajando con la parte que no depende del modelo.
    const { cruzarConVocabulario, valoresDistintos } = await import("@/lib/importacion/valores");
    return Response.json({
      total: variantes.length,
      colores: cruzarConVocabulario(valoresDistintos(variantes, "color"), vocabulario.colores),
      categorias: cruzarConVocabulario(valoresDistintos(variantes, "categoria"), vocabulario.categorias),
      aviso: "Falta ANTHROPIC_API_KEY: los valores nuevos hay que clasificarlos a mano.",
    });
  }

  try {
    const r = await resolverValores(variantes, vocabulario, {
      colores: coloresUniv,
      categorias: categoriasUniv,
    });
    return Response.json({ total: variantes.length, ...r });
  } catch (e) {
    const crudo = e instanceof Error ? e.message : String(e);
    if (crudo.includes("credit balance")) {
      return Response.json(
        { error: "La cuenta de Anthropic se quedó sin saldo. Los valores nuevos se pueden clasificar a mano." },
        { status: 402 }
      );
    }
    return Response.json({ error: `No se pudieron clasificar los valores: ${crudo}` }, { status: 502 });
  }
}
