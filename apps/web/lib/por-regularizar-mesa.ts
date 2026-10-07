// La «mesa» de Ventas sin registrar (ADR-0360, maqueta A2 «Puente» elegida por Felipe el 2026-10-07): a la izquierda lo que anotó caja
// (los talones), en medio la unión (el puente) y a la derecha las prendas del catálogo entre las que se elige. Lógica pura, sin React ni red.
//
// CONTRATO
//   PROMETE: dadas una venta sin registrar y las prendas del catálogo, decir cuáles calzan (categoría, talla, color), en qué orden se
//            ofrecen, cuál es LA sugerida (la única que calza en los tres datos y tiene unidades libres: la misma definición de
//            `fn_candidatas_de_venta`, ADR-0334), buscar entre TODAS las prendas por lo que escribe la persona, y los textos y medidas del
//            puente (la diferencia de precio, la balanza, los tres visitos, la franja de avance).
//   ASUME:   que `disponible` sale de `fn_existencias` (la única fórmula de «cuánto hay», ADR-0270): `null` = no se pudo leer (la
//            pantalla sigue, sin cifras de stock y sin sugerida: nunca afirma lo que no sabe). Una prenda que no está en el mapa tiene 0.
//   NO HACE: no decide qué se puede regularizar ni cuánto baja el stock: lo decide `regularizar_prenda`. Aquí solo se ayuda a elegir y
//            se explica de antemano lo que la base va a hacer.
import { clave } from "./buscar-prenda-v2";
import { tipoDiferencia } from "./por-regularizar-reglas";

/** La prenda del catálogo con lo que hace falta para reconocerla y dibujarla (`MosaicoPrenda`: ícono de su categoría sobre su color). */
export type PrendaParaRegularizar = {
  id: string;
  nombre: string;
  codigo: string;
  categoria: string;
  talla: string;
  color: string;
  precio: number;
  /** Color de la prenda (`colores.hex`): es DATO, no cambia con el tema. */
  colorHex?: string | null;
  categoriaPrefijo?: string | null;
  categoriaFamilia?: string | null;
};

/** Lo de una venta sin registrar que sirve para compararla con una prenda. */
export type VentaParaCalzar = { categoria: string; talla: string; color: string; precioCobrado: number };

/** Unidades libres por prenda en la tienda de la venta; `null` si no se pudo leer. */
export type Disponible = ReadonlyMap<string, number> | null;

export type Calce = { categoria: boolean; talla: boolean; color: boolean; puntos: 0 | 1 | 2 | 3 };

const igual = (a: string, b: string) => clave(a) === clave(b);

/** Qué de lo que anotó caja coincide con la prenda. Compara sin mayúsculas ni tildes («Azul noche» = «azul noche»). */
export function calceDe(venta: VentaParaCalzar, prenda: Pick<PrendaParaRegularizar, "categoria" | "talla" | "color">): Calce {
  const categoria = igual(venta.categoria, prenda.categoria);
  const talla = igual(venta.talla, prenda.talla);
  const color = igual(venta.color, prenda.color);
  return { categoria, talla, color, puntos: (Number(categoria) + Number(talla) + Number(color)) as Calce["puntos"] };
}

/** Cobrado − precio oficial, a céntimos: negativa = descuento no planificado; positiva = sobreprecio. */
export function diferenciaDe(venta: Pick<VentaParaCalzar, "precioCobrado">, prenda: Pick<PrendaParaRegularizar, "precio">): number {
  return Math.round((venta.precioCobrado - prenda.precio) * 100) / 100;
}

const unidades = (disponible: Disponible, id: string): number | null => (disponible === null ? null : (disponible.get(id) ?? 0));

export type Candidata = { prenda: PrendaParaRegularizar; calce: Calce; disponible: number | null; diferencia: number };

const aCandidata = (venta: VentaParaCalzar, prenda: PrendaParaRegularizar, disponible: Disponible): Candidata => ({
  prenda,
  calce: calceDe(venta, prenda),
  disponible: unidades(disponible, prenda.id),
  diferencia: diferenciaDe(venta, prenda),
});

/** El orden en que se ofrecen: las que más calzan primero, y entre iguales las que tienen unidades; después por nombre (estable). */
function ordenDeOferta(a: Candidata, b: Candidata): number {
  return (
    b.calce.puntos - a.calce.puntos ||
    Number((b.disponible ?? 0) > 0) - Number((a.disponible ?? 0) > 0) ||
    a.prenda.nombre.localeCompare(b.prenda.nombre, "es") ||
    a.prenda.id.localeCompare(b.prenda.id)
  );
}

/** Las prendas que se ofrecen de entrada (por defecto 6): las que más calzan con lo que anotó caja. */
export function candidatasDe(venta: VentaParaCalzar, prendas: readonly PrendaParaRegularizar[], disponible: Disponible, tope = 6): Candidata[] {
  return prendas
    .map((p) => aCandidata(venta, p, disponible))
    .sort(ordenDeOferta)
    .slice(0, tope);
}

/**
 * LA sugerida: la ÚNICA prenda que calza en categoría, talla y color y tiene al menos una unidad libre en la tienda. Con dos o más, o con
 * ninguna, no se sugiere nada (elegir sería adivinar); y sin saber el stock (`disponible` null) tampoco. Es la definición de
 * `fn_candidatas_de_venta` (ADR-0334); aquí solo ordena lo que se ve, la base no se entera.
 */
export function sugeridaDe(venta: VentaParaCalzar, prendas: readonly PrendaParaRegularizar[], disponible: Disponible): PrendaParaRegularizar | null {
  if (disponible === null) return null;
  const posibles = prendas.filter((p) => calceDe(venta, p).puntos === 3 && (disponible.get(p.id) ?? 0) >= 1);
  return posibles.length === 1 ? posibles[0] : null;
}

// ── Buscar entre todas las prendas ───────────────────────────────────────────────────────────────────────────────────────────────

/** El texto de una prenda listo para buscar: sin tildes ni mayúsculas, y el guion del código cuenta como espacio («CAS-014» → «cas 014»). */
const palabras = (texto: string) => ` ${clave(texto).replace(/[^a-z0-9ñ]+/g, " ").trim()}`;

export type IndicePrendas = { prenda: PrendaParaRegularizar; texto: string }[];

/** Se arma una vez (con `useMemo`): buscar en cada letra no vuelve a normalizar todo el catálogo. */
export function indexarPrendas(prendas: readonly PrendaParaRegularizar[]): IndicePrendas {
  return prendas.map((prenda) => ({ prenda, texto: palabras([prenda.nombre, prenda.categoria, prenda.talla, prenda.color, prenda.codigo].join(" ")) }));
}

/**
 * Lo escrito en el buscador de prendas: cada palabra tiene que empezar alguna palabra de la prenda (nombre, categoría, talla, color o
 * código), en cualquier orden —igual que el buscador de la lista, `coincideConBusqueda`—. Devuelve hasta `tope` prendas MÁS, las que
 * más calzan primero, SIN repetir las que ya están arriba (`yaArriba`); y cuántas de las que ya estaban arriba también coinciden, para
 * poder decir «ya está entre las de arriba» en vez de «no hay».
 */
export function buscarPrendas(
  indice: IndicePrendas,
  consulta: string,
  venta: VentaParaCalzar,
  disponible: Disponible,
  yaArriba: ReadonlySet<string>,
  tope = 8,
): { lista: Candidata[]; enLasDeArriba: number } {
  const terminos = palabras(consulta).trim().split(" ").filter(Boolean);
  if (terminos.length === 0) return { lista: [], enLasDeArriba: 0 };
  const coincide = (texto: string) => terminos.every((t) => texto.includes(` ${t}`));
  const lista: Candidata[] = [];
  let enLasDeArriba = 0;
  for (const { prenda, texto } of indice) {
    if (!coincide(texto)) continue;
    if (yaArriba.has(prenda.id)) enLasDeArriba++;
    else lista.push(aCandidata(venta, prenda, disponible));
  }
  return { lista: lista.sort(ordenDeOferta).slice(0, tope), enLasDeArriba };
}

// ── El puente: lo que se dice y se mide al unir ──────────────────────────────────────────────────────────────────────────────────

const soles = (n: number) => `S/ ${n.toFixed(2)}`;

/** «Se cobró S/ 10.00 menos que el oficial». */
export function fraseDeDiferencia(diferencia: number): string {
  if (diferencia === 0) return "Se cobró el precio oficial";
  return diferencia < 0 ? `Se cobró ${soles(-diferencia)} menos que el oficial` : `Se cobró ${soles(diferencia)} más que el oficial`;
}

/** Lo ya resuelto, tal como lo dice la lista de siempre: «Descuento no planificado: S/ 10.00», «Sobreprecio: S/ 4.00». */
export function textoDeDiferencia(diferencia: number): string {
  if (diferencia === 0) return "Se cobró el precio oficial";
  return diferencia < 0 ? `Descuento no planificado: ${soles(-diferencia)}` : `Sobreprecio: ${soles(diferencia)}`;
}

/** La etiqueta corta de la tarjeta de una prenda: «−S/ 10.00», «+S/ 4.00» o «Mismo precio». */
export function rotuloDeDiferencia(diferencia: number): string {
  if (diferencia === 0) return "Mismo precio";
  return diferencia < 0 ? `−${soles(-diferencia)}` : `+${soles(diferencia)}`;
}

/**
 * La balanza de precio: una regla con DOS marcas —el precio oficial y lo cobrado— y el tramo entre las dos. Posiciones en % del ancho.
 * La regla se estira un poco a los lados para que las marcas no queden pegadas al borde ni se amontonen cuando la diferencia es chica.
 */
export function balanzaDe(cobrado: number, oficial: number): { oficial: number; cobrado: number; desde: number; ancho: number; tipo: "descuento" | "sobreprecio" | "exacto" } {
  const dif = Math.abs(cobrado - oficial);
  const lo = Math.min(cobrado, oficial) - dif * 1.4 - 6;
  const hi = Math.max(cobrado, oficial) + dif * 1.4 + 6;
  const pos = (x: number) => Math.round(((x - lo) / (hi - lo)) * 1000) / 10;
  const pOficial = pos(oficial);
  const pCobrado = pos(cobrado);
  return {
    oficial: pOficial,
    cobrado: pCobrado,
    desde: Math.min(pOficial, pCobrado),
    ancho: Math.max(Math.abs(pCobrado - pOficial), 1.2),
    tipo: tipoDiferencia(Math.round((cobrado - oficial) * 100) / 100),
  };
}

/**
 * Un solo veredicto por prenda, en palabras de tienda, en vez de contar datos («coincide 2/3»): «Calza en todo», «Cambia la talla», «Cambia el color»,
 * «Cambian talla y color» o «Es otra prenda». `ok` (verde) solo cuando calza en los tres; lo demás es `casi` (ámbar) o `otra` (neutro).
 */
export function veredictoDe(calce: Calce): { texto: string; tono: "ok" | "casi" | "otra" } {
  if (calce.puntos === 3) return { texto: "Calza en todo", tono: "ok" };
  if (!calce.categoria) return { texto: "Es otra prenda", tono: "otra" };
  if (!calce.talla && !calce.color) return { texto: "Cambian talla y color", tono: "casi" };
  return { texto: calce.talla ? "Cambia el color" : "Cambia la talla", tono: "casi" };
}

/** Los tres visitos de la cuerda: cuáles de los tres datos que anotó caja coinciden con la prenda elegida. */
export function visitosDe(calce: Calce): { etiqueta: "Prenda" | "Talla" | "Color"; coincide: boolean }[] {
  return [
    { etiqueta: "Prenda", coincide: calce.categoria },
    { etiqueta: "Talla", coincide: calce.talla },
    { etiqueta: "Color", coincide: calce.color },
  ];
}

/** Lo que anotó caja de la prenda, en una línea: «Talla S · Beige» (sin lo que falte). Sale en el talón y en «Lo que anotó caja»: es contra lo que se compara. */
export function anotadoPorCaja(venta: Pick<VentaParaCalzar, "talla" | "color">): string {
  return [venta.talla ? `Talla ${venta.talla}` : "", venta.color].filter(Boolean).join(" · ");
}

/** Cuando un visito dice «≠»: contra qué. «Caja anotó talla M; esta es talla S». Vacío si coincide todo. */
export function diferenciasDe(venta: Pick<VentaParaCalzar, "categoria" | "talla" | "color">, prenda: Pick<PrendaParaRegularizar, "categoria" | "talla" | "color">): string[] {
  const calce = calceDe({ ...venta, precioCobrado: 0 }, prenda);
  const filas: string[] = [];
  if (!calce.categoria) filas.push(`Caja anotó ${venta.categoria}; esta es ${prenda.categoria}`);
  if (!calce.talla) filas.push(`Caja anotó talla ${venta.talla}; esta es talla ${prenda.talla}`);
  if (!calce.color) filas.push(`Caja anotó ${venta.color}; esta es ${prenda.color}`);
  return filas;
}

export type FormaRegularizar = "ya_registrada" | "llego_nueva";

/** Las dos formas de «cómo estaba esta prenda en el sistema» (las palabras que ya usaba el modal), con lo que la base hará. */
export const FORMAS: Record<FormaRegularizar, { titulo: string; detalle: string; efecto: string }> = {
  ya_registrada: { titulo: "Perdió la etiqueta", detalle: "Ya estaba registrada, solo perdió la etiqueta", efecto: "Se descuenta 1 del stock de esta tienda." },
  llego_nueva: { titulo: "Llegó nueva", detalle: "Llegó nueva y no se contó en el lote", efecto: "Se anota que llegó y que se vendió: el stock no cambia." },
};

/** Cuántas unidades libres quedarán de la prenda tras regularizar: «Perdió la etiqueta» baja 1; «Llegó nueva» entra y sale (queda igual). */
export function disponibleDespues(disponible: number, forma: FormaRegularizar): number {
  return forma === "ya_registrada" ? Math.max(0, disponible - 1) : disponible;
}

// ── La franja de avance (reemplaza a las cuatro tarjetas y al anillo) ───────────────────────────────────────────────────────

/** Cuánto va hecho en ESTA visita: `inicial` son las pendientes con que se abrió la pantalla; si llegan ventas nuevas, no retrocede. */
export function avanceDe(inicial: number, pendientes: number): { hechas: number; proporcion: number } {
  const hechas = Math.max(0, inicial - pendientes);
  return { hechas, proporcion: Math.min(1, hechas / Math.max(1, inicial, hechas + pendientes)) };
}

export function textoDePendientes(pendientes: number): string {
  if (pendientes === 0) return "Todo cuadrado: ya no queda ninguna por identificar";
  return pendientes === 1 ? "venta por identificar" : "ventas por identificar";
}

// ── Cómo se arma la mesa según el ancho que tiene ─────────────────────────────────────────────────────────────────────────────

export type ModoDeMesa = "tres" | "dos" | "hoja";

/**
 * Según el ancho de la caja de la mesa (no de la ventana: el menú lateral le quita 260 px):
 *   «tres»  ≥ 960 px  talones · puente · prendas, con los dos hilos;
 *   «dos»   ≥ 640 px  talones a la izquierda y, a la derecha, el puente sobre las prendas;
 *   «hoja»  < 640 px  solo los talones; al tocar uno, el puente y las prendas suben en una hoja (`<Modal>`).
 */
export function modoDeMesa(ancho: number): ModoDeMesa {
  if (ancho >= 1000) return "tres";
  if (ancho >= 700) return "dos";
  return "hoja";
}
