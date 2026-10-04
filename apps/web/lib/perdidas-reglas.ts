// Pérdidas (ADR-0328, actividad 14): lo que la pestaña «Pérdidas» de Movimientos y el aviso del Inicio del líder leen de
// `retail.fn_perdidas_resumen`. Sin Supabase ni React: lo importan la página (servidor), el Inicio y las pruebas.
//
// La DEFINICIÓN de pérdida no vive aquí: vive en la base (`fn_perdida_razon`, 20261004220000), y Finanzas, el resumen de
// Inventario y esta pestaña la leen de allí, así que «cuánto perdimos» tiene una sola respuesta. Aquí hay solo tres cosas:
//   1. cómo se dice cada razón en palabras de tienda;
//   2. el período de la pestaña (por defecto «Este mes», la pregunta de Felipe);
//   3. la regla de CUÁNDO AVISAR: «se repite» (Felipe, 2026-10-04) — la misma prenda o la misma zona pierde en dos días
//      distintos de los últimos 30, o una resta grande queda sin nota. Sin un tope inventado en %: los números son los que
//      Felipe ya fijó («2 veces en 30 días»; «más de 5 de una talla o dejarla en 0 teniendo 3 o más», ADR-0328).
//
// CONTRATO — `perdidasQueSeRepiten` PROMETE: cada hallazgo una sola vez, primero las restas grandes, después las prendas y
// las zonas, de más a menos prendas; nunca cuenta lo que APARECIÓ (eso va aparte, «por explicar»). ASUME: los hechos son
// de UNA sede y cubren al menos los últimos 30 días (si `hechosTotal` supera la lista, la lectura está cortada y lo dice
// `listaCortada`).

import { restarDias } from "./movimientos-reglas";

export type LadoPerdida = "perdida" | "aparecio";
/** Las razones que hoy devuelve la base. Una que la base sume mañana se muestra con su clave, nunca rompe la pantalla. */
export type RazonPerdida = "conteo" | "a_mano" | "danada" | "traslado";

export type HechoPerdida = {
  id: string;
  fuente: string;
  lado: LadoPerdida;
  razon: string;
  instante: string;
  /** Día de Lima, `aaaa-mm-dd`. */
  dia: string;
  varianteId: string;
  productoId: string | null;
  producto: string;
  codigo: string | null;
  categoria: string | null;
  talla: string | null;
  color: string | null;
  colorHex: string | null;
  sububicacionId: string | null;
  zona: string | null;
  zonaTipo: string | null;
  unidades: number;
  /** Solo para el líder (la base lo manda vacío a los demás). */
  costoUnitario: number | null;
  conDocumento: boolean;
  documentoTipo: string | null;
  documentoId: string | null;
  documentoNumero: number | null;
  nota: string | null;
  /** Cuántas quedaron de esa talla en la sede después de restar (solo en las restas a mano sin documento). */
  quedaron: number | null;
};

export type Cifra = { unidades: number; soles: number };

export type ResumenPerdidas = {
  desde: string;
  hasta: string;
  veCosto: boolean;
  perdido: Cifra & { sinCosto: number; hechos: number };
  aparecio: Cifra & { hechos: number };
  porRazon: (Cifra & { lado: LadoPerdida; razon: string })[];
  porCategoria: (Cifra & { categoria: string })[];
  porTalla: (Cifra & { talla: string })[];
  masFaltan: { categoria: string; talla: string; color: string; colorHex: string | null; unidades: number; veces: number }[];
  hechos: HechoPerdida[];
  hechosTotal: number;
};

// ── 1. Palabras de tienda ─────────────────────────────────────────────────────────────────────────────────────────────

const TEXTO_RAZON: Record<RazonPerdida, Record<LadoPerdida, string>> = {
  conteo: { perdida: "Faltó al contar", aparecio: "Apareció al contar" },
  a_mano: { perdida: "Quitada a mano", aparecio: "Sumada a mano" },
  danada: { perdida: "Dañada, no volvió a la venta", aparecio: "Dañada" },
  traslado: { perdida: "Faltó en un traslado", aparecio: "Llegó de más en un traslado" },
};

/** Qué explica cada razón, para quien no sabe de dónde sale la cifra (la ayuda de la tabla). */
export const AYUDA_RAZON: Record<RazonPerdida, string> = {
  conteo: "Un conteo (o el «Conteo físico» de Ajustar) encontró menos de lo que decía el sistema.",
  a_mano: "Alguien quitó prendas en Ajustar sin contar: merma, otro u otra razón.",
  danada: "Prenda dañada que se botó o donó, o una venta anulada cuya prenda no volvió a la venta.",
  traslado: "Se envió más de lo que llegó a la otra tienda. Se cuenta en la sede que lo envió.",
};

export function textoRazon(razon: string, lado: LadoPerdida): string {
  const t = TEXTO_RAZON[razon as RazonPerdida];
  return t ? t[lado] : razon.replaceAll("_", " ");
}

/** «Polo Básico · M · Negro»: la prenda en una línea, sin piezas vacías. */
export function etiquetaPrenda(h: Pick<HechoPerdida, "producto" | "talla" | "color">): string {
  return [h.producto, h.talla, h.color].filter(Boolean).join(" · ");
}

/** «Piso», «Almacén», «Cuarentena», o el nombre de la zona si no es una de las tres. */
export function etiquetaZona(h: Pick<HechoPerdida, "zona" | "zonaTipo">): string | null {
  if (h.zonaTipo === "piso_venta") return "Piso";
  if (h.zonaTipo === "almacen_tienda") return "Almacén";
  if (h.zonaTipo === "cuarentena") return "Cuarentena";
  return h.zona;
}

export function unidadesTexto(n: number): string {
  return `${n.toLocaleString("es-PE")} ${n === 1 ? "prenda" : "prendas"}`;
}

export function solesPerdidas(n: number): string {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ── 2. El período ─────────────────────────────────────────────────────────────────────────────────────────────────────

export type PeriodoPerdidas = "mes" | "mes_pasado" | "30" | "90";

export const PERIODOS_PERDIDAS: readonly { valor: PeriodoPerdidas; etiqueta: string }[] = [
  { valor: "mes", etiqueta: "Este mes" },
  { valor: "mes_pasado", etiqueta: "Mes pasado" },
  { valor: "30", etiqueta: "30 días" },
  { valor: "90", etiqueta: "90 días" },
];

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** El rango de días de Lima (inclusivo) de un período, y cómo se dice. Por defecto, este mes: la pregunta es «¿cuánto
 *  perdimos este mes?», y así la cifra se compara con las Mermas del Estado de resultados del mismo mes. */
export function rangoPerdidas(valor: string | undefined, hoy: string): { periodo: PeriodoPerdidas; desde: string; hasta: string; texto: string } {
  const [a, m] = hoy.split("-").map(Number);
  if (valor === "30" || valor === "90") {
    const dias = Number(valor);
    return { periodo: valor, desde: restarDias(hoy, dias - 1), hasta: hoy, texto: `últimos ${dias} días` };
  }
  if (valor === "mes_pasado") {
    const am = m === 1 ? a - 1 : a;
    const mm = m === 1 ? 12 : m - 1;
    const desde = `${am}-${String(mm).padStart(2, "0")}-01`;
    const hasta = restarDias(`${a}-${String(m).padStart(2, "0")}-01`, 1);
    return { periodo: "mes_pasado", desde, hasta, texto: MESES[mm - 1] };
  }
  return { periodo: "mes", desde: `${a}-${String(m).padStart(2, "0")}-01`, hasta: hoy, texto: `este mes (${MESES[m - 1]})` };
}

// ── La URL de la pestaña ──────────────────────────────────────────────────────────────────────────────────────────────

export type ParamsPerdidas = { vista?: string; p?: string; variante?: string; zona?: string };

const esUuid = (v?: string) => !!v && /^[0-9a-f-]{36}$/i.test(v);

/** Los filtros de la pestaña que vienen en la URL; cualquier valor que no es un uuid se ignora. */
export function filtrosPerdidas(p: ParamsPerdidas): { varianteId: string | null; sububicacionId: string | null } {
  return { varianteId: esUuid(p.variante) ? p.variante! : null, sububicacionId: esUuid(p.zona) ? p.zona! : null };
}

export function hrefPerdidas(o: { periodo?: PeriodoPerdidas; varianteId?: string | null; sububicacionId?: string | null } = {}): string {
  const q = new URLSearchParams({ vista: "perdidas" });
  if (o.periodo && o.periodo !== "mes") q.set("p", o.periodo);
  if (o.varianteId) q.set("variante", o.varianteId);
  if (o.sububicacionId) q.set("zona", o.sububicacionId);
  return `/inventario/movimientos?${q.toString()}`;
}

// ── 3. Cuándo avisar: «se repite» ─────────────────────────────────────────────────────────────────────────────────────

/** Felipe, 2026-10-04 (ADR-0328, «Cuándo avisa»): la misma prenda o la misma zona pierde dos veces en 30 días. */
export const DIAS_VENTANA_REPETICION = 30;
export const VECES_PARA_AVISAR = 2;
/** Felipe, 2026-10-04 (ADR-0328, «Quitar mucho»): más de 5 de una talla, o dejar en 0 una talla que tenía 3 o más. */
export const RESTA_GRANDE_MAS_DE = 5;
export const DEJA_EN_CERO_DESDE = 3;

/** Las razones que dicen «faltó» en una zona. Una dañada que se botó no habla de la zona (vive en cuarentena por diseño), y
 *  lo que faltó en un traslado no pasó en ninguna zona de la tienda. */
const RAZONES_DE_ZONA: readonly string[] = ["conteo", "a_mano"];

export type Repeticion =
  | { tipo: "resta_grande"; clave: string; hechoId: string; varianteId: string; etiqueta: string; unidades: number; quedaron: number | null; dia: string }
  | { tipo: "prenda"; clave: string; varianteId: string; etiqueta: string; veces: number; unidades: number; ultimoDia: string }
  | { tipo: "zona"; clave: string; sububicacionId: string; etiqueta: string; zonaTipo: string | null; veces: number; unidades: number; ultimoDia: string };

/** Una resta a mano, sin documento y sin nota, que se llevó más de 5 o dejó la talla en 0 teniendo 3 o más. */
export function esRestaGrandeSinNota(h: HechoPerdida): boolean {
  if (h.lado !== "perdida" || h.fuente !== "movimiento" || h.conDocumento || (h.nota ?? "").trim() !== "") return false;
  return h.unidades > RESTA_GRANDE_MAS_DE || (h.quedaron === 0 && h.unidades >= DEJA_EN_CERO_DESDE);
}

export function perdidasQueSeRepiten(hechos: readonly HechoPerdida[], hoy: string): Repeticion[] {
  const desde = restarDias(hoy, DIAS_VENTANA_REPETICION - 1);
  const enVentana = hechos.filter((h) => h.lado === "perdida" && h.dia >= desde && h.dia <= hoy);

  const grandes: Repeticion[] = enVentana
    .filter(esRestaGrandeSinNota)
    .sort((x, y) => y.unidades - x.unidades || y.dia.localeCompare(x.dia))
    .map((h) => ({ tipo: "resta_grande", clave: `resta:${h.id}`, hechoId: h.id, varianteId: h.varianteId, etiqueta: etiquetaPrenda(h), unidades: h.unidades, quedaron: h.quedaron, dia: h.dia }));

  const agrupar = <T extends string>(lista: readonly HechoPerdida[], llave: (h: HechoPerdida) => T | null) => {
    const grupos = new Map<T, { dias: Set<string>; unidades: number; ultimoDia: string; muestra: HechoPerdida }>();
    for (const h of lista) {
      const k = llave(h);
      if (!k) continue;
      const g = grupos.get(k) ?? { dias: new Set<string>(), unidades: 0, ultimoDia: h.dia, muestra: h };
      g.dias.add(h.dia);
      g.unidades += h.unidades;
      if (h.dia > g.ultimoDia) g.ultimoDia = h.dia;
      grupos.set(k, g);
    }
    return [...grupos.entries()].filter(([, g]) => g.dias.size >= VECES_PARA_AVISAR).sort(([, a], [, b]) => b.unidades - a.unidades || b.dias.size - a.dias.size);
  };

  const prendas: Repeticion[] = agrupar(enVentana, (h) => h.varianteId).map(([varianteId, g]) => ({
    tipo: "prenda",
    clave: `prenda:${varianteId}`,
    varianteId,
    etiqueta: etiquetaPrenda(g.muestra),
    veces: g.dias.size,
    unidades: g.unidades,
    ultimoDia: g.ultimoDia,
  }));

  const zonas: Repeticion[] = agrupar(
    enVentana.filter((h) => RAZONES_DE_ZONA.includes(h.razon)),
    (h) => h.sububicacionId
  ).map(([sububicacionId, g]) => ({
    tipo: "zona",
    clave: `zona:${sububicacionId}`,
    sububicacionId,
    etiqueta: etiquetaZona(g.muestra) ?? "Una zona",
    zonaTipo: g.muestra.zonaTipo,
    veces: g.dias.size,
    unidades: g.unidades,
    ultimoDia: g.ultimoDia,
  }));

  return [...grandes, ...prendas, ...zonas];
}

/** Una repetición dicha como en la tienda: «Polo · M · Negro faltó 2 días distintos (3 prendas)». */
export function fraseRepeticion(r: Repeticion): string {
  if (r.tipo === "resta_grande") {
    const cero = r.quedaron === 0 ? " y la talla quedó en 0" : "";
    return `Se quitaron ${unidadesTexto(r.unidades)} de ${r.etiqueta} sin nota${cero}`;
  }
  const quien = r.tipo === "zona" ? zonaConArticulo(r.etiqueta, r.zonaTipo) : r.etiqueta;
  return `${quien} perdió ${unidadesTexto(r.unidades)} en ${r.veces} días distintos`;
}

/** «El piso», «El almacén», «La cuarentena»; otra zona, por su nombre. */
function zonaConArticulo(etiqueta: string, tipo: string | null): string {
  if (tipo === "piso_venta") return "El piso";
  if (tipo === "almacen_tienda") return "El almacén";
  if (tipo === "cuarentena") return "La cuarentena";
  return `La zona «${etiqueta}»`;
}

/** Adónde lleva una repetición: la pestaña filtrada a esa prenda o a esa zona, en los últimos 30 días. */
export function hrefRepeticion(r: Repeticion): string {
  if (r.tipo === "zona") return hrefPerdidas({ periodo: "30", sububicacionId: r.sububicacionId });
  return hrefPerdidas({ periodo: "30", varianteId: r.varianteId });
}

export type AvisoPerdidas = { cantidad: number; detalle: string; href: string };

/** Lo que el aviso del Inicio necesita: cuántas, la primera dicha entera y adónde llevar (filtrada si es una sola). */
export function avisoPerdidas(reps: readonly Repeticion[]): AvisoPerdidas {
  if (reps.length === 0) return { cantidad: 0, detalle: "", href: hrefPerdidas({ periodo: "30" }) };
  const primera = fraseRepeticion(reps[0]);
  const mas = reps.length > 1 ? ` · y ${reps.length - 1} más` : "";
  return { cantidad: reps.length, detalle: `${primera}${mas}.`, href: reps.length === 1 ? hrefRepeticion(reps[0]) : hrefPerdidas({ periodo: "30" }) };
}

// ── La lectura ────────────────────────────────────────────────────────────────────────────────────────────────────────

type Crudo = Record<string, unknown> | null | undefined;
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const numONull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));
const txt = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** Lo que devuelve `fn_perdidas_resumen` (jsonb) en tipos de la web. Un dato que no viene se lee como 0 o vacío; un jsonb
 *  que no es un objeto, como `null` («no se pudo leer»). */
export function leerResumenPerdidas(crudo: unknown): ResumenPerdidas | null {
  if (!crudo || typeof crudo !== "object" || Array.isArray(crudo)) return null;
  const j = crudo as Record<string, unknown>;
  const p = (j.perdido ?? {}) as Crudo;
  const a = (j.aparecio ?? {}) as Crudo;
  const lista = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]) : []);
  return {
    desde: String(j.desde ?? ""),
    hasta: String(j.hasta ?? ""),
    veCosto: j.ve_costo === true,
    perdido: { unidades: num(p?.unidades), soles: num(p?.soles), sinCosto: num(p?.sin_costo), hechos: num(p?.hechos) },
    aparecio: { unidades: num(a?.unidades), soles: num(a?.soles), hechos: num(a?.hechos) },
    porRazon: lista(j.por_razon).map((r) => ({ lado: r.lado === "aparecio" ? "aparecio" : "perdida", razon: String(r.razon ?? ""), unidades: num(r.unidades), soles: num(r.soles) })),
    porCategoria: lista(j.por_categoria).map((r) => ({ categoria: String(r.categoria ?? "Sin categoría"), unidades: num(r.unidades), soles: num(r.soles) })),
    porTalla: lista(j.por_talla).map((r) => ({ talla: String(r.talla ?? "Única"), unidades: num(r.unidades), soles: num(r.soles) })),
    masFaltan: lista(j.mas_faltan).map((r) => ({
      categoria: String(r.categoria ?? "Sin categoría"),
      talla: String(r.talla ?? "Única"),
      color: String(r.color ?? "Sin color"),
      colorHex: txt(r.color_hex),
      unidades: num(r.unidades),
      veces: num(r.veces),
    })),
    hechos: lista(j.hechos).map((h) => ({
      id: String(h.id ?? ""),
      fuente: String(h.fuente ?? ""),
      lado: h.lado === "aparecio" ? "aparecio" : "perdida",
      razon: String(h.razon ?? ""),
      instante: String(h.instante ?? ""),
      dia: String(h.dia ?? "").slice(0, 10),
      varianteId: String(h.variante_id ?? ""),
      productoId: txt(h.producto_id),
      producto: String(h.producto ?? "Prenda"),
      codigo: txt(h.codigo),
      categoria: txt(h.categoria),
      talla: txt(h.talla),
      color: txt(h.color),
      colorHex: txt(h.color_hex),
      sububicacionId: txt(h.sububicacion_id),
      zona: txt(h.zona),
      zonaTipo: txt(h.zona_tipo),
      unidades: num(h.unidades),
      costoUnitario: numONull(h.costo_unitario),
      conDocumento: h.con_documento === true,
      documentoTipo: txt(h.documento_tipo),
      documentoId: txt(h.documento_id),
      documentoNumero: numONull(h.documento_numero),
      nota: txt(h.nota),
      quedaron: numONull(h.quedaron),
    })),
    hechosTotal: num(j.hechos_total),
  };
}

/** La lista vino cortada (más de 1000 hechos): lo que se cuenta encima de ella puede quedarse corto, y se dice. */
export function listaCortada(r: Pick<ResumenPerdidas, "hechos" | "hechosTotal">): boolean {
  return r.hechosTotal > r.hechos.length;
}

/** Adónde lleva el documento de un hecho (el conteo o el traslado); una venta anulada no tiene pantalla propia aquí. */
export function hrefDocumento(h: Pick<HechoPerdida, "documentoTipo" | "documentoId">): string | null {
  if (!h.documentoId) return null;
  if (h.documentoTipo === "conteo") return `/inventario/conteo/${h.documentoId}`;
  if (h.documentoTipo === "traslado") return `/inventario/traslados/${h.documentoId}`;
  return null;
}

/** Cómo se nombra el respaldo de un hecho: «Conteo 7», «Traslado 24», «Venta anulada», o la nota de quien ajustó. */
export function textoRespaldo(h: Pick<HechoPerdida, "documentoTipo" | "documentoNumero" | "nota" | "fuente">): string {
  if (h.documentoTipo === "conteo") return h.documentoNumero ? `Conteo ${h.documentoNumero}` : "Conteo";
  if (h.documentoTipo === "traslado") return h.documentoNumero ? `Traslado ${h.documentoNumero}` : "Traslado";
  if (h.documentoTipo === "venta") return "Venta anulada";
  return h.nota ? `«${h.nota}»` : "Sin nota";
}
