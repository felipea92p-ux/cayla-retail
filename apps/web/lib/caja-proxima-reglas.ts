import type { CuentaDinero } from "./cuentas-dinero-reglas";
import { queFaltaEnLaProyeccion, soles, type FaltaProy, type Proyeccion, type SalidaProy } from "./flujo-caja-reglas";
import type { VerResumen } from "./resumen-finanzas-reglas";

// Finanzas ▸ Resumen, «Tu caja en las próximas dos semanas» (Felipe 2026-10-24, spike 1 de docs/maquetas/finanzas-v3-2026-10/resumen-siguiente).
// Lógica pura: a partir de la proyección de caja que ya calcula la base (`fn_flujo_caja_proyeccion`: bloques de 7 días desde mañana, con
// los cobros esperados y las salidas con su fecha), arma lo que dibuja la pieza: el saldo día por día, cuándo baja del mínimo y qué pesa.
//
// CONTRATO. Promete: la caja de CAYLA entera día por día, o —mirando una sede— solo lo que de verdad se separa por sede (su efectivo, lo que
// se espera cobrar de ella y lo que sale de ella). Asume: la proyección es la de la base, con `salidas` y `cobros` completos.
// Nunca promete: el saldo de una sede. Los bancos son de CAYLA entera y repartirlos sería inventar un dato (D-32).
//
// UNA SOLA VERDAD. El saldo de cada día sale de las mismas piezas con que la base arma sus bloques (`saldoHoy` + cobros − salidas), así que
// al final de cada bloque tiene que dar el `saldo` que la base ya dijo (el de Dinero ▸ Flujo). Si no coincide (una base más vieja que
// esta web), no se inventa el detalle: la línea usa solo los saldos de los bloques y lo dice (`porSemana`).

/** El horizonte de la pieza: dos bloques de 7 días desde mañana. */
export const DIAS_CAJA_PROXIMA = 14;

/** Un día de la línea: el saldo al terminar ese día y lo que pasó ese día (en un bloque entero si `porSemana`); `principal` es la salida más grande. */
export type PuntoCaja = { dia: number; fecha: string; saldo: number; entra: number; sale: number; principal: string | null };
export type SalidaGrande = { fecha: string; titulo: string; monto: number };
export type TonoCaja = "verde" | "ambar" | "rojo" | "pizarra";

export type CajaCayla = {
  tipo: "cayla";
  hoy: string;
  /** El último día que cuenta (hoy + 14, o antes si la proyección es más corta). */
  hasta: string;
  saldoHoy: number;
  minimo: number;
  entra: number;
  sale: number;
  /** Lo que queda al final del horizonte (el `saldo` del último bloque que cuenta). */
  queda: number;
  /** Un punto por día (o uno por bloque si `porSemana`), de hoy al último día. */
  puntos: PuntoCaja[];
  porSemana: boolean;
  /** Las salidas que más pesan en el horizonte, de mayor a menor (máximo 3). */
  mayores: SalidaGrande[];
  /** El primer día del horizonte en que el saldo queda bajo el mínimo (puede ser hoy); `null` si no baja (o no hay mínimo puesto). */
  bajaDelMinimo: { fecha: string; saldo: number } | null;
  /** El primer día del horizonte en que el saldo queda en negativo: la plata no alcanza. */
  sinPlata: { fecha: string; saldo: number } | null;
  /** Si no baja en el horizonte pero sí en las semanas que siguen, el primer bloque que baja. */
  luego: { fecha: string; saldo: number } | null;
  titular: string;
  tono: TonoCaja;
  provisional: boolean;
  faltan: FaltaProy[];
  /** La cuenta no ve la planilla en Dynamic: no está en lo que sale. */
  sinPlanilla: boolean;
};

export type CajaSede = {
  tipo: "sede";
  nombre: string;
  /** Una tienda cobra; el Taller y la Empresa no. */
  vende: boolean;
  hoy: string;
  hasta: string;
  /** Cajón y caja fuerte de esa sede; `null` si la cuenta no los ve. */
  efectivo: number | null;
  /** Lo que se espera cobrar de la sede en el horizonte (0 si no vende: el Taller, la Empresa). */
  entra: number;
  sale: number;
  mayores: SalidaGrande[];
  titular: string;
  sinPlanilla: boolean;
};

export type CajaProxima = CajaCayla | CajaSede | { tipo: "oculta" } | { tipo: "falla"; mensaje: string };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const r2 = (n: number) => Math.round(n * 100) / 100;

/** `iso` + `n` días. */
export function sumarDias(iso: string, n: number): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Cuántos días hay de `desde` a `hasta` (negativo si `hasta` es antes). */
export function diasEntre(desde: string, hasta: string): number {
  const t = (s: string) => {
    const [a, m, d] = s.slice(0, 10).split("-").map(Number) as [number, number, number];
    return Date.UTC(a, m - 1, d);
  };
  return Math.round((t(hasta) - t(desde)) / 86_400_000);
}

/** «31 de octubre». */
export function fechaEnPalabras(iso: string): string {
  return `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]}`;
}

function nombreDeSalida(s: SalidaProy): string {
  if (s.tipo === "planilla") return "Planilla";
  return s.titulo || s.detalle || "Pago";
}

/** Las salidas de un tramo, juntas por día y nombre (la planilla entera, no por persona), de mayor a menor. */
export function salidasGrandes(salidas: readonly SalidaProy[], desde: string, hasta: string, max = 3): SalidaGrande[] {
  const m = new Map<string, SalidaGrande>();
  for (const s of salidas) {
    if (s.fecha < desde || s.fecha > hasta || s.monto <= 0) continue;
    const titulo = nombreDeSalida(s);
    const k = `${s.fecha}|${titulo}`;
    const v = m.get(k) ?? { fecha: s.fecha, titulo, monto: 0 };
    v.monto = r2(v.monto + s.monto);
    m.set(k, v);
  }
  return [...m.values()].sort((a, b) => b.monto - a.monto || a.fecha.localeCompare(b.fecha)).slice(0, max);
}

/** Lo que se espera cobrar y lo que sale hasta el final de `fecha` (desde que empieza la proyección), con un filtro opcional por sede. */
function movimientoHasta(p: Proyeccion, fecha: string, sede?: (ubicacionId: string | null) => boolean): { entra: number; sale: number } {
  const ok = sede ?? (() => true);
  let entra = 0;
  let sale = 0;
  for (const c of p.cobros) if (c.fecha >= p.desde && c.fecha <= fecha && ok(c.ubicacionId)) entra += c.monto;
  for (const s of p.salidas) if (s.fecha >= p.desde && s.fecha <= fecha && ok(s.ubicacionId)) sale += s.monto;
  return { entra: r2(entra), sale: r2(sale) };
}

/** ¿El saldo día por día cuadra con el de cada bloque que dice la base? (±1 sol de redondeo.) */
function cuadraConLosBloques(p: Proyeccion): boolean {
  return p.semanas.every((s) => {
    const m = movimientoHasta(p, s.hasta);
    return Math.abs(p.saldoHoy + m.entra - m.sale - s.saldo) <= 1;
  });
}

/** Lo que se espera cobrar y lo que sale EN ese día, y qué salida pesa más. */
function delDia(p: Proyeccion, fecha: string): { entra: number; sale: number; principal: string | null } {
  const del = p.salidas.filter((s) => s.fecha === fecha && s.monto > 0);
  const mayor = salidasGrandes(del, fecha, fecha, 1)[0];
  return {
    entra: r2(p.cobros.filter((c) => c.fecha === fecha).reduce((a, c) => a + c.monto, 0)),
    sale: r2(del.reduce((a, s) => a + s.monto, 0)),
    principal: mayor?.titulo ?? null,
  };
}

function fechaDeSedeFiltro(ver: VerResumen): (ubicacionId: string | null) => boolean {
  if (ver.soloEmpresa) return (u) => u === null;
  return (u) => u === ver.ubicacionId;
}

/** El nombre de la sede dentro de una frase: «Lima», «el Taller», «la empresa». */
function quien(ver: VerResumen): string {
  if (ver.tipo === "taller") return "el Taller";
  if (ver.soloEmpresa) return "la empresa";
  return ver.nombre.replace(/^Tienda\s+/i, "");
}

/** Lo que dice la lectura de la proyección: la proyección, «tu cuenta no la ve», o que no se pudo leer. */
export type FlujoProximo = { estado: "ok"; datos: Proyeccion } | { estado: "sin_permiso" } | { estado: "falla"; mensaje: string } | { estado: "no_aplica" };

type Entrada = {
  flujo: FlujoProximo;
  cuentas: readonly CuentaDinero[] | null;
  ver: VerResumen;
};

/**
 * Lo que dibuja «Tu caja en las próximas dos semanas». `oculta` si la cuenta no ve el flujo (no se dibuja un 0); `falla` si no se pudo
 * leer (se dice, sin cifras).
 */
export function cajaProxima({ flujo, cuentas, ver }: Entrada): CajaProxima {
  if (flujo.estado === "sin_permiso" || flujo.estado === "no_aplica") return { tipo: "oculta" };
  if (flujo.estado === "falla") return { tipo: "falla", mensaje: flujo.mensaje };
  const p = flujo.datos;
  const dias = Math.max(0, Math.min(DIAS_CAJA_PROXIMA, diasEntre(p.hoy, p.hasta)));
  if (dias === 0) return { tipo: "oculta" };
  const hasta = sumarDias(p.hoy, dias);
  const sinPlanilla = !p.planillaVisible;

  if (!ver.todas) {
    const ok = fechaDeSedeFiltro(ver);
    const m = movimientoHasta(p, hasta, ok);
    const vende = ver.tipo === "tienda" || ver.tipo === "almacen";
    const propias = cuentas?.filter((c) => c.ubicacionId === ver.ubicacionId && (c.tipo === "cajon" || c.tipo === "caja_fuerte")) ?? [];
    const efectivo = propias.length && propias.every((c) => c.saldo !== null) ? r2(propias.reduce((a, c) => a + (c.saldo ?? 0), 0)) : null;
    const entra = vende ? m.entra : 0;
    const titular = vende
      ? `${quien(ver)} espera cobrar ${soles(entra)} y paga ${soles(m.sale)} hasta el ${fechaEnPalabras(hasta)}.`
      : `${quien(ver)} paga ${soles(m.sale)} hasta el ${fechaEnPalabras(hasta)}: no cobra, lo sostienen las tiendas.`;
    return {
      tipo: "sede",
      nombre: quien(ver),
      vende,
      hoy: p.hoy,
      hasta,
      efectivo,
      entra,
      sale: m.sale,
      mayores: salidasGrandes(p.salidas.filter((s) => ok(s.ubicacionId)), p.desde, hasta),
      titular,
      sinPlanilla,
    };
  }

  // CAYLA entera: el saldo de cada día, o el de cada bloque si no cuadra con lo que dice la base.
  const cuadra = cuadraConLosBloques(p);
  const puntos: PuntoCaja[] = [{ dia: 0, fecha: p.hoy, saldo: r2(p.saldoHoy), entra: 0, sale: 0, principal: null }];
  let entra: number;
  let sale: number;
  let queda: number;
  if (cuadra) {
    for (let d = 1; d <= dias; d++) {
      const fecha = sumarDias(p.hoy, d);
      const m = movimientoHasta(p, fecha);
      puntos.push({ dia: d, fecha, saldo: r2(p.saldoHoy + m.entra - m.sale), ...delDia(p, fecha) });
    }
    const m = movimientoHasta(p, hasta);
    entra = m.entra;
    sale = m.sale;
    queda = puntos.at(-1)!.saldo;
  } else {
    const bloques = p.semanas.filter((s) => s.hasta <= hasta);
    let antesEntra = 0;
    let antesSale = 0;
    for (const s of bloques) {
      puntos.push({ dia: diasEntre(p.hoy, s.hasta), fecha: s.hasta, saldo: r2(s.saldo), entra: r2(s.entra), sale: r2(s.sale), principal: salidasGrandes(p.salidas, s.desde, s.hasta, 1)[0]?.titulo ?? null });
      antesEntra += s.entra;
      antesSale += s.sale;
    }
    entra = r2(antesEntra);
    sale = r2(antesSale);
    queda = puntos.at(-1)!.saldo;
  }

  const minimo = p.minimoCaja;
  const hayMinimo = minimo > 0;
  const baja = hayMinimo ? puntos.find((x) => x.saldo < minimo) : undefined;
  const bajaDelMinimo = baja ? { fecha: baja.fecha, saldo: baja.saldo } : null;
  const bloqueLuego = !bajaDelMinimo && hayMinimo ? p.semanas.find((s) => s.hasta > hasta && s.bajoMinimo) : undefined;
  const luego = bloqueLuego ? { fecha: bloqueLuego.hasta, saldo: r2(bloqueLuego.saldo) } : null;

  const sinPlataPunto = puntos.find((x) => x.saldo < 0);
  const sinPlata = sinPlataPunto ? { fecha: sinPlataPunto.fecha, saldo: sinPlataPunto.saldo } : null;

  let titular: string;
  let tono: TonoCaja;
  if (sinPlata) {
    titular = `Tu caja se queda sin plata el ${fechaEnPalabras(sinPlata.fecha)}: llegas a ${soles(sinPlata.saldo)}.`;
    tono = "rojo";
  } else if (bajaDelMinimo && bajaDelMinimo.fecha === p.hoy) {
    titular = `Hoy tu caja ya está bajo tu mínimo: tienes ${soles(bajaDelMinimo.saldo)} y tu mínimo es ${soles(minimo)}.`;
    tono = "rojo";
  } else if (bajaDelMinimo) {
    titular = `Tu caja baja de tu mínimo el ${fechaEnPalabras(bajaDelMinimo.fecha)}: llegas a ${soles(bajaDelMinimo.saldo)} y tu mínimo es ${soles(minimo)}.`;
    tono = "rojo";
  } else if (luego) {
    titular = `Las próximas dos semanas estás bien: te quedan ${soles(queda)}. Después baja de tu mínimo la semana que termina el ${fechaEnPalabras(luego.fecha)}.`;
    tono = "ambar";
  } else if (hayMinimo) {
    titular = `Tu caja aguanta las próximas dos semanas: el ${fechaEnPalabras(hasta)} te quedan ${soles(queda)}, sobre tu mínimo de ${soles(minimo)}.`;
    tono = "verde";
  } else {
    titular = `Hoy tienes ${soles(p.saldoHoy)}; el ${fechaEnPalabras(hasta)} te quedan ${soles(queda)}. No tienes un mínimo de caja puesto.`;
    tono = "pizarra";
  }

  const falta = queFaltaEnLaProyeccion(p);
  return {
    tipo: "cayla",
    hoy: p.hoy,
    hasta,
    saldoHoy: r2(p.saldoHoy),
    minimo,
    entra,
    sale,
    queda,
    puntos,
    porSemana: !cuadra,
    mayores: salidasGrandes(p.salidas, p.desde, hasta),
    bajaDelMinimo,
    sinPlata,
    luego,
    titular,
    tono,
    provisional: falta.provisional,
    faltan: falta.faltan,
    sinPlanilla,
  };
}
