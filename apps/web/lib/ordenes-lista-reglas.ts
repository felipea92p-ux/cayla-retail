import { normalizarBusqueda } from "./combo-reglas";
import { diasEntreFechas } from "./fechas-lima";
import type { FaseClave } from "./orden-fases-reglas";
import { etapaActual, type EstadoEtapa, type EtapaClave } from "./produccion-reglas";
import {
  diaCorto,
  estadoDeLaOrden,
  fasePorDefinir,
  fechaLimaDe,
  leerOrdenPagina,
  quienDeFase,
  rojoDeLaOrden,
  textoColoresYTallas,
  todasLasQueCuentanHechas,
  type CausaRoja,
  type EstadoDeLaOrden,
  type EstadoOrden,
  type OrdenPagina,
} from "./orden-pagina-reglas";

// La lista de Órdenes del Taller (ADR-0400, actividad 5; «A · Lista», elegida por Felipe el 2026-10-14): las reglas puras. Sin React ni Supabase.
//
// LA BASE MANDA: `fn_ordenes_produccion_lista` (migración 20261015005000) devuelve, de cada orden, lo MISMO que `fn_orden_produccion` para la página (sin costos y con solo el último
// movimiento de la línea de tiempo). Aquí se LEE esa respuesta con el mismo lector de la página (`leerOrdenPagina`), y cada fila se arma con las MISMAS reglas que la página usa —el chip
// de dónde está (`estadoDeLaOrden`), quién tiene la fase (`quienDeFase`) y las tres causas por las que una orden pide algo (`rojoDeLaOrden`)—: la lista y la página no pueden
// contradecirse porque no hay una segunda fórmula.
//
// CONTRATO
//   PROMETE: que una fila dice dónde está la orden, quién la tiene y cuánto lleva ahí; que «pide algo» es exactamente `rojoDeLaOrden`; que «Hoy en el Taller» cuenta lotes y prendas
//            por la fase en que está cada orden abierta (una orden con todas las fases hechas cuenta en la última: espera pasar al stock); que una orden no se pierde al filtrar sin
//            que la pantalla diga cuántas hay; y que la búsqueda no distingue tildes ni mayúsculas ni el guion de «OP-000012».
//   ASUME:   las fechas llegan como `aaaa-mm-dd` y «hoy» es el de Lima (`hoyLima()`), como en la página de la orden.
//   NO HACE: no escribe, no ordena por nada que no se vea (la entrega manda), y no calcula dinero (la lista no lo muestra).

export const RPC_LISTA_DE_ORDENES = "fn_ordenes_produccion_lista";

export type PestanaLista = "en_curso" | "muestras" | "terminadas";
export type FiltroDeLista = "todas" | "afuera" | "piden" | "listas";

export type FilaDeLista = {
  id: string;
  numero: number;
  numeroTexto: string;
  /** La página de la orden (`/produccion/ordenes/OP-000012`). */
  href: string;
  referencia: string;
  categoria: { nombre: string | null; prefijo: string | null; familia: string | null } | null;
  /** El color con más prendas del plan: de él se pinta la prenda sin foto. */
  colorHex: string | null;
  /** «negro, caqui» o `null` si la orden no tiene líneas. */
  colores: string | null;
  esMuestra: boolean;
  estado: EstadoOrden;
  /** Las del plan; en una orden que pasó al stock, las que salieron buenas. */
  cuantas: number;
  /** La fase en que está (de «Hoy en el Taller»); en una orden lista para el stock, la última. `null` si ya no está en proceso. */
  grupo: FaseClave | null;
  /** Todas las fases terminaron y solo falta pasar las prendas al stock. */
  lista: boolean;
  /** Dónde está, en un chip: «En costura · afuera». */
  chip: EstadoDeLaOrden;
  /** Quién la tiene y cuánto lleva: «Taller · 21 de 36», «Confecciones del Norte · 48 afuera». */
  quien: string;
  /** Prendas afuera, con un servicio, ahora. */
  afuera: number;
  /** Cuánto lleva en esta fase: «3 d» y «desde vie 16» (o «abierta vie 16» si todavía no empezó); `null` si ya no está en proceso. */
  dias: { n: number; desde: string } | null;
  entrega: { fecha: string | null; texto: string; relativo: string; atrasada: boolean };
  /** Por qué pide algo (vacío = va bien), las mismas tres causas de la página, cada una con su porqué. */
  causas: CausaRoja[];
  /** El día en que se abrió (`aaaa-mm-dd`). */
  abierta: string;
  /** Lo que se lee de una orden que ya no está en proceso: «45 buenas de 48 · en el stock desde el 12 oct». */
  cierre: string | null;
  /** Una orden abierta ANTES de que existieran las fases: no trae ninguna, se lee de sus etapas de siempre (`conEtapasDeAntes`) y se sigue desde el cajón, no desde su página. */
  legado: boolean;
};

export type ListaDeOrdenes = { filas: FilaDeLista[]; alStockMes: { lotes: number; prendas: number } };

const cuantas = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** «vie 23 oct» y cuándo es: «en 4 días», «mañana», «hoy», «ayer», «hace 3 días». Una orden que ya no está en proceso no tiene «cuándo». */
export function textoEntrega(fecha: string | null, hoy: string, enProceso: boolean): FilaDeLista["entrega"] {
  if (!fecha) return { fecha: null, texto: "Sin fecha", relativo: "", atrasada: false };
  const texto = diaCorto(fecha);
  if (!enProceso) return { fecha, texto, relativo: "", atrasada: false };
  const faltan = diasEntreFechas(hoy, fecha);
  if (faltan < 0) return { fecha, texto, relativo: faltan === -1 ? "ayer" : `hace ${-faltan} días`, atrasada: true };
  if (faltan === 0) return { fecha, texto, relativo: "hoy", atrasada: false };
  if (faltan === 1) return { fecha, texto, relativo: "mañana", atrasada: false };
  return { fecha, texto, relativo: `en ${faltan} días`, atrasada: false };
}

/** «vie 16»: el día de la semana y el número, sin el mes (la columna «En la fase» es angosta y el mes sale de «hace N días»). */
function diaYNumero(iso: string): string {
  return diaCorto(iso).split(" ").slice(0, 2).join(" ");
}

/** «Taller · 21 de 36», «Confecciones del Norte · 48 afuera», «Confecciones del Norte · por mandar». */
function textoDeQuien(p: OrdenPagina): string {
  const actual = p.fases.find((f) => f.actual) ?? null;
  if (!actual) return todasLasQueCuentanHechas(p.fases) ? "Taller · todas las fases listas" : "Taller";
  const quien = quienDeFase(actual);
  // Sin proveedor todavía: no hay a quién mandar ni de quién recibir (ADR-0550).
  if (fasePorDefinir(actual)) return "Falta definir quién";
  // Una fase que se marca (Ploteo) no cuenta prendas: no hay «0 de 0» ni «por mandar», solo quién la tiene y que falta hacerla.
  if (actual.hito) return `${quien} · por hacer`;
  if (actual.quien === "servicio") {
    if (actual.afuera > 0) return `${quien} · ${actual.afuera} afuera`;
    return actual.hechas > 0 ? `${quien} · ${actual.hechas} de ${actual.entrada}` : `${quien} · por mandar`;
  }
  return `${quien} · ${actual.hechas} de ${actual.entrada}`;
}

/** Lo que se lee de una orden que ya no está en proceso. */
function textoDeCierre(p: OrdenPagina): string | null {
  const o = p.orden;
  if (o.estado === "terminada") {
    const buenas = `${o.cantidadBuenas ?? 0} buenas de ${o.cantidadPlan}`;
    if (o.inventariadoEn) return `${buenas} · en el stock desde el ${diaCorto(fechaLimaDe(o.inventariadoEn))}`;
    return o.esMuestra ? `${buenas} · muestra, no entra al stock` : buenas;
  }
  if (o.estado === "anulada") return `Anulada · se abrió el ${diaCorto(fechaLimaDe(o.creadoEn))}${o.nota ? ` · ${o.nota}` : ""}`;
  return null;
}

/** Una fila de la lista, armada con las reglas de la página de esa orden. `hoy` es `aaaa-mm-dd` de Lima. */
export function filaDeLaLista(p: OrdenPagina, hoy: string): FilaDeLista {
  const o = p.orden;
  const enProceso = o.estado === "en_proceso";
  const actual = p.fases.find((f) => f.actual) ?? null;
  const lista = enProceso && todasLasQueCuentanHechas(p.fases);
  const abierta = fechaLimaDe(o.creadoEn);
  const porColor = new Map<string, { hex: string; n: number }>();
  for (const l of p.lineas) if (l.colorHex) porColor.set(l.colorHex, { hex: l.colorHex, n: (porColor.get(l.colorHex)?.n ?? 0) + l.cantidadPlan });
  const colorHex = [...porColor.values()].sort((a, b) => b.n - a.n)[0]?.hex ?? null;
  // «negro, caqui»: lo que dice la ficha, sin las tallas (la lista no cabe con ellas).
  const colores = textoColoresYTallas(p.lineas)?.split(" · ")[0] ?? null;
  let dias: FilaDeLista["dias"] = null;
  if (enProceso && !lista) {
    const desde = actual?.desde ? (actual.desde.length > 10 ? fechaLimaDe(actual.desde) : actual.desde) : null;
    dias = desde ? { n: Math.max(diasEntreFechas(desde, hoy), 0), desde: `desde ${diaYNumero(desde)}` } : { n: Math.max(diasEntreFechas(abierta, hoy), 0), desde: `abierta ${diaYNumero(abierta)}` };
  }
  return {
    id: o.id,
    numero: o.numero,
    numeroTexto: o.numeroTexto,
    href: `/produccion/ordenes/${o.numeroTexto}`,
    referencia: o.producto.referencia,
    categoria: o.producto.categoria ? { nombre: o.producto.categoria.nombre, prefijo: o.producto.categoria.prefijo, familia: o.producto.categoria.familia } : null,
    colorHex,
    colores,
    esMuestra: o.esMuestra,
    estado: o.estado,
    cuantas: o.estado === "terminada" && o.cantidadBuenas !== null ? o.cantidadBuenas : o.cantidadPlan,
    grupo: !enProceso ? null : lista ? (p.fases[p.fases.length - 1]?.clave ?? null) : (actual?.clave ?? null),
    lista,
    chip: estadoDeLaOrden(o, p.fases),
    quien: enProceso ? textoDeQuien(p) : (textoDeCierre(p) ?? ""),
    afuera: actual?.quien === "servicio" ? actual.afuera : 0,
    dias,
    entrega: textoEntrega(o.fechaEntrega, hoy, enProceso),
    causas: rojoDeLaOrden(p, hoy),
    abierta,
    cierre: enProceso ? null : textoDeCierre(p),
    legado: enProceso && p.fases.length === 0,
  };
}

const ETAPA_DE_ANTES: Record<string, { texto: string; grupo: FaseClave | null }> = {
  corte: { texto: "Por cortar", grupo: "corte" },
  confeccion: { texto: "En confección", grupo: "costura" },
  acabado: { texto: "En acabado", grupo: "acabado" },
  patronaje: { texto: "En patronaje", grupo: null },
  muestra: { texto: "En muestra y aprobación", grupo: null },
  escalado: { texto: "En escalado y ploteo", grupo: null },
};

/**
 * Una orden abierta antes de las fases no tiene ninguna: dónde está se lee de sus etapas de siempre (una tercerizada sigue en curso: la prenda no volvió). Lo demás —el color, las
 * causas, la entrega— sale igual, de la misma lectura. Una fila con fases queda como está.
 */
export function conEtapasDeAntes(f: FilaDeLista, etapas: Partial<Record<EtapaClave, EstadoEtapa>> | undefined): FilaDeLista {
  if (!f.legado) return f;
  const actual = etapaActual(etapas ?? {}, f.esMuestra);
  if (actual === "listo") return { ...f, grupo: "acabado", lista: true, chip: { texto: "Lista para pasar al stock", tono: "verde" }, quien: "Orden de antes de las fases", dias: null };
  const e = ETAPA_DE_ANTES[actual];
  const afuera = (etapas ?? {})[actual] === "tercerizado";
  return {
    ...f,
    grupo: e?.grupo ?? null,
    chip: { texto: `${e?.texto ?? "En proceso"}${afuera ? " · afuera" : ""}`, tono: "pizarra" },
    quien: afuera ? "Con un servicio · orden de antes de las fases" : "Orden de antes de las fases",
  };
}

/**
 * La respuesta de `fn_ordenes_produccion_lista` leída. `null` si no se parece a lo que la base manda (la pantalla dice «no se pudo leer», nunca una lista vacía que parezca «no hay
 * órdenes»). Una orden suelta que no se entiende se descarta.
 */
export function leerListaDeOrdenes(crudo: unknown, hoy: string): ListaDeOrdenes | null {
  if (typeof crudo !== "object" || crudo === null || Array.isArray(crudo)) return null;
  const c = crudo as Record<string, unknown>;
  if (!Array.isArray(c.ordenes)) return null;
  const filas = c.ordenes.flatMap((o) => {
    const p = leerOrdenPagina(o);
    return p ? [filaDeLaLista(p, hoy)] : [];
  });
  const stock = typeof c.al_stock_mes === "object" && c.al_stock_mes !== null ? (c.al_stock_mes as Record<string, unknown>) : {};
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(Math.trunc(v), 0) : 0);
  return { filas, alStockMes: { lotes: n(stock.lotes), prendas: n(stock.prendas) } };
}

// ---------- Hoy en el Taller ----------

export type CifraDeFase = { clave: FaseClave; titulo: string; lotes: number; prendas: number; contexto: string; atencion: boolean };

const TITULO_DE_FASE: Record<FaseClave, string> = {
  ploteo: "Por plotear",
  corte: "Por cortar",
  habilitado: "En habilitado",
  costura: "En costura",
  ojales_botones: "En ojales y botones",
  limpieza_revision: "En limpieza y revisión",
  planchado: "En planchado",
  etiquetado_embolsado: "En etiquetado",
  acabado: "En acabado",
  bordado: "En bordado",
  estampado: "En estampado",
  lavanderia: "En lavandería",
};
const ORDEN_DE_FASES: FaseClave[] = [
  "ploteo",
  "corte",
  "habilitado",
  "bordado",
  "estampado",
  "costura",
  "ojales_botones",
  "lavanderia",
  "limpieza_revision",
  "acabado",
  "planchado",
  "etiquetado_embolsado",
];

/** Las dos tarjetas que se ven siempre en «Hoy en el Taller»: donde empieza el lote y donde se arma la prenda. */
const TARJETAS_SIEMPRE: readonly FaseClave[] = ["corte", "costura"];

/**
 * «Hoy en el Taller»: una tarjeta por fase con lo que hay ahí AHORA (lotes y prendas de las órdenes abiertas, muestras incluidas). Corte y Costura siempre; las demás fases (Ploteo, Habilitado, Limpiar y revisar, Planchado, Etiquetar, Acabado de las órdenes de antes, Bordado, Estampado, Lavandería…) solo si alguna orden está ahí. Cada una dice lo que importa de esa fase: sin tela en el corte, lo que está afuera y con quién en un servicio, y las que esperan pasar al stock.
 */
export function cifrasHoyEnElTaller(filas: readonly FilaDeLista[]): CifraDeFase[] {
  const abiertas = filas.filter((f) => f.estado === "en_proceso" && f.grupo !== null);
  const claves = ORDEN_DE_FASES.filter((c) => TARJETAS_SIEMPRE.includes(c) || abiertas.some((f) => f.grupo === c));
  return claves.map((clave) => {
    const aca = abiertas.filter((f) => f.grupo === clave);
    const prendas = aca.reduce((s, f) => s + f.cuantas, 0);
    const sinTela = aca.filter((f) => f.causas.some((c) => c.clave === "tela_no_llega")).length;
    const afuera = aca.reduce((s, f) => s + f.afuera, 0);
    const listas = aca.filter((f) => f.lista).length;
    const servicios = [...new Set(aca.filter((f) => f.afuera > 0).map((f) => f.quien.split(" · ")[0]))];
    const partes: string[] = [];
    if (aca.length === 0) partes.push("ninguna ahora");
    else {
      partes.push(cuantas(prendas, "prenda", "prendas"));
      if (afuera > 0) partes.push(`${afuera} afuera${servicios.length > 0 ? ` con ${servicios.join(" y ")}` : ""}`);
      if (sinTela > 0) partes.push(`${sinTela} sin tela`);
      if (listas > 0) partes.push(`${cuantas(listas, "lista", "listas")} para el stock`);
    }
    return { clave, titulo: TITULO_DE_FASE[clave], lotes: aca.length, prendas, contexto: partes.join(" · "), atencion: sinTela > 0 || aca.some((f) => f.causas.length > 0) };
  });
}

// ---------- Pestañas, filtros, búsqueda y orden ----------

/** La pestaña a la que pertenece una orden: las abiertas, en «En curso» o «Muestras»; las que ya no están en proceso (pasaron al stock o se anularon), en «Terminadas». */
export function pestanaDe(f: FilaDeLista): PestanaLista {
  if (f.estado !== "en_proceso") return "terminadas";
  return f.esMuestra ? "muestras" : "en_curso";
}

export function cuentasDePestanas(filas: readonly FilaDeLista[]): Record<PestanaLista, number> {
  const cuentas: Record<PestanaLista, number> = { en_curso: 0, muestras: 0, terminadas: 0 };
  for (const f of filas) cuentas[pestanaDe(f)]++;
  return cuentas;
}

/** ¿La orden cumple este filtro? «Afuera»: hay prendas con un servicio; «Piden algo»: tiene alguna de las tres causas; «Listas»: esperan pasar al stock. */
export function cumpleFiltro(f: FilaDeLista, filtro: FiltroDeLista): boolean {
  switch (filtro) {
    case "afuera":
      return f.afuera > 0;
    case "piden":
      return f.causas.length > 0;
    case "listas":
      return f.lista;
    default:
      return true;
  }
}

/** ¿La búsqueda encuentra la orden? Por modelo, por número («OP-12», «000012», «12») o por color; sin tildes ni mayúsculas. Una búsqueda vacía encuentra todo. */
export function cumpleBusqueda(f: FilaDeLista, texto: string): boolean {
  const buscado = normalizarBusqueda(texto);
  if (buscado === "") return true;
  const pajar = normalizarBusqueda(`${f.referencia} ${f.numeroTexto} ${f.numero} ${f.colores ?? ""}`);
  return buscado.split(" ").every((palabra) => pajar.includes(palabra));
}

export type ConsultaLista = { pestana: PestanaLista; fase: FaseClave | null; filtro: FiltroDeLista; texto: string };

/** Las órdenes que se ven: la pestaña, la fase tocada en «Hoy en el Taller», el filtro y la búsqueda, todo a la vez. */
export function filtrarFilas(filas: readonly FilaDeLista[], q: ConsultaLista): FilaDeLista[] {
  return filas.filter((f) => pestanaDe(f) === q.pestana && (q.fase === null || f.grupo === q.fase) && cumpleFiltro(f, q.filtro) && cumpleBusqueda(f, q.texto));
}

/** En curso y Muestras, por entrega (la más cercana primero; sin fecha, al final) y, a igual entrega, la más nueva primero. Terminadas: la más nueva primero. */
export function ordenarFilas(filas: readonly FilaDeLista[], pestana: PestanaLista): FilaDeLista[] {
  const masNueva = (a: FilaDeLista, b: FilaDeLista) => b.numero - a.numero;
  if (pestana === "terminadas") return [...filas].sort(masNueva);
  return [...filas].sort((a, b) => {
    const ea = a.entrega.fecha;
    const eb = b.entrega.fecha;
    if (ea && eb && ea !== eb) return ea < eb ? -1 : 1;
    if (ea && !eb) return -1;
    if (!ea && eb) return 1;
    return masNueva(a, b);
  });
}

/** Cuántas hay con cada filtro dentro de lo que ya dicen la pestaña, la fase y la búsqueda (el número que lleva cada píldora). */
export function cuentasDeFiltros(filas: readonly FilaDeLista[], q: Omit<ConsultaLista, "filtro">): Record<FiltroDeLista, number> {
  const base = filas.filter((f) => pestanaDe(f) === q.pestana && (q.fase === null || f.grupo === q.fase) && cumpleBusqueda(f, q.texto));
  return { todas: base.length, afuera: base.filter((f) => f.afuera > 0).length, piden: base.filter((f) => f.causas.length > 0).length, listas: base.filter((f) => f.lista).length };
}

/** El renglón de abajo de la tabla: «5 órdenes en curso · ordenadas por entrega, la más cercana primero». */
export function pieDeLaLista(n: number, pestana: PestanaLista, hayFiltro: boolean): { cuenta: string; orden: string } {
  const que = pestana === "en_curso" ? ["orden en curso", "órdenes en curso"] : pestana === "muestras" ? ["muestra en desarrollo", "muestras en desarrollo"] : ["orden cerrada", "órdenes cerradas"];
  return {
    cuenta: `${n} ${n === 1 ? que[0] : que[1]}${hayFiltro ? " con lo que elegiste" : ""}`,
    orden: pestana === "terminadas" ? "Las más nuevas primero" : "Ordenadas por entrega, la más cercana primero",
  };
}

/** La frase de la cabecera de «Hoy en el Taller»: «6 órdenes abiertas · 3 piden algo». */
export function datoHoyEnElTaller(filas: readonly FilaDeLista[]): string {
  const abiertas = filas.filter((f) => f.estado === "en_proceso");
  const piden = abiertas.filter((f) => f.causas.length > 0).length;
  if (abiertas.length === 0) return "ninguna orden abierta";
  return `${cuantas(abiertas.length, "orden abierta", "órdenes abiertas")} · ${piden === 0 ? "ninguna pide algo" : `${piden} ${piden === 1 ? "pide" : "piden"} algo`}`;
}

// ---------- La orden que se acaba de abrir (ADR-0509, actividad 1) ----------
// `abrir_orden_produccion` ya devuelve (id, numero) y la pantalla lo tiraba: quien creaba una orden no veía dónde quedó (una muestra cae en otra pestaña) y dudaba si se guardó.

export type OrdenCreada = { id: string; numero: number; numeroTexto: string; /** La página de la orden (`/produccion/ordenes/OP-000012`), la misma que lleva la fila de la lista. */ href: string };

/**
 * Lo que devuelve `abrir_orden_produccion` (`returns table (id uuid, numero integer)`: supabase-js lo entrega como una lista de una fila). Si no trae un id y un número entero positivo
 * devuelve `null` y la pantalla sigue como siempre, sin «Ver la orden»: nunca se inventa un número.
 */
export function leerOrdenCreada(data: unknown): OrdenCreada | null {
  const fila = Array.isArray(data) ? data[0] : data;
  if (!fila || typeof fila !== "object") return null;
  const { id, numero } = fila as Record<string, unknown>;
  const n = typeof numero === "number" ? numero : typeof numero === "string" && /^\d+$/.test(numero) ? Number(numero) : Number.NaN;
  if (typeof id !== "string" || id === "" || !Number.isInteger(n) || n < 1) return null;
  const numeroTexto = `OP-${String(n).padStart(6, "0")}`;
  return { id, numero: n, numeroTexto, href: `/produccion/ordenes/${numeroTexto}` };
}

/** La pestaña donde queda una orden recién abierta: siempre está en proceso, así que es «Muestras» o «En curso» (la misma regla de `pestanaDe`). */
export function pestanaDeOrdenNueva(esMuestra: boolean): PestanaLista {
  return esMuestra ? "muestras" : "en_curso";
}

/** Los parámetros con los que «Nueva orden» llega abierta desde el Resumen, Análisis o Nuevo producto (`lib/modelo-nuevo-orden-reglas.ts`). */
const PARAMETROS_DE_NUEVA = ["nueva", "sugerida", "tipo"] as const;

/**
 * La dirección sin los parámetros con los que «Nueva orden» llegó abierta. La URL no cambia al cerrar ni al guardar, así que con F5 la hoja volvía a abrirse aunque la orden ya estuviera
 * creada. Lo demás (`orden`, la ruta, el ancla) se conserva tal cual. Una dirección que no los trae vuelve igual.
 */
export function urlSinParametrosDeNueva(href: string): string {
  const u = new URL(href, "http://cayla.local");
  for (const p of PARAMETROS_DE_NUEVA) u.searchParams.delete(p);
  return `${u.pathname}${u.search}${u.hash}`;
}
