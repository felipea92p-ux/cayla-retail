// En qué momento de su temporada está una etiqueta comercial (Black Friday,
// Día de la Madre…). Las etiquetas sin fechas son permanentes ("Nuevo", "Hecho
// a mano") y devuelven `null`: no tienen temporada de la que estar dentro o fuera.
//
// "Hoy" llega como parámetro y es el de Lima (`hoyLima()` de `fechas-lima`), no el
// de UTC. `new Date().toISOString()` da la fecha UTC: pasadas las 7 pm en Lima ya
// es "mañana" allá, y una campaña que termina hoy aparecería como terminada
// mientras la tienda sigue abierta.

export type Vigencia =
  | { estado: "vigente"; hasta: string | null }
  | { estado: "proxima"; desde: string; enDias: number }
  | { estado: "terminada"; hasta: string };

const DIA_MS = 86_400_000;

function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS);
}

export function vigenciaDe(desde: string | null, hasta: string | null, hoy: string): Vigencia | null {
  if (!desde && !hasta) return null;
  if (desde && desde > hoy) return { estado: "proxima", desde, enDias: diasEntre(hoy, desde) };
  if (hasta && hasta < hoy) return { estado: "terminada", hasta };
  return { estado: "vigente", hasta };
}

const formatoFecha = new Intl.DateTimeFormat("es-PE", { day: "numeric", month: "short" });

/** «23 set.»: una fecha `YYYY-MM-DD` como se lee en una tarjeta. */
export const fechaCorta = (f: string) => formatoFecha.format(new Date(f + "T00:00:00"));

/** «23 set. – 1 oct.», «Desde 23 set.», «Hasta 1 oct.», o `null` si no tiene fechas (la etiqueta es permanente). */
export function textoRango(desde: string | null, hasta: string | null): string | null {
  if (desde && hasta) return `${fechaCorta(desde)} – ${fechaCorta(hasta)}`;
  if (desde) return `Desde ${fechaCorta(desde)}`;
  if (hasta) return `Hasta ${fechaCorta(hasta)}`;
  return null;
}

// ---- Ordenar por temporada y repetir una campaña que ya pasó (actividad 4, ADR-0441) -----------------------------------------
// Una etiqueta guarda UNA temporada (`vigente_desde`/`vigente_hasta`): el Día de la Madre de 2026 no se repite solo en 2027.
// «Repetir» propone las mismas fechas un año después, con la misma función que ya guarda la campaña. Lo que no puede saber sola
// es si la fiesta va por FECHA (Navidad, el 25) o por DÍA DE LA SEMANA (Día de la Madre, el 2.º domingo de mayo): sumar un año
// mueve el día de la semana, así que lo dice y deja elegir el mismo día a un toque (Felipe, 2026-10-17: «suma un año y avisa»).

type ConTemporada = { nombre: string; vigenteDesde: string | null; vigenteHasta: string | null };

const partes = (f: string) => f.split("-").map(Number) as [number, number, number];
const fechaIso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const diasDelMes = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();
const diaDeSemana = (f: string) => new Date(`${f}T00:00:00Z`).getUTCDay();
const sumarDias = (f: string, n: number) => new Date(Date.parse(`${f}T00:00:00Z`) + n * DIA_MS).toISOString().slice(0, 10);

/** El 29 de febrero, en un año que no lo tiene, pasa al 28. */
function sumarAnios(f: string, n: number): string {
  const [a, m, d] = partes(f);
  return fechaIso(a + n, m, Math.min(d, diasDelMes(a + n, m)));
}

/** El «n-ésimo» día `dia` (0 = domingo) del mes; con `n = 5`, el último (un mes no siempre tiene cinco). */
function enesimoDelMes(a: number, m: number, dia: number, n: number): string {
  if (n === 5) {
    const ultimo = diasDelMes(a, m);
    return fechaIso(a, m, ultimo - ((new Date(Date.UTC(a, m - 1, ultimo)).getUTCDay() - dia + 7) % 7));
  }
  return fechaIso(a, m, 1 + ((dia - new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 7) % 7) + (n - 1) * 7);
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const ORDINALES = ["", "1.er", "2.º", "3.er", "4.º", "último"];
const formatoMes = new Intl.DateTimeFormat("es-PE", { month: "long", timeZone: "UTC" });
// Según el motor, es-PE escribe «Mayo»; en una frase va en minúscula.
const mesLargo = { format: (d: Date) => formatoMes.format(d).toLocaleLowerCase("es-PE") };

export type Repeticion = {
  /** El año que dice el botón: «Repetir en 2027». */
  anio: number;
  /** Las mismas fechas, `anios` años después (casi siempre 1: los que hagan falta para que la temporada no haya pasado). */
  desde: string | null;
  hasta: string | null;
  /** La alternativa por día de la semana: el mismo «2.º domingo de mayo» en el año nuevo, con la temporada entera corrida igual. */
  mismoDia: {
    desde: string | null;
    hasta: string | null;
    /** El día que fija la fiesta (el último de la temporada, o el primero si no tiene fin) antes y ahora. */
    anclaAntes: string;
    anclaSumandoUnAnio: string;
    anclaMismoDia: string;
    /** «2.º domingo de mayo» */
    regla: string;
  } | null;
};

/** `null` si la temporada no terminó (vigente, próxima o sin fechas): solo se repite lo que ya pasó. */
export function repetirTemporada(desde: string | null, hasta: string | null, hoy: string): Repeticion | null {
  if (vigenciaDe(desde, hasta, hoy)?.estado !== "terminada" || !hasta) return null;
  let anios = 1;
  while (sumarAnios(hasta, anios) < hoy) anios++;
  const nuevoDesde = desde ? sumarAnios(desde, anios) : null;
  const nuevoHasta = sumarAnios(hasta, anios);

  // La fiesta la fija el último día (el Día de la Madre cierra la temporada que la prepara).
  const ancla = hasta;
  const [, m, d] = partes(ancla);
  const n = Math.ceil(d / 7);
  const [anioNuevo] = partes(nuevoHasta);
  const anclaMismoDia = enesimoDelMes(anioNuevo, m, diaDeSemana(ancla), n);
  const corrimiento = Math.round((Date.parse(`${anclaMismoDia}T00:00:00Z`) - Date.parse(`${nuevoHasta}T00:00:00Z`)) / DIA_MS);
  const mismoDia =
    corrimiento === 0
      ? null
      : {
          desde: nuevoDesde ? sumarDias(nuevoDesde, corrimiento) : null,
          hasta: anclaMismoDia,
          anclaAntes: ancla,
          anclaSumandoUnAnio: nuevoHasta,
          anclaMismoDia,
          regla: `${ORDINALES[n]} ${DIAS[diaDeSemana(ancla)]} de ${mesLargo.format(new Date(`${ancla}T00:00:00Z`))}`,
        };
  return { anio: partes(nuevoDesde ?? nuevoHasta)[0], desde: nuevoDesde, hasta: nuevoHasta, mismoDia };
}

const diaYNumero = (f: string) => `${DIAS[diaDeSemana(f)]} ${partes(f)[2]}`;

/** Lo que dice la hoja de campaña al repetir, según qué fechas tiene puestas: las de sumar un año (avisa que cambió el día y
 *  ofrece el mismo), las del mismo día (dice qué regla siguió, con «Deshacer»), u otras escritas a mano (`null`: ya decidió). */
export function avisoDiaDeSemana(
  r: Repeticion,
  puestas: { desde: string; hasta: string },
): { modo: "sumando-un-anio" | "mismo-dia"; titulo: string; detalle: string; boton: string } | null {
  const md = r.mismoDia;
  if (!md) return null;
  const iguales = (a: string | null, b: string) => (a ?? "") === b;
  if (iguales(r.desde, puestas.desde) && iguales(r.hasta, puestas.hasta)) {
    return {
      modo: "sumando-un-anio",
      titulo: `En ${partes(md.anclaSumandoUnAnio)[0]}, el ${fechaCorta(md.anclaSumandoUnAnio)} cae ${DIAS[diaDeSemana(md.anclaSumandoUnAnio)]}`,
      detalle: `En ${partes(md.anclaAntes)[0]} fue ${DIAS[diaDeSemana(md.anclaAntes)]}. Si la fiesta va siempre el mismo día de la semana, usa el ${diaYNumero(md.anclaMismoDia)}: toda la temporada se corre igual.`,
      boton: `Usar el ${diaYNumero(md.anclaMismoDia)}`,
    };
  }
  if (iguales(md.desde, puestas.desde) && iguales(md.hasta, puestas.hasta)) {
    return {
      modo: "mismo-dia",
      titulo: `Termina el ${diaYNumero(md.anclaMismoDia)} de ${mesLargo.format(new Date(`${md.anclaMismoDia}T00:00:00Z`))}`,
      detalle: `El ${md.regla}, como en ${partes(md.anclaAntes)[0]}.`,
      boton: "Deshacer",
    };
  }
  return null;
}

/** El orden de una lista de etiquetas por su temporada: lo que rige hoy (lo que termina antes, primero), lo que viene (lo que
 *  empieza antes, primero), lo que ya pasó (lo que vuelve antes si se repite, primero) y al final las que no tienen fechas.
 *  Antes iban por abecedario: el Día del Gato, que empezaba en 7 días, quedaba en la segunda fila entre cinco que ya pasaron. */
export function ordenarPorTemporada<T extends ConTemporada>(lista: readonly T[], hoy: string): T[] {
  const clave = (e: T): [number, string] => {
    const v = vigenciaDe(e.vigenteDesde, e.vigenteHasta, hoy);
    if (!v) return [3, ""];
    if (v.estado === "vigente") return [0, v.hasta ?? "9999-12-31"];
    if (v.estado === "proxima") return [1, v.desde];
    const r = repetirTemporada(e.vigenteDesde, e.vigenteHasta, hoy);
    return [2, r?.desde ?? r?.hasta ?? v.hasta];
  };
  return lista
    .map((e) => ({ e, k: clave(e) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1].localeCompare(b.k[1]) || a.e.nombre.localeCompare(b.e.nombre, "es"))
    .map(({ e }) => e);
}
