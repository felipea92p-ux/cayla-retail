// Reglas de Configuración ▸ Tiendas y caja (ADR-0195 F1). Lógica pura: la usan la pantalla y sus pruebas.
// Las mismas reglas las cierra la base (`guardar_metas_tienda`, `guardar_efecto_campana`, checks y disparadores de
// 20260924210000); aquí solo se dicen con una frase clara ANTES de ir a la base.

export const DIAS_SEMANA = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"] as const;
export const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };

/** "1,500", "1500.50", "S/ 300" → número. Vacío → `null` (sin meta ese día / fondo normal). */
export function parsearMonto(texto: string): Resultado<number | null> {
  const limpio = texto.replace(/s\/|\s/gi, "").replace(/,/g, "");
  if (limpio === "") return { ok: true, valor: null };
  if (!/^-?\d+(\.\d{1,2})?$/.test(limpio)) return { ok: false, error: "Escribe un monto, por ejemplo 1500." };
  const n = Number(limpio);
  if (n < 0) return { ok: false, error: "No puede ser negativo." };
  return { ok: true, valor: n };
}

/** "25", "+25", "-15", "25 %" → número. Vacío → 0 (la meta no cambia). Entre −99 y 300, como la base. */
export function parsearPorcentaje(texto: string): Resultado<number> {
  const limpio = texto.replace(/%|\s/g, "").replace(",", ".").replace(/^\+/, "");
  if (limpio === "") return { ok: true, valor: 0 };
  if (!/^-?\d+(\.\d{1,2})?$/.test(limpio)) return { ok: false, error: "Escribe cuánto sube la meta, por ejemplo 25 o −15." };
  const n = Number(limpio);
  if (n <= -100 || n > 300) return { ok: false, error: "Entre −99 % y 300 %." };
  return { ok: true, valor: n };
}

export type BorradorTienda = { metas: string[]; fondo: string };
export type MetasValidas = { metas: (number | null)[]; fondo: number | null };

/** Las 7 metas (lunes a domingo) y el fondo. Vacío o 0 en un día = sin meta ese día. */
export function validarTienda(b: BorradorTienda): Resultado<MetasValidas> {
  if (b.metas.length !== 7) return { ok: false, error: "Faltan días de la semana." };
  const metas: (number | null)[] = [];
  for (let i = 0; i < 7; i++) {
    const r = parsearMonto(b.metas[i] ?? "");
    if (!r.ok) return { ok: false, error: `${DIAS_SEMANA[i]}: ${r.error}` };
    metas.push(r.valor === 0 ? null : r.valor);
  }
  const f = parsearMonto(b.fondo);
  if (!f.ok) return { ok: false, error: `Fondo de caja: ${f.error}` };
  return { ok: true, valor: { metas, fondo: f.valor } };
}

export type EstadoCampana = "sin_fechas" | "rige" | "viene" | "paso";

export function estadoCampana(desde: string | null, hasta: string | null, hoy: string): EstadoCampana {
  if (!desde || !hasta) return "sin_fechas";
  if (hoy > hasta) return "paso";
  if (hoy >= desde) return "rige";
  return "viene";
}

export const TEXTO_ESTADO: Record<EstadoCampana, { texto: string; tono: "ambar" | "pizarra" | "apagado" | "neutro" }> = {
  rige: { texto: "rige hoy", tono: "ambar" },
  viene: { texto: "viene", tono: "pizarra" },
  sin_fechas: { texto: "sin fechas", tono: "neutro" },
  paso: { texto: "pasó", tono: "apagado" },
};

/** Primero las que rigen y las que vienen (por fecha), luego las sin fechas, al final las que ya pasaron. */
export function ordenarCampanas<T extends { desde: string | null; hasta: string | null; nombre: string }>(cs: readonly T[], hoy: string): T[] {
  const peso: Record<EstadoCampana, number> = { rige: 0, viene: 1, sin_fechas: 2, paso: 3 };
  return [...cs].sort((a, b) => {
    const ea = estadoCampana(a.desde, a.hasta, hoy), eb = estadoCampana(b.desde, b.hasta, hoy);
    if (ea !== eb) return peso[ea] - peso[eb];
    return (a.desde ?? "").localeCompare(b.desde ?? "") || a.nombre.localeCompare(b.nombre);
  });
}

/** «+25 % · S/ 400», «+5 %», «S/ 400», o «lo normal». */
export function textoEfecto(e: { meta_pct: number; fondo: number | null } | undefined, soles: (n: number) => string): string {
  if (!e) return "lo normal";
  const partes: string[] = [];
  if (e.meta_pct) partes.push(`${e.meta_pct > 0 ? "+" : "−"}${Math.abs(e.meta_pct)} %`);
  if (e.fondo != null) partes.push(`fondo ${soles(e.fondo)}`);
  return partes.join(" · ") || "lo normal";
}

// ---- Caja: lo que rige hoy ----------------------------------------------------------------------------------------

export type ParametrosCaja = {
  meta: number | null;
  metaBase: number | null;
  metaPct: number;
  fondo: number | null;
  fondoBase: number | null;
  campanas: { id: string; nombre: string; meta_pct: number; fondo: number | null }[];
};

/** Lo que devuelve `fn_parametros_caja` (numerics como texto o número) → tipos de la pantalla. */
export function leerParametrosCaja(fila: Record<string, unknown> | null | undefined): ParametrosCaja | null {
  if (!fila) return null;
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));
  const campanas = Array.isArray(fila.campanas) ? (fila.campanas as ParametrosCaja["campanas"]).map((c) => ({ ...c, meta_pct: Number(c.meta_pct), fondo: num(c.fondo) })) : [];
  return { meta: num(fila.meta), metaBase: num(fila.meta_base), metaPct: Number(fila.meta_pct ?? 0), fondo: num(fila.fondo), fondoBase: num(fila.fondo_base), campanas };
}

/** La frase bajo la barra de meta: de dónde sale la meta de hoy. */
export function explicarMeta(p: ParametrosCaja, dia: string, soles: (n: number) => string): string {
  if (p.meta === null || p.metaBase === null) return "";
  if (!p.campanas.length || !p.metaPct) return `Lo normal de un ${dia.toLowerCase()}.`;
  const manda = p.campanas.find((c) => c.meta_pct === p.metaPct) ?? p.campanas[0]!;
  const base = `Lo normal de un ${dia.toLowerCase()} es ${soles(p.metaBase)}; por ${manda.nombre} ${p.metaPct > 0 ? "sube" : "baja"} ${Math.abs(p.metaPct)} %.`;
  return p.campanas.length > 1 ? `${base} Rigen ${p.campanas.length} campañas: se usa la que más sube.` : base;
}

/** Cierre: cuánto trasladar para dejar justo el fondo (nunca negativo). */
export function trasladoParaDejarFondo(contado: number, fondo: number | null): number {
  if (fondo === null) return 0;
  return Math.max(0, Math.round((contado - fondo) * 100) / 100);
}

/** Cierre: ¿queda menos del fondo que rige? Pide confirmar, no bloquea (ADR-0195 L). */
export function dejaMenosDelFondo(queda: number, fondo: number | null): boolean {
  return fondo !== null && queda + 0.004 < fondo;
}

// ---- Lo que devuelve `fn_configuracion_tiendas` → tipos de la pantalla ----------------------------------------------

export type TiendaConfig = {
  id: string;
  nombre: string;
  /** Lunes a domingo; `null` = sin meta ese día. */
  metas: (number | null)[];
  fondo: number | null;
  /** `ubicaciones.meta_venta_diaria`: el respaldo de antes, si la tienda no tiene metas por día. */
  metaRespaldo: number | null;
  /** Suma de las metas de cada día del mes, con las campañas. */
  metaMes: number | null;
};

export type EfectoCampana = { meta_pct: number; fondo: number | null };

export type CampanaConfig = {
  id: string;
  nombre: string;
  desde: string | null;
  hasta: string | null;
  descuentoPct: number | null;
  /** Vacío = todas las tiendas. */
  sedes: string[];
  /** Por tienda (id): lo que cambia en la caja. */
  efectos: Record<string, EfectoCampana>;
};

export type ConfiguracionTiendas = { tiendas: TiendaConfig[]; campanas: CampanaConfig[]; hoy: string };

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function leerConfiguracion(data: unknown): ConfiguracionTiendas {
  const d = (data ?? {}) as { tiendas?: Record<string, unknown>[]; campanas?: Record<string, unknown>[]; hoy?: string };
  return {
    hoy: String(d.hoy ?? ""),
    tiendas: (d.tiendas ?? []).map((t) => ({
      id: String(t.id),
      nombre: String(t.nombre),
      metas: Array.isArray(t.metas) ? (t.metas as unknown[]).map(num) : Array(7).fill(null),
      fondo: num(t.fondo),
      metaRespaldo: num(t.meta_respaldo),
      metaMes: num(t.meta_mes),
    })),
    campanas: (d.campanas ?? []).map((c) => ({
      id: String(c.id),
      nombre: String(c.nombre),
      desde: (c.desde as string | null) ?? null,
      hasta: (c.hasta as string | null) ?? null,
      descuentoPct: num(c.descuento_pct),
      sedes: Array.isArray(c.sedes) ? (c.sedes as string[]) : [],
      efectos: Object.fromEntries(
        Object.entries((c.efectos ?? {}) as Record<string, { meta_pct: unknown; fondo: unknown }>).map(([u, e]) => [u, { meta_pct: Number(e.meta_pct), fondo: num(e.fondo) }]),
      ),
    })),
  };
}
