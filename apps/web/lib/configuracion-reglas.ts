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
  // Sin tachar (spike): una campaña que pasó no se anuló; la fila entera va más tenue.
  paso: { texto: "pasó", tono: "neutro" },
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

/** La frase bajo la barra de meta: de dónde sale la meta de hoy. Con `sede` dice dónde, y sin campaña lo dice (spike:
 *  «Lo normal de un jueves en Tienda TRU. Hoy no rige ninguna campaña.»). */
export function explicarMeta(p: ParametrosCaja, dia: string, soles: (n: number) => string, sede?: string): string {
  if (p.meta === null || p.metaBase === null) return "";
  if (!p.campanas.length || !p.metaPct) return sede ? `Lo normal de un ${dia.toLowerCase()} en ${sede}.${p.campanas.length ? "" : " Hoy no rige ninguna campaña."}` : `Lo normal de un ${dia.toLowerCase()}.`;
  const manda = p.campanas.find((c) => c.meta_pct === p.metaPct) ?? p.campanas[0]!;
  const base = `Lo normal de un ${dia.toLowerCase()} es ${soles(p.metaBase)}; por ${manda.nombre} ${p.metaPct > 0 ? "sube" : "baja"} ${Math.abs(p.metaPct)} %.`;
  return p.campanas.length > 1 ? `${base} Rigen ${p.campanas.length} campañas: se usa la que más sube.` : base;
}

/** «21:00», «9:30» → minutos desde la medianoche; null si no es una hora válida. */
export function minutosDeHora(hora: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hora ?? "");
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h > 23 || min > 59 ? null : h * 60 + min;
}

/**
 * «Al ritmo de hoy cierras en…» (tarjeta Meta de hoy de Caja, spike de Finanzas): lo vendido desde que abrió la caja,
 * repartido por hora, por las horas que faltan hasta la hora de cierre de la tienda. `null` cuando no se puede decir con
 * honestidad: sin hora de cierre, con la tienda ya cerrada, o con menos de una hora abierta (al abrir, una sola venta
 * proyectaría una cifra absurda). Minutos en hora de Lima.
 */
export function proyeccionAlCierre(p: { vendido: number; abrioMin: number; ahoraMin: number; cierreMin: number | null }): number | null {
  if (p.cierreMin === null) return null;
  const abierta = p.ahoraMin - p.abrioMin, faltan = p.cierreMin - p.ahoraMin;
  if (abierta < 60 || faltan <= 0) return null;
  return Math.round(p.vendido + (p.vendido / abierta) * faltan);
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
  /** A qué hora cierra («21:00»); null = no se proyecta la venta del día en Caja. */
  horaCierre: string | null;
  /** El WhatsApp de la tienda (ADR-0288 tanda 1b), para el QR del club; null = sin QR. No viene de
   *  `fn_configuracion_tiendas`: lo suma `getConfiguracionTiendas` leyendo `ubicaciones.whatsapp_numero`. */
  whatsappNumero: string | null;
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
      horaCierre: typeof t.hora_cierre === "string" && t.hora_cierre ? t.hora_cierre : null,
      whatsappNumero: null,
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

// ---- Metas por mes y por fecha (ADR-0435, 20261017020000) -------------------------------------------------------------
// Lo que `fn_parametros_caja` lee para cada día: la meta de una FECHA (final) > la semana de ese MES > la semana tipo. Aquí se
// validan los montos con las mismas frases claras que la base (que vuelve a validar todo) y se leen las dos funciones nuevas.

/** El mismo tope de la base: una meta es menor a 10 millones (y `NaN` no pasa). */
const TOPE_META = 10_000_000;

function parsearMeta(texto: string): Resultado<number | null> {
  const r = parsearMonto(texto);
  if (r.ok && r.valor !== null && r.valor >= TOPE_META) return { ok: false, error: "Tiene que ser menor a 10 millones." };
  return r;
}

/** La semana de UN mes: 7 montos, lunes a domingo. Vacío o 0 = ese día usa la semana tipo de la tienda. */
export function validarSemanaMes(textos: readonly string[]): Resultado<(number | null)[]> {
  if (textos.length !== 7) return { ok: false, error: "Faltan días de la semana." };
  const metas: (number | null)[] = [];
  for (let i = 0; i < 7; i++) {
    const r = parsearMeta(textos[i] ?? "");
    if (!r.ok) return { ok: false, error: `${DIAS_SEMANA[i]}: ${r.error}` };
    metas.push(r.valor === 0 ? null : r.valor);
  }
  return { ok: true, valor: metas };
}

/** La meta de una fecha: la fecha de hoy en adelante, la meta obligatoria (0 = esa fecha no tiene meta) y la nota de hasta 140 letras. */
export function validarMetaFecha(entrada: { fecha: string; meta: string; nota: string }, hoy: string): Resultado<{ fecha: string; meta: number; nota: string | null }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada.fecha)) return { ok: false, error: "Elige la fecha." };
  if (entrada.fecha < hoy) return { ok: false, error: "Esa fecha ya pasó." };
  const m = parsearMeta(entrada.meta);
  if (!m.ok) return { ok: false, error: `Meta: ${m.error}` };
  if (m.valor === null) return { ok: false, error: "Escribe la meta de ese día (0 si la tienda no abre)." };
  const nota = entrada.nota.trim();
  if (nota.length > 140) return { ok: false, error: "La nota puede tener hasta 140 letras." };
  return { ok: true, valor: { fecha: entrada.fecha, meta: m.valor, nota: nota === "" ? null : nota } };
}

export type MesMetas = {
  /** El día 1 del mes («2026-11-01»). */
  mes: string;
  /** Lunes a domingo; `null` = ese día usa la semana tipo. */
  metas: (number | null)[];
  /** La meta del mes: la suma de los días con fechas y campañas. */
  total: number | null;
};
export type TiendaMetas = { id: string; nombre: string; tipica: (number | null)[]; meses: MesMetas[] };
export type FechaMeta = { ubicacionId: string; fecha: string; meta: number; nota: string | null };
export type ConfiguracionMetas = { hoy: string; tiendas: TiendaMetas[]; fechas: FechaMeta[] };

/** Lo que devuelve `fn_configuracion_metas`. `null` si no trae la forma esperada (la base todavía no tiene la migración). */
export function leerConfiguracionMetas(data: unknown): ConfiguracionMetas | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { meses?: unknown; tiendas?: unknown; fechas?: unknown; hoy?: unknown };
  if (!Array.isArray(d.meses) || !Array.isArray(d.tiendas)) return null;
  const meses = d.meses.map(String);
  const semana = (v: unknown): (number | null)[] => (Array.isArray(v) && v.length === 7 ? (v as unknown[]).map(num) : Array(7).fill(null));
  return {
    hoy: String(d.hoy ?? ""),
    tiendas: (d.tiendas as Record<string, unknown>[]).map((t) => {
      const porMes = (t.meses ?? {}) as Record<string, { metas?: unknown; total?: unknown } | undefined>;
      return {
        id: String(t.id),
        nombre: String(t.nombre),
        tipica: semana(t.tipica),
        meses: meses.map((mes) => ({ mes, metas: semana(porMes[mes]?.metas), total: num(porMes[mes]?.total) })),
      };
    }),
    fechas: (Array.isArray(d.fechas) ? (d.fechas as Record<string, unknown>[]) : []).map((f) => ({
      ubicacionId: String(f.ubicacion_id),
      fecha: String(f.fecha),
      meta: Number(f.meta),
      nota: typeof f.nota === "string" && f.nota ? f.nota : null,
    })),
  };
}

// ---- Configuración ▸ Caja y avisos (20260925103000) ----------------------------------------------------------------

export type ParametrosFinanzas = { minimoCaja: number; avisoGastoPct: number; avisoVenceDias: number };
/** Lo de Caja y avisos más desde cuándo cuenta Finanzas (ADR-0332): «2026-10-01», o null si no hay corte. */
export type ParametrosFinanzasConCorte = ParametrosFinanzas & { inicioFinanzas: string | null; corteDisponible: boolean };

export function leerParametrosFinanzas(data: unknown): ParametrosFinanzas | null {
  const d = data as Record<string, unknown> | null;
  if (!d) return null;
  return { minimoCaja: Number(d.minimo_caja ?? 0), avisoGastoPct: Number(d.aviso_gasto_pct ?? 25), avisoVenceDias: Number(d.aviso_vence_dias ?? 7) };
}

/** Los tres números con los mismos límites que `guardar_parametros_finanzas`, dichos antes de ir a la base. */
export function validarParametrosFinanzas(b: { minimoCaja: string; avisoGastoPct: string; avisoVenceDias: string }): Resultado<ParametrosFinanzas> {
  const minimo = parsearMonto(b.minimoCaja);
  if (!minimo.ok) return { ok: false, error: `Mínimo de caja: ${minimo.error}` };
  const pct = Number(b.avisoGastoPct.replace(/%|\s/g, "").replace(",", "."));
  if (!Number.isFinite(pct) || pct <= 0 || pct > 500) return { ok: false, error: "El aviso de gasto va de 1 % a 500 %." };
  const dias = Number(b.avisoVenceDias.trim());
  if (!Number.isInteger(dias) || dias < 1 || dias > 60) return { ok: false, error: "Los días de aviso van de 1 a 60." };
  return { ok: true, valor: { minimoCaja: minimo.valor ?? 0, avisoGastoPct: pct, avisoVenceDias: dias } };
}

// ---- Configuración ▸ Empresa (de solo lectura) -----------------------------------------------------------------------

export type DatosEmpresa = {
  ruc: string | null;
  razonSocial: string | null;
  nombreComercial: string | null;
  email: string | null;
  telefono: string | null;
  web: string | null;
  tiendas: { id: string; nombre: string; direccion: string | null; distrito: string | null; series: { tipo: string; serie: string }[] }[];
};

