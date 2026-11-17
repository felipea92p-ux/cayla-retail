import type { RecepcionReciente } from "./compras-reglas";
import { diaLima } from "./fechas-lima";
import { esViejoPorTerminar, prendasPorTerminar, type EnvioPorTerminar } from "./por-terminar-reglas";
import { esEnvioSinAviso } from "./recepcion-conteo-reglas";
import { normalizarBusqueda } from "./recepcion-envio-busqueda";
import type { EnvioPorAbrir, OrdenDirecta } from "./recepcion-envio-reglas";
import { DIAS_PARA_RESALTAR } from "./recepcion-salida-reglas";
import { agruparPorEnvio, marcasDelEnvio, nombreSinEnvio, soloTerminados, type EnvioRecibido } from "./recibido-por-envio-reglas";
import { diasEntre } from "./tabla-viva-reglas";

// «Envíos» de Recibir mercadería en UNA sola lista (Felipe 2026-11-17, propuesta «C · Índice» de docs/maquetas/recibir-envios-2026-11): hasta
// ese día la pantalla tenía tres (los envíos por recibir, lo que quedó por terminar y lo terminado) y un envío a medias salía en dos de ellas y
// en un aviso. Aquí cada envío es UNA fila con UN estado, y lo que ya entró al stock es su avance, no otra fila. Lógica pura: la pantalla
// (`components/recepcion-envio/EnviosDeLaSede.tsx`) solo la dibuja con la tabla con superpoderes.

/** En qué va un envío, de lo que falta más a lo que no falta nada. */
export type EstadoDeEnvio = "sin_guia" | "en_camino" | "contando" | "por_terminar" | "terminado";
export const ESTADOS_DE_ENVIO: readonly EstadoDeEnvio[] = ["sin_guia", "en_camino", "contando", "por_terminar", "terminado"];
export const TEXTO_ESTADO: Record<EstadoDeEnvio, string> = {
  sin_guia: "Sin guía",
  en_camino: "En camino",
  contando: "Contando",
  por_terminar: "Por terminar",
  terminado: "Terminado",
};

export type FilaDeEnvio = {
  /** La clave de la fila: el envío (`despachos.id`), la orden sin guía o, en una llegada sin envío, su lote. */
  clave: string;
  estado: EstadoDeEnvio;
  /** «ENV-000061», «OC-000465»; `null` en una llegada sin envío. */
  numero: string | null;
  /** Lo que se dice donde no hay número: «Sin envío», «Llegó con el alta». */
  sinNumero: string | null;
  marcas: string[];
  proveedores: string[];
  /** El instante (ISO) por el que se ordena: cuándo salió (en camino, contando), cuándo se terminó de contar (por terminar) o cuándo llegó
   *  (terminado). `null`: una orden sin guía todavía no salió. */
  instante: string | null;
  /** Las prendas del envío; `null` si todavía no se sabe (uno que llegó sin aviso y nadie contó, o uno por terminar). */
  unidades: number | null;
  contadas: number;
  enStock: number;
  /** Solo en «por terminar»: qué falta, en palabras («79 por separar · 43 por poner tallas»). */
  queFalta: string | null;
  /** Quien mira hizo la orden: no la recibe (decisión 17). */
  creadoPorMi: boolean;
  sinAviso: boolean;
  /** A dónde lleva la fila: el envío que se sigue recibiendo o que falta terminar. `null`: se abre en su lugar (una hoja). */
  href: string | null;
  /** Los originales, para lo que la fila abre. */
  envio?: EnvioPorAbrir;
  orden?: OrdenDirecta;
  recibido?: EnvioRecibido;
};

const quFalta = (e: EnvioPorTerminar): string =>
  [e.porSeparar ? `${e.porSeparar} por separar` : null, e.porDetallar ? `${e.porDetallar} por poner tallas` : null, e.porCrear ? `${e.porCrear} por crear` : null].filter(Boolean).join(" · ");

const marcasDe = (e: EnvioRecibido): string[] => marcasDelEnvio(e).flatMap((m) => (m.marca ? [m.marca] : []));

/**
 * Las filas de la sede: una por envío. Un envío que se sigue recibiendo o que quedó por terminar NO sale además como terminado (lo que ya entró
 * al stock es su avance); uno por terminar toma de sus llegadas las marcas, los proveedores y lo que ya entró, si están entre las recientes.
 */
export function filasDeLaSede(o: {
  envios: readonly EnvioPorAbrir[];
  ordenes: readonly OrdenDirecta[];
  /** Lo que ya se contó y lo que ya entró al stock de cada envío abierto (`fn_envios_a_medias`), por id. */
  aMedias?: Readonly<Record<string, { enStock: number; contadas: number }>>;
  /** De quién es cada envío sin aviso abierto, por id. */
  proveedoresSinAviso?: Readonly<Record<string, string | null>>;
  porTerminar: readonly EnvioPorTerminar[];
  recibidos: readonly RecepcionReciente[];
}): FilaDeEnvio[] {
  const abiertos = new Set(o.envios.map((e) => e.id));
  const pendientes = o.porTerminar.filter((e) => !abiertos.has(e.despachoId));
  const sinTerminar = new Set([...abiertos, ...pendientes.map((e) => e.despachoId)]);
  const grupos = agruparPorEnvio(o.recibidos);
  const grupoDe = new Map(grupos.filter((g) => g.numero !== null).map((g) => [g.clave, g]));

  const deEnvios = o.envios.map((e): FilaDeEnvio => {
    const sinAviso = esEnvioSinAviso(e);
    const medias = o.aMedias?.[e.id];
    const contadas = medias?.contadas ?? 0;
    const proveedor = o.proveedoresSinAviso?.[e.id];
    return {
      clave: e.id,
      estado: e.estado === "abierto" ? "contando" : "en_camino",
      numero: e.numero,
      sinNumero: null,
      marcas: e.marcas,
      proveedores: sinAviso ? (proveedor ? [proveedor] : []) : e.proveedores,
      instante: e.despachadoEn,
      // Uno que llegó sin aviso no trae líneas: lo que se sabe de él es lo que ya se contó.
      unidades: sinAviso ? (contadas > 0 ? contadas : null) : e.unidades,
      contadas,
      enStock: medias?.enStock ?? 0,
      queFalta: null,
      creadoPorMi: e.creadoPorMi,
      sinAviso,
      href: e.estado === "abierto" && !e.creadoPorMi ? `/recibir/envio/${e.id}` : null,
      envio: e,
    };
  });
  const deOrdenes = o.ordenes.map((orden): FilaDeEnvio => ({
    clave: orden.ordenId,
    estado: "sin_guia",
    numero: orden.numero,
    sinNumero: null,
    marcas: orden.marcas,
    proveedores: orden.proveedor ? [orden.proveedor] : [],
    instante: null,
    unidades: orden.unidadesPorEnviar,
    contadas: 0,
    enStock: 0,
    queFalta: null,
    creadoPorMi: orden.creadaPorMi,
    sinAviso: false,
    href: null,
    orden,
  }));
  const dePendientes = pendientes.map((e): FilaDeEnvio => {
    const grupo = grupoDe.get(e.despachoId);
    return {
      clave: e.despachoId,
      estado: "por_terminar",
      numero: e.numero,
      sinNumero: e.numero ? null : "Envío",
      marcas: grupo ? marcasDe(grupo) : [],
      proveedores: grupo?.proveedores ?? [],
      instante: e.cerradoEn,
      unidades: null,
      contadas: 0,
      enStock: grupo?.unidades ?? 0,
      queFalta: quFalta(e) || `${prendasPorTerminar(e)} por terminar`,
      creadoPorMi: false,
      sinAviso: false,
      href: `/recibir/envio/${e.despachoId}`,
    };
  });
  const deTerminados = soloTerminados(grupos, sinTerminar).map((e): FilaDeEnvio => ({
    clave: e.clave,
    estado: "terminado",
    numero: e.numero,
    sinNumero: e.numero ? null : nombreSinEnvio(e),
    marcas: marcasDe(e),
    proveedores: e.proveedores,
    instante: e.llegoEn ?? e.fecha,
    unidades: e.unidades,
    contadas: e.unidades,
    enStock: e.unidades,
    queFalta: null,
    creadoPorMi: false,
    sinAviso: false,
    href: null,
    recibido: e,
  }));
  return ordenarPorInstante([...deEnvios, ...deOrdenes, ...dePendientes, ...deTerminados], "desc");
}

/** Del más nuevo al más antiguo (o al revés); lo que no tiene fecha va SIEMPRE al final, y a igual instante queda el orden que traía. */
export function ordenarPorInstante(filas: readonly FilaDeEnvio[], dir: "asc" | "desc"): FilaDeEnvio[] {
  const signo = dir === "asc" ? 1 : -1;
  const t = (f: FilaDeEnvio) => {
    const ms = f.instante ? Date.parse(f.instante) : NaN;
    return Number.isNaN(ms) ? null : ms;
  };
  return filas
    .map((f, i) => ({ f, i, t: t(f) }))
    .sort((a, b) => (a.t === b.t ? 0 : a.t === null ? 1 : b.t === null ? -1 : (a.t - b.t) * signo) || a.i - b.i)
    .map((x) => x.f);
}

/** Las tres vistas de la tarjeta: lo que falta recibir (todo menos lo terminado), lo terminado y todo junto. */
export type VistaDeEnvios = "recibir" | "terminados" | "todos";
export const VISTAS_DE_ENVIOS: readonly { clave: VistaDeEnvios; texto: string }[] = [
  { clave: "recibir", texto: "Por recibir" },
  { clave: "terminados", texto: "Terminados" },
  { clave: "todos", texto: "Todos" },
];

export function enVista(f: FilaDeEnvio, vista: VistaDeEnvios): boolean {
  return vista === "todos" || (vista === "terminados") === (f.estado === "terminado");
}

export function cuentaPorVista(filas: readonly FilaDeEnvio[]): Record<VistaDeEnvios, number> {
  const terminados = filas.filter((f) => f.estado === "terminado").length;
  return { recibir: filas.length - terminados, terminados, todos: filas.length };
}

/** La tarjeta abre en lo que hay que atender; sin nada por recibir, en lo terminado (no en una tabla vacía). */
export function vistaInicial(filas: readonly FilaDeEnvio[]): VistaDeEnvios {
  return filas.some((f) => f.estado !== "terminado") || filas.length === 0 ? "recibir" : "terminados";
}

/** Cuántos días de calendario (Lima) lleva así; `null` sin fecha. */
export function diasDeLaFila(f: FilaDeEnvio, hoy: string): number | null {
  const dia = diaLima(f.instante);
  return dia ? Math.max(0, -diasEntre(dia, hoy)) : null;
}

/** Lo que lleva mucho sin terminar se dice en ámbar: uno que se está contando desde hace 3 días o más (el número del aviso que esto reemplaza,
 *  `DIAS_PARA_RESALTAR`) y uno por terminar desde hace más de 7 (ADR-0393). Lo que va en camino no avisa: un viaje puede tardar. */
export function llevaMucho(f: FilaDeEnvio, hoy: string): boolean {
  const dias = diasDeLaFila(f, hoy);
  if (dias === null) return false;
  if (f.estado === "contando") return dias >= DIAS_PARA_RESALTAR;
  return f.estado === "por_terminar" && esViejoPorTerminar(dias);
}

/** Los tramos del filtro de la fecha (el rango libre de antes pasa a tres tramos que se eligen de un toque). */
export const TRAMOS_DE_FECHA = ["Hoy y ayer", "Últimos 7 días", "Antes", "Sin fecha"] as const;
export function tramoDeFecha(f: FilaDeEnvio, hoy: string): (typeof TRAMOS_DE_FECHA)[number] {
  const dias = diasDeLaFila(f, hoy);
  if (dias === null) return "Sin fecha";
  return dias <= 1 ? "Hoy y ayer" : dias <= 7 ? "Últimos 7 días" : "Antes";
}

/** Qué parte ya está en el stock (0 a 1), para ordenar; `null` si no se sabe cuántas prendas trae. */
export function parteEnStock(f: FilaDeEnvio): number | null {
  return f.unidades && f.unidades > 0 ? Math.min(1, f.enStock / f.unidades) : null;
}

const n = (x: number) => x.toLocaleString("es-PE");

/** Lo que dice la fila de cuánto se recibió, en una línea corta. */
export function textoRecibido(f: FilaDeEnvio): string {
  if (f.estado === "por_terminar") return f.enStock > 0 ? `${n(f.enStock)} en stock · ${f.queFalta}` : (f.queFalta ?? "—");
  if (f.estado === "terminado") return `${n(f.enStock)} en stock`;
  if (f.unidades === null) return f.enStock > 0 ? `${n(f.enStock)} en stock` : "Sin contar";
  if (f.enStock > 0) return f.enStock >= f.unidades ? `Las ${n(f.unidades)} en stock` : `${n(f.enStock)} de ${n(f.unidades)} en stock`;
  if (f.contadas > 0) return `${n(f.contadas)} de ${n(f.unidades)} contadas`;
  return `${n(f.unidades)} ${f.unidades === 1 ? "prenda" : "prendas"}`;
}

/** Todo lo que se puede escribir para encontrar un envío, junto y normalizado. */
export function textoBuscableDeFila(f: FilaDeEnvio): string {
  const partes = [f.numero, f.sinNumero, f.envio?.numeroGuia, ...(f.envio?.ordenes ?? []), ...f.marcas, ...f.proveedores, TEXTO_ESTADO[f.estado], f.sinAviso ? "sin aviso" : null];
  return normalizarBusqueda(partes.filter(Boolean).join(" "));
}
