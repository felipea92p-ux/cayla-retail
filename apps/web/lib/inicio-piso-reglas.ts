// «Tu piso» en el Inicio (ADR-0395, Felipe 2026-10-13): dos tarjetas que dicen cómo está el piso de la tienda sin entrar a Gestión. La de
// Frescura dice lo mismo que la cabecera de /gestion/frescura (la misma función, `respuestaDelPiso`) y la del Plan del piso lo mismo que
// /gestion/plan-del-piso (los mismos textos de `plan-piso-percha.ts`). Aquí vive SOLO lo que decide qué se dice: sin React ni red, con su
// prueba. La lectura (qué se le pregunta a la base) vive en `frescura.ts` y `plan-piso-servidor.ts`.
//
// LA REGLA QUE MANDA: la tarjeta nunca afirma lo que la pantalla de la que sale se niega a afirmar. Hoy ninguna tienda tiene su piso cuadrado,
// así que lo normal es que las dos digan «todavía no se puede saber» y por qué: eso ES la respuesta. Un «41 % fresca» o un «riel al 56 %» sobre un
// piso sin cuadrar sería un número que ni Frescura ni el Plan del piso afirmarían.
//
// LO QUE ENSEÑÓ LA PRUEBA CIEGA (tres lectoras con la tarjeta delante, 2026-10-13): un «—» grande con borde punteado se lee como «error» o «cero»,
// y las tres dijeron que tocarían la tarjeta que pide algo concreto («contar tu piso») y no la que solo dice «todavía no». Por eso lo que no se
// puede afirmar se dice como TITULAR («Todavía no se sabe», «Por cuadrar»), con la pregunta de la pantalla, y trae el paso que lo arregla
// (`pasoDeLaPuerta`: la MISMA regla de Análisis y Frescura) si la cuenta puede darlo.
//
// UNIDADES Y PRENDAS NO SON LO MISMO (Formidable 2026-10-10 (c)): el porcentaje de Frescura cuenta UNIDADES colgadas; «por decidir» cuenta
// PRENDAS (modelo y color). Nunca van en la misma frase.

import { pasoParaHablar } from "./analisis-aviso";
import type { FrescuraSede } from "./frescura-reglas";
import { cifrasVista, enLaTabla, mayoriaAproximada } from "./frescura-pantalla";
import {
  conteoDeTodo,
  lineaDelPiso,
  pasoDeLaPuerta,
  pisoDeLaTienda,
  pisoPorFamilia,
  porcentajes,
  respuestaDelPiso,
  segmentosDelPiso,
  type AccesoPuerta,
  type FamiliaPiso,
  type PuertaPiso,
  type RespuestaPiso,
  type Tendencia,
} from "./frescura-piso";
import { cifraEs, prendasEs } from "./mix-piso-visual";
import { fraseDeEstado, libresDelRiel, notaDeSinGrupo } from "./plan-piso-percha";

/**
 * Lo que devuelve cada lectura del Inicio. TRES estados porque la tarjeta los dice distinto: «no aplica» (la sede no tiene piso de venta, no
 * hay propuesta, no hay capacidad medida) no dibuja nada; «falló» dice «No se pudo leer el piso. Lo demás sí está al día» (nunca un 0); y «ok»
 * trae lo que se dice. Las lecturas NUNCA lanzan: un throw en el Inicio cae en `error.tsx` y se lleva la pantalla entera.
 */
export type LecturaParaElInicio<T> = { estado: "ok"; datos: T } | { estado: "no_aplica" } | { estado: "fallo" };

/** El paso que arregla lo que falta: «Cuadrar el piso», «Registrar N sin prenda», «Contar el almacén». */
export type PasoPiso = { texto: string; href: string };
/** Qué pantallas ve quien mira: ningún paso lleva a un «Sin acceso». */
export type AccesoPiso = AccesoPuerta;

// ── Quién ve la tarjeta ────────────────────────────────────────────────────────────────────────────

/**
 * Qué mitades de «Tu piso» se dibujan: solo en una TIENDA y no en una terminal, y cada una solo si la cuenta ve SU módulo (`frescura`,
 * `plan_piso`). La regla vive aquí, con su prueba: la base responde 42501 a quien lee sin el módulo, así que preguntar de más deja un error en
 * el log en cada carga del Inicio.
 */
export function pisoQueSeVe(p: { ubicacionTipo: "tienda" | "almacen" | "taller"; terminal: boolean; modulos: readonly string[] }): { frescura: boolean; plan: boolean; alguno: boolean } {
  const enTienda = p.ubicacionTipo === "tienda" && !p.terminal;
  const frescura = enTienda && p.modulos.includes("frescura");
  const plan = enTienda && p.modulos.includes("plan_piso");
  return { frescura, plan, alguno: frescura || plan };
}

// ── Frescura ───────────────────────────────────────────────────────────────────────────────────────

/** Lo que la tarjeta necesita de la lectura de una tienda: chico, plano y sin las prendas (nunca viaja la sede entera). */
export type PisoFrescuraInicio = {
  /** La respuesta de la pantalla (la MISMA función): su pregunta, su frase, si afirma y la tendencia contra hace 4 semanas. */
  respuesta: RespuestaPiso;
  /** Toda la tienda, en UNIDADES colgadas por estado. `null` si no hay nada colgado. */
  tienda: Pick<FamiliaPiso, "unidades" | "total"> | null;
  /** Prendas (modelo y color) por decidir, como las cuenta el chip «Por decidir» de la pantalla. */
  porDecidir: number;
  /** `false`: la lectura de lo ya decidido falló y «por decidir» puede contar también lo decidido: se dice «hasta N». */
  porDecidirFirme: boolean;
  /** La barra sería aproximada (la tienda no registra lo que vende, o la mayoría de las prendas se juzgan sin rapidez propia). */
  aproximado: boolean;
  /** La puerta de la tienda: de ella salen la razón y el paso («Cuadrar el piso»). */
  puerta: PuertaPiso;
};

/**
 * De la lectura de UNA tienda (`FrescuraSede`) y de su puerta a lo que dice la tarjeta. Las mismas cuentas que `FrescuraPanel`, pero solo las de
 * «toda la tienda»: sin familias (la suma de todas las familias es la tienda entera, con o sin el catálogo de familias), sin precios y sin
 * temporadas. `sede.cifras.porDecidir` es la ÚNICA cifra de `cifras` que sirve: las demás (`pctNuevas`, edad, unidades en piso) contradicen a la barra.
 */
export function pisoFrescuraParaElInicio(sede: FrescuraSede, puerta: PuertaPiso): PisoFrescuraInicio {
  const sinFamilia = { familiaDe: () => null, familias: [] as const };
  const tienda = pisoDeLaTienda(pisoPorFamilia(sede.prendas, sinFamilia));
  // Contra hace 4 semanas, con la misma regla de hoy (sin apartar lo vendido sin registrar): lo mismo con lo mismo.
  const antes = tienda && sede.haceUnMes ? conteoDeTodo(sede.haceUnMes) : null;
  const hoyComparable = antes ? (pisoDeLaTienda(pisoPorFamilia(sede.prendas, { ...sinFamilia, sinApartar: true }))?.unidades ?? null) : null;
  return {
    respuesta: respuestaDelPiso(tienda, puerta, antes, hoyComparable),
    tienda: tienda ? { unidades: tienda.unidades, total: tienda.total } : null,
    porDecidir: cifrasVista(sede.cifras).porDecidir,
    porDecidirFirme: sede.decisiones.estado === "ok",
    aproximado: puerta === null || !puerta.puedeHablar || mayoriaAproximada(sede.prendas.filter(enLaTabla)) || sede.dudasFallo === true,
    puerta,
  };
}

export type LineaPorDecidir = { texto: string; hay: boolean };

/** «3 prendas esperan tu decisión» (o «Hasta 3 prendas por decidir» si lo decidido no se pudo leer); «Nada por decidir» solo si se puede afirmar. */
export function lineaPorDecidir(n: number, firme: boolean, afirma: boolean): LineaPorDecidir | null {
  if (n > 0) {
    return firme
      ? { texto: `${n} ${n === 1 ? "prenda espera" : "prendas esperan"} tu decisión`, hay: true }
      : { texto: `Hasta ${n} ${n === 1 ? "prenda" : "prendas"} por decidir`, hay: true };
  }
  return afirma && firme ? { texto: "Nada por decidir", hay: false } : null;
}

export type TendenciaVista = { texto: string; tono: "ambar" | "verde" };

/** Contra hace 4 semanas, con las mismas palabras de la frase de la pantalla. «Igual» no dice nada: no hay qué avisar. */
export function tendenciaVista(t: Tendencia | null): TendenciaVista | null {
  if (t === "mas_viejo") return { texto: "Más viejo que hace 4 semanas", tono: "ambar" };
  if (t === "mas_fresco") return { texto: "Más fresco que hace 4 semanas", tono: "verde" };
  return null;
}

export type VistaFrescuraInicio =
  | {
      /** Se puede afirmar: el número grande, la barra y la tendencia. */
      tipo: "dato";
      valor: string;
      unidad: string;
      segmentos: ReturnType<typeof segmentosDelPiso>;
      linea: string;
      aproximado: boolean;
      tendencia: TendenciaVista | null;
      porDecidir: LineaPorDecidir | null;
    }
  | {
      /** No se puede afirmar (o no hay nada colgado): la respuesta como titular, la frase de la pantalla y el paso que lo arregla. */
      tipo: "todavia";
      titular: string;
      frase: string;
      porDecidir: LineaPorDecidir | null;
      paso: PasoPiso | null;
    };

export function vistaFrescuraInicio(p: PisoFrescuraInicio, acceso: AccesoPiso): VistaFrescuraInicio {
  const porDecidir = lineaPorDecidir(p.porDecidir, p.porDecidirFirme, p.respuesta.afirma);
  if (!p.respuesta.afirma || p.tienda === null) {
    return {
      tipo: "todavia",
      titular: p.tienda === null ? "Nada colgado" : "Todavía no se sabe",
      // La pregunta de la pantalla va con su respuesta: «Frescura» a secas suena a fruta a quien no la conoce.
      frase: `${p.respuesta.pregunta} ${p.respuesta.respuesta}`,
      porDecidir,
      paso: pasoDeLaPuerta(p.puerta, acceso),
    };
  }
  return {
    tipo: "dato",
    valor: `${porcentajes(p.tienda.unidades).fresca} %`,
    unidad: "de lo colgado está fresco",
    segmentos: segmentosDelPiso(p.tienda),
    linea: lineaDelPiso(p.tienda),
    aproximado: p.aproximado,
    tendencia: tendenciaVista(p.respuesta.tendencia),
    porDecidir,
  };
}

// ── Plan del piso ──────────────────────────────────────────────────────────────────────────────────

/** Lo que la tarjeta necesita del plan de una tienda. `null` (en el servidor) cuando no hay propuesta o falta la capacidad: la tarjeta no sale. */
export type PisoPlanInicio = {
  /** Lo que cuelga en el riel según el sistema (`colgadasEnElRiel`: la misma cifra que el Plan del piso, no la de Existencias). */
  colgadas: number;
  capacidad: number;
  /** El piso de la sede ya se cuadró alguna vez: sin eso, «colgadas» es lo que el sistema CREE. */
  cuadrado: boolean;
  /** La capacidad es provisional (la densidad de TRU prestada a una tienda sin medir). */
  provisional: boolean;
  /** Prendas colgadas de categorías sin grupo: no entran en la cuenta del riel y la persona tiene que saberlo. */
  sinGrupoColgadas: number;
};

export type VistaPlanInicio =
  | {
      /** El piso está cuadrado: «334 de 600 prendas» y cuán lleno está. */
      tipo: "medida";
      valor: string;
      unidad: string;
      frase: string;
      pie: string[];
    }
  | {
      /** Sin cuadrar: no hay número que afirmar (el sistema decía 138 en una tienda con 600 a 750 colgadas). Se dice qué falta y cómo se arregla. */
      tipo: "porCuadrar";
      titular: string;
      frase: string;
      pie: string[];
      paso: PasoPiso | null;
    };

/** «cuelga 1 prenda» / «cuelgan 3 prendas»: el verbo concuerda con la cifra. */
const cuelgan = (n: number) => (n === 1 ? "cuelga" : "cuelgan");

export function vistaPlanInicio(p: PisoPlanInicio, acceso: AccesoPiso): VistaPlanInicio {
  const pie: string[] = [];
  const nota = notaDeSinGrupo(p.sinGrupoColgadas);
  if (nota) pie.push(nota);
  if (p.provisional) pie.unshift("Capacidad provisional");

  const { deMas } = libresDelRiel(p.capacidad, p.colgadas);
  const frase = fraseDeEstado({ colgadas: p.colgadas, capacidad: p.capacidad, cuadrado: p.cuadrado });

  if (p.cuadrado) {
    return {
      tipo: "medida",
      valor: cifraEs(p.colgadas),
      unidad: `de ${cifraEs(p.capacidad)} prendas`,
      // «Tu riel está a medio llenar (56 % ocupado).» o, si cuelga más de lo que cabe, «Cuelgan N prendas más de las que caben en el riel.»
      frase: `${frase.antes}${frase.destacado}${frase.despues}`,
      pie,
    };
  }
  return {
    tipo: "porCuadrar",
    titular: "Por cuadrar",
    frase:
      deMas > 0
        ? `Falta contar tu piso. Según el sistema ya ${cuelgan(deMas)} ${prendasEs(deMas)} más de las que caben en el riel, y de verdad pueden ser más.`
        : `Falta contar tu piso. Según el sistema ${cuelgan(p.colgadas)} ${prendasEs(p.colgadas)}, pero de verdad pueden ser muchas más.`,
    pie,
    // Lo que arregla este estado es cuadrar el piso: la MISMA regla de Análisis y Frescura (la cuenta que no ve Existencias no recibe un botón a «Sin acceso»).
    paso: pasoParaHablar("piso_cuadrado", 0, { regularizar: false, cuadrar: acceso.existencias, conteo: false }),
  };
}

// ── Las dos juntas ─────────────────────────────────────────────────────────────────────────────────

/**
 * Las dos mitades, con el paso dicho UNA vez: si las dos están bloqueadas por lo mismo (lo normal hoy: «falta cuadrar el piso»), el botón queda en
 * la de arriba y la de abajo es solo un enlace a su pantalla. Dos «Cuadrar el piso» seguidos leen como si fueran dos tareas.
 */
export function vistaPisoInicio(
  entrada: { frescura: PisoFrescuraInicio | null; plan: PisoPlanInicio | null },
  acceso: AccesoPiso,
): { frescura: VistaFrescuraInicio | null; plan: VistaPlanInicio | null } {
  const frescura = entrada.frescura ? vistaFrescuraInicio(entrada.frescura, acceso) : null;
  let plan = entrada.plan ? vistaPlanInicio(entrada.plan, acceso) : null;
  if (frescura?.tipo === "todavia" && frescura.paso && plan?.tipo === "porCuadrar" && plan.paso && plan.paso.href === frescura.paso.href) {
    plan = { ...plan, paso: null };
  }
  return { frescura, plan };
}
