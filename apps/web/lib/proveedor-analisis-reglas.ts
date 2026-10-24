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
/** Plata parada mínima para avisar (por debajo no vale la pena un aviso). */
export const PLATA_PARADA_MIN = 1000;
/** Unidades paradas mínimas para avisar cuando el costo está por confirmar (el aviso es de unidades, no de plata). */
export const UNIDADES_PARADAS_MIN = 30;
/** Desde qué parte de lo gastado, parada, se dice «frénate». */
export const PARADO_PCT = 40;
/** Cuántos puntos de margen por debajo del promedio de la cartera para avisar. */
export const PUNTOS_MARGEN_BAJO = 7;
/** Unidades vendidas mínimas para juzgar a un proveedor (con menos, dos ventas no son una tendencia). */
export const MIN_VENDIDAS = 10;
/** Cuánto de lo comprado debe estar vendido para decir «vuelve a comprarle». */
export const VENDIDO_BUENO_PCT = 60;
/** Con tantas unidades compradas y tan poco vendido (%), se avisa rotación lenta aunque el costo esté por confirmar. */
export const VENDIDO_LENTO_PCT = 10;
export const UNIDADES_PARA_ROTACION = 50;
/** Semanas de stock desde las que se avisa «a este ritmo tardas mucho». */
export const SEMANAS_STOCK_LARGO = 26;
/** Peso de un proveedor en el gasto de Compras desde el que se avisa dependencia. */
export const DEPENDENCIA_PCT = 40;
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

  // 3. A este ritmo, cuánto tardas en vender lo que queda (unidades: vale para los dos orígenes).
  const semanas = semanasDesde(prendas.map((p) => p.primeraEntrada).filter((d): d is string => !!d).sort()[0] ?? null, hoy);
  const porSemana = t.unidadesVendidas / semanas;
  if (t.unidadesVendidas >= MIN_VENDIDAS && porSemana > 0 && t.unidadesEnEstantes / porSemana >= SEMANAS_STOCK_LARGO) {
    const meses = t.unidadesEnEstantes / porSemana / 4.345;
    out.push({
      id: "ritmo",
      tono: "atencion",
      titulo: `A este ritmo tardarías unos ${Math.round(meses)} meses en vender lo que le queda`,
      texto: "Vendes poco por semana comparado con lo que tienes en estantes de este proveedor: compra menos o mueve lo que hay.",
      numeros: [`${num(t.unidadesVendidas)} vendidas en ${Math.round(semanas)} semanas (${porSemana.toLocaleString("es-PE", { maximumFractionDigits: 1 })} por semana)`, `${num(t.unidadesEnEstantes)} unidades siguen en estantes`],
      regla: `Unidades en estantes entre las vendidas por semana; avisa desde ${SEMANAS_STOCK_LARGO} semanas, con al menos ${MIN_VENDIDAS} unidades vendidas.`,
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

type Resumen = ReturnType<typeof totalesDePrendas> & { proveedorId: string; nombre: string; plataParada: number; prendasParadas: number; unidadesParadas: number; primera: string | null };

/** Lo que se ve en la lista: compara a los proveedores externos entre sí (el Taller queda fuera). */
export function hallazgosDeCartera(filas: readonly PrendaConProveedor[], hoy: string): Hallazgo[] {
  const porProveedor = new Map<string, PrendaConProveedor[]>();
  for (const f of filas) if (!f.esTaller) porProveedor.set(f.proveedorId, [...(porProveedor.get(f.proveedorId) ?? []), f]);
  const resumenes: Resumen[] = [...porProveedor.entries()].map(([proveedorId, ps]) => {
    const viejas = sinVenderViejas(ps, hoy);
    return {
      ...totalesDePrendas(ps),
      proveedorId,
      nombre: ps[0].proveedorNombre,
      plataParada: viejas.reduce((a, p) => a + plataRealEnEstantes(p), 0),
      prendasParadas: viejas.length,
      unidadesParadas: viejas.reduce((a, p) => a + enEstantes(p), 0),
      primera: ps.map((p) => p.primeraEntrada).filter((d): d is string => !!d).sort()[0] ?? null,
    };
  });
  const todos = totalesDePrendas(filas.filter((f) => !f.esTaller && tieneCostoReal(f)));
  const margenCartera = todos.margenPct;
  const reales = resumenes.filter((r) => !r.costoPorConfirmar);
  const out: Hallazgo[] = [];
  const yaFrenados = new Set<string>();

  // 1. Frenar: mucha plata parada (dinero: solo proveedores con costo real).
  for (const r of reales.filter((x) => x.plataParada >= PLATA_PARADA_MIN && (pct(x.plataParada, x.gastoCompras) ?? 0) >= PARADO_PCT).sort((a, b) => b.plataParada - a.plataParada).slice(0, 2)) {
    yaFrenados.add(r.proveedorId);
    out.push({
      id: `frenar-${r.proveedorId}`,
      proveedorId: r.proveedorId,
      tono: "atencion",
      titulo: `${r.nombre}: ${soles(r.plataParada)} parados. Antes de comprarle más, mueve lo que tienes`,
      texto: `Compraste ${num(r.unidadesCompradas)} prendas y vendiste ${num(r.unidadesVendidas)}. ${num(r.prendasParadas)} ${r.prendasParadas === 1 ? "prenda no ha vendido" : "prendas no han vendido"} ni una unidad.`,
      numeros: [`Gastaste por Compras ${soles(r.gastoCompras)}`, `Parados (prendas sin ventas, con más de ${DIAS_PARA_JUZGAR} días): ${soles(r.plataParada)} = ${p0(pct(r.plataParada, r.gastoCompras) ?? 0)} de lo gastado por Compras`],
      regla: `Se avisa si lo parado pasa de ${soles(PLATA_PARADA_MIN)} y es ${PARADO_PCT} % o más de lo gastado por Compras con ese proveedor.`,
      prioridad: 85 + Math.min(10, r.plataParada / 1000),
    });
  }

  // 1b. Rotación lenta en UNIDADES (vale para los dos orígenes): lo que se vendió es poco frente a lo comprado y el costo no está confirmado.
  for (const r of resumenes
    .filter((x) => !yaFrenados.has(x.proveedorId) && x.unidadesCompradas >= UNIDADES_PARA_ROTACION && (x.vendidoPct ?? 0) < VENDIDO_LENTO_PCT && x.primera != null && diasEntreFechas(x.primera, hoy) >= DIAS_PARA_JUZGAR && x.unidadesEnEstantes >= UNIDADES_PARADAS_MIN)
    .sort((a, b) => b.unidadesEnEstantes - a.unidadesEnEstantes)
    .slice(0, 2)) {
    out.push({
      id: `lento-${r.proveedorId}`,
      proveedorId: r.proveedorId,
      tono: "atencion",
      titulo: `${r.nombre}: vendiste ${num(r.unidadesVendidas)} de ${num(r.unidadesCompradas)} (${p0(r.vendidoPct ?? 0)}). Rota lento`,
      texto: `Siguen ${num(r.unidadesEnEstantes)} unidades en estantes. El costo está por confirmar: cuando lleguen compras por Compras se verá cuánta plata es.`,
      numeros: [`${num(r.unidadesVendidas)} vendidas de ${num(r.unidadesCompradas)} compradas (${p0(r.vendidoPct ?? 0)})`, `${num(r.unidadesEnEstantes)} unidades siguen en estantes, desde hace más de ${DIAS_PARA_JUZGAR} días`],
      regla: `Con ${UNIDADES_PARA_ROTACION} unidades compradas o más, menos de ${VENDIDO_LENTO_PCT} % vendido, al menos ${UNIDADES_PARADAS_MIN} unidades en estantes y ${DIAS_PARA_JUZGAR} días desde que llegaron.`,
      prioridad: 72,
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

  // 3. Vuelve a comprarle (dinero: solo con costo real).
  for (const r of reales
    .filter((x) => x.unidadesVendidas >= MIN_VENDIDAS && (x.vendidoPct ?? 0) >= VENDIDO_BUENO_PCT && x.margenPct != null && margenCartera != null && x.margenPct >= margenCartera)
    .sort((a, b) => (b.vendidoPct ?? 0) - (a.vendidoPct ?? 0))
    .slice(0, 2)) {
    out.push({
      id: `volver-${r.proveedorId}`,
      proveedorId: r.proveedorId,
      tono: "exito",
      titulo: `${r.nombre} es de lo que mejor te rinde: vendiste ${p0(r.vendidoPct ?? 0)} con ${p0(r.margenPct ?? 0)} de margen`,
      texto: "Si vas a reponer, es buen lugar para hacerlo.",
      numeros: [`${num(r.unidadesVendidas)} vendidas de ${num(r.unidadesCompradas)} compradas`, `Margen ${p0(r.margenPct ?? 0)} (promedio ${p0(margenCartera ?? 0)})`],
      regla: `Con ${MIN_VENDIDAS} unidades vendidas o más y costo real, ${VENDIDO_BUENO_PCT} % o más de lo comprado ya vendido y margen igual o mayor al promedio.`,
      prioridad: 50,
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
