import { normalizarBusqueda } from "./combo-reglas";
import { diasEntreFechas } from "./fechas-lima";
import type { FaseClave } from "./orden-fases-reglas";
import {
  corteTerminado,
  diaCorto,
  estadoDeLaOrden,
  fasesSinRegistrar,
  fechaLimaDe,
  filasDeTela,
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
//   PROMETE: que una fila dice dónde está la orden, quién la tiene y cuánto lleva ahí; que «pide atención» es exactamente `rojoDeLaOrden` (la lista solo lo dice más corto); que «Hoy en
//            el Taller» (el Resumen) cuenta órdenes y prendas por la fase en que está cada orden abierta (una orden con todas las fases hechas cuenta en la última: espera pasar al
//            stock); que la franja «dónde está cada orden» pone cada orden abierta en UN solo tramo (su fase, o «Listas para el stock»); que una orden no se pierde al filtrar sin
//            que la pantalla diga cuántas hay; y que la búsqueda no distingue tildes ni mayúsculas ni el guion de «OP-000012».
//   Lo que se VE no junta datos con un punto medio (Felipe 2026-11-26, «Producción más clara»): cada dato de la fila es su pieza (`donde`, `dias`, `entrega`, `atencion`,
//            `coloresDeLaOrden`). `chip`, `quien` y `cierre` conservan su forma de siempre porque los leen el Resumen y la página de la orden.
//   ASUME:   las fechas llegan como `aaaa-mm-dd` y «hoy» es el de Lima (`hoyLima()`), como en la página de la orden.
//   NO HACE: no escribe, no ordena por nada que no se vea (la entrega manda), y no calcula dinero (la lista no lo muestra).

export const RPC_LISTA_DE_ORDENES = "fn_ordenes_produccion_lista";

export type PestanaLista = "en_curso" | "muestras" | "terminadas";
/** Un tramo de la franja «dónde está cada orden»: una fase, o las que ya esperan pasar al stock. */
export type TramoClave = FaseClave | "listas";

/** Por qué una fila pide atención, en corto: la insignia y su motivo en una línea. Las mismas tres causas de la página de la orden. */
export type AtencionDeFila = { clave: CausaRoja["clave"]; insignia: string; motivo: string };

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
  /** «negro y caqui» o `null` si la orden no tiene líneas. */
  colores: string | null;
  /** Cada color de la orden con su tono, el de más prendas primero: se dibujan como puntos de color. Si a alguno le falta el tono (`hex` en `null`), la fila escribe `colores`. */
  coloresDeLaOrden: { nombre: string; hex: string | null }[];
  esMuestra: boolean;
  urgente: boolean;
  estado: EstadoOrden;
  /** Las del plan; en una orden que pasó al stock, las que salieron buenas. */
  cuantas: number;
  /** La fase en que está (de «Hoy en el Taller»); en una orden lista para el stock, la última. `null` si ya no está en proceso. */
  grupo: FaseClave | null;
  /** Todas las fases terminaron y solo falta pasar las prendas al stock. */
  lista: boolean;
  /** Dónde está, como lo dice la página de la orden: «En costura · afuera». La fila muestra `donde`. */
  chip: EstadoDeLaOrden;
  /** Quién la tiene y cuánto lleva: «Taller · 21 de 36», «Confecciones del Norte · 48 afuera». Lo lee «Hoy en el Taller»; la fila muestra `donde`. */
  quien: string;
  /** La columna «Dónde está»: la fase en una insignia («En costura», con el nombre de la franja) y, debajo, quién la tiene, cada cosa en su línea («Afuera, con Confecciones del Norte»). */
  donde: { fase: string; tono: EstadoDeLaOrden["tono"]; lineas: string[] };
  /** Prendas afuera, con un servicio, ahora. */
  afuera: number;
  /** Cuánto lleva en esta fase: «3 días» y «Desde vie 16» (o «Abierta vie 16» si todavía no empezó); `null` si ya no está en proceso. */
  dias: { n: number; texto: string; desde: string } | null;
  entrega: { fecha: string | null; texto: string; relativo: string; atrasada: boolean };
  /** Por qué pide atención (vacío = va bien), las mismas tres causas de la página, cada una con su porqué. */
  causas: CausaRoja[];
  /** Las mismas causas, dichas en corto para la columna «Atención». */
  atencion: AtencionDeFila[];
  /** El día en que se abrió (`aaaa-mm-dd`). */
  abierta: string;
  /** Lo que se lee de una orden que ya no está en proceso: «45 buenas de 48 · en el stock desde el 12 oct». */
  cierre: string | null;
};

export type ListaDeOrdenes = { filas: FilaDeLista[]; alStockMes: { lotes: number; prendas: number } };

const cuantas = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const mayuscula = (t: string) => t.charAt(0).toLocaleUpperCase("es") + t.slice(1);

/** «vie 23 oct» y cuándo es, en su propia línea: «En 4 días», «Mañana», «Hoy», «Ayer», «Hace 3 días». Una orden que ya no está en proceso no tiene «cuándo». */
export function textoEntrega(fecha: string | null, hoy: string, enProceso: boolean): FilaDeLista["entrega"] {
  if (!fecha) return { fecha: null, texto: "Sin fecha", relativo: "", atrasada: false };
  const texto = diaCorto(fecha);
  if (!enProceso) return { fecha, texto, relativo: "", atrasada: false };
  const faltan = diasEntreFechas(hoy, fecha);
  if (faltan < 0) return { fecha, texto, relativo: faltan === -1 ? "Ayer" : `Hace ${-faltan} días`, atrasada: true };
  if (faltan === 0) return { fecha, texto, relativo: "Hoy", atrasada: false };
  if (faltan === 1) return { fecha, texto, relativo: "Mañana", atrasada: false };
  return { fecha, texto, relativo: `En ${faltan} días`, atrasada: false };
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
  // Una fase que se marca (Ploteo) no cuenta prendas: no hay «0 de 0» ni «por mandar», solo quién la tiene y que falta hacerla.
  if (actual.hito) return `${quien} · por hacer`;
  if (actual.quien === "servicio") {
    if (actual.afuera > 0) return `${quien} · ${actual.afuera} afuera`;
    return actual.hechas > 0 ? `${quien} · ${actual.hechas} de ${actual.entrada}` : `${quien} · por mandar`;
  }
  return `${quien} · ${actual.hechas} de ${actual.entrada}`;
}

/** Quién tiene la fase en que está la orden, en una línea: «En el Taller», «Afuera, con Confecciones del Norte», «Por mandar a Confecciones del Norte». */
function quienLaTiene(p: OrdenPagina): string {
  const actual = p.fases.find((f) => f.actual) ?? null;
  if (!actual || actual.quien !== "servicio") return "En el Taller";
  const nombre = actual.proveedorNombre;
  if (!nombre) return fasesSinRegistrar([actual]).length > 0 ? "Afuera, falta registrar con quién" : "Con un servicio";
  if (actual.afuera > 0) return `Afuera, con ${nombre}`;
  // Una fase que se marca (Ploteo) no manda prendas, y un servicio que ya devolvió algo no tiene nada «por mandar»: la tiene él.
  if (actual.hito || actual.hechas > 0) return `Con ${nombre}`;
  return `Por mandar a ${nombre}`;
}

/** Lo que se lee de una orden que ya no está en proceso, dato por dato. */
function partesDeCierre(p: OrdenPagina): string[] | null {
  const o = p.orden;
  if (o.estado === "terminada") {
    const buenas = `${o.cantidadBuenas ?? 0} buenas de ${o.cantidadPlan}`;
    if (o.ingresoAlStock === "ya_estaba") return [buenas, "ya estaban registradas, no sumó al stock"];
    if (o.inventariadoEn) return [buenas, `en el stock desde el ${diaCorto(fechaLimaDe(o.inventariadoEn))}`];
    return o.esMuestra ? [buenas, "muestra, no entra al stock"] : [buenas];
  }
  if (o.estado === "anulada") return ["Anulada", `se abrió el ${diaCorto(fechaLimaDe(o.creadoEn))}`, ...(o.nota ? [o.nota] : [])];
  return null;
}

/** Lo mismo en una sola frase, como lo guarda `cierre`. */
function textoDeCierre(p: OrdenPagina): string | null {
  return partesDeCierre(p)?.join(" · ") ?? null;
}

const INSIGNIA_DE_CAUSA: Record<CausaRoja["clave"], string> = { entrega_pasada: "Atrasada", tela_no_llega: "Falta tela", sin_moverse: "Sin moverse" };

/**
 * Las causas de `rojoDeLaOrden` dichas en corto, para que quepan a la vista sin abrir nada: una insignia y su motivo en una línea. No decide nada: si la página no dice que la orden
 * pide atención, aquí tampoco. El porqué completo (lo que viene en camino, el pedido atrasado, cuándo fue lo último que se anotó) está en la página de la orden.
 */
function atencionDeLaFila(p: OrdenPagina, causas: readonly CausaRoja[]): AtencionDeFila[] {
  return causas.map((c) => {
    if (c.clave === "entrega_pasada" && p.orden.fechaEntrega) return { clave: c.clave, insignia: INSIGNIA_DE_CAUSA[c.clave], motivo: `Debía entregarse el ${diaCorto(p.orden.fechaEntrega)}` };
    if (c.clave === "tela_no_llega") {
      const faltan = filasDeTela(p.insumos, corteTerminado(p)).filter((f) => !f.alcanza);
      const [primera] = faltan;
      if (primera) {
        // El nombre llega como «Lino · crudo», o «Lino · vino · beige» si la orden lleva la tela en dos colores: aquí se dice «lino, color crudo» o «lino, color vino y beige».
        const [tela, ...colores] = primera.nombre.toLocaleLowerCase("es").split(" · ");
        const nombre = colores.length > 0 ? `${tela}, color ${colores.join(" y ")}` : tela;
        const mas = faltan.length - 1;
        return {
          clave: c.clave,
          insignia: faltan.every((f) => f.tipo === "avio") ? "Faltan avíos" : INSIGNIA_DE_CAUSA[c.clave],
          motivo: `Faltan ${primera.faltan ?? ""} de ${nombre}${mas > 0 ? ` y ${mas === 1 ? "otro insumo" : `otros ${mas} insumos`}` : ""}`.replace("  ", " "),
        };
      }
    }
    if (c.clave === "sin_moverse") {
      // Los días los cuenta `rojoDeLaOrden` y los dice en su título («9 días sin moverse»): se leen de ahí para no contar dos veces.
      const dias = Number.parseInt(c.titulo, 10);
      if (Number.isFinite(dias)) return { clave: c.clave, insignia: INSIGNIA_DE_CAUSA[c.clave], motivo: `${dias} días sin que nadie anote nada` };
    }
    return { clave: c.clave, insignia: INSIGNIA_DE_CAUSA[c.clave], motivo: c.titulo };
  });
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
  // «negro y caqui»: lo que dice la ficha, sin las tallas (la lista no cabe con ellas).
  const colores = textoColoresYTallas(p.lineas)?.split(" · ")[0] ?? null;
  const porNombre = new Map<string, { nombre: string; hex: string | null; n: number }>();
  for (const l of p.lineas) {
    if (!l.colorNombre) continue;
    const nombre = l.colorNombre.toLocaleLowerCase("es");
    const antes = porNombre.get(nombre);
    porNombre.set(nombre, { nombre, hex: antes?.hex ?? l.colorHex, n: (antes?.n ?? 0) + l.cantidadPlan });
  }
  const coloresDeLaOrden = [...porNombre.values()].sort((a, b) => b.n - a.n).map(({ nombre, hex }) => ({ nombre, hex }));
  let dias: FilaDeLista["dias"] = null;
  if (enProceso && !lista) {
    const desde = actual?.desde ? (actual.desde.length > 10 ? fechaLimaDe(actual.desde) : actual.desde) : null;
    const n = Math.max(diasEntreFechas(desde ?? abierta, hoy), 0);
    // «Desde hoy» ya dice desde cuándo; si todavía no empezó, igual se dice cuándo se abrió.
    dias = { n, texto: n === 0 ? "Desde hoy" : cuantas(n, "día", "días"), desde: desde ? (n === 0 ? "" : `Desde ${diaYNumero(desde)}`) : `Abierta ${diaYNumero(abierta)}` };
  }
  const chip = estadoDeLaOrden(o, p.fases);
  const grupo = !enProceso ? null : lista ? (p.fases[p.fases.length - 1]?.clave ?? null) : (actual?.clave ?? null);
  const causas = rojoDeLaOrden(p, hoy);
  const donde: FilaDeLista["donde"] = {
    // En una fase, el nombre de la franja («Por cortar», «En costura»): el mismo tramo se llama igual arriba y en la fila. Fuera de una fase, lo que dice la página, sin el «· afuera».
    fase: enProceso && !lista && grupo ? TITULO_DE_FASE[grupo] : chip.texto.split(" · ")[0],
    tono: chip.tono,
    lineas: enProceso ? [quienLaTiene(p)] : (partesDeCierre(p) ?? []).filter((parte) => parte !== chip.texto).map(mayuscula),
  };
  return {
    id: o.id,
    numero: o.numero,
    numeroTexto: o.numeroTexto,
    href: `/produccion/ordenes/${o.numeroTexto}`,
    referencia: o.producto.referencia,
    categoria: o.producto.categoria ? { nombre: o.producto.categoria.nombre, prefijo: o.producto.categoria.prefijo, familia: o.producto.categoria.familia } : null,
    colorHex,
    colores,
    coloresDeLaOrden,
    esMuestra: o.esMuestra,
    urgente: o.urgente,
    estado: o.estado,
    cuantas: o.estado === "terminada" && o.cantidadBuenas !== null ? o.cantidadBuenas : o.cantidadPlan,
    grupo,
    lista,
    chip,
    quien: enProceso ? textoDeQuien(p) : (textoDeCierre(p) ?? ""),
    donde,
    afuera: actual?.quien === "servicio" ? actual.afuera : 0,
    dias,
    entrega: textoEntrega(o.fechaEntrega, hoy, enProceso),
    causas,
    atencion: atencionDeLaFila(p, causas),
    abierta,
    cierre: enProceso ? null : textoDeCierre(p),
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

// ---------- La franja «dónde está cada orden» ----------

export type TramoDelCamino = { clave: TramoClave; titulo: string; ordenes: number; /** «70 prendas», o «Ninguna» si no hay órdenes ahí. */ prendas: string; /** Alguna orden del tramo pide atención. */ atencion: boolean };
export type CaminoDeLasOrdenes = { todas: { ordenes: number; prendas: string }; tramos: TramoDelCamino[] };

/** El tramo en que está una orden abierta: su fase o, con todas las fases hechas, «listas» (espera pasar al stock). `null` si ya no está en proceso o no tiene fase. */
export function tramoDe(f: FilaDeLista): TramoClave | null {
  if (f.estado !== "en_proceso") return null;
  return f.lista ? "listas" : f.grupo;
}

/**
 * La franja de arriba de la lista: «Todas» (las órdenes abiertas, lotes y muestras, y sus prendas) y un tramo por fase, en el orden de la ruta, con «Listas para el stock» al final.
 * Cada orden abierta está en UN solo tramo: a diferencia de las tarjetas «Hoy en el Taller» de antes, la que ya terminó todas sus fases no se cuenta en la última sino
 * en «Listas para el stock». Corte, Costura y «Listas» se ven siempre; las demás fases, solo si alguna orden está ahí.
 */
export function caminoDeLasOrdenes(filas: readonly FilaDeLista[]): CaminoDeLasOrdenes {
  const abiertas = filas.filter((f) => f.estado === "en_proceso");
  const prendasDe = (grupo: readonly FilaDeLista[]) => (grupo.length === 0 ? "Ninguna" : cuantas(grupo.reduce((s, f) => s + f.cuantas, 0), "prenda", "prendas"));
  const tramo = (clave: TramoClave, titulo: string): TramoDelCamino => {
    const aca = abiertas.filter((f) => tramoDe(f) === clave);
    return { clave, titulo, ordenes: aca.length, prendas: prendasDe(aca), atencion: aca.some((f) => f.causas.length > 0) };
  };
  const fases = ORDEN_DE_FASES.filter((c) => TARJETAS_SIEMPRE.includes(c) || abiertas.some((f) => tramoDe(f) === c));
  return { todas: { ordenes: abiertas.length, prendas: prendasDe(abiertas) }, tramos: [...fases.map((c) => tramo(c, TITULO_DE_FASE[c])), tramo("listas", "Listas para el stock")] };
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

/** ¿La búsqueda encuentra la orden? Por modelo, por número («OP-12», «000012», «12») o por color; sin tildes ni mayúsculas. Una búsqueda vacía encuentra todo. */
export function cumpleBusqueda(f: FilaDeLista, texto: string): boolean {
  const buscado = normalizarBusqueda(texto);
  if (buscado === "") return true;
  const pajar = normalizarBusqueda(`${f.referencia} ${f.numeroTexto} ${f.numero} ${f.colores ?? ""}`);
  return buscado.split(" ").every((palabra) => pajar.includes(palabra));
}

/** Lo que la persona eligió ver: la pestaña, el tramo tocado en la franja (`null` = todas), si solo quiere las que piden atención, y lo que busca. */
export type ConsultaLista = { pestana: PestanaLista; tramo: TramoClave | null; piden: boolean; texto: string };

/** Las órdenes que se ven: la pestaña, el tramo tocado en la franja, «Piden atención» y la búsqueda, todo a la vez. */
export function filtrarFilas(filas: readonly FilaDeLista[], q: ConsultaLista): FilaDeLista[] {
  return filas.filter((f) => pestanaDe(f) === q.pestana && (q.tramo === null || tramoDe(f) === q.tramo) && (!q.piden || f.causas.length > 0) && cumpleBusqueda(f, q.texto));
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

/** Cuántas piden atención dentro de lo que ya dicen la pestaña, el tramo y la búsqueda: el número de la píldora «Piden atención». */
export function cuantasPidenAtencion(filas: readonly FilaDeLista[], q: Omit<ConsultaLista, "piden">): number {
  return filtrarFilas(filas, { ...q, piden: true }).length;
}

/** El renglón de abajo de la tabla, en dos piezas: cuántas son («5 órdenes en curso») y cómo van ordenadas («Primero la entrega más cercana»). */
export function pieDeLaLista(n: number, pestana: PestanaLista, hayFiltro: boolean): { cuenta: string; orden: string } {
  const que = pestana === "en_curso" ? ["orden en curso", "órdenes en curso"] : pestana === "muestras" ? ["muestra en desarrollo", "muestras en desarrollo"] : ["orden cerrada", "órdenes cerradas"];
  return {
    cuenta: `${n} ${n === 1 ? que[0] : que[1]}${hayFiltro ? " con lo que elegiste" : ""}`,
    orden: pestana === "terminadas" ? "Primero las más nuevas" : "Primero la entrega más cercana",
  };
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
