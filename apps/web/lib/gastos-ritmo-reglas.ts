// Gastos · «Cuándo» como el ritmo del mes (Felipe 2026-10-30, la C2 de `docs/maquetas/gastos-cuando-2026-10/`, reemplaza al calendario
// de ADR-0493): lo gastado sumado día a día contra el mes anterior a la misma altura, hacia dónde va si sigue así (con los fijos que
// faltan registrar) y los saltos grandes con su nombre. Lógica pura, probada en `gastos-ritmo-reglas.test.ts`: los gastos salen de
// `fn_gastos_lista` (este mes y el anterior) y los fijos de `fn_gastos_fijos_mes`; aquí no se lee nada.
import { nombreCortoSede, SEDE_EMPRESA, type ClaveSede } from "./finanzas-telar-reglas";
import { solesRedondo, textoMes, type GastoFijoMes } from "./gastos-reglas";

export type GastoParaRitmo = {
  id: string;
  fecha: string;
  montoTotal: number;
  estado: "vigente" | "anulado";
  categoria: string;
  categoriaNombre: string;
  descripcion: string;
  proveedorNombre: string | null;
  ubicacionId: string | null;
  ubicacionNombre: string | null;
};

export type FijoParaRitmo = Pick<
  GastoFijoMes,
  "id" | "estado" | "fechaEsperada" | "monto" | "montoVariable" | "gastoId" | "descripcion" | "categoriaNombre" | "ubicacionId" | "ubicacionNombre"
>;

export type PuntoRitmo = { x: number; y: number };

/** Un salto grande con su nombre: los gastos grandes de una categoría en días cercanos van juntos («Alquileres · 3 al 5 oct»). */
export type SaltoRitmo = {
  /** El día donde se marca: el último del tramo, cuando la línea ya subió. */
  dia: number;
  desde: number;
  hasta: number;
  categoria: string;
  /** «Alquileres · 3 al 5 oct», «Alquiler · Trujillo»: si cabe. */
  largo: string;
  /** «Alquileres»: si no cabe el largo. */
  corto: string;
  /** Todo lo de esa categoría en esos días, también lo chico. */
  monto: number;
};

/** Lo que falta pagar en un día que no llega (o que se atrasó: se cuenta mañana), puesto sobre el «si sigue así». */
export type VieneRitmo = { dia: number; y: number; monto: number; fijos: FijoParaRitmo[] };

export type RitmoDelMes = {
  dias: number;
  /** El último día que ya pasó: hoy en el mes en curso, el último en uno cerrado, 0 en uno que no empieza. */
  hasta: number;
  enCurso: boolean;
  aHoy: number;
  /** Lo gastado sumado, del día 1 a `hasta`. */
  serie: PuntoRitmo[];
  /** El mes anterior sumado por día del mes (hasta donde llegue este); `null` si no se puede comparar. */
  referencia: PuntoRitmo[] | null;
  anteriorAEstaAltura: number | null;
  cierreAnterior: number | null;
  /** Desde hoy hasta el fin de mes; `null` en un mes cerrado o si hoy es el último día. */
  proyeccion: PuntoRitmo[] | null;
  cierreProyectado: number | null;
  /** Lo de un día normal: lo gastado sin los fijos ni los saltos, repartido en los días que pasaron. */
  ritmoDiario: number | null;
  vienen: VieneRitmo[];
  saltos: SaltoRitmo[];
};

/** Un salto empieza en el 6 % de lo más alto del mes (lo de este o el cierre del anterior): el alquiler sí, la bolsa de papel no. */
const UMBRAL_SALTO = 0.06;
const MAX_SALTOS = 3;
/** «Casi lo mismo» que el mes anterior: menos del 2 % de diferencia (como en los hilos). */
const MOVIMIENTO_MINIMO = 0.02;

export function diasDelMes(mes: string): number {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(a, m, 0)).getUTCDate();
}

const mesDe = (fecha: string) => fecha.slice(0, 7);
const diaDe = (fecha: string) => Number(fecha.slice(8, 10));
const vigentes = <T extends Pick<GastoParaRitmo, "estado" | "montoTotal">>(gs: readonly T[]) => gs.filter((g) => g.estado === "vigente" && g.montoTotal > 0);
const mesCorto = (mes: string) => textoMes(mes).slice(0, 3);
const nombreDeSede = (g: Pick<GastoParaRitmo, "ubicacionId" | "ubicacionNombre">) => (g.ubicacionId ? nombreCortoSede(g.ubicacionNombre ?? "Otra sede") : "Empresa");

/** Lo gastado cada día (índice 1…dias) y sumado hasta cada día. */
function porDia(gastos: readonly GastoParaRitmo[], mes: string, dias: number): { dia: number[]; suma: number[] } {
  const dia = Array.from({ length: dias + 1 }, () => 0);
  for (const g of vigentes(gastos)) if (mesDe(g.fecha) === mes) dia[Math.min(dias, diaDe(g.fecha))]! += g.montoTotal;
  const suma = [0];
  for (let d = 1; d <= dias; d++) suma[d] = suma[d - 1]! + dia[d]!;
  return { dia, suma };
}

/**
 * Los saltos grandes, del más grande al más chico: uno se suma al de su misma categoría si cae a 4 días o menos de él; si no, abre otro,
 * mientras haya menos de tres y no caiga a 3 días o menos de otro (dos notas casi en el mismo día se taparían). Después, cada uno suma
 * todo lo de su categoría en sus días.
 */
function saltosDe(gastos: readonly GastoParaRitmo[], mes: string, hasta: number, umbral: number): SaltoRitmo[] {
  const delMes = vigentes(gastos).filter((g) => mesDe(g.fecha) === mes && diaDe(g.fecha) <= hasta);
  if (umbral <= 0) return [];
  const grupos: { categoria: string; nombre: string; desde: number; hasta: number }[] = [];
  for (const g of [...delMes].sort((a, b) => b.montoTotal - a.montoTotal || a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id))) {
    if (g.montoTotal < umbral) break;
    const d = diaDe(g.fecha);
    const suyo = grupos.find((o) => o.categoria === g.categoria && d >= o.desde - 4 && d <= o.hasta + 4);
    if (suyo) {
      suyo.desde = Math.min(suyo.desde, d);
      suyo.hasta = Math.max(suyo.hasta, d);
    } else if (grupos.length < MAX_SALTOS && !grupos.some((o) => d >= o.desde - 3 && d <= o.hasta + 3)) {
      grupos.push({ categoria: g.categoria, nombre: g.categoriaNombre, desde: d, hasta: d });
    }
  }
  const variasSedes = new Set(delMes.map((g) => g.ubicacionId ?? SEDE_EMPRESA)).size > 1;
  return grupos
    .map((o) => {
      const suyos = delMes.filter((g) => g.categoria === o.categoria && diaDe(g.fecha) >= o.desde && diaDe(g.fecha) <= o.hasta);
      const cuando = o.desde === o.hasta ? `${o.desde} ${mesCorto(mes)}` : `${o.desde} al ${o.hasta} ${mesCorto(mes)}`;
      // Un solo gasto, entre varias sedes, se nombra por su sede («Alquiler · Trujillo»); lo demás, por sus días.
      const largo = suyos.length === 1 && variasSedes ? `${o.nombre} · ${nombreDeSede(suyos[0]!)}` : `${o.nombre} · ${cuando}`;
      return { dia: o.hasta, desde: o.desde, hasta: o.hasta, categoria: o.categoria, largo, corto: o.nombre, monto: suyos.reduce((a, g) => a + g.montoTotal, 0) };
    })
    .sort((a, b) => a.dia - b.dia);
}

/**
 * El ritmo del mes que se mira. `anteriores` son los gastos del mes anterior, o `null` si ese mes no se compara (antes del inicio de
 * Finanzas, no se pudo leer, o no tiene ni un gasto: un mes en cero es un mes que no se registró). `hoy` es `AAAA-MM-DD` de Lima.
 */
export function ritmoDelMes(e: {
  gastos: readonly GastoParaRitmo[];
  anteriores: readonly GastoParaRitmo[] | null;
  fijos: readonly FijoParaRitmo[];
  mes: string;
  hoy: string;
}): RitmoDelMes {
  const dias = diasDelMes(e.mes);
  const mesHoy = mesDe(e.hoy);
  const enCurso = e.mes === mesHoy;
  const hasta = e.mes < mesHoy ? dias : enCurso ? diaDe(e.hoy) : 0;
  const { dia, suma } = porDia(e.gastos, e.mes, dias);
  const aHoy = suma[hasta]!;
  const serie = hasta > 0 ? Array.from({ length: hasta }, (_, i) => ({ x: i + 1, y: suma[i + 1]! })) : [];

  const ant = e.anteriores && vigentes(e.anteriores).length > 0 ? e.anteriores : null;
  const mesAnt = ant ? mesDe(vigentes(ant)[0]!.fecha) : null;
  const diasAnt = mesAnt ? diasDelMes(mesAnt) : 0;
  const sumaAnt = ant && mesAnt ? porDia(ant, mesAnt, diasAnt).suma : null;
  const referencia = sumaAnt ? Array.from({ length: Math.min(diasAnt, dias) }, (_, i) => ({ x: i + 1, y: sumaAnt[i + 1]! })) : null;
  const anteriorAEstaAltura = sumaAnt && hasta > 0 ? sumaAnt[Math.min(hasta, diasAnt)]! : null;
  const cierreAnterior = sumaAnt ? sumaAnt[diasAnt]! : null;

  const saltos = saltosDe(e.gastos, e.mes, hasta, UMBRAL_SALTO * Math.max(aHoy, cierreAnterior ?? 0));

  // Lo de un día normal: sin los gastos que vienen de un fijo (ya se cuentan aparte, en su día) ni los saltos (no se repiten cada día).
  const deFijos = new Set(e.fijos.map((f) => f.gastoId).filter((id): id is string => !!id));
  const fuera = vigentes(e.gastos).filter(
    (g) => mesDe(g.fecha) === e.mes && diaDe(g.fecha) <= hasta && (deFijos.has(g.id) || saltos.some((s) => s.categoria === g.categoria && diaDe(g.fecha) >= s.desde && diaDe(g.fecha) <= s.hasta)),
  );
  const ritmoDiario = hasta > 0 ? Math.max(0, aHoy - fuera.reduce((a, g) => a + g.montoTotal, 0)) / hasta : null;

  // Si sigue así: un día normal cada día que falta, más lo que ya se sabe que viene en su día (los fijos sin registrar —el atrasado,
  // mañana— y un gasto ya anotado con fecha de más adelante).
  let proyeccion: PuntoRitmo[] | null = null;
  let vienen: VieneRitmo[] = [];
  if (enCurso && hasta < dias && ritmoDiario !== null) {
    const extra = Array.from({ length: dias + 1 }, () => 0);
    for (let d = hasta + 1; d <= dias; d++) extra[d] = dia[d]!;
    const pendientes = e.fijos.filter((f) => f.estado !== "registrado" && f.monto > 0);
    const diaDelFijo = (f: FijoParaRitmo) => Math.min(dias, Math.max(hasta + 1, mesDe(f.fechaEsperada) === e.mes ? diaDe(f.fechaEsperada) : hasta + 1));
    for (const f of pendientes) extra[diaDelFijo(f)]! += f.monto;
    proyeccion = [{ x: hasta, y: aHoy }];
    for (let d = hasta + 1; d <= dias; d++) proyeccion.push({ x: d, y: proyeccion.at(-1)!.y + ritmoDiario + extra[d]! });
    const enElDia = new Map<number, FijoParaRitmo[]>();
    for (const f of pendientes) enElDia.set(diaDelFijo(f), [...(enElDia.get(diaDelFijo(f)) ?? []), f]);
    vienen = [...enElDia.entries()]
      .sort(([a], [b]) => a - b)
      .map(([d, fijos]) => ({ dia: d, y: proyeccion!.find((p) => p.x === d)!.y, monto: fijos.reduce((a, f) => a + f.monto, 0), fijos }));
  }

  return {
    dias,
    hasta,
    enCurso,
    aHoy,
    serie,
    referencia,
    anteriorAEstaAltura,
    cierreAnterior,
    proyeccion,
    cierreProyectado: proyeccion ? proyeccion.at(-1)!.y : null,
    ritmoDiario,
    vienen,
    saltos,
  };
}

/**
 * Junto al título: «A hoy llevas S/ 14,370: S/ 2,101 más que septiembre a esta altura.»; en un mes cerrado, «En septiembre gastaste
 * S/ 13,100: S/ 400 menos que agosto.». Sin mes anterior, solo lo de este. `null` si no hay ni un gasto.
 */
export function fraseDelRitmo(r: RitmoDelMes, mes: string, nombreMesAnterior: string): string | null {
  if (r.aHoy <= 0) return null;
  const nombre = textoMes(mes).split(" ")[0]!;
  const inicio = r.enCurso ? `A hoy llevas ${solesRedondo(r.aHoy)}` : `En ${nombre} gastaste ${solesRedondo(r.aHoy)}`;
  const contra = r.enCurso ? r.anteriorAEstaAltura : r.cierreAnterior;
  if (contra === null || contra <= 0) return `${inicio}.`;
  const altura = r.enCurso ? " a esta altura" : "";
  const dif = r.aHoy - contra;
  if (Math.abs(dif) < contra * MOVIMIENTO_MINIMO) return `${inicio}, casi lo mismo que ${nombreMesAnterior}${altura}.`;
  return `${inicio}: ${solesRedondo(Math.abs(dif))} ${dif > 0 ? "más" : "menos"} que ${nombreMesAnterior}${altura}.`;
}

/** Bajo el gráfico angosto, lo que en el ancho va al final de las líneas: «Si sigue así, cierras octubre en ≈ S/ 16,200; septiembre cerró en S/ 13,100.» */
export function pieDelRitmo(r: RitmoDelMes, mes: string, nombreMesAnterior: string): string | null {
  const partes = [
    r.cierreProyectado !== null ? `Si sigue así, cierras ${textoMes(mes).split(" ")[0]} en ≈ ${solesRedondo(r.cierreProyectado)}` : null,
    r.cierreAnterior !== null ? `${nombreMesAnterior} cerró en ${solesRedondo(r.cierreAnterior)}` : null,
  ].filter((p): p is string => !!p);
  if (partes.length === 0) return null;
  const texto = partes.join("; ");
  return `${texto[0]!.toUpperCase()}${texto.slice(1)}.`;
}

/** Los días bajo el gráfico: 1, 8, 15, 22, 29 y, en el mes en curso, «hoy» en negrita (sin el día que le caiga encima). */
export function marcasDelRitmo(r: Pick<RitmoDelMes, "enCurso" | "hasta">): { x: number; texto: string; fuerte?: boolean }[] {
  const fijas = [1, 8, 15, 22, 29].filter((d) => !r.enCurso || Math.abs(d - r.hasta) > 2).map((d) => ({ x: d, texto: String(d) }));
  return r.enCurso && r.hasta > 0 ? [...fijas, { x: r.hasta, texto: "hoy", fuerte: true }].sort((a, b) => a.x - b.x) : fijas;
}

const SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/** «jueves 1 de octubre». */
export function nombreDelDia(mes: string, dia: number): string {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  return `${SEMANA[new Date(Date.UTC(a, m - 1, dia)).getUTCDay()]} ${dia} de ${textoMes(mes).split(" ")[0]}`;
}

export type GastoDelDia = { id: string; descripcion: string; categoriaNombre: string; proveedorNombre: string | null; clave: ClaveSede; monto: number };

/** Lo que se gastó exactamente un día, del más grande al más chico, y lo que falta pagar ese día (si es de los que vienen). */
export function delDia(r: RitmoDelMes, gastos: readonly GastoParaRitmo[], mes: string, dia: number): { gastos: GastoDelDia[]; total: number; vienen: FijoParaRitmo[] } {
  const lista = vigentes(gastos)
    .filter((g) => mesDe(g.fecha) === mes && diaDe(g.fecha) === dia)
    .map((g) => ({ id: g.id, descripcion: g.descripcion, categoriaNombre: g.categoriaNombre, proveedorNombre: g.proveedorNombre, clave: g.ubicacionId ?? SEDE_EMPRESA, monto: g.montoTotal }))
    .sort((a, b) => b.monto - a.monto || a.id.localeCompare(b.id));
  return { gastos: lista, total: lista.reduce((a, g) => a + g.monto, 0), vienen: r.vienen.find((v) => v.dia === dia)?.fijos ?? [] };
}
