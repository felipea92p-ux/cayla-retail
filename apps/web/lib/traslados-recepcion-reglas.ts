// Recibir un traslado (ADR-0239, D-129 a D-132): las reglas puras de la pantalla de detalle, sin React ni red.
//
// EL PROBLEMA. Antes, quien recibía veía lo enviado y un botón «Coincide» que lo copiaba de un toque (se asumía en
// vez de contar), lo contado vivía solo en la pantalla (recargar lo borraba), si faltaba una prenda no entraba
// ninguna, y un envío equivocado no se podía deshacer. Ahora:
//  · Se cuenta a ciegas (D-130): prenda, código y «Contado». Lo enviado aparece recién con «Terminé de contar».
//  · Cada casilla se guarda sola (`registrar_recepcion_traslado`); al volver, lo contado sigue ahí.
//  · Entra al stock lo que coincide; solo la prenda con diferencia espera a un líder (D-129).
//  · Quien envió (o un líder) puede anular mientras nadie haya empezado a contar (D-132).
//
// Quién puede qué y cuándo entra el stock lo deciden las funciones de la base; esto solo decide qué se dibuja y
// con qué palabras.

import { MAX_VARIANTES_EN_URL, lineasEnUrl } from "./existencias-prendas";

// ---------------------------------------------------------------------------------------------------------------
// 1. Las prendas del traslado y lo contado
// ---------------------------------------------------------------------------------------------------------------

/** Una prenda (talla y color) del traslado, como la devuelve `fn_traslado_lineas`. */
export type LineaRecepcion = {
  varianteId: string;
  referencia: string;
  talla: string | null;
  color: string | null;
  /** El código interno viejo: casi ninguna prenda lo tiene en producción (144 de 146 vacías, 2026-09-26). */
  sku: string;
  /** El código de barras de la etiqueta: lo que la pistola lee y lo que la persona ve colgado en la prenda. */
  codigo: string | null;
  /** `null` = no venía en el envío (se anotó como prenda de más). */
  cantidadEnviada: number | null;
  /** `null` = todavía nadie la contó (la casilla se ve vacía, no en 0). */
  cantidadRecibida: number | null;
  /** Esa prenda ya entró al stock (D-129): no se vuelve a contar. */
  ingresado: boolean;
};

/** Lo que la persona cambió en esta pantalla, por prenda. `null` = borró la casilla (sin contar). */
export type Conteos = Record<string, number | null>;

/** Lo que vale la casilla: lo cambiado en la pantalla si lo hay; si no, lo que ya estaba guardado. */
export function valorContado(l: Pick<LineaRecepcion, "varianteId" | "cantidadRecibida">, conteos: Conteos): number | null {
  return Object.prototype.hasOwnProperty.call(conteos, l.varianteId) ? (conteos[l.varianteId] ?? null) : l.cantidadRecibida;
}

/** Una casilla nunca baja de 0: «−» sobre una prenda sin contar la deja en 0, no en −1. */
export function sumarAlConteo(actual: number | null, delta: number): number {
  return Math.max(0, (actual ?? 0) + delta);
}

/** Lo que se escribe en la casilla, ya leído: un entero de 0 en adelante, `null` si quedó vacía, o `undefined` si no
 *  es un número que se pueda contar («2.5», «-1», «dos»): ese tecleo se ignora. */
export function leerCasilla(texto: string): number | null | undefined {
  const t = texto.trim();
  if (t === "") return null;
  if (!/^\d+$/.test(t)) return undefined;
  return Number(t);
}

/** «Blusa Valentina S blanco»: como se nombra una prenda en una frase (el aviso, la consecuencia de cerrar). */
export function nombrePrenda(l: Pick<LineaRecepcion, "referencia" | "talla" | "color">): string {
  return [l.referencia, l.talla, l.color?.toLocaleLowerCase("es")].filter(Boolean).join(" ");
}

/** «1 prenda», «3 prendas». */
export function prendas(n: number): string {
  return `${n} ${n === 1 ? "prenda" : "prendas"}`;
}

/** Cómo quedó cada prenda comparada con lo enviado. */
export type Comparacion = "sin_contar" | "coincide" | "faltan" | "sobran" | "ya_en_stock";

export type LineaLeida = {
  varianteId: string;
  valor: number | null;
  /** Lo enviado (0 si no venía en el envío). */
  enviado: number;
  /** Contado − enviado; `null` si no se contó. */
  diferencia: number | null;
  comparacion: Comparacion;
};

export type LecturaConteo = {
  lineas: Map<string, LineaLeida>;
  /** Prendas enviadas: las que hay que contar. */
  enviadas: number;
  /** De esas, cuántas ya tienen un número (0 incluido). */
  contadas: number;
  /** Cuántas faltan por contar. */
  porContar: number;
  /** Todas las enviadas tienen número: se puede terminar de contar. */
  lista: boolean;
  unidadesEnviadas: number;
  unidadesContadas: number;
  /** Las que todavía no entraron al stock y coinciden: entran al confirmar. */
  coinciden: LineaRecepcion[];
  unidadesQueCoinciden: number;
  /** Las que todavía no entraron al stock y no coinciden (de menos o de más): esperan a un líder. */
  conDiferencia: LineaRecepcion[];
  /** Las que ya entraron al stock. */
  yaEnStock: number;
};

export function leerConteo(lineas: LineaRecepcion[], conteos: Conteos): LecturaConteo {
  const porId = new Map<string, LineaLeida>();
  const coinciden: LineaRecepcion[] = [];
  const conDiferencia: LineaRecepcion[] = [];
  let enviadas = 0;
  let contadas = 0;
  let unidadesEnviadas = 0;
  let unidadesContadas = 0;
  let unidadesQueCoinciden = 0;
  let yaEnStock = 0;
  for (const l of lineas) {
    const valor = valorContado(l, conteos);
    const enviado = l.cantidadEnviada ?? 0;
    const diferencia = valor === null ? null : valor - enviado;
    let comparacion: Comparacion;
    if (l.ingresado) comparacion = "ya_en_stock";
    else if (diferencia === null) comparacion = "sin_contar";
    else if (diferencia === 0) comparacion = "coincide";
    else comparacion = diferencia < 0 ? "faltan" : "sobran";
    porId.set(l.varianteId, { varianteId: l.varianteId, valor, enviado, diferencia, comparacion });

    if (l.cantidadEnviada !== null) {
      enviadas++;
      unidadesEnviadas += l.cantidadEnviada;
      if (valor !== null) contadas++;
    }
    if (valor !== null) unidadesContadas += valor;
    if (l.ingresado) yaEnStock++;
    else if (comparacion === "coincide") {
      // Una prenda de más contada en 0 «coincide» con nada: no entra nada ni espera a nadie.
      if (enviado > 0) {
        coinciden.push(l);
        unidadesQueCoinciden += enviado;
      }
    } else if (comparacion === "faltan" || comparacion === "sobran") conDiferencia.push(l);
  }
  const porContar = enviadas - contadas;
  return {
    lineas: porId,
    enviadas,
    contadas,
    porContar,
    lista: porContar === 0,
    unidadesEnviadas,
    unidadesContadas,
    coinciden,
    unidadesQueCoinciden,
    conDiferencia,
    yaEnStock,
  };
}

/** «Falta 1 prenda por contar», «Faltan 3 prendas por contar». */
export function textoPorContar(n: number): string {
  return n === 1 ? "Falta 1 prenda por contar" : `Faltan ${n} prendas por contar`;
}

// ---------------------------------------------------------------------------------------------------------------
// 2. El guardado línea por línea
// ---------------------------------------------------------------------------------------------------------------

/** Cuánto se espera después del último toque antes de guardar una prenda: tres toques seguidos al «+» son un solo
 *  viaje a la base, no tres. */
export const MS_AGRUPAR_GUARDADO = 600;

export type EstadoGuardado =
  | { tipo: "espera" }
  | { tipo: "guardando" }
  | { tipo: "guardado" }
  | { tipo: "error"; mensaje: string };

export type ResumenGuardado = { pendientes: number; errores: number };

export function resumirGuardado(estados: Record<string, EstadoGuardado | undefined>): ResumenGuardado {
  const r: ResumenGuardado = { pendientes: 0, errores: 0 };
  for (const e of Object.values(estados)) {
    if (!e) continue;
    if (e.tipo === "espera" || e.tipo === "guardando") r.pendientes++;
    else if (e.tipo === "error") r.errores++;
  }
  return r;
}

/** «Terminé de contar»: se puede cuando cada prenda enviada tiene un número y nada quedó sin guardar (lo que está
 *  guardándose se espera al apretar). `motivo` es lo que se lee junto al botón apagado: nunca un botón gris sin decir
 *  por qué. */
export function puedeTerminar(lectura: Pick<LecturaConteo, "porContar">, guardado: ResumenGuardado): { habilitado: boolean; motivo: string | null } {
  if (lectura.porContar > 0) return { habilitado: false, motivo: textoPorContar(lectura.porContar) };
  if (guardado.errores > 0) return { habilitado: false, motivo: guardado.errores === 1 ? "1 prenda no se guardó: reintenta" : `${guardado.errores} prendas no se guardaron: reintenta` };
  return { habilitado: true, motivo: null };
}

// ---------------------------------------------------------------------------------------------------------------
// 3. El escáner y la búsqueda
// ---------------------------------------------------------------------------------------------------------------

function normalizar(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Una prenda del catálogo, lo justo para reconocerla por cualquiera de sus códigos. */
export type PrendaDelCatalogo = { varianteId: string; sku: string | null; codigosBarras: string[] };

/** Las prendas DEL TRASLADO que calzan con lo escrito, palabra por palabra y en cualquier orden, sin tildes ni
 *  mayúsculas: «vestido rosado m» encuentra «Vestido Antonella M rosado». Quien no tiene pistola escribe así. */
export function buscarEnTraslado(texto: string, lineas: LineaRecepcion[]): LineaRecepcion[] {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [];
  return lineas.filter((l) => {
    const pajar = normalizar([l.referencia, l.talla, l.color, l.codigo, l.sku].filter(Boolean).join(" "));
    // La talla es una palabra corta («m», «s»): tiene que calzar entera, o «m» traería toda prenda con una «m».
    const palabrasPajar = new Set(pajar.split(/\s+/));
    return palabras.every((p) => (p.length <= 2 ? palabrasPajar.has(p) : pajar.includes(p)));
  });
}

export type ResultadoEscaneo =
  /** Es una prenda del traslado: +1 a su casilla. */
  | { tipo: "linea"; varianteId: string }
  /** Es una prenda del catálogo que NO viene en este traslado. */
  | { tipo: "fuera"; varianteId: string }
  /** Lo escrito calza con varias prendas del traslado: hay que elegir. */
  | { tipo: "varias"; varianteIds: string[] }
  | { tipo: "nada" };

/** Qué hacer con lo que llegó al campo de escanear (la pistola manda el código y Enter).
 *  Primero el código exacto (el de la etiqueta, cualquier otro código de barras de la prenda o el interno); si no
 *  es un código, las palabras contra las prendas del traslado. */
export function resolverEscaneo(texto: string, lineas: LineaRecepcion[], catalogo: PrendaDelCatalogo[]): ResultadoEscaneo {
  const t = normalizar(texto);
  if (!t) return { tipo: "nada" };
  const enTraslado = new Set(lineas.map((l) => l.varianteId));
  const directa = lineas.find((l) => normalizar(l.codigo) === t || (l.sku && normalizar(l.sku) === t));
  if (directa) return { tipo: "linea", varianteId: directa.varianteId };
  const delCatalogo = catalogo.find((v) => (v.sku && normalizar(v.sku) === t) || v.codigosBarras.some((c) => normalizar(c) === t));
  if (delCatalogo) return enTraslado.has(delCatalogo.varianteId) ? { tipo: "linea", varianteId: delCatalogo.varianteId } : { tipo: "fuera", varianteId: delCatalogo.varianteId };
  const porPalabras = buscarEnTraslado(texto, lineas);
  if (porPalabras.length === 1) return { tipo: "linea", varianteId: porPalabras[0].varianteId };
  if (porPalabras.length > 1) return { tipo: "varias", varianteIds: porPalabras.map((l) => l.varianteId) };
  return { tipo: "nada" };
}

/** Lo que se le dice a quien escaneó algo que no suma a ninguna prenda. */
export function mensajeEscaneo(r: ResultadoEscaneo, origenNombre: string): string | null {
  switch (r.tipo) {
    case "fuera":
      return `Esa prenda no viene en este traslado. Apártala y avisa a ${origenNombre}.`;
    case "varias":
      return `Hay ${r.varianteIds.length} prendas que calzan con eso: elige la tuya en la lista.`;
    case "nada":
      return "No encontramos esa prenda. Escanea la etiqueta o escribe su nombre o su código.";
    case "linea":
      return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// 4. Confirmar: piso o almacén (D-131) y lo que va a pasar
// ---------------------------------------------------------------------------------------------------------------

/** Dónde se deja lo que llegó. `null` = lo de siempre (almacén en una tienda; en el Taller, su lugar único). */
export type DestinoRecepcion = "piso_venta" | "almacen_tienda" | null;

/** «al piso de venta de Tienda Lima», «al almacén de Tienda Lima», «al stock de Taller». */
export function lugarTexto(destino: DestinoRecepcion, sede: string): string {
  if (destino === "piso_venta") return `al piso de venta de ${sede}`;
  if (destino === "almacen_tienda") return `al almacén de ${sede}`;
  return `al stock de ${sede}`;
}

/** El aviso de éxito después de confirmar: lo que pasó de verdad (`unidades_ingresadas`) y dónde quedó. */
export function avisoRecepcion({
  numero,
  resultado,
  unidadesIngresadas,
  lineasConDiferencia,
  destino,
  sede,
  puedeCerrarDiferencia,
}: {
  numero: number;
  resultado: string;
  unidadesIngresadas: number;
  lineasConDiferencia: number;
  destino: DestinoRecepcion;
  sede: string;
  puedeCerrarDiferencia: boolean;
}): { titulo: string; detalle: string } {
  const entraron =
    unidadesIngresadas === 0
      ? "Ninguna prenda entró todavía."
      : `${unidadesIngresadas === 1 ? "Entró" : "Entraron"} ${prendas(unidadesIngresadas)} ${lugarTexto(destino, sede)}.`;
  if (resultado === "cerrada") return { titulo: `Traslado ${numero} recibido`, detalle: entraron };
  const espera = `${lineasConDiferencia === 1 ? "1 prenda con diferencia espera" : `${lineasConDiferencia} prendas con diferencia esperan`} a un líder`;
  return {
    titulo: `Traslado ${numero} recibido con diferencia`,
    detalle: `${entraron} ${espera}${puedeCerrarDiferencia ? ": revísalas y ciérralas abajo." : "."}`,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// 5. Cerrar con diferencia (solo líder): la consecuencia escrita antes de confirmar
// ---------------------------------------------------------------------------------------------------------------

function listaDePrendas(items: { nombre: string; n: number }[]): string {
  const partes = items.map((i) => (items.length > 1 || i.n > 1 ? `${i.nombre} (${i.n})` : i.nombre));
  const MAX = 5;
  return partes.length > MAX ? `${partes.slice(0, MAX).join(", ")} y ${partes.length - MAX} más` : partes.join(", ");
}

export type ConsecuenciaCierre = {
  /** Lo que entra al stock al cerrar (solo lo que todavía no había entrado). */
  entran: string;
  /** Lo que se da por perdido; `null` si no falta nada. */
  perdidas: string | null;
  /** Lo que llegó de más y entra también; `null` si no sobró nada. */
  deMas: string | null;
  unidadesPerdidas: number;
};

export function consecuenciaCierre(lineas: LineaRecepcion[], conteos: Conteos, { destino, sede }: { destino: DestinoRecepcion; sede: string }): ConsecuenciaCierre {
  let entranN = 0;
  const perdidas: { nombre: string; n: number }[] = [];
  const deMas: { nombre: string; n: number }[] = [];
  for (const l of lineas) {
    if (l.ingresado) continue;
    const v = valorContado(l, conteos) ?? 0;
    const e = l.cantidadEnviada ?? 0;
    entranN += v;
    if (e > v) perdidas.push({ nombre: nombrePrenda(l), n: e - v });
    if (v > e) deMas.push({ nombre: nombrePrenda(l), n: v - e });
  }
  const perdidasN = perdidas.reduce((a, p) => a + p.n, 0);
  const deMasN = deMas.reduce((a, p) => a + p.n, 0);
  return {
    entran: entranN === 0 ? "No entra ninguna prenda más al stock." : `${entranN === 1 ? "Entra" : "Entran"} ${prendas(entranN)} ${lugarTexto(destino, sede)}.`,
    perdidas:
      perdidasN === 0 ? null : `${perdidasN === 1 ? "Se da por perdida" : "Se dan por perdidas"} ${prendas(perdidasN)}: ${listaDePrendas(perdidas)}.`,
    deMas: deMasN === 0 ? null : `${deMasN === 1 ? "Llegó 1 prenda de más y también entra" : `Llegaron ${deMasN} prendas de más y también entran`}: ${listaDePrendas(deMas)}.`,
    unidadesPerdidas: perdidasN,
  };
}

/** Cerrar con diferencia y anular piden decir qué pasó: es lo único que queda para entender, meses después, por qué
 *  faltaron prendas o por qué volvió un envío. */
export const TEXTO_MINIMO = 5;
export function textoObligatorioValido(texto: string): boolean {
  return texto.trim().length >= TEXTO_MINIMO;
}

// ---------------------------------------------------------------------------------------------------------------
// 6. Anular un envío (D-132)
// ---------------------------------------------------------------------------------------------------------------

export type Anulacion = { mostrar: boolean; habilitado: boolean; porQueNo: string | null };

/** ¿Se ofrece «Anular envío»? A quien envió (la sede de origen) o a un líder, con el traslado en camino. Si la otra
 *  sede ya contó algo, el botón se ve apagado y dice por qué: la caja ya está allá y eso se resuelve contando. */
export function anulacion({
  estado,
  esOrigen,
  esLider,
  lineas,
  destinoNombre,
}: {
  estado: string;
  esOrigen: boolean;
  esLider: boolean;
  lineas: Pick<LineaRecepcion, "cantidadRecibida">[];
  destinoNombre: string;
}): Anulacion {
  if (estado !== "en_transito" || !(esOrigen || esLider)) return { mostrar: false, habilitado: false, porQueNo: null };
  if (lineas.some((l) => l.cantidadRecibida !== null)) {
    return { mostrar: true, habilitado: false, porQueNo: `${destinoNombre} ya empezó a contar: que registre lo que llegó.` };
  }
  return { mostrar: true, habilitado: true, porQueNo: null };
}

/** Lo que pasa al anular, escrito antes de confirmar. */
export function consecuenciaAnular(unidades: number, origenNombre: string, destinoNombre: string): string {
  const vuelven = unidades === 1 ? `La prenda vuelve al stock de ${origenNombre}.` : `Las ${unidades} prendas vuelven al stock de ${origenNombre}.`;
  return `${vuelven} ${destinoNombre} ya no verá este traslado por recibir.`;
}

// ---------------------------------------------------------------------------------------------------------------
// 7. Lo siguiente: después de recibir (ADR-0242 D-6.1, 2026-10-03)
// ---------------------------------------------------------------------------------------------------------------
//
// EL PROBLEMA. Recibir termina en «entraron 5 prendas al almacén», pero lo del almacén no se vende hasta bajarlo al piso, y
// nadie lo recuerda: en la caja salía «está en el almacén» con la prenda en la mano (hallazgo 1 del análisis del 26-sep). El
// modal de confirmar mandaba a «Reponer», que no es el nombre de la pantalla («Bajar al piso») y no llevaba a ningún lado.
// Ahora, bajo el título, dice qué sigue y lleva ahí con las prendas que acaban de entrar ya cargadas.

/** Cuánto dura «Lo siguiente» desde que entró lo último: pasada una semana el aviso sería ruido (Existencias ya sugiere qué colgar). */
export const DIAS_LO_SIGUIENTE = 7;

export type AccionLoSiguiente = { clave: "bajar" | "etiquetas"; texto: string; href: string; principal: boolean };
export type LoSiguiente = { intro: string; acciones: AccionLoSiguiente[] };

/**
 * Qué sigue después de recibir, solo para la sede que recibió y solo con lo que de verdad entró:
 *  · Si quedó en el ALMACÉN de una tienda: «Bajar estas al piso» (principal; abre Bajar al piso con las prendas que TODAVÍA están
 *    en el almacén, por escanear: el enlace dice QUÉ buscar, no cuánto, así que la cantidad la dan las lecturas) e «Imprimir
 *    etiquetas» de justo las unidades que entraron.
 *  · Si quedó en el PISO: solo «Imprimir etiquetas».
 *  · «Bajar al piso» exige el módulo Existencias (si no, el enlace llevaría a «Sin acceso»): sin él, no se ofrece.
 * Nada para quien envió, para una sede sin piso y almacén (el Taller: no hay a dónde bajar), ni cuando no entró ninguna prenda,
 * ni pasados `DIAS_LO_SIGUIENTE` días. Con más de `MAX_VARIANTES_EN_URL` prendas distintas el enlace se vuelve frágil: «Bajar al
 * piso» se abre sin lista y las etiquetas no se ofrecen.
 *
 * `bajables` (lo que hoy sigue en el almacén, el mismo cálculo de la pantalla de bajar): si ya se bajó o se apartó todo, no se
 * pide bajar nada —el botón llevaría a una lista vacía— y la tarjeta lo dice; si queda parte, el enlace lleva solo esa parte.
 * Sin él (no se pudo leer), se ofrece como si todo siguiera ahí: la pantalla de bajar descarta por su cuenta lo que no se puede.
 *
 * LÍMITE CONOCIDO: si un líder cierra una diferencia días después, la ventana cuenta desde ese cierre y las etiquetas abarcan
 * toda la caja, no solo lo que entró al cerrar: `fn_traslado_lineas` no dice cuándo entró cada línea. Con las prendas ya
 * vendidas esa lista reimprime de más; se arregla el día que esa función devuelva la fecha de cada ingreso.
 */
export function loSiguienteDeLaRecepcion(p: {
  esDestino: boolean;
  lugarRecibido: DestinoRecepcion;
  lineas: readonly Pick<LineaRecepcion, "varianteId" | "cantidadRecibida" | "ingresado">[];
  /** El traslado: las etiquetas vuelven a su detalle, no a Existencias. */
  trasladoId: string;
  /** Cuándo entró lo último: el cierre del líder si lo hubo, si no la confirmación. */
  ultimoIngresoIso: string | null;
  ahoraIso: string;
  veExistencias: boolean;
  sede: string;
  bajables?: ReadonlySet<string>;
  /** Cuántas de las que entraron se venden aquí a otro precio que en la tienda que envió (precio propio, Felipe 2026-10-09):
   *  su etiqueta dice otro precio. Con alguna, imprimir manda y la frase lo dice primero. */
  conOtroPrecio?: number;
}): LoSiguiente | null {
  if (!p.esDestino || p.lugarRecibido === null || p.ultimoIngresoIso === null) return null;
  const dias = (new Date(p.ahoraIso).getTime() - new Date(p.ultimoIngresoIso).getTime()) / 86_400_000;
  if (!(dias <= DIAS_LO_SIGUIENTE)) return null;
  const entradas = p.lineas
    .filter((l) => l.ingresado && (l.cantidadRecibida ?? 0) > 0)
    .map((l) => ({ varianteId: l.varianteId, cantidad: l.cantidadRecibida as number }));
  if (entradas.length === 0) return null;
  const enLista = entradas.length <= MAX_VARIANTES_EN_URL;

  // Lo que todavía se puede bajar: lo que entró Y sigue en el almacén (si se sabe).
  const porBajar = p.bajables ? entradas.filter((e) => p.bajables!.has(e.varianteId)) : entradas;
  const ofreceBajar = p.lugarRecibido === "almacen_tienda" && p.veExistencias && porBajar.length > 0;

  const acciones: AccionLoSiguiente[] = [];
  if (ofreceBajar) {
    acciones.push(
      porBajar.length <= MAX_VARIANTES_EN_URL
        ? { clave: "bajar", texto: "Bajar estas al piso", href: `/inventario/bajar?lineas=${lineasEnUrl(porBajar)}`, principal: true }
        : { clave: "bajar", texto: "Bajar al piso", href: "/inventario/bajar", principal: true },
    );
  }
  const otroPrecio = p.conOtroPrecio ?? 0;
  if (enLista) {
    const etiquetas: AccionLoSiguiente = {
      clave: "etiquetas",
      texto: otroPrecio > 0 ? "Imprimir etiquetas con el precio de aquí" : "Imprimir etiquetas",
      href: `/etiquetas-de-precio?unidades=${lineasEnUrl(entradas)}&traslado=${p.trasladoId}`,
      principal: acciones.length === 0 || otroPrecio > 0,
    };
    // Con otro precio aquí, cambiar la etiqueta va primero: colgada con el precio de origen, la caja cobraría otro.
    if (otroPrecio > 0) {
      for (const a of acciones) a.principal = false;
      acciones.unshift(etiquetas);
    } else acciones.push(etiquetas);
  }
  if (acciones.length === 0) return null;

  const yaSalioDelAlmacen = p.lugarRecibido === "almacen_tienda" && p.bajables !== undefined && porBajar.length === 0;
  const dondeQuedo =
    p.lugarRecibido === "piso_venta"
      ? `Lo que llegó ya está en el piso de ${p.sede}.`
      : yaSalioDelAlmacen
        ? `Lo que llegó ya salió del almacén de ${p.sede}.`
        : `Lo que llegó quedó en el almacén de ${p.sede}. Para venderlo, hay que bajarlo al piso.`;
  return {
    intro:
      otroPrecio > 0 && enLista
        ? `${otroPrecio === 1 ? "1 prenda se vende" : `${otroPrecio} prendas se venden`} aquí a otro precio: cámbia${otroPrecio === 1 ? "le" : "les"} la etiqueta antes de colgar${otroPrecio === 1 ? "la" : "las"}. ${dondeQuedo}`
        : dondeQuedo,
    acciones,
  };
}
