import { normalizarBusqueda } from "./combo-reglas";
import type { TipoOrden } from "./modelo-nuevo-orden-reglas";
import { filasPorModelo } from "./produccion-decisiones";
import type { DemandaVariante } from "./produccion-decision-reglas";

// «El modelo primero» (ADR-0396, A1): lo que decide la lista de modelos de «Nueva orden de producción» y el tipo con que arranca la orden. Puro: sin Supabase ni React,
// para que lo importen la hoja (cliente) y su prueba.
//
// El problema que resuelve. Antes la hoja abría con dos selectores de pestañas («Tipo» y «Modelo: Ya existe / Modelo nuevo») y un combo de TODOS los modelos, solo texto:
// tres preguntas de jerga antes de ver una prenda, cuando quien llega desde el Resumen («Abrir orden sugerida») ya contestó las tres. Ahora la primera pregunta es el modelo
// —se busca, y arriba salen los que se están acabando— y el tipo se DEDUCE de lo que la persona hizo (elegir uno que existe = lote; crear uno nuevo = muestra) y se corrige
// con un interruptor. Nada de esto toca lo que se manda a la base.

/** Cuántas filas se ven sin escribir nada (ADR-0260: nunca más de 5–6 opciones a la vista; el resto se busca). */
export const FILAS_SIN_BUSCAR = 6;
/** De esas, cuántas pueden ser «recientes» (los modelos de las últimas órdenes). */
const MAX_RECIENTES = 5;

/** Lo mínimo de un modelo que necesita la lista (un `ModeloProducible` cumple). */
export type ModeloParaLista = {
  productoId: string;
  referencia: string;
  categoria: string | null;
  variantes: readonly { varianteId: string }[];
};

/**
 * El tipo con que arranca la orden. Un modelo que ya existe se fabrica como producción; uno nuevo arranca como muestra (se desarrolla antes de fabricarlo). Si la persona ya
 * tocó el interruptor —o trajo `?tipo=muestra` en la URL al volver de Nuevo producto—, no se le pisa lo que eligió (`aMano`).
 */
export function tipoAlElegir(o: { eleccion: "existente" | "nuevo"; tipoActual: TipoOrden; aMano: boolean }): TipoOrden {
  if (o.aMano) return o.tipoActual;
  return o.eleccion === "nuevo" ? "muestra" : "produccion";
}

export type Urgencia = { dias: number };

/**
 * Los modelos que se están acabando: EXACTAMENTE los de las tarjetas «Abrir orden sugerida» del Resumen (`filasPorModelo` con estado «producir_ya»), para que la hoja y el
 * Resumen no puedan decir cosas distintas. Un modelo con una orden abierta o sin ritmo de venta medido no entra (no se opina sin datos). Los días van redondeados y nunca en 0.
 */
export function urgentesDeLaRed(args: {
  modelos: readonly ModeloParaLista[];
  demanda: readonly DemandaVariante[];
  enProduccion: Record<string, number>;
}): Map<string, Urgencia> {
  const filas = filasPorModelo(
    [...args.demanda],
    args.modelos.map((m) => ({ productoId: m.productoId, referencia: m.referencia, variantesIds: m.variantes.map((v) => v.varianteId) })),
    args.enProduccion,
  );
  const urgentes = new Map<string, Urgencia>();
  for (const f of filas) if (f.estado === "producir_ya" && f.ritmoDia && f.diasRed !== null) urgentes.set(f.productoId, { dias: Math.max(1, Math.round(f.diasRed)) });
  return urgentes;
}

export function textoUrgencia(u: Urgencia): string {
  return u.dias <= 1 ? "Se acaba en 1 día" : `Se acaba en ${u.dias} días`;
}

export type GrupoModelos<M> = {
  clave: "acabando" | "recientes" | "catalogo" | "resultados";
  titulo: string;
  /** «3 de 234»; `null` si el número no dice nada (los resultados llevan su propio conteo). */
  cuenta: string | null;
  modelos: M[];
};

const porReferencia = <M extends { referencia: string }>(a: M, b: M) => a.referencia.localeCompare(b.referencia, "es");

/** Qué tan cerca está un modelo de lo escrito: 0 = su nombre empieza con eso, 1 = alguna palabra suya empieza con eso, 2 = solo lo contiene (en el nombre o la categoría). */
function cercania(m: ModeloParaLista, consulta: string): number {
  const nombre = normalizarBusqueda(m.referencia);
  if (nombre.startsWith(consulta)) return 0;
  if (nombre.split(" ").some((palabra) => palabra.startsWith(consulta))) return 1;
  return 2;
}

/**
 * La lista que se ve. Sin escribir: arriba «Se están acabando» (solo el líder los trae: `urgentes` viene vacío para quien no ve la red), luego «Recientes» (los modelos de las
 * últimas órdenes) y el catálogo por orden hasta completar `FILAS_SIN_BUSCAR` filas —el Taller de hoy no tiene órdenes ni ventas, y una lista vacía no deja elegir nada—.
 * Escribiendo: todos los que coinciden (sin tildes, sin importar el orden de las palabras, en el nombre o la categoría), los que empiezan con lo escrito primero; la lista se
 * desplaza, nunca se corta a media búsqueda.
 */
export function listaDeModelos<M extends ModeloParaLista>(args: {
  modelos: readonly M[];
  consulta: string;
  urgentes: ReadonlyMap<string, Urgencia>;
  recientes: readonly string[];
}): { grupos: GrupoModelos<M>[]; total: number; coinciden: number | null } {
  const total = args.modelos.length;
  const consulta = normalizarBusqueda(args.consulta);

  if (consulta) {
    const palabras = consulta.split(" ");
    const hallados = args.modelos
      .filter((m) => {
        const pajar = normalizarBusqueda(`${m.referencia} ${m.categoria ?? ""}`);
        return palabras.every((p) => pajar.includes(p));
      })
      .sort((a, b) => cercania(a, consulta) - cercania(b, consulta) || porReferencia(a, b));
    return { grupos: hallados.length > 0 ? [{ clave: "resultados", titulo: "Resultados", cuenta: String(hallados.length), modelos: hallados }] : [], total, coinciden: hallados.length };
  }

  const porId = new Map(args.modelos.map((m) => [m.productoId, m]));
  const usados = new Set<string>();
  const grupos: GrupoModelos<M>[] = [];
  const filas = () => usados.size;

  const urgentes = [...args.urgentes.entries()]
    .filter(([id]) => porId.has(id))
    .sort(([ida, a], [idb, b]) => a.dias - b.dias || porReferencia(porId.get(ida)!, porId.get(idb)!))
    .map(([id]) => porId.get(id)!);
  if (urgentes.length > 0) {
    const vistos = urgentes.slice(0, FILAS_SIN_BUSCAR);
    vistos.forEach((m) => usados.add(m.productoId));
    grupos.push({ clave: "acabando", titulo: "Se están acabando", cuenta: urgentes.length > vistos.length ? `${vistos.length} de ${urgentes.length}` : String(vistos.length), modelos: vistos });
  }

  const recientes: M[] = [];
  for (const id of args.recientes) {
    const m = porId.get(id);
    if (m && !usados.has(id) && !recientes.includes(m) && recientes.length < Math.min(MAX_RECIENTES, FILAS_SIN_BUSCAR - filas())) recientes.push(m);
  }
  if (recientes.length > 0) {
    recientes.forEach((m) => usados.add(m.productoId));
    grupos.push({ clave: "recientes", titulo: "Recientes", cuenta: null, modelos: recientes });
  }

  const faltan = FILAS_SIN_BUSCAR - filas();
  if (faltan > 0) {
    const resto = args.modelos.filter((m) => !usados.has(m.productoId)).sort(porReferencia).slice(0, faltan);
    if (resto.length > 0) {
      resto.forEach((m) => usados.add(m.productoId));
      grupos.push({ clave: "catalogo", titulo: grupos.length > 0 ? "Los demás" : "Del catálogo", cuenta: `${resto.length} de ${total}`, modelos: resto });
    }
  }
  return { grupos, total, coinciden: null };
}

/**
 * De las órdenes del tablero, lo que la lista de modelos necesita: cuántas órdenes en proceso tiene cada modelo («1 orden abierta», para no abrir otra sin darse cuenta) y los
 * modelos de las órdenes más recientes (la más nueva primero, sin repetir). Una orden anulada no cuenta como reciente: se abrió por error.
 */
export function ordenesParaLaLista(ordenes: readonly { productoId: string; estado: string; creadoEn: string }[]): { abiertas: Map<string, number>; recientes: string[] } {
  const abiertas = new Map<string, number>();
  for (const o of ordenes) if (o.estado === "en_proceso") abiertas.set(o.productoId, (abiertas.get(o.productoId) ?? 0) + 1);
  const recientes: string[] = [];
  for (const o of [...ordenes].filter((x) => x.estado !== "anulada").sort((a, b) => (a.creadoEn < b.creadoEn ? 1 : a.creadoEn > b.creadoEn ? -1 : 0))) {
    if (!recientes.includes(o.productoId)) recientes.push(o.productoId);
  }
  return { abiertas, recientes };
}

// «¿Ya tienen el molde?» (Felipe 2026-10-27): no todo modelo nuevo necesita muestra —a veces el molde ya está hecho—. El sistema no guarda un dato «molde listo» (`productos.patron_id`
// es el estampado, no el molde), así que se DEDUCE del historial de órdenes del Taller y, cuando no alcanza, se le pregunta a la persona. No cambia lo que se manda a la base: solo
// qué dice la hoja y con qué tipo arranca un modelo que ya tiene historia.

/** Lo que el historial dice del molde de un modelo: «sin_lectura» (el historial no se pudo leer: no se afirma nada), «listo» (hubo una muestra terminada o con su escalado hecho, o ya se abrió un lote), «en_desarrollo» (hay una muestra
 *  en proceso y todavía no llegó al escalado) o «sin_historia» (el Taller nunca hizo una orden de este modelo). */
export type MoldeDelModelo = { estado: "listo"; por: "muestra" | "lote" } | { estado: "en_desarrollo" } | { estado: "sin_historia" } | { estado: "sin_lectura" };

/** Lo mínimo de una orden para saber si dejó un molde: se lee con una consulta liviana, sin joins (`getHistorialDeMoldes`). */
export type OrdenParaMolde = { productoId: string; estado: string; esMuestra: boolean; etapas: Partial<Record<string, string>> | null };

/** Una orden anulada no cuenta (se abrió por error). Un lote, abierto o cerrado, supone que el molde existía; una muestra lo deja hecho al terminar o al llegar a «Escalado». */
export function moldeDelModelo(historial: readonly OrdenParaMolde[], productoId: string): MoldeDelModelo {
  let enDesarrollo = false;
  let porMuestra = false;
  for (const o of historial) {
    if (o.productoId !== productoId || o.estado === "anulada") continue;
    if (!o.esMuestra) return { estado: "listo", por: "lote" };
    if (o.estado === "terminada" || o.etapas?.escalado === "hecho") porMuestra = true;
    else enDesarrollo = true;
  }
  if (porMuestra) return { estado: "listo", por: "muestra" };
  return enDesarrollo ? { estado: "en_desarrollo" } : { estado: "sin_historia" };
}

/** Lo que dice la línea junto al interruptor del tipo: qué se sabe del molde y qué hacer. Cuando no se sabe, es la pregunta. */
export function frasesDelMolde(o: { tipo: TipoOrden; esNuevo: boolean; molde: MoldeDelModelo }): { texto: string; pregunta: boolean } {
  if (o.esNuevo && o.tipo === "produccion") {
    return { texto: "Es un modelo nuevo y ya tienen el molde: fabrica el lote y, al cerrarlo, entra al stock del Taller. Si todavía falta hacerlo, elige Muestra.", pregunta: false };
  }
  if (o.esNuevo) {
    return {
      texto: "Es un modelo nuevo, así que arranca como muestra. ¿Ya tienen el molde (de otro proveedor o de un modelo parecido)? Entonces elige Lote de producción.",
      pregunta: true,
    };
  }
  const { molde } = o;
  if (molde.estado === "listo") {
    const de = molde.por === "muestra" ? "Ya hicieron la muestra de este modelo" : "Ya fabricaron un lote de este modelo";
    return o.tipo === "muestra"
      ? { texto: `${de}. Otra muestra solo hace falta si cambia el molde. No entra al stock.`, pregunta: false }
      : { texto: `${de}: el molde está listo. Fabrica el lote y, al cerrarlo, entra al stock del Taller.`, pregunta: false };
  }
  const lead =
    molde.estado === "en_desarrollo" ? "Este modelo tiene una muestra en desarrollo." : molde.estado === "sin_lectura" ? "No pude revisar las órdenes anteriores de este modelo." : "El Taller todavía no ha hecho ninguna orden de este modelo.";
  return {
    texto: `${lead} ¿Ya tienen el molde? Si sí, elige Lote de producción; si falta hacerlo, elige Muestra.`,
    pregunta: true,
  };
}
