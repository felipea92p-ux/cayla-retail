// «Lo que quizá no ves»: reglas puras que leen lo comprado y lo vendido por proveedor y dicen lo que a simple vista no se nota.
// Sin I/O y sin azar: las mismas filas dan los mismos avisos, y cada aviso trae los números y la regla que lo disparó (el «¿Por qué?»),
// para que quien lo lea pueda discutir el criterio. Los umbrales son reglas de negocio de Felipe: están todos aquí, con nombre.

import { soles } from "./compras-reglas";
import { diasEntreFechas } from "./fechas-lima";
import { margenDe, pct, totalesDePrendas, type PrendaDeProveedor } from "./proveedor-prendas-reglas";

/** Una prenda que llegó hace menos que esto no se juzga: «sin vender» puede ser solo que llegó ayer. */
export const DIAS_PARA_JUZGAR = 21;
/** Plata parada mínima para avisar (por debajo no vale la pena un aviso). */
export const PLATA_PARADA_MIN = 1000;
/** Desde qué parte de lo gastado, parada, se dice «frénate». */
export const PARADO_PCT = 40;
/** Cuántos puntos de margen por debajo del promedio de la cartera para avisar. */
export const PUNTOS_MARGEN_BAJO = 7;
/** Unidades vendidas mínimas para juzgar a un proveedor (con menos, dos ventas no son una tendencia). */
export const MIN_VENDIDAS = 10;
/** Cuánto de lo comprado debe estar vendido para decir «vuelve a comprarle». */
export const VENDIDO_BUENO_PCT = 60;
/** Semanas de stock desde las que se avisa «a este ritmo tardas mucho». */
export const SEMANAS_STOCK_LARGO = 26;
/** Peso de un proveedor en el gasto total desde el que se avisa dependencia. */
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

export type PrendaConProveedor = PrendaDeProveedor & { proveedorId: string; proveedorNombre: string };

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

const plataEnEstantes = (p: PrendaDeProveedor) => Math.min(p.stockActual, p.unidadesCompradas) * (p.costoPromedio ?? 0);

/** Lo que se ve dentro de la ficha de UN proveedor. */
export function hallazgosDeProveedor(prendas: readonly PrendaDeProveedor[], hoy: string): Hallazgo[] {
  const out: Hallazgo[] = [];
  const t = totalesDePrendas(prendas);

  // 1. Prendas que llevan semanas sin venderse.
  const paradas = sinVenderViejas(prendas, hoy).sort((a, b) => plataEnEstantes(b) - plataEnEstantes(a));
  const plataParada = paradas.reduce((a, p) => a + plataEnEstantes(p), 0);
  if (plataParada >= PLATA_PARADA_MIN) {
    out.push({
      id: "paradas",
      tono: "atencion",
      titulo: `${num(paradas.length)} ${paradas.length === 1 ? "prenda lleva" : "prendas llevan"} más de ${DIAS_PARA_JUZGAR / 7} semanas sin venderse: ${soles(plataParada)} parados`,
      texto: "Antes de volver a comprarle, mira cuáles no rotan: puede ser el modelo, el precio o dónde está exhibida.",
      numeros: paradas.slice(0, 5).map((p) => `${p.referencia}: ${num(Math.min(p.stockActual, p.unidadesCompradas))} sin vender, ${soles(plataEnEstantes(p))} al costo`),
      regla: `Prendas con 0 ventas y al menos ${DIAS_PARA_JUZGAR} días en la tienda; avisa desde ${soles(PLATA_PARADA_MIN)} parados.`,
      prioridad: 80 + Math.min(15, plataParada / 1000),
    });
  }

  // 2. Se vendió por debajo del costo.
  const aPerdida = prendas.filter((p) => p.ingresoVendido > 0 && p.ingresoVendido < p.costoVendido).sort((a, b) => a.ingresoVendido - a.costoVendido - (b.ingresoVendido - b.costoVendido));
  if (aPerdida.length > 0) {
    const perdida = aPerdida.reduce((a, p) => a + (p.costoVendido - p.ingresoVendido), 0);
    out.push({
      id: "a-perdida",
      tono: "atencion",
      titulo: `${num(aPerdida.length)} ${aPerdida.length === 1 ? "prenda se vendió" : "prendas se vendieron"} por debajo de su costo (${soles(perdida)} de pérdida)`,
      texto: "Revisa si fue un descuento o si el precio de lista quedó bajo lo que costó.",
      numeros: aPerdida.slice(0, 5).map((p) => `${p.referencia}: cobraste ${soles(p.ingresoVendido)} por algo que costó ${soles(p.costoVendido)}`),
      regla: "Lo cobrado en esa prenda es menor que lo que costaron las unidades vendidas.",
      prioridad: 90,
    });
  }

  // 3. A este ritmo, cuánto tardas en vender lo que queda.
  const semanas = semanasDesde(
    prendas.map((p) => p.primeraEntrada).filter((d): d is string => !!d).sort()[0] ?? null,
    hoy,
  );
  const enEstantes = prendas.reduce((a, p) => a + Math.min(p.stockActual, p.unidadesCompradas), 0);
  const porSemana = t.unidadesVendidas / semanas;
  if (t.unidadesVendidas >= MIN_VENDIDAS && porSemana > 0 && enEstantes / porSemana >= SEMANAS_STOCK_LARGO) {
    const meses = enEstantes / porSemana / 4.345;
    out.push({
      id: "ritmo",
      tono: "atencion",
      titulo: `A este ritmo tardarías unos ${Math.round(meses)} meses en vender lo que le queda`,
      texto: "Vendes poco por semana comparado con lo que tienes en estantes de este proveedor: compra menos o mueve lo que hay.",
      numeros: [`${num(t.unidadesVendidas)} vendidas en ${Math.round(semanas)} semanas (${porSemana.toLocaleString("es-PE", { maximumFractionDigits: 1 })} por semana)`, `${num(enEstantes)} unidades siguen en estantes`],
      regla: `Unidades en estantes entre las vendidas por semana; avisa desde ${SEMANAS_STOCK_LARGO} semanas, con al menos ${MIN_VENDIDAS} unidades vendidas.`,
      prioridad: 70,
    });
  }

  // 4. La prenda estrella.
  const estrella = [...prendas]
    .filter((p) => p.unidadesVendidas >= 3 && (margenDe(p) ?? -1) >= 40)
    .sort((a, b) => b.unidadesVendidas - a.unidadesVendidas)[0];
  if (estrella) {
    out.push({
      id: "estrella",
      tono: "exito",
      titulo: `${estrella.referencia} es lo que mejor te rinde de este proveedor`,
      texto: "Vende y deja margen: si vas a reponer, empieza por ahí.",
      numeros: [`${num(estrella.unidadesVendidas)} vendidas de ${num(estrella.unidadesCompradas)} compradas`, `Margen de ${p0(margenDe(estrella) ?? 0)}`],
      regla: "La prenda con más unidades vendidas entre las que dejan 40 % de margen o más (mínimo 3 vendidas).",
      prioridad: 40,
    });
  }

  return out.sort((a, b) => b.prioridad - a.prioridad);
}

type Resumen = ReturnType<typeof totalesDePrendas> & { proveedorId: string; nombre: string; plataParada: number; prendasParadas: number };

/** Lo que se ve en la lista: compara a los proveedores entre sí. */
export function hallazgosDeCartera(filas: readonly PrendaConProveedor[], hoy: string): Hallazgo[] {
  const porProveedor = new Map<string, PrendaConProveedor[]>();
  for (const f of filas) porProveedor.set(f.proveedorId, [...(porProveedor.get(f.proveedorId) ?? []), f]);
  const resumenes: Resumen[] = [...porProveedor.entries()].map(([proveedorId, ps]) => {
    const viejas = sinVenderViejas(ps, hoy);
    return { ...totalesDePrendas(ps), proveedorId, nombre: ps[0].proveedorNombre, plataParada: viejas.reduce((a, p) => a + plataEnEstantes(p), 0), prendasParadas: viejas.length };
  });
  const todo = totalesDePrendas(filas);
  const margenCartera = todo.margenPct;
  const out: Hallazgo[] = [];

  // 1. Frenar: mucha plata parada.
  for (const r of resumenes.filter((x) => x.plataParada >= PLATA_PARADA_MIN && (pct(x.plataParada, x.gasto) ?? 0) >= PARADO_PCT).sort((a, b) => b.plataParada - a.plataParada).slice(0, 2)) {
    out.push({
      id: `frenar-${r.proveedorId}`,
      proveedorId: r.proveedorId,
      tono: "atencion",
      titulo: `${r.nombre}: ${soles(r.plataParada)} parados. Antes de comprarle más, mueve lo que tienes`,
      texto: `Compraste ${num(r.unidadesCompradas)} prendas y vendiste ${num(r.unidadesVendidas)}. ${num(r.prendasParadas)} ${r.prendasParadas === 1 ? "prenda" : "prendas"} no ${r.prendasParadas === 1 ? "ha vendido" : "han vendido"} ni una unidad.`,
      numeros: [`Gastaste ${soles(r.gasto)}`, `Parados (prendas sin ventas, con más de ${DIAS_PARA_JUZGAR} días): ${soles(r.plataParada)} = ${p0(pct(r.plataParada, r.gasto) ?? 0)} de lo gastado`],
      regla: `Se avisa si lo parado pasa de ${soles(PLATA_PARADA_MIN)} y es ${PARADO_PCT} % o más de lo gastado con ese proveedor.`,
      prioridad: 85 + Math.min(10, r.plataParada / 1000),
    });
  }

  // 2. Margen bajo frente al promedio.
  if (margenCartera != null) {
    for (const r of resumenes.filter((x) => x.unidadesVendidas >= MIN_VENDIDAS && x.margenPct != null && x.margenPct <= margenCartera - PUNTOS_MARGEN_BAJO).sort((a, b) => (a.margenPct ?? 0) - (b.margenPct ?? 0)).slice(0, 2)) {
      out.push({
        id: `margen-${r.proveedorId}`,
        proveedorId: r.proveedorId,
        tono: "atencion",
        titulo: `${r.nombre} te deja ${p0(r.margenPct ?? 0)} de margen, el promedio es ${p0(margenCartera)}`,
        texto: "Pídele mejor costo o sube el precio de venta de sus prendas.",
        numeros: [`Margen de ${r.nombre}: ${p0(r.margenPct ?? 0)} sobre ${num(r.unidadesVendidas)} unidades vendidas`, `Margen de todos tus proveedores: ${p0(margenCartera)}`],
        regla: `Se avisa si, con ${MIN_VENDIDAS} unidades vendidas o más, el margen queda ${PUNTOS_MARGEN_BAJO} puntos o más por debajo del promedio.`,
        prioridad: 75,
      });
    }
  }

  // 3. Vuelve a comprarle.
  for (const r of resumenes
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
      regla: `Con ${MIN_VENDIDAS} unidades vendidas o más, ${VENDIDO_BUENO_PCT} % o más de lo comprado ya vendido y margen igual o mayor al promedio.`,
      prioridad: 50,
    });
  }

  // 4. Dependencia de un solo proveedor.
  const gastoTotal = todo.gasto;
  const mayor = [...resumenes].sort((a, b) => b.gasto - a.gasto)[0];
  if (mayor && resumenes.length >= 2 && (pct(mayor.gasto, gastoTotal) ?? 0) >= DEPENDENCIA_PCT) {
    out.push({
      id: "dependencia",
      proveedorId: mayor.proveedorId,
      tono: "info",
      titulo: `${p0(pct(mayor.gasto, gastoTotal) ?? 0)} de lo que gastas va a ${mayor.nombre}`,
      texto: "Si te falla, queda poco con qué reemplazarlo. Conviene tener otro proveedor probado.",
      numeros: [`${soles(mayor.gasto)} de ${soles(gastoTotal)} gastados`],
      regla: `Un solo proveedor con ${DEPENDENCIA_PCT} % o más de todo lo gastado.`,
      prioridad: 45,
    });
  }

  return out.sort((a, b) => b.prioridad - a.prioridad).slice(0, MAX_AVISOS);
}
