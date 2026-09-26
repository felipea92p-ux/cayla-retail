// Recibir un traslado (ADR-0238, D-129 a D-132): las reglas puras de la pantalla de detalle, sin React ni red.
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
// con qué palabras. Las fechas humanas («hoy 12:12») se reusan de `traslados-reglas.ts`.

import { debioLlegar, diaHora, enTexto, haceTexto } from "./traslados-reglas";

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

/** La insignia de cada prenda en la comparación (después de «Terminé de contar» o con el traslado ya recibido). */
export function insigniaComparacion(l: LineaLeida, { recontable }: { recontable: boolean }): { texto: string; tono: "verde" | "rojo" | "ambar" | "neutro" | "pizarra" } {
  switch (l.comparacion) {
    case "ya_en_stock":
      return { texto: "Ya en stock", tono: "verde" };
    case "coincide":
      return { texto: "Coincide", tono: "verde" };
    case "sin_contar":
      return { texto: "Sin contar", tono: "neutro" };
    case "faltan":
    case "sobran": {
      // Mientras se puede volver a contar, la insignia dice qué hacer; después, solo qué pasó.
      if (recontable) return { texto: "Vuelve a contarla", tono: l.comparacion === "faltan" ? "rojo" : "ambar" };
      const n = Math.abs(l.diferencia ?? 0);
      return l.comparacion === "faltan" ? { texto: n === 1 ? "Falta 1" : `Faltan ${n}`, tono: "rojo" } : { texto: n === 1 ? "Sobra 1" : `Sobran ${n}`, tono: "ambar" };
    }
  }
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

/** Lo que se lee en el modal antes de confirmar. */
export function resumenAntesDeConfirmar(
  lectura: Pick<LecturaConteo, "coinciden" | "unidadesQueCoinciden" | "conDiferencia" | "lineas">,
  { destino, sede }: { destino: DestinoRecepcion; sede: string },
): { entran: string; esperan: string | null; detalleEsperan: string[] } {
  const n = lectura.unidadesQueCoinciden;
  const entran =
    n === 0
      ? "Ninguna prenda coincide con lo enviado: nada entra al stock todavía."
      : `${n === 1 ? "Entra" : "Entran"} ${prendas(n)} que ${n === 1 ? "coincide" : "coinciden"} ${lugarTexto(destino, sede)}.`;
  const m = lectura.conDiferencia.length;
  if (m === 0) return { entran, esperan: null, detalleEsperan: [] };
  const resto = n === 0 ? "" : destino === "piso_venta" ? "; las demás ya se pueden vender" : "; las demás ya entran al stock";
  const esperan = `${m === 1 ? "1 prenda con diferencia espera" : `${m} prendas con diferencia esperan`} a un líder${resto}.`;
  const detalleEsperan = lectura.conDiferencia.map((l) => {
    const leida = lectura.lineas.get(l.varianteId);
    const contado = leida?.valor ?? 0;
    return l.cantidadEnviada === null ? `${nombrePrenda(l)}: no venía en el envío, contaste ${contado}` : `${nombrePrenda(l)}: enviaron ${l.cantidadEnviada}, contaste ${contado}`;
  });
  return { entran, esperan, detalleEsperan };
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
// 7. El recorrido del detalle: salió → en camino → recibido → cerrado (o salió → anulado)
// ---------------------------------------------------------------------------------------------------------------

export type EstadoPaso = "hecho" | "actual" | "urgente" | "alerta" | "pendiente" | "anulado";

export type PasoRecorrido = {
  clave: "salio" | "camino" | "recibido" | "cerrado" | "anulado";
  titulo: string;
  lineas: string[];
  estado: EstadoPaso;
};

export type TrasladoParaRecorrido = {
  estado: string;
  ubicacionOrigenNombre: string;
  ubicacionDestinoNombre: string;
  fechaEstimadaLlegada: string | null;
  creadoEn: string;
  /** Desde ADR-0238 lo marca SOLO «Confirmar recepción» (contar una casilla ya no lo toca). */
  confirmadoEn: string | null;
  cerradoEn: string | null;
  anuladoEn: string | null;
  creadoPorNombre: string;
  confirmadoPorNombre: string | null;
  cerradoPorNombre: string | null;
  anuladoPorNombre: string | null;
};

export function recorridoRecepcion(
  t: TrasladoParaRecorrido,
  ctx: { esDestino: boolean; meTocaCerrar: boolean; contadas: number; enviadas: number; huboDiferencia: boolean; ahoraIso: string },
): PasoRecorrido[] {
  const { ahoraIso } = ctx;
  const eta = t.fechaEstimadaLlegada;
  const enTransito = t.estado === "en_transito";
  // «completada» es el modelo anterior (antes del 16-sep): el traslado entraba al instante, sin tramo en camino.
  const instantaneo = t.estado === "completada";
  const conDiferencia = t.estado === "recibido_con_diferencia" || ctx.huboDiferencia;

  const salio: PasoRecorrido = {
    clave: "salio",
    titulo: `Salió de ${t.ubicacionOrigenNombre}`,
    lineas: [diaHora(t.creadoEn, ahoraIso), `Envió ${t.creadoPorNombre}`],
    estado: "hecho",
  };

  // Anulado es un final: después no hay «en camino» ni «recibido» que mostrar.
  if (t.estado === "anulada") {
    const lineas = [t.anuladoEn ? diaHora(t.anuladoEn, ahoraIso) : "—"];
    if (t.anuladoPorNombre) lineas.push(`Anuló ${t.anuladoPorNombre}`);
    lineas.push(`Las prendas volvieron a ${t.ubicacionOrigenNombre}`);
    return [salio, { clave: "anulado", titulo: "Envío anulado", lineas, estado: "anulado" }];
  }

  let camino: PasoRecorrido;
  if (enTransito) {
    const atrasado = debioLlegar(eta, ahoraIso);
    // Rojo solo para quien tiene la caja por recibir; para quien la mandó, es un dato.
    const estado: EstadoPaso = atrasado && ctx.esDestino ? "urgente" : "actual";
    camino = !eta
      ? { clave: "camino", titulo: "En camino", lineas: ["Sin hora estimada"], estado }
      : atrasado
        ? { clave: "camino", titulo: "En camino", lineas: [`Se esperaba ${diaHora(eta, ahoraIso)}`, haceTexto(eta, ahoraIso)], estado }
        : { clave: "camino", titulo: "En camino", lineas: [`Llega ${diaHora(eta, ahoraIso)}`, enTexto(eta, ahoraIso)], estado };
  } else {
    camino = { clave: "camino", titulo: "En camino", lineas: [instantaneo ? "Traslado al instante (modelo anterior)" : eta ? `Estimado ${diaHora(eta, ahoraIso)}` : "Sin hora estimada"], estado: "hecho" };
  }

  const tituloRecibido = `Recibido en ${t.ubicacionDestinoNombre}`;
  let recibido: PasoRecorrido;
  if (enTransito) {
    recibido =
      ctx.contadas > 0
        ? { clave: "recibido", titulo: tituloRecibido, lineas: [`Contando: ${ctx.contadas} de ${prendas(ctx.enviadas)}`], estado: "actual" }
        : { clave: "recibido", titulo: tituloRecibido, lineas: [ctx.esDestino ? "Cuéntalo apenas llegue" : `Lo cuenta ${t.ubicacionDestinoNombre}`], estado: "pendiente" };
  } else {
    const cuando = t.confirmadoEn ?? t.cerradoEn ?? t.creadoEn;
    const lineas = [diaHora(cuando, ahoraIso)];
    if (t.confirmadoPorNombre) lineas.push(`Confirmó ${t.confirmadoPorNombre}`);
    if (conDiferencia) lineas.push("Con diferencia");
    recibido = { clave: "recibido", titulo: tituloRecibido, lineas, estado: conDiferencia ? "alerta" : "hecho" };
  }

  let cerrado: PasoRecorrido;
  if (t.estado === "recibido_con_diferencia") {
    cerrado = { clave: "cerrado", titulo: "Cerrado", lineas: ["Lo que coincidió ya está en stock", ctx.meTocaCerrar ? "Te toca cerrar la diferencia" : "La diferencia espera a un líder"], estado: "actual" };
  } else if (enTransito) {
    cerrado = { clave: "cerrado", titulo: "Cerrado", lineas: ["Se cierra solo si todo coincide"], estado: "pendiente" };
  } else {
    const lineas = [diaHora(t.cerradoEn ?? t.confirmadoEn ?? t.creadoEn, ahoraIso)];
    lineas.push(t.cerradoPorNombre ? `Cerró ${t.cerradoPorNombre}` : "Stock actualizado");
    cerrado = { clave: "cerrado", titulo: "Cerrado", lineas, estado: "hecho" };
  }

  return [salio, camino, recibido, cerrado];
}
