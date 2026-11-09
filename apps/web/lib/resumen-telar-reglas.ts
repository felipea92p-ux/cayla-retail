import { empezoAContar, mesAntesDelCorte } from "./finanzas-arranque-reglas";
import { porSedeDe, tramosDelOrillo, type SedeTelar, type TramoOrillo } from "./finanzas-telar-reglas";
import { soles } from "./flujo-caja-reglas";
import { vendidoConIgv } from "./igv-ventas-reglas";
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
 * del mes pasado (del 1 al mismo día; si el mes ya cerró, el mes pasado entero, `enCurso = false`): con él va el chip «S/ 1,200 más
 * que septiembre a esta fecha»; sin él, no se inventa. `provisional`
 * (la confianza del número es baja, ADR-0417): el chip lo dice, como en la respuesta del Pulso.
 */
export function respuestaResumen(
  r: ResumenFinanzas,
  anterior: readonly FilaER[] | null,
  provisional: boolean,
  enCurso = true,
  antesDeSueldos = false,
  inicioFinanzas: string | null = null,
): RespuestaResumen {
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
  // Un mes anterior al inicio de Finanzas (ADR-0332) sale vacío porque no se mide, no porque no haya tenido movimientos.
  if (!f) return { pregunta, valor: null, chips: [], motivo: inicioFinanzas && mesAntesDelCorte(r.mes, inicioFinanzas) ? `${empezoAContar(inicioFinanzas)}: este mes no se mide.` : "No hay movimientos de este mes para lo que miras." };

  const chips: RespuestaResumen["chips"] = [];
  if (provisional) chips.push({ texto: "Provisional: falta registrar cosas", tono: "pizarra" });
  if (!vende) {
    chips.push({ texto: "No vende: se sostiene con lo que dejan las tiendas", tono: "pizarra" });
    return { pregunta, valor: Math.max(0, -f.resultado), chips };
  }
  if (f.resultado < 0) chips.push({ texto: enCurso ? "Este mes vas perdiendo plata" : "Este mes perdió plata", tono: "ambar" });
  const antes = anterior ? filaDeVer(anterior, r.ver) : undefined;
  if (antes) {
    const dif = Math.round((antesDeSueldos ? sinSueldos(f) : f).resultado - antes.resultado);
    const contra = `${mesNombre(r.mesAnterior)}${enCurso ? " a esta fecha" : ""}${antesDeSueldos ? ", antes de sueldos" : ""}`;
    if (Math.abs(dif) >= 1) chips.push({ texto: `${soles(Math.abs(dif))} ${dif > 0 ? "más" : "menos"} que ${contra}`, tono: dif > 0 ? "verde" : "ambar" });
    else chips.push({ texto: `Igual que ${contra}`, tono: "pizarra" });
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

export type VendidoDeSedes = {
  tramos: TramoOrillo[];
  total: number;
  /** La frase bajo el título: la cifra y qué lleva adentro. */
  frase: string;
  /** Lo que dice el enlace a «De Ventas a Finanzas». */
  enlace: string;
};

/**
 * Lo que pone cada sede en «Vendido por sede» del Resumen: todo lo vendido en la tienda con IGV, también lo de CLAURE (Felipe 2026-11-09), o una sede que solo vendió CLAURE desaparecería. El
 * porcentaje de cada tramo sale de lo mismo que su monto, pero sin IGV (ADR-0624): quitar el IGV no cambia la proporción de una sede, quitar lo de CLAURE sí. Sin la lectura del IGV, los montos
 * quedan sin IGV ni CLAURE y la frase lo dice. El Taller y la Empresa no venden: no tienen tramo.
 */
export function vendidoPorSede(filas: readonly FilaER[], sedes: readonly SedeTelar[], mes: string): VendidoDeSedes {
  const tiendas = filas.filter((f) => f.unidad === "tienda");
  const conIgv = filas.length > 0 && filas.every((f) => vendidoConIgv(f) !== null);
  const mapa = (de: (f: FilaER) => number) => porSedeDe(tiendas.map((f) => ({ ubicacionId: f.ubicacionId, monto: de(f) })));
  const pctDe = new Map(tramosDelOrillo(mapa((f) => f.ventas + (conIgv ? (f.claureSinIgv ?? 0) : 0)), sedes).map((t) => [t.clave, t.pct]));
  const tramos = tramosDelOrillo(mapa((f) => (conIgv ? vendidoConIgv(f)! : f.ventas)), sedes)
    .filter((t) => t.monto > 0)
    .map((t) => ({ ...t, pct: pctDe.get(t.clave) ?? 0 }));
  const total = Math.round(tramos.reduce((a, t) => a + t.monto, 0) * 100) / 100;
  if (!conIgv) return { tramos, total, frase: `${soles(total)} en ${mes}, sin IGV ni CLAURE.`, enlace: "Por qué no es la cifra de Ventas" };
  const hayClaure = tiendas.some((f) => Math.abs(f.claureSinIgv ?? 0) >= 0.005);
  return { tramos, total, frase: `${soles(total)} en ${mes}, con IGV${hayClaure ? " y con lo de CLAURE" : ""}. Si no es igual a Ventas, es por lo devuelto, anulado o cambiado.`, enlace: "Ver la cuenta" };
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

// ---- El dock ------------------------------------------------------------------------------------------------------------------

type AccionDockResumen = { clave: "pagar" | "igv" | "cierre" | "reportes"; texto: string; tecla: string; ruta: string; principal: boolean };

const DOCK_RESUMEN: readonly (Omit<AccionDockResumen, "principal"> & { modulo: string })[] = [
  { clave: "pagar", texto: "Pagar facturas", tecla: "p", ruta: "/finanzas/dinero/por-pagar", modulo: "cuentas_dinero" },
  { clave: "igv", texto: "IGV del mes", tecla: "i", ruta: "/finanzas/impuestos", modulo: "impuestos" },
  { clave: "cierre", texto: "Cierre de mes", tecla: "m", ruta: "/finanzas/cierre", modulo: "cierre_mes" },
  { clave: "reportes", texto: "Estados financieros", tecla: "r", ruta: "/finanzas/reportes", modulo: "reportes_financieros" },
];

/**
 * Los atajos del Resumen que la cuenta puede abrir (tarea 178): sin el módulo, el atajo llevaría a «Sin acceso». Se pregunta por los módulos, no por `acceso.lider` (en esta pantalla
 * significa «ve todo», y también es cierto en CAYLA Global). La primera que queda es la principal: un dock no se queda sin ella.
 */
export function dockDelResumen(modulos: readonly string[]): AccionDockResumen[] {
  return DOCK_RESUMEN.filter((a) => modulos.includes(a.modulo)).map((a, i) => ({ clave: a.clave, texto: a.texto, tecla: a.tecla, ruta: a.ruta, principal: i === 0 }));
}

// ---- El mes que se mira (el `?mes=` de la barra) ------------------------------------------------------------------------------

/** Del 1 del mes elegido a hoy (si es el mes en curso) o a su último día (si ya pasó). `null` si el mes todavía no llega. */
export function tramoDelMes(mes: string, hoy: string): { desde: string; hasta: string } | null {
  if (mes > hoy.slice(0, 7)) return null;
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const ultimo = `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
  return { desde: `${mes}-01`, hasta: mes === hoy.slice(0, 7) ? hoy : ultimo };
}

/** La misma columna sin sueldos: los saca de la planilla, de los gastos, de su línea 62 y de lo que deja. */
function sinSueldos(f: FilaER): FilaER {
  if (!f.planilla) return f;
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const detalleGastos = f.detalleGastos
    .map((d) => (d.cuenta === "62" ? { ...d, monto: r2(d.monto - f.planilla) } : d))
    .filter((d) => d.cuenta !== "62" || Math.abs(d.monto) >= 0.005);
  return { ...f, planilla: 0, planillaEstimada: 0, gastos: r2(f.gastos - f.planilla), resultado: r2(f.resultado + f.planilla), detalleGastos };
}

/**
 * Con qué se compara el mes, sobre una base común. Dynamic paga el día 28: del 1 al 27 este mes ya lleva sueldos devengados y el mismo tramo del
 * mes pasado todavía no (ADR-0453). Comparar así mostraría una caída que es solo esa diferencia, y descartar la comparación se leía como un error
 * que no ocurrió (tarea 25 de «Las 36»). Sin base común se comparan los dos ANTES de sueldos, y se dice. `null` en `antes` es una falla de lectura.
 */
export function comparacionMesPasado(
  ahora: readonly FilaER[],
  antes: readonly FilaER[] | null,
): { ahora: readonly FilaER[]; antes: readonly FilaER[] | null; antesDeSueldos: boolean } {
  if (!antes) return { ahora, antes: null, antesDeSueldos: false };
  const llevaSueldos = (fs: readonly FilaER[]) => fs.some((f) => f.planilla > 0);
  if (llevaSueldos(ahora) === llevaSueldos(antes)) return { ahora, antes, antesDeSueldos: false };
  return { ahora: ahora.map(sinSueldos), antes: antes.map(sinSueldos), antesDeSueldos: true };
}

/** El mes anterior a «AAAA-MM». */
export function mesAnteriorDe(mes: string): string {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * Con qué se compara la respuesta: en el mes en curso, el mes pasado del 1 al mismo día; en un mes que ya cerró, el mes pasado
 * entero (mes completo contra mes completo).
 */
export function tramoDeComparacion(mes: string, hoy: string): { desde: string; hasta: string } {
  const ant = mesAnteriorDe(mes);
  if (mes === hoy.slice(0, 7)) return tramoAnteriorALaFecha(hoy, ant);
  return tramoDelMes(ant, hoy)!;
}

/** Las tiendas cuyo ritmo de ventas entra a la línea: todas las que se ven, o la elegida. El Taller y la Empresa no venden. */
export function tiendasDeLaLinea(r: ResumenFinanzas): string[] {
  if (r.ver.todas) return r.unidades.filter((u) => u.tipo === "tienda").map((u) => u.id);
  return r.ver.tipo === "tienda" && r.ver.ubicacionId ? [r.ver.ubicacionId] : [];
}

/**
 * Las tiendas de la línea ANTES de que responda la base (ADR-0583): lo que pide la URL sobre las tiendas activas que la cuenta lee (en orden de
 * nombre, como `unidades`). Sirve para pedir las series de ventas a la vez que el resumen, sin esperarlo. Es una apuesta: la pantalla la compara
 * con `tiendasDeLaLinea` y, si la base resolvió otra cosa (una cuenta que solo ve su sede, una sede que ya no está activa), las vuelve a pedir.
 */
export function tiendasAdivinadas(pedido: { clave: string; ubicacionId: string | null; soloEmpresa: boolean }, propia: string | null, tiendas: readonly string[]): string[] {
  if (pedido.soloEmpresa) return [];
  const una = pedido.clave === "propia" ? propia : pedido.ubicacionId;
  if (pedido.clave === "propia" || una) return una && tiendas.includes(una) ? [una] : [];
  return [...tiendas];
}

/** ¿La apuesta acertó? Mismas tiendas y en el mismo orden (las series se leen en ese orden). */
export const mismasTiendas = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((id, i) => id === b[i]);

/** La meta de ventas del mes del presupuesto, de lo que se mira, SIN IGV (`fn_presupuesto_vs_real` ya la da así; la de Ganancias es la misma). `null` si no hay. */
export function metaVentasPresupuesto(r: ResumenFinanzas): number | null {
  if (r.presupuesto.estado !== "ok") return null;
  const ventas = r.presupuesto.datos.filter((f) => f.linea === "ventas");
  const fila = r.ver.todas ? ventas.find((f) => f.unidad === "consolidado") : ventas.find((f) => f.ubicacionId === r.ver.ubicacionId);
  return fila?.presupuesto ?? null;
}
