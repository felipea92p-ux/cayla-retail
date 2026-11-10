import type { CuentaDinero } from "./cuentas-dinero-reglas";
import { cajaDiaria, conLoRegistrado, fechaEnPalabras, fraseBajoMinimo, queFaltaEnLaProyeccion, soles, type FaltaProy, type Proyeccion, type SalidaProy } from "./flujo-caja-reglas";
import { ordenarAvisos, ORDEN_AVISO_CAJA, type Aviso, type VerResumen } from "./resumen-finanzas-reglas";

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

/**
 * Lo que la proyección deja fuera (tarea 30): solo trae lo que ya tiene fecha. La mercadería ya facturada sí entra por Por pagar; la que aún no tiene factura y el gasto de cada día, no,
 * y sin decirlo la caja se lee como completa. Con la compra de campaña ya contada, hablar de mercadería chocaría con su chip «Incluye inversión en mercadería».
 */
export const loQueNoIncluye = (conInversion: boolean): string =>
  conInversion ? "No incluye los gastos del día a día." : "No incluye la mercadería que aún no tiene factura ni los gastos del día a día.";
/** Para «¿Me alcanza?»: habla de las semanas, porque sus «días de caja» sí llevan el gasto normal de los últimos 30 días. */
export const NO_INCLUYE_SEMANAS = "Las semanas no incluyen la mercadería que aún no tiene factura ni los gastos del día a día.";

/** Un día de la línea: el saldo al terminar ese día y lo que pasó ese día (en un bloque entero si `porSemana`); `principal` es la salida más grande. */
export type PuntoCaja = { dia: number; fecha: string; saldo: number; entra: number; sale: number; principal: string | null };
export type SalidaGrande = { fecha: string; titulo: string; monto: number };
export type TonoCaja = "verde" | "ambar" | "rojo" | "pizarra";
/** Un pago que aún no está en el flujo (la compra de campaña que falta pedir): su fecha y lo que sale de caja ese día. */
export type PagoCaja = { fecha: string; monto: number };
/** Lo que se suma a la caja cuando la inversión en mercadería se cuenta: los pagos y hasta cuántos días mirar (seis semanas, no dos). */
export type InversionEnCaja = { pagos: readonly PagoCaja[]; dias: number };
const PALABRAS_SEMANAS = ["una semana", "dos semanas", "tres semanas", "cuatro semanas", "cinco semanas", "seis semanas"];
/** «dos semanas», «seis semanas»: la ventana que mira la caja, dicha en palabras (14 días → dos semanas). */
export function ventanaEnPalabras(dias: number): string {
  const semanas = Math.max(1, Math.round(dias / 7));
  return PALABRAS_SEMANAS[semanas - 1] ?? `${semanas} semanas`;
}

export type CajaCayla = {
  tipo: "cayla";
  hoy: string;
  /** El último día que cuenta (hoy + 14, o antes si la proyección es más corta). */
  hasta: string;
  saldoHoy: number;
  /** Lo que es de Claudia y ya no cuenta en `saldoHoy` (0 si no hay). */
  deClaudia: number;
  /** Lo que las compradoras tienen para comprar y ya no cuenta en `saldoHoy` (0 si no hay; ADR-0621). */
  porVolver: number;
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
  /**
   * El punto más bajo del horizonte (el primero si hay empate), solo si baja del mínimo. ES EL NÚMERO QUE DICEN TODOS: la frase de la tarjeta y el
   * aviso «bajo tu mínimo de caja» de «Hoy te toca» (`alinearAvisoDeCaja`) hablan de este día y de este monto, no de dos cuentas distintas.
   */
  masBajo: { fecha: string; saldo: number } | null;
  /** Si no baja en el horizonte pero sí en las semanas que siguen, el primer bloque que baja. */
  luego: { fecha: string; saldo: number } | null;
  titular: string;
  tono: TonoCaja;
  provisional: boolean;
  faltan: FaltaProy[];
  /** La cuenta no ve la planilla en Dynamic: no está en lo que sale. */
  sinPlanilla: boolean;
  /** Si la inversión en mercadería está contada: sus pagos y cómo sería la caja SIN ella (para dibujar las dos). */
  conInversion?: { pagos: PagoCaja[]; sin: PuntoCaja[] };
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

export { fechaEnPalabras };

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Lo que hay de verdad en las cuentas: `saldoHoy` ya viene sin lo de Claudia (ADR-0560) ni lo por volver de compras (ADR-0621), así que para
 *  comparar con los saldos o repartirlo se les devuelve. */
export function loQueHayEnCuentas(c: Pick<CajaCayla, "saldoHoy" | "deClaudia" | "porVolver">): number {
  return r2(c.saldoHoy + c.deClaudia + c.porVolver);
}

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
  /** La compra de campaña que aún no se pidió, como capa aparte (solo mirando CAYLA entera: el saldo de los bancos no se reparte por sede). */
  inversion?: InversionEnCaja | null;
};

/**
 * Lo que dibuja «Tu caja en las próximas dos semanas». `oculta` si la cuenta no ve el flujo (no se dibuja un 0); `falla` si no se pudo
 * leer (se dice, sin cifras).
 */
export function cajaProxima({ flujo, cuentas, ver, inversion }: Entrada): CajaProxima {
  if (flujo.estado === "sin_permiso" || flujo.estado === "no_aplica") return { tipo: "oculta" };
  if (flujo.estado === "falla") return { tipo: "falla", mensaje: flujo.mensaje };
  const p = flujo.datos;
  const dias = Math.max(0, Math.min(inversion && inversion.pagos.length ? inversion.dias : DIAS_CAJA_PROXIMA, diasEntre(p.hoy, p.hasta)));
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
  const diaria = cajaDiaria(p);
  const cuadra = !diaria.porSemana;
  const puntos: PuntoCaja[] = [{ dia: 0, fecha: p.hoy, saldo: r2(p.saldoHoy), entra: 0, sale: 0, principal: null }];
  let entra: number;
  let sale: number;
  let queda: number;
  if (cuadra) {
    for (let d = 1; d <= dias; d++) {
      const { fecha, saldo } = diaria.puntos[d]!;
      puntos.push({ dia: d, fecha, saldo, ...delDia(p, fecha) });
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

  // La compra de campaña, como capa aparte: sale de la caja desde el día de cada pago. Se guarda cómo sería la caja SIN ella para dibujar las dos.
  const pagosDentro = (inversion?.pagos ?? []).filter((x) => x.fecha <= hasta);
  let conInversion: CajaCayla["conInversion"];
  if (pagosDentro.length) {
    const sin = puntos.map((x) => ({ ...x }));
    const salido = (fecha: string) => pagosDentro.filter((x) => x.fecha <= fecha).reduce((a, x) => a + x.monto, 0);
    for (const x of puntos) x.saldo = r2(x.saldo - salido(x.fecha));
    const porLaCompra = r2(pagosDentro.reduce((a, x) => a + x.monto, 0));
    sale = r2(sale + porLaCompra);
    queda = puntos.at(-1)!.saldo;
    conInversion = { pagos: pagosDentro.map((x) => ({ ...x })), sin };
  }

  const minimo = p.minimoCaja;
  const hayMinimo = minimo > 0;
  const baja = hayMinimo ? puntos.find((x) => x.saldo < minimo) : undefined;
  const bajaDelMinimo = baja ? { fecha: baja.fecha, saldo: baja.saldo } : null;
  const bloqueLuego = !bajaDelMinimo && hayMinimo ? p.semanas.find((s) => s.hasta > hasta && s.bajoMinimo) : undefined;
  const luego = bloqueLuego ? { fecha: bloqueLuego.hasta, saldo: r2(bloqueLuego.saldo) } : null;

  const sinPlataPunto = puntos.find((x) => x.saldo < 0);
  const sinPlata = sinPlataPunto ? { fecha: sinPlataPunto.fecha, saldo: sinPlataPunto.saldo } : null;
  const bajo = bajaDelMinimo ? puntos.reduce((a, x) => (x.saldo < a.saldo ? x : a), puntos[0]!) : null;
  const masBajo = bajo ? { fecha: bajo.fecha, saldo: bajo.saldo } : null;

  const ventana = ventanaEnPalabras(dias);
  let titular: string;
  let tono: TonoCaja;
  if (masBajo && bajaDelMinimo) {
    titular = fraseBajoMinimo({ hoy: p.hoy, masBajo, bajaDesde: bajaDelMinimo.fecha, sinPlata: !!sinPlata, minimo });
    tono = sinPlata ? "rojo" : "ambar";
  } else if (luego) {
    titular = `Las próximas ${ventana} estás bien: te quedan ${soles(queda)}. Después baja de tu mínimo la semana que termina el ${fechaEnPalabras(luego.fecha)}.`;
    tono = "ambar";
  } else if (hayMinimo) {
    titular = `Tu caja aguanta las próximas ${ventana}: el ${fechaEnPalabras(hasta)} te quedan ${soles(queda)}, sobre tu mínimo de ${soles(minimo)}.`;
    tono = "verde";
  } else {
    titular = `Hoy tienes ${soles(p.saldoHoy)}; el ${fechaEnPalabras(hasta)} te quedan ${soles(queda)}. No tienes un mínimo de caja puesto.`;
    tono = "pizarra";
  }

  // ADR-0417: un veredicto firme solo con datos firmes. Con la proyección provisional (faltan saldos de arranque, facturas o historia) el titular
  // lo dice, como el de la respuesta: «Con lo que hay registrado, tu caja…».
  const falta = queFaltaEnLaProyeccion(p);
  if (falta.provisional && (tono === "rojo" || tono === "ambar")) titular = conLoRegistrado(titular);
  return {
    tipo: "cayla",
    hoy: p.hoy,
    hasta,
    saldoHoy: r2(p.saldoHoy),
    deClaudia: r2(p.deClaudia ?? 0),
    porVolver: r2(p.porVolverCompras ?? 0),
    minimo,
    entra,
    sale,
    queda,
    puntos,
    porSemana: !cuadra,
    mayores: salidasGrandes(p.salidas, p.desde, hasta),
    bajaDelMinimo,
    sinPlata,
    masBajo,
    luego,
    titular,
    tono,
    provisional: falta.provisional,
    faltan: falta.faltan,
    sinPlanilla,
    ...(conInversion ? { conInversion } : {}),
  };
}

/**
 * El aviso «bajo tu mínimo de caja» de «Hoy te toca» dice lo MISMO que la tarjeta: el mismo día y el mismo monto. Antes el aviso miraba el cierre de
 * cada bloque de 7 días («la semana del 27 oct – 2 nov llegarías a −S/ 36,467») y la tarjeta el día («el 27 de octubre llegas a −S/ 41,522»): dos
 * números para un solo hecho. Y una caída DENTRO de la semana (la planilla del 28, un cobro el 29) que el bloque no ve —cierra sobre el mínimo— la
 * veía la tarjeta y el aviso ni nacía. Aquí, si la tarjeta ve que baja del mínimo, el aviso existe y habla con su número.
 * Si la tarjeta no puede decirlo (sin permiso, mirando una sede, no baja dentro de las dos semanas), el aviso queda como lo armó
 * `avisosParaDecidir`: cuando baja después, los dos ya coinciden porque ambos leen el mismo bloque.
 *
 * `hrefEscenarios`: a dónde lleva «Probar escenario»; `null` si la cuenta no ve Reportes (el aviso se lee igual, sin botón).
 */
export function alinearAvisoDeCaja(avisos: readonly Aviso[], caja: CajaProxima, hrefEscenarios: string | null): Aviso[] {
  if (caja.tipo !== "cayla" || !caja.masBajo || !caja.bajaDelMinimo) return [...avisos];
  const falta = r2(caja.minimo - caja.masBajo.saldo);
  const yaHoy = caja.bajaDelMinimo.fecha === caja.hoy;
  const del: Pick<Aviso, "titulo" | "detalle" | "impacto" | "tono" | "peso"> = {
    titulo: yaHoy ? "Hoy ya estás bajo tu mínimo de caja" : `El ${fechaEnPalabras(caja.bajaDelMinimo.fecha)} quedas bajo tu mínimo de caja`,
    detalle: caja.titular,
    impacto: `faltan ${soles(falta)}`,
    tono: caja.sinPlata ? "rojo" : "ambar",
    peso: falta,
  };
  if (avisos.some((a) => a.clave === "minimo")) return avisos.map((a) => (a.clave === "minimo" ? { ...a, ...del } : a));
  const nuevo: Aviso = { clave: "minimo", orden: ORDEN_AVISO_CAJA, ...del, href: hrefEscenarios, boton: "Probar escenario", origen: "Reportes ▸ Flujo de caja" };
  return ordenarAvisos([...avisos, nuevo]);
}
