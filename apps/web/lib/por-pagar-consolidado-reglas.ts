// Reglas de Finanzas ▸ Cuentas y dinero ▸ Por pagar (ADR-0195 F4; spike `vista-dinero.js`, `vistaPorPagar`). Lógica pura:
// la usan la pantalla y sus pruebas. La base (`fn_por_pagar_consolidado`, 20260925120000) decide QUÉ se debe y de quién es;
// aquí solo se ordena en el calendario (vencido, esta semana, la próxima, más adelante) y se suma lo que ya llegó.

export type NaturalezaDeuda = "mercaderia" | "gasto" | "activo" | "insumo";
export type OrigenDeuda = "compras" | "produccion";

export const TEXTO_NATURALEZA: Record<NaturalezaDeuda, string> = {
  mercaderia: "Mercadería",
  gasto: "Gasto",
  activo: "Activo fijo",
  insumo: "Insumo del Taller",
};
/** El tono de la insignia (spike: mercadería e insumo en arena, gasto y activo en pizarra). */
export const TONO_NATURALEZA: Record<NaturalezaDeuda, "neutro" | "pizarra"> = {
  mercaderia: "neutro",
  gasto: "pizarra",
  activo: "pizarra",
  insumo: "neutro",
};

export type FilaPorPagar = {
  origen: OrigenDeuda;
  id: string;
  naturaleza: NaturalezaDeuda;
  proveedorId: string;
  proveedor: string;
  documento: string;
  tipo: string;
  /** Qué fue: la descripción del gasto o el nombre del activo. */
  concepto: string | null;
  fechaEmision: string;
  condicion: "contado" | "credito";
  fechaVencimiento: string | null;
  /** El vencimiento (sin fecha, la emisión): con esto se arma el calendario. */
  vence: string;
  ubicacionId: string | null;
  /** La unidad de la fila, o todas las que tienen parte en el comprobante entero. `null` = de la empresa. */
  unidades: string | null;
  /** `true` = la fila es la parte de una tienda en el comprobante, no el comprobante entero. */
  parte: boolean;
  total: number;
  /** Lo que ya no se debe de esa fila (pagos y notas de crédito): `total − saldo`. */
  pagado: number;
  saldo: number;
};

type Fila = Record<string, unknown>;
const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const txt = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const NATURALEZAS: readonly NaturalezaDeuda[] = ["mercaderia", "gasto", "activo", "insumo"];

export function leerFilaPorPagar(f: Fila): FilaPorPagar {
  const naturaleza = NATURALEZAS.includes(f.naturaleza as NaturalezaDeuda) ? (f.naturaleza as NaturalezaDeuda) : "mercaderia";
  const vence = String(f.vence ?? f.fecha_vencimiento ?? f.fecha_emision).slice(0, 10);
  return {
    origen: f.origen === "produccion" ? "produccion" : "compras",
    id: String(f.id),
    naturaleza,
    proveedorId: String(f.proveedor_id),
    proveedor: String(f.proveedor ?? ""),
    documento: String(f.documento ?? ""),
    tipo: String(f.tipo ?? "factura"),
    concepto: txt(f.concepto),
    fechaEmision: String(f.fecha_emision ?? vence).slice(0, 10),
    condicion: f.condicion === "contado" ? "contado" : "credito",
    fechaVencimiento: txt(f.fecha_vencimiento)?.slice(0, 10) ?? null,
    vence,
    ubicacionId: txt(f.ubicacion_id),
    unidades: txt(f.unidades),
    parte: f.parte === true,
    total: num(f.total),
    pagado: num(f.pagado),
    saldo: num(f.saldo),
  };
}

// ---- El calendario ------------------------------------------------------------------------------------------------------

/** Días de `hoy` a `iso` (fechas de calendario en Lima, `YYYY-MM-DD`): negativo = ya pasó. */
export function diasHasta(iso: string, hoy: string): number {
  const a = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const b = Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)) - 1, Number(hoy.slice(8, 10)));
  return Math.round((a - b) / 86_400_000);
}

export type ClaveTramo = "vencidas" | "semana" | "proxima" | "despues";
export const TRAMOS: readonly { clave: ClaveTramo; etiqueta: string }[] = [
  { clave: "vencidas", etiqueta: "Vencidas" },
  { clave: "semana", etiqueta: "Esta semana" },
  { clave: "proxima", etiqueta: "La próxima semana" },
  { clave: "despues", etiqueta: "Más adelante" },
];

/**
 * En qué tramo cae: vencida (ya pasó), esta semana (hoy y los 7 días que siguen), la próxima (del 8.º al 14.º) o más
 * adelante. Son semanas corridas desde hoy, como el spike y como «Vence esta semana» de Compras ▸ Por pagar: un lunes y
 * un sábado miran lo mismo, los 7 días que vienen.
 */
export function tramoDe(f: Pick<FilaPorPagar, "vence">, hoy: string): ClaveTramo {
  const d = diasHasta(f.vence, hoy);
  if (d < 0) return "vencidas";
  if (d <= 7) return "semana";
  if (d <= 14) return "proxima";
  return "despues";
}

export type ResumenTramo = { clave: ClaveTramo; etiqueta: string; monto: number; n: number };

/** Los cuatro tramos, siempre en el mismo orden y aunque estén vacíos (el spike dibuja «S/ 0 · 0 facturas»). */
export function resumenTramos(filas: readonly Pick<FilaPorPagar, "vence" | "saldo">[], hoy: string): ResumenTramo[] {
  return TRAMOS.map((t) => {
    const del = filas.filter((f) => tramoDe(f, hoy) === t.clave);
    return { ...t, monto: redondear(del.reduce((a, f) => a + f.saldo, 0)), n: del.length };
  });
}

export function totalPorPagar(filas: readonly Pick<FilaPorPagar, "saldo">[]): { saldo: number; n: number } {
  return { saldo: redondear(filas.reduce((a, f) => a + f.saldo, 0)), n: filas.length };
}

/** Lo más urgente primero; a igual fecha, por proveedor (la base ya lo manda así: esto lo asegura si se filtra). */
export function ordenarPorVencimiento<T extends Pick<FilaPorPagar, "vence" | "proveedor" | "documento">>(filas: readonly T[]): T[] {
  return [...filas].sort((a, b) => a.vence.localeCompare(b.vence) || a.proveedor.localeCompare(b.proveedor, "es") || a.documento.localeCompare(b.documento));
}

/** «vencida hace 2 días» · «vence hoy» · «en 4 días» (el texto del spike, bajo la fecha). */
export function textoVence(f: Pick<FilaPorPagar, "vence">, hoy: string): string {
  const d = diasHasta(f.vence, hoy);
  if (d < 0) return `vencida hace ${-d} ${-d === 1 ? "día" : "días"}`;
  if (d === 0) return "vence hoy";
  if (d === 1) return "mañana";
  return `en ${d} días`;
}

/**
 * El nombre de la unidad en la columna «Unidad»: la tienda, o «De la empresa». Una factura repartida nombra a todas, sin
 * repetir «Tienda» en cada una («Lima · Trujillo»): la columna es angosta y el nombre de la tienda es lo que se lee.
 */
export function textoUnidad(f: Pick<FilaPorPagar, "unidades">): string {
  if (!f.unidades) return "De la empresa";
  const nombres = f.unidades.split(" · ");
  return nombres.length > 1 ? nombres.map((n) => n.replace(/^Tienda\s+/i, "")).join(" · ") : f.unidades;
}

// ---- Pagar ------------------------------------------------------------------------------------------------------------------

/**
 * ¿Puede esta cuenta pagar esa fila desde aquí? No hay lógica de pago nueva (ADR-0195 F4): cada fila se paga con el modal de
 * su libro, y ese modal le pregunta a la base con el permiso de SU módulo. La factura de proveedor, con `por_pagar` de
 * Compras (`fn_puede_pagar_compras`) o siendo líder; la tela del Taller, solo el líder (D-G de ADR-0133).
 */
export function puedePagar(f: Pick<FilaPorPagar, "origen">, cuenta: { esLider: boolean; pagaCompras: boolean }): boolean {
  return f.origen === "produccion" ? cuenta.esLider : cuenta.esLider || cuenta.pagaCompras;
}

/** `?pagar=<id>` → la fila a pagar, si está en la lista y todavía se debe (un enlace viejo no abre nada). */
export function filaAPagar<T extends Pick<FilaPorPagar, "id" | "saldo">>(param: string | undefined, filas: readonly T[]): T | null {
  if (!param || !/^[0-9a-f-]{36}$/i.test(param)) return null;
  return filas.find((f) => f.id === param && f.saldo > 0) ?? null;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}
