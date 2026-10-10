import {
  analizarSede,
  inicioDelMesLima,
  lecturaAl,
  tramoDosRelojes,
  type FrescuraPrenda,
  type LecturaFrescuraConPiso,
  type RespaldoCayla,
  type UnidadColgada,
} from "./frescura-reglas";

// Frescura del piso, la tienda de un vistazo (ADR-0208, act. 2026-10-10 (b)): «¿tu piso está fresco?» con una barra por familia
// (Indumentaria arriba; Bisutería y Accesorios, cada una en su línea) que reparte TODAS las unidades colgadas en tres estados —las
// palabras de Felipe: Fresca · Vigente · Envejeciendo— y lo que todavía no se sabe, siempre a la vista. Los clásicos van aparte: no
// se miden por novedad (decisión 10). Puro: sin React ni Supabase; lo prueba `frescura-piso.test.ts`.
//
// CÓMO CAE CADA UNIDAD. Es la misma regla que el estado de la prenda (`tramoDosRelojes`), aplicada a cada tanda colgada y no solo a la
// más vieja: Fresca si su MODELO todavía no llega a P50 de su categoría; si no, por los días de ESA unidad: Vigente antes de P75 y
// Envejeciendo después (Envejecida y Crítica juntas: «Hay que moverla» es una acción, no un estado). Por eso un modelo con una unidad
// de 20 días y dos repuestas ayer pinta 1 Envejeciendo y 2 Vigentes, y la barra de la tienda es la suma exacta de sus categorías.
//
// LO QUE NO SE SABE no sale del denominador (se retira `pctNuevas`, que dividía solo por lo que tenía estado y podía decir «100 %
// fresca» con 3 de 67 unidades): una unidad sin fecha (carga inicial, ajuste) que todavía no pasó P75, o la de una categoría sin
// ritmo todavía (sin ventas, sin P50), cuenta en «Aún no se sabe».

export type TramoPiso = "fresca" | "vigente" | "envejeciendo" | "sin_saber" | "clasico";
/** El orden en que se dibujan; los clásicos, al final y fuera del 100 %. */
export const TRAMOS_PISO: readonly TramoPiso[] = ["fresca", "vigente", "envejeciendo", "sin_saber", "clasico"];
/** Los tramos que suman el 100 % de la barra. */
export const TRAMOS_DEL_100: readonly TramoPiso[] = ["fresca", "vigente", "envejeciendo", "sin_saber"];
export const NOMBRE_TRAMO_PISO: Record<TramoPiso, string> = {
  fresca: "Fresca",
  vigente: "Vigente",
  envejeciendo: "Envejeciendo",
  sin_saber: "Aún no se sabe",
  clasico: "Clásico",
};
/** El color de cada tramo: verde · neutro · ámbar, nunca rojo (los colores A de ADR-0208); lo que no se sabe, apagado. */
export const CLASE_TRAMO_PISO: Record<TramoPiso, string> = {
  fresca: "bg-verde",
  vigente: "bg-tinta/25",
  envejeciendo: "bg-ambar",
  sin_saber: "bg-taupe/35",
  clasico: "bg-pizarra/60",
};

export type ConteoPiso = Record<TramoPiso, number>;
export const conteoVacio = (): ConteoPiso => ({ fresca: 0, vigente: 0, envejeciendo: 0, sin_saber: 0, clasico: 0 });

/** Dónde cae una tanda colgada de una prenda que se juzga (con los cortes de su categoría sin ella). */
function tramoDeLaTanda(p: FrescuraPrenda, u: UnidadColgada): TramoPiso {
  const vara = p.categoriaSinElla;
  if (vara === null || vara.cortes.p50 === null) return "sin_saber";
  const { cortes, tMax } = vara;
  const p50 = vara.cortes.p50;
  // Su modelo todavía no llega a la mitad: Fresca (si se sabe desde cuándo está; si no, puede ser Fresca o Vigente).
  const modeloFresco = tramoDosRelojes(p.reloj.segundos, p.reloj.segundos, cortes, tMax)?.tramo === "nueva";
  if (modeloFresco && !p.reloj.alMenos) return "fresca";
  // Pasada la mitad (o sin saberlo), lo dicen los días de la unidad. Con el modelo puesto al menos en P50 la regla ya no puede
  // decir Fresca: queda Vigente o Envejeciendo.
  const t = tramoDosRelojes(Math.max(p.reloj.segundos, p50), u.segundos, cortes, tMax);
  if (t === null) return "sin_saber";
  const envejece = t.tramo === "envejecida" || t.tramo === "critica";
  // Sin fecha, sus días son un piso: si ya pasó P75 se sabe que envejece; si no, no se sabe.
  if (u.edadDesconocida) return envejece ? "envejeciendo" : "sin_saber";
  // El modelo entró sin fecha y no se sabe si pasó la mitad: lo que tampoco la pasó puede ser Fresco.
  if (p.reloj.alMenos && modeloFresco && u.segundos < p50) return "sin_saber";
  return envejece ? "envejeciendo" : "vigente";
}

/**
 * Las unidades colgadas de una prenda, por tramo, y (si se da `precioDe`) sus soles. Suma SIEMPRE su `pisoHoy`: si el libro trae
 * menos tandas colgadas que lo que dice el stock (no debería), lo que falta cae en «Aún no se sabe», nunca desaparece; si trae más,
 * cuenta hasta el stock, de la más vieja a la más nueva.
 */
export function tramosDeLaPrenda(p: FrescuraPrenda, precioDe?: (varianteId: string) => number | null): { unidades: ConteoPiso; soles: ConteoPiso; sinPrecio: number } {
  const unidades = conteoVacio();
  const soles = conteoVacio();
  let sinPrecio = 0;
  const sumar = (tramo: TramoPiso, n: number, varianteId: string) => {
    if (n <= 0) return;
    unidades[tramo] += n;
    const precio = precioDe?.(varianteId) ?? null;
    if (precio === null) sinPrecio += n;
    else soles[tramo] += n * precio;
  };
  const juzgable = p.estado.tipo === "semaforo" || p.estado.tipo === "sin_edad_conocida";
  for (const t of p.tallas) {
    if (t.pisoHoy <= 0) continue;
    if (p.estado.tipo === "clasico") {
      sumar("clasico", t.pisoHoy, t.varianteId);
      continue;
    }
    if (!juzgable) {
      sumar("sin_saber", t.pisoHoy, t.varianteId);
      continue;
    }
    let restante = t.pisoHoy;
    for (const u of [...t.colgadas].sort((a, b) => b.segundos - a.segundos)) {
      const n = Math.min(u.unidades, restante);
      sumar(tramoDeLaTanda(p, u), n, t.varianteId);
      restante -= n;
      if (restante <= 0) break;
    }
    sumar("sin_saber", restante, t.varianteId);
  }
  return { unidades, soles, sinPrecio };
}

export type Familia = { codigo: string; nombre: string; orden: number };

/** El piso de una familia: sus unidades colgadas por tramo y sus soles a precio de lista (null si alguna unidad no tiene precio). */
export type FamiliaPiso = {
  /** `familias.codigo`, o null para lo que no tiene categoría o su familia no se pudo leer. */
  codigo: string | null;
  nombre: string;
  unidades: ConteoPiso;
  /** Las unidades del 100 % (sin los clásicos). */
  total: number;
  /** Prendas (modelo+color) con algo colgado, clásicos incluidos. */
  prendas: number;
  soles: ConteoPiso | null;
};

const SIN_FAMILIA = "Otras";

/**
 * El piso de la tienda por familia, en el orden de `familias.orden` (Indumentaria primero) y lo que no tiene familia al final. Solo las
 * familias con algo colgado. `familiaDe` dice la familia de cada categoría; sin ella (la lectura falló), todo va en una sola barra.
 */
/** La familia de una categoría, como la cuenta la barra: una familia que no está en el catálogo, o lo sin categoría, es «Otras» (null). */
function familiaResuelta(categoriaId: string, familiaDe: (categoriaId: string) => string | null, porCodigo: ReadonlyMap<string, Familia>): string | null {
  const codigo = categoriaId === "" ? null : familiaDe(categoriaId);
  return codigo !== null && porCodigo.has(codigo) ? codigo : null;
}

export function pisoPorFamilia(
  prendas: readonly FrescuraPrenda[],
  o: { familiaDe: (categoriaId: string) => string | null; familias: readonly Familia[]; precioDe?: (varianteId: string) => number | null },
): FamiliaPiso[] {
  const porCodigo = new Map(o.familias.map((f) => [f.codigo, f]));
  const grupos = new Map<string | null, FamiliaPiso & { sinPrecio: number }>();
  for (const p of prendas) {
    if (p.pisoHoy <= 0) continue;
    const codigo = familiaResuelta(p.categoriaId, o.familiaDe, porCodigo);
    const g =
      grupos.get(codigo) ??
      ({ codigo, nombre: codigo === null ? SIN_FAMILIA : porCodigo.get(codigo)!.nombre, unidades: conteoVacio(), total: 0, prendas: 0, soles: conteoVacio(), sinPrecio: 0 } as FamiliaPiso & { sinPrecio: number });
    grupos.set(codigo, g);
    const t = tramosDeLaPrenda(p, o.precioDe);
    for (const k of TRAMOS_PISO) {
      g.unidades[k] += t.unidades[k];
      g.soles![k] += t.soles[k];
    }
    g.sinPrecio += o.precioDe ? t.sinPrecio : 1;
    g.prendas += 1;
  }
  const orden = (c: string | null) => (c === null ? Infinity : porCodigo.get(c)!.orden);
  return [...grupos.values()]
    .sort((a, b) => orden(a.codigo) - orden(b.codigo))
    .map(({ sinPrecio, ...g }) => ({
      ...g,
      total: TRAMOS_DEL_100.reduce((s, k) => s + g.unidades[k], 0),
      // Plata que no se sabe entera no se dice: si alguna unidad no tiene precio, sin soles.
      soles: sinPrecio > 0 ? null : g.soles,
    }));
}

/**
 * De cada 100: los porcentajes enteros de los tramos del 100 % que suman exactamente 100 (el resto mayor se lleva lo que falta), para que
 * «58 % · 22 % · 20 %» nunca sume 99. Sin unidades, todo 0.
 */
export function porcentajes(c: ConteoPiso): Record<TramoPiso, number> {
  const total = TRAMOS_DEL_100.reduce((s, k) => s + c[k], 0);
  const r: Record<TramoPiso, number> = { fresca: 0, vigente: 0, envejeciendo: 0, sin_saber: 0, clasico: 0 };
  if (total <= 0) return r;
  const exactos = TRAMOS_DEL_100.map((k) => ({ k, x: (c[k] * 100) / total }));
  for (const { k, x } of exactos) r[k] = Math.floor(x);
  let falta = 100 - TRAMOS_DEL_100.reduce((s, k) => s + r[k], 0);
  for (const { k } of [...exactos].sort((a, b) => b.x - Math.floor(b.x) - (a.x - Math.floor(a.x)))) {
    if (falta <= 0) break;
    r[k] += 1;
    falta -= 1;
  }
  return r;
}

// ---------------------------------------------------------------------------
// Contra el mes anterior (decisión 5 de Felipe, 2026-10-10: «la frase dice si el piso está más fresco o más viejo que hace 4 semanas»)
// ---------------------------------------------------------------------------

/** Cuánto atrás se mira. Son 4 semanas: el cliente que vuelve cada 1 o 2 semanas ya vio dos o tres veces el piso de entonces. */
export const DIAS_ANTES = 28;

/** El piso de hace `DIAS_ANTES` días, por categoría: lo que hace falta para comparar, sin las prendas (viaja liviano a la pantalla). */
export type PisoAnterior = { fecha: string; porCategoria: { categoriaId: string; unidades: ConteoPiso }[] };

/**
 * El piso de hace 4 semanas, reconstruido del MISMO libro de hoy (`lecturaAl`), juzgado como se juzgaba entonces: con la vara del mes de
 * ese día y la misma regla de cada unidad. Sin guardar fotos: la lectura trae 120 días. Null si la lectura no llega tan atrás.
 */
export function pisoAnterior(l: LecturaFrescuraConPiso, respaldo?: RespaldoCayla): PisoAnterior | null {
  const fecha = new Date(Date.parse(l.ahora) - DIAS_ANTES * 86_400_000).toISOString();
  if (Date.parse(fecha) <= Date.parse(l.desde)) return null;
  const { sede } = analizarSede(lecturaAl(l, fecha), respaldo, { corteDelMes: inicioDelMesLima(fecha) });
  const porCategoria = new Map<string, ConteoPiso>();
  for (const p of sede.prendas) {
    if (p.pisoHoy <= 0) continue;
    const c = porCategoria.get(p.categoriaId) ?? conteoVacio();
    const { unidades } = tramosDeLaPrenda(p);
    for (const k of TRAMOS_PISO) c[k] += unidades[k];
    porCategoria.set(p.categoriaId, c);
  }
  return { fecha, porCategoria: [...porCategoria].map(([categoriaId, unidades]) => ({ categoriaId, unidades })) };
}

/** Las unidades de hace 4 semanas de UNA familia (la misma regla de familia que la barra de hoy). */
export function conteoDeFamilia(
  anterior: PisoAnterior,
  codigo: string | null,
  o: { familiaDe: (categoriaId: string) => string | null; familias: readonly Familia[] },
): ConteoPiso {
  const porCodigo = new Map(o.familias.map((f) => [f.codigo, f]));
  const c = conteoVacio();
  for (const fila of anterior.porCategoria) {
    if (familiaResuelta(fila.categoriaId, o.familiaDe, porCodigo) !== codigo) continue;
    for (const k of TRAMOS_PISO) c[k] += fila.unidades[k];
  }
  return c;
}

/** Lo que dice la puerta compartida (`preparacionDeSede` del motor de demanda, la misma de Análisis): si la tienda ya registra lo que vende. */
export type PuertaPiso = {
  puedeHablar: boolean;
  aviso: string;
  /** El piso ya se cuadró (el sistema sabe qué cuelga): sin esto, las categorías no reciben veredicto (`loQueMueveLaAguja`). */
  pisoCuadrado?: boolean;
} | null;

/** «Aún no se sabe» desde esta parte del piso, la frase no afirma nada: con tanto gris, el porcentaje de frescas podría ser otro. */
export const PARTE_SIN_SABER_QUE_CALLA = 0.2;

/**
 * Cuántos puntos tiene que moverse una cifra para decir que el piso cambió y no que es ruido. Simulado con una tienda del tamaño de TRU (308
 * unidades): de una semana a otra «envejeciendo» se mueve unos 2,2 puntos y «fresca» unos 3,1; 7 y 9 puntos son tres veces eso: una falsa
 * alarma cada varios años. Cuando haya 8 semanas de historia guardada se puede medir el ruido de cada tienda (la foto diaria, fuera de esta ronda).
 */
export const PUNTOS_ENVEJECIENDO = 7;
export const PUNTOS_FRESCA = 9;

export type Tendencia = "mas_fresco" | "mas_viejo" | "igual";

export type RespuestaPiso = {
  /** La pregunta de la pantalla: siempre la misma. */
  pregunta: string;
  /** La respuesta en una frase, o por qué todavía no la hay. */
  respuesta: string;
  /** Si la respuesta es un dato (se puede afirmar) o un «todavía no». */
  afirma: boolean;
  /** Contra hace 4 semanas, si se puede comparar (las dos lecturas afirman); null si no. */
  tendencia: Tendencia | null;
  /** Los porcentajes de hace 4 semanas, si se comparó. */
  antes: Record<TramoPiso, number> | null;
};

export const PREGUNTA_PISO = "¿Tu piso está fresco?";

/** Se puede afirmar algo de este piso: tiene unidades y casi todo se sabe. */
const sePuedeDecir = (c: ConteoPiso): boolean => {
  const total = TRAMOS_DEL_100.reduce((s, k) => s + c[k], 0);
  return total > 0 && c.sin_saber / total < PARTE_SIN_SABER_QUE_CALLA;
};

/** Más fresco, más viejo o igual que hace 4 semanas. Envejeciendo manda: si sube, es lo que hay que ver aunque «fresca» también suba. */
export function tendenciaDe(hoy: ConteoPiso, antes: ConteoPiso): Tendencia {
  const a = porcentajes(antes);
  const h = porcentajes(hoy);
  const dEnvejece = h.envejeciendo - a.envejeciendo;
  const dFresca = h.fresca - a.fresca;
  if (dEnvejece >= PUNTOS_ENVEJECIENDO || (dFresca <= -PUNTOS_FRESCA && dEnvejece > -PUNTOS_ENVEJECIENDO)) return "mas_viejo";
  if (dEnvejece <= -PUNTOS_ENVEJECIENDO || dFresca >= PUNTOS_FRESCA) return "mas_fresco";
  return "igual";
}

const COLA_TENDENCIA: Record<Tendencia, string> = {
  mas_fresco: ": tu piso está más fresco que hace 4 semanas.",
  mas_viejo: ": ojo, tu piso está más viejo que hace 4 semanas.",
  igual: ", igual que hace 4 semanas.",
};

/**
 * La respuesta de la cabecera, mirando la familia principal (la primera: Indumentaria). Habla solo si la tienda pasa la puerta (registra lo
 * que vende: si no, lo vendido sigue «colgado» y envejece en falso) y si lo que no se sabe es poco; si no, dice por qué todavía no. Si el
 * piso de hace 4 semanas también se podía afirmar, dice si está más fresco, más viejo o igual (la meta de Felipe: contra el mes anterior).
 */
export function respuestaDelPiso(principal: FamiliaPiso | null, puerta: PuertaPiso, antes: ConteoPiso | null = null): RespuestaPiso {
  const base = { pregunta: PREGUNTA_PISO, tendencia: null, antes: null };
  if (principal === null || principal.total <= 0) return { ...base, respuesta: "Todavía no hay nada colgado.", afirma: false };
  if (puerta === null || !puerta.puedeHablar) return { ...base, respuesta: "Todavía no se puede saber.", afirma: false };
  if (!sePuedeDecir(principal.unidades)) {
    const n = porcentajes(principal.unidades).sin_saber;
    return { ...base, respuesta: `Todavía no se puede decir: aún no se sabe de ${n} de cada 100 prendas colgadas.`, afirma: false };
  }
  const f = porcentajes(principal.unidades).fresca;
  const dato = `${f} de cada 100 prendas colgadas están frescas`;
  if (antes === null || !sePuedeDecir(antes)) return { ...base, respuesta: `${dato}.`, afirma: true };
  const tendencia = tendenciaDe(principal.unidades, antes);
  return { pregunta: PREGUNTA_PISO, respuesta: `${dato}${COLA_TENDENCIA[tendencia]}`, afirma: true, tendencia, antes: porcentajes(antes) };
}

/** «S/ 20,222»: soles enteros, con el formato del resto del ERP (`es-PE`, como Inicio y Finanzas). */
export function solesEnteros(n: number): string {
  return `S/ ${Math.round(n).toLocaleString("es-PE", { maximumFractionDigits: 0 })}`;
}
