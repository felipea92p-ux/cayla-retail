// Plan de campaña ▸ Historial (ADR-0372, C3 · Felipe 2026-10-12): cuánto vendió cada tienda en cada campaña de cada año, cuánto más que
// un día normal y cuánto creció contra el año anterior. Lógica pura, sin React ni red.
//
// EL PROBLEMA. «Diciembre triplica un mes» era una frase sin respaldo: Sinatra (2017–2026) dice que en Trujillo diciembre vende ~1,8 veces
// un mes normal y que en Arequipa casi lo mismo que un mes normal. Esta pantalla pone esa historia a la vista, una campaña por fila, un año
// a la vez (Felipe: «ordenarlas por año para que no sobrecargue»).
//
// LAS REGLAS (una sola vara para todo, la misma que usa «Resultados»):
//   · Una campaña del año A son las fechas de su etiqueta (Catálogo ▸ Etiquetas guarda cada campaña UNA vez, con fechas de un año)
//     llevadas al año A: mismo día y mes. Única excepción, porque es del calendario y no nuestra: Día de la Madre (en el Perú, el segundo
//     domingo de mayo) se mueve con su domingo. «Diciembre» (1–31) siempre está, aunque no sea una etiqueta.
//   · El multiplicador = soles por día dentro de la campaña ÷ soles por día de los 60 días anteriores. Un día sin venta cuenta como día
//     (la tienda cerrada un domingo también es parte de «un día normal»).
//   · Sin dato (y nunca un cero inventado) si la tienda no tenía historia en esas fechas: antes de abrir, la pandemia de 2020 o un archivo
//     que no se cargó. La base de 60 días necesita al menos 20 días con venta.
//   · Sinatra sabe soles, no unidades: todo aquí es en soles.

export const RPC_HISTORIAL = "fn_historial_ventas";
/** Los días antes de la campaña que hacen de «día normal». */
export const DIAS_BASE = 60;
/** Cuántos de esos días tienen que tener venta para que la base valga. */
export const MIN_DIAS_CON_VENTA_BASE = 20;

export type TiendaHistorial = { id: string; nombre: string; erpDesde: string | null; historiaDesde: string | null };
export type LecturaHistorial = {
  hoy: string;
  tiendas: TiendaHistorial[];
  /** tienda → «aaaa-mm» → soles. */
  meses: Map<string, Map<string, number>>;
  /** tienda → fecha → soles (solo los días del rango pedido). */
  dias: Map<string, Map<string, number>>;
};

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const fechaIso = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const numero = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(esObjeto) : []);

/** Lo que devuelve `fn_historial_ventas`, sin confiar en su forma; null si no se entiende. */
export function leerHistorial(v: unknown): LecturaHistorial | null {
  if (!esObjeto(v)) return null;
  const hoy = fechaIso(v.hoy);
  if (!hoy) return null;
  const tiendas = lista(v.tiendas).flatMap((t): TiendaHistorial[] => {
    const id = texto(t.id);
    const nombre = texto(t.nombre);
    return id && nombre ? [{ id, nombre, erpDesde: fechaIso(t.erp_desde), historiaDesde: fechaIso(t.historia_desde) }] : [];
  });
  const meses = new Map<string, Map<string, number>>();
  for (const m of lista(v.meses)) {
    const u = texto(m.u);
    const mes = typeof m.mes === "string" && /^\d{4}-\d{2}$/.test(m.mes) ? m.mes : null;
    const s = numero(m.soles);
    if (u && mes && s !== null) (meses.get(u) ?? meses.set(u, new Map()).get(u)!).set(mes, s);
  }
  const dias = new Map<string, Map<string, number>>();
  for (const d of lista(v.dias)) {
    const u = texto(d.u);
    const f = fechaIso(d.f);
    const s = numero(d.s);
    if (u && f && s !== null) (dias.get(u) ?? dias.set(u, new Map()).get(u)!).set(f, s);
  }
  return { hoy, tiendas, meses, dias };
}

// ---------------------------------------------------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------------------------------------------------

const aUtc = (iso: string) => new Date(`${iso}T12:00:00Z`);
const aIso = (d: Date) => d.toISOString().slice(0, 10);
export const sumarDias = (iso: string, n: number): string => {
  const d = aUtc(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return aIso(d);
};
export const diasEntre = (a: string, b: string) => Math.round((aUtc(b).getTime() - aUtc(a).getTime()) / 86_400_000);

/** El segundo domingo de mayo del año: Día de la Madre en el Perú. */
export function segundoDomingoDeMayo(anio: number): string {
  const primero = new Date(Date.UTC(anio, 4, 1, 12));
  const hastaDomingo = (7 - primero.getUTCDay()) % 7;
  return aIso(new Date(Date.UTC(anio, 4, 1 + hastaDomingo + 7, 12)));
}

/** La misma fecha (día y mes) en otro año; el 29 de febrero cae al 28 en un año que no es bisiesto. */
export function mismaFechaEn(iso: string, anio: number): string {
  const [, m, d] = iso.split("-").map(Number);
  const ultimo = new Date(Date.UTC(anio, m, 0, 12)).getUTCDate();
  return `${anio}-${String(m).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}

export type EtiquetaHistorial = { id: string; nombre: string; desde: string; hasta: string };
export type CampanaDelAnio = { clave: string; nombre: string; desde: string; hasta: string };

/** Las fechas de una campaña llevadas a otro año (se mueve con el año de su fin). Día de la Madre conserva su segundo domingo de mayo. */
export function proyectarCampana(e: Pick<EtiquetaHistorial, "desde" | "hasta">, anio: number): { desde: string; hasta: string } {
  const largo = diasEntre(e.desde, e.hasta);
  // El año del fin manda: San Valentín (31 ene – 14 feb) es del año de su 14 de febrero.
  const esMadre = e.hasta === segundoDomingoDeMayo(Number(e.hasta.slice(0, 4)));
  const hasta = esMadre ? segundoDomingoDeMayo(anio) : mismaFechaEn(e.hasta, anio);
  return { desde: sumarDias(hasta, -largo), hasta };
}

/** Las campañas de un año, por fecha: cada etiqueta llevada a ese año, más «Diciembre» completo. */
export function campanasDelAnio(etiquetas: readonly EtiquetaHistorial[], anio: number): CampanaDelAnio[] {
  const proyectadas = etiquetas.map((e) => ({ clave: e.id, nombre: e.nombre, ...proyectarCampana(e, anio) }));
  const diciembre = { clave: "diciembre", nombre: "Diciembre", desde: `${anio}-12-01`, hasta: `${anio}-12-31` };
  return [...proyectadas, diciembre].sort((a, b) => a.desde.localeCompare(b.desde) || a.hasta.localeCompare(b.hasta) || a.nombre.localeCompare(b.nombre, "es"));
}

// ---------------------------------------------------------------------------------------------------------------------
// Medir
// ---------------------------------------------------------------------------------------------------------------------

/** Desde qué día hay historia de la tienda (Sinatra o, si no, el ERP). */
export const inicioDeDatos = (t: TiendaHistorial): string | null => [t.historiaDesde, t.erpDesde].filter((x): x is string => !!x).sort()[0] ?? null;

function sumaDias(dias: ReadonlyMap<string, number> | undefined, desde: string, hasta: string): { soles: number; conVenta: number } {
  let soles = 0;
  let conVenta = 0;
  if (!dias) return { soles, conVenta };
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
    const s = dias.get(f);
    if (s && s > 0) {
      soles += s;
      conVenta += 1;
    }
  }
  return { soles, conVenta };
}

export type Medida =
  | { estado: "por-venir" }
  | { estado: "sin-dato"; motivo: string }
  | { estado: "medida"; soles: number; dias: number; enCurso: boolean; multiplicador: number | null };

/**
 * Lo que vendió una tienda en una ventana. «por-venir» si empieza después de hoy; «sin-dato» si la tienda no tenía historia esos días (o
 * no se vendió nada: en Sinatra un hueco es un mes sin cargar, no una tienda que no vendió); si está en curso, cuenta hasta ayer.
 */
export function medir(l: Pick<LecturaHistorial, "hoy" | "dias">, t: TiendaHistorial, desde: string, hasta: string): Medida {
  if (desde >= l.hoy) return { estado: "por-venir" };
  const inicio = inicioDeDatos(t);
  if (!inicio || desde < inicio) return { estado: "sin-dato", motivo: inicio ? `La historia de ${t.nombre} empieza el ${inicio}.` : `${t.nombre} no tiene historia cargada.` };
  const enCurso = hasta >= l.hoy;
  const fin = enCurso ? sumarDias(l.hoy, -1) : hasta;
  const dias = l.dias.get(t.id);
  const { soles, conVenta } = sumaDias(dias, desde, fin);
  if (conVenta === 0) return { estado: "sin-dato", motivo: "No hay ventas cargadas en esas fechas." };
  const largo = diasEntre(desde, fin) + 1;
  const baseDesde = sumarDias(desde, -DIAS_BASE);
  const base = baseDesde >= inicio ? sumaDias(dias, baseDesde, sumarDias(desde, -1)) : null;
  const multiplicador = base && base.conVenta >= MIN_DIAS_CON_VENTA_BASE && base.soles > 0 ? soles / largo / (base.soles / DIAS_BASE) : null;
  return { estado: "medida", soles, dias: largo, enCurso, multiplicador };
}

/** El crecimiento contra el año anterior (0,12 = +12 %); null si alguna de las dos no se pudo medir o la anterior está en curso. */
export function crecimiento(actual: Medida, anterior: Medida): number | null {
  if (actual.estado !== "medida" || anterior.estado !== "medida" || actual.enCurso || anterior.soles <= 0) return null;
  return actual.soles / anterior.soles - 1;
}

export type CeldaHistorial = { tienda: TiendaHistorial; medida: Medida; crecimiento: number | null };
export type FilaHistorial = { campana: CampanaDelAnio; celdas: CeldaHistorial[] };

/** La tabla de un año: una fila por campaña, una celda por tienda. */
export function filasDelAnio(l: LecturaHistorial, etiquetas: readonly EtiquetaHistorial[], anio: number): FilaHistorial[] {
  const antes = new Map(campanasDelAnio(etiquetas, anio - 1).map((c) => [c.clave, c]));
  return campanasDelAnio(etiquetas, anio).map((campana) => ({
    campana,
    celdas: l.tiendas.map((tienda) => {
      const medida = medir(l, tienda, campana.desde, campana.hasta);
      const previa = antes.get(campana.clave);
      return { tienda, medida, crecimiento: previa ? crecimiento(medida, medir(l, tienda, previa.desde, previa.hasta)) : null };
    }),
  }));
}

/** El total del año por tienda y su crecimiento contra el anterior (solo si los dos años están completos y con datos). */
export function totalDelAnio(l: LecturaHistorial, tiendaId: string, anio: number): { soles: number; completo: boolean; crecimiento: number | null } {
  const meses = l.meses.get(tiendaId);
  const suma = (a: number) => [...(meses ?? new Map<string, number>()).entries()].filter(([m]) => m.startsWith(`${a}-`));
  const este = suma(anio);
  const previo = suma(anio - 1);
  const soles = este.reduce((s, [, v]) => s + v, 0);
  const completo = este.length === 12;
  const anterior = previo.reduce((s, [, v]) => s + v, 0);
  return { soles, completo, crecimiento: completo && previo.length === 12 && anterior > 0 ? soles / anterior - 1 : null };
}

/** Los años con historia, del más nuevo al más viejo. */
export function aniosConHistoria(l: Pick<LecturaHistorial, "meses" | "hoy">): number[] {
  const anios = new Set<number>();
  for (const meses of l.meses.values()) for (const m of meses.keys()) anios.add(Number(m.slice(0, 4)));
  anios.add(Number(l.hoy.slice(0, 4)));
  return [...anios].sort((a, b) => b - a);
}

/** El rango de días que hay que leer para un año: ese año y el anterior entero (para comparar), más la base de su primera campaña. */
export function rangoDelAnio(anio: number): { desde: string; hasta: string } {
  return { desde: sumarDias(`${anio - 1}-01-01`, -DIAS_BASE - 31), hasta: `${anio}-12-31` };
}

/** «×1.8» (es-PE: punto decimal, como los soles del ERP). */
export const textoMultiplicador = (m: number) => `×${m.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`;
/** «+12 %» / «−8 %». */
export const textoCrecimiento = (c: number) => `${c >= 0 ? "+" : "−"}${Math.round(Math.abs(c) * 100)} %`;
