import { clave } from "./buscar-prenda-v2";
import { interpretarBusquedaEspecial, normalizarCamposBuscables, type IndiceBusquedaEspecial, type TerminoDeBusqueda } from "./filtro-busqueda-especial";

/* ====================================================================
   Estado vacío inteligente de Existencias (2026-09-26)

   Por qué existe: cuando la búsqueda no encontraba nada, la pantalla decía solo «Ningún producto
   coincide con la búsqueda.» Felipe escribió la marca «CAYLA», no vio nada y no supo por qué:
   ¿la marca no existe?, ¿está escrita distinto?, ¿la sede no la tiene?, ¿un filtro la esconde?
   Un vacío que no explica obliga a adivinar; este módulo arma la explicación.

   Qué responde, en este orden (lo que más ayuda primero):
     1. Cómo se leyó lo escrito (talla, color o texto): «blusa blanco m» se parte en tres y TODAS deben cumplirse.
     2. Qué se vería quitando UNA cosa (un término o un filtro), con el número de prendas.
     3. Si todo da cero y parece una errata: «¿quisiste decir «cayla»?».
     4. Si el producto existe en el catálogo pero esta sede nunca lo recibió (no tiene ni una fila de stock).

   Es puro (sin React ni Supabase) y solo usa lo que recibe: la pantalla pone los números (`contar`)
   y los productos que la sede no tiene (`sinStock`). Así nunca revela más de lo que ya puede ver
   quien está mirando esa sede.
   ==================================================================== */

type Vocabulario = IndiceBusquedaEspecial<unknown>["vocabulario"];

/** Un producto del catálogo que esta sede NO tiene en su stock (ni una fila). */
export type ProductoSinStock = { id: string; referencia: string; marca: string | null; categoria: string | null };

/** «accion» (Acción hoy) y «estado» (dañado, por colgar) son dos ejes desde el 2026-09-25: el vacío puede quitar uno sin el otro. */
export type ClaveFiltro = "categoria" | "talla" | "color" | "marca" | "accion" | "estado";
/** Un filtro visual activo, tal como lo ve la persona. Ej.: { clave: "marca", etiqueta: "Marca", valor: "Miramhe" }. */
export type FiltroActivo = { clave: ClaveFiltro; etiqueta: string; valor: string };

export type TerminoLeido = { texto: string; tipo: "texto" | "color" | "talla" };

export type Relajacion = {
  /** «Quitar «polo»» o «Quitar el filtro Marca: Miramhe». */
  texto: string;
  /** Cuántas prendas se verían al hacerlo (siempre > 0). */
  prendas: number;
  accion: { tipo: "termino"; consulta: string } | { tipo: "filtro"; clave: ClaveFiltro };
};

export type ExplicacionVacio = {
  titulo: string;
  comoSeLeyo: TerminoLeido[];
  filtros: FiltroActivo[];
  relajaciones: Relajacion[];
  quisisteDecir: { escrito: string; sugerido: string; consulta: string } | null;
  sinStock: ProductoSinStock[];
  sinStockTotal: number;
};

/** Cuántas salidas se ofrecen: más de tres es volver a pedirle a la persona que piense. */
const MAX_RELAJACIONES = 3;
/** Cuántos productos «que la sede no ha recibido» se listan (el resto se resume en «y N más»). */
const MAX_SIN_STOCK = 5;
/** Un término más corto que esto no se corrige: «xy» está a una letra de demasiadas palabras. */
const LARGO_MINIMO_PARA_CORREGIR = 3;
/** Desde cuántas letras se toleran dos errores en vez de uno («camizass» → «camisas»). */
const LARGO_PARA_DOS_ERRORES = 7;

const VOCABULARIO_VACIO: Vocabulario = { tallas: new Set<string>(), palabrasDeColor: new Set<string>() };

// ---------------------------------------------------------------------------
// Piezas sueltas
// ---------------------------------------------------------------------------

/**
 * Distancia de edición (Levenshtein: insertar, borrar o cambiar una letra) con tope. Si la distancia supera `tope`
 * devuelve `tope + 1` sin terminar la cuenta: para «¿quisiste decir?» solo importa saber si está a 1 o 2 letras,
 * y cortar temprano evita medir a fondo cientos de palabras que ni se parecen.
 */
export function distanciaConTope(a: string, b: string, tope: number): number {
  if (a === b) return 0;
  const largoA = a.length;
  const largoB = b.length;
  // Si el largo ya difiere en más que el tope, ninguna edición alcanza: ni se empieza.
  if (Math.abs(largoA - largoB) > tope) return tope + 1;
  if (largoA === 0) return largoB;
  if (largoB === 0) return largoA;
  let previa = Array.from({ length: largoB + 1 }, (_, j) => j);
  for (let i = 1; i <= largoA; i++) {
    const actual = [i];
    let minimoDeLaFila = i;
    for (let j = 1; j <= largoB; j++) {
      const cambio = a[i - 1] === b[j - 1] ? 0 : 1;
      const valor = Math.min(previa[j] + 1, actual[j - 1] + 1, previa[j - 1] + cambio);
      actual.push(valor);
      if (valor < minimoDeLaFila) minimoDeLaFila = valor;
    }
    // Ninguna celda de esta fila está dentro del tope: las siguientes solo pueden crecer.
    if (minimoDeLaFila > tope) return tope + 1;
    previa = actual;
  }
  const distancia = previa[largoB];
  return distancia > tope ? tope + 1 : distancia;
}

/**
 * Las palabras (sin tildes, minúsculas, de 3 o más caracteres, únicas y ordenadas) de los nombres, marcas, categorías
 * y colores de las filas de la sede. Es el diccionario de «¿quisiste decir?»: solo sugiere lo que esta sede de verdad
 * tiene, nunca una palabra de otro lado.
 */
export function palabrasBuscables(filas: readonly { referencia: string; marca?: string | null; categoria?: string | null; color?: string | null }[]): string[] {
  const palabras = new Set<string>();
  const sumar = (texto: string | null | undefined) => {
    for (const palabra of clave(texto).split(/[^a-z0-9]+/)) {
      // Solo palabras con alguna letra: «0001» o «30» son códigos y tallas, no algo que se «escribe mal».
      if (palabra.length >= LARGO_MINIMO_PARA_CORREGIR && /[a-z]/.test(palabra)) palabras.add(palabra);
    }
  };
  for (const fila of filas) {
    sumar(fila.referencia);
    sumar(fila.marca);
    sumar(fila.categoria);
    sumar(fila.color);
  }
  return [...palabras].sort();
}

/**
 * Las palabras como las escribió la persona, una por término (mismo orden que `terminos`). El motor ya las pasó a
 * minúsculas sin tildes; para mostrar «Quitar «básico»» y devolverle al buscador «básico» (no «basico») se recupera
 * la palabra escrita: los términos son un subconjunto ordenado de las palabras escritas (el motor solo descarta las
 * de compañía como «de» o «talla»), así que se emparejan de izquierda a derecha.
 */
function palabrasEscritas(consulta: string, terminos: readonly TerminoDeBusqueda[]): string[] {
  const escritas = consulta.split(/[\s,;]+/).filter((palabra) => clave(palabra));
  let desde = 0;
  return terminos.map((termino) => {
    const posicion = escritas.findIndex((palabra, i) => i >= desde && clave(palabra) === termino.texto);
    if (posicion < 0) return termino.texto;
    desde = posicion + 1;
    return escritas[posicion].toLocaleLowerCase("es");
  });
}

// ---------------------------------------------------------------------------
// Lo que el catálogo tiene y la sede no
// ---------------------------------------------------------------------------

/** La frase que presenta esa lista. Neutra a propósito: «sin stock en {sede}» dice lo que la base sabe (no hay ni una fila) y sirve igual para
 *  una tienda que para el Taller (que no «recibe») y para uno o varios productos, sin concordancia. La usan el estado vacío y el aviso bajo
 *  los filtros (con resultados), para que digan lo mismo. */
export function textoSinStock(sede: string): string {
  return `En el catálogo, pero sin stock en ${sede}:`;
}

/**
 * De las prendas del catálogo que la sede no tiene, cuáles coinciden con lo escrito. Solo cuentan los términos de TEXTO:
 * talla y color hablan de variantes, y un producto que la sede nunca recibió no tiene variantes aquí. Con la misma
 * lectura del buscador de Existencias (marca y categoría por inicio de palabra), pero con vocabulario vacío para que
 * todo término se trate como texto. Sin términos de texto no hay nada que decir → vacío.
 *
 * Orden: primero los que su nombre empieza con lo escrito («Cayla Sastre» antes que «Bermuda Cayla» al buscar
 * «cayla»: en el primero es el nombre, en el segundo solo la marca), luego alfabético. Devuelve como máximo `limite`, pero `total` cuenta todos los que coinciden.
 */
export function sinStockQueCoincide(
  consulta: string,
  vocabulario: Vocabulario,
  sinStock: readonly ProductoSinStock[],
  opciones: { filtroMarca?: string | null; filtroCategoria?: string | null; limite?: number } = {}
): { productos: ProductoSinStock[]; total: number } {
  const limite = Math.max(0, opciones.limite ?? MAX_SIN_STOCK);
  const textos = interpretarBusquedaEspecial(consulta, vocabulario)
    .terminos.filter((termino) => termino.tipo === "texto")
    .map((termino) => termino.texto);
  if (textos.length === 0) return { productos: [], total: 0 };

  const busqueda = interpretarBusquedaEspecial(textos.join(" "), VOCABULARIO_VACIO);
  const marca = opciones.filtroMarca ? clave(opciones.filtroMarca) : null;
  const categoria = opciones.filtroCategoria ? clave(opciones.filtroCategoria) : null;

  const coinciden = sinStock
    // Los filtros de marca y categoría primero: son baratos y descartan antes de normalizar los campos.
    .filter((producto) => (marca === null || clave(producto.marca) === marca) && (categoria === null || clave(producto.categoria) === categoria))
    .filter((producto) =>
      busqueda.coincide(
        normalizarCamposBuscables({ nombre: producto.referencia, sku: null, codigosBarras: [], color: null, talla: null, marca: producto.marca, categoria: producto.categoria })
      )
    )
    .map((producto) => {
      const nombre = clave(producto.referencia);
      return { producto, nombre, empieza: textos.some((texto) => nombre.startsWith(texto)) };
    });

  coinciden.sort((a, b) => Number(b.empieza) - Number(a.empieza) || a.nombre.localeCompare(b.nombre, "es") || a.producto.id.localeCompare(b.producto.id));
  return { productos: coinciden.slice(0, limite).map((c) => c.producto), total: coinciden.length };
}

// ---------------------------------------------------------------------------
// «¿Quisiste decir…?»
// ---------------------------------------------------------------------------

/**
 * La errata más probable de lo escrito, o null. Toma los términos de texto que NO empiezan ninguna palabra real (si
 * empiezan una, la persona la está tecleando: «cay» → «cayla», y no hay nada que corregir) y busca la palabra más
 * cercana a una letra (a dos si el término mide 7 o más). Nunca sugiere el mismo término; a igual distancia gana la
 * alfabéticamente primera, para que la sugerencia no cambie entre una tecla y la siguiente sin razón.
 */
function buscarErrata(terminos: readonly TerminoDeBusqueda[], escritas: readonly string[], palabras: readonly string[]): { escrito: string; sugerido: string; consulta: string } | null {
  let mejor: { indice: number; sugerido: string; distancia: number } | null = null;
  for (const [indice, termino] of terminos.entries()) {
    if (termino.tipo !== "texto" || termino.texto.length < LARGO_MINIMO_PARA_CORREGIR) continue;
    if (palabras.some((palabra) => palabra.startsWith(termino.texto))) continue;
    const tope = termino.texto.length >= LARGO_PARA_DOS_ERRORES ? 2 : 1;
    let candidata: { sugerido: string; distancia: number } | null = null;
    for (const palabra of palabras) {
      if (palabra === termino.texto) continue;
      const distancia = distanciaConTope(termino.texto, palabra, tope);
      if (distancia > tope) continue;
      if (candidata === null || distancia < candidata.distancia || (distancia === candidata.distancia && palabra < candidata.sugerido)) candidata = { sugerido: palabra, distancia };
    }
    // Entre varios términos con errata gana el más cercano; a igualdad, el de más a la izquierda (el primero que se escribió).
    if (candidata && (mejor === null || candidata.distancia < mejor.distancia)) mejor = { indice, ...candidata };
  }
  if (mejor === null) return null;
  const elegida: { indice: number; sugerido: string } = mejor;
  return {
    escrito: escritas[elegida.indice],
    sugerido: elegida.sugerido,
    consulta: escritas.map((palabra, i) => (i === elegida.indice ? elegida.sugerido : palabra)).join(" "),
  };
}

// ---------------------------------------------------------------------------
// La explicación completa
// ---------------------------------------------------------------------------

/**
 * Arma lo que la pantalla le dice a quien no ve ninguna prenda. Contrato: recibe lo que la pantalla ya sabe
 * (consulta, filtros, vocabulario de la sede, un `contar` que cuenta prendas con y sin ciertos filtros) y devuelve
 * datos, no texto suelto: el componente decide cómo se ve. Nunca inventa un número: toda cifra sale de `contar`.
 */
export function explicarVacio(entrada: {
  consulta: string;
  sede: string;
  filtros: readonly FiltroActivo[];
  vocabulario: Vocabulario;
  palabras: readonly string[];
  /** Cuántas prendas de la sede se ven con ESTA consulta ignorando los filtros cuyas claves están en `omitir`. Lo provee la pantalla. */
  contar: (consulta: string, omitir: ReadonlySet<ClaveFiltro>) => number;
  sinStock: readonly ProductoSinStock[];
  /** Valor exacto del filtro Marca activo, o null. */
  filtroMarca: string | null;
  filtroCategoria: string | null;
}): ExplicacionVacio {
  const { consulta, sede, filtros, vocabulario, palabras, contar, sinStock, filtroMarca, filtroCategoria } = entrada;
  const terminos = interpretarBusquedaEspecial(consulta, vocabulario).terminos;
  const escritas = palabrasEscritas(consulta, terminos);
  const hayTexto = terminos.length > 0;

  const comoSeLeyo: TerminoLeido[] = terminos.map((termino, i) => ({ texto: escritas[i], tipo: termino.tipo }));

  // Relajaciones: qué se vería quitando UNA cosa. Solo se ofrece lo que devuelve algo (prendas > 0): un botón que
  // lleva a otro vacío es peor que ninguno.
  const candidatas: (Relajacion & { esFiltro: boolean })[] = [];
  // Con un solo término y ningún filtro, quitarlo deja la pantalla sin condiciones: eso ya lo hace «Limpiar».
  if (terminos.length > 1 || filtros.length > 0) {
    const vistas = new Set<string>();
    terminos.forEach((_, i) => {
      const restante = escritas.filter((__, k) => k !== i).join(" ");
      // «polo polo»: quitar cualquiera de los dos deja lo mismo, y dos botones iguales confunden.
      if (vistas.has(restante)) return;
      vistas.add(restante);
      const prendas = contar(restante, new Set());
      if (prendas > 0) candidatas.push({ texto: `Quitar «${escritas[i]}»`, prendas, accion: { tipo: "termino", consulta: restante }, esFiltro: false });
    });
  }
  for (const filtro of filtros) {
    const prendas = contar(consulta, new Set<ClaveFiltro>([filtro.clave]));
    if (prendas > 0) candidatas.push({ texto: `Quitar el filtro ${filtro.etiqueta}: ${filtro.valor}`, prendas, accion: { tipo: "filtro", clave: filtro.clave }, esFiltro: true });
  }
  // Más prendas primero; a igualdad, los términos antes que los filtros (corregir lo escrito es más natural que deshacer
  // una elección hecha en las listas). `sort` es estable: el resto conserva el orden en que se escribió.
  candidatas.sort((a, b) => b.prendas - a.prendas || Number(a.esFiltro) - Number(b.esFiltro));
  const relajaciones: Relajacion[] = candidatas.slice(0, MAX_RELAJACIONES).map(({ texto, prendas, accion }) => ({ texto, prendas, accion }));

  // Errata: solo cuando quitar una cosa no arregla nada. Si quitar «polo» ya trae prendas, el problema no es la ortografía.
  const quisisteDecir = candidatas.length === 0 && hayTexto ? buscarErrata(terminos, escritas, palabras) : null;

  const enCatalogo = sinStockQueCoincide(consulta, vocabulario, sinStock, { filtroMarca, filtroCategoria, limite: MAX_SIN_STOCK });

  const consultaLimpia = consulta.trim().replace(/\s+/g, " ");
  const titulo = hayTexto
    ? `Nada coincide con «${consultaLimpia}» en ${sede}`
    : filtros.length > 0
      ? `Ninguna prenda cumple los filtros elegidos en ${sede}`
      : `Ninguna prenda para mostrar en ${sede}`;

  return { titulo, comoSeLeyo, filtros: [...filtros], relajaciones, quisisteDecir, sinStock: enCatalogo.productos, sinStockTotal: enCatalogo.total };
}
