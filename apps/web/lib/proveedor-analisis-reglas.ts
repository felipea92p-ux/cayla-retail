// «Lo que quizá no ves»: reglas puras que leen lo comprado y lo vendido por proveedor y dicen lo que a simple vista no se nota.
// Sin I/O y sin azar: las mismas filas dan los mismos avisos, y cada aviso trae los números y la regla que lo disparó (el «¿Por qué?»),
// para que quien lo lea pueda discutir el criterio. Los umbrales son reglas de negocio de Felipe: están todos aquí, con nombre.
//
// UNIDADES vs DINERO (ADR-0502, actualización 2026-10-24 (b)): lo de unidades (vendidas, rotación, sin venta) vale para los dos orígenes
// de lo comprado (Compras y Carga inicial). Lo de dinero (margen, plata parada en soles, «margen bajo», renegociar) se calcula solo con lo
// que tiene costo real —lo que llegó por Compras—; con la carga inicial el aviso de dinero no sale y se dice «Costo por confirmar».
// La producción propia (el Taller) no se compara con proveedores externos: queda fuera.

import { soles } from "./compras-reglas";
import { diasEntreFechas } from "./fechas-lima";
import { COSTO_REAL_MIN_PCT, margenDe, pct, plataRealEnEstantes, tieneCostoReal, totalesDePrendas, type PrendaDeProveedor } from "./proveedor-prendas-reglas";

/** Una prenda que llegó hace menos que esto no se juzga: «sin vender» puede ser solo que llegó ayer. */
export const DIAS_PARA_JUZGAR = 21;
/** Plata parada mínima para avisar (por debajo no vale la pena un aviso). Felipe 2026-10-24: 1000 → 500. */
export const PLATA_PARADA_MIN = 500;
/** Unidades paradas mínimas para avisar cuando el costo está por confirmar (el aviso es de unidades, no de plata). */
export const UNIDADES_PARADAS_MIN = 30;
/** Cuántos puntos de margen por debajo del promedio de la cartera para avisar. */
export const PUNTOS_MARGEN_BAJO = 7;
/** Unidades vendidas mínimas para sacar una conclusión de MARGEN (margen bajo, vuelve a comprarle). No rige para el ritmo ni la plata parada. */
export const MIN_VENDIDAS = 10;
/** Unidades compradas mínimas para hablar del ritmo de un proveedor (con menos, es poca mercadería para medir nada). */
export const MIN_COMPRADAS = 20;
/** Semanas que tardaría en venderse lo que queda, al ritmo actual, desde las que se avisa «frénate»: una temporada. */
export const SEMANAS_STOCK_LARGO = 16;
/** Semanas en las que, al ritmo actual, se agota lo que queda: desde ahí es «vuelve a comprarle» (con margen) o «se agota pronto». */
export const SEMANAS_AGOTA = 6;
/** Peso de un proveedor en el gasto de Compras desde el que se avisa dependencia. Felipe 2026-10-24: 40 → 25. */
export const DEPENDENCIA_PCT = 25;
export const MAX_AVISOS = 5;

export type TonoHallazgo = "atencion" | "exito" | "info";

export type Hallazgo = {
  id: string;
  tono: TonoHallazgo;
  titulo: string;
  texto: string;
  /** Los números exactos detrás del aviso. */
  numeros: string[];
  /** La regla, en palabras de tienda. */
  regla: string;
  /** Mayor primero. */
  prioridad: number;
  proveedorId?: string;
};

export type PrendaConProveedor = PrendaDeProveedor & { proveedorId: string; proveedorNombre: string; esTaller: boolean };

const num = (n: number) => n.toLocaleString("es-PE");
const p0 = (n: number) => `${Math.round(n)} %`;

/** Semanas desde la primera entrada (mínimo 1: antes no hay ritmo que medir). */
function semanasDesde(primera: string | null, hoy: string): number {
  if (!primera) return 1;
  return Math.max(1, diasEntreFechas(primera, hoy) / 7);
}

export type Ritmo = {
  /** ¿Hay mercadería suficiente y tiempo en la tienda para hablar de ritmo? */
  juzgable: boolean;
  vendidas: number;
  enEstantes: number;
  semanas: number;
  porSemana: number;
  /** Semanas que tardaría en venderse lo que queda: 0 si no queda nada, `Infinity` si no vendió nada. */
  semanasParaAgotar: number;
  /** Tarda `SEMANAS_STOCK_LARGO` semanas o más (o no vendió nada) en vender lo que le queda. */
  lento: boolean;
  /** Agota lo que le queda en `SEMANAS_AGOTA` semanas o menos. */
  agota: boolean;
};

/**
 * El ritmo de UN proveedor, en UNIDADES (vale para los dos orígenes, carga inicial incluida): una sola función para la ficha y la lista,
 * así no se contradicen. No exige un mínimo de ventas: con 0 o pocas, el ritmo es lento por definición. Si no vendió nada no hay ritmo
 * que medir: cuenta como lento cuando lleva `DIAS_PARA_JUZGAR` días o más en la tienda.
 */
export function ritmoDe(prendas: readonly PrendaDeProveedor[], hoy: string): Ritmo {
  const t = totalesDePrendas(prendas);
  const primera = prendas.map((p) => p.primeraEntrada).filter((d): d is string => !!d).sort()[0] ?? null;
  const dias = primera ? diasEntreFechas(primera, hoy) : null;
  const semanas = semanasDesde(primera, hoy);
  const porSemana = t.unidadesVendidas / semanas;
  const enEstantes = t.unidadesEnEstantes;
  const semanasParaAgotar = enEstantes === 0 ? 0 : t.unidadesVendidas === 0 ? Infinity : enEstantes / porSemana;
  const juzgable = dias != null && dias >= DIAS_PARA_JUZGAR && t.unidadesCompradas >= MIN_COMPRADAS;
  return {
    juzgable,
    vendidas: t.unidadesVendidas,
    enEstantes,
    semanas,
    porSemana,
    semanasParaAgotar,
    lento: juzgable && enEstantes > 0 && semanasParaAgotar >= SEMANAS_STOCK_LARGO,
    agota: juzgable && t.unidadesVendidas > 0 && enEstantes > 0 && semanasParaAgotar <= SEMANAS_AGOTA,
  };
}

const textoSemanas = (r: Ritmo) => (Number.isFinite(r.semanasParaAgotar) ? `unas ${Math.round(r.semanasParaAgotar)} semanas` : "un tiempo que no se puede medir: no ha vendido nada");

function sinVenderViejas(prendas: readonly PrendaDeProveedor[], hoy: string): PrendaDeProveedor[] {
  return prendas.filter((p) => p.unidadesVendidas === 0 && p.primeraEntrada != null && diasEntreFechas(p.primeraEntrada, hoy) >= DIAS_PARA_JUZGAR);
}

const enEstantes = (p: PrendaDeProveedor) => Math.min(p.stockActual, p.unidadesCompradas);

/** Lo que se ve dentro de la ficha de UN proveedor. */
export function hallazgosDeProveedor(prendas: readonly PrendaDeProveedor[], hoy: string): Hallazgo[] {
  const out: Hallazgo[] = [];
  const t = totalesDePrendas(prendas);

  // 1. Prendas que llevan semanas sin venderse: en plata si tienen costo real; si no, en unidades y con el costo por confirmar.
  const paradas = sinVenderViejas(prendas, hoy);
  const plataParada = paradas.reduce((a, p) => a + plataRealEnEstantes(p), 0);
  const unidadesParadas = paradas.reduce((a, p) => a + enEstantes(p), 0);
  const cabeza = (n: number) => `${num(n)} ${n === 1 ? "prenda lleva" : "prendas llevan"} más de ${DIAS_PARA_JUZGAR / 7} semanas sin venderse`;
  if (plataParada >= PLATA_PARADA_MIN) {
    const top = [...paradas].sort((a, b) => plataRealEnEstantes(b) - plataRealEnEstantes(a));
    out.push({
      id: "paradas",
      tono: "atencion",
      titulo: `${cabeza(paradas.length)}: ${soles(plataParada)} parados`,
      texto: "Antes de volver a comprarle, mira cuáles no rotan: puede ser el modelo, el precio o dónde está exhibida.",
      numeros: top.slice(0, 5).map((p) => `${p.referencia}: ${num(enEstantes(p))} sin vender, ${soles(plataRealEnEstantes(p))} al costo de Compras`),
      regla: `Prendas con 0 ventas y al menos ${DIAS_PARA_JUZGAR} días en la tienda; la plata cuenta solo lo que llegó por Compras (costo real); avisa desde ${soles(PLATA_PARADA_MIN)} parados.`,
      prioridad: 80 + Math.min(15, plataParada / 1000),
    });
  } else if (unidadesParadas >= UNIDADES_PARADAS_MIN) {
    const top = [...paradas].sort((a, b) => enEstantes(b) - enEstantes(a));
    out.push({
      id: "paradas",
      tono: "atencion",
      titulo: `${cabeza(paradas.length)}: ${num(unidadesParadas)} unidades sin salir`,
      texto: "Mira cuáles no rotan antes de volver a comprarle. El costo de estas prendas está por confirmar: cuando lleguen por Compras se verá cuánta plata es.",
      numeros: top.slice(0, 5).map((p) => `${p.referencia}: ${num(enEstantes(p))} sin vender`),
      regla: `Prendas con 0 ventas y al menos ${DIAS_PARA_JUZGAR} días en la tienda; sin costo real no se calcula plata, se avisa desde ${UNIDADES_PARADAS_MIN} unidades.`,
      prioridad: 70,
    });
  }

  // 2. Se vendió por debajo del costo (dinero: solo prendas con costo real).
  const aPerdida = prendas
    .filter((p) => tieneCostoReal(p) && p.ingresoVendido > 0 && p.ingresoVendido < p.costoVendido)
    .sort((a, b) => a.ingresoVendido - a.costoVendido - (b.ingresoVendido - b.costoVendido));
  if (aPerdida.length > 0) {
    const perdida = aPerdida.reduce((a, p) => a + (p.costoVendido - p.ingresoVendido), 0);
    out.push({
      id: "a-perdida",
      tono: "atencion",
      titulo: `${num(aPerdida.length)} ${aPerdida.length === 1 ? "prenda se vendió" : "prendas se vendieron"} por debajo de su costo (${soles(perdida)} de pérdida)`,
      texto: "Revisa si fue un descuento o si el precio de lista quedó bajo lo que costó.",
      numeros: aPerdida.slice(0, 5).map((p) => `${p.referencia}: cobraste ${soles(p.ingresoVendido)} por algo que costó ${soles(p.costoVendido)}`),
      regla: "En prendas con costo real (llegaron por Compras), lo cobrado es menor que lo que costaron las unidades vendidas.",
      prioridad: 90,
    });
  }

  // 3. A este ritmo, cuánto tardas en vender lo que queda (unidades: vale para los dos orígenes; sin mínimo de ventas).
  const r = ritmoDe(prendas, hoy);
  if (r.lento) {
    out.push({
      id: "ritmo",
      tono: "atencion",
      titulo: Number.isFinite(r.semanasParaAgotar)
        ? `A este ritmo tardarías unas ${Math.round(r.semanasParaAgotar)} semanas en vender lo que le queda`
        : `No ha vendido nada en ${Math.round(r.semanas)} semanas y le quedan ${num(r.enEstantes)} unidades`,
      texto: "Vendes poco por semana comparado con lo que tienes en estantes de este proveedor: compra menos o mueve lo que hay.",
      numeros: [`${num(r.vendidas)} vendidas en ${Math.round(r.semanas)} semanas (${r.porSemana.toLocaleString("es-PE", { maximumFractionDigits: 1 })} por semana)`, `${num(r.enEstantes)} unidades siguen en estantes`],
      regla: `Unidades en estantes entre las vendidas por semana; avisa desde ${SEMANAS_STOCK_LARGO} semanas (una temporada), con al menos ${MIN_COMPRADAS} unidades compradas y ${DIAS_PARA_JUZGAR} días en la tienda. Si no vendió nada, cuenta como lento.`,
      prioridad: 70,
    });
  }

  // 4. La prenda estrella (margen: solo con costo real).
  const estrella = [...prendas]
    .filter((p) => tieneCostoReal(p) && p.unidadesVendidas >= 3 && (margenDe(p) ?? -1) >= 40)
    .sort((a, b) => b.unidadesVendidas - a.unidadesVendidas)[0];
  if (estrella) {
    out.push({
      id: "estrella",
      tono: "exito",
      titulo: `${estrella.referencia} es lo que mejor te rinde de este proveedor`,
      texto: "Vende y deja margen: si vas a reponer, empieza por ahí.",
      numeros: [`${num(estrella.unidadesVendidas)} vendidas de ${num(estrella.unidadesCompradas)} compradas`, `Margen de ${p0(margenDe(estrella) ?? 0)}`],
      regla: "Entre las prendas con costo real, la que más unidades vendió con 40 % de margen o más (mínimo 3 vendidas).",
      prioridad: 40,
    });
  }

  // 5. El dinero todavía no se puede afirmar: se dice, en vez de callar.
  if (t.unidadesVendidas >= MIN_VENDIDAS && t.costoPorConfirmar) {
    out.push({
      id: "costo-por-confirmar",
      tono: "info",
      titulo: "Costo por confirmar: todavía no se puede hablar de margen con este proveedor",
      texto: "La mayor parte de lo que le compraste viene de la carga inicial, con costos que pudieron distorsionarse. Se confirma solo cuando llegan compras por Compras.",
      numeros: [`${p0(t.costoRealPct)} de lo comprado ya tiene costo real (llegó por Compras); la carga inicial es ${num(t.unidadesCarga)} unidades`],
      regla: `El margen y la plata parada se calculan cuando al menos ${COSTO_REAL_MIN_PCT} % de lo comprado tiene costo real.`,
      prioridad: 20,
    });
  }

  return out.sort((a, b) => b.prioridad - a.prioridad);
}

type Resumen = ReturnType<typeof totalesDePrendas> & { proveedorId: string; nombre: string; ritmo: Ritmo; plataParada: number };

/** Lo que se ve en la lista: compara a los proveedores externos entre sí (el Taller queda fuera). */
export function hallazgosDeCartera(filas: readonly PrendaConProveedor[], hoy: string): Hallazgo[] {
  const porProveedor = new Map<string, PrendaConProveedor[]>();
  for (const f of filas) if (!f.esTaller) porProveedor.set(f.proveedorId, [...(porProveedor.get(f.proveedorId) ?? []), f]);
  const resumenes: Resumen[] = [...porProveedor.entries()].map(([proveedorId, ps]) => ({
    ...totalesDePrendas(ps),
    proveedorId,
    nombre: ps[0].proveedorNombre,
    ritmo: ritmoDe(ps, hoy),
    plataParada: sinVenderViejas(ps, hoy).reduce((a, p) => a + plataRealEnEstantes(p), 0),
  }));
  const todos = totalesDePrendas(filas.filter((f) => !f.esTaller && tieneCostoReal(f)));
  const margenCartera = todos.margenPct;
  const reales = resumenes.filter((r) => !r.costoPorConfirmar);
  const out: Hallazgo[] = [];
  // 1. Frenar: al ritmo actual, vender lo que le queda tarda una temporada o más (unidades: vale para los dos orígenes, carga inicial
  // incluida; el Taller no entra). No exige un mínimo de ventas. La plata solo se nombra cuando hay costo real.
  for (const r of resumenes.filter((x) => x.ritmo.lento).sort((a, b) => b.ritmo.semanasParaAgotar - a.ritmo.semanasParaAgotar || b.ritmo.enEstantes - a.ritmo.enEstantes).slice(0, 3)) {
    const rt = r.ritmo;
    out.push({
      id: `frenar-${r.proveedorId}`,
      proveedorId: r.proveedorId,
      tono: "atencion",
      titulo: `${r.nombre}: vender lo que le queda tardaría ${textoSemanas(rt)}. Antes de comprarle más, mueve lo que tienes`,
      texto: `Compraste ${num(r.unidadesCompradas)} unidades y vendiste ${num(r.unidadesVendidas)}; siguen ${num(rt.enEstantes)} en estantes.${r.costoPorConfirmar ? " El costo está por confirmar: cuando lleguen compras por Compras se verá cuánta plata es." : ""}`,
      numeros: [
        `${num(r.unidadesVendidas)} vendidas de ${num(r.unidadesCompradas)} compradas en ${Math.round(rt.semanas)} semanas (${rt.porSemana.toLocaleString("es-PE", { maximumFractionDigits: 1 })} por semana)`,
        `${num(rt.enEstantes)} unidades siguen en estantes`,
        ...(r.costoPorConfirmar ? [] : [`Plata en estantes (costo de Compras): ${soles(r.plataEnStock)}${r.plataParada >= PLATA_PARADA_MIN ? `, de la cual ${soles(r.plataParada)} en prendas sin una sola venta` : ""}`]),
      ],
      regla: `Unidades en estantes entre las vendidas por semana; avisa desde ${SEMANAS_STOCK_LARGO} semanas (una temporada), con al menos ${MIN_COMPRADAS} unidades compradas y ${DIAS_PARA_JUZGAR} días en la tienda. Si no vendió nada, cuenta como lento.`,
      prioridad: 85 + (Number.isFinite(rt.semanasParaAgotar) ? Math.min(9, rt.semanasParaAgotar / 20) : 10),
    });
  }

  // 2. Margen bajo frente al promedio (dinero: solo proveedores con costo real).
  if (margenCartera != null) {
    for (const r of reales.filter((x) => x.unidadesVendidas >= MIN_VENDIDAS && x.margenPct != null && x.margenPct <= margenCartera - PUNTOS_MARGEN_BAJO).sort((a, b) => (a.margenPct ?? 0) - (b.margenPct ?? 0)).slice(0, 2)) {
      out.push({
        id: `margen-${r.proveedorId}`,
        proveedorId: r.proveedorId,
        tono: "atencion",
        titulo: `${r.nombre} te deja ${p0(r.margenPct ?? 0)} de margen, el promedio es ${p0(margenCartera)}`,
        texto: "Pídele mejor costo o sube el precio de venta de sus prendas.",
        numeros: [`Margen de ${r.nombre}: ${p0(r.margenPct ?? 0)} sobre ${num(r.unidadesVendidas)} unidades vendidas`, `Margen de todos tus proveedores con costo real: ${p0(margenCartera)}`],
        regla: `Se avisa si, con ${MIN_VENDIDAS} unidades vendidas o más y costo real, el margen queda ${PUNTOS_MARGEN_BAJO} puntos o más por debajo del promedio.`,
        prioridad: 75,
      });
    }
  }

  // 3. Se vende rápido: al ritmo actual agota lo que le queda en `SEMANAS_AGOTA` semanas o menos.
  //   · Con costo real y margen igual o mayor al promedio: «vuelve a comprarle».
  //   · Con el costo por confirmar NO se recomienda comprar (el margen no se conoce): se avisa que «se agota pronto» y que se mire el margen
  //     antes de reponer. Decisión del 2026-10-24: sin margen confiable, el aviso sale por ritmo y dice «margen por confirmar».
  const yaVolver = new Set<string>();
  for (const r of resumenes
    .filter((x) => !x.costoPorConfirmar && x.unidadesVendidas >= MIN_VENDIDAS && x.ritmo.agota && x.margenPct != null && margenCartera != null && x.margenPct >= margenCartera)
    .sort((a, b) => a.ritmo.semanasParaAgotar - b.ritmo.semanasParaAgotar)
    .slice(0, 2)) {
    yaVolver.add(r.proveedorId);
    out.push({
      id: `volver-${r.proveedorId}`,
      proveedorId: r.proveedorId,
      tono: "exito",
      titulo: `${r.nombre} es de lo que mejor te rinde: lo que le queda se agota en ${textoSemanas(r.ritmo)} y deja ${p0(r.margenPct ?? 0)} de margen`,
      texto: "Si vas a reponer, es buen lugar para hacerlo.",
      numeros: [`${num(r.unidadesVendidas)} vendidas de ${num(r.unidadesCompradas)} compradas (${r.ritmo.porSemana.toLocaleString("es-PE", { maximumFractionDigits: 1 })} por semana)`, `${num(r.ritmo.enEstantes)} unidades siguen en estantes`, `Margen ${p0(r.margenPct ?? 0)} (promedio ${p0(margenCartera ?? 0)})`],
      regla: `Con ${MIN_VENDIDAS} unidades vendidas o más y costo real, agota lo que le queda en ${SEMANAS_AGOTA} semanas o menos y su margen es igual o mayor al promedio.`,
      prioridad: 50,
    });
  }
  for (const r of resumenes
    .filter((x) => !yaVolver.has(x.proveedorId) && x.costoPorConfirmar && x.unidadesVendidas >= MIN_VENDIDAS && x.ritmo.agota)
    .sort((a, b) => a.ritmo.semanasParaAgotar - b.ritmo.semanasParaAgotar)
    .slice(0, 2)) {
    out.push({
      id: `agota-${r.proveedorId}`,
      proveedorId: r.proveedorId,
      tono: "info",
      titulo: `${r.nombre} se vende rápido: lo que le queda se agota en ${textoSemanas(r.ritmo)} (margen por confirmar)`,
      texto: "Vende bien, pero su costo viene de la carga inicial y todavía no se sabe cuánto deja. Mira su margen antes de reponer.",
      numeros: [`${num(r.unidadesVendidas)} vendidas de ${num(r.unidadesCompradas)} compradas (${r.ritmo.porSemana.toLocaleString("es-PE", { maximumFractionDigits: 1 })} por semana)`, `${num(r.ritmo.enEstantes)} unidades siguen en estantes`, `Solo el ${p0(r.costoRealPct)} de lo comprado tiene costo real`],
      regla: `Con ${MIN_VENDIDAS} unidades vendidas o más, agota lo que le queda en ${SEMANAS_AGOTA} semanas o menos. Sin costo real no se recomienda comprar: el margen se confirma cuando lleguen compras por Compras.`,
      prioridad: 55,
    });
  }

  // 4. Dependencia de un solo proveedor (dinero: lo gastado por Compras).
  const gastoTotal = reales.reduce((a, r) => a + r.gastoCompras, 0);
  const mayor = [...reales].sort((a, b) => b.gastoCompras - a.gastoCompras)[0];
  if (mayor && reales.length >= 2 && (pct(mayor.gastoCompras, gastoTotal) ?? 0) >= DEPENDENCIA_PCT) {
    out.push({
      id: "dependencia",
      proveedorId: mayor.proveedorId,
      tono: "info",
      titulo: `${p0(pct(mayor.gastoCompras, gastoTotal) ?? 0)} de lo que compras por Compras va a ${mayor.nombre}`,
      texto: "Si te falla, queda poco con qué reemplazarlo. Conviene tener otro proveedor probado.",
      numeros: [`${soles(mayor.gastoCompras)} de ${soles(gastoTotal)} gastados por Compras`],
      regla: `Un solo proveedor con ${DEPENDENCIA_PCT} % o más de lo gastado por Compras (sin contar la producción propia).`,
      prioridad: 45,
    });
  }

  return out.sort((a, b) => b.prioridad - a.prioridad).slice(0, MAX_AVISOS);
}
