// Reglas puras de Proveedores (maquetas 08 y 09, ADR-0111; vista rápida y mini-tendencias, ADR-0122).
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
// Facturado por mes (ADR-0122): la forma detrás de «Facturado 12 m».
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
