import "server-only";
import { anclarConIA } from "@/lib/taxonomia/anclar-ia";
import type { TerminoPropio, TerminoUniversal } from "@/lib/taxonomia/anclar";
import { cruzarConVocabulario, valoresDistintos, type ValorResuelto } from "./valores";
import type { FilaEstandar } from "./mapeo";

/**
 * Qué hacer con cada color y cada categoría que trae el archivo del cliente.
 *
 * ACÁ SE VE POR QUÉ EL ESTÁNDAR UNIVERSAL VA DEBAJO Y NO EN LUGAR DEL
 * VOCABULARIO PROPIO (ADR-0030). Un cliente llega con "Fucsia neón". Las dos
 * salidas obvias son malas: crearlo suelto rompe la comparación entre marcas, y
 * forzarlo a uno de los 19 universales le borra una distinción que su clienta sí
 * hace en mostrador. La tercera es la correcta: **"Fucsia neón" se conserva como
 * color de ESA marca, colgando de "Rosa" universal**. No pierde su idioma y el
 * sistema igual lo entiende.
 *
 * Por eso este paso no "normaliza" el archivo: SIEMBRA el vocabulario del
 * cliente a partir de lo que él mismo trajo.
 *
 * REUSA EL MISMO MOTOR QUE ANCLÓ A CAYLA. `anclarConIA` es el que se probó con
 * los 30 colores y 37 categorías que Felipe conoce de memoria — el examen que
 * destapó el bug del árbol incompleto. Un segundo camino de anclaje sería un
 * segundo sitio donde equivocarse.
 */

export type ResolucionCampo = {
  /** Ya existen en el vocabulario de la marca: no hay nada que decidir. */
  yaExisten: ValorResuelto[];
  /** Hay que crearlos. Cada uno con el universal del que colgaría. */
  aCrear: ValorResuelto[];
};

export type ResolucionValores = {
  colores: ResolucionCampo;
  categorias: ResolucionCampo;
  uso: { entrada: number; salida: number };
};

async function resolverCampo(
  filas: FilaEstandar[],
  campo: "color" | "categoria",
  vocabulario: { clave: string; nombre: string }[],
  universales: TerminoUniversal[],
  queSon: string
): Promise<{ campo: ResolucionCampo; entrada: number; salida: number }> {
  const distintos = valoresDistintos(filas, campo);
  const { yaExisten, nuevos } = cruzarConVocabulario(distintos, vocabulario);

  // Si el vocabulario ya cubre todo lo del archivo, no hay nada que preguntar y
  // este paso sale gratis. Es el caso normal cuando una marca reimporta.
  if (nuevos.length === 0) {
    return { campo: { yaExisten, aCrear: [] }, entrada: 0, salida: 0 };
  }

  // La clave que se le da al modelo es el propio texto: no hace falta inventar
  // ids para algo que todavía no existe en ninguna tabla.
  const propios: TerminoPropio[] = nuevos.map((n) => ({
    clave: n.texto,
    nombre: n.texto,
    contexto: `aparece en ${n.apariciones} ${n.apariciones === 1 ? "prenda" : "prendas"}`,
  }));

  const { anclajes, uso } = await anclarConIA(propios, universales, queSon);
  const porClave = new Map(anclajes.map((a) => [a.clave, a]));
  const nombreUniv = new Map(universales.map((u) => [u.id, u.ruta ?? u.nombre]));

  const aCrear: ValorResuelto[] = nuevos.map((n) => {
    const a = porClave.get(n.texto);
    return {
      ...n,
      existente: null,
      propuesta: {
        universalId: a?.universalId ?? null,
        universalNombre: a?.universalId ? nombreUniv.get(a.universalId) ?? null : null,
        confianza: a?.confianza ?? "baja",
        porque: a?.porque ?? "No se pudo clasificar.",
      },
    };
  });

  return { campo: { yaExisten, aCrear }, entrada: uso.entrada, salida: uso.salida };
}

export async function resolverValores(
  filas: FilaEstandar[],
  vocabulario: { colores: { clave: string; nombre: string }[]; categorias: { clave: string; nombre: string }[] },
  universales: { colores: TerminoUniversal[]; categorias: TerminoUniversal[] }
): Promise<ResolucionValores> {
  // Los dos campos son independientes: van en paralelo en vez de esperar uno al
  // otro. Son dos llamadas al modelo, no una — separarlas hace que el catálogo
  // universal de cada una sea distinto y pueda cachearse por separado.
  const [col, cat] = await Promise.all([
    resolverCampo(filas, "color", vocabulario.colores, universales.colores, "colores"),
    resolverCampo(filas, "categoria", vocabulario.categorias, universales.categorias, "categorías de producto"),
  ]);

  return {
    colores: col.campo,
    categorias: cat.campo,
    uso: { entrada: col.entrada + cat.entrada, salida: col.salida + cat.salida },
  };
}
