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
};

/** Una prenda de la lista «Sin temporada». */
export type PrendaSinTemporada = {
  productoId: string;
  nombre: string;
  codigo: string | null;
  categoria: string | null;
  /** Los colores que quedaron sin temporada (nombre del vocabulario; «Sin color» si la variante no tiene). */
  colores: string[];
  /** `false` si algún otro color de la prenda ya tiene la suya (una excepción por color puesta en la ficha). */
  todosSusColores: boolean;
};

export type ProductoParaTemporadas = { id: string; nombre: string; codigo: string | null; categoriaId: string | null };
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
        categoria: p?.categoriaId ? (nombreCategoria.get(p.categoriaId) ?? null) : null,
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

/** Busca en la lista «Sin temporada» por nombre, código, categoría o color, sin tildes ni mayúsculas. */
export function filtrarSinTemporada(prendas: readonly PrendaSinTemporada[], texto: string): PrendaSinTemporada[] {
  const k = clave(texto);
  if (!k) return [...prendas];
  return prendas.filter((p) => clave([p.nombre, p.codigo, p.categoria, ...p.colores].filter(Boolean).join(" ")).includes(k));
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
  anioHoy: number;
};

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
