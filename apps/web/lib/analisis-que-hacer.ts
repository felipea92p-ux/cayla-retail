import { lineasEnUrl, MAX_VARIANTES_EN_URL } from "./existencias-prendas";
import { TENDENCIA_MIN_UNIDADES, TENDENCIA_UMBRAL_PCT } from "./inventario-reglas";
import { clavePrendaDe } from "./prenda-clave";
import { variacionPct } from "./resumen-comparacion";
import type { AnalisisDesempeno, DireccionTendencia } from "./resumen-desempeno";
import { lecturaDesempeno, type Lectura } from "./resumen-lectura";
import type { OrigenAbastecimiento } from "./resumen-reglas";
import { costoEsVerificable } from "./rotacion";
import { compararTallas } from "./tallas";

// Análisis conectado (ADR-0245, spike `docs/maquetas/analisis-conectado-2026-09/`): de la lectura de cada talla a
// «qué hacer» y a la pantalla que lo hace. Regla de oro (ADR-0121): Análisis SUGIERE, nunca mueve stock — cada acción
// lleva a la pantalla que ya hace el trabajo (Bajar al piso, Mover mercadería, Etiquetas, Compras, Producción) con la
// lista cargada, o abre «Pedir a otra sede» (ADR-0242 D-7), que la otra sede confirma. Nunca sugiere cantidades: cada
// talla viaja con 1 y la persona pone cuántas (ADR-0231).
//
// Los grupos NO son reglas nuevas: salen de `lecturaDesempeno` (las 7 categorías canónicas de Felipe) —
//   agotada               → «Se agotaron»
//   problema_reposicion   → «Duermen en almacén» (solo si HOY hay algo en el almacén que bajar)
//   sobrestock            → «Duermen en almacén» (ídem)
//   estancamiento         → «Estancadas»
//   saludable + de las que más venden → «Las que más venden»
//   reposicion_reciente / datos_insuficientes → «Aún sin base» (se dice una vez, no en cada fila)
//   lo demás (estimada, sin cambio…) → sin grupo
// Todo es puro (sin base de datos) y se prueba en `analisis-que-hacer.test.ts`.

export type GrupoQueHacer = "agotada" | "duerme" | "estancada" | "top" | "sinbase" | "otras";
/** Los grupos de trabajo que se muestran como tarjetas (en este orden). */
export const GRUPOS_TRABAJO = ["agotada", "duerme", "estancada", "top"] as const;
export type GrupoTrabajo = (typeof GRUPOS_TRABAJO)[number];

export const INFO_GRUPO: Record<GrupoQueHacer, { titulo: string; que: string; accion: string; chip: string; tono: "rojo" | "ambar" | "verde" | "neutro" }> = {
  agotada: { titulo: "Se agotaron", que: "Vendían y el piso quedó vacío", accion: "Reponer", chip: "Se agotó", tono: "rojo" },
  duerme: { titulo: "Duermen en almacén", que: "Venden al colgarse, pero están guardadas", accion: "Bajar al piso", chip: "Duerme en almacén", tono: "ambar" },
  estancada: { titulo: "Estancadas", que: "14 días o más colgadas sin vender", accion: "Trasladar o rebajar", chip: "Estancada", tono: "ambar" },
  top: { titulo: "Las que más venden", que: "Cuida que no se corten las tallas", accion: "Ver tallas", chip: "Vende bien", tono: "verde" },
  sinbase: { titulo: "Aún sin base", que: "Recién colgadas: todavía no se pueden juzgar", accion: "Esperar", chip: "Recién colgada", tono: "neutro" },
  otras: { titulo: "Sin novedad", que: "", accion: "", chip: "Sin novedad", tono: "neutro" },
};

const PRIORIDAD: Record<GrupoQueHacer, number> = { agotada: 0, duerme: 1, estancada: 2, top: 3, otras: 4, sinbase: 5 };

/** Cuántas variantes (las que más vendieron en el alcance) pueden entrar a «Las que más venden». */
export const TOP_VENDIDAS = 10;

export function esGrupo(v: string | null | undefined): v is GrupoQueHacer {
  return !!v && v in PRIORIDAD;
}

/** El grupo de una talla, a partir de su lectura. `esTop` = está entre las `TOP_VENDIDAS` del alcance. */
export function grupoDeTalla(x: AnalisisDesempeno, lectura: Lectura | null, esTop: boolean): GrupoQueHacer {
  if (!lectura) return "otras";
  switch (lectura.regla) {
    case "agotada":
      return "agotada";
    case "estancamiento":
      return "estancada";
    case "problema_reposicion":
    case "sobrestock":
      // «Duerme en almacén» pide bajar al piso: sin nada en el almacén HOY no hay qué bajar, y no se promete.
      return (x.fila.stockActualPisoAlmacen?.almacen ?? 0) > 0 ? "duerme" : "otras";
    case "saludable":
      return esTop ? "top" : "otras";
    case "reposicion_reciente":
    case "datos_insuficientes":
      return "sinbase";
    default:
      return "otras";
  }
}

export type TallaAnalisis = { x: AnalisisDesempeno; lectura: Lectura | null; grupo: GrupoQueHacer };

/** La lectura y el grupo de cada talla del alcance. `dias` = días del período. */
export function analizarTallas(analisis: readonly AnalisisDesempeno[], dias: number): TallaAnalisis[] {
  const top = new Set(
    [...analisis]
      .filter((x) => x.periodo.ventasNetas > 0)
      .sort((a, b) => b.periodo.ventasNetas - a.periodo.ventasNetas)
      .slice(0, TOP_VENDIDAS)
      .map((x) => x.fila.varianteId),
  );
  return analisis.map((x) => {
    const lectura = lecturaDesempeno(x, dias);
    return { x, lectura, grupo: grupoDeTalla(x, lectura, top.has(x.fila.varianteId)) };
  });
}

// ---------------------------------------------------------------------------
// Por prenda (modelo + color), como Existencias (ADR-0237)
// ---------------------------------------------------------------------------

export type TendenciaPrenda = { direccion: DireccionTendencia; variacionPct: number } | null;

export type PrendaAnalisis = {
  clave: string;
  productoId: string;
  referencia: string;
  color: string | null;
  colorHex: string | null;
  tallas: TallaAnalisis[];
  vendidas: number;
  importe: number;
  /** Sell-through de exposición de la prenda: Σ vendido maduro ÷ Σ disponible maduro de sus tallas. */
  colgado: { pct: number | null; pendiente: number };
  /** Días expuesta en piso sin vender, de la talla que vendió más recientemente (la prenda «vendió» si vendió cualquier talla). */
  sinVentaDias: number | null;
  tendencia: TendenciaPrenda;
  /** El grupo más urgente de sus tallas. */
  grupo: GrupoQueHacer;
  /** El porqué del grupo: la lectura de la primera talla de ese grupo. */
  lectura: Lectura | null;
  /** HOY: null si la sede no separa piso y almacén (o alguna talla no lo sabe). */
  hoy: { piso: number; almacen: number } | null;
  stockCierre: number;
};

export type MitadesPrenda = { dividido: boolean; diasPrimera: number; diasSegunda: number };

/** La prenda (modelo+color) de una talla: la misma clave que usa Frescura (`prenda-clave.ts`). */
export function clavePrenda(x: AnalisisDesempeno): string {
  return clavePrendaDe(x.fila.productoId, x.fila.colorCodigo, x.fila.color);
}

const netas = (d: { ventas: number; devoluciones: number }) => d.ventas - d.devoluciones;

/** La tendencia de la PRENDA: ventas netas por día de la 2.ª mitad contra la 1.ª, sumando sus tallas. Mismos umbrales que
 *  la de cada talla (`TENDENCIA_MIN_UNIDADES`, `TENDENCIA_UMBRAL_PCT`); aquí no hay ritmo por exposición porque las tallas
 *  se colgaron en días distintos: es la lectura gruesa de «¿la prenda vende más o menos?». */
export function tendenciaPrenda(tallas: readonly TallaAnalisis[], m: MitadesPrenda): TendenciaPrenda {
  if (!m.dividido || m.diasPrimera <= 0 || m.diasSegunda <= 0) return null;
  const a = tallas.reduce((t, s) => t + netas(s.x.fila.a), 0);
  const b = tallas.reduce((t, s) => t + netas(s.x.fila.b), 0);
  if (a + b < TENDENCIA_MIN_UNIDADES) return null;
  const pct = variacionPct(a / m.diasPrimera, b / m.diasSegunda);
  if (pct === null) return null;
  const direccion: DireccionTendencia = pct >= TENDENCIA_UMBRAL_PCT ? "alza" : pct <= -TENDENCIA_UMBRAL_PCT ? "baja" : "estable";
  return { direccion, variacionPct: pct };
}

export function agruparPrendas(tallas: readonly TallaAnalisis[], m: MitadesPrenda): PrendaAnalisis[] {
  const grupos = new Map<string, TallaAnalisis[]>();
  for (const t of tallas) {
    const k = clavePrenda(t.x);
    const lista = grupos.get(k);
    if (lista) lista.push(t);
    else grupos.set(k, [t]);
  }
  return [...grupos.entries()].map(([clave, lista]) => {
    const ts = [...lista].sort((a, b) => compararTallas(a.x.fila.talla ?? "", b.x.fila.talla ?? ""));
    const f = ts[0]!.x.fila;
    const grupo = ts.reduce<GrupoQueHacer>((g, t) => (PRIORIDAD[t.grupo] < PRIORIDAD[g] ? t.grupo : g), "sinbase");
    const confiables = ts.filter((t) => t.x.fila.ledgerConsistente);
    const vendidoMaduro = confiables.reduce((s, t) => s + t.x.sellThroughExposicion.vendidoMaduro, 0);
    const disponibleMaduro = confiables.reduce((s, t) => s + t.x.sellThroughExposicion.disponibleMaduro, 0);
    const dias = ts.map((t) => t.x.fila.pisoExpuestoDesdeUltimaVentaDias).filter((d): d is number => d !== null);
    const conocidos = ts.map((t) => t.x.fila.stockActualPisoAlmacen);
    return {
      clave,
      productoId: f.productoId,
      referencia: f.referencia,
      color: f.color,
      colorHex: f.colorHex,
      tallas: ts,
      vendidas: ts.reduce((s, t) => s + t.x.periodo.ventasNetas, 0),
      importe: ts.reduce((s, t) => s + t.x.periodo.importe, 0),
      colgado: {
        pct: disponibleMaduro > 0 ? Math.round((vendidoMaduro / disponibleMaduro) * 1000) / 10 : null,
        pendiente: ts.reduce((s, t) => s + t.x.sellThroughExposicion.pendienteMadurez, 0),
      },
      sinVentaDias: dias.length > 0 ? Math.min(...dias) : null,
      tendencia: tendenciaPrenda(ts, m),
      grupo,
      lectura: ts.find((t) => t.grupo === grupo)?.lectura ?? null,
      hoy: conocidos.every((c) => c !== null) ? { piso: conocidos.reduce((s, c) => s + c!.piso, 0), almacen: conocidos.reduce((s, c) => s + c!.almacen, 0) } : null,
      stockCierre: ts.reduce((s, t) => s + t.x.periodo.stockCierre, 0),
    };
  });
}

/** ¿Tiene la prenda alguna talla en ese grupo? (el filtro de «Qué hacer»: una prenda puede estar en dos grupos). */
export function prendaEnGrupo(p: PrendaAnalisis, g: GrupoQueHacer): boolean {
  return p.tallas.some((t) => t.grupo === g);
}

/** Con el filtro de un grupo, la fila habla de ese grupo (su chip y su acción); sin filtro, del más urgente. */
export function grupoMostrado(p: PrendaAnalisis, filtro: GrupoQueHacer | null): GrupoQueHacer {
  return filtro && prendaEnGrupo(p, filtro) ? filtro : p.grupo;
}

// ---------------------------------------------------------------------------
// Orden de la lista por prenda
// ---------------------------------------------------------------------------

export type OrdenPrendas = "urgencia" | "vendidos" | "sell_through" | "aceleracion" | "desaceleracion";
export const ORDEN_INICIAL_PRENDAS: OrdenPrendas = "urgencia";
export const OPCIONES_ORDEN_PRENDAS: readonly { valor: OrdenPrendas; texto: string }[] = [
  { valor: "urgencia", texto: "Piden algo primero" },
  { valor: "vendidos", texto: "Más vendidas" },
  { valor: "sell_through", texto: "Más vendido de lo colgado" },
  { valor: "aceleracion", texto: "Las que más crecen" },
  { valor: "desaceleracion", texto: "Las que más frenan" },
];

export function leerOrdenPrendas(v: string | undefined): OrdenPrendas {
  return OPCIONES_ORDEN_PRENDAS.find((o) => o.valor === v)?.valor ?? ORDEN_INICIAL_PRENDAS;
}

/** null al final en cualquier sentido. */
function porNumero<T>(f: (t: T) => number | null, sentido: 1 | -1) {
  return (a: T, b: T) => {
    const x = f(a);
    const y = f(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x - y) * sentido;
  };
}

export function ordenarPrendas(prendas: readonly PrendaAnalisis[], orden: OrdenPrendas, filtro: GrupoQueHacer | null = null): PrendaAnalisis[] {
  const vendidas = porNumero<PrendaAnalisis>((p) => p.vendidas, -1);
  const nombre = (a: PrendaAnalisis, b: PrendaAnalisis) => a.referencia.localeCompare(b.referencia, "es") || (a.color ?? "").localeCompare(b.color ?? "", "es");
  const criterio: Record<OrdenPrendas, (a: PrendaAnalisis, b: PrendaAnalisis) => number> = {
    urgencia: (a, b) => PRIORIDAD[grupoMostrado(a, filtro)] - PRIORIDAD[grupoMostrado(b, filtro)] || vendidas(a, b) || nombre(a, b),
    vendidos: (a, b) => vendidas(a, b) || nombre(a, b),
    sell_through: (a, b) => porNumero<PrendaAnalisis>((p) => p.colgado.pct, -1)(a, b) || vendidas(a, b) || nombre(a, b),
    aceleracion: (a, b) => porNumero<PrendaAnalisis>((p) => p.tendencia?.variacionPct ?? null, -1)(a, b) || vendidas(a, b) || nombre(a, b),
    desaceleracion: (a, b) => porNumero<PrendaAnalisis>((p) => p.tendencia?.variacionPct ?? null, 1)(a, b) || vendidas(a, b) || nombre(a, b),
  };
  return [...prendas].sort(criterio[orden]);
}

// ---------------------------------------------------------------------------
// Cifras de arriba y conteo de los grupos
// ---------------------------------------------------------------------------

export type CifrasAccion = {
  /** Prendas por grupo (una prenda cuenta en cada grupo en que tenga alguna talla). */
  grupos: Record<GrupoQueHacer, number>;
  /** Prendas que piden algo hoy: se agotaron, duermen en almacén o están estancadas (cada una una vez). */
  pidenAlgo: number;
  /** Lo vendido de lo colgado (sell-through de exposición del conjunto). */
  colgado: { pct: number | null; vendido: number; disponible: number };
  /** Lo estancado al cierre: unidades y, si TODAS tienen costo confiable, su valor al costo. */
  quieto: { unidades: number; costo: number | null };
};

export function calcularCifrasAccion(tallas: readonly TallaAnalisis[], prendas: readonly PrendaAnalisis[]): CifrasAccion {
  const grupos = { agotada: 0, duerme: 0, estancada: 0, top: 0, sinbase: 0, otras: 0 } as Record<GrupoQueHacer, number>;
  for (const p of prendas) for (const g of new Set(p.tallas.map((t) => t.grupo))) grupos[g] += 1;
  const pidenAlgo = prendas.filter((p) => p.tallas.some((t) => t.grupo === "agotada" || t.grupo === "duerme" || t.grupo === "estancada")).length;

  const confiables = tallas.filter((t) => t.x.fila.ledgerConsistente);
  const vendido = confiables.reduce((s, t) => s + t.x.sellThroughExposicion.vendidoMaduro, 0);
  const disponible = confiables.reduce((s, t) => s + t.x.sellThroughExposicion.disponibleMaduro, 0);

  const quietas = tallas.filter((t) => t.grupo === "estancada");
  const unidades = quietas.reduce((s, t) => s + t.x.periodo.stockCierre, 0);
  const conCosto = quietas.every((t) => costoEsVerificable(t.x.fila.costo, t.x.fila.estadoCosto));
  return {
    grupos,
    pidenAlgo,
    colgado: { pct: disponible > 0 ? Math.round((vendido / disponible) * 1000) / 10 : null, vendido, disponible },
    quieto: { unidades, costo: conCosto ? quietas.reduce((s, t) => s + t.x.periodo.stockCierre * (t.x.fila.costo ?? 0), 0) : null },
  };
}

/** Unidades vendidas por talla en todo el alcance (el gráfico «Qué tallas salen»), en el orden de las tallas. */
export function ventasPorTalla(tallas: readonly TallaAnalisis[]): { talla: string; unidades: number }[] {
  const m = new Map<string, number>();
  for (const t of tallas) {
    const k = t.x.fila.talla ?? "Única";
    m.set(k, (m.get(k) ?? 0) + Math.max(0, t.x.periodo.ventasNetas));
  }
  return [...m.entries()]
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => compararTallas(a, b))
    .map(([talla, unidades]) => ({ talla, unidades }));
}

// ---------------------------------------------------------------------------
// Acciones: qué botón lleva cada prenda y a dónde
// ---------------------------------------------------------------------------

/** Lo que se sabe de la red por variante (de `fn_resumen_variantes_json`): otras TIENDAS con algo libre y cómo se abastece. */
export type RedVariante = { tiendas: { id: string; nombre: string; libre: number }[]; origen: OrigenAbastecimiento | null };

/** Qué pantallas ve la cuenta (ADR-0161): un botón que lleva a «Sin acceso» no se muestra. */
export type AccesoAnalisis = {
  bajar: boolean;
  traslados: boolean;
  pedir: boolean;
  compras: boolean;
  produccion: boolean;
  productos: boolean;
  existencias: boolean;
};

export type LineaPedido = { varianteId: string; etiqueta: string; disponibleEnOrigen: number; cantidad: number };

export type AccionAnalisis =
  | { clave: "bajar" | "trasladar" | "rebajar" | "reponer" | "existencias" | "historial"; texto: string; sub: string; href: string }
  | { clave: "pedir"; texto: string; sub: string; origen: { id: string; nombre: string }; lineas: LineaPedido[] };

const hoyDe = (t: TallaAnalisis) => t.x.fila.stockActualPisoAlmacen;
const bajable = (t: TallaAnalisis) => (hoyDe(t)?.almacen ?? 0) > 0;
const etiquetaTalla = (t: TallaAnalisis) => [t.x.fila.referencia, t.x.fila.color, t.x.fila.talla].filter(Boolean).join(" · ");

function enlace(ruta: string, param: "lineas" | "variantes", tallas: readonly TallaAnalisis[]): string | null {
  if (tallas.length === 0 || tallas.length > MAX_VARIANTES_EN_URL) return null;
  const valor = param === "lineas" ? lineasEnUrl(tallas.map((t) => ({ varianteId: t.x.fila.varianteId, cantidad: 1 }))) : tallas.map((t) => t.x.fila.varianteId).join(",");
  return `${ruta}?${param}=${valor}`;
}

export const urlBajar = (tallas: readonly TallaAnalisis[]) => enlace("/inventario/bajar", "lineas", tallas.filter(bajable));
export const urlTrasladar = (tallas: readonly TallaAnalisis[]) => enlace("/inventario/mover", "lineas", tallas.filter(bajable));
export const urlEtiquetas = (tallas: readonly TallaAnalisis[]) => enlace("/etiquetas-de-precio", "variantes", tallas);

/** La tienda a la que conviene pedir: la que cubre más de esas tallas y, a igualdad, la que más tiene. */
export function mejorTiendaParaPedir(
  tallas: readonly TallaAnalisis[],
  red: Readonly<Record<string, RedVariante>>,
): { origen: { id: string; nombre: string }; lineas: LineaPedido[] } | null {
  const porTienda = new Map<string, { nombre: string; lineas: LineaPedido[]; total: number }>();
  for (const t of tallas) {
    for (const s of red[t.x.fila.varianteId]?.tiendas ?? []) {
      if (s.libre <= 0) continue;
      const e = porTienda.get(s.id) ?? { nombre: s.nombre, lineas: [], total: 0 };
      e.lineas.push({ varianteId: t.x.fila.varianteId, etiqueta: etiquetaTalla(t), disponibleEnOrigen: s.libre, cantidad: 1 });
      e.total += s.libre;
      porTienda.set(s.id, e);
    }
  }
  const mejor = [...porTienda.entries()].sort(([, a], [, b]) => b.lineas.length - a.lineas.length || b.total - a.total || a.nombre.localeCompare(b.nombre, "es"))[0];
  return mejor ? { origen: { id: mejor[0], nombre: mejor[1].nombre }, lineas: mejor[1].lineas } : null;
}

function reponer(p: PrendaAnalisis, red: Readonly<Record<string, RedVariante>>, a: AccesoAnalisis): AccionAnalisis | null {
  const origen = p.tallas.map((t) => red[t.x.fila.varianteId]?.origen).find((o) => o) ?? null;
  const produccion = (origen === "produccion" || origen === "ambos") && a.produccion;
  const compras = (origen === "compra" || origen === "ambos") && a.compras;
  if (produccion) return { clave: "reponer", texto: "Pedir a Producción", sub: "una orden nueva para el Taller", href: "/produccion/ordenes?nueva=1" };
  if (compras) return { clave: "reponer", texto: "Reponer en Compras", sub: "una compra nueva al proveedor", href: "/compras/nueva" };
  return null;
}

/**
 * La acción que conviene según lo que dice la prenda (el cuadro del README del spike):
 *   se agotó  → Bajar al piso si hay en el almacén; si no, Pedir a la tienda que tiene; si nadie, Reponer
 *   duerme    → Bajar al piso
 *   estancada → Trasladar lo que está en el almacén; si todo está colgado, Rebajar (etiquetas nuevas)
 *   vende bien→ Bajar al piso la talla que se está cortando (1 o menos colgada y algo guardado)
 */
export function accionPrincipal(p: PrendaAnalisis, grupo: GrupoQueHacer, red: Readonly<Record<string, RedVariante>>, a: AccesoAnalisis): AccionAnalisis | null {
  const foco = p.tallas.filter((t) => t.grupo === grupo);
  switch (grupo) {
    case "agotada": {
      const href = a.bajar ? urlBajar(foco) : null;
      if (href) return { clave: "bajar", texto: "Bajar al piso", sub: "las tallas vacías que tienen almacén", href };
      const pedido = a.pedir ? mejorTiendaParaPedir(foco, red) : null;
      if (pedido) return { clave: "pedir", texto: `Pedir a ${pedido.origen.nombre}`, sub: `${pedido.origen.nombre} la envía; tú la recibes`, ...pedido };
      return reponer(p, red, a);
    }
    case "duerme": {
      const href = a.bajar ? urlBajar(foco) : null;
      return href ? { clave: "bajar", texto: "Bajar al piso", sub: "lo que espera en el almacén", href } : null;
    }
    case "estancada": {
      const mover = a.traslados ? urlTrasladar(foco) : null;
      if (mover) return { clave: "trasladar", texto: "Trasladar", sub: "a una sede donde se venda", href: mover };
      const etiquetas = urlEtiquetas(foco);
      return etiquetas ? { clave: "rebajar", texto: "Rebajar", sub: "imprimir etiquetas con el precio nuevo", href: etiquetas } : null;
    }
    case "top": {
      const cortandose = foco.filter((t) => (hoyDe(t)?.piso ?? Infinity) <= 1);
      const href = a.bajar ? urlBajar(cortandose) : null;
      return href ? { clave: "bajar", texto: "Bajar al piso", sub: "la talla que se está cortando", href } : null;
    }
    default:
      return null;
  }
}

/** Todas las acciones de la prenda para su detalle, empezando por la principal y sin repetirla. */
export function accionesDelDetalle(p: PrendaAnalisis, grupo: GrupoQueHacer, red: Readonly<Record<string, RedVariante>>, a: AccesoAnalisis): AccionAnalisis[] {
  const principal = accionPrincipal(p, grupo, red, a);
  const lista: AccionAnalisis[] = principal ? [principal] : [];
  const ya = (clave: AccionAnalisis["clave"]) => lista.some((x) => x.clave === clave);
  const bajar = a.bajar ? urlBajar(p.tallas) : null;
  if (bajar && !ya("bajar")) lista.push({ clave: "bajar", texto: "Bajar al piso", sub: "de su almacén", href: bajar });
  const mover = a.traslados ? urlTrasladar(p.tallas) : null;
  if (mover && !ya("trasladar")) lista.push({ clave: "trasladar", texto: "Trasladar", sub: "a otra sede", href: mover });
  if (!ya("pedir") && a.pedir) {
    const pedido = mejorTiendaParaPedir(p.tallas, red);
    if (pedido) lista.push({ clave: "pedir", texto: `Pedir a ${pedido.origen.nombre}`, sub: "que te la envíen", ...pedido });
  }
  const etiquetas = urlEtiquetas(p.tallas);
  if (etiquetas && !ya("rebajar")) lista.push({ clave: "rebajar", texto: "Etiquetas", sub: "imprimir o rebajar", href: etiquetas });
  const rep = reponer(p, red, a);
  if (rep && !ya("reponer")) lista.push(rep);
  if (a.productos) lista.push({ clave: "historial", texto: "Historial", sub: "cada movimiento", href: `/productos/${p.productoId}/historial` });
  if (a.existencias) lista.push({ clave: "existencias", texto: "En Existencias", sub: "el stock de hoy", href: `/inventario?variante=${p.tallas[0]!.x.fila.varianteId}` });
  return lista;
}

/** Enlaces de la barra de varias marcadas (sin cantidades: una por talla). */
export function enlacesDeMarcadas(
  prendas: readonly PrendaAnalisis[],
  a: AccesoAnalisis,
): { bajar: string | null; trasladar: string | null; etiquetas: string | null; tallas: number } {
  const tallas = prendas.flatMap((p) => p.tallas);
  return {
    bajar: a.bajar ? urlBajar(tallas) : null,
    trasladar: a.traslados ? urlTrasladar(tallas) : null,
    etiquetas: urlEtiquetas(tallas),
    tallas: tallas.length,
  };
}
