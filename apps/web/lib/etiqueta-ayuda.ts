import { iconoDeEtiqueta, type IconoEtiqueta } from "./etiqueta-visual";
import { fechaCorta, vigenciaDe } from "./etiqueta-vigencia";
import { estiloConocido, type EstiloEtiqueta } from "./etiqueta-grupos";

// Lo que se lee al pasar el mouse por una etiqueta en Nuevo producto: qué significa, en palabras de la tienda.
//
// CONTRATO
//   PROMETE: para cualquier etiqueta, una frase de «qué es» (nunca vacía) y, si la campaña descuenta o tiene fechas, los datos que
//            importan al elegirla: cuánto descuenta, si ya rige sola sobre la categoría y en qué temporada está.
//   ASUME:   el nombre es lo único estable del vocabulario (un líder puede agregar etiquetas nuevas): la frase se elige por
//            familia de concepto con la misma regla que el dibujo (`iconoDeEtiqueta`), y una etiqueta que no se reconoce cae en
//            una frase por su GRUPO, que no es falsa.
//   NO HACE: no lee `etiquetas.notas`. Las notas sembradas son apuntes de desarrollo («patrón Bershka», «fn_etiquetas_estado_
//            trigger») escritos para quien programa, no para quien atiende: mostrarlas al pasar el mouse confundiría. Lo durable
//            sería una columna `descripcion` en la base, escrita en lenguaje de la tienda al aprobar la etiqueta (decisión de Felipe).
//
// De dónde salen las frases: de esas mismas notas sembradas (supabase/migrations/20260917230100_etiquetas_seed_comerciales_y_
// festividades.sql), traducidas: las fechas y las reglas («solo cuando el stock es realmente bajo») son las que Felipe ya decidió.

const QUE_ES: Record<IconoEtiqueta, string> = {
  nuevo: "Prendas recién llegadas.",
  ultimas: "Quedan pocas unidades de verdad. Ponla solo cuando el stock sea realmente bajo.",
  top: "Lo que más se vende. Ponla solo si las cifras de ventas lo respaldan; por ahora se marca a mano.",
  liquidar: "Prendas que se están liquidando.",
  manual: "Hecha a mano en el Taller de Lima. Márcala solo si la prenda salió de allí: no es un adjetivo de marketing.",
  unica: "Un solo ejemplar.",
  reedicion: "Una pieza de archivo que el Taller vuelve a hacer.",
  valentin: "San Valentín, 14 de febrero.",
  galentine: "Galentine’s Day, la fiesta de amigas.",
  madre: "Día de la Madre, segundo domingo de mayo.",
  mujer: "Día de la Mujer, 8 de marzo.",
  halloween: "Halloween, 31 de octubre.",
  navidad: "Navidad, 25 de diciembre.",
  patrias: "Fiestas Patrias, 28 y 29 de julio.",
  blackfriday: "Black Friday: la semana de ofertas de fines de noviembre.",
  cyberwow: "CyberWow: las tres ediciones anuales (abril, julio y noviembre).",
  aniversario: "Aniversario de CAYLA: la celebración de inicios de octubre.",
  gato: "Día Internacional del Gato, 8 de agosto.",
  perro: "Día Internacional del Perro, 26 de agosto.",
  tierra: "Día de la Tierra, 22 de abril.",
};

// El grupo al que pertenece cada concepto (el mismo con que la migración 20260918060000 clasificó las etiquetas sembradas). La
// frase específica solo se usa si la etiqueta ESTÁ en ese grupo: el nombre solo puede parecerse («Nueva colección» no es «Nuevo»).
const GRUPO_DEL_CONCEPTO: Record<IconoEtiqueta, EstiloEtiqueta> = {
  nuevo: "urgencia",
  ultimas: "urgencia",
  top: "urgencia",
  liquidar: "urgencia",
  manual: "positivo",
  unica: "positivo",
  reedicion: "positivo",
  valentin: "campana",
  galentine: "campana",
  madre: "campana",
  mujer: "campana",
  halloween: "campana",
  navidad: "campana",
  patrias: "campana",
  blackfriday: "campana",
  cyberwow: "campana",
  aniversario: "campana",
  gato: "campana",
  perro: "campana",
  tierra: "campana",
};

const QUE_ES_POR_GRUPO: Record<EstiloEtiqueta, string> = {
  urgencia: "Dice cómo está rotando la prenda.",
  positivo: "Dice cómo se hizo la prenda.",
  campana: "Una campaña o festividad.",
  neutral: "Una etiqueta para agrupar y buscar prendas.",
};

export type EtiquetaParaAyuda = {
  nombre: string;
  estilo: string;
  descuentoPct: number | null;
  categoriaIds: readonly string[];
  vigenteDesde: string | null;
  vigenteHasta: string | null;
};

export type AyudaEtiqueta = { queEs: string; datos: string[] };

const pct = (n: number) => n.toLocaleString("es-PE", { maximumFractionDigits: 2 });

/**
 * `cubierta`: la campaña ya rige sola sobre la categoría de esta prenda (no hace falta elegirla). `hoy`: `YYYY-MM-DD` de Lima
 * (`hoyLima()`), para decir si la temporada está vigente o falta poco.
 */
export function ayudaDeEtiqueta(e: EtiquetaParaAyuda, { cubierta, hoy }: { cubierta: boolean; hoy: string }): AyudaEtiqueta {
  const icono = iconoDeEtiqueta(e.nombre);
  const grupo = estiloConocido(e.estilo);
  const queEs = icono && GRUPO_DEL_CONCEPTO[icono] === grupo ? QUE_ES[icono] : QUE_ES_POR_GRUPO[grupo];
  const datos: string[] = [];

  if (e.descuentoPct !== null) {
    datos.push(`Descuenta ${pct(e.descuentoPct)} % en las prendas que la llevan.`);
  }
  // `fechaCorta` ya termina en punto («1 oct.»): no se le suma otro al cerrar la frase.
  const cerrar = (t: string) => (t.endsWith(".") ? t : `${t}.`);
  const vigencia = vigenciaDe(e.vigenteDesde, e.vigenteHasta, hoy);
  // «Ya rige» junto a «Empieza en 44 días» se contradecía: si la temporada aún no empieza, se dice «se aplicará».
  if (cubierta) datos.push(vigencia?.estado === "proxima" ? "Se aplicará sola sobre esta categoría cuando empiece: no hace falta elegirla." : "Ya rige sola sobre esta categoría: no hace falta elegirla.");
  if (vigencia?.estado === "vigente") datos.push(vigencia.hasta ? cerrar(`Vigente hasta el ${fechaCorta(vigencia.hasta)}`) : "Vigente.");
  else if (vigencia?.estado === "proxima") datos.push(vigencia.enDias === 1 ? "Empieza mañana." : cerrar(`Empieza en ${vigencia.enDias} días (${fechaCorta(vigencia.desde)})`));

  return { queEs, datos };
}
