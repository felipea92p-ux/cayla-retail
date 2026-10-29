// Tienda web ▸ Tráfico (ADR-0495): lo puro de la pantalla — leer lo que devuelve `retail.resumen_trafico_web`, el período, «de cada 100»,
// el cambio contra los días de antes, dónde se atora el recorrido y si la tienda dejó de mandar visitas. Sin React y sin base: se prueba
// en `trafico-reglas.test.ts`. La base cuenta (personas por el paso más lejano al que llegaron); aquí solo se traduce a lo que se lee.

import { diaLima, diasEntreFechas, horaLima, sumarDias } from "./fechas-lima";

/** Los pasos del recorrido, en orden: lo que se cuenta, cómo se llama y cómo se dice quien llegó o se fue ahí. */
export const PASOS = [
  { nombre: "Entraron", frase: "entraron a la tienda", fraseUna: "entró a la tienda", donde: "", seFueron: "" },
  { nombre: "Vieron una prenda", frase: "vieron una prenda", fraseUna: "vio una prenda", donde: "apenas entran", seFueron: "sin mirar ninguna prenda" },
  { nombre: "Eligieron talla", frase: "eligieron talla", fraseUna: "eligió talla", donde: "al elegir talla", seFueron: "sin elegir talla" },
  { nombre: "A la bolsa", frase: "la pusieron en la bolsa", fraseUna: "la puso en la bolsa", donde: "al ponerla en la bolsa", seFueron: "sin ponerla en la bolsa" },
  { nombre: "Separaron", frase: "separaron", fraseUna: "separó", donde: "al separar", seFueron: "sin separar" },
  { nombre: "Recogieron", frase: "recogieron en la tienda", fraseUna: "recogió en la tienda", donde: "al recoger", seFueron: "sin recoger" },
] as const;

export type ResumenTrafico = {
  desde: string;
  hasta: string;
  anteriorDesde: string;
  anteriorHasta: string;
  /** Personas que llegaron AL MENOS hasta cada paso (6 cifras que nunca crecen). */
  pasos: number[];
  /** Personas que entraron en los días de antes (con los que se compara el período; de fábrica, del mismo largo). */
  anterior: number;
  /** Si los días de antes se cuentan solo hasta una hora (la de ahora, de ayer), cuál es; si no, `null`. */
  anteriorCorte: string | null;
  /** Los mismos 6 pasos de los últimos 90 días de toda la tienda: el «de costumbre» de dónde se atora. */
  base: number[];
  ahora: number;
  ultimoDato: string | null;
  /** Las prendas que alguien miró en el período, de la más mirada a la menos (actividad 5). */
  prendas: PrendaTrafico[];
  /** Cuántas personas llegaron por cada camino (sin el filtro de camino, con el de ciudad). Todos los caminos, en 0 si nadie. */
  caminos: Record<Camino, number>;
  /** Cuántas personas miraron desde cada ciudad (sin el filtro de ciudad, con el de camino). */
  ciudades: Record<Ciudad, number>;
  /** 24 cifras: cuántas personas entraron en cada hora del día (Lima), de las 0 a las 23. */
  horas: number[];
};

/** Cómo se dice cada camino en pantalla (la base guarda la clave: `retail.trafico_web.camino`). */
export const CAMINOS = {
  instagram: "Instagram",
  directo: "Directo",
  whatsapp: "WhatsApp",
  tiktok: "TikTok",
  google: "Google",
  qr: "QR en tienda",
  otros: "Otros",
} as const;
export type Camino = keyof typeof CAMINOS;
/** Lo que no se entiende solo con el nombre del camino (va en su `title`). */
export const AYUDA_CAMINO: Partial<Record<Camino, string>> = {
  directo: "Escribieron la dirección o la tenían guardada",
  qr: "Escanearon el código de una etiqueta o un cartel en la tienda",
  otros: "Facebook, correos y enlaces de otras páginas",
};
export const esCamino = (v: unknown): v is Camino => typeof v === "string" && Object.hasOwn(CAMINOS, v);

/** Las ciudades como las agrupa la base (`retail.fn_trafico_web_ciudad`), en el orden en que se listan; `tienda`: hay una tienda CAYLA. */
export const CIUDADES = {
  trujillo: { nombre: "Trujillo", tienda: true },
  lima: { nombre: "Lima", tienda: true },
  arequipa: { nombre: "Arequipa", tienda: true },
  chiclayo: { nombre: "Chiclayo", tienda: false },
  piura: { nombre: "Piura", tienda: false },
  cusco: { nombre: "Cusco", tienda: false },
  otras: { nombre: "Otras ciudades", tienda: false },
  fuera: { nombre: "Del extranjero", tienda: false },
  sin_dato: { nombre: "Sin dato", tienda: false },
} as const;
export type Ciudad = keyof typeof CIUDADES;
export const esCiudad = (v: unknown): v is Ciudad => typeof v === "string" && Object.hasOwn(CIUDADES, v);

/** `{"instagram": 80}` de la base, con todas las claves (en 0 las que no vinieron) y sin las que la pantalla no conoce. */
function conteoPor<K extends string>(claves: readonly K[], v: unknown): Record<K, number> {
  const d = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  return Object.fromEntries(claves.map((k) => [k, esCifra(d[k]) ? d[k] : 0])) as Record<K, number>;
}

export type ColorTrafico = { codigo: string; nombre: string; hex: string | null };

/** Una prenda del período: hasta dónde llegó con ella cada persona (5 cifras que nunca crecen), lo que eligieron y de dónde vinieron. */
export type PrendaTrafico = {
  id: string;
  nombre: string;
  codigo: string | null;
  categoria: string | null;
  prefijo: string | null;
  familia: string | null;
  precio: number | null;
  foto: string | null;
  coloresCatalogo: ColorTrafico[];
  /** La miraron · eligieron talla · a la bolsa · la separaron · la recogieron. */
  recorrido: [number, number, number, number, number];
  /** Cuántas personas la miraron en los días de antes, del mismo largo. `null`: no se compara (Hoy contra «ayer a esta hora»: las prendas
   *  solo se leen por días completos, y un día entero contra la mitad de otro dice «cayó» cuando no cayó). */
  anterior: number | null;
  tallas: { talla: string; n: number }[];
  colores: (ColorTrafico & { n: number })[];
  caminos: { camino: Camino; n: number }[];
};

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
const lista = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]).filter((x) => x && typeof x === "object") : []);
const leerColor = (c: Record<string, unknown>): ColorTrafico | null =>
  texto(c.codigo) && texto(c.nombre) ? { codigo: c.codigo as string, nombre: c.nombre as string, hex: texto(c.hex) } : null;

/** Una prenda de lo que devuelve la base, o `null` si no tiene la forma esperada (se salta esa prenda, no se cae la vitrina). */
function leerPrenda(p: Record<string, unknown>): PrendaTrafico | null {
  const recorrido = [p.miraron, p.talla, p.bolsa, p.separaron, p.recogieron];
  if (!texto(p.id) || !texto(p.nombre) || !recorrido.every(esCifra) || !esCifra(p.anterior)) return null;
  const precio = typeof p.precio === "number" ? p.precio : typeof p.precio === "string" && p.precio.trim() !== "" ? Number(p.precio) : null;
  return {
    id: p.id as string,
    nombre: p.nombre as string,
    codigo: texto(p.codigo),
    categoria: texto(p.categoria),
    prefijo: texto(p.prefijo),
    familia: texto(p.familia),
    precio: precio !== null && Number.isFinite(precio) ? precio : null,
    foto: texto(p.foto),
    coloresCatalogo: lista(p.colores_catalogo).map(leerColor).filter((c): c is ColorTrafico => c !== null),
    recorrido: recorrido as PrendaTrafico["recorrido"],
    anterior: p.anterior as number,
    tallas: lista(p.tallas).flatMap((t) => (texto(t.talla) && esCifra(t.n) ? [{ talla: t.talla as string, n: t.n }] : [])),
    colores: lista(p.colores).flatMap((c) => {
      const color = leerColor(c);
      return color && esCifra(c.n) ? [{ ...color, n: c.n }] : [];
    }),
    caminos: lista(p.caminos).flatMap((c) => (esCamino(c.camino) && esCifra(c.n) ? [{ camino: c.camino, n: c.n }] : [])),
  };
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const esCifra = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const seisCifras = (v: unknown): v is number[] => Array.isArray(v) && v.length === 6 && v.every(esCifra);

/** Lo que devuelve la base, o `null` si no tiene la forma esperada (una base vieja, un error): la pantalla lo dice, no inventa. */
export function leerResumen(datos: unknown): ResumenTrafico | null {
  if (!datos || typeof datos !== "object") return null;
  const d = datos as Record<string, unknown>;
  const fechas = [d.desde, d.hasta, d.anterior_desde, d.anterior_hasta];
  if (!fechas.every((f) => typeof f === "string" && FECHA.test(f))) return null;
  if (!seisCifras(d.pasos) || !seisCifras(d.base) || !esCifra(d.anterior) || !esCifra(d.ahora)) return null;
  const ultimo = typeof d.ultimo_dato === "string" && !Number.isNaN(Date.parse(d.ultimo_dato)) ? d.ultimo_dato : null;
  const corte = typeof d.anterior_corte === "string" && !Number.isNaN(Date.parse(d.anterior_corte)) ? d.anterior_corte : null;
  const prendas = lista(d.prendas).map(leerPrenda).filter((p): p is PrendaTrafico => p !== null);
  return {
    desde: d.desde as string,
    hasta: d.hasta as string,
    anteriorDesde: d.anterior_desde as string,
    anteriorHasta: d.anterior_hasta as string,
    pasos: d.pasos,
    anterior: d.anterior,
    anteriorCorte: corte,
    base: d.base,
    ahora: d.ahora,
    ultimoDato: ultimo,
    // Una base de antes de la actividad 5 no trae prendas, ni una de antes de la 6 sus caminos y horas: sale vacío, no roto.
    prendas: corte ? prendas.map((p) => ({ ...p, anterior: null })) : prendas,
    caminos: conteoPor(Object.keys(CAMINOS) as Camino[], d.caminos),
    ciudades: conteoPor(Object.keys(CIUDADES) as Ciudad[], d.ciudades),
    horas: Array.isArray(d.horas) && d.horas.length === 24 && d.horas.every(esCifra) ? d.horas : Array.from({ length: 24 }, () => 0),
  };
}

// ---------- El período, la campaña y los filtros (actividad 6) ----------

/** Una campaña como la guarda Catálogo (`retail.etiquetas` con estilo «campaña»): su nombre y cuándo rige. */
export type CampanaDelCatalogo = { nombre: string; desde: string | null; hasta: string | null };
export type CampanaDelPeriodo = { nombre: string; desde: string; hasta: string; vigente: boolean };

/**
 * La campaña que se ofrece como período: la que rige hoy (si hay dos, la que empezó después) o, si ninguna, la última que terminó en el
 * último año. Termina hoy si todavía no acaba (no hay visitas del futuro). Sin fechas, no es un período.
 */
export function campanaDelPeriodo(campanas: readonly CampanaDelCatalogo[], hoy: string): CampanaDelPeriodo | null {
  const con = campanas.filter((c): c is { nombre: string; desde: string; hasta: string } => !!c.desde && !!c.hasta && FECHA.test(c.desde) && FECHA.test(c.hasta) && c.desde <= c.hasta);
  const vigente = con.filter((c) => c.desde <= hoy && hoy <= c.hasta).sort((a, b) => b.desde.localeCompare(a.desde))[0];
  if (vigente) return { nombre: vigente.nombre, desde: vigente.desde, hasta: hoy, vigente: true };
  const pasada = con.filter((c) => c.hasta < hoy && c.hasta >= sumarDias(hoy, -365)).sort((a, b) => b.hasta.localeCompare(a.hasta))[0];
  return pasada ? { nombre: pasada.nombre, desde: pasada.desde, hasta: pasada.hasta, vigente: false } : null;
}

export const PERIODOS = ["hoy", "ayer", "7", "mes", "mes-pasado", "campana"] as const;
export type ClavePeriodo = (typeof PERIODOS)[number];

/** Un período y contra qué se compara. `antDesde`/`antHasta` vacíos: los días de atrás del mismo largo (lo de fábrica de la base). */
export type Periodo = {
  clave: ClavePeriodo;
  desde: string;
  hasta: string;
  nombre: string;
  /** «ayer a esta hora», «los 7 días anteriores»: va tras «Se compara con». */
  antes: string;
  antDesde: string | null;
  antHasta: string | null;
  /** Solo en Hoy: cuenta a quien entró hasta esta hora de ayer (un instante, ISO). */
  corte: string | null;
};

/** «Los 7 días anteriores» / «el día anterior»: contra qué se compara un período de `dias` días. */
export const antesDe = (dias: number) => (dias === 1 ? "el día anterior" : `los ${dias} días anteriores`);

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const diaSemana = (iso: string) => DIAS_SEMANA[new Date(`${iso}T12:00:00Z`).getUTCDay()];
const aIso = (anio: number, mes: number, dia: number) => `${anio}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
const diasDelMes = (anio: number, mes: number) => new Date(Date.UTC(anio, mes + 1, 0)).getUTCDate();
/** El mes (0 a 11) de una fecha, corrido `delta` meses: cruza el año sin que nadie cuente. */
function mesCorrido(iso: string, delta: number): { anio: number; mes: number } {
  const d = new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1 + delta, 1));
  return { anio: d.getUTCFullYear(), mes: d.getUTCMonth() };
}
const mayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * El período que se lee y contra qué se compara (Felipe, 2026-10-28: «Observatorio»):
 *  · Hoy, contra ayer A ESTA HORA (hoy a las 3 p. m. contra un ayer completo siempre «va peor»);
 *  · Ayer, contra el mismo día de la semana pasada (un lunes contra un domingo no dice nada);
 *  · 7 días y la campaña, contra los días de atrás del mismo largo;
 *  · Este mes, contra los mismos días del mes anterior; Mes pasado, contra el mes de antes.
 * `ahora` solo sirve para el corte de Hoy.
 */
export function periodoDe(clave: ClavePeriodo, hoy: string, campana: CampanaDelPeriodo | null, ahora: Date = new Date()): Periodo {
  const de = (c: ClavePeriodo, desde: string, hasta: string, nombre: string, resto: Partial<Periodo> = {}): Periodo => ({
    clave: c,
    desde,
    hasta,
    nombre,
    antes: antesDe(diasEntreFechas(desde, hasta) + 1),
    antDesde: null,
    antHasta: null,
    corte: null,
    ...resto,
  });
  if (clave === "hoy") {
    const ayer = sumarDias(hoy, -1);
    return de("hoy", hoy, hoy, "Hoy", { antes: "ayer a esta hora", antDesde: ayer, antHasta: ayer, corte: new Date(ahora.getTime() - 24 * 60 * 60 * 1000).toISOString() });
  }
  if (clave === "ayer") {
    const ayer = sumarDias(hoy, -1);
    const semanaAntes = sumarDias(ayer, -7);
    return de("ayer", ayer, ayer, "Ayer", { antes: `el ${diaSemana(semanaAntes)} de antes`, antDesde: semanaAntes, antHasta: semanaAntes });
  }
  if (clave === "mes") {
    const { anio, mes } = mesCorrido(hoy, 0);
    const antes = mesCorrido(hoy, -1);
    const dia = Number(hoy.slice(8, 10));
    const hastaAnt = Math.min(dia, diasDelMes(antes.anio, antes.mes));
    return de("mes", aIso(anio, mes, 1), hoy, "Este mes", {
      antes: dia === 1 ? `el 1 de ${MESES[antes.mes]}` : `los mismos ${hastaAnt} días de ${MESES[antes.mes]}`,
      antDesde: aIso(antes.anio, antes.mes, 1),
      antHasta: aIso(antes.anio, antes.mes, hastaAnt),
    });
  }
  if (clave === "mes-pasado") {
    const m = mesCorrido(hoy, -1);
    const antes = mesCorrido(hoy, -2);
    return de("mes-pasado", aIso(m.anio, m.mes, 1), aIso(m.anio, m.mes, diasDelMes(m.anio, m.mes)), mayuscula(MESES[m.mes]), {
      antes: MESES[antes.mes],
      antDesde: aIso(antes.anio, antes.mes, 1),
      antHasta: aIso(antes.anio, antes.mes, diasDelMes(antes.anio, antes.mes)),
    });
  }
  if (clave === "campana" && campana) return de("campana", campana.desde, campana.hasta, campana.nombre);
  return de("7", sumarDias(hoy, -6), hoy, "Últimos 7 días");
}

export type FiltrosTrafico = { periodo: ClavePeriodo; camino: Camino | null; ciudad: Ciudad | null; vista: "grafico" | "tabla" };

/** Lo que pide la dirección (`?periodo=30&camino=instagram&ciudad=trujillo&vista=tabla`); lo que no se reconoce, se ignora. */
export function leerFiltros(q: Record<string, string | string[] | undefined>): FiltrosTrafico {
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const periodo = uno(q.periodo);
  return {
    periodo: (PERIODOS as readonly string[]).includes(periodo ?? "") ? (periodo as ClavePeriodo) : "7",
    camino: esCamino(uno(q.camino)) ? (uno(q.camino) as Camino) : null,
    ciudad: esCiudad(uno(q.ciudad)) ? (uno(q.ciudad) as Ciudad) : null,
    vista: uno(q.vista) === "tabla" ? "tabla" : "grafico",
  };
}

/** La dirección de la pantalla con un cambio; lo de fábrica (7 días, gráfico, sin filtro) no ensucia la URL. */
export function hrefTrafico(actual: FiltrosTrafico, cambio: Partial<FiltrosTrafico>): string {
  const f = { ...actual, ...cambio };
  const q = new URLSearchParams();
  if (f.periodo !== "7") q.set("periodo", f.periodo);
  if (f.camino) q.set("camino", f.camino);
  if (f.ciudad) q.set("ciudad", f.ciudad);
  if (f.vista === "tabla") q.set("vista", "tabla");
  const s = q.toString();
  return `/tienda-web/trafico${s ? `?${s}` : ""}`;
}

/** «Del 17 al 23 de octubre», «Del 28 de setiembre al 4 de octubre», «El 23 de octubre». */
export function rangoTexto(desde: string, hasta: string): string {
  if (desde === hasta) return `El ${fechaLarga(desde)}`;
  const mismoMes = desde.slice(0, 7) === hasta.slice(0, 7);
  return `Del ${mismoMes ? Number(desde.slice(8, 10)) : fechaLarga(desde)} al ${fechaLarga(hasta)}`;
}

/** Quién se está mirando, en palabras: «por Instagram», «desde Trujillo», «por Instagram desde Trujillo»; vacío sin filtro. */
export function quienesTexto(camino: Camino | null, ciudad: Ciudad | null): string {
  const por = camino ? (camino === "directo" ? "directo" : `por ${camino === "qr" ? "el QR de la tienda" : CAMINOS[camino]}`) : "";
  const desde = ciudad ? (ciudad === "fuera" ? "desde fuera del Perú" : ciudad === "sin_dato" ? "sin ciudad conocida" : ciudad === "otras" ? "desde otras ciudades del Perú" : `desde ${CIUDADES[ciudad].nombre}`) : "";
  return [por, desde].filter(Boolean).join(" ");
}

/** Lo que más se repite de una lista de conteos: `null` si nadie. */
export function lider<K extends string>(conteo: Record<K, number>): K | null {
  let mejor: K | null = null;
  for (const k of Object.keys(conteo) as K[]) if (conteo[k] > 0 && (mejor === null || conteo[k] > conteo[mejor])) mejor = k;
  return mejor;
}

// ---------- A qué hora entran ----------

const hora12 = (h: number) => (h % 12 === 0 ? 12 : h % 12);
const mitad = (h: number) => (h % 24 < 12 ? "a. m." : "p. m.");
/** «7 p. m.», «12 a. m.». */
export const horaRedonda = (h: number) => `${hora12(h)} ${mitad(h)}`;
/** «de 7 a 10 p. m.», «de 11 a. m. a 2 p. m.». `hasta` es la hora en que termina (exclusiva). */
export const tramoTexto = (desde: number, hasta: number) =>
  mitad(desde) === mitad(hasta) && hasta % 24 !== 0 ? `de ${hora12(desde)} a ${horaRedonda(hasta)}` : `de ${horaRedonda(desde)} a ${horaRedonda(hasta)}`;

/** Con menos gente que esto, «a qué hora entran más» no se dice: tres personas no hacen una hora punta. */
export const MINIMO_PARA_LA_HORA = 10;

/** Las 3 horas seguidas con más gente (el tramo de la tarde de un día de semana, no una sola hora con suerte). */
export function picoDeHoras(horas: readonly number[]): { desde: number; hasta: number; n: number; de100: number } | null {
  const total = horas.reduce((a, b) => a + b, 0);
  if (horas.length !== 24 || total < MINIMO_PARA_LA_HORA) return null;
  let mejor = { desde: 0, n: -1 };
  for (let h = 0; h <= 21; h++) {
    const n = horas[h] + horas[h + 1] + horas[h + 2];
    if (n > mejor.n) mejor = { desde: h, n };
  }
  return { desde: mejor.desde, hasta: mejor.desde + 3, n: mejor.n, de100: de100(mejor.n, total) };
}

/** Las 24 horas en 8 tramos de 3 (la vista de tabla): 12 a 3 a. m., 3 a 6 a. m.… */
export const tramosDeTres = (horas: readonly number[]) =>
  Array.from({ length: 8 }, (_, i) => ({ desde: i * 3, hasta: i * 3 + 3, n: horas[i * 3] + horas[i * 3 + 1] + horas[i * 3 + 2] }));

/** «De cada 100» redondeado; 0 si no hay de dónde contar. */
export const de100 = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

/** Con menos de 20 personas antes, un porcentaje engaña (de 3 a 6 es «100 % más»): no se compara. */
export const MINIMO_PARA_COMPARAR = 20;

/** Cuánto cambió, en % redondeado, contra los días de antes; `null` si antes hubo muy poca gente para comparar. */
export function cambio(total: number, anterior: number): number | null {
  if (anterior < MINIMO_PARA_COMPARAR) return null;
  return Math.round(((total - anterior) / anterior) * 100);
}

/** Peso del «de costumbre» al decidir dónde se atora: con pocas personas, manda lo de toda la tienda; con muchas, lo de estos días. */
export const PESO_DE_LA_COSTUMBRE = 30;
/** Con menos de esto en el paso de antes, el veredicto se dice como pista. */
export const POCAS_PERSONAS = 30;

export type Atora = {
  /** El paso donde se atora (1 a 5): el que deja pasar a menos gente de la que le llega. */
  i: number;
  llegaron: number;
  siguieron: number;
  /** De cada 100 que llegaron al paso de antes, cuántos se fueron (lo que pasó de verdad en estos días). */
  seFueronDe100: number;
  /** Muy poca gente: el veredicto es una pista, no una regla. */
  pocas: boolean;
};

/**
 * Dónde se atora el recorrido: el paso que deja pasar a menos gente de la que le llega. Para no saltar con dos personas, cada paso se
 * mira contraído hacia lo de costumbre (los últimos 90 días de toda la tienda), con el peso de 30 personas: (siguieron + 30 · costumbre) /
 * (llegaron + 30). Lo que se DICE es lo que pasó en estos días. Sin nadie que haya entrado, no hay veredicto.
 */
export function dondeSeAtora(pasos: readonly number[], base: readonly number[]): Atora | null {
  if (!pasos[0]) return null;
  let mejor: { i: number; pasa: number } | null = null;
  for (let i = 1; i < pasos.length; i++) {
    const llegaron = pasos[i - 1];
    const costumbre = base[i - 1] > 0 ? base[i] / base[i - 1] : null;
    if (llegaron === 0 && costumbre === null) continue;
    const pasa = costumbre === null ? pasos[i] / llegaron : (pasos[i] + PESO_DE_LA_COSTUMBRE * costumbre) / (llegaron + PESO_DE_LA_COSTUMBRE);
    if (!mejor || pasa < mejor.pasa) mejor = { i, pasa };
  }
  if (!mejor) return null;
  const llegaron = pasos[mejor.i - 1];
  const siguieron = pasos[mejor.i];
  return { i: mejor.i, llegaron, siguieron, seFueronDe100: 100 - de100(siguieron, llegaron), pocas: llegaron < POCAS_PERSONAS };
}

/** «Se atora al separar» y la frase que lo explica con números de estos días. */
export function fraseAtora(a: Atora): { titular: string; frase: string } {
  const paso = PASOS[a.i];
  const antes = PASOS[a.i - 1];
  const titular = `Se atora ${paso.donde}`;
  if (!a.llegaron) return { titular, frase: "en estos días nadie llegó hasta ahí; de costumbre, es donde más gente se va." };
  return { titular, frase: `de cada 100 que ${antes.frase}, ${a.seFueronDe100} se fueron ${paso.seFueron}.` };
}

/** Lo que dice el «¿Por qué?»: qué mide el veredicto y, con poca gente, que es una pista. */
export function explicaAtora(a: Atora): string {
  const paso = PASOS[a.i];
  const antes = PASOS[a.i - 1];
  const quienes = a.llegaron === 1 ? `de 1 persona que ${antes.fraseUna}` : `de ${personas(a.llegaron)} que ${antes.frase}`;
  const siguieron = a.siguieron === 1 ? `1 ${paso.fraseUna}` : `${miles(a.siguieron)} ${paso.frase}`;
  const base = `Es el paso que deja pasar a menos gente de la que le llega: ${quienes}, ${siguieron}. Los demás pasos pierden menos gente de la que les llega.`;
  return a.pocas ? `${base} Con tan poca gente, tómalo como una pista: se compara con lo de costumbre de toda la tienda.` : base;
}

/** Los pasos del recorrido de UNA prenda: desde que la miraron (el paso «Vieron una prenda» de toda la tienda). */
export const PASOS_DE_LA_PRENDA = [
  { nombre: "La miraron", seFueron: "" },
  { nombre: "Eligieron talla", seFueron: "sin elegir talla" },
  { nombre: "La pusieron en la bolsa", seFueron: "sin ponerla en la bolsa" },
  { nombre: "La separaron", seFueron: "sin separarla" },
  { nombre: "La recogieron", seFueron: "sin recogerla" },
] as const;

/**
 * Dónde se atora UNA prenda: la misma cuenta que el recorrido de la tienda, contraída hacia lo de costumbre de toda la tienda desde
 * «vieron una prenda». Con pocas personas no se dice (una prenda que miraron 4 personas no tiene un paso «malo»: tiene 4 personas).
 */
export function dondeSeAtoraLaPrenda(p: PrendaTrafico, base: readonly number[]): Atora | null {
  const a = dondeSeAtora(p.recorrido, base.slice(1));
  return a && !a.pocas ? a : null;
}

/** «De cada 100 que vieron una prenda, cuántos miraron esta». */
export const de100QueVieron = (p: PrendaTrafico, vieron: number) => de100(p.recorrido[0], vieron);

/** «12 % más que antes», «Igual que antes» o «Sin comparación» (con menos de 20 antes, un porcentaje engaña). */
export function cambioDeLaPrenda(p: PrendaTrafico): { tono: "verde" | "ambar" | "neutro"; texto: string; sube: number | null } {
  if (p.anterior === null) return { tono: "neutro", texto: "Sin comparar prenda por prenda", sube: null };
  const c = cambio(p.recorrido[0], p.anterior);
  if (c === null) return { tono: "neutro", texto: "Pocas personas para comparar", sube: null };
  if (c === 0) return { tono: "neutro", texto: "Igual que antes", sube: 0 };
  return { tono: c > 0 ? "verde" : "ambar", texto: `${Math.abs(c)} % ${c > 0 ? "más" : "menos"} que antes`, sube: c };
}

export const miles = (n: number) => n.toLocaleString("es-PE");
export const personas = (n: number) => `${miles(n)} ${n === 1 ? "persona" : "personas"}`;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];
const fechaLarga = (iso: string) => `${Number(iso.slice(8, 10))} de ${MESES[Number(iso.slice(5, 7)) - 1]}`;

/** «3:10 p. m.» de un instante, en Lima. */
export function horaCorta(instante: string): string | null {
  const h = horaLima(instante);
  if (!h) return null;
  const [hh, mm] = h.split(":").map(Number);
  const doce = hh % 12 === 0 ? 12 : hh % 12;
  return `${doce}:${String(mm).padStart(2, "0")} ${hh < 12 ? "a. m." : "p. m."}`;
}

/**
 * ¿La tienda dejó de mandar visitas? Solo en horario de tienda (de 9 de la mañana a 10 de la noche, Lima) y si el último paso que llegó
 * tiene más de 2 horas: entonces la pantalla no muestra un cero falso, dice desde cuándo no llega nada. De madrugada, el silencio es normal.
 */
export function sinNoticias(ultimoDato: string | null, ahora: Date): { desde: string } | null {
  if (!ultimoDato) return null;
  const horaAhora = Number((horaLima(ahora.toISOString()) ?? "0:00").split(":")[0]);
  if (horaAhora < 9 || horaAhora >= 22) return null;
  if (ahora.getTime() - Date.parse(ultimoDato) <= 2 * 60 * 60 * 1000) return null;
  const hora = horaCorta(ultimoDato) ?? "";
  const mismoDia = diaLima(ultimoDato) === diaLima(ahora.toISOString());
  return { desde: mismoDia ? `las ${hora}` : `el ${fechaLarga(diaLima(ultimoDato) ?? "")}, ${hora}` };
}
