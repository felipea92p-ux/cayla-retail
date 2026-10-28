import type { TonoChip } from "@/components/ui/Chip";
import { clave as claveBusqueda } from "./buscar-prenda-v2";
import type { AccionDecision } from "./frescura-decisiones-reglas";
import { CLASE_TRAMO_PISO, NOMBRE_TRAMO_PISO, PREGUNTA_PISO, TRAMOS_PISO, tramosDeLaPrenda, type RespuestaPiso, type TramoPiso } from "./frescura-piso";
import {
  DIAS_CALLADA,
  RAPIDEZ_IGUAL,
  nivelPorVentas,
  rapidezParaDecidir,
  recientesDe,
  type CifrasSede,
  type Rapidez,
  type FilaConfianza,
  type FrescuraPrenda,
  type NivelConfianza,
  type Sugerencia,
  type Tramo,
  type VaraCategoria,
  VENTAS_PARA_JUZGAR_SOLA,
} from "./frescura-reglas";

// Frescura del piso, paso 4 (ADR-0208): LO QUE DICE LA PANTALLA. `frescura-reglas.ts` ya decidió el estado de cada prenda,
// sus sugerencias y las cifras de la sede; aquí se convierte eso en palabras y en colores, y se decide qué se muestra dónde.
// Lógica pura (sin React ni supabase): la usa la pantalla en el navegador y se prueba en `frescura-pantalla.test.ts`.
//
// DECIDIDO POR FELIPE EN LA MAQUETA (2026-09-28, `docs/maquetas/frescura-3c-2026-09/`):
//   · COLORES A, «semáforo cálido»: Nueva verde → Vigente neutro → Envejecida ámbar → Crítica con contorno de tinta y letra
//     gruesa. NINGÚN rojo en las filas: con 3 críticas en la tienda ya se pasaba del máximo de 2 manchas rojas por
//     pantalla (MAX_ROJO_POR_PANTALLA). El único rojo de la pantalla es la zona Crítica de la regla del detalle.
//   · FRASES C, «con el porqué»: cada sugerencia trae su causa («No se mueve: pruébala 7 días en otro lugar»), la rapidez
//     se dice contra «las demás» y el «al menos» se dice «quizá más».
// Y dos hallazgos de la maqueta, también decididos: con más de la mitad de las prendas sin temporada, UN aviso arriba de
// la tabla (no un chip por fila); y lo que solo está en el almacén no entra a la tabla: se nombra al pie.
//
// Las palabras «tramo», «P50», «percentil», «vara» y «≥» no aparecen nunca en pantalla (lo vigila la prueba).
//
// La categoría se nombra siempre como «las prendas de <categoría>» y la comparación como «las demás»: el género de
// «Camisas y Blusas» o «Pantalones» no se puede deducir del nombre, y «prenda» es femenino siempre.

// ---------------------------------------------------------------------------
// Palabras y colores fijos
// ---------------------------------------------------------------------------

/**
 * Los estados en las palabras de Felipe (ADR-0208, act. 2026-10-10 (b), decisión 6): Fresca · Vigente · Envejeciendo. «Hay que moverla»
 * dejó de ser un estado y es la acción de la fila («Cámbiala de lugar»): Envejecida y Crítica se dicen igual. Antes (Formidable, 2026-10-05):
 * Recién llegada · En su tiempo · Se está quedando · Hay que moverla. UNA sola lista: la fila, el filtro, la regla dibujada, la hoja, las
 * frases y la barra de la tienda (`frescura-piso.ts`) usan estos nombres, y las claves internas (`nueva`, `vigente`…) no cambian.
 */
export const NOMBRE_TRAMO: Record<Tramo, string> = { nueva: "Fresca", vigente: "Vigente", envejecida: "Envejeciendo", critica: "Envejeciendo" };

/** Colores A (Felipe, 2026-09-28): verde · neutro · ámbar, nunca rojo. Envejecida y Crítica, el mismo ámbar: son el mismo estado. */
export const TONO_TRAMO: Record<Tramo, TonoChip> = { nueva: "verde", vigente: "neutro", envejecida: "ambar", critica: "ambar" };

/** El reloj que decidió el estado (act. 2026-10-10 (b)): Fresca, el del modelo; pasada la mitad, el de su unidad más vieja colgada. */
export function relojQueDecide(p: Pick<FrescuraPrenda, "estado" | "reloj" | "relojUnidad">): FrescuraPrenda["reloj"] {
  return p.estado.tipo === "semaforo" && p.estado.tramo !== "nueva" ? p.relojUnidad : p.reloj;
}

/** Lo que dice una prenda juzgada con pocas ventas de las demás (menos de 10): «Aproximado», no «con pocos datos». */
export const APROXIMADO = "aproximado";

/** Lo que dice una prenda juzgada contra la vara de CAYLA (ADR-0208, act. 2026-10-07): su tienda no llegaba a 10 ventas. */
export const CONTRA_CAYLA = "contra lo que vende CAYLA";

/** Frases C: el «al menos» se dice «quizá más», detrás del número o del nombre. */
export const QUIZA_MAS = "quizá más";

/** La frase de la comparación sin la propia prenda (D5): cabecera de la pantalla, detalle y nota. */
export const FRASE_SIN_ELLA =
  "Cada prenda se compara con las demás de su categoría, nunca consigo misma: así la que no se vende no hace parecer normal su propia lentitud.";

/**
 * La frase bajo el título (Formidable, ADR-0350, leyes 1 y 2): la PREGUNTA que resuelve la pantalla y, enseguida, su respuesta de
 * hoy. Desde ADR-0208, act. 2026-10-10 (b), la pregunta es la de Felipe —«¿tu piso está fresco?»— y la responde la barra de la tienda
 * (`respuestaDelPiso`); lo que espera decisión lo dicen la franja y la píldora de la lista, una sola vez. El título sigue siendo el
 * nombre del menú (ADR-0220). Con negritas (`TextoRico`).
 */
export function fraseEncabezado(r: RespuestaPiso | null): TextoRico {
  if (r === null) return PREGUNTA_PISO;
  return `${r.pregunta} **${r.respuesta}**`;
}

/** Qué pueden abrir los botones del detalle: cada uno solo si el rol ve esa pantalla (ADR-0161; ningún botón termina en «Sin acceso»). */
export type AccesoFrescura = { existencias: boolean; historial: boolean; traslados: boolean; conteos: boolean; atributos: boolean };

// ---------------------------------------------------------------------------
// Números y fechas (iguales en el servidor y en el navegador: sin Intl)
// ---------------------------------------------------------------------------

const SEGUNDOS_DIA = 86_400;
const MS_LIMA = 5 * 3_600_000; // Lima va 5 horas detrás de UTC todo el año.
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "set", "oct", "nov", "dic"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "setiembre", "octubre", "noviembre", "diciembre"];

/** Días de un reloj o de una edad, redondeados («lleva 6 días»). */
export function diasDe(segundos: number): number {
  return Math.max(0, Math.round(segundos / SEGUNDOS_DIA));
}

/** Días de un corte de la categoría: nunca 0 («antes de 0 días» no dice nada). */
export function diasDeCorte(segundos: number): number {
  return Math.max(1, Math.round(segundos / SEGUNDOS_DIA));
}

/** «día» o «días»: la prenda colgada ayer lleva «1 día», no «1 días». La única forma de escribirlo en la pantalla. */
export const palabraDias = (n: number): string => (n === 1 ? "día" : "días");
/** «1 día», «18 días». */
export const textoDias = (n: number): string => `${n} ${palabraDias(n)}`;
/** «1 venta», «7 ventas» (con decimal: lo vendido con peso puede no ser entero). */
const textoVentas = (n: number): string => `${decimal(n)} ${n === 1 ? "venta" : "ventas"}`;
/** «se esperaba 1», «se esperaban 4.8». */
const seEsperaban = (esperadas: string): string => (esperadas === "1" ? `se esperaba ${esperadas}` : `se esperaban ${esperadas}`);

/**
 * Un porcentaje entero que no miente en los bordes: 249 de 250 no es «100 %» ni 1 de 250 es «0 %». Se redondea, pero si
 * falta alguna unidad el tope es 99, y si hay alguna el piso es 1.
 */
export function porcentajeEntero(pct: number, parte: number, total: number): number {
  const r = Math.round(pct);
  if (parte < total && r >= 100) return 99;
  if (parte > 0 && r <= 0) return 1;
  return r;
}

/** «4.8»: un decimal con punto, como el resto del ERP en es-PE; sin decimal si es entero. */
export function decimal(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/** «22 set», en hora de Lima. */
export function fechaCorta(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const d = new Date(t - MS_LIMA);
  return `${d.getUTCDate()} ${MESES_CORTOS[d.getUTCMonth()]}`;
}

/** «setiembre», del primer día de un mes (`YYYY-MM-DD`). */
export function nombreMes(mes: string): string {
  const m = Number(mes.slice(5, 7));
  return MESES[m - 1] ?? mes;
}

// ---------------------------------------------------------------------------
// El contexto: lo que la pantalla sabe además de cada prenda
// ---------------------------------------------------------------------------

export type ContextoFrescura = {
  /** El nombre de la sede que se mira («Tienda Trujillo»). */
  sede: string;
  desde: string;
  ahora: string;
  /** La vara de cada categoría en esta sede (con todas sus prendas: la cabecera de cada grupo). */
  categorias: ReadonlyMap<string, VaraCategoria>;
  /** La referencia de CAYLA por categoría (todas las tiendas juntas). Null: quien mira no es líder (no se muestra). */
  cayla: ReadonlyMap<string, VaraCategoria> | null;
  /** Si la referencia de CAYLA no se pudo armar, por qué (solo líder). */
  caylaFallo: string | null;
  /** Cada temporada por su clave, con su nombre y la estación en que empieza (`fn_temporadas`). Vacío si no se pudo leer:
   *  las frases dicen «su estación» y junto al color se muestra la clave. */
  temporadas: NombresDeTemporadas;
  acceso: AccesoFrescura;
};

/** Cada temporada por su clave: su nombre («Clásico · verano») y la CLAVE de la estación en que empieza («verano»; null:
 *  todo el año). La estación de un clásico se nombra con el nombre de la temporada de esa clave («Verano»). */
export type NombresDeTemporadas = Readonly<Record<string, { nombre: string; estacionDesde: string | null }>>;

/** El nombre de la temporada, o null si no se conoce (las frases dicen entonces «su estación»). */
const nombreTemporada = (ctx: ContextoFrescura, clave: string | null): string | null => (clave ? (ctx.temporadas[clave]?.nombre ?? null) : null);
/** Junto al color y en la cabecera de la hoja: el nombre, o la clave si el catálogo no se pudo leer. */
const nombreTemporadaOClave = (ctx: ContextoFrescura, clave: string | null): string | null => (clave ? (ctx.temporadas[clave]?.nombre ?? clave) : null);
/** El nombre de una temporada dentro de una frase: «su otoño-invierno terminó…». */
const minuscula = (s: string) => s.toLowerCase();

/**
 * De qué estación es un clásico, para una frase: «verano» (el NOMBRE de la temporada cuya clave es su `estacionDesde`, en
 * minúsculas), «todo el año» si no tiene estación, o null si el catálogo no se pudo leer. Nunca el nombre de la temporada
 * del clásico: «Es de clásico · verano» no se entiende (corrección del paso 4).
 */
type EstacionClasico = { tipo: "estacion"; nombre: string } | { tipo: "todo_el_ano" } | null;
function estacionDelClasico(ctx: ContextoFrescura, clave: string | null): EstacionClasico {
  const t = clave ? ctx.temporadas[clave] : undefined;
  if (!t) return null;
  if (t.estacionDesde === null) return { tipo: "todo_el_ano" };
  const estacion = ctx.temporadas[t.estacionDesde]?.nombre;
  return estacion ? { tipo: "estacion", nombre: minuscula(estacion) } : null;
}
/** « de verano», « de todo el año» o nada: lo que sigue a «Es un clásico». */
const deClasico = (e: EstacionClasico): string => (e === null ? "" : e.tipo === "todo_el_ano" ? " de todo el año" : ` de ${e.nombre}`);

// ---------------------------------------------------------------------------
// Dónde está cada prenda: la tabla es solo lo que está colgado (o apartado desde el piso)
// ---------------------------------------------------------------------------

/**
 * `en_piso`: algo libre colgado (la tabla). `apartada`: nada libre en el piso y algo apartado EN EL PISO para una clienta
 * después de haberse colgado (la tabla, «en pausa»). `guardada`: se colgó alguna vez y hoy solo está en el almacén, libre
 * o apartado ahí (al pie): Apartar toma del almacén cuando el piso está vacío, y esa prenda no tiene nada colgado ni
 * apartado del piso (corrección del paso 4). `nunca_colgada`: nunca estuvo libre en el piso — solo en el almacén, o
 * apartada al llegar (al pie; la lectura la trae como «Nueva» con 0 días y en la tabla se vería como un error).
 * `agotada`: nada en la sede (al pie, solo el número).
 */
export type Presencia = "en_piso" | "apartada" | "guardada" | "nunca_colgada" | "agotada";

export function presenciaDe(p: Pick<FrescuraPrenda, "pisoHoy" | "almacenHoy" | "apartadasHoy" | "apartadasPisoHoy" | "primeraExhibicion">): Presencia {
  if (p.pisoHoy > 0) return "en_piso";
  if (p.primeraExhibicion === null) return p.almacenHoy > 0 || p.apartadasHoy > 0 ? "nunca_colgada" : "agotada";
  if (p.apartadasPisoHoy > 0) return "apartada";
  if (enElAlmacen(p) > 0) return "guardada";
  return "agotada";
}

/** Lo que hay en el almacén, libre o apartado ahí (lo apartado que no es del piso). */
const enElAlmacen = (p: Pick<FrescuraPrenda, "almacenHoy" | "apartadasHoy" | "apartadasPisoHoy">): number =>
  p.almacenHoy + Math.max(0, p.apartadasHoy - p.apartadasPisoHoy);

export const enLaTabla = (p: FrescuraPrenda) => {
  const donde = presenciaDe(p);
  return donde === "en_piso" || donde === "apartada";
};

// ---------------------------------------------------------------------------
// El estado de una fila (colores A, frases C)
// ---------------------------------------------------------------------------

export type EstadoVista = {
  texto: string;
  tono: TonoChip;
  /** El chip «Sus números no cuadran» lleva un ícono de información (no es un semáforo). */
  icono: boolean;
  /** Las líneas chicas bajo el chip: «aproximado» cuando se juzgó con pocas ventas. */
  debajo: string[];
  /** La línea de la prenda apartada: «iba en Vigente · 3 apartadas». */
  previo: string | null;
};

const TEXTO_ESPECIAL = {
  sin_ventas_sede: "Aún no se sabe",
  sin_vara: "Aún no se sabe",
  sin_edad_conocida: "No se sabe cuándo llegó",
  clasico: "Clásico: no envejece",
  clasico_fuera: "Clásico, espera su estación",
  dudosa: "Su stock no cuadra",
  apartada: "Apartada para clientes",
  vendida_sin_registrar: "Aún no se sabe",
} as const;

export function estadoVista(p: FrescuraPrenda): EstadoVista {
  const e = p.estado;
  if (presenciaDe(p) === "apartada") {
    const iba = e.tipo === "semaforo" ? `iba como «${NOMBRE_TRAMO[e.tramo]}» · ` : "";
    return { texto: TEXTO_ESPECIAL.apartada, tono: "neutro", icono: false, debajo: [], previo: `${iba}${p.apartadasPisoHoy} ${p.apartadasPisoHoy === 1 ? "apartada" : "apartadas"}` };
  }
  if (e.tipo === "semaforo") {
    const debajo: string[] = [];
    // El «quizá más» ya no va aquí: la fila lo dice en su línea de días («Lleva 6 días o más», `llevaTexto`).
    // «Aproximado» (antes «con pocos datos») se mide con las ventas de las demás SIN ella, las mismas que ubicaron su estado
    // (D5): una categoría sólida hecha casi toda de sus propias ventas la compara contra muy poco (corrección del paso 4).
    if (nivelSinElla(p) === "pocos_datos") debajo.push(APROXIMADO);
    // Juzgada contra la vara de CAYLA (ADR-0208, act. 2026-10-07): la fila lo dice, siempre (decisión 2 de Felipe).
    if (p.juzgadaContra === "cayla") debajo.push(CONTRA_CAYLA);
    return { texto: NOMBRE_TRAMO[e.tramo], tono: TONO_TRAMO[e.tramo], icono: false, debajo, previo: null };
  }
  if (e.tipo === "clasico") return { texto: e.fueraDeSuEstacion ? TEXTO_ESPECIAL.clasico_fuera : TEXTO_ESPECIAL.clasico, tono: "pizarra", icono: false, debajo: [], previo: null };
  if (e.tipo === "dudosa") return { texto: TEXTO_ESPECIAL.dudosa, tono: "apagado", icono: true, debajo: [], previo: null };
  return { texto: TEXTO_ESPECIAL[e.tipo], tono: "pizarra", icono: false, debajo: [], previo: null };
}

/** Cuánto creerle a la comparación de una prenda: por las ventas de las demás de su categoría SIN ella (D5). Null si no
 *  se compara (clásico, que no cuadra) o si las demás no vendieron nada. */
function nivelSinElla(p: FrescuraPrenda): NivelConfianza | null {
  return p.categoriaSinElla ? nivelPorVentas(p.categoriaSinElla.vendidas) : null;
}

/** El nombre de un estado «al menos» como se dice en una frase: «Vigente, o más»; Envejeciendo es el último, solo. */
export function nombreAlMenos(tramo: Tramo): string {
  return tramo === "critica" || tramo === "envejecida" ? NOMBRE_TRAMO[tramo] : `${NOMBRE_TRAMO[tramo]}, o más`;
}

// ---------------------------------------------------------------------------
// La rapidez: UNA escala para la fila y el detalle (maqueta, «Una sola escala de rapidez»)
// ---------------------------------------------------------------------------

/**
 * El corte es el de `esPilar` (100 = como las demás de su categoría con los mismos días colgada): 120 o más «más rápida»,
 * 100 a 119 «como las demás», 60 a 99 «más lenta», menos de 60 «mucho más lenta»; con 100 o más y sus últimos 30 días en
 * el piso sin vender, «dejó de venderse» (`recientesDe`, la misma definición que usa `estaQuieta`). Con la categoría «aún
 * sin referencia», la fila no dice si es rápida: el índice sale de muy pocas ventas del resto y chocaba con el estado.
 */
export type ClaveRapidez = "sin_dato" | "sin_medida" | "poca_evidencia" | "dejo" | "rapida" | "ritmo" | "lenta" | "muy_lenta";

/**
 * La rapidez que DECIDE (`rapidezParaDecidir`, act. 2026-10-07): la misma, o null cuando dice «lenta» con menos de 2 ventas
 * esperadas. La pantalla la mira antes de decir «más lenta que las demás»: si el índice no alcanza para decidir, tampoco alcanza
 * para afirmarlo en la fila (y «revisa sus ventas» al lado no se contradice).
 */
export function rapidezQueDecide(p: FrescuraPrenda): Rapidez | null {
  return rapidezParaDecidir(p.rapidez, recientesDe(p.ventasRecientes, p.reloj.segundos));
}

export function claveRapidez(p: FrescuraPrenda): ClaveRapidez {
  const r = p.rapidez;
  if (p.estado.tipo === "clasico" || p.estado.tipo === "dudosa" || p.estado.tipo === "vendida_sin_registrar") return "sin_dato";
  if (!r) return "sin_dato";
  if (p.estado.tipo === "sin_vara") return "sin_medida";
  if (rapidezQueDecide(p) === null) return "poca_evidencia";
  if (r.indice >= RAPIDEZ_IGUAL && recientesDe(p.ventasRecientes, p.reloj.segundos) === "dejo_de_vender") return "dejo";
  if (r.indice >= 120) return "rapida";
  if (r.indice >= RAPIDEZ_IGUAL) return "ritmo";
  if (r.indice >= 60) return "lenta";
  return "muy_lenta";
}

export type RapidezVista = {
  texto: string;
  detalle: string | null;
  /** Por qué no hay dato, en una línea. */
  porque: string | null;
  /** Cuánto creerle (las ventas de las demás contra las que se midió): «Pocos datos», «Aceptable»; sólida no lleva nada. */
  nivel: NivelConfianza | null;
};

function porqueSinDato(p: FrescuraPrenda): string {
  if (p.estado.tipo === "clasico") return "los clásicos no se miden";
  if (p.estado.tipo === "dudosa") return "no se mide mientras no cuadre";
  if (p.estado.tipo === "sin_ventas_sede") return "su categoría no tiene ventas aquí con qué compararla";
  if (p.reloj.alMenos) return "no se sabe cuándo llegó lo que vendió";
  return "todavía no alcanza para compararla";
}

const COMO: Record<"rapida" | "ritmo" | "lenta" | "muy_lenta", string> = {
  rapida: "Más rápida que las demás",
  ritmo: "Como las demás",
  lenta: "Más lenta que las demás",
  muy_lenta: "Mucho más lenta que las demás",
};

export function rapidezVista(p: FrescuraPrenda): RapidezVista {
  const k = claveRapidez(p);
  const r = p.rapidez;
  if (k === "sin_dato" || !r) return { texto: "Sin dato", detalle: null, porque: porqueSinDato(p), nivel: null };
  const nivel = nivelPorVentas(r.referencia);
  if (k === "sin_medida") return { texto: `Vendió ${decimal(r.vendidas)}; las demás, solo ${decimal(r.referencia)}`, detalle: null, porque: null, nivel };
  if (k === "poca_evidencia") return { texto: "Todavía no alcanza para decir si es lenta", detalle: `vendió ${decimal(r.vendidas)}, ${seEsperaban(decimal(r.esperadas))}`, porque: null, nivel };
  if (k === "dejo") return { texto: "Vendió bien al llegar; hoy no se vende", detalle: "30 días en el piso sin vender", porque: null, nivel };
  return { texto: COMO[k], detalle: `vendió ${decimal(r.vendidas)}, ${seEsperaban(decimal(r.esperadas))}`, porque: null, nivel };
}

// ---------------------------------------------------------------------------
// Las sugerencias con su causa (frases C)
// ---------------------------------------------------------------------------

/** Sin un estado firme (sin comparación, sin referencia, edad desconocida o un estado que es solo un piso). */
function sinTramoFirme(p: FrescuraPrenda): boolean {
  const e = p.estado;
  return e.tipo === "sin_ventas_sede" || e.tipo === "sin_vara" || e.tipo === "sin_edad_conocida" || e.tipo === "vendida_sin_registrar" || (e.tipo === "semaforo" && e.alMenos);
}

/** «Callada»: sin estado firme y sus últimos 30 días en el piso sin vender (D4+D6). Es lo que pide «revisa sus ventas». */
export function estaCallada(p: FrescuraPrenda): boolean {
  return sinTramoFirme(p) && p.pisoHoy > 0 && recientesDe(p.ventasRecientes, p.reloj.segundos) === "dejo_de_vender";
}

/** Por qué se sugiere cambiarla de lugar: su temporada pasó, dejó de venderse, o es vieja y lenta. */
export function causaCambiarLugar(p: FrescuraPrenda): "temporada" | "dejo" | "vieja_lenta" {
  if (p.estado.temporadaPasada) return "temporada";
  if (claveRapidez(p) === "dejo") return "dejo";
  return "vieja_lenta";
}

export function textoSugerencia(s: Sugerencia, p: FrescuraPrenda, ctx: ContextoFrescura): string {
  switch (s) {
    case "revisar_ventas":
      return estaCallada(p)
        ? `${DIAS_CALLADA} días sin vender: mira qué le pasa`
        : claveRapidez(p) === "poca_evidencia"
          ? "Parece lenta, pero hay pocas ventas para decirlo: mira sus ventas"
          : "No se sabe qué tan rápido se vende: mira sus ventas";
    case "cambiar_lugar":
      return {
        temporada: "Pasó su estación: pruébala 7 días en otro lugar",
        dejo: "Ya no se vende: pruébala 7 días en otro lugar",
        vieja_lenta: "No se mueve: pruébala 7 días en otro lugar",
      }[causaCambiarLugar(p)];
    case "trasladar":
      return `Hay ${p.almacenHoy} en el almacén: ¿otra sede la vende antes?`;
    case "retirar":
      return "Ya pasó su temporada: ¿la sacas del piso?";
    case "sigue_vendiendo":
      return "Pasó su temporada y se sigue vendiendo: ¿hasta agotar o la sacas?";
    case "guardar_hasta_su_estacion": {
      const e = estacionDelClasico(ctx, p.temporada);
      return e?.tipo === "estacion" ? `Es de ${e.nombre}: ¿la guardas hasta su estación?` : "¿La guardas hasta su estación?";
    }
    // Las dos salen del RESULTADO de lo que ya se decidió (paso 4b, `sugerenciasConHistoria`).
    case "dejar_hasta_agotar":
      return "Se vendió mejor en su lugar nuevo: ¿la dejas ahí hasta agotar?";
    case "rebaja_chica":
      return `Cambiarla de lugar no alcanzó. Lo que sigue es una rebaja chica solo en ${ctx.sede}, que decide el líder`;
  }
}

// ---------------------------------------------------------------------------
// La temporada de una fila
// ---------------------------------------------------------------------------

/** «su invierno terminó el 22 set · llegó a CAYLA el 14 may» (D1: cuenta desde que llegó a CAYLA, no a esta tienda). */
export function textoTemporadaPasada(p: FrescuraPrenda, ctx: ContextoFrescura): string {
  const t = nombreTemporada(ctx, p.temporada);
  const estacion = t ? `su ${minuscula(t)}` : "su estación";
  return `${estacion} terminó el ${fechaCorta(p.finEstacion)} · llegó a CAYLA el ${fechaCorta(p.ultimaLlegadaCayla)}`;
}

// ---------------------------------------------------------------------------
// Una fila de la tabla
// ---------------------------------------------------------------------------

export type TallaVista = { varianteId: string; talla: string; piso: number; almacen: number; apartadas: number };

export type FilaVista = {
  clave: string;
  nombre: string;
  color: string | null;
  codigo: string | null;
  categoriaId: string;
  /** La temporada, si tiene y no pasó (va junto al color). */
  temporada: string | null;
  /** «Temporada pasada» con su porqué, o null. */
  temporadaPasada: string | null;
  sinTemporada: boolean;
  tallas: TallaVista[];
  /** Días en el piso (el reloj de novedad); null para la que no cuadra. */
  dias: number | null;
  /** La línea de días de la fila: «Lleva 6 días» / «Lleva 6 días o más»; null para la que no cuadra; la apartada dice que está en pausa. */
  llevaTexto: string | null;
  /** «quizá más»: no se sabe desde cuándo está (llegó sin fecha, o se colgó antes de lo que mira la lectura). */
  quizaMas: boolean;
  /** Toda apartada: su reloj está en pausa. */
  apartada: boolean;
  estado: EstadoVista;
  rapidez: RapidezVista;
  /** Vendidas en sus últimos 30 días en el piso (lo apartado cuenta como vendido); null si no se mide. */
  vendio: number | null;
  /** Lo mismo en una frase, con el lapso de verdad («vendió 0 en sus 1 día…» no: «en sus 12 días en el piso» o «en sus
   *  últimos 30 días en el piso»): la tarjeta del celular lo dice bajo la rapidez. */
  vendioTexto: string | null;
  sugerencias: { clave: Sugerencia; texto: string }[];
  /** Lo que dice «Qué hacer» sin sugerencias. */
  nada: string;
  /** «Por decidir»: quieta y sin decisión vigente (`FrescuraPrenda.porDecidir`). */
  porDecidir: boolean;
};

/** «Lleva 6 días» (con «o más» si no se sabe desde cuándo está); la apartada, «En pausa: está apartada»; la que no cuadra, nada. */
export function llevaTexto(p: Pick<FrescuraPrenda, "estado" | "reloj" | "relojUnidad">, apartada: boolean): string | null {
  if (p.estado.tipo === "dudosa") return null;
  if (apartada) return "En pausa: está apartada";
  // Los días del reloj que decidió el estado: lo que cuelga, si ya no es Fresca (un éxito repuesto ayer «lleva 1 día», no los 40 de su modelo).
  const r = relojQueDecide(p);
  return `Lleva ${textoDias(diasDe(r.segundos))}${r.alMenos ? " o más" : ""}`;
}

export function filaVista(p: FrescuraPrenda, ctx: ContextoFrescura): FilaVista {
  const apartada = presenciaDe(p) === "apartada";
  const dudosa = p.estado.tipo === "dudosa";
  const temporada = nombreTemporadaOClave(ctx, p.temporada);
  return {
    clave: p.clave,
    nombre: p.productoNombre,
    color: p.colorNombre,
    codigo: p.codigo,
    categoriaId: p.categoriaId,
    temporada: p.estado.temporadaPasada ? null : temporada,
    temporadaPasada: p.estado.temporadaPasada ? textoTemporadaPasada(p, ctx) : null,
    sinTemporada: p.estado.sinTemporada,
    tallas: p.tallas.map((t) => ({ varianteId: t.varianteId, talla: t.talla ?? "Única", piso: t.pisoHoy, almacen: t.almacenHoy, apartadas: t.apartadasHoy })),
    dias: dudosa ? null : diasDe(relojQueDecide(p).segundos),
    llevaTexto: llevaTexto(p, apartada),
    quizaMas: !dudosa && p.reloj.alMenos,
    apartada,
    estado: estadoVista(p),
    rapidez: rapidezVista(p),
    vendio: dudosa ? null : p.ventasRecientes,
    vendioTexto: dudosa ? null : `vendió ${decimal(p.ventasRecientes)} ${cuandoRecientes(p)}`,
    sugerencias: p.estado.sugerencias.map((s) => ({ clave: s, texto: textoSugerencia(s, p, ctx) })),
    nada: apartada ? "Nada: tiene dueño" : dudosa ? "Revisa su stock primero" : "Déjala así",
    porDecidir: p.porDecidir,
  };
}

// ---------------------------------------------------------------------------
// Los filtros (viven en la URL)
// ---------------------------------------------------------------------------

export const FILTROS_ESTADO = [
  { valor: "todos", texto: "Todos los estados" },
  { valor: "nueva", texto: NOMBRE_TRAMO.nueva, grupo: "Cuánto lleva" },
  { valor: "vigente", texto: NOMBRE_TRAMO.vigente, grupo: "Cuánto lleva" },
  // Envejecida y Crítica son un solo estado (act. 2026-10-10 (b)); un enlace viejo con `?estado=envejecida` o `critica` cae aquí.
  { valor: "envejeciendo", texto: NOMBRE_TRAMO.envejecida, grupo: "Cuánto lleva" },
  { valor: "sin_comparar", texto: "Aún no se sabe", grupo: "Otros" },
  { valor: "clasico", texto: "Clásicos", grupo: "Otros" },
  { valor: "dudosa", texto: "Su stock no cuadra", grupo: "Otros" },
  { valor: "apartada", texto: "Apartadas", grupo: "Otros" },
  { valor: "temporada_pasada", texto: "Temporada pasada", grupo: "Temporada" },
  { valor: "sin_temporada", texto: "Sin temporada", grupo: "Temporada" },
] as const;
export type FiltroEstado = (typeof FILTROS_ESTADO)[number]["valor"];
const ES_FILTRO_ESTADO = new Set<string>(FILTROS_ESTADO.map((f) => f.valor));

export const TODAS_LAS_CATEGORIAS = "todas";

/** `todas`: la persona pidió ver todas las prendas aunque haya algo por decidir (sin eso, lo por decidir va primero). No es un filtro. */
export type Filtros = { cat: string; estado: FiltroEstado; porDecidir: boolean; decididas: boolean; q: string; todas: boolean };
export const SIN_FILTROS: Filtros = { cat: TODAS_LAS_CATEGORIAS, estado: "todos", porDecidir: false, decididas: false, q: "", todas: false };

/**
 * Los filtros de la URL (`?cat=`, `?estado=`, `?pordecidir=1`, `?q=`). Lo que no se entiende se ignora. `cat=` vacío es
 * «Sin categoría» (su id es "", el de `analizarSede`), no «todas». Una categoría que ya no está en la tabla la descarta
 * el panel, que conoce las opciones.
 */
export function filtrosDeUrl(leer: (clave: string) => string | null | undefined): Filtros {
  const estado = leer("estado");
  return {
    cat: leer("cat") ?? TODAS_LAS_CATEGORIAS,
    estado: estado === "envejecida" || estado === "critica" ? "envejeciendo" : estado && ES_FILTRO_ESTADO.has(estado) ? (estado as FiltroEstado) : "todos",
    porDecidir: leer("pordecidir") === "1",
    decididas: leer("decididas") === "1",
    q: (leer("q") ?? "").slice(0, 80),
    todas: leer("todas") === "1",
  };
}

/** La consulta de la URL con estos filtros y la prenda abierta (sin lo que está en su valor de siempre). */
export function consultaDe(f: Filtros, prenda: string | null): string {
  const q = new URLSearchParams();
  if (f.cat !== TODAS_LAS_CATEGORIAS) q.set("cat", f.cat);
  if (f.estado !== "todos") q.set("estado", f.estado);
  if (f.porDecidir) q.set("pordecidir", "1");
  if (f.decididas) q.set("decididas", "1");
  if (f.q.trim()) q.set("q", f.q.trim());
  if (f.todas) q.set("todas", "1");
  if (prenda) q.set("prenda", prenda);
  return q.toString();
}

export const hayFiltros = (f: Filtros) => f.cat !== TODAS_LAS_CATEGORIAS || f.estado !== "todos" || f.porDecidir || f.decididas || f.q.trim() !== "";

/**
 * La vista con que se abre la pantalla (Formidable, ley 2): si hay algo por decidir y la persona no pidió otra cosa, **primero
 * lo que le toca**, y el resto queda a un toque en «Ver todas». Con cualquier filtro puesto (o con `todas`) se ve lo que pidió.
 * Nada se esconde para siempre: es el mismo «Por decidir», puesto de entrada.
 */
export function vistaDeEntrada(f: Filtros, porDecidir: number): { primeroLoDecidible: boolean; efectivos: Filtros } {
  const primeroLoDecidible = porDecidir > 0 && !f.todas && !hayFiltros(f);
  return { primeroLoDecidible, efectivos: primeroLoDecidible ? { ...f, porDecidir: true } : f };
}

/** ¿La prenda entra en este estado del filtro? «Temporada» se cruza con los de arriba (una prenda puede estar en los dos). */
export function pasaEstado(p: FrescuraPrenda, estado: FiltroEstado): boolean {
  const e = p.estado;
  const apartada = presenciaDe(p) === "apartada";
  switch (estado) {
    case "todos":
      return true;
    case "apartada":
      return apartada;
    case "temporada_pasada":
      return e.temporadaPasada;
    case "sin_temporada":
      return e.sinTemporada;
    case "clasico":
      return e.tipo === "clasico";
    case "dudosa":
      return e.tipo === "dudosa";
    case "sin_comparar":
      return e.tipo === "sin_ventas_sede" || e.tipo === "sin_vara" || e.tipo === "sin_edad_conocida" || e.tipo === "vendida_sin_registrar";
    case "envejeciendo":
      return e.tipo === "semaforo" && !apartada && (e.tramo === "envejecida" || e.tramo === "critica");
    default:
      return e.tipo === "semaforo" && !apartada && e.tramo === estado;
  }
}

export function pasaFiltros(p: FrescuraPrenda, f: Filtros): boolean {
  if (f.cat !== TODAS_LAS_CATEGORIAS && p.categoriaId !== f.cat) return false;
  if (!pasaEstado(p, f.estado)) return false;
  if (f.porDecidir && !p.porDecidir) return false;
  if (f.decididas && !(p.decision?.vigente ?? false)) return false;
  const q = claveBusqueda(f.q);
  if (q && !claveBusqueda(`${p.productoNombre} ${p.colorNombre ?? ""} ${p.codigo ?? ""}`).includes(q)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// La cabecera de cada categoría
// ---------------------------------------------------------------------------

export type GrupoVista = {
  categoriaId: string;
  nombre: string;
  /** La frase de la comparación en palabras de tienda. */
  comparacion: string;
  nivel: NivelConfianza | null;
  /** «con 37 ventas de los últimos 60 días». Sin escala propia: la escala de cada prenda vive en su hoja, con la vara que la juzgó
   *  (Formidable 2026-10-10 (c): la ayuda dibujaba otra y la encargada vio dos escalas para la misma categoría). */
  base: string | null;
  /** La vara del mes contra la de hoy (act. 2026-10-10 (b) y (c)): «antes 9 días, ahora 15», o que todavía aprende su ritmo. */
  mes: string | null;
  /** La referencia de CAYLA (solo el líder: null para los demás, que no la ven). */
  cayla: string | null;
  /** Si sus prendas se juzgan contra la vara de CAYLA, y si no, por qué (act. 2026-10-07). Null sin vara de CAYLA para ella. */
  respaldo: string | null;
};

function textoComparacion(v: Omit<VaraCategoria, "respaldo" | "delMes"> | undefined, nombre: string, sede: string): string {
  const deCategoria = `las prendas de ${nombre}`;
  if (!v || v.vendidas <= 0) return `Todavía no se vendió ninguna prenda de ${nombre} en ${sede} con fecha de llegada conocida: no hay con qué comparar.`;
  const { p50, p75, p90 } = v.cortes;
  const tMax = diasDeCorte(v.tMax);
  // Hacia abajo: sin la mitad, lo vendido es menos de 0.5, y redondear podía decir «5 de cada 10» junto a «todavía no se
  // sabe cuánto tarda la mitad» (y «9 de cada 10» sin llegar a 9). La tolerancia evita que 1 − 0.9 = 0.0999… diga 0.
  const deCadaDiez = Math.floor(v.vendidoAlFinal * 10 + 1e-9);
  const alFinal = deCadaDiez > 0 ? `${deCadaDiez} de cada 10` : "menos de 1 de cada 10";
  if (p50 === null) return `A los ${tMax} días ya se vendieron ${alFinal} de ${deCategoria} en ${sede}: todavía no se sabe cuánto tarda la mitad.`;
  let t = `A los ${diasDeCorte(p50)} días ya se vendió la mitad de ${deCategoria} en ${sede}`;
  if (p75 !== null) t += `; a los ${diasDeCorte(p75)}, 3 de cada 4`;
  t += p90 !== null ? `; a los ${diasDeCorte(p90)}, casi todas.` : `; a los ${tMax}, ${alFinal}; más allá todavía no se sabe.`;
  return t;
}

/** La referencia de CAYLA de una categoría, sin punto final (quien la usa arma la frase). */
export function textoCayla(v: VaraCategoria | undefined): string {
  if (!v || v.cortes.p50 === null) return "todavía no alcanza (las tiendas juntas no tienen ventas suficientes con fecha de llegada)";
  const d75 = v.cortes.p75 === null ? "" : `, 3 de cada 4 antes de ${diasDeCorte(v.cortes.p75)}`;
  return `todas las tiendas juntas, la mitad se vende antes de ${diasDeCorte(v.cortes.p50)} días${d75}`;
}

/** La vara que JUZGÓ a la categoría, con la forma de una vara (la del mes, la de CAYLA o la de hoy; la regla de `varaQueJuzgo`). */
export function juzgadoraDe(v: VaraCategoria | undefined): (Omit<VaraCategoria, "respaldo" | "delMes"> & { cual: "mes" | "cayla" | "hoy" }) | undefined {
  if (!v) return undefined;
  if (v.delMes?.enUso) return { ...v.delMes, cual: "mes" };
  if (v.respaldo?.enUso) return { ...v.respaldo, cual: "cayla" };
  return { ...v, cual: "hoy" };
}

/**
 * La vara del mes dicha una vez por categoría: si juzgó, cuánto tardaba la mitad el día 1 y cuánto con lo de hoy (si cambió en 2 días o más:
 * «se puso más lenta» o «más rápida»); si todavía no llega a sus ventas, que aprende su ritmo y este mes se juzga con lo de hoy.
 */
function textoMes(v: VaraCategoria | undefined): string | null {
  const m = v?.delMes;
  if (!v || !m) return null;
  // Contra CAYLA lo dice su línea (`textoRespaldo`); decirlo dos veces se contradecía (revisión adversaria).
  if (juzgadoraDe(v)?.cual === "cayla") return null;
  if (!m.enUso) return m.vendidas > 0 || v.vendidas > 0 ? "Todavía aprende su ritmo: este mes se juzga con lo vendido hasta hoy." : null;
  const antes = m.cortes.p50 === null ? null : diasDeCorte(m.cortes.p50);
  const ahora = v.cortes.p50 === null ? null : diasDeCorte(v.cortes.p50);
  const base = `Su vara de este mes quedó fija el día 1${antes !== null ? `: la mitad se vendía antes de ${antes} días` : ""}`;
  if (antes === null || ahora === null || Math.abs(ahora - antes) < 2) return `${base}.`;
  return `${base}; con lo de hoy, antes de ${ahora} (${ahora > antes ? "se puso más lenta" : "se puso más rápida"}).`;
}

export function grupoVista(categoriaId: string, nombre: string, ctx: ContextoFrescura): GrupoVista {
  const v = ctx.categorias.get(categoriaId);
  // La comparación se dice con la vara que JUZGÓ (la del mes, la de CAYLA o la de hoy): la misma de las prendas.
  const juzgo = juzgadoraDe(v);
  const deCayla = juzgo?.cual === "cayla";
  // La vara del mes cuenta los días ANTES del día 1, no «los últimos» (revisión adversaria: el 25 del mes era falso por 24 días).
  const cuando = juzgo?.cual === "mes" ? `de los ${juzgo.ventanaDias} días antes del día 1` : `de los últimos ${juzgo?.ventanaDias ?? 0} días`;
  return {
    categoriaId,
    nombre,
    comparacion: textoComparacion(juzgo, nombre, deCayla ? "las tres tiendas juntas" : ctx.sede),
    nivel: juzgo?.nivel ?? null,
    base: juzgo && juzgo.vendidas > 0 ? `con ${textoVentas(juzgo.vendidas)} ${cuando}` : null,
    mes: textoMes(v),
    cayla: ctx.cayla === null ? null : (ctx.caylaFallo ?? `${textoCayla(ctx.cayla.get(categoriaId))}.`),
    respaldo: textoRespaldo(v),
  };
}

/** Las filas de la tabla agrupadas por categoría, en el orden de la lectura (categoría y, dentro, lo que más lleva primero). */
export function agrupar<T extends { categoriaId: string; categoriaNombre: string }>(prendas: readonly T[]): { categoriaId: string; nombre: string; prendas: T[] }[] {
  const grupos = new Map<string, { categoriaId: string; nombre: string; prendas: T[] }>();
  for (const p of prendas) {
    const g = grupos.get(p.categoriaId) ?? { categoriaId: p.categoriaId, nombre: p.categoriaNombre, prendas: [] };
    g.prendas.push(p);
    grupos.set(p.categoriaId, g);
  }
  return [...grupos.values()];
}

// ---------------------------------------------------------------------------
// La sede entera: cifras, avisos y el pie
// ---------------------------------------------------------------------------

/** ¿Esta prenda se juzgó con pocas ventas? Estado con comparación débil (menos de 10 ventas de las demás) o sin comparación todavía. */
export const esAproximada = (p: FrescuraPrenda): boolean => (p.estado.tipo === "semaforo" && nivelSinElla(p) === "pocos_datos") || p.estado.tipo === "sin_ventas_sede" || p.estado.tipo === "sin_vara";

/**
 * ¿La mayoría de lo que se ve se juzgó con pocas ventas? Entonces lo aproximado es la regla y se dice UNA vez, en la tarjeta de la tienda
 * (no en cada fila): la excepción se marca, la regla se dice (Formidable, ADR-0350, ley 9). Antes lo decía un aviso propio que prometía
 * «en unas semanas se afina», y cuando la causa era no registrar lo que se vende, esperar no lo arreglaba (Formidable 2026-10-10 (c): sale;
 * lo que falta para hablar lo dice el aviso de la puerta, con su botón).
 */
export function mayoriaAproximada(prendas: readonly FrescuraPrenda[]): boolean {
  return prendas.length > 0 && prendas.filter(esAproximada).length * 2 > prendas.length;
}

/**
 * Las prendas de la tabla sin temporada, dichas UNA vez dentro de «¿Cómo se lee esto?» (act. 2026-10-07; antes, un cartel sobre la
 * tabla y un chip por fila). Es una tarea de Catálogo, no de Frescura: aquí solo se cuenta y se enlaza. Null si todas la tienen.
 */
export function textoSinTemporada(prendas: readonly FrescuraPrenda[]): string | null {
  const n = prendas.filter((p) => p.estado.sinTemporada).length;
  if (n === 0) return null;
  // El sujeto es «n» («1 de 4 prendas no tiene»), no el total.
  return `${n} de ${prendas.length} ${prendas.length === 1 ? "prenda" : "prendas"} no ${n === 1 ? "tiene" : "tienen"} temporada: se miden igual, pero nunca van a avisar que pasó su estación.`;
}

/** De cuándo es la vara de CAYLA que respalda (o por qué no hay), para «¿Cómo se lee esto?». */
export function textoRespaldoCayla(estado: { calculadaEn: string | null; fallo: string | null }): string {
  if (estado.fallo) return estado.fallo;
  if (estado.calculadaEn === null) return "Todavía no hay una vara de CAYLA calculada: cada categoría se juzga con lo vendido en esta tienda.";
  return `La vara de CAYLA es del ${fechaCorta(estado.calculadaEn)}: se calcula cada madrugada con las tres tiendas juntas y respalda a las categorías que aquí no llegan a ${VENTAS_PARA_JUZGAR_SOLA} ventas.`;
}

/** Por categoría: si sus prendas se juzgan contra CAYLA, y si no, por qué. Null sin vara de CAYLA para ella. */
export function textoRespaldo(v: VaraCategoria | undefined): string | null {
  const r = v?.respaldo;
  if (!v || !r) return null;
  const aqui = v.vendidas > 0 ? textoVentas(v.vendidas) : "ninguna venta todavía";
  if (r.enUso) return `Se juzga contra lo que vende CAYLA: ${textoVentas(r.vendidas)} de los últimos ${r.ventanaDias} días en las tres tiendas; aquí, ${aqui}.`;
  if (r.vendidas < VENTAS_PARA_JUZGAR_SOLA)
    return v.vendidas > 0
      ? `La vara de CAYLA tampoco alcanza (${textoVentas(r.vendidas)}): se juzga con lo de aquí, que es aproximado.`
      : // Sin ventas aquí ni bastantes en CAYLA no hay con qué juzgar (la ciega: «¿con qué se juzga si no hay nada?», Formidable 2026-10-10 (c)).
        "Ni aquí ni en CAYLA hay ventas suficientes todavía: por ahora sus prendas no se juzgan («Aún no se sabe»).";
  // Pocas ventas aquí y CAYLA alcanza, pero nada se juzgó contra ella: la categoría no tiene prendas que medir.
  if (v.vendidas < VENTAS_PARA_JUZGAR_SOLA) return `Aquí no hay prendas que medir (clásicos, o prendas que no cuadran): la vara de CAYLA (${textoVentas(r.vendidas)}) queda de apoyo.`;
  return `Aquí ya hay ${textoVentas(v.vendidas)}: se juzga sola; la vara de CAYLA (${textoVentas(r.vendidas)}) queda de apoyo.`;
}

export type CifrasVista = {
  edad: number | null;
  edadQuizaMas: boolean;
  pctNuevas: number | null;
  nuevas: number;
  conTramo: number;
  porDecidir: number;
  /** Prendas con una decisión vigente (paso 4b): «3 ya decididas, en prueba». */
  decididas: number;
  unidades: number;
};

export function cifrasVista(c: CifrasSede): CifrasVista {
  return {
    edad: c.edadDelPisoDias === null ? null : Math.round(c.edadDelPisoDias),
    edadQuizaMas: c.edadDelPisoAlMenos,
    pctNuevas: c.pctNuevas === null ? null : porcentajeEntero(c.pctNuevas, c.unidadesNuevas, c.unidadesConTramo),
    nuevas: c.unidadesNuevas,
    conTramo: c.unidadesConTramo,
    porDecidir: c.porDecidir,
    decididas: c.decididas,
    unidades: c.unidadesEnPiso,
  };
}

export type PieVista = {
  guardadas: string[];
  nuncaColgadas: string[];
  agotadas: number;
};

const nombreConColor = (p: FrescuraPrenda) => `${p.productoNombre}${p.colorNombre ? ` ${p.colorNombre}` : ""}`;

/** Lo que no entra a la tabla, dicho al pie: guardado después de colgarse (con el estado en que iba), nunca colgado, agotado. */
export function pieVista(prendas: readonly FrescuraPrenda[]): PieVista {
  const pie: PieVista = { guardadas: [], nuncaColgadas: [], agotadas: 0 };
  for (const p of prendas) {
    const donde = presenciaDe(p);
    if (donde === "guardada") {
      const iba = p.estado.tipo === "semaforo" ? `, iba como «${NOMBRE_TRAMO[p.estado.tramo]}»` : "";
      // Lo apartado en el almacén también está guardado: se cuenta y se dice.
      const apartadas = Math.max(0, p.apartadasHoy - p.apartadasPisoHoy);
      pie.guardadas.push(`${nombreConColor(p)} (${enElAlmacen(p)}${apartadas > 0 ? `, ${apartadas} ${apartadas === 1 ? "apartada" : "apartadas"}` : ""})${iba}`);
    } else if (donde === "nunca_colgada") pie.nuncaColgadas.push(`${nombreConColor(p)} (${p.almacenHoy + p.apartadasHoy})`);
    else if (donde === "agotada") pie.agotadas++;
  }
  return pie;
}

/** «1 unidad», «45 unidades». */
export const textoUnidades = (n: number): string => `${n} ${n === 1 ? "unidad" : "unidades"}`;

/**
 * El pie en cifras, no en nombres (Formidable 2026-10-09, ley 8: 12 prendas del almacén en 6 renglones eran contabilidad dentro de
 * la pantalla de decidir). La lista con cada nombre sigue existiendo, plegada a un toque («Ver cuáles»): el dato no se pierde.
 */
export function resumenPie(pie: PieVista): { guardadas: string | null; nuncaColgadas: string | null; agotadas: string | null } {
  const g = pie.guardadas.length;
  const n = pie.nuncaColgadas.length;
  const a = pie.agotadas;
  return {
    guardadas:
      g === 0
        ? null
        : g === 1
          ? "1 prenda guardada en el almacén después de colgarse: no cuenta días mientras esté guardada."
          : `${g} prendas guardadas en el almacén después de colgarse: no cuentan días mientras estén guardadas.`,
    nuncaColgadas:
      n === 0
        ? null
        : n === 1
          ? "1 prenda solo en el almacén, nunca colgada: no se mide hasta que se cuelgue."
          : `${n} prendas solo en el almacén, nunca colgadas: no se miden hasta que se cuelguen.`,
    agotadas: a === 0 ? null : `${a} ${a === 1 ? "prenda se agotó" : "prendas se agotaron"} en lo que mira esta pantalla: ya no ${a === 1 ? "está" : "están"} en la tienda.`,
  };
}

/** Con «Por decidir» filtrado: cuántas otras tienen una pregunta más chica en «Qué hacer», en singular o plural. */
export function textoOtrasConPregunta(n: number): TextoRico {
  return n === 1
    ? "**Otra** tiene una pregunta en «Qué hacer» sin estar por decidir."
    : `**Otras ${n}** tienen una pregunta en «Qué hacer» sin estar por decidir.`;
}

/** El registro al colgar de la sede, este mes (solo el líder lo ve en el paso 4; ADR-0208, decisión 2 del 2026-09-27). */
export function textoRegistro(filas: readonly FilaConfianza[], ubicacionId: string): { texto: string; nivel: NivelConfianza | null } | null {
  const deSede = filas.filter((f) => f.ubicacionId === ubicacionId).sort((a, b) => b.mes.localeCompare(a.mes));
  const f = deSede[0];
  if (!f) return null;
  const mes = nombreMes(f.mes);
  if (f.unidades <= 0) return { texto: `En ${mes} todavía no hay bajadas al piso que cuenten.`, nivel: null };
  const alColgar = f.unidades - f.tardias;
  const tardias = f.tardias === 0 ? "ninguna recién al venderla" : `${f.tardias} recién al ${f.tardias === 1 ? "venderla" : "venderlas"}`;
  return { texto: `En ${mes} se registraron al colgarlas ${alColgar} de ${f.unidades} unidades (${tardias}).`, nivel: f.nivel };
}

/** Una fila de «Las N tiendas» (solo el líder): sus cifras y su registro de este mes y el anterior. */
export function registroCorto(filas: readonly FilaConfianza[], ubicacionId: string): { mes: string; texto: string; nivel: NivelConfianza | null }[] {
  return filas
    .filter((f) => f.ubicacionId === ubicacionId)
    .sort((a, b) => b.mes.localeCompare(a.mes))
    .map((f) => ({
      mes: nombreMes(f.mes),
      texto: f.unidades > 0 ? `${f.unidades - f.tardias} de ${f.unidades} al colgarlas` : "sin bajadas que cuenten",
      nivel: f.nivel,
    }));
}

// ---------------------------------------------------------------------------
// La hoja de detalle
// ---------------------------------------------------------------------------

/** La regla de su categoría: dónde cae la prenda entre las demás. Cada zona con su nombre escrito (el color no es lo único
 *  que dice qué zona es). Posiciones en % del ancho. */
export type ReglaVista = {
  zonas: { clave: Tramo | "nada"; nombre: string; ancho: number }[];
  marcas: { pos: number; arriba: string; abajo: string; alinear: "inicio" | "medio" | "fin" }[];
  ella: { pos: number; texto: string };
};

export function reglaVista(p: FrescuraPrenda): ReglaVista | null {
  const s = p.categoriaSinElla;
  if (!s || s.cortes.p50 === null || p.estado.tipo === "dudosa" || p.estado.tipo === "clasico") return null;
  const dia = (seg: number) => seg / SEGUNDOS_DIA;
  const p50 = dia(s.cortes.p50);
  const p75 = s.cortes.p75 === null ? null : dia(s.cortes.p75);
  const p90 = s.cortes.p90 === null ? null : dia(s.cortes.p90);
  const tMax = dia(s.tMax);
  const reloj = relojQueDecide(p);
  const suyos = dia(reloj.segundos);
  const tope = Math.max((p90 ?? tMax) * 1.2, suyos * 1.12, 30);
  const pct = (d: number) => Math.min(100, (d / tope) * 100);
  const zonas: ReglaVista["zonas"] = [];
  let x = 0;
  const sumar = (clave: Tramo | "nada", nombre: string, hasta: number) => {
    if (hasta <= x) return;
    zonas.push({ clave, nombre, ancho: pct(hasta) - pct(x) });
    x = hasta;
  };
  sumar("nueva", NOMBRE_TRAMO.nueva, p50);
  sumar("vigente", NOMBRE_TRAMO.vigente, p75 ?? tMax);
  // Envejeciendo es una sola zona desde P75 (Envejecida y Crítica se dicen igual); sin P75, lo que sigue no se sabe todavía.
  if (p75 !== null) sumar("envejecida", NOMBRE_TRAMO.envejecida, tope);
  else sumar("nada", "no se sabe", tope);
  const alinear = (pos: number): "inicio" | "medio" | "fin" => (pos < 6 ? "inicio" : pos > 90 ? "fin" : "medio");
  const marca = (d: number, abajo: string) => ({ pos: pct(d), arriba: `${diasDeCorte(d * SEGUNDOS_DIA)} d`, abajo, alinear: alinear(pct(d)) });
  const marcas: ReglaVista["marcas"] = [{ pos: 0, arriba: "0", abajo: "", alinear: "inicio" }, marca(p50, "la mitad")];
  if (p75 !== null) marcas.push(marca(p75, "3 de 4"));
  marcas.push(p90 !== null ? marca(p90, "9 de 10") : marca(tMax, "lo más largo visto"));
  const d = diasDe(reloj.segundos);
  return { zonas, marcas, ella: { pos: pct(suyos), texto: reloj.alMenos ? `${d} d ${QUIZA_MAS}` : `${d} d` } };
}

/** Un texto con partes en negrita: `**así**`. La pantalla lo pinta con `<b>`. */
export type TextoRico = string;

export type AccionVista = { clave: Sugerencia | "contar"; titulo: string; texto: string; botones: { texto: string; href: string }[] };

export type DetalleVista = {
  titulo: string;
  bajada: string;
  temporada: { tipo: "pasada"; texto: string } | { tipo: "sin" } | { tipo: "tiene"; nombre: string } | null;
  dias: number | null;
  quizaMas: boolean;
  pausa: boolean;
  estado: EstadoVista;
  porque: TextoRico;
  regla: ReglaVista | null;
  sinContarla: TextoRico | null;
  /** Cuánto creerle a la comparación, por las ventas de las demás SIN ella (D5); null si es sólida o no hay. */
  confianzaSinElla: { texto: string; nivel: NivelConfianza } | null;
  rapidez: TextoRico | null;
  rapidezNivel: NivelConfianza | null;
  recientes: TextoRico | null;
  tallas: TallaVista[];
  acciones: AccionVista[];
  sinAcciones: string | null;
  apoyo: { que: string; dato: string }[];
};

function causaAlMenos(p: FrescuraPrenda, ctx: ContextoFrescura): string {
  if (p.primeraExhibicion !== null && Date.parse(p.primeraExhibicion) < Date.parse(ctx.desde)) {
    const dias = Math.round((Date.parse(ctx.ahora) - Date.parse(ctx.desde)) / 86_400_000);
    return `Se colgó por primera vez antes del ${fechaCorta(ctx.desde)}, más atrás de lo que mira esta pantalla (${dias} días): no se sabe cuánto lleva de verdad.`;
  }
  return "Lo primero que se colgó llegó sin fecha (carga inicial, un ajuste o un saldo): no se sabe cuánto lleva de verdad.";
}

/**
 * «18 días» contra un corte de «18»: el estado se decide con segundos exactos, pero la prenda y el corte se muestran
 * redondeados cada uno por su lado. Con una sola regla de redondeo (la de siempre), lo que cambia es la frase cuando los
 * dos enteros coinciden: «está por llegar a los 18» si todavía no los pasó, «justo en los 18» si ya (corrección del paso
 * 4: antes decía «Lleva 18 días: todavía no llega a los 18»).
 */
const yaPaso = (d: number, corte: number): string => (d === corte ? `justo en los ${corte}` : `pasó los ${corte}`);
const noLlega = (d: number, corte: number, todavia = "todavía no llega a"): string => (d === corte ? `está por llegar a los ${corte}` : `${todavia} los ${corte}`);

/** Las demás de su categoría SIN ella no vendieron nada: dicho así, y no «vendieron solo 0». */
const sinVentasDeLasDemas = (s: { vendidas: number }): boolean => s.vendidas <= 0;

function porqueEstado(p: FrescuraPrenda, ctx: ContextoFrescura): TextoRico {
  const e = p.estado;
  const s = p.categoriaSinElla;
  const d = diasDe(p.reloj.segundos);
  const dTxt = p.reloj.alMenos ? `${textoDias(d)} ${QUIZA_MAS}` : textoDias(d);
  const catDeHoy = ctx.categorias.get(p.categoriaId);
  const deCategoria = `las prendas de ${p.categoriaNombre}`;
  if (presenciaDe(p) === "apartada") {
    const iba = e.tipo === "semaforo" ? `, cuando iba como «${NOMBRE_TRAMO[e.tramo]}»` : "";
    return `Todo lo que tenía colgado está apartado para clientes (${p.apartadasPisoHoy}). Mientras siga apartado no envejece: su reloj se detuvo en **${textoDias(d)}**${iba}, y sigue desde ahí si alguna se libera. Lo apartado cuenta como vendido.`;
  }
  if (e.tipo === "dudosa")
    return "El historial de movimientos del piso de alguna de sus tallas no cuadra con lo que hay. Con los números así, cualquier juicio sería inventado: no se mide mientras no cuadre.";
  if (e.tipo === "vendida_sin_registrar")
    return `En caja se anotó una venta de ${p.categoriaNombre} de su talla y color sin decir qué prenda era: puede ser esta. Mientras esa venta no se regularice no se juzga, para no pedirte que muevas una prenda que quizá ya se fue. Lleva **${dTxt}** en el piso.`;
  if (e.tipo === "clasico") {
    const estacion = estacionDelClasico(ctx, p.temporada);
    return `Es un clásico${deClasico(estacion)}: no pasa de moda, así que no entra al semáforo ni se compara con las demás. Lleva ${textoDias(d)} en el piso. ${e.fueraDeSuEstacion ? "Hoy no es su estación." : "Hoy es su estación: no hay nada que decidir."}`;
  }
  if (e.tipo === "sin_ventas_sede") {
    const suyas = p.ventasRecientes > 0 && p.reloj.alMenos ? " Lo que vendió ella llegó sin fecha: por eso no sirve de medida." : "";
    const apoyo = ctx.cayla?.get(p.categoriaId)?.cortes.p50 != null ? ` Como apoyo, en CAYLA: ${textoCayla(ctx.cayla.get(p.categoriaId))}.` : "";
    return `En ${ctx.sede} todavía no se vendió ninguna prenda de ${p.categoriaNombre} con fecha de llegada conocida: no hay con qué compararla. Lleva **${dTxt}** en el piso.${suyas}${apoyo}`;
  }
  if (e.tipo === "sin_vara") {
    // La misma vara que la juzgó sin ella (la del mes, la de CAYLA o la de hoy): «contándola» y «sin ella» de dos varas eran dos escalas.
    const cat = juzgadoraDe(catDeHoy);
    if (cat && cat.cortes.p50 !== null && s) {
      const suyas = Math.max(0, cat.vendidas - s.vendidas);
      const deEllas =
        suyas >= cat.vendidas ? (cat.vendidas === 1 ? "**la única venta es suya**" : `**las ${decimal(cat.vendidas)} ventas son suyas**`) : `**${decimal(suyas)} de las ${decimal(cat.vendidas)} ventas son suyas**`;
      const lasDemas = sinVentasDeLasDemas(s) ? "ninguna de las demás se vendió todavía" : `las demás vendieron solo ${decimal(s.vendidas)}`;
      return `Contándola, la mitad de ${deCategoria} se vende antes de ${textoDias(diasDeCorte(cat.cortes.p50))}, pero eso lo hace ella: ${deEllas}. Sin ella, ${lasDemas} (lo más largo que se vio: ${textoDias(diasDeCorte(s.tMax))}): todavía no se sabe cuánto tardan. Lleva ${dTxt} en el piso.`;
    }
    return `Todavía no se vendió ni la mitad de ${deCategoria} en ${ctx.sede}: no se sabe cuánto tardan. Lleva **${dTxt}** en el piso.`;
  }
  if (e.tipo === "sin_edad_conocida") {
    const mitad = s?.cortes.p50 != null ? `${noLlega(d, diasDeCorte(s.cortes.p50), "todavía no pasa")} días en que ya se vendió la mitad de las demás, pero ` : "";
    return `${causaAlMenos(p, ctx)} Lleva **${dTxt}**: ${mitad}no se puede decir que sea nueva.`;
  }
  // El semáforo, contra las demás de su categoría SIN ella (D5), con el reloj que lo decidió (act. 2026-10-10 (b)): Fresca, el de su
  // modelo; pasada la mitad, el de lo más viejo que cuelga.
  const reloj = relojQueDecide(p);
  const du = diasDe(reloj.segundos);
  const duTxt = reloj.alMenos ? `${textoDias(du)} ${QUIZA_MAS}` : textoDias(du);
  const repuesta = e.tramo !== "nueva" && d - du >= 1;
  const quien = repuesta ? "Lo más viejo que cuelga lleva" : "Lleva";
  const c50 = s?.cortes.p50 != null ? diasDeCorte(s.cortes.p50) : null;
  const c75 = s?.cortes.p75 != null ? diasDeCorte(s.cortes.p75) : null;
  const c90 = s?.cortes.p90 != null ? diasDeCorte(s.cortes.p90) : null;
  let base: string;
  if (e.tramo === "nueva") base = `Lleva **${dTxt}**: ${noLlega(d, c50 ?? 0)} en que ya se vendió la mitad de las demás.`;
  else if (e.tramo === "vigente")
    base = `${quien} **${duTxt}**: ${yaPaso(du, c50 ?? 0)} en que se vende la mitad de las demás${c75 !== null ? `, pero ${noLlega(du, c75, "no")} en que ya se vendieron 3 de cada 4.` : "."}`;
  else if (e.tramo === "envejecida")
    base = `${quien} **${duTxt}**: ${yaPaso(du, c75 ?? 0)} en que ya se vendieron 3 de cada 4 de las demás${c90 !== null ? (du === c90 ? `; ${noLlega(du, c90)} en que se vendieron 9 de cada 10.` : `; a los ${c90} se vendieron 9 de cada 10.`) : "."}`;
  // Pasada la marca de 9 de cada 10 sigue siendo Envejeciendo, que empieza en la de 3 de cada 4: el porqué cita la línea que lo define (la
  // ciega dudó si Envejeciendo empezaba en 12 o en 20, Formidable 2026-10-10 (c)).
  else
    base =
      c75 !== null
        ? `${quien} **${duTxt}**: ${yaPaso(du, c75)} en que ya se vendieron 3 de cada 4 de las demás; a los ${c90 ?? c75} ya iban 9 de cada 10.`
        : `${quien} **${duTxt}**: ${yaPaso(du, c90 ?? 0)} en que ya se vendieron 9 de cada 10 de las demás de ${ctx.sede}.`;
  // Un éxito que se repone: su modelo ya no es Fresco, pero lo que cuelga es nuevo (no se pinta de viejo).
  if (repuesta) base += ` Su modelo lleva ${dTxt} en el piso: ya no es Fresca, aunque lo que cuelga hoy se colgó después.`;
  if (e.alMenos && reloj.alMenos)
    base += ` ${causaAlMenos(p, ctx)}${e.tramo === "critica" ? ` Aunque lleve más, ya es «${NOMBRE_TRAMO.critica}».` : ` Por eso es «${nombreAlMenos(e.tramo)}» y nunca «${NOMBRE_TRAMO.nueva}».`}`;
  else if (e.alMenos && s) {
    const sig = NOMBRE_TRAMO.envejecida;
    const tMax = diasDeCorte(s.tMax);
    base += ` Lo más largo que se vio de las demás en ${ctx.sede}, sin contarla, son ${textoDias(tMax)}, y ella ya ${du === tMax ? "los alcanzó" : "los pasó"}: todavía no hay ventas para saber dónde empieza «${sig}». Por eso es «${nombreAlMenos(e.tramo)}».`;
  }
  // La comparación sale de las demás SIN ella (D5): sus ventas dicen cuánto creerle, no las de toda la categoría.
  if (s && nivelSinElla(p) === "pocos_datos") base += ` La comparación sale de solo ${textoVentas(s.vendidas)} de las demás: tómala con cuidado.`;
  // Los días que no cuentan: desde que se colgó por primera vez (dentro de la lectura) hasta hoy, los que estuvo sin nada libre.
  if (p.primeraExhibicion !== null && !p.reloj.alMenos) {
    const calendario = Math.round((Date.parse(ctx.ahora) - Date.parse(p.primeraExhibicion)) / 86_400_000);
    if (calendario - d >= 1)
      base += ` De los ${textoDias(calendario)} desde que se colgó por primera vez, ${calendario - d} estuvo sin nada libre en el piso (agotada, guardada o apartada): esos no cuentan.`;
  }
  return base;
}

function porqueRapidez(p: FrescuraPrenda): { texto: TextoRico | null; nivel: NivelConfianza | null } {
  if (p.estado.tipo === "clasico" || p.estado.tipo === "dudosa") return { texto: null, nivel: null };
  const k = claveRapidez(p);
  const r = p.rapidez;
  if (k === "sin_dato" || !r) {
    if (p.estado.tipo === "sin_ventas_sede") return { texto: "Sin dato de rapidez: su categoría no tiene ventas aquí con qué compararla.", nivel: null };
    if (p.reloj.alMenos)
      return { texto: "Sin dato de rapidez: no se sabe cuándo llegó lo que vendió, así que no se puede comparar con lo que tardan en venderse las demás.", nivel: null };
    return { texto: "Sin dato de rapidez: todavía no alcanza para compararla con las demás.", nivel: null };
  }
  const nivel = nivelPorVentas(r.referencia);
  const v = decimal(r.vendidas);
  const esp = decimal(r.esperadas);
  const esperaban = esp === "1" ? "se esperaba" : "se esperaban";
  const contra = nivel === "solido" ? "" : ` Se midió contra solo ${textoVentas(r.referencia)} de las demás.`;
  if (k === "poca_evidencia")
    return {
      texto: `Vendió **${v}** cuando para una prenda de su categoría con los mismos días en el piso ${esperaban} **${esp}**. Todavía no se puede decir que sea lenta: con estas ventas, la diferencia puede ser azar. Se vuelve a mirar cuando haya más.${contra}`,
      nivel,
    };
  if (k === "sin_medida")
    return {
      texto: `Vendió **${v}** ${cuandoRecientes(p, "total")}. Sin ella, las demás vendieron solo ${decimal(r.referencia)}: con tan poco no se puede decir si vende rápido o lento.`,
      nivel,
    };
  if (k === "dejo")
    return {
      texto: `Vendió **${v}** cuando para una prenda de su categoría con los mismos días en el piso ${esperaban} **${esp}**: al llegar se vendió más rápido que las demás. Pero lleva ${DIAS_CALLADA} días en el piso sin vender, así que ya no cuenta como una que se vende bien.${contra}`,
      nivel,
    };
  const como = { rapida: "vende más rápido que las demás", ritmo: "vende como las demás", lenta: "vende más lento que las demás", muy_lenta: "vende mucho más lento que las demás" }[k];
  return { texto: `Vendió **${v}**; para una prenda de su categoría con los mismos días en el piso ${esperaban} **${esp}**: ${como}.${contra}`, nivel };
}

/**
 * El lapso de lo vendido «reciente», dicho UNA vez para el bloque «Cómo se vende» y para «sigue vendiendo»: «en sus 12
 * días en el piso» si lleva menos de 30, «en sus últimos 30 días en el piso» si no. Antes la acción decía «últimos 30»
 * de una prenda con 12 días colgada (corrección del paso 4). `total`: sus días en el piso, lleve lo que lleve.
 */
function cuandoRecientes(p: FrescuraPrenda, modo: "recientes" | "total" = "recientes"): string {
  const d = diasDe(p.reloj.segundos);
  if (modo === "recientes" && d >= DIAS_CALLADA) return `en sus últimos ${DIAS_CALLADA} días en el piso`;
  // «En sus 1 día» y «en sus 0 días» no se dicen: con un día o menos colgada, «desde que se colgó».
  return d <= 1 ? "desde que se colgó" : `en sus ${textoDias(d)} en el piso`;
}

function porqueRecientes(p: FrescuraPrenda): TextoRico | null {
  if (p.estado.tipo === "dudosa") return null;
  const d = diasDe(p.reloj.segundos);
  const cuando = cuandoRecientes(p);
  const nada = p.ventasRecientes === 0 && d >= DIAS_CALLADA ? " Son días con algo colgado: lo que estuvo agotado o guardado no cuenta." : "";
  return `${cuando.charAt(0).toUpperCase()}${cuando.slice(1)} vendió **${decimal(p.ventasRecientes)}** (lo apartado para un cliente cuenta como vendido).${nada}`;
}

const lineasTraslado = (p: FrescuraPrenda) =>
  p.tallas
    .filter((t) => t.almacenHoy > 0)
    .map((t) => `${encodeURIComponent(t.varianteId)}:${t.almacenHoy}`)
    .join(",");

/** La talla con que se abre la prenda en Existencias (`?variante=`): la primera con algo en el piso, o la primera. */
const varianteParaExistencias = (p: FrescuraPrenda) => (p.tallas.find((t) => t.pisoHoy > 0) ?? p.tallas[0])?.varianteId ?? null;

/** El enlace a Existencias para retirar la prenda del piso, o null si no tiene ninguna talla. */
export function hrefExistencias(p: FrescuraPrenda): string | null {
  const v = varianteParaExistencias(p);
  return v ? `/inventario?variante=${encodeURIComponent(v)}` : null;
}

/** El enlace que arma un traslado con lo que hay de la prenda en el almacén, o null si no hay nada que trasladar. */
export function hrefArmarTraslado(p: FrescuraPrenda): string | null {
  const lineas = lineasTraslado(p);
  return lineas ? `/inventario/mover?lineas=${lineas}` : null;
}

function accionesDe(p: FrescuraPrenda, ctx: ContextoFrescura): AccionVista[] {
  const a = ctx.acceso;
  const variante = varianteParaExistencias(p);
  const existencias = a.existencias && variante ? [{ texto: "Verla en Existencias", href: `/inventario?variante=${encodeURIComponent(variante)}` }] : [];
  const retirar = a.existencias && variante ? [{ texto: "Retirar del piso en Existencias", href: `/inventario?variante=${encodeURIComponent(variante)}` }] : [];
  const ventas = a.historial ? [{ texto: "Ver sus ventas", href: `/vender/historial?q=${encodeURIComponent(p.productoNombre)}` }] : [];
  const temporada = nombreTemporada(ctx, p.temporada);
  const suEstacion = temporada ? `su ${minuscula(temporada)}` : "su estación";
  return p.estado.sugerencias.map((s): AccionVista => {
    const titulo = textoSugerencia(s, p, ctx);
    switch (s) {
      case "revisar_ventas":
        return {
          clave: s,
          titulo,
          texto: estaCallada(p)
            ? `En sus últimos ${DIAS_CALLADA} días en el piso no se vendió ninguna. Antes de moverla, mira si está a la vista, si tiene sus tallas y su etiqueta de precio.`
            : claveRapidez(p) === "poca_evidencia" && p.rapidez
              ? `Vendió ${decimal(p.rapidez.vendidas)} cuando ${seEsperaban(decimal(p.rapidez.esperadas))}: parece lenta, pero la diferencia todavía puede ser azar. Mira sus ventas antes de decidir.`
              : `No se sabe qué tan rápido se vende: ${porqueSinDato(p)}. Mira sus ventas antes de decidir.`,
          botones: ventas,
        };
      case "cambiar_lugar": {
        const causa = causaCambiarLugar(p);
        const decide = rapidezQueDecide(p);
        const lenta = decide !== null && (decide.indice < RAPIDEZ_IGUAL || claveRapidez(p) === "dejo");
        const texto =
          causa === "temporada"
            ? `Ya pasó ${suEstacion}${lenta ? " y se vende menos que las demás" : ""}: pruébala 7 días en otro lugar antes de retirarla.`
            : causa === "dejo"
              ? `Vendió bien al llegar, pero lleva ${DIAS_CALLADA} días en el piso sin vender. Pruébala 7 días en la entrada, en un maniquí o en una mesa.`
              : "Lleva más tiempo colgada que las demás de su categoría y se vende menos. Pruébala 7 días en la entrada, en un maniquí o en una mesa; cambiarla de lugar no cuesta nada.";
        return { clave: s, titulo, texto, botones: existencias };
      }
      case "trasladar":
        return {
          clave: s,
          titulo,
          // Contra CAYLA, las ventas con que se comparó son las de las tres tiendas, no las de aquí (act. 2026-10-07).
          texto: `Tienes ${p.almacenHoy} en el almacén de ${ctx.sede}. La comparación es sólida (${textoVentas(p.rapidez?.referencia ?? 0)} de las demás ${p.juzgadaContra === "cayla" ? "en las tres tiendas" : "aquí"}). En otra sede podría venderse antes: mira allá cómo va su categoría antes de mandarla.`,
          botones: a.traslados && lineasTraslado(p) ? [{ texto: "Armar un traslado", href: `/inventario/mover?lineas=${lineasTraslado(p)}` }] : [],
        };
      case "retirar":
        return {
          clave: s,
          titulo,
          texto: `${suEstacion.charAt(0).toUpperCase()}${suEstacion.slice(1)} terminó el ${fechaCorta(p.finEstacion)}. Retirarla del piso le hace lugar a lo nuevo: se hace en Existencias, desde el menú de cada talla («Retirar del piso»).`,
          botones: retirar,
        };
      case "sigue_vendiendo":
        return {
          clave: s,
          titulo,
          texto: `Su temporada pasó (${suEstacion} terminó el ${fechaCorta(p.finEstacion)}), pero sigue vendiendo: ${decimal(p.ventasRecientes)} ${cuandoRecientes(p)}. Tú decides si la dejas hasta que se agote o la retiras. Cuando decidas, anótalo con «Anotar lo que hice»: sale de «Por decidir» hasta que toque volver a mirarla.`,
          botones: retirar,
        };
      case "guardar_hasta_su_estacion":
        return {
          clave: s,
          titulo,
          texto: `Es un clásico${deClasico(estacionDelClasico(ctx, p.temporada))}: no envejece, pero fuera de su estación ocupa percha. Guárdala hasta que empiece su estación: se retira del piso desde Existencias.`,
          botones: retirar,
        };
      case "dejar_hasta_agotar":
        return {
          clave: s,
          titulo,
          texto: "Cambiarla de lugar funcionó: esa semana vendió mejor que las demás de su categoría. Déjala donde está hasta que se agote; si dejara de venderse, vuelve a esta lista. Anótalo con «Anotar lo que hice».",
          botones: [],
        };
      case "rebaja_chica":
        return {
          clave: s,
          titulo,
          texto: "Moverla no bastó. El escalón que sigue es una rebaja chica, solo en esta tienda y por tramos. La decide el líder: aquí no se rebaja nada. Cuando el líder la rebaje, se anota con «Anotar lo que hice» → «La rebajé».",
          botones: [],
        };
    }
  });
}

export function detalleVista(p: FrescuraPrenda, ctx: ContextoFrescura): DetalleVista {
  const s = p.categoriaSinElla;
  const cat = ctx.categorias.get(p.categoriaId);
  const temporada = nombreTemporadaOClave(ctx, p.temporada);
  const apartada = presenciaDe(p) === "apartada";
  const dudosa = p.estado.tipo === "dudosa";
  const rap = porqueRapidez(p);
  // La caja «sin contarla» solo cuando hay algo que comparar: sin ventas en la sede no hay nada que decir de las demás (su
  // porqué ya lo explica), y «vendieron solo 0» no le dice nada a nadie (corrección del paso 4).
  let sinContarla: TextoRico | null = null;
  if (s && cat && p.estado.tipo !== "sin_ventas_sede") {
    if (s.cortes.p50 !== null) {
      const partes = [`la mitad se vende antes de ${textoDias(diasDeCorte(s.cortes.p50))}`];
      if (s.cortes.p75 !== null) partes.push(`3 de cada 4 antes de ${diasDeCorte(s.cortes.p75)}`);
      if (s.cortes.p90 !== null) partes.push(`9 de cada 10 antes de ${diasDeCorte(s.cortes.p90)}`);
      // «Contándola» con la MISMA vara que «sin contarla» (la del mes, la de CAYLA o la de hoy; revisión adversaria: eran dos escalas).
      const juzgo = juzgadoraDe(cat)!;
      const conTodas = [juzgo.cortes.p50, juzgo.cortes.p75, juzgo.cortes.p90].filter((x): x is number => x !== null).map(diasDeCorte);
      const contandola = juzgo.cual === "cayla" ? "en las tres tiendas juntas, contándola" : "contándola a ella";
      sinContarla = `Sin contarla, las demás: ${partes.join(", ")}${conTodas.length ? ` (${contandola}: ${conTodas.join(", ")})` : ""}.`;
    } else sinContarla = sinVentasDeLasDemas(s) ? "Sin contarla, ninguna de las demás se vendió todavía." : `Sin contarla, las demás vendieron solo ${decimal(s.vendidas)}.`;
  }
  const nivel = sinContarla !== null ? nivelSinElla(p) : null;
  const confianzaSinElla = s && nivel && nivel !== "solido" ? { texto: `Salen de ${textoVentas(s.vendidas)} de las demás en ${ctx.sede}:`, nivel } : null;
  const acciones = accionesDe(p, ctx);
  if (dudosa)
    acciones.push({
      clave: "contar",
      titulo: "Contar sus tallas",
      texto: "Un conteo de esta prenda revisa lo que de verdad hay en el piso y en el almacén; con los números en orden, vuelve a medirse sola.",
      botones: ctx.acceso.conteos ? [{ texto: "Ir a Conteo", href: "/inventario/conteo" }] : [],
    });
  const apoyo: DetalleVista["apoyo"] = [
    { que: `Colgada por primera vez en ${ctx.sede}`, dato: p.primeraExhibicion ? fechaCorta(p.primeraExhibicion) : "todavía no se colgó" },
    { que: `Llegó a ${ctx.sede}`, dato: fechaCorta(p.ultimaLlegada) },
    { que: "Llegó a CAYLA", dato: p.ultimaLlegadaCayla ? fechaCorta(p.ultimaLlegadaCayla) : "sin llegada registrada (un ajuste o un traslado)" },
  ];
  if (ctx.cayla !== null) {
    const ref = textoCayla(ctx.cayla.get(p.categoriaId));
    apoyo.push({ que: "Referencia de CAYLA", dato: ctx.caylaFallo ?? `${ref.charAt(0).toUpperCase()}${ref.slice(1)}.` });
  }
  return {
    titulo: `${p.productoNombre}${p.colorNombre ? ` · ${p.colorNombre}` : ""}`,
    bajada: [p.codigo, `${p.categoriaNombre} en ${ctx.sede}`].filter(Boolean).join(" · "),
    temporada: p.estado.temporadaPasada
      ? { tipo: "pasada", texto: textoTemporadaPasada(p, ctx) }
      : p.estado.sinTemporada
        ? { tipo: "sin" }
        : temporada
          ? { tipo: "tiene", nombre: temporada }
          : null,
    dias: dudosa ? null : diasDe(relojQueDecide(p).segundos),
    quizaMas: !dudosa && p.reloj.alMenos,
    pausa: apartada,
    estado: estadoVista(p),
    porque: porqueEstado(p, ctx),
    regla: reglaVista(p),
    sinContarla,
    confianzaSinElla,
    rapidez: rap.texto,
    rapidezNivel: rap.nivel,
    recientes: porqueRecientes(p),
    tallas: p.tallas.map((t) => ({ varianteId: t.varianteId, talla: t.talla ?? "Única", piso: t.pisoHoy, almacen: t.almacenHoy, apartadas: t.apartadasHoy })),
    acciones,
    sinAcciones: acciones.length > 0 ? null : apartada ? "Nada: tiene dueño. Vuelve a medirse si alguna se libera." : "Nada por ahora.",
    apoyo,
  };
}

/** Parte un texto con `**negritas**` en trozos: los impares van en negrita. */
export function trozosRicos(t: TextoRico): { texto: string; negrita: boolean }[] {
  return t
    .split("**")
    .map((texto, i) => ({ texto, negrita: i % 2 === 1 }))
    .filter((x) => x.texto !== "");
}

// ---------------------------------------------------------------------------
// El tablero por categoría (nivel 1: ADR-0208, actualización 2026-10-07, decisión 3 de Felipe)
// ---------------------------------------------------------------------------
//
// «¿Cómo está el piso?» de un vistazo: una fila por categoría con la barra de sus unidades colgadas por estado, cuántas prendas
// esperan decisión y con qué vara se juzgó. Es el tablero del líder (semanal) y el mapa de la encargada: tocar una fila deja en la
// lista de abajo solo esa categoría. Lo primero es lo que más pide decidir: se ordena por unidades que se quedan o hay que mover.

/**
 * Los tramos de la barra: los MISMOS de la barra de la tienda (`frescura-piso.ts`, ADR-0208, act. 2026-10-10 (b)): Fresca · Vigente ·
 * Envejeciendo, lo que aún no se sabe y los clásicos aparte. Cada categoría cuenta sus unidades una por una con la misma regla, así
 * que las filas del tablero suman exactamente la barra de la tienda.
 */
export type TramoBarra = TramoPiso;
export const TRAMOS_BARRA: readonly TramoBarra[] = TRAMOS_PISO;
export const NOMBRE_TRAMO_BARRA: Record<TramoBarra, string> = NOMBRE_TRAMO_PISO;
/** El color de cada tramo en la barra: verde · neutro · ámbar, nunca rojo (los colores A); lo que no se sabe, apagado. */
export const CLASE_TRAMO_BARRA: Record<TramoBarra, string> = CLASE_TRAMO_PISO;

/**
 * Con qué vara se juzgó la categoría, dicho SOLO cuando es la excepción (Felipe, Formidable 2026-10-09: la regla se calla y la
 * excepción se marca, como ya hace la fila con «aproximado»): contra CAYLA (su respaldo decidió), pocas ventas, o ninguna. Con una
 * vara sólida o aceptable no se dice nada (`null`). Antes el chip decía «Sólido / Aceptable / Aproximado / Contra CAYLA / Sin
 * ventas» en todas las filas: un nivel de confianza en una palabra, que la ciega no entendió. «3 tiendas» es lo que CAYLA tiene hoy.
 */
export type VaraTablero = { texto: "Comparada con las 3 tiendas" | "Pocas ventas: aproximado" | "Sin ventas aún"; tono: TonoChip };

export function varaTablero(v: VaraCategoria | undefined): VaraTablero | null {
  if (v?.respaldo?.enUso) return { texto: "Comparada con las 3 tiendas", tono: "pizarra" };
  if (v?.nivel === "solido" || v?.nivel === "aceptable") return null;
  if (v?.nivel === "pocos_datos") return { texto: "Pocas ventas: aproximado", tono: "ambar" };
  return { texto: "Sin ventas aún", tono: "apagado" };
}

export type FilaTablero = {
  categoriaId: string;
  nombre: string;
  /** Unidades colgadas por tramo (de las prendas de la tabla con algo en el piso). */
  unidades: Record<TramoBarra, number>;
  total: number;
  /** Prendas (modelo+color) con algo colgado. */
  prendas: number;
  /** Las que esperan decisión (`porDecidir`, el único lugar que lo dice). */
  porDecidir: number;
  /** Unidades que se quedan o hay que mover: lo que ordena el tablero. */
  viejas: number;
  vara: VaraTablero | null;
};

/** El tramo de la PRENDA (por su unidad más vieja) en las palabras de la barra: Envejecida y Crítica son Envejeciendo; el clásico aparte;
 *  lo demás (sin referencia, sin edad, dudosa) «aún no se sabe». La barra cuenta unidad por unidad (`tramosDeLaPrenda`). */
export function tramoBarraDe(p: FrescuraPrenda): TramoBarra {
  if (p.estado.tipo === "semaforo") return p.estado.tramo === "nueva" ? "fresca" : p.estado.tramo === "vigente" ? "vigente" : "envejeciendo";
  if (p.estado.tipo === "clasico") return "clasico";
  return "sin_saber";
}

/** Las filas del tablero: una por categoría con prendas en la tabla, ordenadas por lo que más pide decidir. */
export function tableroVista(prendas: readonly FrescuraPrenda[], ctx: ContextoFrescura): FilaTablero[] {
  const filas = new Map<string, FilaTablero>();
  for (const p of prendas) {
    // Sin nada colgado (apartada entera, guardada) no suma ni crea la fila: el tablero cuenta lo que cuelga.
    if (p.pisoHoy <= 0) continue;
    const fila =
      filas.get(p.categoriaId) ??
      ({
        categoriaId: p.categoriaId,
        nombre: p.categoriaNombre,
        unidades: { fresca: 0, vigente: 0, envejeciendo: 0, sin_saber: 0, clasico: 0 },
        total: 0,
        prendas: 0,
        porDecidir: 0,
        viejas: 0,
        vara: varaTablero(ctx.categorias.get(p.categoriaId)),
      } satisfies FilaTablero);
    filas.set(p.categoriaId, fila);
    if (p.porDecidir) fila.porDecidir++;
    // Unidad por unidad, con la regla de la barra de la tienda: el modelo con una unidad vieja y dos repuestas pinta 1 y 2.
    const { unidades } = tramosDeLaPrenda(p);
    for (const t of TRAMOS_BARRA) {
      fila.unidades[t] += unidades[t];
      fila.total += unidades[t];
    }
    fila.prendas++;
    fila.viejas += unidades.envejeciendo;
  }
  return [...filas.values()].sort((a, b) => b.viejas - a.viejas || b.porDecidir - a.porDecidir || a.nombre.localeCompare(b.nombre, "es"));
}

/** Los segmentos de la barra de una fila, listos para `BarraApilada` (solo los tramos con unidades, en orden). */
export function segmentosDe(fila: FilaTablero): { clave: TramoBarra; nombre: string; valor: number; clase: string }[] {
  return TRAMOS_BARRA.filter((t) => fila.unidades[t] > 0).map((t) => ({ clave: t, nombre: NOMBRE_TRAMO_BARRA[t], valor: fila.unidades[t], clase: CLASE_TRAMO_BARRA[t] }));
}

// ---------------------------------------------------------------------------
// El botón de la fila: dice el verbo y ejecuta (ADR-0208, act. 2026-10-07; Formidable, «invitar a la acción»)
// ---------------------------------------------------------------------------
//
// La primera sugerencia de cada prenda se vuelve UN botón con su verbo. Tres clases: `anotar` (un toque deja la decisión
// anotada, con «Deshacer»: lo que ya hacía la hoja en cuatro toques), `enlace` (abre la pantalla que hace la cosa, con la
// prenda cargada) y `hoja` (hay que elegir entre varias opciones, o ver el porqué: la hoja). Sin sugerencia, o con una decisión
// vigente, no hay botón: la fila ya dice qué se decidió.

/**
 * Lo que pasa al tocar el botón de la fila, dicho ANTES de tocarlo (Formidable 2026-10-09: la ciega no se atrevió a tocar «La cambié
 * de lugar» «por si anotaba de golpe sin preguntar» y dio la vuelta larga: 13 toques donde bastaba 1). El botón afirma un hecho; esta
 * línea dice cuándo tocarlo y qué hace el sistema después. Nunca un «¿seguro?» (ley 7): sigue siendo un toque, con Deshacer.
 */
export function textoConsecuenciaFila(accion: AccionDecision, plazoDias: number): string {
  if (accion === "cambie_lugar") return `Cuando la hayas movido, toca el botón: la miro ${textoDias(plazoDias)} y te digo si sirvió.`;
  if (accion === "hasta_agotar") return `Si la dejas colgada, toca el botón: no te la vuelvo a preguntar en ${textoDias(plazoDias)}.`;
  return "Toca el botón cuando lo hayas hecho: queda anotado a tu nombre.";
}

export type AccionFila =
  | { tipo: "anotar"; verbo: string; accion: AccionDecision }
  | { tipo: "enlace"; verbo: string; href: string }
  | { tipo: "hoja"; verbo: string; modo: "detalle" | "decidir"; opcion: AccionDecision | null };

/**
 * `lecturaOk`: si se pudo leer la libreta de decisiones. Sin ella no se anota ni se abre «Ya decidí» (la base compara con la última
 * línea, que no se sabe; la hoja esconde el botón por lo mismo): la fila ofrece solo el porqué.
 */
export function accionDeFila(p: FrescuraPrenda, ctx: ContextoFrescura, decisionVigente: boolean, lecturaOk = true): AccionFila | null {
  if (p.pisoHoy <= 0 || decisionVigente) return null;
  const s = p.estado.sugerencias[0];
  if (s === undefined) return null;
  const a = ctx.acceso;
  const porque: AccionFila = { tipo: "hoja", verbo: "Ver por qué", modo: "detalle", opcion: null };
  const decidir = (opcion: AccionDecision | null): AccionFila => (lecturaOk ? { tipo: "hoja", verbo: "Decidir", modo: "decidir", opcion } : porque);
  switch (s) {
    case "cambiar_lugar":
      return lecturaOk ? { tipo: "anotar", verbo: "La cambié de lugar", accion: "cambie_lugar" } : porque;
    case "dejar_hasta_agotar":
      return lecturaOk ? { tipo: "anotar", verbo: "La dejo hasta agotar", accion: "hasta_agotar" } : porque;
    case "trasladar": {
      const href = a.traslados ? hrefArmarTraslado(p) : null;
      return href ? { tipo: "enlace", verbo: "Armar traslado", href } : decidir(null);
    }
    case "retirar": {
      const href = a.existencias ? hrefExistencias(p) : null;
      return href ? { tipo: "enlace", verbo: "Retirar del piso", href } : decidir(null);
    }
    case "guardar_hasta_su_estacion": {
      const href = a.existencias ? hrefExistencias(p) : null;
      return href ? { tipo: "enlace", verbo: "Guardar en el almacén", href } : porque;
    }
    case "revisar_ventas":
      return a.historial ? { tipo: "enlace", verbo: "Ver sus ventas", href: `/vender/historial?q=${encodeURIComponent(p.productoNombre)}` } : porque;
    case "sigue_vendiendo":
      return decidir("hasta_agotar");
    case "rebaja_chica":
      return decidir("rebaje");
  }
}
