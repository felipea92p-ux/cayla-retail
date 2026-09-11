import { requirePersonaActual } from "@/lib/persona";
import { aplicarMapeo, type PlanDeMapeo } from "@/lib/importacion/mapeo";
import { resolverValores } from "@/lib/importacion/resolver-valores";
import { permitirLlamada, traducirErrorIA } from "@/lib/ia/cliente";
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
    // MISMA forma que el camino con clave: { yaExisten, aCrear }. La primera
    // versión devolvía { yaExisten, nuevos } tal cual salía de
    // cruzarConVocabulario, y RevisarValores leía aCrear.length → TypeError y
    // pantalla en blanco justo en el caso que debía degradarse con gracia.
    // Revisión del 2026-09-11.
    const sinClasificar = (campo: ReturnType<typeof cruzarConVocabulario>) => ({
      yaExisten: campo.yaExisten,
      aCrear: campo.nuevos.map((n) => ({ ...n, existente: null, propuesta: null })),
    });
    return Response.json({
      total: variantes.length,
      colores: sinClasificar(cruzarConVocabulario(valoresDistintos(variantes, "color"), vocabulario.colores)),
      categorias: sinClasificar(
        cruzarConVocabulario(valoresDistintos(variantes, "categoria"), vocabulario.categorias)
      ),
      aviso: "Falta ANTHROPIC_API_KEY: los valores nuevos se crearán sin agrupar bajo el estándar.",
    });
  }

  const freno = permitirLlamada(persona.id);
  if (!freno.ok) return Response.json({ error: freno.mensaje }, { status: 429 });

  try {
    const r = await resolverValores(variantes, vocabulario, {
      colores: coloresUniv,
      categorias: categoriasUniv,
    });
    return Response.json({ total: variantes.length, ...r });
  } catch (e) {
    const { mensaje, status } = traducirErrorIA(e, "La clasificación de los valores nuevos");
    return Response.json({ error: mensaje }, { status });
  }
}
