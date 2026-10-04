/* ====================================================================
   piso-plan.ts · EL motor del piso (ADR-0328, actividad 7; ADR-0329, «Actualización 2026-10-04»)

   EL PROBLEMA. La misma pregunta —¿falta o sobra en el piso?— tenía cinco reglas: piso ≤ 4 (la política de Existencias), 0 en
   el piso y algo atrás («Por colgar»), 14 días de cobertura (Análisis), «estancada» a los 14 días y la vara de Frescura. Con
   piso ≤ 4, Tienda TRU marcaba «Reponer» en sus 510 tallas de 510: ninguna tiene más de 4 colgadas, así que la regla nunca podía
   decir «Mantener». Y el Inicio decía «Sube» cuando en Existencias «Subir» es del piso al almacén.

   LO QUE DECIDIÓ FELIPE (2026-10-04), y es TODO lo que este archivo sabe del negocio:
     · Dos relojes. El mix (cuánto lugar tiene cada categoría) es el reloj lento y lo arma la actividad 12; la lista del día es el
       reloj rápido: lo que se vendió ayer se cuelga primero, desde el día 1, sin esperar al mix.
     · Mínimo por modelo colgado: 1 por talla y COLOR, solo en las tallas centrales (S, M, L; 28, 30, 32; «Estándar» y «Única»
       cuentan como la única talla de su modelo). La talla extrema puede quedar en el almacén.
     · El mínimo nunca genera «pedir este modelo» (los modelos no se repiten): lo que falta se suma por categoría × talla ×
       familia de color, y esa es la señal para el Taller.
     · Velocidad = ventas escaneadas + ventas anotadas «sin registrar» que siguen pendientes, en 14 días, por sede; cada cifra
       dice cuántas ventas la respaldan y cuántas son anotadas a mano.
     · Sin el piso cuadrado, «Por colgar» queda en pausa (ADR-0328, decisión técnica 5).

   CONTRATO (Liskov: lo que promete y lo que asume).
     PROMETE: `planDelPiso` es PURA y TOTAL: para cada talla de una sede que separa piso y almacén devuelve UNA acción
       (por_colgar · por_reponer · sin_atras · mantener · pausa_sin_cuadre), la lista del día en orden y la lista «se vendió
       rápido y falta». Misma entrada → misma salida: sin red, sin reloj (el «hoy» viene en la lectura), sin azar.
     ASUME: la lectura de `retail.fn_piso_plan_lectura` (migración 20261004213000): lo LIBRE en piso y almacén (neto de
       apartadas, sin Cuarentena; la cifra de ADR-0270) y cada venta contada una sola vez, en el día en que se cobró.
     NO HACE: no mueve stock, no sugiere cantidades de compra, no guarda nada (ADR-0329: la sugerencia se calcula al abrir).

   UNA SOLA CASA PARA LAS CIFRAS DEL PISO. Toda comparación de lo colgado contra un umbral vive AQUÍ.
   `lib/piso-plan-umbral.test.ts` falla si alguien vuelve a escribir una fuera (la deuda de antes, de Análisis, está listada
   con su cuenta exacta y solo puede bajar).
   ==================================================================== */

import { compararTallas, tipoDeTalla } from "./tallas";

// ── Las cifras (las únicas del piso en la web) ──────────────────────────────────────────────────────────────

/** Los días que mira la lista del día (Felipe, 2026-10-04): 14, hoy incluido. La lectura SQL usa la misma ventana. */
export const DIAS_VENTANA = 14;

/** Prendas colgadas que pide cada talla central de un modelo en un color (Felipe: «me basta con 1 por color porque mi tienda
 *  es pequeña»). Las tallas que no son centrales no piden nada por el mínimo. */
export const MINIMO_TALLA_CENTRAL = 1;

/** «Se vendió rápido y falta»: lo que hay en la sede no alcanza para la próxima ventana al ritmo de la última. Es la misma
 *  ventana de 14 días, no un número nuevo. */
export const DIAS_ALCANCE_FALTA = DIAS_VENTANA;

/** La tabla de nombres de las tallas centrales (Felipe, 2026-10-04). Una categoría que tiene alguna de estas tallas en su curva
 *  decide por la tabla; la que no tiene ninguna (calzado 34–42, anillos 6–9) decide por el respaldo: el tercio central. */
export const TALLAS_CENTRALES = ["S", "M", "L", "28", "30", "32"] as const;

// ── La regla de talla central ───────────────────────────────────────────────────────────────────────────────

const normalizar = (t: string) => t.trim().toUpperCase();
const EN_LA_TABLA = new Set<string>(TALLAS_CENTRALES);

/**
 * El tercio central de una curva ordenada (S · M · L · XL…), simétrico: k = ⌈n/3⌉ tallas, una más si el margen no queda igual a
 * los dos lados. 9 tallas (34–42) → 37 · 38 · 39; 4 (6–9) → 7 · 8; 5 → las 3 del medio; 1 → esa; 2 → las dos.
 */
export function tercioCentral(curva: readonly string[]): string[] {
  const n = curva.length;
  if (n === 0) return [];
  let k = Math.ceil(n / 3);
  if ((n - k) % 2 === 1) k += 1;
  const desde = (n - k) / 2;
  return curva.slice(desde, desde + k);
}

/**
 * ¿Es central esta talla, en la curva de su categoría? Total: cualquier texto tiene respuesta.
 *   1. Sin talla → no (no se puede saber; el reloj rápido igual la cuida si se vendió).
 *   2. «Estándar», «Única», «Único»… → sí: es la única talla de su modelo.
 *   3. Si la curva tiene alguna talla de la tabla (S, M, L, 28, 30, 32) → central es la que está en la tabla.
 *   4. Si no → el tercio central de la curva ordenada (sin las únicas). La talla misma entra a la curva si no estaba (un dato
 *      que no calza con su categoría igual se decide, no se pierde).
 */
export function esTallaCentral(talla: string | null | undefined, curvaDeCategoria: readonly string[]): boolean {
  if (!talla || !talla.trim()) return false;
  if (tipoDeTalla(talla) === "unica") return true;
  const curva = [...new Set([...curvaDeCategoria, talla].map(normalizar))].filter((t) => tipoDeTalla(t) !== "unica");
  if (curva.some((t) => EN_LA_TABLA.has(t))) return EN_LA_TABLA.has(normalizar(talla));
  return tercioCentral([...curva].sort(compararTallas)).includes(normalizar(talla));
}

// ── La decisión de UNA talla (tabla de decisión: una prueba por fila en piso-plan.test.ts) ─────────────────────

export const ACCIONES_PISO = ["por_colgar", "por_reponer", "sin_atras", "mantener", "pausa_sin_cuadre"] as const;
export type AccionPiso = (typeof ACCIONES_PISO)[number];

/**
 * Qué pide hoy una talla, con lo LIBRE en piso y almacén y su requisito (cuántas debería tener colgadas):
 *
 *   | piso ≥ requisito | almacén > 0 | piso sin cuadrar | piso = 0 | → acción           |
 *   |        sí        |      —      |        —         |    —     | mantener           |
 *   |        no        |     no      |        —         |    —     | sin_atras          |
 *   |        no        |     sí      |        sí        |    —     | pausa_sin_cuadre   |
 *   |        no        |     sí      |        no        |    sí    | por_colgar         |
 *   |        no        |     sí      |        no        |    no    | por_reponer        |
 *
 * La pausa cubre EXACTAMENTE lo que el cuadre puede cambiar: el cuadre solo pasa prendas del almacén al piso (ADR-0328,
 * decisión 4), así que «Mantener» (ya hay suficiente colgado) y «Sin stock atrás» (atrás no hay nada) siguen siendo verdad sin
 * él; lo único que puede ser falso es «baja esto», y eso espera.
 */
export function decidirTalla(piso: number, almacen: number, requisito: number, enPausa: boolean): AccionPiso {
  if (piso >= requisito) return "mantener";
  if (almacen <= 0) return "sin_atras";
  if (enPausa) return "pausa_sin_cuadre";
  return piso <= 0 ? "por_colgar" : "por_reponer";
}

/** ¿La acción manda a alguien al almacén a bajar algo hoy? (La lista del día y el «Cuelga N» del Inicio son esto.) */
export function esParaColgar(accion: AccionPiso | null | undefined): boolean {
  return accion === "por_colgar" || accion === "por_reponer";
}

/** ¿Al piso le falta algo en esta talla, se pueda resolver en la tienda o no? */
export function pidePiso(accion: AccionPiso | null | undefined): boolean {
  return accion === "por_colgar" || accion === "por_reponer" || accion === "sin_atras" || accion === "pausa_sin_cuadre";
}

/**
 * Cuántas debería tener colgadas una talla hoy: el mínimo (1 si es central) o lo que se vendió de ESA prenda en un día —ayer u
 * hoy, el mayor—, lo que pida más. Así lo que se vendió ayer se vuelve a colgar aunque sea una talla extrema (el reloj rápido),
 * y una talla central nunca queda sin ninguna. Una talla retirada no pide nada: no se cuelga lo que ya no se vende.
 */
export function requisitoDeTalla(t: { central: boolean; vendidasHoy: number; vendidasAyer: number; retirada: boolean }): number {
  if (t.retirada) return 0;
  return Math.max(t.central ? MINIMO_TALLA_CENTRAL : 0, t.vendidasHoy, t.vendidasAyer);
}

/** ¿Qué pasará con la talla si se suben `n` del piso al almacén? La ventana «Subir prenda» lo pregunta ANTES de confirmar, con
 *  la MISMA regla que después pinta la fila (ADR-0208, bloque 3): `true` si va a pedir bajarlas de nuevo. */
export function quedaraPidiendoColgar(disponible: { piso: number; almacen: number }, n: number, requisito: number): boolean {
  if (!Number.isInteger(n) || n <= 0 || n > disponible.piso) return false;
  return esParaColgar(decidirTalla(disponible.piso - n, disponible.almacen + n, requisito, false));
}

// ── Lo que entra: la lectura de `retail.fn_piso_plan_lectura` ────────────────────────────────────────────────

/** Una talla (variante) con stock o en camino en la sede, con lo vendido de ESA prenda. */
export type TallaEnSede = {
  varianteId: string;
  productoId: string;
  referencia: string;
  categoriaId: string | null;
  tallaId: string | null;
  talla: string | null;
  colorCodigo: string | null;
  color: string | null;
  familiaColor: string | null;
  retirada: boolean;
  fotoUrl: string | null;
  pisoLibre: number;
  almacenLibre: number;
  enCamino: number;
  vendidasHoy: number;
  vendidasAyer: number;
  vendidas14: number;
};

/** Lo vendido en la ventana por categoría × talla × familia de color: escaneadas y anotadas a mano (pendientes). */
export type VentaPorAtributo = {
  categoriaId: string | null;
  tallaId: string | null;
  talla: string | null;
  familiaColor: string | null;
  escaneadas: number;
  anotadas: number;
};

/** Las tallas que ofrece una categoría (`categoria_tallas`). */
export type CurvaDeCategoria = { categoriaId: string; categoria: string; tallas: string[] };

export type LecturaDelPiso = {
  ubicacionId: string;
  separaPiso: boolean;
  /** Día de Lima de la lectura (`YYYY-MM-DD`): el motor no mira el reloj. */
  hoy: string;
  dias: number;
  tallas: TallaEnSede[];
  ventas: VentaPorAtributo[];
  curvas: CurvaDeCategoria[];
};

/** La fecha del cuadre del piso (actividad 3, `retail.fn_cuadre_piso_estado`). `sabido: false` = todavía no se puede saber (la
 *  función no existe o no respondió): no se pausa nada, para no esconder la lista por una lectura que falta. */
export type Cuadre = { sabido: false } | { sabido: true; fecha: string | null };

export type OpcionesPlan = {
  /** Prendas que caben colgadas en la sede (m² × densidad, actividad 6). Sin él, no hay «lleno». */
  capacidad?: number | null;
  /** La meta de cada categoría como fracción del piso (actividad 12), por `categoriaId`. Sin él, no hay meta por categoría. */
  mix?: ReadonlyMap<string, number> | null;
  cuadre?: Cuadre;
};

// ── Lo que sale ─────────────────────────────────────────────────────────────────────────────────────────────

/** La decisión de una talla: lo único que Existencias guarda por fila (`FilaExistencias.planPiso`). */
export type PisoDeTalla = {
  accion: AccionPiso;
  /** Cuántas debería tener colgadas hoy (`requisitoDeTalla`). */
  requisito: number;
  central: boolean;
  /** Lo vendido de ESA prenda hoy y ayer (escaneado): la primera llave del orden de la lista del día. */
  vendidasRecientes: number;
  /** Ventas por día de su categoría × talla × familia de color en la ventana (escaneadas + anotadas). */
  ritmoAtributo: number;
  /** Su categoría ya llegó a su meta del piso: se cuelga igual, y Frescura propone qué retirar (ADR-0329 act. 10). */
  entraUnaSaleUna: boolean;
};

/** Una fila de la señal para el Taller: categoría × talla × familia de color. */
export type FilaAtributo = {
  clave: string;
  categoriaId: string | null;
  categoria: string | null;
  talla: string | null;
  familiaColor: string | null;
  /** Ventas que respaldan la cifra, y cuántas de ellas son anotadas a mano. */
  ventas: number;
  anotadas: number;
  porDia: number;
  /** Lo libre en la sede (piso + almacén) de tallas con esa llave. */
  disponible: number;
  enPiso: number;
  /** Días que dura lo disponible al ritmo de la ventana; `null` si no se vendió nada (no se divide por cero). */
  alcanceDias: number | null;
  /** Prendas (modelo en un color) con esta talla central sin ninguna colgada y sin nada atrás: el faltante del mínimo. */
  huecos: number;
};

export type FilaCategoria = {
  categoriaId: string | null;
  categoria: string | null;
  colgadas: number;
  /** Capacidad × mix, en prendas; `null` sin capacidad o sin mix para la categoría. */
  meta: number | null;
  sobreMeta: boolean;
};

export type PlanDelPiso = {
  separaPiso: boolean;
  enPausa: boolean;
  hoy: string;
  dias: number;
  /** varianteId → decisión. Vacío donde la sede no separa piso y almacén (Taller): ahí no hay «Hoy». */
  porTalla: Map<string, PisoDeTalla>;
  /** Las tallas para colgar o reponer hoy, en orden: lo vendido ayer y hoy primero, luego lo que el piso no tiene, luego el
   *  ritmo de su categoría × talla × familia, y al final modelo, color y talla (estable). */
  listaDelDia: string[];
  porAtributo: FilaAtributo[];
  /** Lo que se vendió y no alcanza para la próxima ventana o tiene huecos en el mínimo, de lo que más rápido se vende. */
  seVendioRapidoYFalta: FilaAtributo[];
  categorias: FilaCategoria[];
  colgadas: number;
  capacidad: number | null;
};

const VACIO = "∅";
/** La llave de la señal para el Taller. Lo vacío es UNA llave (una prenda sin talla o sin familia no se pierde). */
export function claveAtributo(categoriaId: string | null, tallaId: string | null, familiaColor: string | null): string {
  return `${categoriaId ?? VACIO}|${tallaId ?? VACIO}|${familiaColor ?? VACIO}`;
}

const redondear1 = (x: number) => Math.round(x * 10) / 10;
const redondear2 = (x: number) => Math.round(x * 100) / 100;

/** La curva de cada categoría: lo que ofrece (`categoria_tallas`) más lo que la sede tiene de ella, para que una categoría sin
 *  curva cargada igual tenga con qué decidir. */
function curvasPorCategoria(lectura: LecturaDelPiso): Map<string, string[]> {
  const curvas = new Map<string, Set<string>>();
  const sumar = (cat: string | null, talla: string | null) => {
    if (!cat || !talla) return;
    const c = curvas.get(cat) ?? new Set<string>();
    c.add(talla);
    curvas.set(cat, c);
  };
  for (const c of lectura.curvas) for (const t of c.tallas) sumar(c.categoriaId, t);
  for (const t of lectura.tallas) sumar(t.categoriaId, t.talla);
  return new Map([...curvas].map(([cat, s]) => [cat, [...s]]));
}

/**
 * EL motor. Ver el contrato arriba. Complejidad: O(T log T) por el orden de la lista del día, con T = tallas de la sede
 * (~500 en TRU, ~2.000 de techo en 3 años): medido en la prueba, milisegundos.
 */
export function planDelPiso(lectura: LecturaDelPiso, opciones: OpcionesPlan = {}): PlanDelPiso {
  const cuadre: Cuadre = opciones.cuadre ?? { sabido: false };
  const enPausa = lectura.separaPiso && cuadre.sabido && cuadre.fecha === null;
  const capacidad = opciones.capacidad ?? null;
  const nombreCategoria = new Map(lectura.curvas.map((c) => [c.categoriaId, c.categoria]));
  const curvas = curvasPorCategoria(lectura);

  // Lo vendido por llave (14 días): escaneadas + anotadas pendientes, cada venta una vez (lo garantiza la lectura).
  const ventasPorClave = new Map<string, VentaPorAtributo>();
  for (const v of lectura.ventas) {
    const k = claveAtributo(v.categoriaId, v.tallaId, v.familiaColor);
    const prev = ventasPorClave.get(k);
    ventasPorClave.set(k, prev ? { ...prev, escaneadas: prev.escaneadas + v.escaneadas, anotadas: prev.anotadas + v.anotadas } : v);
  }
  const ritmo = (k: string) => {
    const v = ventasPorClave.get(k);
    return v ? (v.escaneadas + v.anotadas) / lectura.dias : 0;
  };

  // Lo colgado por categoría y su meta (reloj lento; sin capacidad o sin mix, solo se cuenta).
  const colgadasPorCategoria = new Map<string | null, number>();
  for (const t of lectura.tallas) colgadasPorCategoria.set(t.categoriaId, (colgadasPorCategoria.get(t.categoriaId) ?? 0) + Math.max(0, t.pisoLibre));
  const categorias: FilaCategoria[] = [...colgadasPorCategoria].map(([categoriaId, colgadas]) => {
    const fraccion = categoriaId ? opciones.mix?.get(categoriaId) : undefined;
    const meta = capacidad !== null && fraccion !== undefined ? Math.round(capacidad * fraccion) : null;
    return { categoriaId, categoria: categoriaId ? nombreCategoria.get(categoriaId) ?? null : null, colgadas, meta, sobreMeta: meta !== null && colgadas >= meta };
  });
  const sobreMeta = new Set(categorias.filter((c) => c.sobreMeta).map((c) => c.categoriaId));

  // La decisión de cada talla.
  const porTalla = new Map<string, PisoDeTalla>();
  const huecosPorClave = new Map<string, number>();
  if (lectura.separaPiso) {
    for (const t of lectura.tallas) {
      const central = esTallaCentral(t.talla, t.categoriaId ? curvas.get(t.categoriaId) ?? [] : []);
      const requisito = requisitoDeTalla({ central, vendidasHoy: t.vendidasHoy, vendidasAyer: t.vendidasAyer, retirada: t.retirada });
      const accion = decidirTalla(t.pisoLibre, t.almacenLibre, requisito, enPausa);
      const clave = claveAtributo(t.categoriaId, t.tallaId, t.familiaColor);
      porTalla.set(t.varianteId, {
        accion,
        requisito,
        central,
        vendidasRecientes: t.vendidasHoy + t.vendidasAyer,
        ritmoAtributo: ritmo(clave),
        entraUnaSaleUna: esParaColgar(accion) && sobreMeta.has(t.categoriaId),
      });
      // El faltante del mínimo: una talla central que la sede tiene (o tuvo: su fila queda en 0) de un modelo en un color, sin
      // ninguna colgada y sin nada atrás. Una talla que el modelo nunca tuvo aquí no cuenta: un top «Estándar» no tiene M.
      if (central && !t.retirada && t.pisoLibre <= 0 && accion === "sin_atras") huecosPorClave.set(clave, (huecosPorClave.get(clave) ?? 0) + 1);
    }
  }

  // La lista del día.
  const porId = new Map(lectura.tallas.map((t) => [t.varianteId, t]));
  const listaDelDia = [...porTalla]
    .filter(([, d]) => esParaColgar(d.accion))
    .sort(([ia, a], [ib, b]) => {
      const ta = porId.get(ia)!;
      const tb = porId.get(ib)!;
      return (
        b.vendidasRecientes - a.vendidasRecientes ||
        Number(b.accion === "por_colgar") - Number(a.accion === "por_colgar") ||
        b.ritmoAtributo - a.ritmoAtributo ||
        ta.referencia.localeCompare(tb.referencia, "es") ||
        ta.productoId.localeCompare(tb.productoId) ||
        (ta.color ?? "").localeCompare(tb.color ?? "", "es") ||
        compararTallas(ta.talla ?? "", tb.talla ?? "") ||
        ia.localeCompare(ib)
      );
    })
    .map(([id]) => id);

  // La señal para el Taller: por categoría × talla × familia de color.
  const filas = new Map<string, FilaAtributo>();
  const fila = (categoriaId: string | null, tallaId: string | null, talla: string | null, familiaColor: string | null) => {
    const clave = claveAtributo(categoriaId, tallaId, familiaColor);
    let f = filas.get(clave);
    if (!f) {
      f = {
        clave,
        categoriaId,
        categoria: categoriaId ? nombreCategoria.get(categoriaId) ?? null : null,
        talla,
        familiaColor,
        ventas: 0,
        anotadas: 0,
        porDia: 0,
        disponible: 0,
        enPiso: 0,
        alcanceDias: null,
        huecos: huecosPorClave.get(clave) ?? 0,
      };
      filas.set(clave, f);
    }
    return f;
  };
  for (const v of ventasPorClave.values()) {
    const f = fila(v.categoriaId, v.tallaId, v.talla, v.familiaColor);
    f.ventas = v.escaneadas + v.anotadas;
    f.anotadas = v.anotadas;
  }
  for (const t of lectura.tallas) {
    const clave = claveAtributo(t.categoriaId, t.tallaId, t.familiaColor);
    if (!filas.has(clave) && !huecosPorClave.has(clave)) continue; // sin ventas ni huecos: no es señal de nada
    const f = fila(t.categoriaId, t.tallaId, t.talla, t.familiaColor);
    f.disponible += Math.max(0, t.pisoLibre) + Math.max(0, t.almacenLibre);
    f.enPiso += Math.max(0, t.pisoLibre);
  }
  const porAtributo = [...filas.values()].map((f) => {
    const porDia = f.ventas / lectura.dias;
    return { ...f, porDia: redondear2(porDia), alcanceDias: porDia > 0 ? redondear1(f.disponible / porDia) : null };
  });
  const seVendioRapidoYFalta = porAtributo
    .filter((f) => f.ventas > 0 && (f.huecos > 0 || (f.alcanceDias !== null && f.alcanceDias < DIAS_ALCANCE_FALTA)))
    .sort((a, b) => b.ventas - a.ventas || b.huecos - a.huecos || (a.alcanceDias ?? 0) - (b.alcanceDias ?? 0) || a.clave.localeCompare(b.clave));

  return {
    separaPiso: lectura.separaPiso,
    enPausa,
    hoy: lectura.hoy,
    dias: lectura.dias,
    porTalla,
    listaDelDia,
    porAtributo,
    seVendioRapidoYFalta,
    categorias,
    colgadas: [...colgadasPorCategoria.values()].reduce((s, n) => s + n, 0),
    capacidad,
  };
}

// ── De la respuesta de la base a la lectura (sin confiar en la forma) ──────────────────────────────────────────

const texto = (x: unknown): string | null => (typeof x === "string" && x !== "" ? x : null);
const numero = (x: unknown): number => {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : 0;
};

/**
 * La respuesta de `retail.fn_piso_plan_lectura` (un jsonb) como `LecturaDelPiso`. `null` si no es la forma esperada —la base
 * respondió NULL (sin la puerta) o algo que no se entiende—: quien llama lo muestra como «no se pudo leer», nunca como «al día».
 */
export function lecturaDesdeJson(json: unknown): LecturaDelPiso | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const j = json as Record<string, unknown>;
  const ubicacionId = texto(j.ubicacion_id);
  const hoy = texto(j.hoy);
  if (!ubicacionId || !hoy || !Array.isArray(j.tallas) || !Array.isArray(j.ventas) || !Array.isArray(j.curvas)) return null;
  const dias = numero(j.dias);
  if (dias <= 0) return null;
  const tallas: TallaEnSede[] = [];
  for (const crudo of j.tallas as unknown[]) {
    const t = (crudo ?? {}) as Record<string, unknown>;
    const varianteId = texto(t.variante_id);
    if (!varianteId) return null;
    tallas.push({
      varianteId,
      productoId: texto(t.producto_id) ?? "",
      referencia: texto(t.referencia) ?? "",
      categoriaId: texto(t.categoria_id),
      tallaId: texto(t.talla_id),
      talla: texto(t.talla),
      colorCodigo: texto(t.color_codigo),
      color: texto(t.color),
      familiaColor: texto(t.familia_color),
      retirada: t.retirada === true,
      fotoUrl: texto(t.foto_url),
      pisoLibre: numero(t.piso_libre),
      almacenLibre: numero(t.almacen_libre),
      enCamino: numero(t.en_camino),
      vendidasHoy: numero(t.vendidas_hoy),
      vendidasAyer: numero(t.vendidas_ayer),
      vendidas14: numero(t.vendidas_14),
    });
  }
  const ventas: VentaPorAtributo[] = (j.ventas as unknown[]).map((crudo) => {
    const v = (crudo ?? {}) as Record<string, unknown>;
    return {
      categoriaId: texto(v.categoria_id),
      tallaId: texto(v.talla_id),
      talla: texto(v.talla),
      familiaColor: texto(v.familia_color),
      escaneadas: numero(v.escaneadas),
      anotadas: numero(v.anotadas),
    };
  });
  const curvas: CurvaDeCategoria[] = [];
  for (const crudo of j.curvas as unknown[]) {
    const c = (crudo ?? {}) as Record<string, unknown>;
    const categoriaId = texto(c.categoria_id);
    if (!categoriaId) continue;
    const tallasCurva = Array.isArray(c.tallas) ? (c.tallas as unknown[]).map((x) => texto((x as Record<string, unknown> | null)?.talla)).filter((x): x is string => !!x) : [];
    curvas.push({ categoriaId, categoria: texto(c.categoria) ?? "", tallas: tallasCurva });
  }
  return { ubicacionId, separaPiso: j.separa_piso === true, hoy, dias, tallas, ventas, curvas };
}
