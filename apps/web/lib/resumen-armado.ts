import {
  COMPARACION_INICIAL,
  esModoComparacion,
  hoyEnLima,
  resolverComparacion,
  resolverPeriodo,
  resolverRangoPersonalizado,
  type ModoComparacion,
  type PeriodoResuelto,
  type Rango,
} from "./resumen-periodo";
import { aplicarAlcance, aplicarVista, FILAS_POR_PAGINA, leerFiltros, paginar, type AlcanceResumen, type VistaResumen } from "./resumen-filtros";
import {
  analizarSede,
  evaluarExactitud,
  listarCategorias,
  resumirAlcance,
  type AnalisisVariante,
  type EstadoExactitud,
  type FilaResumen,
  type ResumenAlcance,
  type Ubicacion,
} from "./resumen-reglas";

// El armado de la pantalla, sin servidor: recibe lo que trajo la RPC y lo que dice
// la URL, y devuelve todo lo que viaja al navegador. Vive aparte de
// `resumen-inventario.ts` (que solo lee de Postgres) para poder probarlo entero
// con filas de ejemplo — y para que nada de lo que decide la pantalla dependa de
// haber levantado una base de datos.

export type ParametrosResumen = {
  preset?: string;
  desde?: string;
  hasta?: string;
  comparar?: string;
  /** Rango elegido a mano cuando `comparar=personalizado` («Otro período…»). */
  cdesde?: string;
  chasta?: string;
} & Record<string, string | string[] | undefined>;

/** Todo lo que viaja al componente cliente: un resumen agregado y UNA página de filas. */
export type ResumenParaPantalla = {
  ubicacion: Ubicacion;
  periodo: PeriodoResuelto;
  comparacion: { modo: ModoComparacion; rango: Rango | null };
  /** El instante en que se leyó el stock (ISO), para «stock actual al …». */
  ahoraIso: string;
  alcance: AlcanceResumen;
  vista: VistaResumen;
  /** Tarjetas, gráficos y capital de lo que quedó tras categoría y búsqueda. */
  resumen: ResumenAlcance;
  /** Todas las categorías de la sede (no las del alcance) para el selector. */
  categorias: { id: string; nombre: string; variantes: number }[];
  tabla: { filas: AnalisisVariante[]; pagina: number; paginas: number; total: number; totalAlcance: number; totalSede: number };
  exactitud: EstadoExactitud;
  /** Para «Bajar al piso»: la sububicación de piso y la de almacén, si la sede las separa. */
  sububicaciones: { pisoId: string | null; almacenId: string | null };
};

/** Qué fechas hay que pedirle a la RPC según lo que dice la URL. `modo` es el EFECTIVO: un
 *  «Otro período…» sin fechas válidas cae en «anterior» y así se dice, para que el selector
 *  no muestre una comparación que no se está haciendo. */
export function rangosDelResumen(params: ParametrosResumen, ahora: Date): { periodo: PeriodoResuelto; modo: ModoComparacion; comparacion: Rango | null } {
  const hoy = hoyEnLima(ahora);
  const periodo = resolverPeriodo(
    { preset: params.preset as string | undefined, desde: params.desde as string | undefined, hasta: params.hasta as string | undefined },
    hoy,
  );
  let modo = esModoComparacion(params.comparar as string | undefined) ? (params.comparar as ModoComparacion) : COMPARACION_INICIAL;
  const personalizado = modo === "personalizado" ? resolverRangoPersonalizado(params.cdesde as string | undefined, params.chasta as string | undefined, hoy) : null;
  if (modo === "personalizado" && !personalizado) modo = COMPARACION_INICIAL;
  return { periodo, modo, comparacion: resolverComparacion(periodo, modo, personalizado) };
}

export function armarResumen(e: {
  filas: FilaResumen[];
  ubicacion: Ubicacion;
  params: ParametrosResumen;
  ahora: Date;
  /** Exactitud agregada de los conteos cerrados y cuándo se cerró el último. */
  conteos: { exactitud: { porcentaje: number; lineas: number; conteos: number } | null; ultimoCerradoEn: string | null };
  sububicaciones: { pisoId: string | null; almacenId: string | null };
}): ResumenParaPantalla {
  const { periodo, modo, comparacion } = rangosDelResumen(e.params, e.ahora);
  const { alcance, vista, pagina } = leerFiltros(e.params);

  // Toda la sede se analiza (las curvas necesitan a las hermanas y «alta demanda»
  // es relativa al resto); después se recorta por alcance y por vista.
  const todas = analizarSede(e.filas, e.ubicacion, { ahora: e.ahora, hayComparacion: comparacion !== null });
  const enAlcance = aplicarAlcance(todas, alcance);
  const enVista = aplicarVista(enAlcance, vista);
  const p = paginar(enVista, pagina, FILAS_POR_PAGINA);

  return {
    ubicacion: e.ubicacion,
    periodo,
    comparacion: { modo, rango: comparacion },
    ahoraIso: e.ahora.toISOString(),
    alcance,
    vista,
    resumen: resumirAlcance(enAlcance),
    categorias: listarCategorias(todas),
    tabla: { filas: p.items, pagina: p.pagina, paginas: p.paginas, total: p.total, totalAlcance: enAlcance.length, totalSede: todas.length },
    exactitud: evaluarExactitud(e.conteos, e.ahora),
    sububicaciones: e.sububicaciones,
  };
}
