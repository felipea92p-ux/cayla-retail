import { clave } from "./buscar-prenda-v2";
import type { EtiquetaAlta } from "./alta-producto-datos";

// Las reglas del campo «Etiquetas» del alta de un producto (el que se ve como el de Shopify: escribes, eliges varias, y si
// no existe la creas). Todo lo que decide QUÉ se ofrece y QUÉ pasa con lo escrito vive acá, puro y probado: el
// componente (`ElegirEtiquetas`) solo pinta lo que esto calcula.
//
// CONTRATO
//   PROMETE: separar el vocabulario de etiquetas en lo que se puede ELEGIR, lo que YA APLICA solo por campaña, y lo que
//            este rol no puede dar; y decir, para un texto escrito, si coincide con una etiqueta o si sería una NUEVA.
//   ASUME:   `etiquetas` son las APROBADAS Y ACTIVAS que trae `getContextoAlta` (una pendiente o rechazada no es
//            vocabulario todavía: la base también lo exige en `crear_producto_con_variantes`).
//   NO HACE: no crea nada (eso es `proponerEtiqueta`, con su firma) ni decide permisos: la base los vuelve a exigir
//            (`fn_puede_dar_descuento_por_etiqueta`); acá solo se evita OFRECER lo que la base va a rechazar.

/** El nombre como se guarda: sin espacios de más al borde ni repetidos. Mayúsculas y tildes se respetan (se ven en pantalla). */
export function nombreDeEtiqueta(texto: string): string {
  return texto.trim().replace(/\s+/g, " ");
}

/** La forma en que se compara un nombre: la misma idea que `fn_clave_texto` de la base (sin tildes, mayúsculas ni espacios de más).
 *  Se aplica IGUAL a lo escrito y a los nombres ya guardados: uno guardado con un doble espacio no debe pasar por «nueva». */
export function claveEtiqueta(texto: string): string {
  return clave(nombreDeEtiqueta(texto));
}

export type ReparteEtiquetas = {
  /** Las que se pueden elegir a mano. */
  elegibles: EtiquetaAlta[];
  /** Las que la campaña ya aplica sola sobre la categoría de esta prenda: se muestran, no se eligen (sería duplicarlas en cada variante). */
  cubiertas: EtiquetaAlta[];
  /** Cuántas con descuento NO se ofrecen porque quien crea la prenda no es líder (poner un descuento cambia el precio en caja). */
  ocultasPorDescuento: number;
};

export function repartirEtiquetas(
  etiquetas: readonly EtiquetaAlta[],
  { categoriaId, daDescuentos }: { categoriaId: string; daDescuentos: boolean }
): ReparteEtiquetas {
  const elegibles: EtiquetaAlta[] = [];
  const cubiertas: EtiquetaAlta[] = [];
  let ocultasPorDescuento = 0;
  for (const et of etiquetas) {
    if (categoriaId && et.categoriaIds.includes(categoriaId)) cubiertas.push(et);
    else if (!daDescuentos && et.descuentoPct !== null) ocultasPorDescuento++;
    else elegibles.push(et);
  }
  return { elegibles, cubiertas, ocultasPorDescuento };
}

/**
 * Lo que la lista desplegable muestra: las elegibles que todavía no se eligieron y cuyo nombre contiene lo escrito, con la
 * MÁS PARECIDA primero: igual, después las que empiezan con lo escrito y al final las que solo lo contienen (el orden de
 * entrada, alfabético, desempata). Sin este orden, Enter agregaba la primera alfabética: escribir «Sale» agregaba «Outlet
 * Sale» (con su 50 % de descuento) en vez de «Sale».
 */
export function filtrarEtiquetas(elegibles: readonly EtiquetaAlta[], yaElegidas: readonly string[], texto: string): EtiquetaAlta[] {
  const k = claveEtiqueta(texto);
  const rango = (et: EtiquetaAlta) => {
    const c = claveEtiqueta(et.nombre);
    return c === k ? 0 : c.startsWith(k) ? 1 : 2;
  };
  return elegibles
    .filter((et) => !yaElegidas.includes(et.id) && (!k || claveEtiqueta(et.nombre).includes(k)))
    .map((et, i) => ({ et, i, r: k ? rango(et) : 0 }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.et);
}

/** «20 % dto», «12,5 % dto»: lo que la campaña descuenta, tal cual (no se redondea: 12,5 no es 13), si descuenta. */
export function textoDeDescuento(et: Pick<EtiquetaAlta, "descuentoPct">): string | null {
  if (et.descuentoPct === null) return null;
  return `${String(Number(et.descuentoPct.toFixed(2))).replace(".", ",")} % dto`;
}

/**
 * Qué significa lo que la persona escribió, para decírselo con palabras en vez de dejar un «Crear» que la base rechazaría:
 *   - `vacio`: nada escrito.
 *   - `invalida`: trae una coma (pegar «a, b, c» crearía UNA etiqueta con comas, permanente en el vocabulario): se dice que van de a una.
 *   - `nueva`: no existe ninguna con ese nombre (ni elegible, ni cubierta, ni escondida por rol, ni propuesta antes): se puede crear.
 *   - `existe`: ya hay una así, y `motivo` dice por qué no se agrega como «nueva»:
 *        elegible → está en la lista (Enter la agrega); elegida → ya está puesta; campana → ya aplica sola;
 *        solo_lider → lleva descuento y solo la da un líder; propuesta → ya la propusiste y espera a un líder.
 */
export type SignificadoTexto =
  | { tipo: "vacio" }
  | { tipo: "nueva"; nombre: string }
  | { tipo: "invalida"; nombre: string }
  | { tipo: "existe"; nombre: string; etiqueta: EtiquetaAlta | null; motivo: "elegible" | "elegida" | "campana" | "solo_lider" | "propuesta" };

export function significadoDelTexto(
  texto: string,
  {
    todas,
    reparto,
    elegidas,
    propuestas,
  }: { todas: readonly EtiquetaAlta[]; reparto: ReparteEtiquetas; elegidas: readonly string[]; propuestas: readonly string[] }
): SignificadoTexto {
  const nombre = nombreDeEtiqueta(texto);
  const k = claveEtiqueta(nombre);
  if (!k) return { tipo: "vacio" };
  if (nombre.includes(",")) return { tipo: "invalida", nombre };

  const igual = todas.find((et) => claveEtiqueta(et.nombre) === k);
  if (igual) {
    if (elegidas.includes(igual.id)) return { tipo: "existe", nombre: igual.nombre, etiqueta: igual, motivo: "elegida" };
    if (reparto.cubiertas.some((c) => c.id === igual.id)) return { tipo: "existe", nombre: igual.nombre, etiqueta: igual, motivo: "campana" };
    if (reparto.elegibles.some((c) => c.id === igual.id)) return { tipo: "existe", nombre: igual.nombre, etiqueta: igual, motivo: "elegible" };
    return { tipo: "existe", nombre: igual.nombre, etiqueta: igual, motivo: "solo_lider" };
  }
  if (propuestas.some((p) => claveEtiqueta(p) === k)) return { tipo: "existe", nombre, etiqueta: null, motivo: "propuesta" };
  return { tipo: "nueva", nombre };
}

/** Lo que se dice cuando lo escrito no se puede crear como etiqueta (hoy: trae comas). */
export const FRASE_ETIQUETA_INVALIDA = "Las etiquetas se agregan de a una: escribe una y da Enter, sin comas.";

/** La frase de una etiqueta que existe pero no se agrega como nueva (el «por qué» que reemplaza a un botón muerto). */
export function fraseDeExistente(motivo: Extract<SignificadoTexto, { tipo: "existe" }>["motivo"]): string {
  switch (motivo) {
    case "elegible":
      return "Ya existe: tócala en la lista para agregarla.";
    case "elegida":
      return "Ya la agregaste a esta prenda.";
    case "campana":
      return "Esa campaña ya aplica sola a esta categoría: no hace falta agregarla.";
    case "solo_lider":
      return "Esa etiqueta lleva descuento y solo la pone un líder.";
    case "propuesta":
      return "Ya la propusiste: falta que un líder la apruebe en Catálogo → Atributos.";
  }
}

/** Suma a la lista las etiquetas creadas en esta pantalla, sin duplicar las que la página ya releyó (`router.refresh()`). */
export function unirEtiquetas(delServidor: readonly EtiquetaAlta[], nuevas: readonly EtiquetaAlta[]): EtiquetaAlta[] {
  const ids = new Set(delServidor.map((e) => e.id));
  const claves = new Set(delServidor.map((e) => claveEtiqueta(e.nombre)));
  return [...delServidor, ...nuevas.filter((e) => !ids.has(e.id) && !claves.has(claveEtiqueta(e.nombre)))];
}
