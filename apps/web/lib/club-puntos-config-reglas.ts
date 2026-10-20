// «Beneficios del club» (programa de puntos, actividad 8): lo que el líder ajusta sin deploy — cuántos puntos gana cada sol, cuánto valen
// 100 puntos, desde cuántos se canjea, cuánto dura un cupón y el regalo de cumpleaños. Lógica pura, sin React ni red: la usan la página
// (servidor), el formulario (navegador) y su guía de foco (`club-puntos-config-guia.ts`).
//
// CONTRATO
//   PROMETE: leer lo que devuelve `resumen_beneficios_puntos` (o decir que no se pudo), pasar el borrador a los valores que guarda
//            `guardar_beneficios_puntos`, decir qué tiene mal cada campo con UNA sola regla (la misma que apaga «Guardar» y la que sigue
//            la guía), decir qué cambia, desde cuándo rige y cuánto devuelve el programa de cada compra.
//   ASUME:   los límites que ya cuida la base (`club_puntos_config_valores` y `guardar_beneficios_puntos`): puntos por sol de 0.01 a 100,
//            cada 100 puntos de S/\u00a00.01 a S/\u00a01 000, canje desde 100 y de a 100, compra mínima de 1 a 20 veces el cupón, vigencia de 1 a 90
//            días, regalo de 0 a 10 000 puntos y tope de costo de 0 a 100 %. Si la base exige algo más, lo dice al guardar.
//   NO HACE: no decide desde cuándo rige un cambio (lo hace la base: 15 días si toca lo que valen los puntos o el canje; aquí solo se
//            AVISA, con la misma regla), ni publica términos: los Términos los publica el abogado, no esta pantalla.

/** Los siete valores del programa (lo que guarda cada versión de `club_puntos_config`). */
export type ConfigDelClub = {
  puntosPorSol: number;
  solesPor100: number;
  canjeMinimo: number;
  compraMinimaX: number;
  vigenciaDias: number;
  regaloCumple: number;
  topeCostoPct: number;
};

export type VersionDeConfig = ConfigDelClub & {
  /** Desde qué día rige (`aaaa-mm-dd`, día de Lima). */
  desde: string;
};

export type CifrasDelPrograma = {
  puntosEnCirculacion: number;
  miembrosConPuntos: number;
  /** Lo que valen en soles los puntos que ya se ganaron, si todos canjearan hoy. */
  deudaSoles: number;
  cuponesVivos: number;
  cuponesVivosSoles: number;
  canjeadoMesCupones: number;
  canjeadoMesSoles: number;
  repartidoMesPuntos: number;
};

export type CambioAnterior = {
  cuando: string;
  desde: string | null;
  quien: string | null;
  /** Los valores de antes y de después tal como los guardó la base (puede faltar alguno en un cambio muy viejo). */
  antes: Partial<Record<keyof ConfigDelClub, number>>;
  despues: Partial<Record<keyof ConfigDelClub, number>>;
};

export type ResumenDeBeneficios = {
  vigente: VersionDeConfig;
  programada: VersionDeConfig | null;
  cifras: CifrasDelPrograma;
  historial: CambioAnterior[];
};

const numero = (x: unknown): number | null => {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() !== "" ? Number(x) : NaN;
  return Number.isFinite(n) ? n : null;
};
const fecha = (x: unknown): string | null => (typeof x === "string" && /^\d{4}-\d{2}-\d{2}/.test(x) ? x.slice(0, 10) : null);

const CLAVES_JSON: readonly [keyof ConfigDelClub, string][] = [
  ["puntosPorSol", "puntos_por_sol"],
  ["solesPor100", "soles_por_100"],
  ["canjeMinimo", "canje_minimo"],
  ["compraMinimaX", "compra_minima_x"],
  ["vigenciaDias", "vigencia_dias"],
  ["regaloCumple", "regalo_cumple"],
  ["topeCostoPct", "tope_costo_pct"],
];

function leerVersion(x: unknown): VersionDeConfig | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const desde = fecha(o.desde);
  const valores: Partial<ConfigDelClub> = {};
  for (const [campo, clave] of CLAVES_JSON) {
    const n = numero(o[clave]);
    if (n === null) return null;
    valores[campo] = n;
  }
  return desde ? { ...(valores as ConfigDelClub), desde } : null;
}

function leerParcial(x: unknown): Partial<Record<keyof ConfigDelClub, number>> {
  const o = x && typeof x === "object" ? (x as Record<string, unknown>) : {};
  const out: Partial<Record<keyof ConfigDelClub, number>> = {};
  for (const [campo, clave] of CLAVES_JSON) {
    const n = numero(o[clave]);
    if (n !== null) out[campo] = n;
  }
  return out;
}

/** Lo que devuelve `resumen_beneficios_puntos`, o null si no viene completo: la pantalla no inventa valores que después guardaría encima. */
export function leerResumenDeBeneficios(dato: unknown): ResumenDeBeneficios | null {
  if (!dato || typeof dato !== "object") return null;
  const d = dato as Record<string, unknown>;
  const vigente = leerVersion(d.vigente);
  if (!vigente) return null;
  const c = d.cifras && typeof d.cifras === "object" ? (d.cifras as Record<string, unknown>) : null;
  if (!c) return null;
  const cifras = {
    puntosEnCirculacion: numero(c.puntos_en_circulacion),
    miembrosConPuntos: numero(c.miembros_con_puntos),
    deudaSoles: numero(c.deuda_soles),
    cuponesVivos: numero(c.cupones_vivos),
    cuponesVivosSoles: numero(c.cupones_vivos_soles),
    canjeadoMesCupones: numero(c.canjeado_mes_cupones),
    canjeadoMesSoles: numero(c.canjeado_mes_soles),
    repartidoMesPuntos: numero(c.repartido_mes_puntos),
  };
  if (Object.values(cifras).some((v) => v === null)) return null;
  const historial = Array.isArray(d.historial)
    ? (d.historial as unknown[]).flatMap((h) => {
        if (!h || typeof h !== "object") return [];
        const o = h as Record<string, unknown>;
        const cuando = typeof o.cuando === "string" ? o.cuando : null;
        return cuando
          ? [{ cuando, desde: fecha(o.desde), quien: typeof o.quien === "string" ? o.quien : null, antes: leerParcial(o.antes), despues: leerParcial(o.despues) }]
          : [];
      })
    : [];
  return { vigente, programada: d.programada ? leerVersion(d.programada) : null, cifras: cifras as CifrasDelPrograma, historial };
}

/* ------------------------------------------------------------------ El borrador del formulario */

/** Lo que se escribe en el formulario: texto, para poder borrar y reescribir sin que se pegue un «0». */
export type BorradorConfig = Record<keyof ConfigDelClub, string>;
export type CampoConfig = keyof ConfigDelClub;

export const CAMPOS_CONFIG: readonly CampoConfig[] = ["puntosPorSol", "solesPor100", "canjeMinimo", "compraMinimaX", "vigenciaDias", "regaloCumple", "topeCostoPct"];

export const borradorDeConfig = (c: ConfigDelClub): BorradorConfig => ({
  puntosPorSol: String(c.puntosPorSol),
  solesPor100: String(c.solesPor100),
  canjeMinimo: String(c.canjeMinimo),
  compraMinimaX: String(c.compraMinimaX),
  vigenciaDias: String(c.vigenciaDias),
  regaloCumple: String(c.regaloCumple),
  topeCostoPct: String(c.topeCostoPct),
});

/** «12,5» o «12.5» → 12.5; con más de 2 decimales, letras o vacío → null. */
function decimal(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : null;
}
function entero(texto: string): number | null {
  const t = texto.trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

/**
 * Qué tiene mal cada campo, o null. ES la regla del formulario: apaga «Guardar» y la guía la lee tal cual (lo exige su prueba). Un campo
 * vacío dice qué escribir; uno mal escrito, cómo tiene que ser. Los límites son los de la base.
 */
export function problemasDeConfig(b: BorradorConfig): Record<CampoConfig, string | null> {
  const ps = decimal(b.puntosPorSol);
  const s100 = decimal(b.solesPor100);
  const cm = entero(b.canjeMinimo);
  const x = decimal(b.compraMinimaX);
  const vd = entero(b.vigenciaDias);
  const rc = entero(b.regaloCumple);
  const tope = decimal(b.topeCostoPct);
  return {
    puntosPorSol: b.puntosPorSol.trim() === "" ? "Escribe cuántos puntos gana por cada S/\u00a01." : ps === null || ps <= 0 || ps > 100 ? "Los puntos por cada S/\u00a01 van de 0.01 a 100, con hasta 2 decimales." : null,
    solesPor100: b.solesPor100.trim() === "" ? "Escribe cuántos soles valen 100 puntos." : s100 === null || s100 <= 0 || s100 > 1000 ? "Lo que valen 100 puntos va de S/\u00a00.01 a S/\u00a01 000, con hasta 2 decimales." : null,
    canjeMinimo: b.canjeMinimo.trim() === "" ? "Escribe desde cuántos puntos se canjea." : cm === null || cm < 100 || cm > 100000 || cm % 100 !== 0 ? "El canje mínimo va de 100 en 100 puntos, hasta 100 000." : null,
    compraMinimaX: b.compraMinimaX.trim() === "" ? "Escribe cuántas veces el cupón tiene que ser la compra." : x === null || x < 1 || x > 20 ? "La compra mínima va de 1 a 20 veces el valor del cupón." : null,
    vigenciaDias: b.vigenciaDias.trim() === "" ? "Escribe cuántos días dura un cupón." : vd === null || vd < 1 || vd > 90 ? "Un cupón dura de 1 a 90 días." : null,
    regaloCumple: b.regaloCumple.trim() === "" ? "Escribe los puntos del cumpleaños (0 si no hay regalo)." : rc === null || rc > 10000 ? "El regalo de cumpleaños va de 0 a 10 000 puntos." : null,
    topeCostoPct: b.topeCostoPct.trim() === "" ? "Escribe tu tope de costo en %." : tope === null || tope > 100 ? "El tope de costo va de 0 a 100 %." : null,
  };
}

/** Los valores para `guardar_beneficios_puntos`, o null si algún campo tiene un problema. */
export function configDelBorrador(b: BorradorConfig): ConfigDelClub | null {
  if (Object.values(problemasDeConfig(b)).some((p) => p !== null)) return null;
  return {
    puntosPorSol: decimal(b.puntosPorSol)!,
    solesPor100: decimal(b.solesPor100)!,
    canjeMinimo: entero(b.canjeMinimo)!,
    compraMinimaX: decimal(b.compraMinimaX)!,
    vigenciaDias: entero(b.vigenciaDias)!,
    regaloCumple: entero(b.regaloCumple)!,
    topeCostoPct: decimal(b.topeCostoPct)!,
  };
}

/* ------------------------------------------------------------------ Lo que dice la pantalla */

const soles = (n: number) => `S/ ${Number.isInteger(n) ? String(n) : n.toFixed(2)}`;
const miles = (n: number) => n.toLocaleString("es-PE");
const veces = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

/** Cómo llama la pantalla a cada valor, en una línea («Cada 100 puntos valen S/\u00a05»): para lo que cambia y para el historial. */
const NOMBRE_DEL_CAMPO: Record<CampoConfig, (n: number) => string> = {
  puntosPorSol: (n) => `${veces(n)} ${n === 1 ? "punto" : "puntos"} por cada S/\u00a01`,
  solesPor100: (n) => `100 puntos valen ${soles(n)}`,
  canjeMinimo: (n) => `canje desde ${miles(n)} puntos`,
  compraMinimaX: (n) => `compra de ${veces(n)} veces el cupón`,
  vigenciaDias: (n) => `el cupón dura ${n} ${n === 1 ? "día" : "días"}`,
  regaloCumple: (n) => `${miles(n)} puntos de cumpleaños`,
  topeCostoPct: (n) => `tope de costo ${veces(n)} %`,
};

const ETIQUETA_CAMBIO: Record<CampoConfig, string> = {
  puntosPorSol: "Puntos por cada S/\u00a01",
  solesPor100: "Lo que valen 100 puntos",
  canjeMinimo: "Canje mínimo",
  compraMinimaX: "Compra mínima del cupón",
  vigenciaDias: "Duración del cupón",
  regaloCumple: "Regalo de cumpleaños",
  topeCostoPct: "Tope de costo",
};

const VALOR_CORTO: Record<CampoConfig, (n: number) => string> = {
  puntosPorSol: (n) => veces(n),
  solesPor100: (n) => soles(n),
  canjeMinimo: (n) => `${miles(n)} puntos`,
  compraMinimaX: (n) => `${veces(n)} veces`,
  vigenciaDias: (n) => `${n} días`,
  regaloCumple: (n) => `${miles(n)} puntos`,
  topeCostoPct: (n) => `${veces(n)} %`,
};

/** Lo que cambia respecto de lo vigente, en palabras: «Lo que valen 100 puntos: S/\u00a05 → S/\u00a04». Vacío si no cambió nada. */
export function cambiosDeConfig(antes: ConfigDelClub, despues: ConfigDelClub): string[] {
  return CAMPOS_CONFIG.filter((c) => antes[c] !== despues[c]).map((c) => `${ETIQUETA_CAMBIO[c]}: ${VALOR_CORTO[c](antes[c])} → ${VALOR_CORTO[c](despues[c])}`);
}

/** Cuánto devuelve el programa de cada compra si TODOS los puntos se canjearan: puntos por sol × lo que vale cada punto, en %. */
export const retornoPct = (c: Pick<ConfigDelClub, "puntosPorSol" | "solesPor100">): number => Math.round(c.puntosPorSol * c.solesPor100 * 100) / 100;

export type LecturaDelRetorno = { pct: number; texto: string; superaElTope: boolean };

/** «Devuelves 5 % de cada compra si todos los puntos se canjean.» y si pasa tu tope de costo. */
export function lecturaDelRetorno(c: Pick<ConfigDelClub, "puntosPorSol" | "solesPor100" | "topeCostoPct">): LecturaDelRetorno {
  const pct = retornoPct(c);
  const base = `Devuelves ${veces(pct)} % de cada compra si todos los puntos se canjean.`;
  return pct > c.topeCostoPct
    ? { pct, superaElTope: true, texto: `${base} Es más que tu tope de costo (${veces(c.topeCostoPct)} %): revisa los números o sube el tope.` }
    : { pct, superaElTope: false, texto: `${base} Dentro de tu tope de costo (${veces(c.topeCostoPct)} %).` };
}

/** Los días de aviso de un cambio de lo que valen los puntos o el canje (Términos 5.9): la base lo hace cumplir. */
export const DIAS_DE_AVISO = 15;

/** ¿Este cambio toca lo que los clientes YA ganaron? Entonces rige con aviso. */
export const tocaLoGanado = (antes: ConfigDelClub, despues: ConfigDelClub) => antes.solesPor100 !== despues.solesPor100 || antes.canjeMinimo !== despues.canjeMinimo;

/** `aaaa-mm-dd` + n días (en UTC: es solo una fecha de calendario). */
export function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d! + dias)).toISOString().slice(0, 10);
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** «2026-11-03» → «3 de noviembre». */
export function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[(m ?? 1) - 1] ?? ""}`;
}

/** Desde cuándo rige lo que se va a guardar (`hoy` = el día de Lima, `aaaa-mm-dd`) y por qué. */
export function vigenciaDelCambio(antes: ConfigDelClub, despues: ConfigDelClub, hoy: string): { desde: string; conAviso: boolean; texto: string } {
  if (tocaLoGanado(antes, despues)) {
    const desde = sumarDias(hoy, DIAS_DE_AVISO);
    return { desde, conAviso: true, texto: `Como cambia lo que valen los puntos o el canje, rige desde el ${fechaCorta(desde)} (${DIAS_DE_AVISO} días de aviso). Hasta entonces, todo sigue igual.` };
  }
  return { desde: hoy, conAviso: false, texto: "Rige desde hoy." };
}

/** Un cambio del historial, en palabras: «Lo que valen 100 puntos: S/\u00a05 → S/\u00a04». Sin los campos que no cambiaron. */
export function cambioDelHistorial(h: CambioAnterior): string[] {
  const out: string[] = [];
  for (const c of CAMPOS_CONFIG) {
    const a = h.antes[c];
    const d = h.despues[c];
    if (a !== undefined && d !== undefined && a !== d) out.push(`${ETIQUETA_CAMBIO[c]}: ${VALOR_CORTO[c](a)} → ${VALOR_CORTO[c](d)}`);
  }
  return out;
}

/** La configuración en una línea: «1 punto por cada S/\u00a01 · 100 puntos valen S/\u00a05 · …». Para decir qué va a regir. */
export const configEnPalabras = (c: ConfigDelClub): string => CAMPOS_CONFIG.map((k) => NOMBRE_DEL_CAMPO[k](c[k])).join(" · ");
