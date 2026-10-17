// Análisis v4 (ADR-0357): la pestaña «Qué pedir», sin React. La cuenta para Navidad y su riel, la mariposa «Lo que se vende y lo
// que tienes» por tipo de prenda, la curva de tallas, el ranking de lo que más se vende y «Lo que más rinde» (cuánto se ganó por
// cada S/ 1 de ropa, por tipo). Todo sale de lo que el servidor ya leyó: aquí no nace ninguna regla de negocio, solo cómo se
// cuenta y se dibuja lo de la maqueta aprobada por Felipe (2026-10-06). La lectura de «Lo que más rinde» vive en
// `analisis-rinde.ts` (servidor); la cuenta, aquí, para poder probarla.

import type { OrigenPrenda, PartePedido, PrendaAnalisis } from "./analisis-tipos";
import { DIAS_MINIMOS_RITMO, DIAS_SE_ACABA, diasQueQuedan, esTallaUnica, llegadasDe, nuncaSalio, plural, totalEnTienda } from "./analisis-reglas";
import { cuandoLlegan, pedidoAparte, pedidoDeMiTienda, pedidoPorTipo, sinPedido, yaPedidoDetalle, type PedidoDeTipo } from "./analisis-pedido-en-camino-reglas";
import { compararTallas, tipoDeTalla, type TipoTalla } from "./tallas";
import { diasEntreFechas, sumarDias } from "./fechas-lima";
import { despuesDeLaMeta, hastaLaMeta, metaDeTipo, pideloAntes, plazoDeTipo, textoPidelo, tiempoHasta, tipPidelo, type Horizonte, type MetaDeCompra, type PideloAntes, type PlazoDeTipo } from "./analisis-horizonte";
import { FACTOR_QUE_SE_NOTA, type TemporadaDatos } from "./analisis-temporada";
import { VENTAS_PARA_JUZGAR_SOLA } from "./frescura-reglas";

/* ───────── Tipo de prenda ───────── */

/** El tipo de una prenda sin categoría: también se cuenta, para que las partes de las tallas sumen las 100. */
export const SIN_CATEGORIA = "Sin categoría";

/** El tipo de prenda con el que se agrupa y se filtra (la categoría del catálogo). */
export const categoriaDe = (p: Pick<PrendaAnalisis, "categoria">): string => p.categoria?.trim() || SIN_CATEGORIA;

/** Desde cuántos puntos de diferencia (de cada 100) un tipo o una talla «pide más» o «sobra» (la maqueta). */
export const DIFERENCIA_QUE_SE_NOTA = 4;

/** «De cada 100», sin decimales; 0 si no hay de dónde sacar la cuenta. */
const de100 = (parte: number, total: number): number => (total > 0 ? Math.round((parte / total) * 100) : 0);

/* ───────── La meta: cuánto falta para terminar la campaña (A6, `analisis-horizonte.ts`) ───────── */

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];

export type MarcaRiel = { clave: string; texto: string; pct: number };

/** El riel de la tarjeta: del 1 del mes de hoy al último día del mes de la meta, con hoy, cada mes del medio y la meta en % del tramo. */
export type RielMeta = {
  hoyPct: number;
  metaPct: number;
  /** Los meses rotulados, cada uno en la mitad de su tramo. Con muchos meses, abreviados y uno sí, uno no (el de la meta siempre). */
  meses: MarcaRiel[];
  /** Hoy y la meta tan juntos que sus rótulos se pisarían: «Hoy» queda solo como punto (la cuenta ya lo dice). */
  juntos: boolean;
  /** Para leerlo sin verlo: «Hoy 6 de octubre, Navidad 25 de diciembre». */
  etiqueta: string;
};

/** Debajo de esta distancia (en % del riel) los rótulos «Hoy» y la meta se tocan. */
const RIEL_JUNTOS = 12;

const ultimoDiaDelMes = (anio: number, mes: number): number => new Date(Date.UTC(anio, mes, 0)).getUTCDate();
const iso = (anio: number, mes: number, dia: number): string => `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
const redondear1 = (x: number): number => Math.round(x * 10) / 10;

/** El riel de hoy a la meta (`fecha`, YYYY-MM-DD; `nombre`, cómo se llama en la etiqueta para leerlo sin verlo). */
export function rielHacia(hoy: string, fecha: string, nombre: string): RielMeta {
  const anioHoy = Number(hoy.slice(0, 4));
  const mesHoy = Number(hoy.slice(5, 7));
  const anioMeta = Number(fecha.slice(0, 4));
  const mesMeta = Number(fecha.slice(5, 7));
  const inicio = iso(anioHoy, mesHoy, 1);
  const fin = iso(anioMeta, mesMeta, ultimoDiaDelMes(anioMeta, mesMeta));
  const total = Math.max(1, diasEntreFechas(inicio, fin));
  const pct = (f: string) => redondear1((diasEntreFechas(inicio, f) / total) * 100);

  const tramos: { anio: number; mes: number; centro: number }[] = [];
  let anio = anioHoy;
  let mes = mesHoy;
  while (anio < anioMeta || (anio === anioMeta && mes <= mesMeta)) {
    const desde = diasEntreFechas(inicio, iso(anio, mes, 1));
    const hasta = diasEntreFechas(inicio, iso(anio, mes, ultimoDiaDelMes(anio, mes)));
    tramos.push({ anio, mes, centro: redondear1(((desde + hasta) / 2 / total) * 100) });
    if (mes === 12) {
      mes = 1;
      anio++;
    } else mes++;
  }
  // Hasta 4 meses caben con su nombre; hasta 7, abreviados; más (después de la meta, todo el año), uno sí y uno no.
  const cortos = tramos.length > 4;
  const salteados = tramos.length > 7;
  const meses = tramos
    .filter((_, k) => !salteados || (tramos.length - 1 - k) % 2 === 0)
    .map((t) => ({ clave: `${t.anio}-${t.mes}`, texto: (cortos ? MESES_CORTOS : MESES)[t.mes - 1]!, pct: t.centro }));

  const hoyPct = pct(hoy);
  const metaPct = pct(fecha);
  const fechaLarga = (f: string) => `${Number(f.slice(8, 10))} de ${MESES[Number(f.slice(5, 7)) - 1]}`;
  return {
    hoyPct,
    metaPct,
    meses,
    juntos: metaPct - hoyPct < RIEL_JUNTOS,
    etiqueta: `Hoy ${fechaLarga(hoy)}, ${nombre} ${fechaLarga(fecha)}`,
  };
}

/* ───────── «¿Para cuánto te alcanza?»: por tipo de prenda, contra la meta de compra (Felipe, 2026-10-07, B2; A6, 2026-10-17) ───────── */

/** El eje de la pestaña termina un poco después de la meta (15 %), para que su línea y lo que se queda corto se vean: más largo no ayuda a decidir (A6). */
export const MARGEN_DEL_EJE = 1.15;

export type AlcanceTipo = {
  categoria: string;
  prefijo: string | null;
  familia: string | null;
  /** Lo que se vendió del tipo en los días de ventas de la tienda: con su prenda y sin registrar. */
  vendidas: number;
  /** De lo vendido, cuántas se cobraron sin su prenda (anotadas en caja con su tipo): ya están dentro de `vendidas`. */
  sinPrenda: number;
  /** Lo que tienes del tipo hoy (libre, piso + almacén): lo que hay, sin lo que viene. */
  tiene: number;
  /**
   * Lo que viene en camino al tipo y todavía se espera a tiempo (llega hoy o hasta la meta, o nadie anotó cuándo): se suma a `tiene`
   * para saber para cuánto te alcanza (`dias`), pero no es lo que hay. Las llegadas ATRASADAS (su fecha estimada ya pasó), las que
   * llegan DESPUÉS de la meta y las partes sin unidades no cuentan (A3, plan verificado 2026-10-16): un pedido vencido no es stock, uno
   * que llega tarde no cubre la campaña, y si contaran apagarían un «pídelo» que sigue haciendo falta.
   */
  vienen: number;
  /** De `vienen`, las que no tienen fecha anotada (se dicen así; no se inventa una). */
  vienenSinFecha: number;
  /** Lo que debía llegar y no llegó (fecha ya pasada): NO está en `vienen`; se dice aparte. */
  atrasadas: number;
  /** Lo que llega DESPUÉS de la meta (hoy, Navidad): un pedido del 5 de enero no cubre el 25 de diciembre. NO está en `vienen`; se dice aparte. */
  despues: number;
  /**
   * Lo YA PEDIDO del tipo (A4, `analisis-pedido-en-camino-reglas.ts`): órdenes de compra abiertas, envíos del proveedor, lo que el proveedor
   * debe, y, de la red, lo por repartir y lo que el Taller tiene en proceso. Solo `pedido.suma` cuenta para saber para cuánto te alcanza
   * (`dias`); el resto se dice aparte. NO está dentro de `vienen`: `vienen` son las llegadas por prenda (traslados y compras con su talla y
   * color), y una orden se pide por tipo y marca. Las dos cuentas no se pisan.
   */
  pedido: PedidoDeTipo;
  /** De lo que tienes, cuántas unidades nunca salieron al piso; null si la base todavía no lo sabe. */
  nunca: number | null;
  /** Para cuántos días te alcanza lo que tienes MÁS lo que viene, al ritmo de los días de ventas (0 = ya no hay); null si no se vendió: no tiene ritmo. */
  dias: number | null;
  /** No llega a la meta de compra: pídelo. Un tipo con el catálogo incompleto (`incompleto`) no lo dice: su cifra no es de fiar. */
  pide: boolean;
  /** Cuánto tarda un pedido de este tipo y de dónde sale (14 si todos sus modelos son del Taller, 30 si no): un supuesto, y se dice (D4). */
  plazo: PlazoDeTipo;
  /** Los días hasta la meta de ESTE tipo: la campaña o el 25-dic para todos, o su plazo + 1 mes (`metaDeTipo`). */
  meta: number;
  /** «Pídelo antes del X» (o «ya») si no llega; null si llega, si no hay ritmo o si el catálogo está incompleto. */
  pidelo: PideloAntes | null;
  /** Para cuántos días te alcanza con la temporada (D5), solo si la tienda tiene historia y la temporada se nota; null si no. La cifra base no cambia. */
  conTemporada: number | null;
  /** Qué parte de lo vendido de la tienda es de este tipo, de 0 a 100 (D13): «Pesa 25 %». */
  pesa: number;
  /** En qué situación está, para ordenar y para hablar (D13). */
  situacion: SituacionTipo;
  /** Todo lo vendido del tipo se cobró sin su prenda (0 con prenda): el catálogo del tipo no está cargado y la cifra de días no es de fiar (A6, g). */
  incompleto: boolean;
  /** Hay algo pedido a mi tienda del tipo (cuente o no): una orden abierta nunca deja un «solo pídelo» (A6, j). */
  ordenAbierta: boolean;
};

/** Agotado, no llega, llega, sin ritmo (no se vendió) o con el catálogo incompleto. */
export type SituacionTipo = "agotado" | "no_llega" | "llega" | "sin_ritmo" | "incompleto";
const RANGO_SITUACION: Record<SituacionTipo, number> = { agotado: 0, no_llega: 1, llega: 2, sin_ritmo: 3, incompleto: 4 };

/** La meta como la entiende `alcancePorTipo`: los días (como Navidad antes) o el horizonte entero (con su modo, que decide si cada tipo mide con su plazo). */
export type MetaDeAlcance = number | MetaDeCompra;

/**
 * Por tipo de prenda, para cuánto te alcanza lo que tienes al ritmo de lo vendido en los días de ventas de la tienda (hasta 30):
 * lo que tienes MÁS lo que ya viene en camino a tiempo (no lo atrasado ni lo que llega después de la meta: `AlcanceTipo.vienen`) MÁS lo ya
 * pedido que cuenta (órdenes con fecha y envíos del proveedor: `AlcanceTipo.pedido.suma`, A4) entre lo que vendes por día. Pide lo que no
 * llega a Navidad. Del que menos dura al que más; lo que no se vendió, al
 * final (sin ritmo no se sabe para cuánto alcanza). Reemplaza a la mariposa «de cada 100» (Felipe, 2026-10-07: «no sé si es de los
 * últimos 30 días o desde siempre»): habla en semanas y dice de qué días. Con los MODELOS (ADR-0357, decisión 12), «nunca salió»
 * cuenta solo lo del modelo del que nada se colgó: la talla guardada de un modelo colgado ya está presentada.
 */
export function alcancePorTipo(
  prendas: readonly Pick<PrendaAnalisis, "categoria" | "categoriaPrefijo" | "categoriaFamilia" | "vendidas30" | "piso" | "almacen" | "salioAlPiso" | "diasDeVentas" | "llega" | "origen">[],
  diasDeVentas: number,
  /** El día de hoy en Lima (YYYY-MM-DD): con él se sabe qué llegada ya se atrasó. */
  hoy: string,
  /** La meta: los días hasta ella (un número, como antes con Navidad) o el horizonte de A6 (`modo` y `dias`: en «plazo» cada tipo mide con SU plazo + 1 mes). */
  meta: MetaDeAlcance,
  sabePiso: boolean,
  sinPrenda: Readonly<Record<string, number>> = {},
  /** Lo ya pedido y que todavía no llegó (A4); `null` o vacío = no se contó (no se pudo leer, o no hay nada pedido). */
  pedido: readonly PartePedido[] | null = null,
  /** La temporada de la tienda (D5): solo suma una línea más por tipo, nunca cambia `dias`. */
  temporada: TemporadaDatos | null = null,
): AlcanceTipo[] {
  // El ritmo del tipo es la suma del de sus prendas, cada una en su ventana (2026-10-14: los días que estuvo colgada, `ventanaDeRitmo`);
  // lo vendido sin registrar no tiene prenda ni ventana propia: va en los días de ventas de la tienda. Sin ventana propia, la de la tienda.
  const ventana = Math.min(30, Math.max(1, Math.round(diasDeVentas)));
  const ventanaDe = (p: { diasDeVentas?: number }) => Math.min(30, Math.max(1, Math.round(p.diasDeVentas ?? ventana)));
  const horizonte: MetaDeCompra = typeof meta === "number" ? { modo: "navidad", dias: meta } : meta;
  // Cuánto tarda un pedido de cada tipo (D4): de los orígenes de TODOS sus modelos, con o sin stock o venta.
  const origenes = new Map<string, (OrigenPrenda | null)[]>();
  for (const p of prendas) origenes.set(categoriaDe(p), [...(origenes.get(categoriaDe(p)) ?? []), p.origen]);
  const plazoDe = new Map<string, PlazoDeTipo>();
  const plazoDelTipo = (c: string): PlazoDeTipo => plazoDe.get(c) ?? plazoDe.set(c, plazoDeTipo(origenes.get(c) ?? [])).get(c)!;
  // El último día que importa DE CADA TIPO: la meta (campaña o 25-dic) para todos o, en «plazo», el plazo propio del tipo más un mes.
  // Sin un día válido o una meta que sea número no hay tope (como antes): una fecha rara no debe tumbar la pantalla (principio 9).
  const hoyValido = /^\d{4}-\d{2}-\d{2}/.test(hoy);
  const diasMetaDe = (c: string): number => metaDeTipo(horizonte, plazoDelTipo(c));
  const limiteDe = (c: string): string | undefined => {
    const d = diasMetaDe(c);
    return Number.isFinite(d) && hoyValido ? sumarDias(hoy, Math.max(0, Math.round(d))) : undefined;
  };
  // Lo atrasado y lo que llega después de la meta de cada tipo, de TODAS sus prendas (también las que hoy no tienen ni venta ni stock):
  // se dicen aparte, no suman.
  const atrasadasDe = new Map<string, number>();
  const despuesDe = new Map<string, number>();
  // Lo ya pedido por tipo, con la misma meta que las llegadas (A4): lo que llega después de ella no suma. Una lectura por cada límite distinto
  // (en «plazo» hay uno por plazo: 14 + 30 y 30 + 30 días; con una campaña, uno solo).
  const pedidoPorLimite = new Map<string, Map<string, PedidoDeTipo>>();
  const pedidoDelTipo = (c: string): PedidoDeTipo => {
    const limite = limiteDe(c);
    const clave = limite ?? "";
    const m = pedidoPorLimite.get(clave) ?? pedidoPorLimite.set(clave, pedidoPorTipo(pedido ?? [], hoy, limite)).get(clave)!;
    return m.get(c) ?? sinPedido();
  };
  const porTipo = new Map<string, AlcanceTipo>();
  const nuevo = (c: string, p: (typeof prendas)[number]): AlcanceTipo => ({
    categoria: c,
    prefijo: p.categoriaPrefijo,
    familia: p.categoriaFamilia,
    vendidas: 0,
    sinPrenda: 0,
    tiene: 0,
    vienen: 0,
    vienenSinFecha: 0,
    atrasadas: 0,
    despues: 0,
    pedido: sinPedido(),
    nunca: sabePiso ? 0 : null,
    dias: null,
    pide: false,
    plazo: plazoDelTipo(c),
    meta: diasMetaDe(c),
    pidelo: null,
    conTemporada: null,
    pesa: 0,
    situacion: "sin_ritmo",
    incompleto: false,
    ordenAbierta: false,
  });
  const ritmo = new Map<string, number>();
  // Una prenda de cada tipo que la tienda tiene, aunque hoy no tenga ni venta ni stock: el tipo existe para sumarle lo vendido sin registrar.
  const delTipo = new Map<string, (typeof prendas)[number]>();
  for (const p of prendas) {
    const c = categoriaDe(p);
    if (!delTipo.has(c)) delTipo.set(c, p);
    const vend = Math.max(0, p.vendidas30);
    const tiene = Math.max(0, totalEnTienda(p));
    const ll = llegadasDe(p.llega, hoy, limiteDe(c));
    if (ll.atrasadas > 0) atrasadasDe.set(c, (atrasadasDe.get(c) ?? 0) + ll.atrasadas);
    if (ll.despues > 0) despuesDe.set(c, (despuesDe.get(c) ?? 0) + ll.despues);
    // Una prenda sin venta ni stock pero con algo que viene a tiempo también cuenta: lo que llega es del tipo. Lo atrasado o lo que llega
    // después de la meta, solo, no abre el tipo.
    if (vend === 0 && tiene === 0 && ll.vienen === 0) continue;
    const a = porTipo.get(c) ?? nuevo(c, p);
    a.vendidas += vend;
    ritmo.set(c, (ritmo.get(c) ?? 0) + vend / ventanaDe(p));
    a.tiene += tiene;
    a.vienen += ll.vienen;
    a.vienenSinFecha += ll.sinFecha;
    if (a.nunca !== null && nuncaSalio(p)) a.nunca += p.almacen;
    porTipo.set(c, a);
  }
  // Un tipo que la tienda tiene pero hoy no tiene ni venta ni stock ni llegadas, y al que ya le pidieron algo que cuenta: existe en la lista
  // (lo pedido es del tipo). Lo pedido que NO suma (sin fecha, vencido, lo de la red) solo se dice en un tipo que ya está, como lo atrasado.
  for (const [c, muestra] of delTipo) {
    if (!porTipo.has(c) && pedidoDelTipo(c).suma > 0) porTipo.set(c, nuevo(c, muestra));
  }
  // Lo vendido sin registrar de cada tipo (ADR-0357, act. 2026-10-14): la venta no dice qué prenda fue, pero sí de qué tipo, así que
  // cuenta en el ritmo del tipo. Sin esto, un tipo que se registra poco (un tercio de sus ventas) parecía durar el triple y «llegaba» a
  // Navidad sin llegar. Solo en los tipos que la tienda tiene: de un tipo sin ninguna prenda registrada no se sabe cuánto hay
  // (`tiposSinRegistrar` los nombra aparte).
  for (const [nombre, n] of Object.entries(sinPrenda)) {
    const c = nombre.trim() || SIN_CATEGORIA;
    const muestra = delTipo.get(c);
    if (!muestra || !(n > 0)) continue;
    const a = porTipo.get(c) ?? nuevo(c, muestra);
    a.vendidas += n;
    a.sinPrenda += n;
    ritmo.set(c, (ritmo.get(c) ?? 0) + n / ventana);
    porTipo.set(c, a);
  }
  const totalVendidas = [...porTipo.values()].reduce((suma, a) => suma + a.vendidas, 0);
  const factor = temporada?.estado === "ok" && Math.abs(temporada.factor - 1) >= FACTOR_QUE_SE_NOTA && temporada.factor > 0 ? temporada.factor : null;
  return [...porTipo.values()]
    .map((a) => {
      const porDia = ritmo.get(a.categoria) ?? 0;
      const ya = pedidoDelTipo(a.categoria);
      const dias = a.vendidas > 0 && porDia > 0 ? (a.tiene + a.vienen + ya.suma) / porDia : null;
      // Todo lo vendido se cobró sin su prenda: el tipo no tiene su catálogo cargado y su cifra de días no es de fiar (A6, g). No entra al titular.
      const incompleto = a.vendidas > 0 && a.sinPrenda >= a.vendidas;
      const pide = !incompleto && dias !== null && dias < a.meta;
      const situacion: SituacionTipo = incompleto ? "incompleto" : dias === null ? "sin_ritmo" : dias <= 0 ? "agotado" : pide ? "no_llega" : "llega";
      return {
        ...a,
        atrasadas: atrasadasDe.get(a.categoria) ?? 0,
        despues: despuesDe.get(a.categoria) ?? 0,
        pedido: ya,
        dias,
        pide,
        pidelo: pide ? pideloAntes(dias, a.plazo.dias, hoy) : null,
        conTemporada: factor !== null && dias !== null && dias > 0 ? Math.round(dias / factor) : null,
        pesa: de100(a.vendidas, totalVendidas),
        situacion,
        incompleto,
        ordenAbierta: pedidoDeMiTienda(ya) > 0,
      };
    })
    .sort((a, b) => (a.dias ?? Infinity) - (b.dias ?? Infinity) || b.tiene - a.tiene || a.categoria.localeCompare(b.categoria, "es"));
}

/**
 * Los tipos que se vendieron sin registrar y que la tienda no tiene en Análisis (ninguna prenda suya con stock, ventas o llegadas): no se
 * sabe para cuánto alcanzan, porque el sistema no tiene cuánto hay. Se nombran aparte para que esa venta no desaparezca en silencio. Del
 * que más se vendió al que menos.
 */
export function tiposSinRegistrar(
  prendas: readonly Pick<PrendaAnalisis, "categoria">[],
  sinPrenda: Readonly<Record<string, number>>,
): { categoria: string; vendidas: number }[] {
  const tiene = new Set(prendas.map(categoriaDe));
  return Object.entries(sinPrenda)
    .map(([c, n]) => ({ categoria: c.trim() || SIN_CATEGORIA, vendidas: n }))
    .filter((t) => t.vendidas > 0 && !tiene.has(t.categoria))
    .sort((a, b) => b.vendidas - a.vendidas || a.categoria.localeCompare(b.categoria, "es"));
}

/** «También vendiste 11 Pulseras y 10 Relojes sin registrar: no están en el sistema, así que no se sabe para cuánto te alcanzan.» */
export function notaTiposSinRegistrar(tipos: readonly { categoria: string; vendidas: number }[]): string {
  const nombres = tipos.slice(0, 3).map((t) => `${t.vendidas} ${t.categoria}`);
  const resto = tipos.length - nombres.length;
  const lista = resto > 0 ? `${nombres.join(", ")} y ${resto} ${plural(resto, "tipo más", "tipos más")}` : nombres.length > 1 ? `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}` : (nombres[0] ?? "");
  return `También vendiste ${lista} sin registrar: no están en el sistema, así que no se sabe para cuánto te alcanzan.`;
}

/**
 * Cómo se ordena «¿Para cuánto te alcanza?». Por defecto, lo que pide la decisión (Felipe 2026-10-17, D13; antes, «Más vendido» por defecto —decisión del
 * 12-oct que revierte—): primero la situación (se agotó, no llega, llega, sin ritmo, catálogo incompleto) y, dentro de ella, lo que más pesa en la venta
 * (más unidades vendidas), a igual venta lo que se acaba antes y después el nombre. Las otras dos siguen a un toque: lo que más se vende, o lo que se
 * acaba antes (lo que `alcancePorTipo` ya devuelve).
 */
export type OrdenAlcance = "prioridad" | "vende" | "acaba";
export const ORDEN_ALCANCE_DEFECTO: OrdenAlcance = "prioridad";
export const ORDENES_ALCANCE: readonly { clave: OrdenAlcance; texto: string }[] = [
  { clave: "prioridad", texto: "Qué pedir primero" },
  { clave: "vende", texto: "Más vendido" },
  { clave: "acaba", texto: "Se acaba antes" },
];

const porVentaYDias = (a: AlcanceTipo, b: AlcanceTipo): number =>
  b.vendidas - a.vendidas || (a.dias ?? Infinity) - (b.dias ?? Infinity) || a.categoria.localeCompare(b.categoria, "es");

export function ordenarAlcance(tipos: readonly AlcanceTipo[], orden: OrdenAlcance): AlcanceTipo[] {
  if (orden === "acaba") return [...tipos];
  if (orden === "vende") return [...tipos].sort(porVentaYDias);
  return [...tipos].sort((a, b) => RANGO_SITUACION[a.situacion] - RANGO_SITUACION[b.situacion] || porVentaYDias(a, b));
}

/** Desde cuántos días lo que tienes se dice «Más de 6 meses» (lo que no cabe en el eje de la pestaña se dice con `textoAlcanceEnEje`). */
export const DIAS_ALCANZA_MAX = 182;

/** «Ya no hay», «3 días», «4 semanas», «Más de 6 meses» o «No se vendió»: para cuánto te alcanza, como se dice en tienda. */
export function textoAlcance(dias: number | null): string {
  if (dias === null) return "No se vendió";
  if (dias <= 0) return "Ya no hay";
  if (dias < 7) {
    const d = Math.max(1, Math.round(dias));
    return `${d} ${plural(d, "día", "días")}`;
  }
  if (dias >= DIAS_ALCANZA_MAX) return "Más de 6 meses";
  const s = Math.round(dias / 7);
  return `${s} ${plural(s, "semana", "semanas")}`;
}

/**
 * Lo mismo, pero con el eje de la pestaña (A6, i): lo que pasa del fin del eje (la meta × 1,15) se dice «→ más de 13 semanas» en vez de una cifra que ya
 * no ayuda a decidir; la barra llega al borde y la flecha dice que sigue.
 */
export function textoAlcanceEnEje(dias: number | null, fin: number, flecha: boolean = true): string {
  return dias !== null && dias > fin ? `${flecha ? "→ " : ""}más de ${tiempoHasta(Math.floor(fin))}` : textoAlcance(dias);
}

/**
 * Lo que tienes y lo que viene a tiempo, como se dice en tienda: «tienes 12 y vienen 20». Lo que no tiene fecha se dice («vienen 20
 * (5 sin fecha)»). Sin nada que viene, solo «tienes 12». Lo atrasado y lo que llega tarde van aparte (`llegadasAparte`).
 */
export function tieneYVienen(t: Pick<AlcanceTipo, "tiene" | "vienen" | "vienenSinFecha">): string {
  const sinFecha = t.vienenSinFecha > 0 ? ` (${t.vienenSinFecha} sin fecha)` : "";
  const viene = t.vienen > 0 ? ` y ${plural(t.vienen, "viene", "vienen")} ${t.vienen}${sinFecha}` : "";
  return `tienes ${t.tiene}${viene}`;
}

/**
 * Lo que viene en camino y NO cuenta para la meta, dicho para que no se pierda en silencio: «8 atrasadas: no las cuento · 10 llegan después
 * del 31 dic.». (`despues`: «después de Navidad», «después del 31 dic.»: `despuesDeLaMeta`.) Vacío si no hay nada de eso.
 */
export function llegadasAparte(t: Pick<AlcanceTipo, "atrasadas" | "despues">, despues: string = "después de Navidad"): string {
  const partes: string[] = [];
  if (t.atrasadas > 0) partes.push(`${t.atrasadas} ${plural(t.atrasadas, "atrasada", "atrasadas")}: no ${plural(t.atrasadas, "la cuento", "las cuento")}`);
  if (t.despues > 0) partes.push(`${t.despues} ${plural(t.despues, "llega", "llegan")} ${despues}`);
  return partes.join(" · ");
}

/** Lo que llegó a decir cada fila de «¿Para cuánto te alcanza?» (A6, a): lo que se CUENTA, lo que NO, y la fecha límite con la temporada. */
export type LineasDeTipo = {
  /** «vendiste 56 (6 sin registrar) · tienes 32 + 40 que llegan el 29 oct.» */
  cuenta: string;
  /** «No cuento 43: 20 atrasadas, 15 sin fecha y 8 después del 31 dic.»; null si no hay nada que no cuente. Una sola palabra para atrasada y vencida. */
  noCuenta: string | null;
  /** «pídelo antes del 12 nov.» / «pídelo ya» (con «ya hay una orden» si la hay); null si llega o no hay ritmo. */
  pidelo: string | null;
  /** «con temporada: unos 61 días»; null si no hay historia para decirlo. */
  temporada: string | null;
  /** Lo que se dice solo en el panel del tipo: el Taller, lo por repartir y lo que el proveedor debe (no es una orden a tu tienda). */
  red: string[];
};

/** «20 atrasadas, 15 sin fecha y 8 después del 31 dic.» */
const listaConY = (xs: readonly string[]): string => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

export function lineasDeTipo(t: AlcanceTipo, h: Pick<Horizonte, "modo" | "fecha">): LineasDeTipo {
  const sinRegistrar = t.sinPrenda > 0 ? ` (${t.sinPrenda} sin registrar)` : "";
  const sinSalir = t.nunca ? ` (${t.nunca} sin salir al piso)` : "";
  const llegan = t.vienen + t.pedido.suma;
  // La fecha solo cuando todo lo que llega es lo ya pedido (las llegadas por prenda no traen una sola fecha que decir).
  const cuando = t.vienen === 0 ? cuandoLlegan(t.pedido) : null;
  const viene = llegan > 0 ? ` + ${llegan} que ${plural(llegan, "llega", "llegan")}${cuando ? ` ${cuando}` : ""}` : "";
  const cuenta = `vendiste ${t.vendidas}${sinRegistrar} · tienes ${t.tiene}${sinSalir}${viene}`;

  const atrasadas = t.atrasadas + t.pedido.atrasadas;
  const despues = t.despues + t.pedido.despues;
  const partes: string[] = [];
  if (atrasadas > 0) partes.push(`${atrasadas} ${plural(atrasadas, "atrasada", "atrasadas")}`);
  if (t.pedido.sinFecha > 0) partes.push(`${t.pedido.sinFecha} sin fecha`);
  if (despues > 0) partes.push(`${despues} ${despuesDeLaMeta(h)}`);
  const total = atrasadas + t.pedido.sinFecha + despues;
  const noCuenta = total > 0 ? `No cuento ${total}: ${listaConY(partes)}` : null;

  const red: string[] = [];
  if (t.pedido.debe > 0) red.push(`el proveedor debe ${t.pedido.debe}`);
  if (t.pedido.porRepartir > 0) red.push(`${t.pedido.porRepartir} por repartir desde Lima`);
  if (t.pedido.enTaller > 0) red.push(`el Taller tiene ${t.pedido.enTaller} en proceso`);

  // Con una orden abierta no se dice «pídelo ya»: se dice que la orden está y que se mire (la fecha queda en el tooltip y en el panel).
  const pidelo = t.pidelo ? (t.ordenAbierta ? "ya hay orden: mírala antes de pedir" : textoPidelo(t.pidelo)) : null;
  // La temporada puede decir que, con ella, no llegaría aunque a ritmo plano sí: se dice, no se deja una línea que contradice a la fila.
  const temporada =
    t.conTemporada !== null
      ? `con temporada: unos ${t.conTemporada} ${plural(t.conTemporada, "día", "días")}${!t.pide && t.conTemporada < t.meta ? " · con ella no llegaría" : ""}`
      : null;
  return { cuenta, noCuenta, pidelo, temporada, red };
}

/** El nombre corto de un tipo para un lugar chico: lo de antes de « y » («Gorros y Sombreros» → «Gorros»). */
export const tipoCorto = (categoria: string): string => categoria.split(" y ")[0] ?? categoria;

/** Cuántas letras caben en una línea del titular de «¿Qué pedir?» de Hoy a 28 px (la tarjeta mide ~293 px a 1024). Con más, baja a 22 px en vez de partirse. */
const LETRAS_DEL_TITULAR = 18;

/**
 * El titular de la tarjeta «¿Qué pedir?» de Hoy y lo que lo sigue, para que juntos se lean como UNA frase: «Polos y Camisas» + «no llegan hasta el 31 dic. (y 12 tipos
 * más)». Los tipos vienen YA en el orden de «Qué pedir primero» (`ordenarAlcance`): los que más pesan primero, no los chicos (A6, D13). Sin nada partido a mano
 * (segundo pase visual, 2026-10-17); `largo`: no cabe en una línea a 28 px y la pantalla lo baja a 22.
 */
export function titularDeLosQueNoLlegan(categorias: readonly string[], hasta: string = "a Navidad"): { titular: string; largo: boolean; resto: string } {
  const titular = categorias.slice(0, 2).map(tipoCorto).join(" y ");
  const mas = categorias.length - 2;
  const verbo = `no ${plural(categorias.length, "llega", "llegan")} ${hasta}`;
  return { titular, largo: titular.length > LETRAS_DEL_TITULAR, resto: mas > 0 ? `${verbo} (y ${mas} ${plural(mas, "tipo más", "tipos más")})` : verbo };
}

/** Dónde termina el eje de «¿Para cuánto te alcanza?»: la meta más un 15 % (A6, i), para que su línea y lo que se queda corto se vean. */
export const finEjeAlcance = (metaDias: number): number => Math.max(7, Math.ceil(metaDias * MARGEN_DEL_EJE));

/**
 * De qué días habla el ritmo de todo Análisis: desde que cada prenda se colgó, nunca menos de una semana y hasta los días de ventas de la
 * tienda (2026-10-14, `ventanaDeRitmo`). Con una semana o menos de ventas, es lo mismo que «los últimos N días» y se dice así.
 */
export const textoRitmo = (diasDeVentas: number): string =>
  diasDeVentas <= DIAS_MINIMOS_RITMO
    ? `Al ritmo de los últimos ${diasDeVentas} ${plural(diasDeVentas, "día", "días")}`
    : `Al ritmo desde que se colgó · hasta ${diasDeVentas} días`;

/* ───────── «Las tallas que se llevan» ───────── */

export type ColumnaTalla = {
  talla: string;
  /** La parte de lo vendido (del tipo elegido, o de todo) que es de esta talla, de 0 a 100: el alto de su barra (no se muestra). */
  v: number;
  /** La parte de lo que tengo que es de esta talla, de 0 a 100: el alto de su barra (no se muestra). */
  t: number;
  /** Las unidades: vendidas en los días de ventas de la tienda y las que tengo hoy. Es lo que se lee sobre cada barra. */
  vend: number;
  tiene: number;
  pideMas: boolean;
};

export type CurvaTallas =
  /** Todo lo de ese tipo se vende en talla única o estándar: no hay tallas que comparar. */
  | { tipo: "unica" }
  /** Hay tallas, pero ni ventas ni prendas que comparar (o no hay nada). */
  | { tipo: "vacia" }
  | {
      tipo: "tallas";
      columnas: ColumnaTalla[];
      /** La columna más alta: las demás se miden contra ella. */
      max: number;
      /** Sin tipo elegido: qué tallas se compararon («Modelos con talla S, M y L»). */
      nota: string | null;
    };

/** «S, M y L». */
function enLista(xs: readonly string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

const conTalla = (talla: string): boolean => !esTallaUnica(talla) && tipoDeTalla(talla) !== "unica";

/**
 * La curva de tallas: por talla, qué parte de lo vendido en 30 días y qué parte de lo que tengo. Con un tipo elegido, todas
 * sus tallas; sin tipo, solo las del sistema que más pesa en la tienda (letras S·M·L o números 26·28…: mezclarlos no se lee) y
 * una nota que lo dice. La talla estándar (o única) es una columna más, la primera (Felipe 2026-10-12: en Polos de TRU era 84 de
 * 86 vendidas y no se veía); si un tipo SOLO tiene talla estándar, no hay nada que comparar y se dice así. Sin el aviso «Falta M»
 * (Felipe 2026-10-12): cada barra ya dice si «pide más».
 */
export function curvaDeTallas(
  prendas: readonly Pick<PrendaAnalisis, "categoria" | "talla" | "vendidas30" | "piso" | "almacen">[],
  categoria: string | null,
  /** Lo vendido sin registrar la prenda, por tipo y por la talla que se anotó en caja (A6, e): se suma a la barra de «Vendiste» de esa talla. */
  sinPrendaPorTalla: Readonly<Record<string, Readonly<Record<string, number>>>> = {},
): CurvaTallas {
  const delTipo = categoria === null ? prendas : prendas.filter((p) => categoriaDe(p) === categoria);
  // Lo vendido sin registrar la prenda pero con su talla anotada (A6, e): sin esto, Arequipa (91 % sin prenda) mostraba una curva de unas pocas ventas
  // y decía «pide más» sobre ellas. Sin tipo elegido solo cuentan los tipos que la tienda tiene (los demás, `tiposSinRegistrar` los nombra aparte).
  const tiposQueTiene = new Set(prendas.map(categoriaDe));
  const sinRegistrar: { talla: string; n: number }[] = [];
  for (const [tipo, tallas] of Object.entries(sinPrendaPorTalla)) {
    const c = tipo.trim() || SIN_CATEGORIA;
    if (categoria === null ? !tiposQueTiene.has(c) : c !== categoria) continue;
    for (const [talla, n] of Object.entries(tallas)) if (n > 0 && talla.trim()) sinRegistrar.push({ talla: talla.trim(), n });
  }
  const conMovimiento = delTipo.filter((p) => p.vendidas30 > 0 || totalEnTienda(p) > 0);
  if (conMovimiento.length === 0 && sinRegistrar.length === 0) return { tipo: "vacia" };
  let consideradas = conMovimiento.filter((p) => conTalla(p.talla));
  if (consideradas.length === 0 && !sinRegistrar.some((x) => conTalla(x.talla))) return { tipo: "unica" };
  // La estándar (o única) va en UNA columna, con el nombre que más usa la tienda («Estándar»).
  const unicas = conMovimiento.filter((p) => !conTalla(p.talla));
  const usos = new Map<string, number>();
  for (const p of unicas) usos.set(p.talla.trim(), (usos.get(p.talla.trim()) ?? 0) + 1);
  const nombreUnica = [...usos.entries()].sort(([a, x], [b, y]) => y - x || a.localeCompare(b, "es"))[0]?.[0] ?? null;

  // El sistema de tallas que se compara (letras S·M·L o números 26·28…: mezclarlos no se lee): el que más pesa. Sin tipo elegido filtra las filas; con tipo,
  // solo impide que una talla vendida sin registrar de OTRO sistema («M» en un tipo que se vende en 28 y 30) abra una columna sin nada que comparar.
  const peso = new Map<TipoTalla, number>();
  for (const p of consideradas) peso.set(tipoDeTalla(p.talla), (peso.get(tipoDeTalla(p.talla)) ?? 0) + p.vendidas30 + totalEnTienda(p));
  for (const x of sinRegistrar) if (conTalla(x.talla)) peso.set(tipoDeTalla(x.talla), (peso.get(tipoDeTalla(x.talla)) ?? 0) + x.n);
  const orden: TipoTalla[] = ["letras", "numeracion", "otras"];
  const sistema = orden.reduce((mejor, x) => ((peso.get(x) ?? 0) > (peso.get(mejor) ?? 0) ? x : mejor), orden[0]!);
  if (categoria === null) consideradas = consideradas.filter((p) => tipoDeTalla(p.talla) === sistema);

  const porTalla = new Map<string, { vend: number; tiene: number }>();
  if (nombreUnica !== null) porTalla.set(nombreUnica, { vend: 0, tiene: 0 });
  for (const p of unicas) {
    const a = porTalla.get(nombreUnica!)!;
    a.vend += Math.max(0, p.vendidas30);
    a.tiene += Math.max(0, totalEnTienda(p));
  }
  for (const p of consideradas) {
    const k = p.talla.trim();
    const a = porTalla.get(k) ?? { vend: 0, tiene: 0 };
    a.vend += Math.max(0, p.vendidas30);
    a.tiene += Math.max(0, totalEnTienda(p));
    porTalla.set(k, a);
  }
  for (const { talla, n } of sinRegistrar) {
    if (!conTalla(talla)) {
      const unica = nombreUnica !== null ? porTalla.get(nombreUnica) : undefined;
      if (unica) unica.vend += n;
    } else if (tipoDeTalla(talla) === sistema) {
      const a = porTalla.get(talla) ?? { vend: 0, tiene: 0 };
      a.vend += n;
      porTalla.set(talla, a);
    }
  }
  const totalV = [...porTalla.values()].reduce((s, a) => s + a.vend, 0);
  const totalT = [...porTalla.values()].reduce((s, a) => s + a.tiene, 0);
  const columnas = [...porTalla.entries()]
    .sort(([a], [b]) => (a === nombreUnica ? -1 : b === nombreUnica ? 1 : compararTallas(a, b)))
    .map(([talla, a]) => {
      const v = de100(a.vend, totalV);
      const t = de100(a.tiene, totalT);
      // «Pide más» solo con ventas suficientes para fiarse de la curva (A6, e): con 4 ventas, una talla de 2 ya es «50 %».
      return { talla, v, t, vend: a.vend, tiene: a.tiene, pideMas: totalV >= VENTAS_PARA_JUZGAR_SOLA && v - t >= DIFERENCIA_QUE_SE_NOTA };
    });

  return {
    tipo: "tallas",
    columnas,
    max: Math.max(1, ...columnas.flatMap((c) => [c.v, c.t])),
    nota: categoria === null ? `Modelos con talla ${enLista(columnas.map((c) => c.talla))}` : null,
  };
}

/* ───────── «Lo que más se vende» ───────── */

/**
 * Cuántos modelos muestra «Lo que más se vende»: los 5 primeros por defecto, y la persona elige ver 10, 15 o 20 (Felipe 2026-10-10,
 * opción A de «Qué pedir»).
 */
export const TOPS = [5, 10, 15, 20] as const;
export type Top = (typeof TOPS)[number];
export const TOP_DEFECTO: Top = 5;
/** Lo que ocupa la barra más larga del ranking (deja lugar a su cifra). */
export const LARGO_RANKING = 0.82;

/** Las que más se venden en mis días de ventas (hasta 30; del tipo elegido, si hay), de la que más a la que menos. */
export function masVendidas<T extends Pick<PrendaAnalisis, "categoria" | "vendidas30" | "nombre" | "color" | "talla">>(
  prendas: readonly T[],
  categoria: string | null,
  cuantos: number = TOP_DEFECTO,
): T[] {
  return prendas
    .filter((p) => p.vendidas30 > 0 && (categoria === null || categoriaDe(p) === categoria))
    .sort(
      (a, b) =>
        b.vendidas30 - a.vendidas30 ||
        a.nombre.localeCompare(b.nombre, "es") ||
        a.color.localeCompare(b.color, "es") ||
        compararTallas(a.talla, b.talla),
    )
    .slice(0, Math.max(1, Math.round(cuantos)));
}

/** Cuántos modelos se vendieron (del tipo elegido, si hay): para saber qué «Top» ofrecer y decir «de 23». */
export const cuantasVendidas = (prendas: readonly Pick<PrendaAnalisis, "categoria" | "vendidas30">[], categoria: string | null): number =>
  prendas.filter((p) => p.vendidas30 > 0 && (categoria === null || categoriaDe(p) === categoria)).length;

/** Los «Top» que tiene sentido ofrecer: el 5 siempre; los demás, solo si hay más modelos vendidos que el anterior. */
export function topsPosibles(vendidos: number): Top[] {
  return TOPS.filter((t, k) => k === 0 || vendidos > TOPS[k - 1]);
}

/**
 * La frase del panel de un tipo (opción A): para cuánto te alcanza contra la meta, lo que tienes, cuánto tarda un pedido y la temporada, o, sin tipo
 * elegido, lo de toda la tienda. Ejemplos inventados: «Te alcanza para 7 semanas: no llega hasta el 31 dic. Tienes 92 · 39 nunca salieron al piso.»; con algo
 * en camino, «Con lo que viene, te alcanza para 9 semanas: llega hasta el 31 dic. Tienes 92 y vienen 40.»; y lo atrasado no cuenta y se dice.
 */
export function fraseDelTipo(t: AlcanceTipo | null, todos: readonly AlcanceTipo[], diasDeVentas: number, h: Pick<Horizonte, "modo" | "fecha"> & { dias?: number } = { modo: "navidad", fecha: "" }): string {
  const enDias = `${diasDeVentas} ${plural(diasDeVentas, "día", "días")}`;
  const hasta = hastaLaMeta(h);
  const despues = despuesDeLaMeta(h);
  if (!t) {
    const vendidas = todos.reduce((s, x) => s + x.vendidas, 0);
    const suma = (campo: "tiene" | "vienen" | "vienenSinFecha" | "atrasadas" | "despues") => todos.reduce((s, x) => s + x[campo], 0);
    const pide = todos.filter((x) => x.pide).length;
    const vienen = suma("vienen");
    const tieneVienen = tieneYVienen({ tiene: suma("tiene"), vienen, vienenSinFecha: suma("vienenSinFecha") });
    const aparte = llegadasAparte({ atrasadas: suma("atrasadas"), despues: suma("despues") }, despues);
    // «…y tienes 102.» o, con algo en camino, «…, tienes 102 y vienen 20.» (dos «y» seguidas no se leen).
    const base = `Vendiste ${vendidas} en ${enDias}${vienen > 0 ? "," : " y"} ${tieneVienen}${aparte ? ` · ${aparte}` : ""}.`;
    // Lo ya pedido que cuenta (A4), de todos los tipos: «Ya pedido 40.»
    const yaPedido = todos.reduce((n, x) => n + x.pedido.suma, 0);
    const conPedido = yaPedido > 0 ? `${base} Ya pedido ${yaPedido}.` : base;
    return pide > 0 ? `${conPedido} ${pide} ${plural(pide, "tipo no llega", "tipos no llegan")} ${hasta}.` : conPedido;
  }
  // Con algo en camino o ya pedido, el plazo lo cuenta y la frase lo dice: «Con lo que viene, te alcanza para…», «Con lo que viene y lo ya pedido…».
  const alcanza =
    t.vienen > 0 && t.pedido.suma > 0
      ? "Con lo que viene y lo ya pedido, te alcanza"
      : t.vienen > 0
        ? "Con lo que viene, te alcanza"
        : t.pedido.suma > 0
          ? "Con lo ya pedido, te alcanza"
          : "Te alcanza";
  const alcance = t.incompleto
    ? `Todo lo que vendiste en ${enDias} se cobró sin registrar la prenda: el catálogo de ${t.categoria} está incompleto y no se sabe para cuánto te alcanza.`
    : t.dias === null
      ? `No se vendió en ${enDias}.`
      : t.dias <= 0
        ? `Ya no te queda: no llega ${hasta}.`
        : `${alcanza} para ${(h.dias === undefined ? textoAlcance(t.dias) : textoAlcanceEnEje(t.dias, finEjeAlcance(h.dias), false)).toLowerCase()}: ${t.pide ? "no llega" : "llega"} ${hasta}.`;
  const nunca = t.nunca ? ` · ${t.nunca} nunca ${plural(t.nunca, "salió", "salieron")} al piso` : "";
  const tarde = t.atrasadas > 0 ? ` ${t.atrasadas} ${plural(t.atrasadas, "atrasada no cuenta", "atrasadas no cuentan")} hasta que ${plural(t.atrasadas, "llegue", "lleguen")}.` : "";
  const lejos = t.despues > 0 ? ` ${t.despues} ${plural(t.despues, "llega", "llegan")} ${despues} y no ${plural(t.despues, "cuenta", "cuentan")}.` : "";
  const tieneVienen = tieneYVienen(t);
  // Lo ya pedido (A4): lo que cuenta con su detalle, y lo que no cuenta (sin fecha, vencido, lo que debe el proveedor, la red) cada cosa en su frase.
  const yaPedido = yaPedidoDetalle(t.pedido);
  const sinContar = pedidoAparte(t.pedido, despues).map((f) => ` ${f.charAt(0).toUpperCase()}${f.slice(1)}.`);
  // Cuándo pedirlo y el supuesto del plazo (D4), y la temporada (D5): solo lo que se sabe, y el plazo se dice como supuesto.
  const pidelo = t.pidelo ? ` ${t.ordenAbierta ? "Ya hay una orden abierta: mírala antes de pedir otra vez. " : ""}${tipPidelo(t.pidelo, t.plazo)}` : "";
  const temporada = t.conTemporada !== null ? ` Con la temporada de aquí ${hasta} te alcanzaría para unos ${t.conTemporada} ${plural(t.conTemporada, "día", "días")}.` : "";
  return `${alcance} ${tieneVienen.charAt(0).toUpperCase()}${tieneVienen.slice(1)}${nunca}.${tarde}${lejos}${yaPedido ? ` ${yaPedido}` : ""}${sinContar.join("")}${pidelo}${temporada}`;
}

/** La venta más alta de la tienda: el ranking se mide contra ella, aunque haya un filtro (así un tipo no parece vender más). */
export const ventaMaxima = (prendas: readonly Pick<PrendaAnalisis, "vendidas30">[]): number => Math.max(1, ...prendas.map((p) => p.vendidas30));

/**
 * Lo que queda de una prenda del ranking, con la MISMA regla de días que «Se está acabando» (A6, c): agotada (rojo), de 14 días o menos (ámbar) o más
 * (verde). El texto dice las dos cosas, unidades y días («Quedan 3 · 2 días»): antes un ✓ verde «Quedan 3» contradecía al «2 días» rojo del carril.
 */
export function estadoQuedan(p: Pick<PrendaAnalisis, "piso" | "almacen"> & Partial<Pick<PrendaAnalisis, "vendidas30" | "diasDeVentas">>): { est: "urg" | "ate" | "bien"; texto: string } {
  const n = totalEnTienda(p);
  if (n <= 0) return { est: "urg", texto: "Agotada" };
  const d = diasQueQuedan({ piso: p.piso, almacen: p.almacen, vendidas30: p.vendidas30 ?? 0, diasDeVentas: p.diasDeVentas });
  const unidades = plural(n, "Queda 1", `Quedan ${n}`);
  if (d === null) return { est: "bien", texto: unidades };
  return { est: d <= DIAS_SE_ACABA ? "ate" : "bien", texto: `${unidades} · ${d} ${plural(d, "día", "días")}` };
}

/* ───────── «Lo que más rinde»: cuánto se ganó por cada S/ 1 de ropa, por tipo ───────── */

/** La ventana de «Lo que más rinde». */
export const DIAS_RINDE = 90;
/** Debajo de esto, «Rinde poco: compra menos» (la maqueta). */
export const RINDE_POCO = 0.5;
/** La escala mínima del gráfico (la maqueta: de S/ 0 a S/ 1.40). */
const ESCALA_RINDE_MIN = 1.4;

/** La frase de `fallas` cuando no se pudo leer (la nota de la tarjeta la reconoce). */
export const FALLA_RINDE = "No se pudo leer lo que más rinde";

/** Una fila de `fn_resumen_comparacion` (período A = los últimos 90 días), con lo que «Lo que más rinde» usa. */
export type FilaRinde = {
  categoria: string | null;
  /** Costo de cada una hoy (sin IGV); null o 0 = no se sabe. */
  costo: number | null;
  /** Venta neta del período (precio con IGV − descuento, menos devoluciones). */
  importe: number;
  /** Costo de lo vendido y de lo devuelto, con el costo de cada venta. */
  costoVentas: number;
  costoDevoluciones: number;
  /** Unidades movidas sin costo guardado en su venta. */
  udsSinCosto: number;
  /** Unidades que hubo en la tienda, en promedio, a lo largo del período. */
  totalPromedio: number;
  /** Unidades que había el primer día del período. */
  stockInicio: number;
};

const numero = (x: unknown): number => {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN;
  return Number.isFinite(n) ? n : 0;
};

/** Una fila cruda de `fn_resumen_comparacion_json` → lo que usa «Lo que más rinde». Lo que falta o no es número cuenta 0. */
export function filaRindeDe(cruda: unknown): FilaRinde {
  const r = (cruda && typeof cruda === "object" ? cruda : {}) as Record<string, unknown>;
  const costo = numero(r.costo);
  return {
    categoria: typeof r.categoria_nombre === "string" ? r.categoria_nombre : null,
    costo: costo > 0 ? costo : null,
    importe: numero(r.a_importe),
    costoVentas: numero(r.a_costo_ventas),
    costoDevoluciones: numero(r.a_costo_devoluciones),
    udsSinCosto: numero(r.a_uds_sin_costo),
    totalPromedio: numero(r.a_total_promedio),
    stockInicio: numero(r.a_stock_inicio),
  };
}

/**
 * Por tipo de prenda: lo que se ganó en el período (venta neta sin IGV − costo de lo vendido) por cada S/ 1 que hubo en ropa
 * de ese tipo, en promedio, al costo. Solo cuentan las prendas con costo (sin él no se sabe cuánto hay ni cuánto se ganó); a lo
 * vendido sin costo guardado se le pone el costo de hoy. Un tipo entra solo si ya tenía ropa el primer día del período: con
 * menos de 90 días la cuenta saldría inflada («Todavía no hay 90 días»). De la que más rinde a la que menos. La tasa del IGV
 * (0.18) la pasa quien llama: el precio de venta la incluye y el costo no.
 */
export function rindePorCategoria(filas: readonly FilaRinde[], tasaIgv: number): { categoria: string; porSol: number }[] {
  const porTipo = new Map<string, { ganancia: number; valor: number; inicio: number }>();
  for (const f of filas) {
    if (f.costo === null) continue;
    const c = f.categoria?.trim() || SIN_CATEGORIA;
    const a = porTipo.get(c) ?? { ganancia: 0, valor: 0, inicio: 0 };
    const costoVendido = f.costoVentas - f.costoDevoluciones + f.udsSinCosto * f.costo;
    a.ganancia += f.importe / (1 + tasaIgv) - costoVendido;
    a.valor += f.costo * Math.max(0, f.totalPromedio);
    a.inicio += Math.max(0, f.stockInicio);
    porTipo.set(c, a);
  }
  return [...porTipo.entries()]
    .filter(([, a]) => a.inicio > 0 && a.valor > 0)
    .map(([categoria, a]) => ({ categoria, porSol: Math.round((a.ganancia / a.valor) * 100) / 100 }))
    .sort((a, b) => b.porSol - a.porSol || a.categoria.localeCompare(b.categoria, "es"));
}

/** Desde qué parte de lo vendido de un tipo sin su prenda registrada «Lo que más rinde» se calla: la mitad (A6, d; hallazgo P1h2: AQP vende 91 % sin prenda). */
export const PARTE_SIN_REGISTRO_QUE_CALLA = 0.5;

/** Un tipo de «Lo que más rinde» con la confianza de su cifra: `fiable: false` = casi todo lo vendido se cobró sin registrar la prenda (no se mide su costo). */
export type RindeDeTipo = { categoria: string; porSol: number; fiable: boolean };

/**
 * «Lo que más rinde» y su veredicto «Rinde poco» se calculan con las ventas CON prenda (sin su costo no hay ganancia). Si de un tipo la mitad o más de lo
 * vendido se cobró sin registrar la prenda, la cifra mide una parte pequeña del tipo y «Rinde poco: compra menos» podría ser mentira: ese tipo se
 * calla y dice por qué (A6, d). Un tipo que `alcancePorTipo` no tiene (sin ventas en la ventana) se deja como viene.
 */
export function rindeConConfianza(rinde: readonly { categoria: string; porSol: number }[], tipos: readonly Pick<AlcanceTipo, "categoria" | "vendidas" | "sinPrenda">[]): RindeDeTipo[] {
  const porNombre = new Map(tipos.map((t) => [t.categoria, t]));
  return rinde.map((r) => {
    const t = porNombre.get(r.categoria);
    const fiable = !(t && t.vendidas > 0 && t.sinPrenda / t.vendidas >= PARTE_SIN_REGISTRO_QUE_CALLA);
    return { ...r, fiable };
  });
}

/** El tooltip de un tipo que se calla. */
export const tipRindeSinRegistro = (categoria: string): string =>
  `Casi todo lo que vendiste de ${categoria} se cobró sin registrar la prenda: sin su costo no se puede medir cuánto rinde.`;

/** Hasta dónde llega el gráfico: S/ 1.40 como la maqueta, o una décima más que el que más rinde. */
export function escalaRinde(rinde: readonly { porSol: number }[]): number {
  const mayor = Math.max(0, ...rinde.map((r) => r.porSol));
  return Math.max(ESCALA_RINDE_MIN, (Math.ceil(mayor * 10 - 1e-9) + 1) / 10);
}

/** «S/ 1.30» (con signo menos si se perdió). */
export const solesRinde = (n: number): string => `S/\u00a0${n < 0 ? "−" : ""}${Math.abs(n).toFixed(2)}`;

/** El tooltip de cada fila: «Por cada S/ 1 que tienes en Polos, ganaste S/ 1.10 en 90 días». */
export function tipRinde(r: { categoria: string; porSol: number }): string {
  return r.porSol < 0
    ? `Por cada S/\u00a01 que tienes en ${r.categoria}, perdiste ${solesRinde(-r.porSol)} en ${DIAS_RINDE} días`
    : `Por cada S/\u00a01 que tienes en ${r.categoria}, ganaste ${solesRinde(r.porSol)} en ${DIAS_RINDE} días`;
}

/** Qué dice la tarjeta cuando no hay nada que mostrar: si no se pudo leer, eso; si no, que todavía no alcanza. */
export function notaRindeVacio(fallas: readonly string[]): string {
  return fallas.includes(FALLA_RINDE) ? "No se pudo leer ahora." : `Todavía no hay ${DIAS_RINDE} días de ventas con su costo para medirlo.`;
}
