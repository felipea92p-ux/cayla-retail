// La prenda candidata y la respuesta deducida de una venta «sin registrar» (ADR-0328, actividad 5 parte b; decisión técnica 8).
// Lógica pura: los hechos los trae la base y esto los ordena y los explica.
//
// UNA SOLA DEFINICIÓN DE «CALZA EXACTO» (2026-10-05, tras #800 / ADR-0334). La prenda que calza con lo que anotó la caja (misma
// categoría, talla y color, activa, con al menos 1 disponible fuera de Cuarentena y sin lo apartado) la define UNA función de la base,
// `retail.fn_candidatas_de_venta`, la misma que usa el lote «Identificar con sugerencias» del líder. `hechosConExactas` arma el tramo
// exacto SOLO con ella; `retail.fn_candidatas_por_regularizar` aporta los hechos (saldo a la venta, entradas, piso y almacén) y lo que
// este PR agrega ENCIMA, en tramos APARTE y rotulados (`tramoDe`): el color de la misma familia que a la vista se confunde, y la
// categoría que ESCRIBIÓ la caja cuando no es la anotada. Así lo que el modal llama «igual a lo que anotó caja» es exactamente lo que
// el lote del líder propone, y una prenda que una pantalla ofrece y la otra no deja de ser posible.
//
// CONTRATO
//   PROMETE: (1) `ordenarCandidatas`: las prendas del stock que pueden ser la venta, de la más a la menos probable, cada una con su
//            porqué en palabras de tienda; (2) `deducirForma`, con lo que dice el libro de esa prenda en esa sede: «llegó nueva» si
//            a la hora de la venta el sistema no tenía ninguna (no pudo estar contada); «ya estaba registrada» si tenía y después
//            no llegó ni se ajustó nada (estaba contada); y SIN respuesta (`forma: null`, con el porqué y las fechas) si tenía pero
//            después llegó o se ajustó algo: pudo ser de lo que había o de lo que llegó sin registrar. `null` si no hay datos.
//   ASUME:   que los hechos son los de la sede de la venta y que las fechas vienen en ISO (las de la base).
//            (3) `sugerenciaDeVenta`: la que se sugiere («Más probable») y por qué, mirando también lo que la caja ESCRIBIÓ: si
//            la descripción nombra otra categoría que la anotada («Jean…» anotado como Pantalones), la sugerida sale de la escrita
//            (`categoriaEscritaDistinta`, la misma regla que Vender) o no hay sugerida: nunca un pantalón como «Más probable» de
//            un jean.
//   NO HACE: no elige por nadie. La pantalla muestra la candidata y la respuesta como SUGERENCIA y la persona confirma: contestar mal
//            descuenta dos veces (o deja una prenda fantasma), y la regla falla si la carga se registró días después de contarla
//            en papel. Por eso tampoco es un candado en `regularizar_prenda`.
//
// POR QUÉ EL SALDO Y NO LA PRIMERA ENTRADA (revisión adversarial, R7). Con la primera entrada sola, una prenda que se agotó y volvió
// a llegar salía «ya estaba registrada» aunque el sistema tuviera 0 a la hora de la venta: la respuesta que descuenta dos veces.
//
// EL ORDEN (de más a menos probable), cada criterio desempata el anterior:
//   1. el NOMBRE del modelo aparece en lo que anotó la caja («Blusa Emma negra» → Blusa Emma): la señal más fuerte, la escribió
//      quien tenía la prenda en la mano;
//   2. el color EXACTO antes que uno de la misma familia;
//   3. una que está en el PISO antes que una que solo está en el almacén: lo que se vende sin etiqueta estaba colgado;
//   4. el precio oficial más cercano a lo cobrado;
//   5. la que tiene más unidades (hay más de dónde se pudo perder una etiqueta);
//   6. el código, para que el orden sea siempre el mismo.
import { distanciaEntreHex, esHexValido } from "./color-parecido";
import { diaYHoraLima } from "./fechas-lima";
import { sugerirDescripcion } from "./prenda-sin-registrar-reglas";
import {
  SINONIMOS_POR_CATEGORIA,
  formas,
  sugerenciaParaMostrar,
  type CategoriaParaSugerir,
  type CategoriaSugerida,
} from "./sugerir-categoria-sin-registrar";

export type FormaRegularizar = "ya_registrada" | "llego_nueva";

/** Lo mínimo de cada prenda del catálogo para reconocerla (sin costo: esta pantalla la ve almacén). */
/** Una prenda del catálogo, para elegirla al regularizar. `productoId`: su ficha, donde se carga su stock si la sede nunca la tuvo. */
export type PrendaParaRegularizar = { id: string; productoId: string; nombre: string; codigo: string; categoria: string; talla: string; color: string; precio: number };

/** Una fila de `retail.fn_candidatas_por_regularizar` (o, sin ella, una exacta de `fn_candidatas_de_venta` sin hechos). */
export type HechoCandidata = {
  prendaId: string;
  varianteId: string;
  colorExacto: boolean;
  /** El hex del color de la prenda y el del color que anotó la caja (para medir si se confunden); `null` si no tiene (estampado). */
  colorHex: string | null;
  colorHexAnotado: string | null;
  /** Libres en el piso y en el almacén; `null` = la lectura de hechos no la trajo (no se dice dónde está). */
  pisoLibre: number | null;
  almacenLibre: number | null;
  disponible: number;
  /** La primera vez que esa prenda sumó a esa sede (ISO), o `null` si el libro no lo dice. */
  primeraEntrada: string | null;
  primeraEntradaMotivo: string | null;
  /** Cuántas tenía el sistema de esa prenda en esa sede justo antes de la venta (sin Cuarentena), o `null` si no se sabe. */
  saldoALaVenta: number | null;
  /** Lo primero que llegó o se ajustó de esa prenda en esa sede DESPUÉS de la venta (ISO y motivo), o `null` si nada. */
  cambioPosterior: string | null;
  cambioPosteriorMotivo: string | null;
};

/** Lo que la candidata necesita saber de la venta. */
export type VentaPorRegularizar = { descripcion: string; precioCobrado: number; vendidoEn: string; sede: string; categoria: string; talla: string; color: string };

/** La respuesta que dice el libro, con su porqué. `forma: null` = el libro no alcanza para decidir (el porqué dice por qué). */
export type FormaDeducida = { forma: FormaRegularizar | null; porque: string };

export type Candidata = {
  prenda: PrendaParaRegularizar;
  hecho: HechoCandidata;
  /** Las palabras del nombre del modelo que también escribió la caja («emma»). */
  palabrasDelNombre: string[];
  /** Por qué está en este lugar, en palabras de tienda: «el nombre dice «emma» · mismo color · está en el piso». */
  razones: string[];
  forma: FormaDeducida | null;
  /** Sale de la categoría que nombra lo que escribió la caja, no de la que anotó (ver `sugerenciaDeVenta`). */
  porLoEscrito: boolean;
};

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

/**
 * Hasta qué distancia (ΔE2000) un color de la MISMA familia cuenta como «el que pudo anotar la caja». La familia sola es ancha:
 * «neutro» junta Negro y Blanco. Medido sobre la paleta real (2026-10-04, 346 pares dentro de una familia): se confunden Gris
 * antracita ~ Negro (9), Blanco ~ Crudo (10), Azul denim ~ Azur (10), Índigo ~ Azul marino (11), Celeste ~ Azul claro (16),
 * Rojo ~ Vino (19); no se confunden Gris ~ Negro (31), Celeste ~ Azul marino (61), Blanco ~ Negro (72). Con 20 entra el 52 %.
 */
export const UMBRAL_COLOR_ANOTADO = 20;

/** ¿El color de esta prenda pudo ser el que anotó la caja? Exacto, o de la familia y a la vista parecido; sin hex, basta la familia. */
export function colorPudoSerElAnotado(h: Pick<HechoCandidata, "colorExacto" | "colorHex" | "colorHexAnotado">): boolean {
  if (h.colorExacto) return true;
  if (!esHexValido(h.colorHex) || !esHexValido(h.colorHexAnotado)) return true;
  return distanciaEntreHex(h.colorHex, h.colorHexAnotado) <= UMBRAL_COLOR_ANOTADO;
}

/** Lo que dice el motivo de la primera entrada, para el porqué. */
const QUE_FUE: Readonly<Record<string, string>> = {
  carga_inicial: "su carga inicial",
  recepcion: "su recepción",
  traslado_entrada: "el traslado que la trajo",
  movimiento_interno: "el traslado que la trajo",
  conteo: "un conteo",
  cambio: "un cambio",
  devolucion: "una devolución",
  produccion: "su ingreso desde el Taller",
};
const queFue = (motivo: string | null) => (motivo && QUE_FUE[motivo]) || "su primera entrada";

/** «04/10 a las 11:40»: con la hora, porque una venta y una carga del mismo día se ordenan por ella. */
function cuando(iso: string): string {
  const { dia, hora } = diaYHoraLima(iso);
  return `${dia} a las ${hora}`;
}

/** Lo que cambió lo contado después de la venta, dicho en la tienda: «llegó una recepción», «se ajustó en un conteo». */
const QUE_CAMBIO: Readonly<Record<string, string>> = {
  carga_inicial: "se cargó su stock inicial",
  recepcion: "llegó una recepción",
  traslado_entrada: "llegó un traslado",
  transferencia: "llegó un traslado",
  produccion: "llegó del Taller",
  conteo: "se ajustó en un conteo",
  conteo_fisico: "se ajustó contándola",
  hallazgo_conteo: "apareció tras un conteo",
  reposicion: "se ajustó a mano",
  merma: "se ajustó a mano",
  otro: "se ajustó a mano",
};
const queCambio = (motivo: string | null) => (motivo && QUE_CAMBIO[motivo]) || "cambió su stock";

/**
 * «¿Ya estaba registrada o llegó nueva?», deducida del libro de ESA prenda en ESA sede (`fn_candidatas_por_regularizar`):
 *   · a la hora de la venta el sistema no tenía ninguna → llegó nueva (no pudo estar contada: entra 1 y sale 1, el stock no cambia);
 *   · tenía, y después no llegó ni se ajustó nada → ya estaba registrada (estaba contada: sale 1);
 *   · tenía, pero después llegó o se ajustó algo → sin respuesta (`forma: null`): pudo ser de lo que había o de lo que llegó sin
 *     registrar (o un conteo ya la descontó). El porqué lo dice con las fechas, para que la persona mire.
 * Sin saldo conocido o con una fecha rota: `null` (nada que decir).
 */
export function deducirForma(
  h: Pick<HechoCandidata, "saldoALaVenta" | "primeraEntrada" | "primeraEntradaMotivo" | "cambioPosterior" | "cambioPosteriorMotivo">,
  vendidoEn: string,
  sede: string,
): FormaDeducida | null {
  const saldo = h.saldoALaVenta;
  if (saldo === null || !Number.isFinite(saldo) || !Number.isFinite(Date.parse(vendidoEn))) return null;
  if (saldo <= 0) {
    const entrada = h.primeraEntrada ? Date.parse(h.primeraEntrada) : Number.NaN;
    // La más clara de decir: se vendió antes de que esa prenda entrara por primera vez a la tienda.
    if (h.primeraEntrada && Number.isFinite(entrada) && Date.parse(vendidoEn) < entrada) {
      return {
        forma: "llego_nueva",
        porque: `Se vendió el ${cuando(vendidoEn)}, antes de ${queFue(h.primeraEntradaMotivo)} en ${sede} (${cuando(h.primeraEntrada)}): ese conteo ya no la incluyó.`,
      };
    }
    return {
      forma: "llego_nueva",
      porque: `Cuando se vendió (${cuando(vendidoEn)}), el sistema no tenía ninguna en ${sede}: no pudo estar contada.`,
    };
  }
  if (!h.cambioPosterior) {
    return {
      forma: "ya_registrada",
      porque: `Cuando se vendió (${cuando(vendidoEn)}), el sistema tenía ${saldo} en ${sede} y después no llegó ni se ajustó ninguna: estaba contada en el stock.`,
    };
  }
  return {
    forma: null,
    porque: `Cuando se vendió (${cuando(vendidoEn)}), el sistema tenía ${saldo} en ${sede}, pero el ${cuando(h.cambioPosterior)} ${queCambio(h.cambioPosteriorMotivo)}: pudo ser una de las que ya estaban contadas o una que llegó sin registrar. Mira tú si estaba contada.`,
  };
}

/** Palabras que no distinguen un modelo de otro: las de cualquier prenda de la tabla, conectores y la palabra «talla». */
const NO_DISTINGUEN = new Set([
  ...Object.values(SINONIMOS_POR_CATEGORIA).flatMap((ps) => ps.flatMap(formas)),
  ...["de", "del", "la", "el", "lo", "con", "sin", "para", "por", "tipo", "talla", "color", "modelo", "y"],
]);

/** Las palabras del nombre del modelo que la caja también escribió y que de verdad lo distinguen («emma», no «blusa» ni «negra»). */
export function palabrasEnComun(venta: Pick<VentaPorRegularizar, "descripcion" | "categoria" | "color" | "talla">, prenda: PrendaParaRegularizar): string[] {
  const fuera = new Set([...NO_DISTINGUEN, ...formas(venta.categoria), ...formas(venta.color), ...formas(prenda.color), ...formas(venta.talla)]);
  const escritas = new Set(formas(venta.descripcion));
  return [...new Set(formas(prenda.nombre))].filter((p) => p.length >= 3 && !/^\d+$/.test(p) && !fuera.has(p) && escritas.has(p));
}

function razonesDe(venta: VentaPorRegularizar, prenda: PrendaParaRegularizar, h: HechoCandidata, palabras: string[]): string[] {
  const razones: string[] = [];
  if (palabras.length > 0) razones.push(`el nombre dice «${palabras.join(" ")}»`);
  razones.push(h.colorExacto ? "mismo color" : `color parecido (${prenda.color})`);
  if (h.pisoLibre !== null) razones.push(h.pisoLibre > 0 ? "está en el piso" : "solo en el almacén");
  const dif = Math.round((prenda.precio - venta.precioCobrado) * 100) / 100;
  razones.push(dif === 0 ? "mismo precio" : `precio ${soles(prenda.precio)}`);
  return razones;
}

/**
 * Las candidatas de UNA venta, de la más a la menos probable (orden en la cabecera de este archivo). Una variante que el catálogo de
 * la pantalla no trae (archivada después de la lectura) se omite: no se puede elegir.
 */
export function ordenarCandidatas(
  venta: VentaPorRegularizar,
  hechos: readonly HechoCandidata[],
  catalogo: ReadonlyMap<string, PrendaParaRegularizar>,
): Candidata[] {
  const lista: Candidata[] = [];
  for (const h of hechos) {
    const prenda = catalogo.get(h.varianteId);
    if (!prenda || !colorPudoSerElAnotado(h)) continue;
    const palabras = palabrasEnComun(venta, prenda);
    lista.push({
      prenda,
      hecho: h,
      palabrasDelNombre: palabras,
      razones: razonesDe(venta, prenda, h, palabras),
      forma: deducirForma(h, venta.vendidoEn, venta.sede),
      porLoEscrito: false,
    });
  }
  const distancia = (c: Candidata) => Math.abs(c.prenda.precio - venta.precioCobrado);
  return lista.sort(
    (a, b) =>
      b.palabrasDelNombre.length - a.palabrasDelNombre.length ||
      Number(b.hecho.colorExacto) - Number(a.hecho.colorExacto) ||
      Number((b.hecho.pisoLibre ?? 0) > 0) - Number((a.hecho.pisoLibre ?? 0) > 0) ||
      distancia(a) - distancia(b) ||
      b.hecho.disponible - a.hecho.disponible ||
      `${a.prenda.codigo}`.localeCompare(`${b.prenda.codigo}`) ||
      a.prenda.id.localeCompare(b.prenda.id),
  );
}

/**
 * Una fila de `retail.fn_candidatas_de_venta` (ADR-0334, 20261005120000): LA definición de «calza exacto» con una venta pendiente
 * —misma categoría, talla y color, prenda activa y distinta de la centinela, con al menos 1 unidad disponible en la tienda de la venta
 * (fuera de Cuarentena y sin lo apartado)—. `limpia` no se usa aquí: es del lote del líder.
 */
export type ExactaDeVenta = { prendaId: string; varianteId: string; disponible: number };

/** La exacta que la base común reconoce y la lectura de hechos no trae (una prenda de prueba, o pasada de las 20 por venta): sin hechos. */
function exactaSinHechos(e: ExactaDeVenta): HechoCandidata {
  return {
    prendaId: e.prendaId,
    varianteId: e.varianteId,
    colorExacto: true,
    colorHex: null,
    colorHexAnotado: null,
    pisoLibre: null,
    almacenLibre: null,
    disponible: e.disponible,
    primeraEntrada: null,
    primeraEntradaMotivo: null,
    saldoALaVenta: null,
    cambioPosterior: null,
    cambioPosteriorMotivo: null,
  };
}

/**
 * Los hechos de la categoría ANOTADA con los que la pantalla trabaja (D1, 2026-10-05).
 * PROMETE: el tramo exacto (`colorExacto`) es EXACTAMENTE `exactas` (`fn_candidatas_de_venta`): ni una más —una exacta de los hechos
 *   que la base común no reconoce se cae— ni una menos —una que los hechos no traen entra sin hechos, sin respuesta deducida—; de cada
 *   una, sus hechos si los hay y el disponible de la base común. Los colores de la familia (`colorExacto: false`) pasan tal cual: son
 *   el tramo aparte «color parecido» (el filtro ΔE lo hace `ordenarCandidatas`).
 * ASUME: las dos lecturas son de las mismas sedes. Si `exactas` es `null` (no se pudo leer), no hay tramo exacto que mostrar y
 *   tampoco se muestran las parecidas: sin la base común, una parecida pasaría por la más probable con una exacta escondida.
 */
export function hechosConExactas(exactas: readonly ExactaDeVenta[] | null, hechos: readonly HechoCandidata[]): HechoCandidata[] {
  if (exactas === null) return [];
  const conHechos = new Map(hechos.filter((h) => h.colorExacto).map((h) => [`${h.prendaId}|${h.varianteId}`, h]));
  const exactos = exactas.map((e) => {
    const h = conHechos.get(`${e.prendaId}|${e.varianteId}`);
    return h ? { ...h, disponible: e.disponible } : exactaSinHechos(e);
  });
  return [...exactos, ...hechos.filter((h) => !h.colorExacto)];
}

/** En qué tramo va una candidata: la categoría que escribió la caja, igual a lo anotado, o un color parecido de lo anotado. */
export type Tramo = "escrita" | "exacta" | "parecida";
export function tramoDe(c: Pick<Candidata, "porLoEscrito" | "hecho">): Tramo {
  if (c.porLoEscrito) return "escrita";
  return c.hecho.colorExacto ? "exacta" : "parecida";
}

/** Los hechos de la base agrupados por venta pendiente. */
export function hechosPorVenta(hechos: readonly HechoCandidata[]): Map<string, HechoCandidata[]> {
  const out = new Map<string, HechoCandidata[]>();
  for (const h of hechos) {
    const lista = out.get(h.prendaId);
    if (lista) lista.push(h);
    else out.set(h.prendaId, [h]);
  }
  return out;
}

/** Lo que la venta trae para saber si lo escrito y lo anotado dicen lo mismo. */
export type VentaConCategoria = Pick<VentaPorRegularizar, "descripcion" | "categoria" | "color" | "talla"> & { categoriaId: string };

/**
 * Si lo que ESCRIBIÓ la caja nombra otra categoría activa que la anotada («Jean azul tiro alto» anotado como Pantalones → Jeans),
 * cuál y por qué palabra; `null` si dicen lo mismo, si lo escrito no nombra ninguna prenda o si la descripción la armó el sistema
 * con la categoría anotada («Pantalones · Negro · Talla 28»: no es evidencia). La misma regla que sugiere en Vender
 * (`sugerenciaParaMostrar`, ADR-0328 decisión 6): una sola lectura del texto para las ventas nuevas y para la cola.
 */
export function categoriaEscritaDistinta(venta: VentaConCategoria, categorias: readonly CategoriaParaSugerir[]): CategoriaSugerida | null {
  if (venta.descripcion.trim() === sugerirDescripcion(venta.categoria, venta.color, venta.talla)) return null;
  return sugerenciaParaMostrar(venta.descripcion, venta.categoriaId, categorias);
}

/** Las ventas PENDIENTES cuya descripción nombra otra categoría: a cuál buscarlas (la segunda lectura de candidatas). */
export function categoriasPorLoEscrito(
  filas: readonly (VentaConCategoria & { id: string; estado: string })[],
  categorias: readonly CategoriaParaSugerir[],
): Record<string, CategoriaSugerida> {
  const out: Record<string, CategoriaSugerida> = {};
  for (const f of filas) {
    if (f.estado !== "pendiente") continue;
    const escrita = categoriaEscritaDistinta(f, categorias);
    if (escrita) out[f.id] = escrita;
  }
  return out;
}

/** Lo que la pantalla dice de UNA venta pendiente: todas sus candidatas, la que se sugiere y si lo escrito nombra otra categoría. */
export type SugerenciaVenta = {
  /** Primero las de la categoría escrita (si caja anotó otra), después las de la anotada; cada grupo en su orden. */
  candidatas: Candidata[];
  /** La «Más probable» (la del «Es esta»), o `null`: ninguna calza, o lo escrito nombra otra categoría y de esa no hay ninguna. */
  probable: Candidata | null;
  escrita: CategoriaSugerida | null;
};

/**
 * La sugerencia de UNA venta. Sin conflicto entre lo escrito y lo anotado, la más probable de la categoría anotada. Si lo escrito
 * nombra otra (`escrita`), la sugerida sale de ESA categoría (`hechosEscrita`, la segunda lectura) y dice por qué; las de la anotada
 * quedan después, como «posibles», nunca como la sugerida: un pantalón no es la «Más probable» de una venta escrita «Jean…».
 */
export function sugerenciaDeVenta(
  venta: VentaPorRegularizar,
  hechosAnotada: readonly HechoCandidata[],
  hechosEscrita: readonly HechoCandidata[],
  catalogo: ReadonlyMap<string, PrendaParaRegularizar>,
  escrita: CategoriaSugerida | null,
): SugerenciaVenta {
  const anotadas = ordenarCandidatas(venta, hechosAnotada, catalogo);
  if (!escrita) return { candidatas: anotadas, probable: anotadas[0] ?? null, escrita: null };
  const deLoEscrito = ordenarCandidatas({ ...venta, categoria: escrita.nombre }, hechosEscrita, catalogo).map((c) => ({
    ...c,
    porLoEscrito: true,
    razones: [`caja escribió «${escrita.palabra}»`, ...c.razones],
  }));
  const ya = new Set(deLoEscrito.map((c) => c.prenda.id));
  return { candidatas: [...deLoEscrito, ...anotadas.filter((c) => !ya.has(c.prenda.id))], probable: deLoEscrito[0] ?? null, escrita };
}

/**
 * La frase corta de la lista: «Probable: Blusa Emma · BLU-0001-NEG-M» o, con varias, «… (1 de 3)»; si lo escrito nombra otra
 * categoría y de esa no hay ninguna en stock, «Caja escribió «Jean»: búscala entre Jeans».
 */
export function textoProbable(s: SugerenciaVenta): string | null {
  if (s.probable) {
    const cuantas = s.candidatas.length > 1 ? ` (1 de ${s.candidatas.length})` : "";
    return `Probable: ${s.probable.prenda.nombre} · ${s.probable.prenda.codigo}${cuantas}`;
  }
  if (s.escrita) return `Caja escribió «${s.escrita.palabra}»: búscala entre ${s.escrita.nombre}`;
  return null;
}

/** Qué dice el libro de la prenda ELEGIDA (la respuesta, o por qué no alcanza), si la elegida es una candidata con datos. */
export function formaSugeridaPara(candidatas: readonly Candidata[], varianteElegida: string): FormaDeducida | null {
  return candidatas.find((c) => c.prenda.id === varianteElegida)?.forma ?? null;
}

/** Cuántas pendientes tienen una prenda probable (para decir cuánto de la limpieza es «confirmar» y cuánto «buscar»). */
export function conCandidata(pendientes: readonly { id: string }[], sugerenciaDe: ReadonlyMap<string, SugerenciaVenta>): number {
  return pendientes.filter((p) => sugerenciaDe.get(p.id)?.probable).length;
}
