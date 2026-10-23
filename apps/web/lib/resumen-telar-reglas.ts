import { soles } from "./flujo-caja-reglas";
import { mesNombre, type FilaER } from "./resultados-reglas";
import { filaDeVer, type ResumenFinanzas } from "./resumen-finanzas-reglas";

// Finanzas ▸ Resumen en El telar (Felipe 2026-10-23): lo que el Resumen le pasa a la barra común —su respuesta para la cabecera
// (`<RespuestaTelar>`) y lo que pone cada sede en el orillo (`<Orillo>`)— y la línea de ventas contra la meta. Lógica pura; la página
// solo lee y entrega. «Te toca» no lleva pendientes propios del Resumen: los avisos del Resumen son de otros submódulos (Por pagar,
// Gastos, Cierre…) y cada uno los aporta al cajón común, así que «Hoy te toca» del Resumen muestra los primeros de ese cajón.

export type TonoRespuesta = "verde" | "ambar" | "rojo" | "pizarra";
export type RespuestaResumen = { pregunta: string; valor: number | null; chips: { texto: string; tono: TonoRespuesta }[]; motivo?: string };

/** «el Taller» / «la empresa» / «Lima»: lo que se mira, dentro de una pregunta. */
function quien(r: ResumenFinanzas): string {
  if (r.ver.tipo === "taller") return "el Taller";
  if (r.ver.soloEmpresa) return "la empresa";
  return r.ver.nombre.replace(/^Tienda\s+/i, "");
}

/**
 * La pregunta del Resumen y su cifra. CAYLA o una tienda: «¿Cuánto te deja octubre?» con lo que queda a la fecha (negativo = pérdida,
 * y lo dice un chip). El Taller o la empresa: «¿Cuánto cuesta el Taller en octubre?», porque no venden. `anterior` es el mismo tramo
 * del mes pasado (del 1 al mismo día): con él va el chip «+S/ 1,200 que septiembre a esta fecha»; sin él, no se inventa. `provisional`
 * (la confianza del número es baja, ADR-0417): el chip lo dice, como en la respuesta del Pulso.
 */
export function respuestaResumen(r: ResumenFinanzas, anterior: readonly FilaER[] | null, provisional: boolean): RespuestaResumen {
  const mes = mesNombre(r.mes);
  const vende = r.ver.todas || r.ver.tipo === "tienda";
  const pregunta = vende
    ? r.ver.todas
      ? `¿Cuánto te deja ${mes}?`
      : `¿Cuánto te deja ${quien(r)} en ${mes}?`
    : `¿Cuánto cuesta ${quien(r)} en ${mes}?`;
  if (r.resultadosMes.estado !== "ok") {
    const motivo = r.resultadosMes.estado === "no_aplica" ? "Finanzas todavía no cuenta este mes." : r.resultadosMes.mensaje;
    return { pregunta, valor: null, chips: [], motivo };
  }
  const f = filaDeVer(r.resultadosMes.datos, r.ver);
  if (!f) return { pregunta, valor: null, chips: [], motivo: "No hay movimientos de este mes para lo que miras." };

  const chips: RespuestaResumen["chips"] = [];
  if (provisional) chips.push({ texto: "Provisional: falta registrar cosas", tono: "pizarra" });
  if (!vende) {
    chips.push({ texto: "No vende: se sostiene con lo que dejan las tiendas", tono: "pizarra" });
    return { pregunta, valor: Math.max(0, -f.resultado), chips };
  }
  if (f.resultado < 0) chips.push({ texto: "Este mes vas perdiendo plata", tono: "ambar" });
  const antes = anterior ? filaDeVer(anterior, r.ver) : undefined;
  if (antes) {
    const dif = Math.round(f.resultado - antes.resultado);
    const mesAnt = mesNombre(r.mesAnterior);
    if (Math.abs(dif) >= 1) chips.push({ texto: `${dif > 0 ? "+" : "−"}${soles(Math.abs(dif))} que ${mesAnt} a esta fecha`, tono: dif > 0 ? "verde" : "ambar" });
    else chips.push({ texto: `Igual que ${mesAnt} a esta fecha`, tono: "pizarra" });
  }
  return { pregunta, valor: f.resultado, chips };
}

/** El tramo del mes pasado con el que se compara: del 1 al mismo día de hoy (o a su último día, si el mes pasado es más corto). */
export function tramoAnteriorALaFecha(hoy: string, mesAnterior: string): { desde: string; hasta: string } {
  const [a, m] = mesAnterior.split("-").map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const dia = Math.min(Number(hoy.slice(8, 10)), ultimo);
  return { desde: `${mesAnterior}-01`, hasta: `${mesAnterior}-${String(dia).padStart(2, "0")}` };
}

/** Lo que pone cada sede en el orillo del Resumen: lo VENDIDO (sin IGV). El Taller y la Empresa no venden: no tienen tramo. */
export function vendidoPorSede(filas: readonly FilaER[]): { ubicacionId: string | null; monto: number }[] {
  return filas.filter((f) => f.unidad === "tienda" && f.ventas > 0).map((f) => ({ ubicacionId: f.ubicacionId, monto: f.ventas }));
}

// ---- La línea de ventas contra la meta ------------------------------------------------------------------------------------------

/** Un día de una tienda (`fn_rendimiento_serie`): lo vendido con IGV y la meta de la sede ese día (`null` si no tiene). */
export type DiaVenta = { fecha: string; total: number; metaSede: number | null };

export type LineaVentas = {
  /** Lo vendido acumulado, día por día hasta hoy: [día del mes, soles]. */
  serie: { x: number; y: number }[];
  /** La meta acumulada del mes (de la sede o, si no hay, la del presupuesto en línea recta); `null` si no hay meta. */
  referencia: { x: number; y: number }[] | null;
  vendido: number;
  meta: number | null;
  /** De dónde salió la meta, para decirlo bajo el gráfico. */
  origenMeta: "sedes" | "presupuesto" | null;
  diasMes: number;
};

/**
 * Suma las series de las tiendas que se miran y arma la línea del mes. La meta sale de las metas por día de cada sede (la misma de
 * Caja e Inicio); si ninguna tiene meta —o la cuenta no ve Rendimiento y no hay series—, de la meta de ventas del presupuesto
 * repartida parejo en el mes (Felipe, 2026-10-23); si tampoco hay, sin referencia.
 */
export function lineaVentasMeta(series: readonly (readonly DiaVenta[])[], mes: string, hoy: string, metaPresupuesto: number | null): LineaVentas {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const diasMes = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const hastaDia = hoy.slice(0, 7) === mes ? Number(hoy.slice(8, 10)) : hoy < mes ? 0 : diasMes;
  const vendidoDia = new Array<number>(diasMes + 1).fill(0);
  const metaDia = new Array<number>(diasMes + 1).fill(0);
  let hayMetaSede = false;
  for (const s of series)
    for (const d of s) {
      if (d.fecha.slice(0, 7) !== mes) continue;
      const dia = Number(d.fecha.slice(8, 10));
      vendidoDia[dia]! += d.total;
      if (d.metaSede !== null) {
        metaDia[dia]! += d.metaSede;
        hayMetaSede = true;
      }
    }
  const serie: { x: number; y: number }[] = [];
  let acum = 0;
  for (let dia = 1; dia <= hastaDia; dia++) {
    acum += vendidoDia[dia]!;
    serie.push({ x: dia, y: Math.round(acum * 100) / 100 });
  }
  let referencia: LineaVentas["referencia"] = null;
  let meta: number | null = null;
  let origenMeta: LineaVentas["origenMeta"] = null;
  if (hayMetaSede) {
    let ac = 0;
    referencia = [{ x: 0, y: 0 }];
    for (let dia = 1; dia <= diasMes; dia++) {
      ac += metaDia[dia]!;
      referencia.push({ x: dia, y: Math.round(ac * 100) / 100 });
    }
    meta = Math.round(ac * 100) / 100;
    origenMeta = "sedes";
  } else if (metaPresupuesto !== null && metaPresupuesto > 0) {
    referencia = [
      { x: 0, y: 0 },
      { x: diasMes, y: metaPresupuesto },
    ];
    meta = metaPresupuesto;
    origenMeta = "presupuesto";
  }
  return { serie, referencia, vendido: Math.round(acum * 100) / 100, meta, origenMeta, diasMes };
}

/** La frase de la línea, en lenguaje de tienda: cuánto vas contra lo que la meta pedía a esta fecha. */
export function fraseLineaVentas(l: LineaVentas, mes: string): string {
  if (!l.serie.length) return `Todavía no hay ventas en ${mesNombre(mes)}.`;
  if (l.meta === null || !l.referencia) return `Llevas ${soles(l.vendido)} vendidos en ${mesNombre(mes)}. No hay meta puesta para comparar.`;
  const dia = l.serie.at(-1)!.x;
  const pedia = l.origenMeta === "sedes" ? (l.referencia[dia]?.y ?? 0) : (l.meta * dia) / l.diasMes;
  const dif = Math.round(l.vendido - pedia);
  const deDonde = l.origenMeta === "presupuesto" ? " (la meta del presupuesto, pareja en el mes)" : "";
  if (Math.abs(dif) < 1) return `Vas justo en la meta${deDonde}: ${soles(l.vendido)} de ${soles(l.meta)}.`;
  return dif > 0
    ? `Vas ${soles(dif)} arriba de lo que la meta pedía a esta fecha${deDonde}: ${soles(l.vendido)} de ${soles(l.meta)}.`
    : `Vas ${soles(-dif)} abajo de lo que la meta pedía a esta fecha${deDonde}: ${soles(l.vendido)} de ${soles(l.meta)}.`;
}
