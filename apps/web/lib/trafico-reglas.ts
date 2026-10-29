import { compararTallas } from "./tallas";
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
  /** La serie del gráfico principal: por hora (un día) o por día (varios), de estos días y de los de antes (actividad 2). */
  serie: SerieTrafico;
  /** El mapa de calor día de la semana × hora (actividad 4); `null` con una base de antes que no lo trae. */
  calor: CalorTrafico | null;
  /** Cuántas personas miraron desde cada departamento (ISO 3166-2, «PE-LAL»), como las ciudades: con el filtro de camino (actividad 5). */
  regiones: Record<string, number>;
  /** Cuántos de cada camino separaron (actividad 5), con el filtro de ciudad. */
  caminosSeparan: Record<Camino, number>;
  /** Tallas que piden y no hay, por categoría (actividad 7); `null` con una base de antes que no lo trae. */
  tallas: TallasTrafico | null;
  /** Quién entra: nuevos contra los que vuelven (actividad 7); `null` con una base de antes. */
  quienes: QuienesTrafico | null;
  /** Necesita tu atención: reponer, recoger, empujar (actividad 8); `null` con una base de antes. */
  atencion: AtencionTrafico | null;
  /** El mes del último día del período, día por día (actividad 9); `null` con una base de antes. */
  calendario: CalendarioTrafico | null;
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
    serie: leerSerie(d.serie),
    calor: leerCalor(d.calor),
    regiones: leerRegiones(d.regiones),
    caminosSeparan: conteoPor(Object.keys(CAMINOS) as Camino[], d.caminos_separan),
    tallas: leerTallas(d.tallas),
    quienes: leerQuienes(d.quienes),
    atencion: leerAtencion(d.atencion),
    calendario: leerCalendario(d.calendario),
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

/** Cuánto peor que de costumbre tiene que dejar pasar un paso para decir «aquí se atora» (4 de cada 100 de lo que pasa siempre). */
const MARGEN_PEOR = 0.04;

/**
 * El paso donde más gente se pierde, contra lo de costumbre: «de cada 100 que la pusieron en la bolsa, siguen 38; de costumbre, 52».
 * `peor` solo si estos días deja pasar claramente menos que siempre, mirado con el mismo peso de 30 personas que `dondeSeAtora`, y nunca
 * con poca gente (entonces es una pista, no una alarma). Sin costumbre (los primeros días), no se compara.
 */
export function atoraContraCostumbre(a: Atora, base: readonly number[]): { siguen: number; costumbre: number | null; peor: boolean } {
  const siguen = de100(a.siguieron, a.llegaron);
  const c = base[a.i - 1] > 0 ? base[a.i] / base[a.i - 1] : null;
  if (c === null) return { siguen, costumbre: null, peor: false };
  const pasa = (a.siguieron + PESO_DE_LA_COSTUMBRE * c) / (a.llegaron + PESO_DE_LA_COSTUMBRE);
  return { siguen, costumbre: Math.round(c * 100), peor: !a.pocas && pasa < c * (1 - MARGEN_PEOR) };
}

/** Cuántos de los 100 puntos se encienden en cada paso: de cada 100 que entraron, cuántos llegaron hasta ahí. */
export const puntosDelPaso = (pasos: readonly number[], i: number) => (i === 0 ? (pasos[0] > 0 ? 100 : 0) : de100(pasos[i], pasos[0]));

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

// ---------- La serie del gráfico principal («Observatorio», actividad 2) ----------

/** Una fila de la serie: [momento (hora 0–23 o día 0…n desde el primero), entraron, vieron una prenda, separaron, recogieron]. */
export type FilaSerie = readonly [number, number, number, number, number];
export type SerieTrafico = { por: "hora" | "dia"; actual: FilaSerie[]; antes: FilaSerie[] };

const filaSerie = (v: unknown): v is FilaSerie => Array.isArray(v) && v.length === 5 && v.every(esCifra);
/** Lo que manda la base; una base de antes de la actividad 2 no trae serie: sale vacía, no rota. */
function leerSerie(v: unknown): SerieTrafico {
  const d = v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  const filas = (x: unknown) => (Array.isArray(x) ? x.filter(filaSerie) : []);
  return { por: d.por === "hora" ? "hora" : "dia", actual: filas(d.actual), antes: filas(d.antes) };
}

/** Las cinco cifras que eligen el gráfico, en el orden de la fila. `col` es su columna en la serie; «de cada 100» se calcula. */
export const METRICAS = [
  { clave: "entraron", nombre: "Entraron", col: 1 },
  { clave: "vieron", nombre: "Vieron una prenda", col: 2 },
  { clave: "separaron", nombre: "Separaron", col: 3 },
  { clave: "de100", nombre: "Separan de cada 100", col: null },
  { clave: "recogieron", nombre: "Recogieron", col: 4 },
] as const;
export type MetricaTrafico = (typeof METRICAS)[number]["clave"];

/** Una columna de la serie, momento a momento de 0 a `largo − 1`, con cero donde no entró nadie. */
function columna(filas: readonly FilaSerie[], col: number, largo: number): number[] {
  const v = Array.from({ length: largo }, () => 0);
  for (const f of filas) if (f[0] >= 0 && f[0] < largo) v[f[0]] += f[col];
  return v;
}
const acumular = (v: readonly number[]) => v.reduce<number[]>((a, x) => [...a, (a.at(-1) ?? 0) + x], []);

/**
 * Lo que dibuja la línea de una cifra. «De cada 100» va siempre acumulado (separaron hasta ahí ÷ entraron hasta ahí): hora a hora,
 * con 3 personas, salta de 0 a 33 y no dice nada. Las demás, por momento o acumuladas.
 */
export function valoresDe(filas: readonly FilaSerie[], metrica: MetricaTrafico, largo: number, acumulado: boolean): number[] {
  if (metrica === "de100") {
    const ent = acumular(columna(filas, 1, largo));
    const sep = acumular(columna(filas, 3, largo));
    return ent.map((e, i) => (e > 0 ? (sep[i] / e) * 100 : 0));
  }
  const col = METRICAS.find((m) => m.clave === metrica)!.col!;
  const v = columna(filas, col, largo);
  return acumulado ? acumular(v) : v;
}

export type GraficoTrafico = {
  serie: { x: number; y: number }[];
  referencia: { x: number; y: number }[];
  /** «Si sigue así», de ahora al cierre del día (solo Hoy, acumulado). */
  proyeccion: { x: number; y: number }[] | null;
  /** Dónde terminaría el día al ritmo de hoy. */
  cierre: number | null;
};

/**
 * La línea de estos días contra la de antes. `hastaX`: hasta dónde llega lo de hoy (la hora de ahora); `null`, el período entero.
 * La proyección (solo con `hastaX` y acumulado, y no en «de cada 100») sigue la forma del día de antes al ritmo de hoy: si a esta hora
 * van 17 % más que ayer, el resto del día también.
 */
export function graficoDe(s: SerieTrafico, metrica: MetricaTrafico, o: { largo: number; largoAntes: number; hastaX: number | null; acumulado: boolean }): GraficoTrafico {
  const actual = valoresDe(s.actual, metrica, o.largo, o.acumulado);
  const antes = valoresDe(s.antes, metrica, o.largoAntes, o.acumulado);
  // Hora a hora, la hora en curso está a medias (a las 3:40 p. m., «3 p. m.» tiene 40 minutos): sin acumular no se dibuja, o la línea
  // «cae» al final sin haber caído. Acumulado sí entra: es lo que lleva el día hasta ahora.
  const fin = o.hastaX === null ? o.largo - 1 : Math.max(0, Math.min(o.acumulado ? o.hastaX : o.hastaX - 1, o.largo - 1));
  const serie = actual.slice(0, fin + 1).map((y, x) => ({ x, y }));
  const referencia = antes.map((y, x) => ({ x, y }));
  if (o.hastaX === null || !o.acumulado || metrica === "de100" || o.largoAntes !== o.largo || fin >= o.largo - 1) return { serie, referencia, proyeccion: null, cierre: null };
  const base = antes[fin];
  if (!base) return { serie, referencia, proyeccion: null, cierre: null };
  const ritmo = actual[fin] / base;
  const proyeccion = antes.slice(fin).map((y, i) => ({ x: fin + i, y: actual[fin] + (y - base) * ritmo }));
  return { serie, referencia, proyeccion, cierre: Math.round(proyeccion.at(-1)!.y) };
}

/** Cuánto suma una cifra en estos días y en los de antes; en Hoy, «antes» llega hasta esta hora de ayer (`hastaX`). */
export function totalDe(r: ResumenTrafico, metrica: MetricaTrafico, hastaX: number | null): { valor: number; antes: number | null } {
  const antesHasta = (col: number) => r.serie.antes.filter((f) => hastaX === null || r.serie.por !== "hora" || f[0] <= hastaX).reduce((a, f) => a + f[col], 0);
  if (metrica === "entraron") return { valor: r.pasos[0], antes: r.anterior };
  if (metrica === "vieron") return { valor: r.pasos[1], antes: antesHasta(2) };
  if (metrica === "separaron") return { valor: r.pasos[4], antes: antesHasta(3) };
  if (metrica === "recogieron") return { valor: r.pasos[5], antes: antesHasta(4) };
  const ent = antesHasta(1);
  return { valor: r.pasos[0] > 0 ? (r.pasos[4] / r.pasos[0]) * 100 : 0, antes: ent > 0 ? (antesHasta(3) / ent) * 100 : null };
}

/** Cómo se escribe una cifra: «de cada 100» con un decimal (7,5); las demás, enteras con miles. */
export const cifraTexto = (metrica: MetricaTrafico, v: number) =>
  metrica === "de100" ? v.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : miles(Math.round(v));

/** El cambio de una cifra en palabras y su tono: «▲ 17 %», «▼ 0,3 pts» (de cada 100), «Igual», o nada si no hay con qué comparar. */
export function cambioDe(metrica: MetricaTrafico, valor: number, antes: number | null): { tono: "verde" | "ambar" | "neutro"; texto: string } | null {
  if (antes === null) return null;
  if (metrica === "de100") {
    const d = Math.round((valor - antes) * 10) / 10;
    if (Math.abs(d) < 0.1) return { tono: "neutro", texto: "Igual" };
    return { tono: d > 0 ? "verde" : "ambar", texto: `${d > 0 ? "▲" : "▼"} ${Math.abs(d).toLocaleString("es-PE", { maximumFractionDigits: 1 })} pts` };
  }
  const c = cambio(valor, antes);
  if (c === null) return null;
  if (c === 0) return { tono: "neutro", texto: "Igual" };
  return { tono: c > 0 ? "verde" : "ambar", texto: `${c > 0 ? "▲" : "▼"} ${Math.abs(c)} %` };
}

/** «Hoy va mejor que ayer a esta hora», «Setiembre fue más lento que agosto», «Estos 7 días van igual que…»: la respuesta en una frase. */
export function veredictoDe(p: { clave: ClavePeriodo; nombre: string; antes: string }, c: number | null): { tono: "verde" | "ambar" | "neutro"; titulo: string } {
  const sujeto = p.clave === "7" ? "Estos 7 días" : p.nombre;
  const pasado = p.clave === "ayer" || p.clave === "mes-pasado";
  const plural = p.clave === "7";
  if (c === null) return { tono: "neutro", titulo: `${sujeto}: muy poca gente para comparar con ${p.antes}` };
  const verbo = pasado ? "fue" : plural ? "van" : "va";
  if (c >= 3) return { tono: "verde", titulo: `${sujeto} ${verbo} mejor que ${p.antes}` };
  if (c <= -3) return { tono: "ambar", titulo: `${sujeto} ${verbo} más lento que ${p.antes}` };
  return { tono: "neutro", titulo: `${sujeto} ${verbo} igual que ${p.antes}` };
}

/** Las marcas del eje del tiempo: cada 6 horas en un día; en varios días, hasta 5 fechas («21 oct»). Pocas a propósito: a 375 px
 *  ocho horas se pisan. */
export function marcasDelTiempo(por: "hora" | "dia", largo: number, desde: string): { x: number; texto: string }[] {
  if (por === "hora") return [0, 6, 12, 18].map((h) => ({ x: h, texto: horaRedonda(h) }));
  const paso = Math.max(1, Math.ceil(largo / 5));
  const corto = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1].slice(0, 3)}`;
  return Array.from({ length: largo }, (_, x) => x)
    .filter((x) => x % paso === 0)
    .map((x) => ({ x, texto: corto(sumarDias(desde, x)) }));
}

// ---------- El mapa de calor: día de la semana × hora (actividad 4) ----------

/** Lo que manda la base: la ventana (el período, pero nunca menos de 4 semanas), cuántas veces cae cada día de la semana en ella y
 *  las celdas [día 0 = lunes … 6 = domingo, hora 0–23, personas que entraron por primera vez]. */
export type CalorTrafico = { desde: string; hasta: string; dias: number[]; celdas: (readonly [number, number, number])[] };

const celdaCalor = (v: unknown): v is readonly [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every(esCifra) && v[0] <= 6 && v[1] <= 23;
function leerCalor(v: unknown): CalorTrafico | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  if (typeof d.desde !== "string" || !FECHA.test(d.desde) || typeof d.hasta !== "string" || !FECHA.test(d.hasta)) return null;
  if (!Array.isArray(d.dias) || d.dias.length !== 7 || !d.dias.every(esCifra)) return null;
  return { desde: d.desde, hasta: d.hasta, dias: d.dias, celdas: Array.isArray(d.celdas) ? d.celdas.filter(celdaCalor) : [] };
}

export const DIAS_CORTOS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;
const DIAS_LARGOS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"] as const;
const DIAS_PLURAL = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábados", "domingos"] as const;
/** «Sábado, 8 p. m.»: el nombre de una celda. */
export const celdaTexto = (dia: number, hora: number) => `${DIAS_LARGOS[dia].charAt(0).toUpperCase()}${DIAS_LARGOS[dia].slice(1)}, ${horaRedonda(hora)}`;

/** Cuántas celdas se marcan como «las horas más fuertes» de la semana. */
const CELDAS_FUERTES = 6;

export type LecturaCalor = {
  /** Personas por hora, en promedio: [día][hora] (lo que entró en esa celda entre las veces que cae ese día en la ventana). */
  prom: number[][];
  maximo: number;
  /** Personas en un día así, en promedio (la suma de sus 24 horas). */
  porDia: number[];
  /** Personas de cada hora en toda la ventana (las barras de abajo). */
  porHora: number[];
  /** Las celdas más fuertes, como `día * 24 + hora`; vacío con muy poca gente. */
  fuertes: Set<number>;
  /** Los dos días de la semana con más gente, en orden de la semana; `null` con muy poca gente. */
  dias: readonly [number, number] | null;
  pico: { desde: number; hasta: number } | null;
  tranquilo: { desde: number; hasta: number } | null;
};

/** Del conteo de la base, lo que dibuja el mapa y lo que dice su frase. Con menos de 10 personas en toda la ventana, no hay veredicto. */
export function lecturaDeCalor(c: CalorTrafico): LecturaCalor {
  const cuenta = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const [d, h, n] of c.celdas) cuenta[d][h] += n;
  const prom = cuenta.map((fila, d) => fila.map((n) => (c.dias[d] > 0 ? n / c.dias[d] : 0)));
  const porDia = prom.map((fila) => fila.reduce((a, b) => a + b, 0));
  const porHora = Array.from({ length: 24 }, (_, h) => cuenta.reduce((a, fila) => a + fila[h], 0));
  const total = porHora.reduce((a, b) => a + b, 0);
  const maximo = Math.max(0, ...prom.flat());
  const vacio = { prom, maximo, porDia, porHora, fuertes: new Set<number>(), dias: null, pico: null, tranquilo: null };
  if (total < MINIMO_PARA_LA_HORA) return vacio;
  const fuertes = new Set(
    prom
      .flatMap((fila, d) => fila.map((v, h) => ({ k: d * 24 + h, v })))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v || a.k - b.k)
      .slice(0, CELDAS_FUERTES)
      .map((x) => x.k),
  );
  const [a, b] = [0, 1, 2, 3, 4, 5, 6].sort((x, y) => porDia[y] - porDia[x] || x - y);
  const pico = picoDeHoras(porHora);
  let tranquilo = { desde: 0, n: Infinity };
  for (let h = 0; h <= 21; h++) {
    const n = porHora[h] + porHora[h + 1] + porHora[h + 2];
    if (n < tranquilo.n) tranquilo = { desde: h, n };
  }
  return {
    ...vacio,
    fuertes,
    dias: [Math.min(a, b), Math.max(a, b)],
    pico: pico && { desde: pico.desde, hasta: pico.hasta },
    tranquilo: { desde: tranquilo.desde, hasta: tranquilo.desde + 3 },
  };
}

/** «sábados y domingos». */
export const diasTexto = (dias: readonly [number, number]) => `${DIAS_PLURAL[dias[0]]} y ${DIAS_PLURAL[dias[1]]}`;

/** El día de la semana (0 = lunes) de una fecha «2026-10-28». */
export const diaDeLaSemana = (iso: string) => (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;

// ---------- De dónde vienen: el mapa pintado y cuántos separan por camino (actividad 5) ----------

const REGION = /^PE-[A-Z]{3}$/;
function leerRegiones(v: unknown): Record<string, number> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, number] => REGION.test(e[0]) && esCifra(e[1])));
}

/** Qué ciudad de la pantalla es cada departamento: lo mismo que `retail.fn_trafico_web_ciudad` (tocar un departamento filtra por ella). */
export function ciudadDeRegion(iso: string): Ciudad {
  if (iso === "PE-LAL") return "trujillo";
  if (iso === "PE-LIM" || iso === "PE-LMA" || iso === "PE-CAL") return "lima";
  if (iso === "PE-ARE") return "arequipa";
  if (iso === "PE-LAM") return "chiclayo";
  if (iso === "PE-PIU") return "piura";
  if (iso === "PE-CUS") return "cusco";
  return iso.startsWith("PE") ? "otras" : "fuera";
}

/** Cuánto tinte lleva un departamento en el mapa: de 6 % (nadie) a 92 % (el que más), sobre hueso. Lo mismo que el mapa de calor. */
export const tinteDeRegion = (n: number, max: number) => Math.round(6 + (max > 0 ? n / max : 0) * 86);

/**
 * Cuántos de cada 100 que llegan por un camino separan, y si ese camino rinde: «bien» si separa un cuarto más que el promedio de todos,
 * «poco» si separa un cuarto menos y además trae a 8 de cada 100 o más (un camino chico que separa poco no es noticia). Con menos de 20
 * personas por ese camino no se juzga.
 */
export function rindeElCamino(llegaron: number, separaron: number, total: number, separaronTodos: number): { de100: number; tono: "verde" | "ambar" | "neutro" } {
  const tasa = de100(separaron, llegaron);
  if (llegaron < MINIMO_PARA_COMPARAR || separaronTodos === 0) return { de100: tasa, tono: "neutro" };
  const promedio = separaronTodos / total;
  const propia = separaron / llegaron;
  if (propia >= promedio * 1.25) return { de100: tasa, tono: "verde" };
  if (propia <= promedio * 0.75 && de100(llegaron, total) >= 8) return { de100: tasa, tono: "ambar" };
  return { de100: tasa, tono: "neutro" };
}

/** La ciudad SIN tienda desde la que más gente mira (Chiclayo, Piura, Cusco): la pista de dónde abrir o a quién mandar más. */
export function ciudadSinTienda(ciudades: Record<Ciudad, number>): Ciudad | null {
  const candidatas = (["chiclayo", "piura", "cusco"] as const).filter((c) => ciudades[c] > 0).sort((a, b) => ciudades[b] - ciudades[a]);
  return candidatas[0] ?? null;
}

// ---------- Qué prendas miran: la tabla que se ordena (actividad 6) ----------

/** Con menos gente que esto mirando una prenda, no se le pone «Estrella» ni «Revisar»: cuatro personas no hacen una prenda buena o mala. */
const POCAS_PARA_UNA_PRENDA = 10;

/** Por qué se ordena la tabla de prendas: cuántos la miraron, cuántos de cada 100 la separan o cuántos la separaron. */
export type CampoPrenda = "miraron" | "separan" | "separaron";
const tasaDe = (p: PrendaTrafico) => (p.recorrido[0] > 0 ? p.recorrido[3] / p.recorrido[0] : 0);

/**
 * La tabla ordenada (sin tocar la lista que llega). A igual cifra, la más mirada primero; después, por nombre. Por «separan», las prendas
 * con muy poca gente van al final en cualquier sentido: 1 de 8 es «12 de cada 100» y no es una estrella.
 */
export function ordenarPrendas(prendas: readonly PrendaTrafico[], campo: CampoPrenda, dir: "asc" | "desc"): PrendaTrafico[] {
  const valor = (p: PrendaTrafico) => (campo === "separan" ? tasaDe(p) : campo === "separaron" ? p.recorrido[3] : p.recorrido[0]);
  const pocas = (p: PrendaTrafico) => (campo === "separan" && p.recorrido[0] < POCAS_PARA_UNA_PRENDA ? 1 : 0);
  const signo = dir === "desc" ? -1 : 1;
  return [...prendas].sort(
    (a, b) => pocas(a) - pocas(b) || signo * (valor(a) - valor(b)) || b.recorrido[0] - a.recorrido[0] || a.nombre.localeCompare(b.nombre, "es"),
  );
}

/** De cada persona que miró una prenda, cuántas la separaron: el promedio de la tienda contra el que se mide cada prenda (0 a 1). */
export function separanEnPromedio(prendas: readonly PrendaTrafico[]): number {
  const miraron = prendas.reduce((a, p) => a + p.recorrido[0], 0);
  return miraron > 0 ? prendas.reduce((a, p) => a + p.recorrido[3], 0) / miraron : 0;
}


/**
 * El estado de una prenda contra el promedio: «Estrella» si la separan un 30 % más que el promedio, «Revisar» si la separan menos de la
 * mitad (la miran y no la llevan: precio, fotos, tallas), «Normal» entre medio. Con poca gente, «Pocas personas».
 */
export function estadoDePrenda(p: PrendaTrafico, promedio: number): { tono: "verde" | "ambar" | "neutro"; texto: string } {
  if (p.recorrido[0] < POCAS_PARA_UNA_PRENDA || promedio === 0) return { tono: "neutro", texto: "Pocas personas" };
  const tasa = tasaDe(p);
  if (tasa > promedio * 1.3) return { tono: "verde", texto: "Estrella" };
  if (tasa < promedio * 0.55) return { tono: "ambar", texto: "Revisar" };
  return { tono: "neutro", texto: "Normal" };
}

/** Cuánto se llena la barra de «separan»: el promedio queda justo en la mitad (la raya), y el doble del promedio la llena. */
export const barraDeSeparan = (p: PrendaTrafico, promedio: number) => (promedio > 0 ? Math.min(100, Math.round((tasaDe(p) / (2 * promedio)) * 100)) : 0);

/** «12 de cada 100» que la miraron la separaron. */
export const separanDe100 = (p: PrendaTrafico) => de100(p.recorrido[3], p.recorrido[0]);

// ---------- Tallas que piden y no hay, y quién entra (actividad 7) ----------

/** Una talla de una categoría: cuántas personas la eligieron, cuántas unidades libres quedan y cuántos modelos ya no la tienen. */
export type TallaPedida = { talla: string; piden: number; quedan: number; sin: number };
export type CategoriaTallas = { categoria: string; prefijo: string | null; familia: string | null; modelos: number; tallas: TallaPedida[] };
export type TallasTrafico = { desde: string; hasta: string; filas: CategoriaTallas[] };
export type QuienesTrafico = { nuevos: number; nuevosSeparan: number; vuelven: number; vuelvenSeparan: number };

const tallaPedida = (v: unknown): TallaPedida | null =>
  Array.isArray(v) && v.length === 4 && typeof v[0] === "string" && v.slice(1).every(esCifra)
    ? { talla: v[0], piden: v[1] as number, quedan: v[2] as number, sin: v[3] as number }
    : null;

function leerTallas(v: unknown): TallasTrafico | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  if (typeof d.desde !== "string" || !FECHA.test(d.desde) || typeof d.hasta !== "string" || !FECHA.test(d.hasta)) return null;
  const filas = lista(d.filas)
    .map((f): CategoriaTallas | null => {
      if (!texto(f.categoria) || !esCifra(f.modelos)) return null;
      const tallas = (Array.isArray(f.tallas) ? f.tallas : []).map(tallaPedida).filter((t): t is TallaPedida => t !== null);
      tallas.sort((a, b) => compararTallas(a.talla, b.talla));
      return { categoria: f.categoria as string, prefijo: texto(f.prefijo), familia: texto(f.familia), modelos: f.modelos, tallas };
    })
    .filter((f): f is CategoriaTallas => f !== null && f.tallas.length > 0);
  return { desde: d.desde, hasta: d.hasta, filas };
}

function leerQuienes(v: unknown): QuienesTrafico | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  if (![d.nuevos, d.nuevos_separan, d.vuelven, d.vuelven_separan].every(esCifra)) return null;
  return { nuevos: d.nuevos as number, nuevosSeparan: d.nuevos_separan as number, vuelven: d.vuelven as number, vuelvenSeparan: d.vuelven_separan as number };
}

/** Con menos personas que esto pidiendo una talla, que no haya no es noticia todavía. */
const MINIMO_PARA_FALTAR = 5;

/**
 * Una talla «falta» si la piden mucho (al menos 3 de cada 10 de la talla más pedida de todas, y 5 personas o más) y queda menos de 1
 * unidad por cada 10 personas que la eligieron. Es lo que se marca en ámbar: gente que quería esa talla y se fue sin ella.
 */
export function tallaFalta(t: TallaPedida, maxPiden: number): boolean {
  return t.piden >= MINIMO_PARA_FALTAR && t.piden >= maxPiden * 0.3 && t.quedan * 10 < t.piden;
}

/** Las tallas que faltan, de la más pedida a la menos, con su categoría. */
export function tallasQueFaltan(filas: readonly CategoriaTallas[]): (TallaPedida & { categoria: string; modelos: number })[] {
  const max = Math.max(0, ...filas.flatMap((f) => f.tallas.map((t) => t.piden)));
  return filas
    .flatMap((f) => f.tallas.filter((t) => tallaFalta(t, max)).map((t) => ({ ...t, categoria: f.categoria, modelos: f.modelos })))
    .sort((a, b) => b.piden - a.piden || a.categoria.localeCompare(b.categoria, "es"));
}

/** «68 de cada 100 entran por primera vez; de ellos, 5 de cada 100 separan»: las dos partes de «Quién entra». */
export function quienesEntran(q: QuienesTrafico): { nuevos: number; vuelven: number; nuevosSeparan: number; vuelvenSeparan: number } | null {
  const total = q.nuevos + q.vuelven;
  if (!total) return null;
  return {
    nuevos: de100(q.nuevos, total),
    vuelven: 100 - de100(q.nuevos, total),
    nuevosSeparan: de100(q.nuevosSeparan, q.nuevos),
    vuelvenSeparan: de100(q.vuelvenSeparan, q.vuelven),
  };
}

// ---------- Necesita tu atención: reponer, recoger, empujar (actividad 8) ----------

/** Una prenda publicada que miraron en las últimas 4 semanas, con lo que le queda libre en las tiendas y lo que se vendió. */
export type PrendaAtencion = {
  id: string;
  nombre: string;
  categoria: string | null;
  prefijo: string | null;
  familia: string | null;
  foto: string | null;
  hex: string | null;
  miraron: number;
  separaron: number;
  quedan: number;
  vendidas: number;
};
/** Un pedido pagado que espera que lo recojan. */
export type PedidoRecoger = { id: string; codigo: string | null; numero: number | null; sede: string; pagadoEn: string; prendas: number; prenda: string | null; talla: string | null };
export type AtencionTrafico = { desde: string; hasta: string; diasAviso: number; prendas: PrendaAtencion[]; recogerTotal: number; recoger: PedidoRecoger[] };

const DIAS_DE_LA_VENTANA = 28;

function leerAtencion(v: unknown): AtencionTrafico | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  if (typeof d.desde !== "string" || !FECHA.test(d.desde) || typeof d.hasta !== "string" || !FECHA.test(d.hasta) || !esCifra(d.dias_aviso)) return null;
  const prendas = lista(d.prendas)
    .filter((p) => texto(p.id) && texto(p.nombre) && [p.miraron, p.separaron, p.quedan, p.vendidas].every(esCifra))
    .map((p) => ({
      id: p.id as string,
      nombre: p.nombre as string,
      categoria: texto(p.categoria),
      prefijo: texto(p.prefijo),
      familia: texto(p.familia),
      foto: texto(p.foto),
      hex: texto(p.hex),
      miraron: p.miraron as number,
      separaron: p.separaron as number,
      quedan: p.quedan as number,
      vendidas: p.vendidas as number,
    }));
  const recoger = lista(d.recoger)
    .filter((w) => texto(w.id) && texto(w.sede) && typeof w.pagado_en === "string" && !Number.isNaN(Date.parse(w.pagado_en)))
    .map((w) => ({
      id: w.id as string,
      codigo: texto(w.codigo),
      numero: esCifra(w.numero) ? w.numero : null,
      sede: w.sede as string,
      pagadoEn: w.pagado_en as string,
      prendas: esCifra(w.prendas) ? w.prendas : 0,
      prenda: texto(w.prenda),
      talla: texto(w.talla),
    }));
  return { desde: d.desde, hasta: d.hasta, diasAviso: d.dias_aviso, prendas, recogerTotal: esCifra(d.recoger_total) ? d.recoger_total : recoger.length, recoger };
}

/** Para cuántos días alcanza lo que queda, al ritmo de venta de las últimas 4 semanas; `null` si no se vendió nada (no se agota). */
export const diasDeStock = (p: PrendaAtencion) => (p.vendidas > 0 ? (p.quedan * DIAS_DE_LA_VENTANA) / p.vendidas : null);

/** Con menos gente que esto mirándola, una prenda no se manda a reponer ni a empujar. */
const MIRADAS_PARA_ATENDER = 10;
/** Menos de esto, se agota pronto: hay que reponerla antes de empujarla. */
const DIAS_PARA_REPONER = 14;
/** Más de esto (o sin ventas), sobra: hay que empujarla. */
const DIAS_PARA_EMPUJAR = 40;
/** Con menos unidades que esto, aunque no se venda, no vale la pena empujarla. */
const UNIDADES_PARA_EMPUJAR = 5;
const A_LA_VISTA_ATENCION = 6;

/** Las que se agotan primero entre las que miran: menos de 14 días de stock (o ya agotadas), de la más urgente a la menos. */
export function paraReponer(prendas: readonly PrendaAtencion[]): (PrendaAtencion & { dias: number })[] {
  return prendas
    .filter((p) => p.miraron >= MIRADAS_PARA_ATENDER)
    .map((p) => ({ ...p, dias: p.quedan === 0 ? 0 : diasDeStock(p) }))
    .filter((p): p is PrendaAtencion & { dias: number } => p.dias !== null && p.dias < DIAS_PARA_REPONER)
    .sort((a, b) => a.dias - b.dias || b.miraron - a.miraron)
    .slice(0, A_LA_VISTA_ATENCION);
}

/** Las que miran y casi no salen: stock para más de 40 días (o sin ventas) y 5 unidades o más, de la más mirada a la menos. */
export function paraEmpujar(prendas: readonly PrendaAtencion[]): (PrendaAtencion & { dias: number | null })[] {
  return prendas
    .filter((p) => p.miraron >= MIRADAS_PARA_ATENDER && p.quedan >= UNIDADES_PARA_EMPUJAR)
    .map((p) => ({ ...p, dias: diasDeStock(p) }))
    .filter((p) => p.dias === null || p.dias > DIAS_PARA_EMPUJAR)
    .sort((a, b) => b.miraron - a.miraron || a.nombre.localeCompare(b.nombre, "es"))
    .slice(0, A_LA_VISTA_ATENCION);
}

/** Cuántos días lleva esperando un pedido pagado (días de calendario en Lima) y si ya pasó el plazo de aviso. */
export function esperaDelPedido(w: PedidoRecoger, diasAviso: number, hoy: string): { dias: number; atrasado: boolean } {
  const dias = Math.max(0, diasEntreFechas(diaLima(w.pagadoEn) ?? hoy, hoy));
  return { dias, atrasado: dias >= diasAviso };
}

/** «18 días» de stock, «Agotada» o «Sin ventas». */
export const diasDeStockTexto = (dias: number | null) => (dias === null ? "Sin ventas" : dias < 1 ? "Agotada" : `${Math.round(dias)} ${Math.round(dias) === 1 ? "día" : "días"}`);

// ---------- El calendario: el mes, día por día (actividad 9) ----------

export type CalendarioTrafico = { mes: string; dias: (readonly [number, number])[] };

function leerCalendario(v: unknown): CalendarioTrafico | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  if (typeof d.mes !== "string" || !FECHA.test(d.mes)) return null;
  const dias = (Array.isArray(d.dias) ? d.dias : []).filter(
    (x): x is [number, number] => Array.isArray(x) && x.length === 2 && x.every(esCifra) && x[0] >= 1 && x[0] <= 31,
  );
  return { mes: d.mes, dias };
}

export type DiaCalendario = { dia: number; fecha: string; n: number | null; enPeriodo: boolean; hoy: boolean };

/**
 * Las celdas del calendario, de lunes a domingo: cuántas vacías van antes del 1 y cada día con su gente (`null` si todavía no llega),
 * si es del período elegido y si es hoy. Los días del mes que no son del período se ven tenues.
 */
export function celdasDelCalendario(c: CalendarioTrafico, p: { desde: string; hasta: string }, hoy: string): { antes: number; dias: DiaCalendario[] } {
  const n = new Map(c.dias.map(([d, x]) => [d, x]));
  const largo = diasEntreFechas(c.mes, sumarDias(c.mes.slice(0, 8) + "28", 4).slice(0, 8) + "01");
  return {
    antes: diaDeLaSemana(c.mes),
    dias: Array.from({ length: largo }, (_, i) => {
      const fecha = sumarDias(c.mes, i);
      return { dia: i + 1, fecha, n: fecha > hoy ? null : (n.get(i + 1) ?? 0), enPeriodo: fecha >= p.desde && fecha <= p.hasta, hoy: fecha === hoy };
    }),
  };
}

/**
 * Cuánto rojo lleva un día del calendario: de 6 % (nadie) a 56 % (el que más), sobre hueso. Más suave que el mapa de calor porque encima va
 * su número en tinta: hasta 56 % se lee en los dos temas (4,6:1 o más, medido con tema:auditar). Fuera del período, el 40 % de eso: tenue
 * sin apagar el número.
 */
export function tinteDelDia(n: number, max: number, enPeriodo: boolean): number {
  const t = 6 + (max > 0 ? n / max : 0) * 50;
  return Math.round(enPeriodo ? t : t * 0.4);
}

/** Los dos días de la semana con más gente en promedio en el mes (solo los días que ya pasaron); `null` con menos de 10 personas. */
export function diasFuertesDelMes(dias: readonly DiaCalendario[]): readonly [number, number] | null {
  const suma = Array(7).fill(0);
  const veces = Array(7).fill(0);
  let total = 0;
  for (const d of dias) {
    if (d.n === null) continue;
    const s = diaDeLaSemana(d.fecha);
    suma[s] += d.n;
    veces[s] += 1;
    total += d.n;
  }
  if (total < MINIMO_PARA_LA_HORA) return null;
  const prom = suma.map((x, i) => (veces[i] ? x / veces[i] : 0));
  const [a, b] = [0, 1, 2, 3, 4, 5, 6].sort((x, y) => prom[y] - prom[x] || x - y);
  return [Math.min(a, b), Math.max(a, b)];
}

/** «Octubre», «Setiembre»: el nombre del mes, con mayúscula. */
export const mesTexto = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1].charAt(0).toUpperCase()}${MESES[Number(mes.slice(5, 7)) - 1].slice(1)}`;
