/**
 * La pestaña «Temporadas» de Productos ▸ Atributos (ADR-0246): lo que arma el servidor para pintarla y lo que el
 * navegador revisa antes de guardar. Puro (sin React ni supabase): lo usan `page.tsx`, `TemporadasLista` y la ruta
 * `/api/productos/temporadas`.
 *
 * Lo que NO vive aquí, a propósito: qué temporada tiene una prenda (color → producto → categoría). Esa regla es UNA y
 * está en la base (`fn_temporada_efectiva`); aquí solo se cuentan y se nombran las filas que la base ya resolvió. Las
 * reglas que comparten el alta, la ficha y esta pestaña (nombres, horas de Perú, «Sin temporada») están en
 * `temporada-reglas.ts` y se usan desde ahí, sin copiarlas.
 */

import { clave } from "./buscar-prenda-v2";
import {
  agruparSinTemporada,
  cuantasHeredan,
  instanteLima,
  NOMBRE_ESTACION,
  partesLima,
  textoInstanteLima,
  type Estacion,
  type EventoCalendario,
  type Temporada,
  type TemporadaEfectiva,
} from "./temporada-reglas";

/** El tope de `asignar_temporadas` (20260928100000): más de 500 prendas en un llamado, la base lo rechaza entero. */
export const MAX_ASIGNAR_POR_VEZ = 500;

/** El ciclo de un año del calendario, en su orden: otoño (marzo) → invierno → primavera → verano (diciembre). */
export const ORDEN_ESTACIONES: readonly Estacion[] = ["otono", "invierno", "primavera", "verano"];

/** El mes en que empieza cada estación, solo para PRELLENAR el año nuevo. Cuánto se puede correr una fecha de ahí no se
 *  revisa en la web: lo decide el check de la base (`temporada_fechas_cerca_de_su_estacion`), y su mensaje se traduce en
 *  `error-escritura.ts`. */
const MES_DE_ESTACION: Record<Estacion, number> = { otono: 3, invierno: 6, primavera: 9, verano: 12 };

/** Lo que se prellena al agregar un año: la fecha aproximada de cada estación a mediodía. Es aproximada (puede estar a
 *  horas del instante real): por eso el año nuevo se guarda por defecto como «Ajustada por el líder», no como del
 *  Observatorio Naval, hasta que el líder copie las horas de una fuente. */
const DIA_SUGERIDO: Record<Estacion, number> = { otono: 20, invierno: 21, primavera: 22, verano: 21 };

// ---- Lo que arma el servidor ----------------------------------------------------------------------------------------

/** Una categoría en la sección «Por categoría». */
export type CategoriaTemporada = {
  id: string;
  /** «Vestidos», o «Ropa de baño › Bikinis» si es subcategoría (una subcategoría NO hereda la de su padre). */
  nombre: string;
  temporada: string | null;
  /** Prendas activas que hoy toman la temporada de esta categoría (o que se quedarían sin ninguna): las que se
   *  reclasifican al instante si se cambia. */
  heredan: number;
  /** Prendas activas de la categoría, tengan o no su propia temporada: el filtro «Con prendas» de la vista. */
  prendas: number;
};

/** Una prenda de la lista «Sin temporada». */
export type PrendaSinTemporada = {
  productoId: string;
  nombre: string;
  codigo: string | null;
  /** La categoría de la prenda (id y nombre visible), o `null` si no tiene. El id es el del atajo «Ponérsela a la
   *  categoría» de la vista «Por completar». */
  categoriaId: string | null;
  categoria: string | null;
  /** De qué marca es y quién la trae, o `null` si todavía no se registró (ADR-0283: pueden faltar, y son independientes).
   *  Dos prendas pueden llamarse igual si son de marcas distintas (la clave única es marca + nombre): la marca es lo que
   *  las distingue en la lista. El proveedor no identifica la prenda, pero es lo que la persona ya conoce del pedido. */
  marca: string | null;
  proveedor: string | null;
  /** Los colores que quedaron sin temporada (nombre del vocabulario; «Sin color» si la variante no tiene). */
  colores: string[];
  /** `false` si algún otro color de la prenda ya tiene la suya (una excepción por color puesta en la ficha). */
  todosSusColores: boolean;
};

export type ProductoParaTemporadas = {
  id: string;
  nombre: string;
  codigo: string | null;
  categoriaId: string | null;
  /** Nombres ya resueltos (la pantalla los busca en `marcas` y `proveedores`); `null` = la prenda no tiene. */
  marca: string | null;
  proveedor: string | null;
};
export type CategoriaParaTemporadas = { id: string; nombre: string; temporada: string | null; padreId: string | null };

/** El nombre visible de cada categoría: la subcategoría lleva delante el de su padre. */
export function nombresDeCategorias(categorias: readonly CategoriaParaTemporadas[]): Map<string, string> {
  const base = new Map(categorias.map((c) => [c.id, c.nombre]));
  return new Map(
    categorias.map((c) => {
      const padre = c.padreId ? base.get(c.padreId) : undefined;
      return [c.id, padre ? `${padre} › ${c.nombre}` : c.nombre];
    }),
  );
}

/** Cada categoría activa con su temporada por defecto y cuántas prendas la heredan hoy (`cuantasHeredan`). */
export function armarCategorias(
  categorias: readonly CategoriaParaTemporadas[],
  productos: readonly Pick<ProductoParaTemporadas, "id" | "categoriaId">[],
  filas: readonly TemporadaEfectiva[],
): CategoriaTemporada[] {
  const nombres = nombresDeCategorias(categorias);
  const porCategoria = new Map<string, Set<string>>();
  for (const p of productos) {
    if (!p.categoriaId) continue;
    const conjunto = porCategoria.get(p.categoriaId) ?? new Set<string>();
    conjunto.add(p.id);
    porCategoria.set(p.categoriaId, conjunto);
  }
  return categorias
    .map((c) => ({
      id: c.id,
      nombre: nombres.get(c.id) ?? c.nombre,
      temporada: c.temporada,
      heredan: cuantasHeredan(filas, porCategoria.get(c.id) ?? new Set<string>()),
      prendas: porCategoria.get(c.id)?.size ?? 0,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

/** La lista «Sin temporada» con nombres (`agruparSinTemporada` decide quién entra), ordenada por categoría y nombre. */
export function armarSinTemporada(
  filas: readonly TemporadaEfectiva[],
  productos: ReadonlyMap<string, ProductoParaTemporadas>,
  nombreColor: ReadonlyMap<string, string>,
  nombreCategoria: ReadonlyMap<string, string>,
): PrendaSinTemporada[] {
  const coloresActivos = new Map<string, number>();
  for (const f of filas) {
    if (f.estado === "activo") coloresActivos.set(f.producto_id, (coloresActivos.get(f.producto_id) ?? 0) + 1);
  }
  return agruparSinTemporada(filas)
    .map(({ producto_id, colores }) => {
      const p = productos.get(producto_id);
      return {
        productoId: producto_id,
        nombre: p?.nombre ?? "Prenda",
        codigo: p?.codigo ?? null,
        categoriaId: p?.categoriaId ?? null,
        categoria: p?.categoriaId ? (nombreCategoria.get(p.categoriaId) ?? null) : null,
        marca: p?.marca ?? null,
        proveedor: p?.proveedor ?? null,
        colores: colores.map((c) => (c ? (nombreColor.get(c) ?? c) : "Sin color")).sort((a, b) => a.localeCompare(b, "es")),
        todosSusColores: colores.length >= (coloresActivos.get(producto_id) ?? 0),
      };
    })
    // Las que no tienen categoría, al final (un «~» no sirve: la comparación en castellano pone los signos primero).
    .sort(
      (a, b) =>
        Number(a.categoria === null) - Number(b.categoria === null) ||
        (a.categoria ?? "").localeCompare(b.categoria ?? "", "es") ||
        a.nombre.localeCompare(b.nombre, "es"),
    );
}

/** Cuántas prendas activas hay en cada temporada (por clave). Una prenda con un color de otra temporada cuenta en las dos. */
export function prendasPorTemporada(filas: readonly TemporadaEfectiva[]): Record<string, number> {
  const porClave = new Map<string, Set<string>>();
  for (const f of filas) {
    if (f.estado !== "activo" || !f.temporada) continue;
    const conjunto = porClave.get(f.temporada) ?? new Set<string>();
    conjunto.add(f.producto_id);
    porClave.set(f.temporada, conjunto);
  }
  return Object.fromEntries([...porClave].map(([k, v]) => [k, v.size]));
}

/** Busca en la lista «Sin temporada» por nombre, código, categoría, marca, proveedor o color, sin tildes ni mayúsculas:
 *  todo lo que la lista muestra se puede buscar. */
export function filtrarSinTemporada(prendas: readonly PrendaSinTemporada[], texto: string): PrendaSinTemporada[] {
  const k = clave(texto);
  if (!k) return [...prendas];
  return prendas.filter((p) =>
    clave([p.nombre, p.codigo, p.categoria, p.marca, p.proveedor, ...p.colores].filter(Boolean).join(" ")).includes(k),
  );
}

/** El año de hoy en Perú (a las 20:00 del 31 de diciembre en Lima, ya es el 1 de enero en UTC). */
export function anioHoyLima(ahora: Date): number {
  return Number(partesLima(ahora.toISOString()).fecha.slice(0, 4));
}

/** Los años del calendario que se muestran: desde el de la estación en curso (el verano de diciembre sigue en curso en
 *  enero) o, si ninguna lo está, desde el de hoy. Lo anterior va detrás de «Ver años anteriores». */
export function primerAnioVisible(eventos: readonly EventoCalendario[], anioHoy: number): number {
  const enCurso = eventos.find((e) => e.en_curso);
  return Math.min(enCurso?.anio ?? anioHoy, anioHoy);
}

// ---- Lo que el navegador revisa antes de guardar una fecha ------------------------------------------------------------

/** Las estaciones de un año que todavía no están en el calendario, en el orden del ciclo. */
export function estacionesFaltantes(eventos: readonly EventoCalendario[], anio: number): Estacion[] {
  const hay = new Set(eventos.filter((e) => e.anio === anio).map((e) => e.estacion));
  return ORDEN_ESTACIONES.filter((e) => !hay.has(e));
}

/** Una fecha que se está escribiendo en pantalla, siempre en hora de Perú. */
export type FechaEnEdicion = { anio: number; estacion: Estacion; fecha: string; hora: string };

/** Lo que se prellena al agregar un año: el 20/21/22/21 de mar/jun/set/dic a las 12:00. */
export function fechasSugeridas(anio: number, estaciones: readonly Estacion[]): FechaEnEdicion[] {
  const dos = (n: number) => String(n).padStart(2, "0");
  return estaciones.map((estacion) => ({
    anio,
    estacion,
    fecha: `${anio}-${dos(MES_DE_ESTACION[estacion])}-${dos(DIA_SUGERIDO[estacion])}`,
    hora: "12:00",
  }));
}

/**
 * Las filas de «Agregar el año»: SOLO las estaciones que todavía faltan en el calendario, con lo que el líder ya escribió
 * (o la sugerida si no tocó esa). Se recalcula con cada lectura del calendario: si un guardado quedó a medias, las que
 * alcanzaron a guardarse desaparecen de la ventana y las que faltan conservan lo escrito, así reintentar es pulsar otra
 * vez el mismo botón.
 */
export function fechasPorAgregar(
  eventos: readonly EventoCalendario[],
  anio: number,
  escritas: Partial<Record<Estacion, FechaEnEdicion>>,
): FechaEnEdicion[] {
  const faltan = estacionesFaltantes(eventos, anio);
  const sugeridas = fechasSugeridas(anio, faltan);
  return faltan.map((estacion, i) => escritas[estacion] ?? sugeridas[i]);
}

/** La estación anterior y la siguiente del calendario (por fecha): entre esas dos tiene que quedar la que se corre. */
export function vecinas(
  eventos: readonly EventoCalendario[],
  anio: number,
  estacion: Estacion,
): { antes: EventoCalendario | null; despues: EventoCalendario | null } {
  const orden = [...eventos].sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio));
  const i = orden.findIndex((e) => e.anio === anio && e.estacion === estacion);
  if (i < 0) return { antes: null, despues: null };
  return { antes: orden[i - 1] ?? null, despues: orden[i + 1] ?? null };
}

function nombreConFecha(e: Pick<EventoCalendario, "estacion" | "inicio">): string {
  return `${NOMBRE_ESTACION[e.estacion].toLowerCase()} (${textoInstanteLima(e.inicio)})`;
}

/** Lo que `revisarFechas` dice de cada fecha escrita. */
export type RevisionFecha = {
  /** El instante con la zona de Perú, o `null` si la fecha o la hora no son reales (entonces no hay qué mandar). */
  instante: string | null;
  /** BLOQUEA el guardado: solo cuando no hay instante. */
  error: string | null;
  /** NO bloquea: lo que la base probablemente rechace (fecha pasada, fuera de orden). Se dice antes del viaje, pero quien
   *  decide es la base, y su mensaje llega en castellano si de verdad lo rechaza. */
  aviso: string | null;
};

/**
 * Revisa, en orden, las fechas que se van a guardar (una al corregir; hasta cuatro al agregar un año).
 *
 * La web SOLO bloquea lo que la base no puede decir antes del viaje: que la fecha y la hora sean reales (sin eso no hay
 * instante que mandar). Las reglas del calendario viven en la base (`fijar_fechas_temporada` y los disparadores
 * `fn_temporada_fechas_candado` y `fn_temporada_fechas_orden`); aquí dos de ellas se AVISAN junto al campo, sin apagar el botón: que sea futura y que
 * quede después de la anterior y antes de la siguiente (también en el orden en que se escriben al agregar un año). La
 * holgura alrededor del 21 de su mes no se revisa aquí: es un número que la base puede cambiar, y una copia en la web
 * bloquearía una fecha que la base ya acepta.
 *
 * `limites`: el inicio de la estación anterior y de la siguiente que ya están en el calendario y NO se editan aquí.
 */
export function revisarFechas(
  filas: readonly FechaEnEdicion[],
  ahora: Date,
  limites: { antes: EventoCalendario | null; despues: EventoCalendario | null } = { antes: null, despues: null },
): RevisionFecha[] {
  let anterior: { instante: string; nombre: string } | null = limites.antes
    ? { instante: limites.antes.inicio, nombre: nombreConFecha(limites.antes) }
    : null;
  return filas.map((f) => {
    const instante = instanteLima(f.fecha, f.hora);
    if (!instante) return { instante: null, error: "Falta la fecha o la hora (o no es una fecha real).", aviso: null };
    const ms = Date.parse(instante);
    const resultado = (aviso: string | null): RevisionFecha => {
      anterior = { instante, nombre: `${NOMBRE_ESTACION[f.estacion].toLowerCase()} (${textoInstanteLima(instante)})` };
      return { instante, error: null, aviso };
    };
    if (ms <= ahora.getTime()) return resultado("Esa fecha ya pasó: la base solo acepta una fecha futura.");
    if (anterior && ms <= Date.parse(anterior.instante)) {
      return resultado(`Tiene que ser después del inicio de ${anterior.nombre}.`);
    }
    if (limites.despues && ms >= Date.parse(limites.despues.inicio)) {
      return resultado(`Tiene que ser antes del inicio de ${nombreConFecha(limites.despues)}.`);
    }
    return resultado(null);
  });
}

/**
 * Por qué la pestaña no puede mostrar las temporadas. La web puede publicarse ANTES que el SQL (20260928100000): sin la
 * función o la columna, la base responde «no existe» y la pestaña lo dice en vez de caerse. Cualquier otro fallo (la
 * red, un permiso) se dice distinto, para no esconder un problema real detrás de «todavía no».
 */
export function motivoSinTemporadas(error: { message?: string | null; code?: string | null } | null): string {
  const codigo = error?.code ?? "";
  const mensaje = (error?.message ?? "").toLowerCase();
  const noExiste =
    ["PGRST202", "PGRST204", "42883", "42703", "42P01"].includes(codigo) ||
    mensaje.includes("could not find the function") ||
    mensaje.includes("does not exist");
  return noExiste
    ? "Las temporadas todavía no están activas en esta base. Aparecen aquí apenas se aplique su migración."
    : "No se pudieron leer las temporadas. Recarga la página; si sigue igual, avisa a Felipe.";
}

/** Lo que la pestaña recibe del servidor (armado con las funciones de arriba). */
export type DatosPestanaTemporadas = {
  temporadas: Temporada[];
  calendario: EventoCalendario[];
  categorias: CategoriaTemporada[];
  sinTemporada: PrendaSinTemporada[];
  porTemporada: Record<string, number>;
  /** Prendas activas del catálogo: el total contra el que se lee cuántas faltan en la tarjeta «Por completar». */
  prendasActivas: number;
  anioHoy: number;
};

// ---- Las cuatro vistas de la pestaña (ADR-0246, «Actualización 2026-09-28»; ADR-0261) --------------------------------

/**
 * La pestaña se ve UNA vista a la vez. Desde el ADR-0261 (Felipe, 2026-09-28: «Grilla primero») abre con «Las nueve» en
 * grilla, igual que las otras cinco pestañas de Atributos; el trabajo —«Por completar», «Por categoría», «Calendario»—
 * queda a un clic, en la franja de arriba de la grilla, con lo que falta en cada uno. La vista vive en la URL (`?vista=`):
 * «Completar» de Productos y el enlace de Categorías siguen abriendo directo la suya.
 */
export const VISTAS_TEMPORADAS = ["completar", "categorias", "calendario", "lista"] as const;
export type VistaTemporadas = (typeof VISTAS_TEMPORADAS)[number];

/** La vista pedida en la URL; cualquier otra cosa (o nada) abre «Las nueve», como abre cualquier pestaña de Atributos. */
export function vistaTemporadas(param: string | null | undefined): VistaTemporadas {
  return VISTAS_TEMPORADAS.find((v) => v === param) ?? "lista";
}

// ---- Las nueve en grilla (ADR-0261) -------------------------------------------------------------------------------------

/**
 * Las estaciones que cubre una temporada, en el orden del año: desde `estacion_desde` hasta la anterior a
 * `estacion_hasta` (que es cuándo termina). Primavera-Verano cubre dos; Verano, una; el clásico de todo el año, ninguna en
 * particular (no termina). Sale de los datos de `fn_temporadas`, no de la clave: una temporada nueva se dibuja sola.
 */
export function estacionesDe(t: Pick<Temporada, "estacion_desde" | "estacion_hasta">): Estacion[] {
  if (!t.estacion_desde || !t.estacion_hasta) return [];
  const desde = ORDEN_ESTACIONES.indexOf(t.estacion_desde);
  const cubre: Estacion[] = [];
  for (let k = 0; k < ORDEN_ESTACIONES.length; k++) {
    const e = ORDEN_ESTACIONES[(desde + k) % ORDEN_ESTACIONES.length];
    if (e === t.estacion_hasta) break;
    cubre.push(e);
  }
  return cubre;
}

/** Los grupos de la grilla y de sus píldoras: una estación, las dos mitades del año y los clásicos. */
export type GrupoTemporada = "una" | "dos" | "clasicos";
export const ORDEN_GRUPOS_TEMPORADA: readonly GrupoTemporada[] = ["una", "dos", "clasicos"];
export const GRUPOS_TEMPORADA: Record<GrupoTemporada, { grupo: string; punto: string }> = {
  una: { grupo: "Una estación", punto: "bg-verde" },
  dos: { grupo: "Dos estaciones", punto: "bg-taupe-profundo" },
  clasicos: { grupo: "Clásicos", punto: "bg-tinta/25" },
};

export function grupoDeTemporada(t: Pick<Temporada, "es_clasico" | "estacion_desde" | "estacion_hasta">): GrupoTemporada {
  if (t.es_clasico) return "clasicos";
  return estacionesDe(t).length > 1 ? "dos" : "una";
}

/**
 * El tono del dibujo: la mitad del año en que se vende. Primavera y verano, cálido (ámbar); otoño e invierno, frío
 * (pizarra); los clásicos, neutro (tinta), porque no pertenecen a una mitad.
 */
export type TonoTemporada = "calido" | "frio" | "neutro";
export function tonoDeTemporada(t: Pick<Temporada, "es_clasico" | "estacion_desde" | "estacion_hasta">): TonoTemporada {
  if (t.es_clasico) return "neutro";
  const [primera] = estacionesDe(t);
  return primera === "primavera" || primera === "verano" ? "calido" : "frio";
}

/** Un grupo de «Por completar»: las prendas sin temporada de UNA categoría. */
export type GrupoSinTemporada = {
  /** `null` = «Sin categoría»: sin atajo, cada prenda se completa sola. */
  categoriaId: string | null;
  categoria: string;
  /** La categoría activa del grupo (para su atajo y la confirmación), o `null` si no tiene o está desactivada. */
  activa: CategoriaTemporada | null;
  prendas: PrendaSinTemporada[];
};

/**
 * Las prendas sin temporada agrupadas por su categoría, de la que más tiene a la que menos: ponerle la temporada a la
 * categoría completa el grupo entero de una vez, así que lo que más rinde va primero. «Sin categoría» va al final: no
 * tiene atajo.
 */
export function gruposPorCategoria(prendas: readonly PrendaSinTemporada[], categorias: readonly CategoriaTemporada[]): GrupoSinTemporada[] {
  const activas = new Map(categorias.map((c) => [c.id, c]));
  const grupos = new Map<string, GrupoSinTemporada>();
  for (const p of prendas) {
    const k = p.categoriaId ?? "";
    const g = grupos.get(k) ?? {
      categoriaId: p.categoriaId,
      categoria: p.categoria ?? "Sin categoría",
      activa: p.categoriaId ? (activas.get(p.categoriaId) ?? null) : null,
      prendas: [],
    };
    g.prendas.push(p);
    grupos.set(k, g);
  }
  return [...grupos.values()].sort(
    (a, b) =>
      Number(a.categoriaId === null) - Number(b.categoriaId === null) ||
      b.prendas.length - a.prendas.length ||
      a.categoria.localeCompare(b.categoria, "es"),
  );
}

/** Las cifras de las cuatro tarjetas que eligen la vista. */
export type ResumenVistas = {
  sinTemporada: number;
  /** Categorías (activas o no) en las que caen las prendas sin temporada. */
  categoriasConPendientes: number;
  categoriasSinTemporada: number;
  categorias: number;
  prendasActivas: number;
  /** La estación en curso y cuándo termina (`null` si el calendario no la tiene). */
  enCurso: { estacion: Estacion; hasta: string | null; siguiente: Estacion } | null;
};

export function resumenVistas(datos: Pick<DatosPestanaTemporadas, "sinTemporada" | "categorias" | "calendario" | "prendasActivas">): ResumenVistas {
  const enCurso = datos.calendario.find((e) => e.en_curso) ?? null;
  return {
    sinTemporada: datos.sinTemporada.length,
    categoriasConPendientes: new Set(datos.sinTemporada.map((p) => p.categoriaId ?? "")).size,
    categoriasSinTemporada: datos.categorias.filter((c) => !c.temporada).length,
    categorias: datos.categorias.length,
    prendasActivas: datos.prendasActivas,
    enCurso: enCurso
      ? { estacion: enCurso.estacion, hasta: enCurso.hasta, siguiente: ORDEN_ESTACIONES[(ORDEN_ESTACIONES.indexOf(enCurso.estacion) + 1) % ORDEN_ESTACIONES.length] }
      : null,
  };
}

/** «21 dic.» en hora de Perú: la fecha corta de la tarjeta «Calendario» (la hora exacta está en su tabla). */
export function textoDiaLima(instante: string): string {
  const [, m, d] = partesLima(instante).fecha.split("-").map(Number);
  const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
  return `${d} ${MESES[m - 1]}.`;
}

// ---- Las confirmaciones (textos) --------------------------------------------------------------------------------------

const prendas = (n: number) => `${n} ${n === 1 ? "prenda" : "prendas"}`;

/**
 * La confirmación ANTES de cambiarle la temporada a una categoría: cambiarla reclasifica al instante todas las prendas
 * que la heredan, así que la cifra se dice antes, no después. `de` y `a`: nombres, o `null` para «sin temporada».
 */
export function textoCambioCategoria(categoria: string, de: string | null, a: string | null, heredan: number): { titulo: string; bajada: string } {
  const cambio = `Pasa de «${de ?? "Sin temporada"}» a «${a ?? "Sin temporada"}».`;
  const efecto =
    heredan === 0
      ? "Hoy ninguna prenda la hereda: solo cambia lo que tomarán las prendas nuevas sin temporada propia."
      : `${heredan === 1 ? "1 prenda la hereda" : `${heredan} prendas la heredan`} hoy y ${heredan === 1 ? "se reclasifica" : "se reclasifican"} al instante${
          a ? "" : ` (${heredan === 1 ? "queda" : "quedan"} «Sin temporada» si no tienen la suya)`
        }. Las que tienen su propia temporada no cambian.`;
  return { titulo: `¿Cambiar la temporada de «${categoria}»?`, bajada: `${cambio} ${efecto}` };
}

/** La confirmación de la asignación en lote de la lista «Sin temporada». */
export function textoAsignar(temporada: string, cuantas: number): { titulo: string; bajada: string; verbo: string } {
  return {
    titulo: `¿Poner «${temporada}» a ${prendas(cuantas)}?`,
    bajada:
      "Se guarda todo junto: si una falla, no cambia ninguna. Si a alguna le pusieron temporada mientras tanto, esa se salta y se respeta. Va a la prenda con todos sus colores; si un color es de otra temporada, eso se pone en la ficha de la prenda.",
    verbo: "Asignar",
  };
}
