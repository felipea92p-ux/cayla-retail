import { soles, type Evento } from "./historial-prenda-reglas";
import { diaLima } from "./fechas-lima";

// La pestaña «Costo» del Historial de la prenda (maqueta: docs/maquetas/costo-historial-2026-10/v2-escalera-amigable.html). Lee
// lo que devuelve `fn_costo_de_la_prenda` (20261024223000) y lo dice en palabras de tienda: cuánto cuesta hoy cada prenda, si subió
// o bajó desde que se empezó a comprar, y qué hizo cada compra. Lógica pura: la usan la página y la vista rápida.
//
// Regla de negocio (Felipe, 2026-10-24): la evolución del costo la mueven las COMPRAS (Recibir mercadería y los cierres del
// Taller). La primera compra de una prenda sin stock no es un «cambio»: es donde empieza la historia.

export type CompraCosto = {
  fecha: string;
  origen: "compra" | "produccion";
  llegaron: number;
  costoLlegaron: number;
  yaHabia: number;
  /** null si no había ninguna prenda antes de esta compra. */
  costoAntes: number | null;
  costoDespues: number;
  documento: string | null;
  proveedor: string | null;
  persona: string | null;
};

/** Un costo de lo que llegó en una compra que un líder corrigió a mano (20261026160000, ADR-0515). */
export type CorreccionCosto = {
  /** Cuándo se corrigió. */
  fecha: string;
  /** La fecha de la compra corregida (la misma `fecha` de `CompraCosto`). */
  compra: string;
  antes: number;
  despues: number;
  motivo: string | null;
  persona: string | null;
};

export type CostoPrenda = {
  compras: CompraCosto[];
  hoy: { stock: number; costo: number | null };
  inicio: { fecha: string | null; costo: number | null };
  correcciones: CorreccionCosto[];
  /** La cuenta es de un líder: puede corregir el costo de la última compra. */
  puedeCorregir: boolean;
};

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** Lo que devolvió la base, ya con forma. `null` si no vino nada (la cuenta no ve el dinero de compras o falló la lectura). */
export function leerCostoPrenda(json: unknown): CostoPrenda | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  const compras: CompraCosto[] = (Array.isArray(j.compras) ? j.compras : []).flatMap((x): CompraCosto[] => {
    const c = (x ?? {}) as Record<string, unknown>;
    const llegaron = num(c.llegaron), costoLlegaron = num(c.costo_llegaron), costoDespues = num(c.costo_despues), fecha = texto(c.fecha);
    if (llegaron === null || llegaron <= 0 || costoLlegaron === null || costoDespues === null || !fecha) return [];
    return [{
      fecha,
      origen: c.origen === "produccion" ? "produccion" : "compra",
      llegaron,
      costoLlegaron,
      yaHabia: num(c.ya_habia) ?? 0,
      costoAntes: num(c.costo_antes),
      costoDespues,
      documento: texto(c.documento),
      proveedor: texto(c.proveedor),
      persona: texto(c.persona),
    }];
  });
  compras.sort((a, b) => a.fecha.localeCompare(b.fecha));
  const hoy = (j.hoy ?? {}) as Record<string, unknown>;
  const inicio = (j.inicio ?? {}) as Record<string, unknown>;
  const correcciones: CorreccionCosto[] = (Array.isArray(j.correcciones) ? j.correcciones : []).flatMap((x): CorreccionCosto[] => {
    const c = (x ?? {}) as Record<string, unknown>;
    const fecha = texto(c.fecha), compra = texto(c.compra), antes = num(c.antes), despues = num(c.despues);
    if (!fecha || !compra || antes === null || despues === null) return [];
    return [{ fecha, compra, antes, despues, motivo: texto(c.motivo), persona: texto(c.persona) }];
  });
  correcciones.sort((a, b) => a.fecha.localeCompare(b.fecha));
  return {
    compras,
    hoy: { stock: Math.max(0, num(hoy.stock) ?? 0), costo: num(hoy.costo) },
    inicio: { fecha: texto(inicio.fecha), costo: num(inicio.costo) },
    correcciones,
    puedeCorregir: j.puede_corregir === true,
  };
}

export type Movida = { tipo: "primera" | "igual" | "sube" | "baja"; monto: number };

/** Qué hizo una compra con el costo. «primera»: no había prendas antes, así que no hay con qué comparar. */
export function movidaDeCompra(c: CompraCosto): Movida {
  if (c.yaHabia <= 0 || c.costoAntes === null) return { tipo: "primera", monto: 0 };
  const d = Math.round((c.costoDespues - c.costoAntes) * 100) / 100;
  return d === 0 ? { tipo: "igual", monto: 0 } : { tipo: d > 0 ? "sube" : "baja", monto: Math.abs(d) };
}

export type RespuestaCosto = {
  /** Lo que cuesta hoy cada prenda. */
  hoy: number | null;
  /** Desde dónde se cuenta: el costo de lo que había antes de la primera compra, o el de la primera compra si no había nada. */
  desde: number | null;
  /** Hoy menos «desde», a céntimos. */
  cambio: number;
  /** Cuántas compras cambiaron el costo (subió o bajó). */
  veces: number;
  stock: number;
};

export function respuestaCosto(c: CostoPrenda): RespuestaCosto {
  const primera = c.compras[0];
  const desde = !primera ? c.inicio.costo : primera.yaHabia > 0 && primera.costoAntes !== null ? primera.costoAntes : primera.costoDespues;
  const hoy = c.hoy.costo ?? c.compras.at(-1)?.costoDespues ?? c.inicio.costo;
  const veces = c.compras.filter((x) => {
    const t = movidaDeCompra(x).tipo;
    return t === "sube" || t === "baja";
  }).length;
  const cambio = hoy !== null && desde !== null ? Math.round((hoy - desde) * 100) / 100 : 0;
  return { hoy, desde, cambio, veces, stock: c.hoy.stock };
}

/** La frase bajo la cifra: «Empezó en S/ 18.00 · cambió 2 veces, siempre al llegar mercadería». */
export function fraseDeRespuesta(r: RespuestaCosto): string {
  if (r.desde === null) return "";
  const veces = r.veces === 0 ? "no ha cambiado" : r.veces === 1 ? "cambió 1 vez" : `cambió ${r.veces} veces`;
  return `Empezó en ${soles(r.desde)} · ${veces}${r.veces > 0 ? ", siempre al llegar mercadería" : ""}`;
}

/** La cuenta del «?», en una línea: «22 × S/ 18.00 + 40 × S/ 20.50 = S/ 1216.00 ÷ 62 = S/ 19.61». */
export function cuentaDeCompra(c: CompraCosto): string {
  const total = c.yaHabia + c.llegaron;
  const valor = c.yaHabia * (c.costoAntes ?? 0) + c.llegaron * c.costoLlegaron;
  const partes = c.yaHabia > 0 && c.costoAntes !== null ? `${c.yaHabia} × ${soles(c.costoAntes)} + ` : "";
  return `${partes}${c.llegaron} × ${soles(c.costoLlegaron)} = ${soles(valor)} ÷ ${total} = ${soles(c.costoDespues)}`;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «5 oct»: el día de Lima de una compra, corto, para la tabla. */
export function diaCorto(instante: string): string {
  const dia = diaLima(instante);
  if (!dia) return "—";
  return `${Number(dia.slice(8, 10))} ${MESES[Number(dia.slice(5, 7)) - 1]}`;
}

export type GraficoCosto = {
  /** Los escalones: dónde empieza, cada compra y hoy. */
  puntos: { x: number; y: number }[];
  /** Un número por compra, en la esquina de su escalón. */
  marcas: { x: number; y: number; n: number; movida: Movida; fecha: string }[];
  desde: number;
  hasta: number;
  minY: number;
  maxY: number;
  /** Las fechas bajo el gráfico; «hoy» va fuerte. */
  fechas: { x: number; texto: string; fuerte?: boolean }[];
};

/**
 * Los datos del gráfico de escalera. Empieza en el costo que había antes de la primera compra (si había prendas) o en la primera
 * compra; cada compra es un escalón con su número; termina hoy en lo que cuesta hoy. El eje y deja aire arriba y abajo para que un
 * cambio de céntimos se vea, sin exagerarlo. `null` si no hay compras.
 */
export function graficoDelCosto(c: CostoPrenda, ahora: number): GraficoCosto | null {
  if (c.compras.length === 0) return null;
  const r = respuestaCosto(c);
  const t = (iso: string) => Date.parse(iso);
  const primera = c.compras[0]!;
  const conAntes = primera.yaHabia > 0 && primera.costoAntes !== null;
  // Si había prendas antes de la primera compra, la línea arranca cuando nació la prenda (o un poco antes de la compra, si no se sabe).
  const inicio = conAntes ? Math.min(c.inicio.fecha ? t(c.inicio.fecha) : t(primera.fecha), t(primera.fecha) - 86_400_000) : t(primera.fecha);
  const puntos = [
    ...(conAntes ? [{ x: inicio, y: primera.costoAntes! }] : []),
    ...c.compras.map((x) => ({ x: t(x.fecha), y: x.costoDespues })),
  ];
  const fin = Math.max(ahora, puntos.at(-1)!.x);
  puntos.push({ x: fin, y: r.hoy ?? puntos.at(-1)!.y });

  const ys = puntos.map((p) => p.y);
  const bajo = Math.min(...ys), alto = Math.max(...ys);
  const aire = Math.max((alto - bajo) * 0.6, alto * 0.05, 0.5);
  const minY = Math.max(0, Math.floor(bajo - aire));
  const maxY = Math.ceil(alto + aire);

  // Fechas: el comienzo, cada compra y hoy, salteando las que quedarían encima de otra (menos de un 12 % del ancho entre dos).
  const desde = puntos[0]!.x;
  const ancho = Math.max(fin - desde, 1);
  const candidatas = [
    { x: desde, texto: diaCorto(new Date(desde).toISOString()) },
    ...c.compras.map((x) => ({ x: t(x.fecha), texto: diaCorto(x.fecha) })),
  ];
  const fechas: GraficoCosto["fechas"] = [{ x: fin, texto: "hoy", fuerte: true }];
  for (const f of candidatas) {
    if (fechas.every((o) => Math.abs(o.x - f.x) / ancho >= 0.12)) fechas.push(f);
  }
  fechas.sort((a, b) => a.x - b.x);

  return {
    puntos,
    marcas: c.compras.map((x, i) => ({ x: t(x.fecha), y: x.costoDespues, n: i + 1, movida: movidaDeCompra(x), fecha: x.fecha })),
    desde,
    hasta: fin,
    minY,
    maxY,
    fechas,
  };
}

/** Lo que dice el número sobre la línea, en dos palabras. */
export function textoDeMovida(m: Movida): string {
  if (m.tipo === "sube") return `↑ subió ${soles(m.monto)}`;
  if (m.tipo === "baja") return `↓ bajó ${soles(m.monto)}`;
  return m.tipo === "igual" ? "igual" : "primera";
}

export type LoteDeHoy = {
  clave: string;
  /** El número de la compra en la tabla y el gráfico (①②③), o null para «lo que había antes de la primera compra». */
  compra: number | null;
  cantidad: number;
  costo: number;
};

/**
 * De qué compra es cada prenda que hay HOY, como ESTIMADO (Felipe, 2026-10-24): se supone que se vende primero lo que llegó
 * antes (PEPS), así que lo que queda es lo más nuevo. Se recorre de la compra más nueva hacia atrás repartiendo el stock de hoy;
 * lo que sobre llega hasta lo que había antes de la primera compra. Si el stock de hoy es MAYOR que todo lo comprado (un ajuste
 * de entrada sin costo, un conteo), el sobrante se anota en ese primer tramo, a su costo: así la suma da SIEMPRE el stock de hoy,
 * que es lo que la pantalla promete. Del más viejo al más nuevo; sin tramos vacíos; sin compras no hay qué repartir.
 */
export function lotesDeHoy(c: CostoPrenda): LoteDeHoy[] {
  const stock = Math.max(0, Math.floor(c.hoy.stock));
  const primera = c.compras[0];
  if (stock === 0 || !primera) return [];
  const antes = primera.yaHabia > 0 && primera.costoAntes !== null ? { cantidad: primera.yaHabia, costo: primera.costoAntes } : null;
  const lotes: LoteDeHoy[] = [
    { clave: "antes", compra: null, cantidad: antes?.cantidad ?? 0, costo: antes?.costo ?? c.inicio.costo ?? primera.costoLlegaron },
    ...c.compras.map((x, i) => ({ clave: `c${i + 1}`, compra: i + 1, cantidad: x.llegaron, costo: x.costoLlegaron })),
  ];
  const comprado = lotes.reduce((a, l) => a + l.cantidad, 0);
  if (stock > comprado) lotes[0]!.cantidad += stock - comprado;
  let falta = stock;
  const vivos: LoteDeHoy[] = [];
  for (let i = lotes.length - 1; i >= 0 && falta > 0; i--) {
    const l = lotes[i]!;
    const queda = Math.min(l.cantidad, falta);
    falta -= queda;
    if (queda > 0) vivos.unshift({ ...l, cantidad: queda });
  }
  return vivos;
}

export type ErrorArreglado = {
  id: string;
  cuando: string;
  antes: number;
  despues: number;
  /** En cuántas variantes se arregló (la ficha guarda el mismo costo en todas las que se tocaron). */
  variantes: number;
  persona: string | null;
  /** Si lo arregló un líder en una compra (no el costo declarado de la ficha): el número de la compra (①②③) y lo que dijo. */
  compra: number | null;
  motivo: string | null;
};

/**
 * Los costos que alguien arregló a mano. Desde 20260927190000 el costo solo se edita en la ficha mientras la prenda no tuvo ninguna
 * compra, y ese arreglo queda como `costo_declarado`: es una CORRECCIÓN, no un costo nuevo (Felipe, 2026-10-24), y el gráfico ya usa el
 * número bueno desde el principio. Lo que mueven las compras queda como `costo` y no es un error. Anotar un costo donde no había
 * (de 0 o vacío a algo) tampoco es arreglar un error: no se lista. Del más viejo al más nuevo.
 */
export function erroresArreglados(eventos: readonly Evento[]): ErrorArreglado[] {
  const out: ErrorArreglado[] = [];
  for (const e of eventos) {
    e.cambios.forEach((c, i) => {
      if (c.k !== "costo" || !c.declarado || c.antes === null || c.despues === null || c.antes <= 0 || c.antes === c.despues) return;
      out.push({ id: `${e.id}-${i}`, cuando: e.cuando, antes: c.antes, despues: c.despues, variantes: Math.max(1, c.variantes.length), persona: e.persona?.nombre ?? null, compra: null, motivo: null });
    });
  }
  return out.sort((a, b) => a.cuando.localeCompare(b.cuando));
}

/**
 * Todo lo que alguien arregló del costo, del más viejo al más nuevo: el costo declarado que se corrigió en la ficha (`erroresArreglados`)
 * y el costo de una compra que un líder corrigió (`correcciones`, con el número de su compra). Ninguno mueve la línea del gráfico: es
 * una corrección, no un costo nuevo (Felipe, 2026-10-24).
 */
export function erroresDelCosto(eventos: readonly Evento[], c: CostoPrenda | null): ErrorArreglado[] {
  const deCompras: ErrorArreglado[] = (c?.correcciones ?? []).map((k, i) => {
    const n = c!.compras.findIndex((x) => x.fecha === k.compra) + 1;
    return { id: `compra-${i}`, cuando: k.fecha, antes: k.antes, despues: k.despues, variantes: 1, persona: k.persona, compra: n > 0 ? n : null, motivo: k.motivo };
  });
  return [...erroresArreglados(eventos), ...deCompras].sort((a, b) => a.cuando.localeCompare(b.cuando));
}

/** ¿Se puede corregir esta compra? Solo la última, y solo una compra (el costo de un cierre del Taller sale de su orden). Lo decide la base; esto solo decide si se ofrece. */
export function sePuedeCorregir(c: CostoPrenda, indice: number): boolean {
  const compra = c.compras[indice];
  return c.puedeCorregir && !!compra && indice === c.compras.length - 1 && compra.origen === "compra";
}
