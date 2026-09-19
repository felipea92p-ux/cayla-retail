// Reglas puras de Proveedores (maquetas 08 y 09, ADR-0111; vista rápida y mini-tendencias, ADR-0128).
// Sin I/O: se prueban sin base.

import { soles } from "./compras-reglas";

// ---------------------------------------------------------------------------
// Rubro: texto libre a propósito (ADR-0094) — sin vocabulario cerrado. Para que «Tela», «tela » y
// «Telas» no se partan en tres filtros se agrupa por una clave normalizada; se muestra la
// escritura más común de cada grupo.
// ---------------------------------------------------------------------------

export function claveRubro(rubro: string | null | undefined): string {
  return (rubro ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export type RubroConConteo = { clave: string; etiqueta: string; conteo: number };

/** Rubros distintos con su conteo, del más numeroso al menos; los proveedores sin rubro no cuentan. */
export function rubrosConConteo(proveedores: { rubro: string | null }[]): RubroConConteo[] {
  const grupos = new Map<string, { escrituras: Map<string, number>; conteo: number }>();
  for (const p of proveedores) {
    const k = claveRubro(p.rubro);
    if (!k) continue;
    const g = grupos.get(k) ?? { escrituras: new Map(), conteo: 0 };
    const escrita = (p.rubro ?? "").trim().replace(/\s+/g, " ");
    g.escrituras.set(escrita, (g.escrituras.get(escrita) ?? 0) + 1);
    g.conteo += 1;
    grupos.set(k, g);
  }
  return [...grupos.entries()]
    .map(([clave, g]) => ({ clave, etiqueta: [...g.escrituras.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0], conteo: g.conteo }))
    .sort((a, b) => b.conteo - a.conteo || a.etiqueta.localeCompare(b.etiqueta, "es"));
}

// ---------------------------------------------------------------------------
// Orden de la tabla: por saldo (a quién le debo más) por defecto.
// ---------------------------------------------------------------------------

export type CampoOrden = "saldo" | "favor" | "facturado" | "ultima" | "nombre";
export type Orden = { campo: CampoOrden; dir: "asc" | "desc" };

type Ordenable = { nombre: string; saldo: number | null; facturado_12m: number | null; ultima_compra: string | null; saldo_favor?: number | null };

const VALOR: Record<CampoOrden, (p: Ordenable) => number | string | null> = {
  saldo: (p) => p.saldo,
  favor: (p) => p.saldo_favor ?? null,
  facturado: (p) => p.facturado_12m,
  ultima: (p) => p.ultima_compra,
  nombre: (p) => p.nombre,
};

/** Ordena sin mutar. Los valores vacíos (sin compras) van siempre al final, sea cual sea la dirección. */
export function ordenarProveedores<T extends Ordenable>(lista: T[], orden: Orden): T[] {
  const signo = orden.dir === "asc" ? 1 : -1;
  return [...lista].sort((a, b) => {
    const va = VALOR[orden.campo](a);
    const vb = VALOR[orden.campo](b);
    if (va == null && vb == null) return a.nombre.localeCompare(b.nombre, "es");
    if (va == null) return 1;
    if (vb == null) return -1;
    const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "es");
    return c === 0 ? a.nombre.localeCompare(b.nombre, "es") : c * signo;
  });
}

/** Al tocar un encabezado: el mismo campo invierte; uno nuevo arranca en descendente (lo mayor primero), salvo el nombre. */
export function siguienteOrden(actual: Orden, campo: CampoOrden): Orden {
  if (actual.campo === campo) return { campo, dir: actual.dir === "desc" ? "asc" : "desc" };
  return { campo, dir: campo === "nombre" ? "asc" : "desc" };
}

// ---------------------------------------------------------------------------
// Entregas: lo que dice la columna «Entregas» de cada proveedor.
// ---------------------------------------------------------------------------

export type ChipEntregas = { tono: "ambar" | "neutro" | "verde"; texto: string };

/** Atrasadas (lo que hay que reclamar) > por recibir > al día. `null` si nunca se le compró. */
export function chipEntregas(p: { facturas: number | null; facturas_atrasadas: number | null; entregas_por_recibir: number | null }): ChipEntregas | null {
  if (!p.facturas) return null;
  const atrasadas = p.facturas_atrasadas ?? 0;
  if (atrasadas > 0) return { tono: "ambar", texto: `${atrasadas} ${atrasadas === 1 ? "atrasada" : "atrasadas"}` };
  const porRecibir = p.entregas_por_recibir ?? 0;
  if (porRecibir > 0) return { tono: "neutro", texto: `${porRecibir} por recibir` };
  return { tono: "verde", texto: "Al día" };
}

// ---------------------------------------------------------------------------
// Contacto
// ---------------------------------------------------------------------------

/**
 * Enlace de WhatsApp a partir del teléfono guardado. Un móvil peruano tiene 9 dígitos y empieza en
 * 9: se le antepone el 51. Si ya trae el 51 se respeta. Un fijo o un número raro devuelve `null`
 * (mejor sin botón que un botón que abre un chat equivocado).
 */
export function urlWhatsApp(telefono: string | null | undefined): string | null {
  const d = (telefono ?? "").replace(/\D/g, "");
  if (/^9\d{8}$/.test(d)) return `https://wa.me/51${d}`;
  if (/^519\d{8}$/.test(d)) return `https://wa.me/${d}`;
  return null;
}

// ---------------------------------------------------------------------------
// Evolución del costo
// ---------------------------------------------------------------------------

/** Variación porcentual del primer al último costo, con un decimal; `null` con menos de 2 puntos. */
export function variacionCosto(costos: number[]): number | null {
  if (costos.length < 2 || costos[0] <= 0) return null;
  return Math.round(((costos[costos.length - 1] - costos[0]) / costos[0]) * 1000) / 10;
}

/** ¿Sube en cada compra? Solo entonces se puede decir «sube en cada compra». */
export function subeEnCadaCompra(costos: number[]): boolean {
  return costos.length >= 2 && costos.every((c, i) => i === 0 || c > costos[i - 1]);
}

// ---------------------------------------------------------------------------
// Facturado por mes (ADR-0128): la forma detrás de «Facturado 12 m».
// ---------------------------------------------------------------------------

/**
 * Doce montos, del mes más antiguo al actual (el último es el mes de `hoy`). `fn_proveedores_serie_12m`
 * solo devuelve los meses CON compras; acá se rellenan los demás con 0 — un mes sin compras es un cero
 * real, no un dato que falta. Lo que caiga fuera de la ventana se ignora.
 */
export function serie12Meses(filas: { mes: string; monto: number }[], hoy: string): number[] {
  const [y, m] = hoy.split("-").map(Number);
  const serie = Array<number>(12).fill(0);
  for (const f of filas) {
    const [fy, fm] = f.mes.split("-").map(Number);
    const idx = 11 - (y * 12 + m - (fy * 12 + fm));
    if (idx >= 0 && idx < 12) serie[idx] += f.monto;
  }
  return serie;
}

const INICIAL_MES = "EFMAMJJASOND";

/** La inicial de cada uno de los doce meses de la serie, alineada con `serie12Meses`. */
export function inicialesMeses(hoy: string): string[] {
  const m = Number(hoy.split("-")[1]);
  return Array.from({ length: 12 }, (_, k) => INICIAL_MES[(m - 1 - (11 - k) + 24) % 12]);
}

// ---------------------------------------------------------------------------
// Reparto de la deuda: la barra de «Concentración».
// ---------------------------------------------------------------------------

export type TramoDeuda = { id: string | null; nombre: string; monto: number; pct: number };

/** Los tres proveedores que más se les debe y «Resto» (`id: null`). Sin deuda, sin tramos. */
export function repartoDeuda(ps: { id: string; nombre: string; saldo: number | null }[], maximo = 3): TramoDeuda[] {
  const conSaldo = ps.filter((p) => (p.saldo ?? 0) > 0).sort((a, b) => (b.saldo ?? 0) - (a.saldo ?? 0));
  const total = conSaldo.reduce((s, p) => s + (p.saldo ?? 0), 0);
  if (total <= 0) return [];
  const top = conSaldo.slice(0, maximo).map((p) => ({ id: p.id as string | null, nombre: p.nombre, monto: p.saldo ?? 0, pct: ((p.saldo ?? 0) / total) * 100 }));
  const resto = total - top.reduce((s, t) => s + t.monto, 0);
  return resto > 0 ? [...top, { id: null, nombre: "Resto", monto: resto, pct: (resto / total) * 100 }] : top;
}

// ---------------------------------------------------------------------------
// «Hace cuánto»
// ---------------------------------------------------------------------------

/** «hoy», «ayer», «hace 6 d», «hace 3 meses», «Nunca». Meses de 30 días: es una lectura, no un calendario. */
export function haceCuanto(dias: number | null | undefined): string {
  if (dias == null) return "Nunca";
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  if (dias < 30) return `hace ${dias} d`;
  const meses = Math.floor(dias / 30);
  return `hace ${meses} ${meses === 1 ? "mes" : "meses"}`;
}

// ---------------------------------------------------------------------------
// Siguiente paso: «¿y ahora qué?» de un proveedor, en una línea.
// ---------------------------------------------------------------------------

export type SiguientePaso = {
  tono: "rojo" | "ambar" | "verde" | "neutro";
  /** Lo que va en negrita. */
  fuerte: string;
  resto: string;
  accion: "pagar" | "recibir" | "favor" | "desactivar" | "reactivar" | null;
};

/** Lo que hace falta saber de un proveedor para sugerir qué hacer; sale igual de la lista que de la ficha. */
export type EstadoProveedor = {
  activo: boolean;
  conCompras: boolean;
  montoVencido: number;
  facturasVencidas: number;
  facturasAtrasadas: number;
  saldoFavor: number;
  diasSinComprar: number | null;
};

/** Del proveedor de la lista (`fn_proveedores`) a lo que necesita `siguientePaso`. Lo financiero llega `null` a quien no es líder → 0. */
export function estadoDeProveedor(p: {
  activo: boolean;
  facturas: number | null;
  saldo_vencido: number | null;
  facturas_vencidas: number | null;
  facturas_atrasadas: number | null;
  saldo_favor: number | null;
  dias_desde_ultima_compra: number | null;
}): EstadoProveedor {
  return {
    activo: p.activo,
    conCompras: (p.facturas ?? 0) > 0,
    montoVencido: p.saldo_vencido ?? 0,
    facturasVencidas: p.facturas_vencidas ?? 0,
    facturasAtrasadas: p.facturas_atrasadas ?? 0,
    saldoFavor: p.saldo_favor ?? 0,
    diasSinComprar: p.dias_desde_ultima_compra,
  };
}

const plural = (n: number, s: string, p: string) => `${n} ${n === 1 ? s : p}`;

/**
 * Una sola sugerencia, la más urgente: lo vencido (dinero) pesa más que una entrega atrasada, que pesa
 * más que un saldo a favor, que pesa más que un proveedor dormido. Nunca dos a la vez: dos sugerencias
 * son una lista, y la lista ya es la tabla.
 */
export function siguientePaso(e: EstadoProveedor): SiguientePaso {
  if (!e.activo) return { tono: "neutro", fuerte: "Está desactivado.", resto: " Su historial se conserva, pero ya no aparece al registrar comprobantes.", accion: "reactivar" };
  if (e.montoVencido > 0) {
    return { tono: "rojo", fuerte: `${soles(e.montoVencido)} ya venció`, resto: ` en ${plural(e.facturasVencidas, "comprobante", "comprobantes")}. Conviene pagarlo antes de pedirle más.`, accion: "pagar" };
  }
  if (e.facturasAtrasadas > 0) {
    return { tono: "ambar", fuerte: `${plural(e.facturasAtrasadas, "entrega atrasada", "entregas atrasadas")}.`, resto: ` Reclámal${e.facturasAtrasadas === 1 ? "a" : "as"} antes de que se acumule${e.facturasAtrasadas === 1 ? "" : "n"}.`, accion: "recibir" };
  }
  if (e.saldoFavor > 0) return { tono: "verde", fuerte: `Te debe ${soles(e.saldoFavor)}`, resto: " por una nota de crédito. Se descuenta al pagar su próximo comprobante.", accion: "favor" };
  if (!e.conCompras) return { tono: "neutro", fuerte: "Todavía sin compras.", resto: " Registra su primer comprobante para ver cómo va.", accion: null };
  if (e.diasSinComprar != null && e.diasSinComprar > 90) {
    const meses = Math.floor(e.diasSinComprar / 30);
    return { tono: "ambar", fuerte: `Lleva ${meses} meses sin comprarle.`, resto: " ¿Sigue siendo proveedor?", accion: "desactivar" };
  }
  return { tono: "verde", fuerte: "Todo al día.", resto: " Sin deuda vencida ni entregas atrasadas.", accion: null };
}

// ---------------------------------------------------------------------------
// Búsqueda: dónde coincidió, para resaltarlo.
// ---------------------------------------------------------------------------

// Cada carácter se reduce a su letra base SIN cambiar la longitud del texto, para que la posición
// hallada en la versión «sin tildes» sirva tal cual sobre el original.
const base = (t: string) => [...t].map((c) => c.normalize("NFD")[0].toLowerCase()).join("");

export type TramoTexto = { texto: string; coincide: boolean };

/** Parte `texto` en tramos, marcando el primero que coincide con `busqueda` (sin tildes ni mayúsculas). */
export function resaltarCoincidencia(texto: string, busqueda: string): TramoTexto[] {
  const q = busqueda.trim();
  if (!q) return [{ texto, coincide: false }];
  const i = base(texto).indexOf(base(q));
  if (i < 0) return [{ texto, coincide: false }];
  return [
    { texto: texto.slice(0, i), coincide: false },
    { texto: texto.slice(i, i + q.length), coincide: true },
    { texto: texto.slice(i + q.length), coincide: false },
  ].filter((t) => t.texto !== "");
}

// ---------------------------------------------------------------------------
// RUC duplicado: decirlo al escribir, con el nombre de con quién choca.
// ---------------------------------------------------------------------------

/** El proveedor que ya tiene ese RUC (distinto del que se edita), o `null`. */
export function proveedorConRuc<T extends { id: string; ruc: string | null }>(ruc: string, existentes: T[], idActual: string | null): T | null {
  if (!/^\d{11}$/.test(ruc)) return null;
  return existentes.find((p) => p.ruc === ruc && p.id !== idActual) ?? null;
}

// ---------------------------------------------------------------------------
// Datos para pagar: CCI, Yape/Plin y titular (ADR-0134)
//
// La base guarda CCI y celular SOLO con dígitos y rechaza lo que no cumpla (candados de
// `20260919170000_proveedores_cci_y_billetera.sql`); estas funciones son para escribirlo cómodo
// (pegar «002-193-…» con guiones, «+51 987 654 321») y para leerlo sin equivocarse. Puras: sin I/O.
// ---------------------------------------------------------------------------

const soloDigitos = (s: string) => s.replace(/\D/g, "");

/** El CCI como lo guarda la base: solo dígitos (acepta espacios, guiones y puntos al pegar). No recorta: `validarCci` avisa si sobran. */
export function normalizarCci(s: string): string {
  return soloDigitos(s);
}

/** El celular como lo guarda la base: 9 dígitos, sin el +51. */
export function normalizarCelular(s: string): string {
  const d = soloDigitos(s);
  return d.length === 11 && d.startsWith("51") ? d.slice(2) : d;
}

/** «002-193-002145678045-58» — se puede llamar con el CCI a medio escribir. */
export function formatoCci(s: string): string {
  const d = soloDigitos(s).slice(0, 20);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 18), d.slice(18, 20)].filter(Boolean).join("-");
}

/** «987 654 321» — se puede llamar con el celular a medio escribir. */
export function formatoCelular(s: string): string {
  const d = normalizarCelular(s).slice(0, 9);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join(" ");
}

/** «002-193-••••••••••••-58»: para mostrar sin dejarlo a la vista; «Ver completos» lo destapa. */
export function enmascararCci(cci: string): string {
  const d = soloDigitos(cci);
  return d.length === 20 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-••••••••••••-${d.slice(18)}` : "••••";
}

/** «9•• ••• 321». */
export function enmascararCelular(cel: string): string {
  const d = normalizarCelular(cel);
  return d.length === 9 ? `9•• ••• ${d.slice(6)}` : "•••";
}

/** «193-•••••••-•-45»: deja los 3 primeros y los 2 últimos dígitos, con los guiones donde estaban. */
export function enmascararCuenta(cuenta: string): string {
  const total = soloDigitos(cuenta).length;
  let visto = 0;
  return cuenta.replace(/\d/g, (d) => {
    visto++;
    return visto <= 3 || visto > total - 2 ? d : "•";
  });
}

/** `null` si está bien (o vacío: todo es opcional); si no, el mensaje para el campo. */
export function validarCci(s: string): string | null {
  const d = normalizarCci(s);
  if (d === "" && s.trim() === "") return null;
  if (/[^\d\s.-]/.test(s)) return "El CCI lleva solo números.";
  return d.length === 20 ? null : `El CCI tiene 20 dígitos (llevas ${d.length}). Si solo tienes el número de cuenta, va en «Cuenta».`;
}

/** `null` si está bien (o vacío); si no, el mensaje para el campo. */
export function validarCelular(s: string): string | null {
  if (s.trim() === "") return null;
  if (/[^\d\s+()-]/.test(s)) return "El celular lleva solo números.";
  const d = normalizarCelular(s);
  if (d.length !== 9) return `El celular tiene 9 dígitos (llevas ${d.length}).`;
  return d.startsWith("9") ? null : "El celular tiene que empezar con 9.";
}

/** Los tres primeros dígitos del CCI son el código del banco (SBS). Solo los que CAYLA usa; el resto no se adivina. */
export const BANCOS_POR_CODIGO_CCI: Record<string, string> = {
  "002": "BCP",
  "003": "Interbank",
  "009": "Scotiabank",
  "011": "BBVA",
  "018": "Banco de la Nación",
  "038": "BanBif",
  "049": "Mibanco",
  "055": "Pichincha",
};

/** El banco que dice el CCI (por sus 3 primeros dígitos), o `null` si aún no hay 3 o el código no es uno conocido. */
export function bancoDeCci(cci: string): string | null {
  return BANCOS_POR_CODIGO_CCI[soloDigitos(cci).slice(0, 3)] ?? null;
}

/** «Yape», «Plin» o «Yape / Plin»; `null` si no hay billetera. */
export function billeterasTexto(b: string[] | null | undefined): string | null {
  const v = (b ?? []).filter((x) => x === "yape" || x === "plin").sort();
  if (v.length === 0) return null;
  return v.map((x) => (x === "yape" ? "Yape" : "Plin")).join(" / ");
}

/** Todo lo que hace falta para pagarle a un proveedor, ya con los nombres que usan los modales de pago. */
export type DatosPagoProveedor = {
  /** Para llevar a su ficha cuando falta un dato de pago. */
  proveedorId: string;
  banco: string | null;
  /** Número de cuenta del banco (texto libre). */
  cuentaBancaria: string | null;
  /** 20 dígitos, solo números. */
  cci: string | null;
  /** 9 dígitos, sin +51. El destino de Yape/Plin. */
  celularBilletera: string | null;
  billeteras: string[] | null;
  titular: string | null;
  /** El WhatsApp del contacto. NO es el destino del Yape (desde ADR-0134). */
  telefono: string | null;
  plazoCreditoDias: number | null;
  formaPagoPreferida: string | null;
  /** Lo que el proveedor le debe a CAYLA (saldo a favor), disponible para descontar de este pago. */
  saldoFavor?: number;
};

type FilaProveedorPago = {
  id: string;
  banco: string | null;
  cuenta_bancaria: string | null;
  cci: string | null;
  celular_billetera: string | null;
  billeteras: string[] | null;
  titular_cuenta: string | null;
  telefono: string | null;
  plazo_credito_dias: number | null;
  forma_pago_preferida: string | null;
};

export function datosPagoDe(p: FilaProveedorPago, saldoFavor?: number): DatosPagoProveedor {
  return {
    proveedorId: p.id,
    banco: p.banco,
    cuentaBancaria: p.cuenta_bancaria,
    cci: p.cci,
    celularBilletera: p.celular_billetera,
    billeteras: p.billeteras,
    titular: p.titular_cuenta,
    telefono: p.telefono,
    plazoCreditoDias: p.plazo_credito_dias,
    formaPagoPreferida: p.forma_pago_preferida,
    ...(saldoFavor != null ? { saldoFavor } : {}),
  };
}

/**
 * ¿A este proveedor todavía no se le puede pagar por transferencia ni Yape/Plin? Sin cuenta, sin CCI y
 * sin celular de billetera. Un proveedor cuyo medio preferido es EFECTIVO no cuenta como «sin datos»:
 * no le falta nada, no los necesita (decisión de Felipe, 2026-09-19).
 */
export function sinDatosDePago(p: { forma_pago_preferida: string | null; cuenta_bancaria: string | null; cci: string | null; celular_billetera: string | null }): boolean {
  if (p.forma_pago_preferida === "efectivo") return false;
  return !p.cuenta_bancaria?.trim() && !p.cci && !p.celular_billetera;
}

/**
 * El backfill de ADR-0134 copia a `cci` una cuenta de 20 dígitos y deja la original: acá se evita mostrar
 * el mismo número dos veces. `null` si no hay cuenta, o si es exactamente el CCI.
 */
export function cuentaLocalVisible(cuenta: string | null, cci: string | null): string | null {
  const c = cuenta?.trim();
  if (!c) return null;
  return cci && soloDigitos(c) === cci ? null : c;
}
