import { soles } from "./flujo-caja-reglas";
import { mesNombre, puntoDeEquilibrio, type FilaER } from "./resultados-reglas";
import { filaDeVer, motivoSinEquilibrio, type ResumenFinanzas } from "./resumen-finanzas-reglas";
import { lineaVentasMeta, metaVentasPresupuesto, type DiaVenta } from "./resumen-telar-reglas";

// Finanzas ▸ Resumen, «¿Ya pagaste el mes?» (Felipe 2026-10-24, spike 4). Lógica pura: cuánto hay que vender en el mes para cubrir TODOS sus
// gastos (el punto de equilibrio de F5: gastos ÷ margen %), cuánto va vendido, desde qué día se cubrió y qué pasa con lo que falta.
// Reemplaza a «ventas contra la meta»: la meta es del área comercial (Rendimiento) y se queda como una marca en el camino; lo que Finanzas
// tiene que decir es desde qué día lo vendido ya paga el mes.
//
// UNIDADES. El Estado de resultados cuenta SIN IGV; la venta por día y la meta de Caja, CON IGV. Para no comparar peras con manzanas, lo de
// Caja se convierte con la proporción del propio período (ventas del Estado de resultados ÷ ventas del día a día); sin día a día, se usa
// la tasa del 18 %. Todo lo que se dice aquí va sin IGV.
//
// MIENTE SI FALTAN GASTOS. Un equilibrio calculado sin los gastos registrados sale bajísimo y la tienda parece sana. `motivoSinEquilibrio`
// lo corta de raíz cuando no hay NINGÚN gasto; con gastos a medias no se puede saber, y por eso la pieza lleva «Provisional» cuando la
// confianza del número es baja.

const TASA_IGV = 1.18;
const r2 = (n: number) => Math.round(n * 100) / 100;

export type EstadoEquilibrio = "cubierto" | "en_camino" | "no_llega";

export type EquilibrioMes =
  | { tipo: "no_vende"; motivo: string }
  | { tipo: "sin_calculo"; motivo: string }
  | {
      tipo: "ok";
      estado: EstadoEquilibrio;
      /** Lo vendido en el mes a la fecha (sin IGV) y lo que hay que vender para pagarlo todo. */
      vendido: number;
      pe: number;
      /** La meta de ventas del MES del presupuesto, en las mismas unidades (sin IGV); `null` si no hay. La meta por día de cada sede no
       *  entra: solo cubre hasta hoy (`fn_rendimiento_serie` termina en hoy), no es la del mes, y esa es de Rendimiento. */
      meta: number | null;
      /** El día del mes en que lo vendido llegó a `pe` (con la venta día a día real); `null` si no se sabe o todavía no. */
      diaCubierto: number | null;
      /** Si sigue al ritmo de lo que va del mes: el día en que lo cubriría, o `null` si no llega este mes. */
      diaLlegada: number | null;
      ritmoPorDia: number;
      /** Cuánto cerraría vendiendo así todo el mes (sin IGV). */
      cierre: number;
      /** Cuántos soles de cada 100 vendidos quedan después de la ropa y las comisiones (el margen). */
      margenPor100: number;
      /** El largo del camino: lo mayor entre lo vendido, el equilibrio y la meta, con un poco de aire. */
      tope: number;
      titular: string;
      detalle: string;
    };

/** Cuántos días del mes hay y cuántos van (el mes en curso hasta hoy; un mes cerrado, todos). */
function diasDelMes(mes: string, hoy: string): { total: number; van: number } {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const total = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return { total, van: hoy.slice(0, 7) === mes ? Number(hoy.slice(8, 10)) : total };
}

export function equilibrioMes(o: {
  r: ResumenFinanzas;
  /** Las filas del Estado de resultados del mes que se mira. */
  filas: readonly FilaER[];
  ventasPorDia: { series: readonly (readonly DiaVenta[])[]; incompleta: boolean } | null;
  hoy: string;
  mes: string;
  enCurso: boolean;
}): EquilibrioMes {
  const { r, filas, ventasPorDia, hoy, mes, enCurso } = o;
  if (!(r.ver.todas || r.ver.tipo === "tienda"))
    return { tipo: "no_vende", motivo: r.ver.tipo === "taller" ? "El Taller no vende: no hay equilibrio que calcular. Se paga con lo que dejan las tiendas." : "La empresa no vende: no hay equilibrio que calcular. Se paga con lo que dejan las tiendas." };

  const f = filaDeVer(filas, r.ver);
  if (!f) return { tipo: "sin_calculo", motivo: "No hay movimientos de este mes para lo que miras." };
  const motivo = motivoSinEquilibrio(f);
  if (motivo === "sin_ventas") return { tipo: "sin_calculo", motivo: "Todavía no hay ventas este mes, así que no hay con qué calcularlo." };
  if (motivo === "sin_margen") return { tipo: "sin_calculo", motivo: "Este mes lo que se vende no deja margen: vender más no paga los gastos. Revisa el costo de las prendas." };
  if (motivo === "sin_gastos")
    return { tipo: "sin_calculo", motivo: "Todavía no hay gastos registrados (sueldos, alquileres…): sin ellos no se sabe cuánto hay que vender para pagar el mes. Cárgalos en Gastos." };
  const eq = puntoDeEquilibrio(f);
  if (!eq) return { tipo: "sin_calculo", motivo: "No se pudo calcular cuánto hay que vender para pagar el mes." };

  const { total: diasMes, van } = diasDelMes(mes, hoy);
  const dia = lineaVentasMeta(ventasPorDia?.series ?? [], mes, hoy, enCurso ? metaVentasPresupuesto(r) : null);
  // De «con IGV» (Caja) a «sin IGV» (Estado de resultados), con la proporción del propio período.
  const k = dia.vendido > 0 && !ventasPorDia?.incompleta ? f.ventas / dia.vendido : 1 / TASA_IGV;
  const pe = eq.ventas;
  const vendido = r2(f.ventas);
  const meta = dia.origenMeta === "presupuesto" && dia.meta !== null ? r2(dia.meta * k) : null;

  const diaCubierto = vendido >= pe && !ventasPorDia?.incompleta ? (dia.serie.find((p) => p.y * k >= pe)?.x ?? null) : null;
  const ritmoPorDia = r2(vendido / Math.max(van, 1));
  const cierre = r2(ritmoPorDia * diasMes);
  const diaLlegada = vendido >= pe ? null : ritmoPorDia > 0 && cierre >= pe ? Math.min(diasMes, Math.ceil(pe / ritmoPorDia - 1e-9)) : null;
  const estado: EstadoEquilibrio = vendido >= pe ? "cubierto" : diaLlegada !== null ? "en_camino" : "no_llega";
  const margenPor100 = Math.round((f.margen / f.ventas) * 100);
  const nombreMes = mesNombre(mes);

  let titular: string;
  let detalle: string;
  if (estado === "cubierto") {
    titular = diaCubierto
      ? `${enCurso ? "El día" : "Desde el día"} ${diaCubierto} ya ${enCurso ? "habías" : "se había"} pagado todo lo de ${nombreMes}.`
      : `Ya pagaste todo lo de ${nombreMes}: llevas ${soles(vendido)} y hacían falta ${soles(pe)}.`;
    detalle = `Desde ahí, cada S/\u00a0100 que vendes te dejan S/\u00a0${margenPor100}.`;
  } else if (estado === "en_camino") {
    titular = `Te faltan ${soles(pe - vendido)} vendidos para pagar todo lo de ${nombreMes}.`;
    detalle = `Con lo que vendes al día (${soles(ritmoPorDia)}), lo pagas el día ${diaLlegada}.`;
  } else {
    titular = enCurso ? `A este ritmo no alcanzas a pagar todo lo de ${nombreMes}.` : `${mayuscula(nombreMes)} no alcanzó a pagar todo lo suyo.`;
    detalle = enCurso
      ? `Cerrarías con ${soles(cierre)} y hacen falta ${soles(pe)}: te faltarían ${soles(pe - cierre)}.`
      : `Se vendió ${soles(vendido)} y hacían falta ${soles(pe)}: faltaron ${soles(pe - vendido)}.`;
  }
  const tope = Math.max(vendido, pe, meta ?? 0) * 1.08;
  return { tipo: "ok", estado, vendido, pe, meta, diaCubierto, diaLlegada, ritmoPorDia, cierre, margenPor100, tope, titular, detalle };
}

const mayuscula = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
