import { clave } from "./buscar-prenda-v2";
import type { EtiquetaAlta } from "./alta-producto-datos";
import { estiloConocido, GRUPOS_ETIQUETA, ORDEN_GRUPOS_ETIQUETA, type EstiloEtiqueta } from "./etiqueta-grupos";
import { MUESTRAS_A_LA_VISTA } from "./muestras-alta-reglas";

// Las reglas del campo «Etiquetas» del alta de un producto (todas las etiquetas a la vista por grupo, elegir varias, buscar, y si
// no existe crearla). Todo lo que decide QUÉ se ofrece y QUÉ pasa con lo escrito vive acá, puro y probado: el
// componente (`ElegirEtiquetas`) solo pinta lo que esto calcula.
//
// CONTRATO
//   PROMETE: separar el vocabulario de etiquetas en lo que se puede ELEGIR y lo que YA APLICA solo por campaña; y decir,
//            para un texto escrito, si coincide con una etiqueta o si sería una NUEVA.
//   ASUME:   `etiquetas` son las APROBADAS Y ACTIVAS que trae `getContextoAlta` (una pendiente o rechazada no es
//            vocabulario todavía: la base también lo exige en `crear_producto_con_variantes`).
//   NO HACE: no crea nada (eso es `proponerEtiqueta`, con su firma) ni filtra por rol: desde 2026-09-30 (ADR-0293) quien
//            da de alta un producto le pone cualquier etiqueta, con descuento o sin él. Antes, quien no era líder no veía
//            las que llevaban descuento («Para liquidar», «Últimas unidades») y parecía que no existían.

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
};

export function repartirEtiquetas(etiquetas: readonly EtiquetaAlta[], { categoriaId }: { categoriaId: string }): ReparteEtiquetas {
  const elegibles: EtiquetaAlta[] = [];
  const cubiertas: EtiquetaAlta[] = [];
  for (const et of etiquetas) {
    if (categoriaId && et.categoriaIds.includes(categoriaId)) cubiertas.push(et);
    else elegibles.push(et);
  }
  return { elegibles, cubiertas };
}

/** ¿El nombre contiene lo escrito? Sin tildes ni mayúsculas ni espacios de más; sin texto, todas coinciden. */
export function coincideConTexto(et: Pick<EtiquetaAlta, "nombre">, texto: string): boolean {
  const k = claveEtiqueta(texto);
  return !k || claveEtiqueta(et.nombre).includes(k);
}

/**
 * Lo que se ve en la grilla compacta del campo, sin abrir «Ver todos» (mismo molde que Tejido/Patrón/Temporada,
 * ADR de uniformidad 2026-09-29): a diferencia de `aLaVista` (un solo elegido), acá puede haber VARIAS marcadas y
 * varias cubiertas — ninguna de las dos se esconde nunca. Van primero, en el orden en que ya venían (`elegibles` +
 * `cubiertas` de `repartirEtiquetas`); el resto llena hasta `max`.
 */
export function etiquetasALaVista(
  elegibles: readonly EtiquetaAlta[],
  cubiertas: readonly EtiquetaAlta[],
  marcadas: ReadonlySet<string>,
  max = MUESTRAS_A_LA_VISTA
): EtiquetaAlta[] {
  const todas = [...elegibles, ...cubiertas];
  const importantes = todas.filter((e) => marcadas.has(e.id) || cubiertas.some((c) => c.id === e.id));
  const resto = todas.filter((e) => !marcadas.has(e.id) && !cubiertas.some((c) => c.id === e.id));
  return [...importantes, ...resto].slice(0, max);
}

export type GrupoDeEtiquetas = { estilo: EstiloEtiqueta; nombre: string; punto: string; etiquetas: EtiquetaAlta[] };

/** Las etiquetas por grupo, en el orden y con los nombres de Atributos (`lib/etiqueta-grupos.ts`), y dentro de cada grupo por
 *  nombre. Un grupo sin etiquetas no sale. Un estilo desconocido cae en «General»: ninguna etiqueta queda sin lugar. */
export function agruparEtiquetas(etiquetas: readonly EtiquetaAlta[]): GrupoDeEtiquetas[] {
  return ORDEN_GRUPOS_ETIQUETA.map((estilo) => ({
    estilo,
    nombre: GRUPOS_ETIQUETA[estilo].grupo,
    punto: GRUPOS_ETIQUETA[estilo].dot,
    etiquetas: etiquetas.filter((e) => estiloConocido(e.estilo) === estilo).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
  })).filter((g) => g.etiquetas.length > 0);
}

/** «20 % dto», «12.5 % dto»: lo que la campaña descuenta, tal cual (no se redondea: 12.5 no es 13), si descuenta. Mismo formato
 *  que Catálogo ▸ Atributos ▸ Etiquetas (`es-PE`). */
export function textoDeDescuento(et: Pick<EtiquetaAlta, "descuentoPct">): string | null {
  if (et.descuentoPct === null) return null;
  return `${et.descuentoPct.toLocaleString("es-PE", { maximumFractionDigits: 2 })} % dto`;
}

/**
 * Qué significa lo que la persona escribió, para decírselo con palabras en vez de dejar un «Crear» que la base rechazaría:
 *   - `vacio`: nada escrito.
 *   - `invalida`: trae una coma (pegar «a, b, c» crearía UNA etiqueta con comas, permanente en el vocabulario): se dice que van de a una.
 *   - `nueva`: no existe ninguna con ese nombre (ni elegible, ni cubierta, ni propuesta antes): se puede crear.
 *   - `existe`: ya hay una así, y `motivo` dice por qué no se agrega como «nueva»:
 *        elegible → está en la lista (Enter la agrega); elegida → ya está puesta; campana → ya aplica sola;
 *        propuesta → ya la propusiste y espera a un líder.
 */
export type SignificadoTexto =
  | { tipo: "vacio" }
  | { tipo: "nueva"; nombre: string }
  | { tipo: "invalida"; nombre: string }
  | { tipo: "existe"; nombre: string; etiqueta: EtiquetaAlta | null; motivo: "elegible" | "elegida" | "campana" | "propuesta" };

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
    return { tipo: "existe", nombre: igual.nombre, etiqueta: igual, motivo: "elegible" };
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

/** La campaña con descuento que la caja cobrará HOY sobre la prenda que se está creando. */
export type CampanaDelAlta = {
  nombre: string;
  pct: number;
  hasta: string | null;
  /** Lo que se rebaja por unidad (el mismo cálculo de la caja) y el precio que paga el cliente. */
  descuento: number;
  precioFinal: number;
  /** Las otras campañas con descuento que rigen hoy y NO se cobran (la caja cobra solo la mayor), de mayor a menor %. */
  otras: { nombre: string; pct: number }[];
};

/**
 * La campaña que el resumen del alta anuncia: la de mayor % entre las elegidas a mano y las que la categoría aplica sola, que
 * RIGE HOY (sin fechas = permanente; una que aún no empieza o ya terminó no cuenta, igual que la etiqueta de precio impresa y la
 * caja). Existe para que el resumen diga lo mismo que dirá el papel: si la etiqueta sale con descuento, el resumen también.
 *
 * NO HACE: no suma campañas (la caja cobra solo la mayor, ADR-0107) ni toca el precio que se guarda: es solo lo que se muestra.
 */
export function campanaDelAlta(
  etiquetas: readonly EtiquetaAlta[],
  precio: number | null,
  hoy: string,
  descuentoDe: (precio: number, pct: number) => number,
): CampanaDelAlta | null {
  if (precio === null || !(precio > 0)) return null;
  let mejor: EtiquetaAlta | null = null;
  const rigen: EtiquetaAlta[] = [];
  for (const e of etiquetas) {
    if (e.descuentoPct === null || !(e.descuentoPct > 0)) continue;
    if ((e.vigenteDesde && e.vigenteDesde > hoy) || (e.vigenteHasta && e.vigenteHasta < hoy)) continue;
    rigen.push(e);
    if (!mejor || e.descuentoPct > (mejor.descuentoPct ?? 0)) mejor = e;
  }
  if (!mejor || mejor.descuentoPct === null) return null;
  const descuento = descuentoDe(precio, mejor.descuentoPct);
  return { nombre: mejor.nombre, pct: mejor.descuentoPct, hasta: mejor.vigenteHasta, descuento, precioFinal: Math.round((precio - descuento) * 100) / 100, otras: rigen
      .filter((e) => e !== mejor)
      .sort((a, b) => (b.descuentoPct ?? 0) - (a.descuentoPct ?? 0))
      .map((e) => ({ nombre: e.nombre, pct: e.descuentoPct ?? 0 })),
  };
}
