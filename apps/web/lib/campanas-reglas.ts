import { DISENO_DE_SIEMPRE, coloresDelDiseno, leerDiseno, type Colores, type DisenoDeCampana } from "@cayla-retail/portada";
import { fechaCorta, textoRango } from "./etiqueta-vigencia";
import { estadoDelBorrador, type PiezaDePortada } from "./campana-diseno";

// Tienda web ▸ Campañas (ADR-0436; maqueta docs/maquetas/campanas-diseno-2026-10): lo que la pantalla deriva de lo que lee. Lógica pura:
// se importa desde el servidor y desde el cliente, y se prueba en `campanas-reglas.test.ts`.
//
// PROMETE: leer con su forma lo que devuelven `campanas_lista()` y `campanas_portada_dias()` (null si no viene como se espera: la
// pantalla lo dice en vez de dibujar a medias), en qué está cada campaña hoy, los filtros, las cifras de arriba y los tramos de la línea
// «La portada, día a día». NO decide qué campaña sale en la portada: eso lo dice la base, día por día (`fn_campana_en_portada`), y aquí
// solo se agrupa.

export type Campana = {
  id: string;
  nombre: string;
  activo: boolean;
  estado: "aprobado" | "pendiente";
  /** `AAAA-MM-DD`, o null si no tiene. */
  desde: string | null;
  hasta: string | null;
  pct: number | null;
  /** Modelos y variantes etiquetados a mano; categorías donde rige entera. */
  modelos: number;
  variantes: number;
  categorias: number;
};

/** Una campaña de la lista, con lo que su portada en chico necesita (ADR-0436, actividad 4). */
export type CampanaDeLista = Campana & {
  /** El diseño que ve el cliente; null: la portada de siempre. */
  diseno: DisenoDeCampana | null;
  /** El que se está probando y todavía no se publicó; null: ninguno. */
  borrador: DisenoDeCampana | null;
  /** Hasta tres de sus prendas, primero las que tienen foto (las polaroids de la miniatura). */
  piezas: PiezaDePortada[];
};

export type DiaPortada = { dia: string; campana: string | null };

type Crudo = Record<string, unknown>;
const esObjeto = (x: unknown): x is Crudo => !!x && typeof x === "object" && !Array.isArray(x);
const esFecha = (x: unknown): x is string => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
const fechaONull = (x: unknown): string | null | undefined => (x === null ? null : esFecha(x) ? x : undefined);
const entero = (x: unknown): number | null => (typeof x === "number" && Number.isInteger(x) && x >= 0 ? x : null);
const textoONull = (x: unknown): string | null => (typeof x === "string" ? x : null);

function leerPieza(x: unknown): PiezaDePortada | null {
  if (!esObjeto(x) || typeof x.id !== "string" || typeof x.nombre !== "string") return null;
  return {
    id: x.id,
    nombre: x.nombre,
    foto: textoONull(x.foto),
    colorHex: textoONull(x.color_hex),
    categoria: textoONull(x.categoria),
    prefijo: textoONull(x.prefijo),
    familia: textoONull(x.familia),
  };
}

function leerCampana(x: unknown): CampanaDeLista | null {
  if (!esObjeto(x) || typeof x.id !== "string" || typeof x.nombre !== "string" || typeof x.activo !== "boolean") return null;
  if (x.estado !== "aprobado" && x.estado !== "pendiente") return null;
  const desde = fechaONull(x.desde);
  const hasta = fechaONull(x.hasta);
  // El % llega como número o como texto («10.00», numeric de Postgres).
  const pct = x.pct === null ? null : Number(x.pct);
  const [modelos, variantes, categorias] = [entero(x.modelos), entero(x.variantes), entero(x.categorias)];
  if (desde === undefined || hasta === undefined || (pct !== null && !(pct > 0)) || modelos === null || variantes === null || categorias === null) return null;
  const piezas = Array.isArray(x.piezas) ? x.piezas.map(leerPieza) : null;
  if (!piezas || !piezas.every((p): p is PiezaDePortada => p !== null)) return null;
  // Un diseño que esta versión no sabe leer cuenta como la portada de siempre: la miniatura nunca se dibuja rota (`leerDiseno`).
  const diseno = leerDiseno(x.diseno);
  const borrador = leerDiseno(x.borrador);
  return { id: x.id, nombre: x.nombre, activo: x.activo, estado: x.estado, desde, hasta, pct, modelos, variantes, categorias, diseno, borrador, piezas };
}

/** Todo o nada: una fila con otra forma vuelve null la lista entera (mejor «no se pudo leer» que una lista con huecos). */
export function leerCampanas(dato: unknown): CampanaDeLista[] | null {
  if (!Array.isArray(dato)) return null;
  const lista = dato.map(leerCampana);
  return lista.every((c): c is CampanaDeLista => c !== null) ? lista : null;
}

/* ---------------- El diseño de cada campaña en la lista ---------------- */

/**
 * La insignia del diseño de una campaña: «Diseño de siempre» si nunca se publicó uno propio, «Borrador» si hay cambios que el cliente
 * todavía no ve. Es la misma pregunta del editor (`estadoDelBorrador`): un borrador igual a lo publicado no es un borrador.
 */
export const disenoDeLaLista = (c: Pick<CampanaDeLista, "diseno" | "borrador">) =>
  estadoDelBorrador({ publicado: c.diseno ? { diseno: c.diseno } : null }, c.borrador ?? c.diseno ?? DISENO_DE_SIEMPRE);

/** Los colores de la portada que ve el cliente (en claro): los de su barra en «La portada, día a día» y su miniatura. Son dato, no tema. */
export const coloresDeLaPortada = (c: Pick<CampanaDeLista, "diseno">): Colores => coloresDelDiseno(c.diseno ?? DISENO_DE_SIEMPRE, "claro");


export function leerDiasPortada(dato: unknown): DiaPortada[] | null {
  if (!Array.isArray(dato)) return null;
  const dias = dato.map((x) => (esObjeto(x) && esFecha(x.dia) && (x.campana === null || typeof x.campana === "string") ? { dia: x.dia, campana: x.campana } : null));
  return dias.every((d): d is DiaPortada => d !== null) ? dias : null;
}

/* ---------------- En qué está cada campaña ---------------- */

export type EstadoCampana = "desactivada" | "por_aprobar" | "vigente" | "proxima" | "termino" | "sin_fechas";

/** `hoy` es el día de Lima (`hoyLima()`), en `AAAA-MM-DD`. */
export function estadoDeCampana(c: Campana, hoy: string): EstadoCampana {
  if (!c.activo) return "desactivada";
  if (c.estado === "pendiente") return "por_aprobar";
  if (!c.desde && !c.hasta) return "sin_fechas";
  if (c.hasta && c.hasta < hoy) return "termino";
  if (c.desde && c.desde > hoy) return "proxima";
  return "vigente";
}

const DIA_MS = 86_400_000;
const aMs = (f: string) => Date.parse(`${f}T00:00:00Z`);
export const diasEntre = (desde: string, hasta: string) => Math.round((aMs(hasta) - aMs(desde)) / DIA_MS);
const sumarDias = (f: string, n: number) => new Date(aMs(f) + n * DIA_MS).toISOString().slice(0, 10);

/* ---------------- Filtros y orden ---------------- */

export const FILTROS = [
  { clave: "todas", etiqueta: "Todas" },
  { clave: "vigentes", etiqueta: "Vigentes" },
  { clave: "proximas", etiqueta: "Próximas" },
  { clave: "terminadas", etiqueta: "Terminadas" },
] as const;
export type Filtro = (typeof FILTROS)[number]["clave"];

/** A qué filtro pertenece cada estado. Una campaña sin fechas o por aprobar todavía puede salir: va con las próximas. Una desactivada
 *  ya no sale nunca: va con las terminadas. */
const FILTRO_DE: Record<EstadoCampana, Exclude<Filtro, "todas">> = {
  vigente: "vigentes",
  proxima: "proximas",
  sin_fechas: "proximas",
  por_aprobar: "proximas",
  termino: "terminadas",
  desactivada: "terminadas",
};

export function conteoPorFiltro(campanas: readonly Campana[], hoy: string): Record<Filtro, number> {
  const conteo: Record<Filtro, number> = { todas: campanas.length, vigentes: 0, proximas: 0, terminadas: 0 };
  for (const c of campanas) conteo[FILTRO_DE[estadoDeCampana(c, hoy)]]++;
  return conteo;
}

const PUESTO: Record<EstadoCampana, number> = { vigente: 0, proxima: 1, por_aprobar: 2, sin_fechas: 3, termino: 4, desactivada: 5 };

/** El orden de la lista: lo que corre hoy (la que termina primero arriba), lo que viene (la más cercana arriba), lo que no tiene fecha,
 *  y al final lo que ya pasó (la más reciente arriba); las desactivadas, al fondo. Así lo primero que se ve es lo que importa hoy. */
export function ordenarYFiltrar<C extends Campana>(campanas: readonly C[], filtro: Filtro, hoy: string): C[] {
  const dentro = (a: Campana, b: Campana, e: EstadoCampana): number => {
    if (e === "vigente") return (a.hasta ?? "9999-12-31").localeCompare(b.hasta ?? "9999-12-31");
    if (e === "proxima") return (a.desde ?? "").localeCompare(b.desde ?? "");
    if (e === "termino" || e === "desactivada") return (b.hasta ?? "").localeCompare(a.hasta ?? "");
    return 0;
  };
  return campanas
    .filter((c) => filtro === "todas" || FILTRO_DE[estadoDeCampana(c, hoy)] === filtro)
    .sort((a, b) => {
      const ea = estadoDeCampana(a, hoy);
      const eb = estadoDeCampana(b, hoy);
      return PUESTO[ea] - PUESTO[eb] || dentro(a, b, ea) || a.nombre.localeCompare(b.nombre, "es");
    });
}

/* ---------------- Cómo se dice cada cosa ---------------- */

/** «10» o «12.5»: el porcentaje sin ceros de más (el punto decimal de es-PE, como el resto del ERP). */
export const textoPct = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });

/** «1 oct. – 30 oct.» · «−10 %» · «3 modelos» (o «En 2 categorías», o «Sin prendas»). */
export function datosDeCampana(c: Campana): string[] {
  const prendas =
    c.modelos > 0
      ? `${c.modelos} ${c.modelos === 1 ? "modelo" : "modelos"}`
      : c.categorias > 0
        ? `En ${c.categorias} ${c.categorias === 1 ? "categoría" : "categorías"}`
        : "Sin prendas";
  return [textoRango(c.desde, c.hasta) ?? "Sin fechas", c.pct ? `−${textoPct(c.pct)} %` : "Sin descuento", prendas];
}

/* ---------------- Las cifras de arriba ---------------- */

export type Cifras = {
  /** La campaña que la portada anuncia hoy (la base lo decide), o null: sale «Lo nuevo». */
  enPortada: Campana | null;
  vigentes: Campana[];
  /** La próxima en empezar, con cuántos días faltan. */
  proxima: { campana: Campana; enDias: number } | null;
};

export function cifrasDeCampanas(campanas: readonly Campana[], dias: readonly DiaPortada[] | null, hoy: string): Cifras {
  const idHoy = dias?.find((d) => d.dia === hoy)?.campana ?? null;
  const proximas = campanas
    .filter((c) => estadoDeCampana(c, hoy) === "proxima" && c.desde)
    .sort((a, b) => a.desde!.localeCompare(b.desde!));
  const primera = proximas[0];
  return {
    enPortada: campanas.find((c) => c.id === idHoy) ?? null,
    vigentes: campanas.filter((c) => estadoDeCampana(c, hoy) === "vigente"),
    proxima: primera ? { campana: primera, enDias: diasEntre(hoy, primera.desde!) } : null,
  };
}

/**
 * Si hoy corre más de una campaña, la portada igual muestra una sola: la pantalla lo dice, con cuál sale y hasta cuándo corren las dos.
 * `null` si hoy no se cruzan.
 */
export function cruceDeHoy(campanas: readonly Campana[], dias: readonly DiaPortada[] | null, hoy: string) {
  const vigentes = campanas.filter((c) => estadoDeCampana(c, hoy) === "vigente");
  if (vigentes.length < 2) return null;
  const finales = vigentes.map((c) => c.hasta).filter((f): f is string => f !== null).sort();
  return { nombres: vigentes.map((c) => c.nombre), enPortada: cifrasDeCampanas(campanas, dias, hoy).enPortada, hasta: finales[0] ?? null };
}

/* ---------------- La línea «La portada, día a día» ---------------- */

/** El tramo de la línea: desde el primer día del mes de hoy hasta el último del segundo mes que sigue (tres meses), y cuántos días
 *  tiene cada mes (el ancho de su columna). */
export function rangoDeLaLinea(hoy: string) {
  const [a, m] = hoy.split("-").map(Number) as [number, number];
  const meses: { nombre: string; dias: number }[] = [];
  for (let k = 0; k < 3; k++) {
    const fecha = new Date(Date.UTC(a, m - 1 + k, 1));
    const dias = new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1, 0)).getUTCDate();
    meses.push({ nombre: fecha.toLocaleDateString("es-PE", { month: "long", timeZone: "UTC" }), dias });
  }
  const desde = `${a}-${String(m).padStart(2, "0")}-01`;
  const total = meses.reduce((s, x) => s + x.dias, 0);
  return { desde, hasta: sumarDias(desde, total - 1), total, meses };
}
export type Rango = ReturnType<typeof rangoDeLaLinea>;

/** Dónde empieza un día en la línea, de 0 a 100 (recortado a los bordes). */
export const posicion = (fecha: string, rango: Rango) => (Math.min(Math.max(diasEntre(rango.desde, fecha), 0), rango.total) / rango.total) * 100;

/** Una barra de la línea: desde qué día y cuántos ocupa, en % del ancho; null si cae entera fuera. */
export function barraEn(desde: string | null, hasta: string | null, rango: Rango) {
  const ini = desde && desde > rango.desde ? desde : rango.desde;
  const fin = hasta && hasta < rango.hasta ? hasta : rango.hasta;
  if (fin < ini) return null;
  return {
    izquierda: posicion(ini, rango),
    ancho: ((diasEntre(ini, fin) + 1) / rango.total) * 100,
    /** Empezó antes del primer día de la línea: la barra se dibuja cortada a la izquierda. */
    cortadaAntes: !desde || desde < rango.desde,
    cortadaDespues: !hasta || hasta > rango.hasta,
  };
}

export type Tramo = { desde: string; hasta: string; campana: string | null };

/** Los días seguidos con la misma campaña (o sin ninguna) se juntan en un tramo: así se dibuja la fila «En la portada». */
export function tramosDePortada(dias: readonly DiaPortada[]): Tramo[] {
  const tramos: Tramo[] = [];
  for (const d of dias) {
    const ultimo = tramos.at(-1);
    if (ultimo && ultimo.campana === d.campana && sumarDias(ultimo.hasta, 1) === d.dia) ultimo.hasta = d.dia;
    else tramos.push({ desde: d.dia, hasta: d.dia, campana: d.campana });
  }
  return tramos;
}

/** Las campañas que tienen alguna fecha dentro de la línea (las que se dibujan como fila), en el orden en que empiezan. */
export function campanasEnLaLinea<C extends Campana>(campanas: readonly C[], rango: Rango): C[] {
  return campanas
    .filter((c) => c.activo && c.estado === "aprobado" && (c.desde || c.hasta))
    .filter((c) => (c.desde ?? "0000-00-00") <= rango.hasta && (c.hasta ?? "9999-12-31") >= rango.desde)
    .sort((a, b) => (a.desde ?? "").localeCompare(b.desde ?? "") || a.nombre.localeCompare(b.nombre, "es"));
}

/** «hasta el 30 oct.»: cómo se nombra el último día de un cruce. */
export const hastaEl = (f: string) => `hasta el ${fechaCorta(f)}`;

/**
 * Por qué una campaña que corre hoy no es la de la portada, en palabras de tienda. La regla es de la base (`fn_campana_en_portada`):
 * aquí solo se nombra la razón que se ve en los datos, en el mismo orden en que la regla la mira. null si sí sale, o si no corre hoy.
 */
export function porQueNoSale(c: Campana & Pick<CampanaDeLista, "diseno">, enPortada: Campana | null, hoy: string): string | null {
  if (estadoDeCampana(c, hoy) !== "vigente" || enPortada?.id === c.id) return null;
  // Desde la actividad 6a una campaña sin descuento también sale, con prendas o con su diseño publicado.
  const sinPrendas = c.modelos === 0 && c.categorias === 0;
  if (c.pct && sinPrendas) return "No sale en la portada: todavía no tiene prendas.";
  if (!c.pct && sinPrendas && !c.diseno) return "No sale en la portada: todavía no tiene prendas ni diseño propio.";
  return enPortada ? `Hoy la portada muestra «${enPortada.nombre}».` : null;
}
