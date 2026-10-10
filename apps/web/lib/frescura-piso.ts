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
import { pasoParaHablar } from "./analisis-aviso";

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
/**
 * El color de cada tramo: verde · neutro · ámbar, nunca rojo (los colores A de ADR-0208). Lo que no se sabe va RAYADO, no en otro gris:
 * liso, su taupe y el neutro de Vigente median 1,06 : 1 de luminosidad y la gerente ciega no supo cuál era cuál (Formidable 2026-10-10 (c),
 * decisión de Felipe: «mismo nombre, se distingue»). Las rayas son las de la regla de la hoja de detalle, la zona «no se sabe».
 */
export const CLASE_TRAMO_PISO: Record<TramoPiso, string> = {
  fresca: "bg-verde",
  vigente: "bg-tinta/25",
  envejeciendo: "bg-ambar",
  sin_saber: "bg-[repeating-linear-gradient(135deg,var(--color-taupe)_0_2px,transparent_2px_5px)]",
  clasico: "bg-pizarra/60",
};

/** Por qué una unidad cae en «Aún no se sabe», en palabras de tienda: lo que se dice al tocar su «¿Por qué?». */
export type CausaSinSaber = "ritmo" | "fecha" | "dudosa";
export const CAUSAS_SIN_SABER: readonly CausaSinSaber[] = ["ritmo", "fecha", "dudosa"];
export const TEXTO_CAUSA_SIN_SABER: Record<CausaSinSaber, string> = {
  ritmo: "su categoría todavía no tiene un ritmo de venta en esta tienda",
  fecha: "no se sabe desde cuándo está colgada",
  dudosa: "su stock no cuadra: hay que contarla",
};
export type ConteoSinSaber = Record<CausaSinSaber, number>;
const sinSaberVacio = (): ConteoSinSaber => ({ ritmo: 0, fecha: 0, dudosa: 0 });

export type ConteoPiso = Record<TramoPiso, number>;
export const conteoVacio = (): ConteoPiso => ({ fresca: 0, vigente: 0, envejeciendo: 0, sin_saber: 0, clasico: 0 });

/**
 * Dónde cae una tanda colgada de una prenda que se juzga (con los cortes de su categoría sin ella) y, si no se sabe, por qué: sin ritmo de su
 * categoría o sin fecha (la de ella o la de su modelo).
 */
function tramoYCausa(p: FrescuraPrenda, u: UnidadColgada): { tramo: TramoPiso; causa: CausaSinSaber | null } {
  const conCausa = (tramo: TramoPiso, causa: CausaSinSaber) => ({ tramo, causa: tramo === "sin_saber" ? causa : null });
  const vara = p.categoriaSinElla;
  if (vara === null || vara.cortes.p50 === null) return conCausa("sin_saber", "ritmo");
  const { cortes, tMax } = vara;
  const p50 = vara.cortes.p50;
  // Su modelo todavía no llega a la mitad: Fresca (si se sabe desde cuándo está; si no, puede ser Fresca o Vigente).
  const modeloFresco = tramoDosRelojes(p.reloj.segundos, p.reloj.segundos, cortes, tMax)?.tramo === "nueva";
  if (modeloFresco && !p.reloj.alMenos) return conCausa("fresca", "fecha");
  // Pasada la mitad (o sin saberlo), lo dicen los días de la unidad. Con el modelo puesto al menos en P50 la regla ya no puede
  // decir Fresca: queda Vigente o Envejeciendo.
  const t = tramoDosRelojes(Math.max(p.reloj.segundos, p50), u.segundos, cortes, tMax);
  if (t === null) return conCausa("sin_saber", "ritmo");
  const envejece = t.tramo === "envejecida" || t.tramo === "critica";
  // Sin fecha, sus días son un piso: si ya pasó P75 se sabe que envejece; si no, no se sabe.
  if (u.edadDesconocida) return conCausa(envejece ? "envejeciendo" : "sin_saber", "fecha");
  // El modelo entró sin fecha y no se sabe si pasó la mitad: lo que tampoco la pasó puede ser Fresco.
  if (p.reloj.alMenos && modeloFresco && u.segundos < p50) return conCausa("sin_saber", "fecha");
  return conCausa(envejece ? "envejeciendo" : "vigente", "fecha");
}

/**
 * Las unidades colgadas de una prenda, por tramo, y (si se da `precioDe`) sus soles. Suma SIEMPRE su `pisoHoy`: si el libro trae
 * menos tandas colgadas que lo que dice el stock (no debería), lo que falta cae en «Aún no se sabe», nunca desaparece; si trae más,
 * cuenta hasta el stock, de la más vieja a la más nueva.
 */
export function tramosDeLaPrenda(
  p: FrescuraPrenda,
  precioDe?: (varianteId: string) => number | null,
): { unidades: ConteoPiso; soles: ConteoPiso; sinPrecio: number; sinSaberPor: ConteoSinSaber } {
  const unidades = conteoVacio();
  const soles = conteoVacio();
  const sinSaberPor = sinSaberVacio();
  let sinPrecio = 0;
  const sumar = (tramo: TramoPiso, n: number, varianteId: string, causa: CausaSinSaber | null = null) => {
    if (n <= 0) return;
    unidades[tramo] += n;
    if (tramo === "sin_saber") sinSaberPor[causa ?? "ritmo"] += n;
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
      // Sin juicio: o su libro no cuadra (hay que contarla) o su categoría todavía no tiene ritmo aquí.
      sumar("sin_saber", t.pisoHoy, t.varianteId, p.estado.tipo === "dudosa" ? "dudosa" : "ritmo");
      continue;
    }
    let restante = t.pisoHoy;
    for (const u of [...t.colgadas].sort((a, b) => b.segundos - a.segundos)) {
      const n = Math.min(u.unidades, restante);
      const { tramo, causa } = tramoYCausa(p, u);
      sumar(tramo, n, t.varianteId, causa);
      restante -= n;
      if (restante <= 0) break;
    }
    // Lo que el stock dice colgado sin una tanda en el libro: no se sabe desde cuándo.
    sumar("sin_saber", restante, t.varianteId, "fecha");
  }
  return { unidades, soles, sinPrecio, sinSaberPor };
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
  /** Las unidades de «Aún no se sabe», por qué: suman exactamente `unidades.sin_saber`. */
  sinSaberPor: ConteoSinSaber;
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
      ({ codigo, nombre: codigo === null ? SIN_FAMILIA : porCodigo.get(codigo)!.nombre, unidades: conteoVacio(), total: 0, prendas: 0, soles: conteoVacio(), sinPrecio: 0, sinSaberPor: sinSaberVacio() } as FamiliaPiso & { sinPrecio: number });
    grupos.set(codigo, g);
    const t = tramosDeLaPrenda(p, o.precioDe);
    for (const k of TRAMOS_PISO) {
      g.unidades[k] += t.unidades[k];
      g.soles![k] += t.soles[k];
    }
    for (const c of CAUSAS_SIN_SABER) g.sinSaberPor[c] += t.sinSaberPor[c];
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

/** Lo primero que le falta a una tienda para pasar la puerta (las condiciones de `preparacionDeSede`, en su orden). */
export type FaltaPuerta = "venta_identificada" | "piso_cuadrado" | "almacen_contado";

/** Lo que dice la puerta compartida (`preparacionDeSede` del motor de demanda, la misma de Análisis): si la tienda ya registra lo que vende. */
export type PuertaPiso = {
  puedeHablar: boolean;
  aviso: string;
  /** El piso ya se cuadró (el sistema sabe qué cuelga): sin esto, las categorías no reciben veredicto (`loQueMueveLaAguja`). */
  pisoCuadrado?: boolean;
  /** Lo PRIMERO que falta (null si pasa o si no se pudo saber). Decide la razón de la frase y el botón del aviso. */
  falta?: FaltaPuerta | null;
  /** Ventas de los últimos 30 días sin su prenda (lo que «Registrar N sin prenda» lleva a regularizar). */
  sinPrenda?: number;
} | null;

/** La razón corta, para la frase de arriba: «Todavía no se puede saber: falta cuadrar el piso.» */
export const RAZON_PUERTA: Record<FaltaPuerta, string> = {
  piso_cuadrado: "falta cuadrar el piso",
  almacen_contado: "falta contar el almacén",
  venta_identificada: "todavía no todas las ventas llevan su prenda",
};

/**
 * El aviso de la tarjeta mientras la tienda no pasa la puerta (decisión de Felipe, Formidable 2026-10-10 (c): «% con aviso + el paso»): en una
 * frase, por qué los porcentajes son aproximados. Lo que hay que hacer lo dice el botón (`pasoDeLaPuerta`), no el texto.
 */
export function avisoDeLaPuerta(puerta: PuertaPiso): string {
  switch (puerta?.falta) {
    case "piso_cuadrado":
      return "Mientras el piso no esté cuadrado, el sistema no sabe con certeza qué está colgado: estos porcentajes son aproximados.";
    case "almacen_contado":
      return "Mientras el almacén no esté contado, algo guardado puede contarse como colgado: estos porcentajes son aproximados.";
    case "venta_identificada":
      return "Mientras haya ventas sin su prenda, lo vendido sigue contando como colgado: estos porcentajes son aproximados.";
    default:
      return puerta?.aviso || "No se pudo saber si esta tienda ya registra lo que vende: estos porcentajes pueden fallar.";
  }
}

/** Qué pantallas ve quien mira (las de `AccesoFrescura`): Cuadrar y Por regularizar son de Existencias; contar, de Conteo. */
export type AccesoPuerta = { existencias: boolean; conteos: boolean };

/**
 * El botón que hace lo que falta, con la MISMA regla que «Todavía no» de Análisis (`pasoParaHablar`): registrar las ventas sin su prenda,
 * cuadrar el piso o contar el almacén. Null si pasa, si no hay qué registrar o si no ve esa pantalla (nunca un botón a «Sin acceso»).
 */
export function pasoDeLaPuerta(puerta: PuertaPiso, acceso: AccesoPuerta): { texto: string; href: string } | null {
  if (puerta === null || puerta.puedeHablar) return null;
  return pasoParaHablar(puerta.falta ?? null, puerta.sinPrenda ?? 0, { regularizar: acceso.existencias, cuadrar: acceso.existencias, conteo: acceso.conteos });
}

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
  if (puerta === null || !puerta.puedeHablar) {
    const razon = puerta?.falta ? RAZON_PUERTA[puerta.falta] : null;
    return { ...base, respuesta: razon ? `Todavía no se puede saber: ${razon}.` : "Todavía no se puede saber.", afirma: false };
  }
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
