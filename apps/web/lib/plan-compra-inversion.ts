// Plan de campaña — CÓMO SE PAGA lo que se compra, el IGV y lo que Finanzas lee de eso (ADR-0527, Felipe 2026-10-26, spike ⑤ «Cuándo se pide y se paga»).
// Lógica pura, sin React ni red.
//
// EL PROBLEMA. El Plan dice cuánto comprar y cuánto cuesta, pero no CUÁNDO sale esa plata de la caja ni qué parte es IGV. Y Finanzas, que sí necesita saberlo para decir si la caja aguanta,
// no tenía de dónde leerlo. Esto arma las dos cosas: la pantalla del Plan («Cuándo se paga») y el contrato con el Resumen de Finanzas («Inversión en mercadería»).
//
// LA IDEA. La persona arma el pago con TANDAS de pedido («el 40 % lo pido esta semana, el 60 % en dos») y una FORMA de pago por tanda (contado, a 30 días, anticipo…). Lo que se GUARDA y
// lo que Finanzas lee no son las tandas sino los PAGOS que salen de ellas: una lista de (fecha, %) que suma 100. Si mañana cambia la pantalla, Finanzas no se entera. Las tandas
// viajan con la foto solo para que la pantalla vuelva a abrirse como se dejó; la base no las lee.
//
// CONTRATO
//   PROMETE: que los pagos que salen de cualquier lista de tandas sumen EXACTO 100 (centésimo a centésimo), con fechas que existen y sin repetir (lo que la base exige, `fn_pagos_de_compra_validos`);
//            que el IGV de una categoría sea 18 % de su valor sin IGV, venga el costo con él o sin él (la marca solo cambia el valor sin IGV); que lo que Finanzas lee sea cada sol en UNA sola etapa
//            (`plan = pedido + falta pedir`; lo pagado va dentro de lo pedido); y que lo que no se pudo leer sea null, nunca un cero que parezca un dato.
//   ASUME: que el costo de las categorías que NO están marcadas está SIN IGV y que las órdenes de compra de una categoría se anotan igual que su costo en el Plan (con o sin IGV, según la marca).
//   NO HACE: no guarda nada (eso es la base), no calcula cuánto comprar (eso es `calcular`) ni sabe cómo se dibuja el Resumen (eso es `inversion-mercaderia-reglas`).

import { diaMes, esFechaQueExiste, sumarDias } from "./fechas-lima";
import type { LecturaPedido } from "./plan-compra-pedido";
import type { PlazoDePedido } from "./plan-compra-plazo";
import type { FilaPlan } from "./plan-compra-reglas";

export const RPC_PAGOS = "fn_plan_compra_pagos";
export const RPC_PAGADO = "fn_plan_compra_pagado";
export const RPC_GUARDAR_PAGOS = "guardar_plan_compra_pagos";
export const RPC_VISIBILIDAD = "cambiar_visibilidad_plan_compra";

/** El IGV de Perú. Una sola vez en todo el Plan. */
export const TASA_IGV = 0.18;
export const MAX_TANDAS = 3;
/** Lo que mira hacia adelante el selector «Semana del pedido»: al menos 8 semanas, y hasta el último día para pedir si cae más lejos (con un tope: nadie planea pagos a más de medio año). */
const DIAS_MINIMOS_PARA_PEDIR = 56;
const DIAS_MAXIMOS_PARA_PEDIR = 182;
/** Lo que la base acepta como lista de pagos (`fn_pagos_de_compra_validos`): de 1 a 24 pagos. */
export const MAX_PAGOS = 24;
/** El formato de las tandas que se guardan junto a los pagos: sube si cambia, para poder leer fotos viejas. */
const VERSION_DE_TANDAS = 1;

const r2 = (n: number) => Math.round(n * 100) / 100;
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);
const numero = (v: unknown): number => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
};
const fechaIso = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && esFechaQueExiste(v) ? v : null);

// ---------------------------------------------------------------------------------------------------------------------
// 1. Si Finanzas la ve
// ---------------------------------------------------------------------------------------------------------------------

export type VisibilidadFinanzas = "todo" | "escenarios" | "nada";
export const VISIBILIDADES: readonly VisibilidadFinanzas[] = ["todo", "escenarios", "nada"];

/**
 * Lo que cada estado dice. HOY solo el Resumen de Finanzas lee la compra (y «Tu caja», dentro del Resumen): el flujo de caja de Reportes y Escenarios todavía no la leen, y
 * la pantalla no promete lo que no existe. Cuando se conecten, esta es la única frase que cambia.
 */
export const TEXTO_DE_VISIBILIDAD: Record<VisibilidadFinanzas, { corto: string; nota: string }> = {
  todo: {
    corto: "Se hará: todo Finanzas",
    nota: "Se hará. La inversión sale en el Resumen de Finanzas y en tu caja de las próximas semanas, para que sepas qué pagos vienen y puedas guardar plata o anticiparte.",
  },
  escenarios: {
    corto: "Solo en Escenarios",
    nota: "Es una idea: sirve para el «¿y si compro esto?» de Escenarios, pero no sale en el Resumen ni en tu caja. Escenarios todavía no la lee: se conectará.",
  },
  nada: {
    corto: "No mostrarla",
    nota: "Finanzas no la ve en ningún sitio. Lo ya registrado de verdad (órdenes, facturas por pagar) sigue contando.",
  },
};

const esVisibilidad = (v: unknown): v is VisibilidadFinanzas => v === "todo" || v === "escenarios" || v === "nada";

// ---------------------------------------------------------------------------------------------------------------------
// 2. Las formas de pago y las tandas
// ---------------------------------------------------------------------------------------------------------------------

export type FormaDePago = "contado" | "d30" | "d60" | "a50" | "a30";
/** Cada forma: cuántos días después del pedido cae cada cuota y qué parte de la tanda es. */
export const FORMAS_DE_PAGO: Record<FormaDePago, { nombre: string; cuotas: readonly { dias: number; parte: number }[] }> = {
  contado: { nombre: "Contado", cuotas: [{ dias: 0, parte: 1 }] },
  d30: { nombre: "A 30 días", cuotas: [{ dias: 30, parte: 1 }] },
  d60: { nombre: "A 60 días", cuotas: [{ dias: 60, parte: 1 }] },
  a50: { nombre: "50 % de anticipo y el resto a 30 días", cuotas: [{ dias: 0, parte: 0.5 }, { dias: 30, parte: 0.5 }] },
  a30: { nombre: "30 % de anticipo y el resto a 60 días", cuotas: [{ dias: 0, parte: 0.3 }, { dias: 60, parte: 0.7 }] },
};
export const ORDEN_DE_FORMAS: readonly FormaDePago[] = ["contado", "d30", "d60", "a50", "a30"];
const esForma = (v: unknown): v is FormaDePago => typeof v === "string" && v in FORMAS_DE_PAGO;

/** Una tanda de compra: el día del pedido, qué % de la compra es y cómo se paga. */
export type Tanda = { pedido: string; pct: number; forma: FormaDePago };
export type PagoDeCompra = { fecha: string; pct: number };

/** Los % por defecto de 1, 2 o 3 tandas (el último se ajusta solo para que sumen 100). */
export const PCT_POR_DEFECTO: Record<1 | 2 | 3, readonly number[]> = { 1: [100], 2: [60, 40], 3: [50, 30, 20] };

/**
 * Los inicios de las semanas que ofrece «Semana del pedido»: hoy (la semana que corre) y los lunes que siguen, al menos 8 semanas y hasta `hasta` (el último día para pedir) si cae más lejos,
 * con un tope de medio año. Anclar a lunes y no a «hoy + 7» hace que una fecha guardada ayer siga siendo una de las opciones hoy.
 */
export function semanasDePedido(hoy: string, hasta?: string | null): string[] {
  const dia = new Date(`${hoy}T12:00:00Z`).getUTCDay();
  const alLunes = ((8 - dia) % 7) || 7;
  const minimo = sumarDias(hoy, DIAS_MINIMOS_PARA_PEDIR);
  const tope = sumarDias(hoy, DIAS_MAXIMOS_PARA_PEDIR);
  const fin = hasta && hasta > minimo ? (hasta < tope ? hasta : tope) : minimo;
  const semanas = [hoy];
  for (let lunes = sumarDias(hoy, alLunes); lunes <= fin; lunes = sumarDias(lunes, 7)) semanas.push(lunes);
  return semanas;
}

/**
 * Las tandas con que arranca una campaña sin nada guardado: todas a tiempo (la última, en la semana de la fecha límite; las demás, una semana antes cada una) y a CONTADO, que es lo único
 * seguro mientras no se sepa si el proveedor da crédito. `limite` null (la campaña ya empezó o no hay plazo): todas en la semana de hoy.
 */
export function tandasPorDefecto(n: 1 | 2 | 3, hoy: string, limite: string | null): Tanda[] {
  const semanas = semanasDePedido(hoy, limite);
  // La última semana que empieza a más tardar el día límite; si no hay límite (o ya pasó), la de hoy.
  let ultima = 0;
  if (limite !== null && limite >= hoy) {
    for (let k = 0; k < semanas.length; k++) if (semanas[k]! <= limite) ultima = k;
  }
  return PCT_POR_DEFECTO[n].map((pct, k) => ({ pedido: semanas[Math.max(0, ultima - (n - 1 - k))]!, pct, forma: "contado" }));
}

/** Deja los % de las tandas sumando 100: la última toma lo que falta (nunca menos de 0). Las demás se topan en 0–100. */
export function ajustarPorcentajes(tandas: readonly Tanda[]): Tanda[] {
  if (tandas.length === 0) return [];
  const topadas = tandas.map((t) => ({ ...t, pct: Math.min(100, Math.max(0, Math.round(t.pct))) }));
  const sinUltima = topadas.slice(0, -1).reduce((s, t) => s + t.pct, 0);
  const ultima = topadas.length - 1;
  // Si las anteriores ya pasan de 100, se recortan desde atrás para que la última pueda quedar en 0 y todo siga sumando 100.
  let exceso = Math.max(0, sinUltima - 100);
  for (let i = ultima - 1; i >= 0 && exceso > 0; i--) {
    const quita = Math.min(topadas[i]!.pct, exceso);
    topadas[i] = { ...topadas[i]!, pct: topadas[i]!.pct - quita };
    exceso -= quita;
  }
  topadas[ultima] = { ...topadas[ultima]!, pct: Math.max(0, 100 - topadas.slice(0, -1).reduce((s, t) => s + t.pct, 0)) };
  return topadas;
}

/**
 * Los pagos (fecha, %) de una lista de tandas: cada cuota cae `dias` después del pedido; las que caen el mismo día se suman. Suman EXACTO 100 (en centésimos enteros: la última toma el
 * residuo, así dos tandas de 33 % no dejan 99,99 %). Una cuota de 0 % no es un pago.
 */
export function pagosDeLasTandas(tandas: readonly Tanda[]): PagoDeCompra[] {
  const centesimas = new Map<string, number>();
  for (const t of tandas) {
    for (const c of FORMAS_DE_PAGO[t.forma].cuotas) {
      const fecha = sumarDias(t.pedido, c.dias);
      centesimas.set(fecha, (centesimas.get(fecha) ?? 0) + t.pct * c.parte * 100);
    }
  }
  const fechas = [...centesimas.keys()].filter((f) => Math.round(centesimas.get(f)!) > 0).sort();
  let acumulado = 0;
  return fechas.map((fecha, i) => {
    const c = i === fechas.length - 1 ? 10000 - acumulado : Math.round(centesimas.get(fecha)!);
    acumulado += c;
    return { fecha, pct: c / 100 };
  });
}

/**
 * Lo mismo que la base exige de una lista de pagos (`fn_pagos_de_compra_validos`): de 1 a 24, fechas que existen y sin repetir, cada % de 0,01 a 100 y la suma exacta 100. La pantalla no deja
 * guardar lo que la base rechazaría; la base lo rechaza igual si alguien llega por otra puerta.
 */
export function pagosSonValidos(pagos: readonly PagoDeCompra[]): boolean {
  if (pagos.length < 1 || pagos.length > MAX_PAGOS) return false;
  const vistas = new Set<string>();
  let centesimas = 0;
  for (const p of pagos) {
    if (!fechaIso(p.fecha) || vistas.has(p.fecha) || !(p.pct >= 0.01) || p.pct > 100) return false;
    vistas.add(p.fecha);
    centesimas += Math.round(p.pct * 100);
  }
  return centesimas === 10000;
}

/** ¿Una tanda se pide después de la fecha límite? Entonces llega a las tiendas con la campaña ya empezada. Sin fecha límite (la campaña ya empezó) no hay «tarde». */
export const tandaLlegaTarde = (t: Pick<Tanda, "pedido">, limite: string | null): boolean => limite !== null && t.pedido > limite;

/** «Con 14 días para llegar, esa tanda entra a las tiendas el 3 dic, después de que empieza la campaña (1 dic).» */
export function frasePorQueLlegaTarde(t: Pick<Tanda, "pedido">, dias: number, desde: string): string {
  return `Con ${dias} ${dias === 1 ? "día" : "días"} para llegar, esa tanda entra a las tiendas el ${diaMes(sumarDias(t.pedido, dias))}, después de que empieza la campaña (${diaMes(desde)}).`;
}

/** Las tandas tal como se guardan junto a los pagos (la base no las lee). */
export const tandasParaGuardar = (tandas: readonly Tanda[]) => ({ v: VERSION_DE_TANDAS, tandas: tandas.map((t) => ({ pedido: t.pedido, pct: t.pct, forma: t.forma })) });

/** Las tandas guardadas; null si no se entienden (entonces la pantalla arranca con las de por defecto, sin inventar lo que había). */
export function leerTandas(v: unknown): Tanda[] | null {
  if (!esObjeto(v) || v.v !== VERSION_DE_TANDAS || !Array.isArray(v.tandas)) return null;
  const tandas = v.tandas.flatMap((x): Tanda[] => {
    if (!esObjeto(x)) return [];
    const pedido = fechaIso(x.pedido);
    const pct = numero(x.pct);
    return pedido && esForma(x.forma) && Number.isInteger(pct) && pct >= 0 && pct <= 100 ? [{ pedido, pct, forma: x.forma }] : [];
  });
  const suma = tandas.reduce((s, t) => s + t.pct, 0);
  return tandas.length >= 1 && tandas.length <= MAX_TANDAS && tandas.length === v.tandas.length && suma === 100 ? tandas : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// 3. El IGV
// ---------------------------------------------------------------------------------------------------------------------

export type CostoConIgv = {
  clave: string;
  nombre: string;
  /** El costo del plan, tal como está en el Plan (con o sin IGV, según la marca). */
  inversion: number;
  /** La persona marcó que ese costo YA incluye el IGV. */
  incluido: boolean;
  /** Lo que se le paga al proveedor, sin IGV. */
  sinIgv: number;
  igv: number;
  /** Lo que sale de la caja: el valor sin IGV más su IGV. */
  saleDeCaja: number;
};
export type CostosConIgv = { filas: CostoConIgv[]; inversion: number; sinIgv: number; igv: number; saleDeCaja: number };

/**
 * Por categoría: si el costo YA trae el IGV, lo que sale de caja es el costo y el valor sin IGV es el costo ÷ 1,18; si no, al costo se le suma el 18 %. En los dos casos el IGV es 18 % del
 * valor sin IGV. Se ordena de la categoría que más cuesta a la que menos (a igual costo, por nombre). Las que no cuestan nada no entran.
 */
export function costosConIgv(filas: readonly { clave: string; nombre: string; inversion: number }[], incluidas: ReadonlySet<string>): CostosConIgv {
  const lista = filas
    .filter((f) => f.inversion > 0)
    .map((f): CostoConIgv => {
      const incluido = incluidas.has(f.clave);
      const sinIgv = incluido ? r2(f.inversion / (1 + TASA_IGV)) : r2(f.inversion);
      const saleDeCaja = incluido ? r2(f.inversion) : r2(f.inversion * (1 + TASA_IGV));
      return { clave: f.clave, nombre: f.nombre, inversion: r2(f.inversion), incluido, sinIgv, igv: r2(saleDeCaja - sinIgv), saleDeCaja };
    })
    .sort((a, b) => b.inversion - a.inversion || a.nombre.localeCompare(b.nombre, "es"));
  const suma = (k: "inversion" | "sinIgv" | "igv" | "saleDeCaja") => r2(lista.reduce((s, x) => s + x[k], 0));
  return { filas: lista, inversion: suma("inversion"), sinIgv: suma("sinIgv"), igv: suma("igv"), saleDeCaja: suma("saleDeCaja") };
}

/**
 * Qué categorías caen en cada tanda, dicho para que la persona se las imagine (no se guarda ni lo lee Finanzas): de la que más cuesta a la que menos, cada tanda toma categorías hasta cubrir
 * su parte acumulada de la compra; la última se queda con lo que reste. Una tanda de 0 % no toma ninguna. Devuelve las claves de categoría de cada tanda, en el orden de las tandas.
 */
export function categoriasPorTanda(filas: readonly { clave: string; saleDeCaja: number }[], tandas: readonly Pick<Tanda, "pct">[]): string[][] {
  const orden = [...filas].filter((f) => f.saleDeCaja > 0).sort((a, b) => b.saleDeCaja - a.saleDeCaja);
  const total = orden.reduce((s, f) => s + f.saleDeCaja, 0);
  let asignado = 0;
  let acumuladoPct = 0;
  return tandas.map((t, i) => {
    acumuladoPct += t.pct;
    const meta = (total * acumuladoPct) / 100;
    const mias: string[] = [];
    if (t.pct <= 0) return mias;
    // La última tanda con compra se lleva lo que quede; las demás, hasta cubrir su meta (con S/ 1 de tolerancia, como lo haría quien lo reparte a ojo).
    const hayMasConCompra = tandas.slice(i + 1).some((x) => x.pct > 0);
    while (orden.length > 0 && (!hayMasConCompra || asignado < meta - 1)) {
      const f = orden.shift()!;
      mias.push(f.clave);
      asignado += f.saleDeCaja;
    }
    return mias;
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// 4. Mes a mes
// ---------------------------------------------------------------------------------------------------------------------

export type SalidaDelMes = { clave: string; nombre: string; monto: number };
const NOMBRE_DEL_MES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/**
 * Lo que sale de caja en cada uno de los 3 meses que empiezan con el de hoy y, aparte, «más adelante». Un pago con fecha de antes del mes de hoy (ya pasó) se cuenta en el primero:
 * no se pierde plata de la cuenta por haber caído ayer.
 */
export function salidaPorMes(pagos: readonly PagoDeCompra[], saleDeCaja: number, hoy: string): SalidaDelMes[] {
  const anio = Number(hoy.slice(0, 4));
  const mes0 = Number(hoy.slice(5, 7)) - 1;
  const meses = [0, 1, 2].map((k) => {
    const m = (mes0 + k) % 12;
    const a = anio + Math.floor((mes0 + k) / 12);
    return { clave: `${a}-${String(m + 1).padStart(2, "0")}`, nombre: NOMBRE_DEL_MES[m]!, monto: 0 };
  });
  const adelante: SalidaDelMes = { clave: "despues", nombre: "Más adelante", monto: 0 };
  for (const p of pagos) {
    const monto = (saleDeCaja * p.pct) / 100;
    const destino = p.fecha.slice(0, 7) <= meses[0]!.clave ? meses[0]! : (meses.find((m) => m.clave === p.fecha.slice(0, 7)) ?? adelante);
    destino.monto += monto;
  }
  return [...meses, adelante].map((m) => ({ ...m, monto: r2(m.monto) }));
}

// ---------------------------------------------------------------------------------------------------------------------
// 5. Leer lo que la base guarda
// ---------------------------------------------------------------------------------------------------------------------

export type FotoDePagos = {
  version: number;
  pagos: PagoDeCompra[];
  /** Las tandas con que se armó; null si no se entienden. */
  tandas: Tanda[] | null;
  /** Los ids de las categorías cuyo costo ya incluye el IGV. */
  igvIncluido: string[];
  por: string | null;
  en: string | null;
};
export type LecturaPagos = {
  planId: string;
  visibilidad: VisibilidadFinanzas;
  visibilidadPor: string | null;
  visibilidadEn: string | null;
  guardado: FotoDePagos | null;
};

/** Lo que devuelve `fn_plan_compra_pagos`. null si la base todavía no la tiene (sin la marca `soportado`) o no se entiende: la pantalla no ofrece nada. */
export function leerPagos(v: unknown): LecturaPagos | null {
  if (!esObjeto(v) || v.soportado !== true || !esObjeto(v.plan)) return null;
  const planId = texto(v.plan.id);
  if (!planId) return null;
  const g = esObjeto(v.guardado) ? v.guardado : null;
  const guardado: FotoDePagos | null = g
    ? {
        version: Math.max(0, Math.round(numero(g.version))),
        pagos: (Array.isArray(g.pagos) ? g.pagos : []).flatMap((p): PagoDeCompra[] => {
          const fecha = esObjeto(p) ? fechaIso(p.fecha) : null;
          const pct = esObjeto(p) ? numero(p.pct) : 0;
          return fecha && pct > 0 ? [{ fecha, pct }] : [];
        }),
        tandas: leerTandas(g.tandas),
        igvIncluido: (Array.isArray(g.igv_incluido) ? g.igv_incluido : []).filter((x): x is string => typeof x === "string"),
        por: texto(g.por),
        en: texto(g.en),
      }
    : null;
  return {
    planId,
    visibilidad: esVisibilidad(v.plan.visibilidad_finanzas) ? v.plan.visibilidad_finanzas : "todo",
    visibilidadPor: texto(v.plan.por),
    visibilidadEn: texto(v.plan.en),
    guardado,
  };
}

export type LecturaPagado = { comprobantes: number; facturadoSinIgv: number; pagadoSinIgv: number; pagadoTotal: number };

/** Lo que devuelve `fn_plan_compra_pagado`: lo facturado y lo ya pagado de las órdenes de la campaña. null si la base no lo tiene o no se entiende (nunca un 0 inventado). */
export function leerPagado(v: unknown): LecturaPagado | null {
  if (!esObjeto(v) || v.soportado !== true) return null;
  return {
    comprobantes: Math.max(0, Math.round(numero(v.comprobantes))),
    facturadoSinIgv: Math.max(0, numero(v.facturado_sin_igv)),
    pagadoSinIgv: Math.max(0, numero(v.pagado_sin_igv)),
    pagadoTotal: Math.max(0, numero(v.pagado_total)),
  };
}

/** Los argumentos de `guardar_plan_compra_pagos`: la lista de pagos que salen de las tandas, las tandas (opacas para la base), las categorías con IGV incluido y la versión que se leyó. */
export const argsGuardarPagos = (planId: string, tandas: readonly Tanda[], igvIncluido: ReadonlySet<string>, versionEsperada: number) => ({
  p_plan_id: planId,
  p_pagos: pagosDeLasTandas(tandas),
  p_tandas: tandasParaGuardar(tandas),
  p_igv_incluido: [...igvIncluido].sort(),
  p_version_esperada: versionEsperada,
});

// ---------------------------------------------------------------------------------------------------------------------
// 6. Lo que lee Finanzas
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Lo pedido en órdenes, SIN IGV. Las órdenes de una categoría se anotan como su costo en el Plan: si esa categoría está marcada «ya incluye el IGV», lo pedido también lo trae y se le quita;
 * si no, ya es el valor sin IGV.
 */
export function pedidoSinIgv(pedido: LecturaPedido | null, incluidas: ReadonlySet<string>): number {
  if (!pedido) return 0;
  let total = 0;
  for (const [categoriaId, p] of pedido.porCategoria) total += incluidas.has(categoriaId) ? p.soles / (1 + TASA_IGV) : p.soles;
  return r2(total);
}

export type EntradaParaFinanzas = {
  plan: { id: string; nombre: string; desde: string; hasta: string };
  /** Las filas del Plan con su cuenta hecha (`armarFilas`): de ahí sale lo que falta pedir. */
  filas: readonly Pick<FilaPlan, "c" | "calculo">[];
  pedido: LecturaPedido | null;
  tope: number | null;
  plazo: Pick<PlazoDePedido, "limite">;
  pagos: LecturaPagos;
  pagado: LecturaPagado;
};

/**
 * La campaña como la lee el Resumen de Finanzas (`leerInversion`, claves en snake_case). Partición, cada sol en UNA sola etapa:
 *     plan = pedido (de lo cual ya se pagó `pagado`) + falta pedir
 * donde «falta pedir» es la compra que el Plan todavía pide (sin lo que ya hay ni lo que viene en camino) y «pedido», lo que ya está en órdenes. Todo SIN IGV; el IGV es el de la campaña
 * entera (18 % del valor sin IGV) y es lo que Finanzas suma al pagar. La lista de pagos es la que se guardó y describe cómo se paga lo que FALTA pedir.
 */
export function campanaParaFinanzas(e: EntradaParaFinanzas): Record<string, unknown> {
  const incluidas = new Set(e.pagos.guardado?.igvIncluido ?? []);
  const falta = costosConIgv(
    e.filas.flatMap((f) => (f.calculo ? [{ clave: f.c.id, nombre: f.c.nombre, inversion: f.calculo.inversion }] : [])),
    incluidas,
  );
  const pedidoSin = pedidoSinIgv(e.pedido, incluidas);
  const planSinIgv = r2(pedidoSin + falta.sinIgv);
  return {
    id: e.plan.id,
    nombre: e.plan.nombre,
    desde: e.plan.desde,
    hasta: e.plan.hasta,
    plan_sin_igv: planSinIgv,
    igv: r2(planSinIgv * TASA_IGV),
    tope: e.tope,
    pedido: pedidoSin,
    pagado: e.pagado.pagadoSinIgv,
    fecha_limite: e.plazo.limite,
    pagos: e.pagos.guardado?.pagos ?? [],
    visibilidad_finanzas: e.pagos.visibilidad,
    href_plan: `/compras/plan?plan=${e.plan.id}`,
  };
}
