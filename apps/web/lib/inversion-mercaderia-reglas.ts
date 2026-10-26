import { diasEntre, fechaEnPalabras, sumarDias, type PagoCaja } from "./caja-proxima-reglas";
import { soles, type Proyeccion } from "./flujo-caja-reglas";
import { ORDEN_AVISO_CAMPANA, type Aviso } from "./resumen-finanzas-reglas";

// Finanzas ▸ Resumen, «Inversión en mercadería» (Felipe 2026-10-26, spike «Resumen y campañas»). La plata que se pone en prendas para una campaña
// NO es un gasto: son prendas en el estante (inventario, NIC 2; en el ERP, `fn_bal_stock`) que sale de la CAJA el día que se paga y se vuelve
// COSTO el día que se vende. Por eso vive en su propio bloque y en la caja, nunca dentro de «Te deja».
//
// Contrato (con el Plan de campaña, `docs/maquetas/finanzas-v3-2026-10/resumen-campana/README.md`). PROMETE: leer del Plan, por campaña, lo
// planeado (sin IGV, el IGV y lo que sale de caja), el tope, lo pedido y lo pagado, hasta cuándo pedir, la lista de pagos (fecha, %) y si se
// ve en el Resumen. ASUME: que `plan = pagado + pedido sin pagar + falta pedir` (cada sol está en UNA sola etapa: lo ya facturado vive en Por
// pagar y en el flujo; la caja solo suma lo que aún no se pidió, o se contaría dos veces). NO CALCULA el IGV: lo marca el Plan por categoría.
// NO ESCRIBE nada: escoger entre formas de pagar es mirar; guardar un pago es del Plan.
//
// Todo es puro (sin red ni fecha del sistema): `hoy` entra como dato, así que cada regla se prueba con un día fijo.

export type PagoPlan = { fecha: string; pct: number };

/** Una campaña con compra, como la entrega el Plan. Los montos de `plan*`, `pedido` y `pagado` son SIN IGV; `igv` es lo que se suma al pagar. */
export type CampanaInversion = {
  id: string;
  nombre: string;
  /** Las fechas de la campaña («2026-12-01» a «2026-12-24»). */
  desde: string;
  hasta: string;
  planSinIgv: number;
  igv: number;
  tope: number | null;
  pedido: number;
  pagado: number;
  /** Hasta cuándo pedir para que llegue a tiempo; `null` si el plan no lo dice. */
  fechaLimite: string | null;
  /** Cómo piensa pagarlo, en fechas y porcentajes; vacío = el plan aún no lo dice. */
  pagos: PagoPlan[];
  /** Si el plan la deja ver en el Resumen (por defecto sí). */
  visible: boolean;
  /** Dónde se arma en el Plan de campaña. */
  hrefPlan: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const noNegativo = (n: number) => (n > 0 ? n : 0);
const num = (v: unknown, defecto = 0): number => (typeof v === "number" && Number.isFinite(v) ? v : defecto);
const fechaIso = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/**
 * Lee lo que entrega el Plan. Lo que no entiende lo deja fuera (una campaña sin id o sin fechas no se dibuja a medias) y nunca inventa un
 * número: un monto ausente es 0 solo donde 0 es verdad (lo pedido, lo pagado), y la lista de pagos que no suma 100 % se descarta entera.
 */
export function leerInversion(data: unknown): CampanaInversion[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((x): CampanaInversion[] => {
    const f = (x ?? {}) as Record<string, unknown>;
    const desde = fechaIso(f.desde);
    const hasta = fechaIso(f.hasta);
    if (typeof f.id !== "string" || typeof f.nombre !== "string" || !desde || !hasta) return [];
    const pagos = (Array.isArray(f.pagos) ? f.pagos : []).flatMap((p): PagoPlan[] => {
      const fecha = fechaIso((p as Record<string, unknown>)?.fecha);
      const pct = num((p as Record<string, unknown>)?.pct, NaN);
      return fecha && Number.isFinite(pct) && pct > 0 ? [{ fecha, pct }] : [];
    });
    const suma = pagos.reduce((a, p) => a + p.pct, 0);
    return [
      {
        id: f.id,
        nombre: f.nombre,
        desde,
        hasta,
        planSinIgv: noNegativo(num(f.plan_sin_igv)),
        igv: noNegativo(num(f.igv)),
        tope: typeof f.tope === "number" && f.tope > 0 ? f.tope : null,
        pedido: noNegativo(num(f.pedido)),
        pagado: noNegativo(num(f.pagado)),
        fechaLimite: fechaIso(f.fecha_limite),
        pagos: Math.abs(suma - 100) < 0.01 ? pagos : [],
        visible: f.visible !== false,
        hrefPlan: typeof f.href_plan === "string" ? f.href_plan : null,
      },
    ];
  });
}

// ---- En qué etapa está cada sol del plan ----------------------------------------------------------------------------------------------

export type RepartoCompra = {
  pagado: number;
  pedidoSinPagar: number;
  faltaPedir: number;
  /** Lo que ya se pidió de más sobre el plan; 0 si no pasa. */
  pasaDelPlan: number;
};

/** Parte el plan en etapas que no se pisan: `pagado + pedidoSinPagar + faltaPedir = plan` (salvo que se pida más que el plan: eso va aparte). */
export function repartoDeLaCompra(c: CampanaInversion): RepartoCompra {
  const pagado = Math.min(c.pagado, c.pedido, c.planSinIgv);
  const pedidoSinPagar = noNegativo(Math.min(c.pedido, c.planSinIgv) - pagado);
  const faltaPedir = noNegativo(c.planSinIgv - c.pedido);
  return { pagado: r2(pagado), pedidoSinPagar: r2(pedidoSinPagar), faltaPedir: r2(faltaPedir), pasaDelPlan: r2(noNegativo(c.pedido - c.planSinIgv)) };
}

/** Cuánto IGV lleva cada sol sin IGV de esta campaña (lo que el Plan marcó por categoría), como razón: 0,18 si todo lleva IGV, 0 si ninguno. */
export function razonIgv(c: CampanaInversion): number {
  return c.planSinIgv > 0 ? c.igv / c.planSinIgv : 0;
}

/** Lo que sale de caja por la campaña entera: el plan sin IGV más su IGV (si se cuenta). Es la cifra que dice la nota «de caja saldrán…». */
export function saleDeCajaDelPlan(c: CampanaInversion, conIgv: boolean): number {
  return r2(c.planSinIgv + (conIgv ? c.igv : 0));
}

/**
 * Lo que la caja todavía NO sabe: lo que falta pedir, con su IGV si se cuenta. Lo ya pedido está en Por pagar y en el flujo; sumarlo otra vez
 * sería contarlo dos veces (la regla anti doble conteo del contrato).
 */
export function pendienteDeCaja(c: CampanaInversion, conIgv: boolean): number {
  return r2(repartoDeLaCompra(c).faltaPedir * (1 + (conIgv ? razonIgv(c) : 0)));
}

// ---- Cuándo pagar: las formas de hacerlo -----------------------------------------------------------------------------------------------

export type Pago = PagoCaja;

export type FormaDePago = {
  clave: "plan" | "junto" | "tandas" | "plazo";
  nombre: string;
  detalle: string;
  pagos: Pago[];
  /** Qué parte de lo que falta pedir llega a tiempo para abrir la campaña (lo que se pide al llegar la fecha límite). */
  llegaAbrir: number;
  /** Algo que tiene que ser cierto para que esta forma valga (crédito del proveedor); `null` si no depende de nadie. */
  requiere: string | null;
};

/** Reparte `monto` en pagos de `pct` % (la suma de los porcentajes es 100); el último absorbe el redondeo, así los pagos suman EXACTO el monto. */
function repartir(monto: number, partes: readonly { fecha: string; pct: number }[]): Pago[] {
  let acumulado = 0;
  return partes.map((p, i) => {
    const m = i === partes.length - 1 ? r2(monto - acumulado) : r2((monto * p.pct) / 100);
    acumulado += m;
    return { fecha: p.fecha, monto: m };
  });
}

/**
 * Los pagos del plan que todavía no pasaron, con lo que falta pedir repartido entre ellos (los porcentajes se vuelven a sacar sobre lo que
 * queda: un pago que ya pasó se pagó, y con él la parte del plan que ya se pidió). Sin lista, el plan no dice cuándo: no se inventa una fecha.
 */
export function pagosPendientesDelPlan(c: CampanaInversion, hoy: string, conIgv: boolean): Pago[] {
  const monto = pendienteDeCaja(c, conIgv);
  const futuros = c.pagos.filter((p) => p.fecha >= hoy);
  const total = futuros.reduce((a, p) => a + p.pct, 0);
  if (monto <= 0 || total <= 0) return [];
  return repartir(
    monto,
    [...futuros].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((p) => ({ fecha: p.fecha, pct: (p.pct / total) * 100 })),
  );
}

/**
 * Las formas de pagar lo que falta pedir, para compararlas mirando la caja. «Tu plan» solo si el plan ya dice cómo; las otras tres salen de la
 * fecha límite (si no hay, no hay qué comparar). Ninguna se guarda: elegir una es mirar; guardarla es del Plan.
 */
export function formasDePago(c: CampanaInversion, hoy: string, conIgv: boolean): FormaDePago[] {
  const monto = pendienteDeCaja(c, conIgv);
  const limite = c.fechaLimite;
  if (monto <= 0 || !limite) return [];
  const formas: FormaDePago[] = [];
  const delPlan = pagosPendientesDelPlan(c, hoy, conIgv);
  if (delPlan.length) {
    formas.push({ clave: "plan", nombre: "Tu plan", detalle: "Como lo dejaste en el Plan de campaña", pagos: delPlan, llegaAbrir: 100, requiere: null });
  }
  formas.push(
    { clave: "junto", nombre: "Todo junto", detalle: "Pagas todo al pedir", pagos: repartir(monto, [{ fecha: limite, pct: 100 }]), llegaAbrir: 100, requiere: null },
    {
      clave: "tandas",
      nombre: "Dos tandas",
      detalle: "70 % ahora, 30 % para reponer lo que se acabe",
      pagos: repartir(monto, [{ fecha: limite, pct: 70 }, { fecha: sumarDias(limite, 14), pct: 30 }]),
      llegaAbrir: 70,
      requiere: null,
    },
    {
      clave: "plazo",
      nombre: "Pago a plazo",
      detalle: "Pides todo y pagas en tres cuotas",
      pagos: repartir(monto, [{ fecha: limite, pct: 40 }, { fecha: sumarDias(limite, 30), pct: 30 }, { fecha: sumarDias(limite, 60), pct: 30 }]),
      llegaAbrir: 100,
      requiere: "Tu proveedor tiene que darte crédito: confírmalo antes de contar con esto.",
    },
  );
  return formas;
}

// ---- La caja con la compra --------------------------------------------------------------------------------------------------------------

export type PuntoSaldo = { dia: number; fecha: string; saldo: number };

/** La caja de las próximas semanas SIN la compra: el saldo de hoy y el de cada cierre de semana, uniendo los puntos con rectas. */
export function saldoBase(p: Proyeccion): PuntoSaldo[] {
  const puntos: PuntoSaldo[] = [{ dia: 0, fecha: p.hoy, saldo: r2(p.saldoHoy) }];
  for (const s of p.semanas) {
    const dia = diasEntre(p.hoy, s.hasta);
    if (dia > puntos.at(-1)!.dia) puntos.push({ dia, fecha: s.hasta, saldo: r2(s.saldo) });
  }
  return puntos;
}

/** El saldo base de un día cualquiera, entre dos cierres de semana. Pasado el último cierre, se queda en el último. */
export function saldoBaseEn(base: readonly PuntoSaldo[], dia: number): number {
  const ultimo = base.at(-1);
  if (!ultimo) return 0;
  if (dia <= base[0]!.dia) return base[0]!.saldo;
  if (dia >= ultimo.dia) return ultimo.saldo;
  const k = base.findIndex((x) => x.dia >= dia);
  const a = base[k - 1]!;
  const b = base[k]!;
  return a.saldo + ((b.saldo - a.saldo) * (dia - a.dia)) / (b.dia - a.dia);
}

export type CajaConCompra = {
  /** Un punto por cierre de semana, por cada día de pago y por el día anterior (así el pago se ve como un escalón). */
  puntos: PuntoSaldo[];
  /** El punto más bajo y cuándo. */
  masBajo: PuntoSaldo;
  /** El primer día en negativo, si lo hay: la plata no alcanza. */
  sinPlata: PuntoSaldo | null;
  /** Cuántos días del horizonte quedan bajo el mínimo (0 si no hay mínimo puesto). */
  diasBajoMinimo: number;
  /** Cuánto sale por los pagos que caen dentro del horizonte. */
  salePorLaCompra: number;
  /** Pagos que caen después del último día que la proyección alcanza a ver: no se dibujan, pero se avisa. */
  fueraDelHorizonte: Pago[];
};

/** La caja con los pagos restados desde el día en que caen. `pagos` vacío devuelve la caja base. */
export function cajaConCompra(p: Proyeccion, pagos: readonly Pago[]): CajaConCompra | null {
  const base = saldoBase(p);
  const fin = base.at(-1)!.dia;
  if (fin <= 0) return null;
  const dentro = pagos.filter((x) => diasEntre(p.hoy, x.fecha) <= fin).map((x) => ({ ...x, dia: Math.max(0, diasEntre(p.hoy, x.fecha)) }));
  const fuera = pagos.filter((x) => diasEntre(p.hoy, x.fecha) > fin);
  const salido = (dia: number) => dentro.filter((x) => x.dia <= dia).reduce((a, x) => a + x.monto, 0);
  const diasClave = new Set<number>(base.map((b) => b.dia));
  for (const x of dentro) {
    diasClave.add(x.dia);
    if (x.dia > 0) diasClave.add(x.dia - 1);
  }
  const puntos = [...diasClave].sort((a, b) => a - b).map((dia) => ({ dia, fecha: sumarDias(p.hoy, dia), saldo: r2(saldoBaseEn(base, dia) - salido(dia)) }));
  let masBajo = puntos[0]!;
  for (const x of puntos) if (x.saldo < masBajo.saldo) masBajo = x;
  const sinPlata = puntos.find((x) => x.saldo < 0) ?? null;
  let bajo = 0;
  if (p.minimoCaja > 0) for (let d = 0; d <= fin; d++) if (saldoBaseEn(base, d) - salido(d) < p.minimoCaja) bajo++;
  return { puntos, masBajo, sinPlata, diasBajoMinimo: bajo, salePorLaCompra: r2(dentro.reduce((a, x) => a + x.monto, 0)), fueraDelHorizonte: fuera };
}

export type FormaEvaluada = FormaDePago & { caja: CajaConCompra | null };

/** Cada forma de pago con lo que le pasaría a la caja. */
export function evaluarFormas(p: Proyeccion, formas: readonly FormaDePago[]): FormaEvaluada[] {
  return formas.map((f) => ({ ...f, caja: cajaConCompra(p, f.pagos) }));
}

/**
 * La mejor mezcla entre las formas que no dependen de nadie: la caja nunca queda en negativo, llega a tiempo al menos el 70 % de lo que abre la
 * campaña, y entre esas gana la que pasa menos días bajo tu mínimo. Si ninguna cumple, no recomienda (nunca elige «la menos mala» en silencio).
 */
export function mejorMezcla(formas: readonly FormaEvaluada[]): FormaEvaluada["clave"] | null {
  const candidatas = formas.filter((f) => !f.requiere && f.caja && !f.caja.sinPlata && f.caja.masBajo.saldo >= 0 && f.llegaAbrir >= 70);
  if (!candidatas.length) return null;
  return [...candidatas].sort((a, b) => a.caja!.diasBajoMinimo - b.caja!.diasBajoMinimo || b.llegaAbrir - a.llegaAbrir)[0]!.clave;
}

/** Cuántos días faltan para pedir, o `null` si no hay fecha. Negativo: ya pasó. */
export function diasParaPedir(c: CampanaInversion, hoy: string): number | null {
  return c.fechaLimite ? diasEntre(hoy, c.fechaLimite) : null;
}

// ---- «Hoy te toca» ------------------------------------------------------------------------------------------------------------------------

/**
 * El aviso de lo que falta pedir de una campaña, para «Hoy te toca». Nace solo si hay algo por pedir y se sabe hasta cuándo (sin fecha no hay
 * urgencia que decir). Ámbar si quedan 7 días o menos o ya pasó; si no, informativo: la campaña no se arregla hoy, pero hay que verla.
 */
export function avisoDeInversion(c: CampanaInversion, hoy: string, conIgv: boolean): Aviso | null {
  const falta = pendienteDeCaja(c, conIgv);
  const dias = diasParaPedir(c, hoy);
  if (falta <= 0 || dias === null) return null;
  const detalle =
    dias >= 0
      ? `Pide antes del ${fechaEnPalabras(c.fechaLimite!)} (${dias === 0 ? "es hoy" : dias === 1 ? "falta 1 día" : `faltan ${dias} días`}) para que llegue a tiempo para la campaña.`
      : `La fecha para pedir pasó hace ${-dias === 1 ? "1 día" : `${-dias} días`}: lo que pidas ahora puede llegar con la campaña ya empezada.`;
  return {
    clave: `inversion:${c.id}`,
    tono: dias <= 7 ? "ambar" : "pizarra",
    titulo: `Inversión en mercadería · ${c.nombre}: te falta pedir ${soles(falta)}`,
    detalle,
    impacto: `${soles(falta)} sin pedir`,
    href: c.hrefPlan,
    boton: "Ver la campaña",
    origen: "Plan de campaña",
    orden: ORDEN_AVISO_CAMPANA,
    peso: falta,
  };
}

// ---- Qué forma de pago cuenta la caja ----------------------------------------------------------------------------------------------------

/**
 * La forma de pago que la caja cuenta para una campaña: la que la persona eligió si todavía existe; si no, «Tu plan» (lo que ya dejó escrito),
 * si no, la mejor mezcla y, si ninguna cumple, «Todo junto»: la más dura, para que la caja muestre el daño en vez de esconderlo. Eso no la vuelve
 * «la mejor mezcla»: esa etiqueta solo la lleva una que cumple. Sin ninguna forma que comparar (nada por pedir, sin fecha), `null`.
 */
export function formaEfectiva(formas: readonly FormaEvaluada[], elegida: string | null | undefined): FormaEvaluada | null {
  const dela = formas.find((f) => f.clave === elegida);
  if (dela) return dela;
  const plan = formas.find((f) => f.clave === "plan");
  if (plan) return plan;
  const mejor = mejorMezcla(formas);
  return formas.find((f) => f.clave === mejor) ?? formas.find((f) => f.clave === "junto") ?? formas[0] ?? null;
}

/** Todos los pagos que la caja suma: los de la forma efectiva de cada campaña que se ve. */
export function pagosDeLaCompra(campanas: readonly CampanaInversion[], p: Proyeccion, conIgv: boolean, elegidas: Readonly<Record<string, string>>): Pago[] {
  return campanas
    .flatMap((c) => formaEfectiva(evaluarFormas(p, formasDePago(c, p.hoy, conIgv)), elegidas[c.id])?.pagos ?? [])
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}
