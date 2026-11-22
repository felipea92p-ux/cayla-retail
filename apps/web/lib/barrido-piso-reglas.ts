// «El barrido del piso» (ADR-0690): la lógica pura de la pantalla `/inventario/barrido`. Sin React ni red, para probarla entera.
//
// EL PROBLEMA. En Trujillo bajan prendas del almacén y no registran la bajada: el sistema ya no sabe qué está colgado. Felipe
// (2026-11-22) pide escanear lo COLGADO entre una y cinco personas a la vez, que entran y salen a mitad, sin repartirse áreas, y
// que cada lectura quede con quién y a qué hora. Cada lectura es una fila en la base (`registrar_lecturas_barrido`); el total de
// una prenda es la suma de las lecturas de todo el equipo.
//
// CONTRATO
//   PROMETE: armar cada lectura con su id (lo genera el aparato: un reenvío no cuenta doble) y la firma de quien escaneó EN ESE
//            MOMENTO; sacar de la cola lotes de una sola firma (si alguien cambia el combo, lo ya leído sigue a nombre de quien lo
//            leyó); leer lo que devuelve la base sin confiar en su forma; traducir sus rechazos a palabras de tienda.
//   ASUME:   la base suma y valida (`registrar_lecturas_barrido`): ninguna cifra del equipo sale de aquí, solo se copia la suya.
//   NO HACE: no mueve stock ni decide nada del cuadre (eso es la actividad 5, al confirmar).

import type { Firma } from "./responsable-reglas";
import type { PrendaConteo } from "./conteo-reglas";
import type { CampoDeGuia } from "./guia-campos";

export const RPC_ABRIR_BARRIDO = "abrir_barrido_piso";
export const RPC_REGISTRAR_LECTURAS = "registrar_lecturas_barrido";
export const RPC_ESTADO_BARRIDO = "fn_barrido_piso_estado";
/** Lo que la base acepta por llamada (`registrar_lecturas_barrido`). */
export const LECTURAS_POR_LOTE = 300;
/** Lo máximo que una lectura puede sumar de una vez («Cambiar cantidad»): el mismo tope de la base (`cantidad between 1 and 500`). */
export const LECTURA_MAX = 500;
/** Tras un fallo de red, cuánto se espera para volver a subir lo que quedó en la cola. */
export const REINTENTO_MS = 4000;

export type PrendaBarrido = PrendaConteo & { marca?: string | null };

/** Una lectura en la cola de este aparato, antes y mientras sube. */
export type LecturaBarrido = {
  id: string;
  varianteId: string;
  cantidad: number;
  codigo: string | null;
  /** Hora del aparato al leer (ISO). */
  leidaEnAparato: string;
  /** Quién escaneó en ese momento: el lote sale con ESTA firma, aunque después se cambie el combo. `null` en una terminal con firma
   *  de respaldo (ADR-0454): no elige a nadie y la base firma a nombre de su persona. */
  firma: Firma | null;
};

export type PersonaBarrido = { personaId: string; nombre: string; unidades: number; lecturas: number; ultima: string };

export type BarridoAbierto = {
  id: string;
  abiertoEn: string;
  abiertoPor: string | null;
  unidades: number;
  lecturas: number;
  prendas: number;
  porPrenda: Record<string, number>;
  personas: PersonaBarrido[];
  /** Lo apartado (sin etiqueta o código desconocido, actividad 4) que sigue contando. */
  aparte: number;
};

export type EstadoBarrido = { separa: boolean; barrido: BarridoAbierto | null };

const esObjeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const entero = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? Math.trunc(x) : Number.parseInt(String(x ?? ""), 10) || 0);
const texto = (x: unknown): string | null => (typeof x === "string" && x.trim() ? x : null);

/** `[{variante_id, cantidad}]` → `{ varianteId: cantidad }`. Lo que no tiene forma se ignora. */
export function leerPorPrenda(x: unknown): Record<string, number> {
  const res: Record<string, number> = {};
  if (!Array.isArray(x)) return res;
  for (const fila of x) {
    if (!esObjeto(fila)) continue;
    const id = texto(fila.variante_id);
    if (id) res[id] = entero(fila.cantidad);
  }
  return res;
}

function leerPersonas(x: readonly unknown[]): PersonaBarrido[] {
  return x.filter(esObjeto).flatMap((p) => {
    const personaId = texto(p.persona_id);
    if (!personaId) return [];
    return [{ personaId, nombre: texto(p.nombre) ?? "Alguien del equipo", unidades: entero(p.unidades), lecturas: entero(p.lecturas), ultima: texto(p.ultima) ?? "" }];
  });
}

/** Lo que devuelve `fn_barrido_piso_estado` (o el `estado` de `abrir_barrido_piso`). Con una forma rara, «no hay barrido». */
export function leerEstadoBarrido(x: unknown): EstadoBarrido {
  if (!esObjeto(x)) return { separa: false, barrido: null };
  const separa = x.separa === true;
  const b = x.barrido;
  if (!esObjeto(b) || !texto(b.id)) return { separa, barrido: null };
  const personas = Array.isArray(b.personas) ? leerPersonas(b.personas) : [];
  return {
    separa,
    barrido: {
      id: b.id as string,
      abiertoEn: texto(b.abierto_en) ?? "",
      abiertoPor: texto(b.abierto_por),
      unidades: entero(b.unidades),
      lecturas: entero(b.lecturas),
      prendas: entero(b.prendas),
      porPrenda: leerPorPrenda(b.por_prenda),
      personas,
      aparte: entero(b.aparte),
    },
  };
}

/** Lo que devuelve `registrar_lecturas_barrido`. `personas`: lo de cada persona tras el lote (null si la base no lo trajo). */
export type RespuestaLecturas = { guardadas: number; yaEstaban: number; unidades: number; porPrenda: Record<string, number>; personas: PersonaBarrido[] | null };

export function leerRespuestaLecturas(x: unknown): RespuestaLecturas | null {
  if (!esObjeto(x)) return null;
  return {
    guardadas: entero(x.guardadas),
    yaEstaban: entero(x.ya_estaban),
    unidades: entero(x.unidades),
    porPrenda: leerPorPrenda(x.por_prenda),
    personas: Array.isArray(x.personas) ? leerPersonas(x.personas) : null,
  };
}

/** Una lectura nueva: una unidad de esa prenda, con la firma de quien escanea ahora. */
export function nuevaLectura(p: { id: string; varianteId: string; codigo: string | null; ahora: Date; firma: Firma | null; cantidad?: number }): LecturaBarrido {
  return {
    id: p.id,
    varianteId: p.varianteId,
    cantidad: p.cantidad ?? 1,
    codigo: p.codigo?.trim() ? p.codigo.trim().slice(0, 120) : null,
    leidaEnAparato: p.ahora.toISOString(),
    firma: p.firma,
  };
}

const mismaFirma = (a: Firma | null, b: Firma | null) => (a === null || b === null ? a === b : a.responsableId === b.responsableId && a.ubicacionId === b.ubicacionId);

/**
 * El siguiente lote que sube: las primeras lecturas de la cola, en orden, mientras tengan la MISMA firma que la primera
 * (si alguien cambió el combo a mitad, lo de antes sube a nombre de quien lo leyó), hasta `LECTURAS_POR_LOTE`.
 * Una lectura en `aislar` (su lote ya fue rechazado por la base) sube SOLA: así se encuentra la mala sin perder las buenas.
 */
export function siguienteLote(cola: readonly LecturaBarrido[], max = LECTURAS_POR_LOTE, aislar: ReadonlySet<string> = new Set()): LecturaBarrido[] {
  const primera = cola[0];
  if (!primera) return [];
  if (aislar.has(primera.id)) return [primera];
  const lote: LecturaBarrido[] = [];
  for (const l of cola) {
    if (lote.length >= max || !mismaFirma(l.firma, primera.firma) || aislar.has(l.id)) break;
    lote.push(l);
  }
  return lote;
}

/**
 * La hora que viaja con la firma del lote (`x-momento`): la de la PRIMERA lectura, no la de subir. Así la base mira si quien
 * escaneó estaba de turno cuando escaneó (como la venta sin conexión): Ana escanea sin red, marca su salida, y lo suyo igual
 * entra cuando vuelve la red. Nunca en el futuro: la base no acepta más de 5 minutos adelante y un reloj adelantado trabaría la cola.
 */
export function momentoDelLote(lote: readonly LecturaBarrido[], ahora: Date): string | null {
  const t = Date.parse(lote[0]?.leidaEnAparato ?? "");
  if (!Number.isFinite(t)) return null;
  return new Date(Math.min(t, ahora.getTime())).toISOString();
}

/** Los rechazos que paran TODO el aparato (el barrido se cerró, la cuenta ya no puede): ninguna otra lectura subiría. */
const FRENAN_TODO = new Set(["barrido_cerrado", "barrido_no_existe", "barrido_sin_modulo", "barrido_sin_tienda", "barrido_sin_permiso", "barrido_tienda_sin_piso"]);
/** Códigos de Postgres que son de paso (se cortó la conexión, la base estaba ocupada o tardó): se reintenta. */
const DE_PASO = /^(08|53|57|40001|40P01)/;

/**
 * Qué hacer con un error al subir un lote:
 *  · `red`: no hubo respuesta de la base (sin red, 5xx, tiempo agotado, la base ocupada) → el lote se queda en la cola y se
 *    reintenta solo;
 *  · `frena_todo`: el barrido se cerró o la cuenta ya no puede → se para todo y se dice por qué;
 *  · `aparta`: la base RESPONDIÓ que no a ESE lote (una persona que ya no está de turno, una lectura mal formada, una prenda que
 *    se borró) → reintentarlo daría lo mismo para siempre y taparía lo que viene detrás: se aparta con su motivo y lo demás sigue.
 */
export function clasificarError(e: { code?: string | null; hint?: string | null } | null | undefined): "red" | "frena_todo" | "aparta" {
  if (!e) return "red";
  if (e.hint && FRENAN_TODO.has(e.hint)) return "frena_todo";
  const code = e.code ?? "";
  if (/^[0-9A-Z]{5}$/.test(code) && !DE_PASO.test(code)) return "aparta";
  return "red";
}

/** El lote como lo pide la base (sin la firma: va en los encabezados). */
export function loteParaLaBase(lote: readonly LecturaBarrido[]) {
  return lote.map((l) => ({ id: l.id, variante_id: l.varianteId, cantidad: l.cantidad, codigo: l.codigo, leida_en_aparato: l.leidaEnAparato }));
}

/** Saca de la cola las lecturas que la base ya guardó. */
export function sinLasSubidas(cola: readonly LecturaBarrido[], subidas: readonly LecturaBarrido[]): LecturaBarrido[] {
  const ids = new Set(subidas.map((l) => l.id));
  return cola.filter((l) => !ids.has(l.id));
}

/**
 * Lo que el equipo lleva de cada prenda, a la vista: lo que dijo la base + lo que este aparato leyó y todavía no subió. La
 * base solo devuelve las prendas del lote, así que se mezcla con lo que ya se sabía.
 */
export function porPrendaALaVista(base: Record<string, number>, cola: readonly LecturaBarrido[]): Record<string, number> {
  const res = { ...base };
  for (const l of cola) res[l.varianteId] = (res[l.varianteId] ?? 0) + l.cantidad;
  return res;
}

/** «M · Rojo · CAYLA»: talla, color y marca de una prenda, lo que haya. */
export function detalleDePrenda(p: Pick<PrendaBarrido, "talla" | "color" | "marca">): string {
  return [p.talla, p.color, p.marca].filter((x): x is string => Boolean(x && x.trim())).join(" · ");
}

/** «Ana y Rosa están escaneando» / «Ana está escaneando» / «Ana, Rosa y 2 más están escaneando». Solo quienes leyeron en los
 *  últimos `minutos` (por defecto 10): quien ya se fue no aparece. */
export function quienesEscanean(personas: readonly PersonaBarrido[], ahora: Date, minutos = 10): string | null {
  const desde = ahora.getTime() - minutos * 60_000;
  const activas = personas.filter((p) => {
    const t = Date.parse(p.ultima);
    return Number.isFinite(t) && t >= desde;
  });
  if (activas.length === 0) return null;
  const nombres = activas.map((p) => p.nombre.split(" ")[0] || p.nombre);
  const verbo = activas.length === 1 ? "está escaneando" : "están escaneando";
  if (nombres.length === 1) return `${nombres[0]} ${verbo}`;
  if (nombres.length === 2) return `${nombres[0]} y ${nombres[1]} ${verbo}`;
  const resto = nombres.length - 2;
  return `${nombres[0]}, ${nombres[1]} y ${resto} más ${verbo}`;
}

/** Los rechazos de la base, en palabras de tienda. `null`: no es de las que conocemos (se muestra el mensaje de la base). */
export function textoDeRechazo(hint: string | null | undefined): string | null {
  switch (hint) {
    case "barrido_cerrado":
      return "Este barrido ya se cerró. Lo que escaneaste después no se sumó.";
    case "barrido_no_existe":
      return "Ese barrido ya no existe. Recarga la página.";
    case "barrido_sin_modulo":
      return "Para escanear en el barrido hace falta ver Existencias en tu rol.";
    case "barrido_sin_tienda":
    case "barrido_sin_permiso":
      return "Este barrido es de otra tienda. Elige tu tienda arriba.";
    case "barrido_tienda_sin_piso":
      return "Esta tienda todavía no separa piso y almacén: no hay piso que barrer.";
    case "responsable_requerido":
      return "Elige quién está escaneando.";
    case "barrido_prenda_desconocida":
      return "Una prenda escaneada ya no está en el catálogo.";
    case "responsable_no_presente":
      return "Quien escaneó no estaba de turno a esa hora, así que no se guardó.";
    case "responsable_sin_acceso":
    case "ubicacion_requerida":
      return "Quien escaneó no puede guardar en esta tienda.";
    case "barrido_lecturas_invalidas":
      return "La lectura llegó mal formada (la cantidad va de 1 a 500).";
    case "barrido_lectura_reusada":
      return "Esa lectura ya se había guardado con otros datos.";
    case "barrido_no_es_inventario":
      return "La «Prenda sin registrar» no se escanea en un barrido.";
    case "barrido_lectura_ajena":
      return "Alguna de esas lecturas no es de este barrido. Vuelve a abrir «Ver lo escaneado».";
    case "barrido_anular_invalido":
      return "No se pudo quitar: vuelve a intentarlo.";
    default:
      return null;
  }
}


/**
 * La guía de foco del barrido (ADR-0284): primero quién escanea (sin eso la base no guarda nada: `responsable_requerido`) y después
 * lo colgado. Antes de abrir el barrido solo cuenta quién (el botón «Empezar» no pide prendas). Sale de lo que la base ya exige.
 */
export function camposGuiaBarrido({ responsableListo, escaneadas, abierto }: { responsableListo: boolean; escaneadas: number; abierto: boolean }): CampoDeGuia[] {
  const quien: CampoDeGuia = { id: "responsable", nombre: "Quién escanea", requerido: true, hecho: responsableListo, pendiente: "Elige tu nombre: cada prenda que escanees queda a tu nombre." };
  if (!abierto) return [quien];
  return [quien, { id: "colgado", nombre: "Lo colgado", requerido: true, hecho: escaneadas > 0, pendiente: "Escanea las prendas colgadas, una tras otra." }];
}

// ---------------------------------------------------------------------------------------------------------------------
// Varias personas a la vez (actividad 2): la puesta al día, «tú», quién está y la cola que sobrevive a un corte.
// ---------------------------------------------------------------------------------------------------------------------

/** Cada cuánto se pregunta a la base qué lleva el equipo mientras la pantalla está a la vista. Preguntar y no escuchar en vivo
 *  (ADR-0690): escuchar pediría abrir la lectura de las tablas a cada cuenta (una política más, pegada aparte), y para cinco
 *  celulares durante una hora preguntar cada 5 s es barato y aguanta los cortes sin reconectar nada. */
export const INTERVALO_ESTADO_MS = 5000;
export const VERSION_COLA_BARRIDO = 2;
/** Lo leído sin subir dura en el aparato hasta un día: un barrido se hace en la jornada. */
export const HORAS_DE_VIDA_DE_LA_COLA = 24;

/** Una lectura que la base rechazó, apartada con su motivo para que la persona decida (reintentar o descartar). */
export type LecturaApartada = LecturaBarrido & { motivo: string };

/** Lo que este aparato todavía no subió: la cola y lo apartado. */
export type ColaGuardada = { cola: LecturaBarrido[]; apartadas: LecturaApartada[] };

/** Todas las colas de UNA sede en este aparato empiezan así. Por sede y no por cuenta: el celular de la tienda lo usan varias personas. */
export function prefijoColaBarrido(ubicacionId: string): string {
  return `cayla-barrido-cola:${ubicacionId}:`;
}

/**
 * La cola de ESTA pantalla abierta (`instancia`: un id por pantalla). Una clave por pantalla y no una por sede: dos pestañas del
 * mismo celular escribiendo la misma clave se borraban la cola la una a la otra. Al abrir, una pantalla recoge las de las demás
 * (`recogerColas`); subir dos veces lo mismo no duplica (la base es idempotente por id).
 */
export function claveColaBarrido(ubicacionId: string, instancia: string): string {
  return `${prefijoColaBarrido(ubicacionId)}${instancia}`;
}

export function serializarCola(barridoId: string, guardada: ColaGuardada, ahora: Date): string {
  return JSON.stringify({ v: VERSION_COLA_BARRIDO, barridoId, guardadaEn: ahora.toISOString(), cola: guardada.cola, apartadas: guardada.apartadas });
}

const esFirma = (x: unknown): x is Firma => esObjeto(x) && typeof x.responsableId === "string" && typeof x.ubicacionId === "string";
const esLectura = (x: unknown): x is LecturaBarrido =>
  esObjeto(x) &&
  typeof x.id === "string" &&
  typeof x.varianteId === "string" &&
  typeof x.cantidad === "number" &&
  Number.isInteger(x.cantidad) &&
  x.cantidad >= 1 &&
  x.cantidad <= LECTURA_MAX &&
  (x.codigo === null || typeof x.codigo === "string") &&
  typeof x.leidaEnAparato === "string" &&
  (x.firma === null || esFirma(x.firma));

const VACIA: ColaGuardada = { cola: [], apartadas: [] };

/**
 * Lo que quedó sin subir en una clave, solo si es de ESTE barrido y no está vencido. Una cola de otro barrido (ya cerrado) o
 * con una forma rara no se reenvía: la base la rechazaría entera. Nunca lanza.
 */
export function leerColaGuardada(texto: string | null, barridoId: string, ahora: Date): ColaGuardada {
  if (!texto) return VACIA;
  try {
    const x: unknown = JSON.parse(texto);
    if (!esObjeto(x) || x.v !== VERSION_COLA_BARRIDO || x.barridoId !== barridoId || !Array.isArray(x.cola)) return VACIA;
    const guardada = Date.parse(String(x.guardadaEn));
    if (!Number.isFinite(guardada) || ahora.getTime() - guardada > HORAS_DE_VIDA_DE_LA_COLA * 3_600_000) return VACIA;
    const apartadas = Array.isArray(x.apartadas)
      ? x.apartadas.filter((a): a is LecturaApartada => esLectura(a) && typeof (a as { motivo?: unknown }).motivo === "string")
      : [];
    return { cola: x.cola.filter(esLectura), apartadas };
  } catch {
    return VACIA;
  }
}

/** Junta varias colas guardadas (la propia y las que dejaron otras pantallas) sin repetir una lectura: manda la primera vez que aparece. */
export function juntarColas(...colas: readonly ColaGuardada[]): ColaGuardada {
  const vistos = new Set<string>();
  const unica = <T extends LecturaBarrido>(l: T) => (vistos.has(l.id) ? false : (vistos.add(l.id), true));
  const cola = colas.flatMap((c) => c.cola).filter(unica);
  const apartadas = colas.flatMap((c) => c.apartadas).filter(unica);
  return { cola, apartadas };
}

/** «Escaneaste tú»: lo que la base ya tiene de esta persona más lo suyo que falta subir en este aparato. */
export function unidadesDe(personaId: string | null, personas: readonly PersonaBarrido[], cola: readonly LecturaBarrido[]): number {
  if (!personaId) return 0;
  const enBase = personas.find((p) => p.personaId === personaId)?.unidades ?? 0;
  const enCola = cola.filter((l) => l.firma?.responsableId === personaId).reduce((a, l) => a + l.cantidad, 0);
  return enBase + enCola;
}

/** Qué pasa con lo que leyó este aparato, en una línea. */
export function textoDeSubida({ enCola, enLinea, frenada }: { enCola: number; enLinea: boolean; frenada: string | null }): string {
  if (frenada) return "No se pudo guardar: mira el aviso";
  if (enCola === 0) return "Todo guardado";
  if (!enLinea) return enCola === 1 ? "Sin conexión: 1 espera en este celular" : `Sin conexión: ${enCola.toLocaleString("es-PE")} esperan en este celular`;
  return enCola === 1 ? "Guardando 1…" : `Guardando ${enCola.toLocaleString("es-PE")}…`;
}

/** «hace 3 min», «hace 1 h», «ahora». */
export function haceCuanto(iso: string, ahora: Date): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const min = Math.floor((ahora.getTime() - t) / 60_000);
  if (min < 1) return "ahora";
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h`;
}

/** Las personas del barrido, de la que leyó último a la primera, con su primer nombre y si sigue escaneando (10 min). */
export function personasDelBarrido(personas: readonly PersonaBarrido[], ahora: Date, minutos = 10) {
  return [...personas]
    .sort((a, b) => Date.parse(b.ultima) - Date.parse(a.ultima))
    .map((p) => ({
      personaId: p.personaId,
      nombre: p.nombre.split(" ")[0] || p.nombre,
      unidades: p.unidades,
      hace: haceCuanto(p.ultima, ahora),
      activa: ahora.getTime() - Date.parse(p.ultima) <= minutos * 60_000,
    }));
}

// ---------------------------------------------------------------------------------------------------------------------
// Corregir mientras se cuenta (actividad 3): «Ver lo escaneado», en tramos por persona, y quitar sin borrar.
// ---------------------------------------------------------------------------------------------------------------------

export const RPC_LECTURAS_BARRIDO = "fn_barrido_piso_lecturas";
export const RPC_ANULAR_LECTURAS = "anular_lecturas_barrido";
/** Una pausa más larga que esto entre dos lecturas de la misma persona empieza otro tramo (pasó a otra percha). */
export const PAUSA_ENTRE_TRAMOS_MS = 3 * 60_000;

export type LecturaDelBarrido = {
  id: string;
  varianteId: string;
  cantidad: number;
  personaId: string;
  nombre: string;
  /** La hora en que se escaneó (la del aparato si la trajo). */
  escaneadaEn: string;
  anuladaEn: string | null;
  anuladaPor: string | null;
};

/** Lo que devuelve `fn_barrido_piso_lecturas`. Lo que no tiene forma se ignora. */
export function leerLecturasDelBarrido(x: unknown): { lecturas: LecturaDelBarrido[]; total: number; tope: number } {
  if (!esObjeto(x) || !Array.isArray(x.lecturas)) return { lecturas: [], total: 0, tope: 0 };
  const lecturas = x.lecturas.filter(esObjeto).flatMap((l) => {
    const id = texto(l.id);
    const varianteId = texto(l.variante_id);
    const personaId = texto(l.persona_id);
    const escaneadaEn = texto(l.escaneada_en);
    if (!id || !varianteId || !personaId || !escaneadaEn) return [];
    return [{ id, varianteId, cantidad: entero(l.cantidad), personaId, nombre: texto(l.nombre) ?? "Alguien del equipo", escaneadaEn, anuladaEn: texto(l.anulada_en), anuladaPor: texto(l.anulada_por) }];
  });
  return { lecturas, total: entero(x.total), tope: entero(x.tope) };
}

export type Tramo = {
  /** Estable entre recargas: la persona y su primera lectura. */
  clave: string;
  personaId: string;
  nombre: string;
  desde: string;
  hasta: string;
  /** De la más reciente a la más antigua, como se muestran. */
  lecturas: LecturaDelBarrido[];
  /** Lo que todavía suma (sin lo quitado). */
  unidades: number;
  /** Los ids que todavía se pueden quitar. */
  vivas: string[];
};

/**
 * Lo escaneado en TRAMOS: lo que una persona escaneó seguido, sin una pausa de más de `pausaMs`. Es lo que las chicas reconocen
 * («esto es la pared izquierda, lo conté yo a las 10») sin haberse repartido áreas. De lo más reciente a lo más antiguo.
 */
export function agruparEnTramos(lecturas: readonly LecturaDelBarrido[], pausaMs = PAUSA_ENTRE_TRAMOS_MS): Tramo[] {
  const ordenadas = [...lecturas].sort((a, b) => Date.parse(a.escaneadaEn) - Date.parse(b.escaneadaEn) || a.id.localeCompare(b.id));
  const abiertos = new Map<string, LecturaDelBarrido[]>();
  const cerrados: LecturaDelBarrido[][] = [];
  for (const l of ordenadas) {
    const actual = abiertos.get(l.personaId);
    const ultima = actual?.[actual.length - 1];
    if (actual && ultima && Date.parse(l.escaneadaEn) - Date.parse(ultima.escaneadaEn) <= pausaMs) {
      actual.push(l);
    } else {
      if (actual) cerrados.push(actual);
      abiertos.set(l.personaId, [l]);
    }
  }
  cerrados.push(...abiertos.values());
  return cerrados
    .map((grupo) => {
      const vivas = grupo.filter((l) => !l.anuladaEn);
      return {
        clave: `${grupo[0].personaId}:${grupo[0].id}`,
        personaId: grupo[0].personaId,
        nombre: grupo[0].nombre,
        desde: grupo[0].escaneadaEn,
        hasta: grupo[grupo.length - 1].escaneadaEn,
        lecturas: [...grupo].reverse(),
        unidades: vivas.reduce((a, l) => a + l.cantidad, 0),
        vivas: vivas.map((l) => l.id),
      };
    })
    .sort((a, b) => Date.parse(b.hasta) - Date.parse(a.hasta));
}

/** «10:05 a 10:12», o «10:05» si fue un instante. En hora de Lima. */
export function textoDeTramo(desde: string, hasta: string): string {
  const h = (iso: string) => new Date(iso).toLocaleTimeString("es-PE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Lima" });
  const a = h(desde);
  const b = h(hasta);
  return a === b ? a : `${a} a ${b}`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Lo que no se puede escanear (actividad 4): buscar por nombre, y apartar con foto lo que no tiene etiqueta o no existe.
// ---------------------------------------------------------------------------------------------------------------------

export const RPC_REGISTRAR_HALLAZGO = "registrar_hallazgo_barrido";
export const RPC_HALLAZGOS_BARRIDO = "fn_barrido_piso_hallazgos";
export const RPC_ANULAR_HALLAZGO = "anular_hallazgo_barrido";
export const BUCKET_FOTOS_BARRIDO = "retail-barridos";
export const NOTA_MAXIMA_HALLAZGO = 200;

export type TipoHallazgo = "sin_etiqueta" | "codigo_desconocido";

export type Hallazgo = {
  id: string;
  tipo: TipoHallazgo;
  codigo: string | null;
  cantidad: number;
  nota: string | null;
  fotoRuta: string | null;
  nombre: string;
  registradoEn: string;
  anuladaEn: string | null;
  anuladaPor: string | null;
};

/**
 * La foto de un hallazgo en el bucket privado: la carpeta es el barrido (la política del bucket lo exige). `toma` cuenta las fotos
 * elegidas en la hoja: cada foto NUEVA va a su propia ruta (el bucket no deja pisar un objeto: solo tiene políticas de subir y ver),
 * y reintentar con la MISMA foto cae en la misma ruta, que ya existe.
 */
export function rutaFotoHallazgo(barridoId: string, hallazgoId: string, toma = 1): string {
  return `${barridoId}/${hallazgoId}${toma > 1 ? `-${toma}` : ""}.jpg`;
}

/** ¿El bucket rechazó la subida porque ese objeto YA estaba? (un reintento tras un corte: la foto ya subió la primera vez). */
export function fotoYaEstaba(error: { message?: string; statusCode?: string | number; status?: number; error?: string } | null | undefined): boolean {
  if (!error) return false;
  const texto = `${error.message ?? ""} ${error.error ?? ""}`.toLowerCase();
  return String(error.statusCode ?? "") === "409" || error.status === 409 || texto.includes("already exists") || texto.includes("duplicate");
}

/** Lo que devuelve `fn_barrido_piso_hallazgos`. Lo que no tiene forma se ignora. */
export function leerHallazgos(x: unknown): Hallazgo[] {
  if (!Array.isArray(x)) return [];
  return x.filter(esObjeto).flatMap((h) => {
    const id = texto(h.id);
    const tipo = h.tipo === "sin_etiqueta" || h.tipo === "codigo_desconocido" ? h.tipo : null;
    const registradoEn = texto(h.registrado_en);
    if (!id || !tipo || !registradoEn) return [];
    return [
      {
        id,
        tipo,
        codigo: texto(h.codigo),
        cantidad: entero(h.cantidad),
        nota: texto(h.nota),
        fotoRuta: texto(h.foto_ruta),
        nombre: texto(h.nombre) ?? "Alguien del equipo",
        registradoEn,
        anuladaEn: texto(h.anulada_en),
        anuladaPor: texto(h.anulada_por),
      },
    ];
  });
}

const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Las prendas que calzan con lo escrito, por NOMBRE (modelo, talla, color, marca), para la prenda cuya etiqueta no se lee: cada
 * palabra tiene que ser el COMIENZO de una palabra de la prenda, sin tildes ni mayúsculas y en cualquier orden («emma blusa m»
 * encuentra «Blusa Emma · M» y no la S: la «m» de «Emma» no cuenta). Con menos de 2 letras en total, nada. Se elige TOCANDO la foto, nunca con Enter (la pistola remata con Enter y elegiría sola).
 */
export function sugerirPorNombre<T extends PrendaBarrido>(textoBuscado: string, prendas: readonly T[], max = 6): T[] {
  const palabras = sinTildes(textoBuscado).split(/\s+/).filter(Boolean);
  if (palabras.join("").length < 2) return [];
  const res: T[] = [];
  for (const p of prendas) {
    const fichas = sinTildes([p.referencia, p.talla, p.color, p.marca, p.sku].filter(Boolean).join(" ")).split(/[\s·-]+/);
    if (palabras.every((w) => fichas.some((f) => f.startsWith(w)))) {
      res.push(p);
      if (res.length >= max) break;
    }
  }
  return res;
}

/**
 * La guía de la hoja «Apartar» (ADR-0284): lo único que se exige es algo para reconocerla después —la foto o una nota— (lo mismo
 * que exige la base: barrido_piso_hallazgos_se_reconoce). Un código desconocido ya trae su código, así que ahí la foto es sugerida.
 */
export function camposGuiaApartar({ tipo, conFoto, nota }: { tipo: TipoHallazgo; conFoto: boolean; nota: string }): CampoDeGuia[] {
  const reconoce = conFoto || nota.trim().length > 0;
  return [
    tipo === "codigo_desconocido"
      ? { id: "foto", nombre: "Foto", requerido: false, sugerido: true, hecho: reconoce, pendiente: "Tómale una foto: así se reconoce después." }
      : { id: "foto", nombre: "Foto o nota", requerido: true, hecho: reconoce, pendiente: "Tómale una foto (o escribe cómo es) para reconocerla después." },
  ];
}

// ---------------------------------------------------------------------------------------------------------------------
// Revisar y confirmar (actividad 5): lo que va a pasar, con la MISMA cuenta que aplica la base.
// ---------------------------------------------------------------------------------------------------------------------

export const RPC_PREVISUALIZAR_BARRIDO = "previsualizar_barrido_piso";
export const RPC_CONFIRMAR_BARRIDO = "confirmar_barrido_piso";
export const RPC_CANCELAR_BARRIDO = "cancelar_barrido_piso";

export type LineaDelBarrido = {
  varianteId: string;
  prenda: string;
  motivo: "cuadra" | "se_movio" | "archivada" | "no_es_inventario";
  escaneadas: number;
  piso: number;
  almacen: number;
  alPiso: number;
  alAlmacen: number;
  noCargadas: number;
  otrasSedes: { sede: string; cantidad: number }[];
  enCamino: number;
};

export type ResumenBarrido = {
  antes: { piso: number; almacen: number };
  despues: { piso: number; almacen: number };
  total: number;
  escaneadas: number;
  prendasAlPiso: number;
  prendasAlAlmacen: number;
  prendasNoCargadas: number;
  lineasSeMovieron: number;
  aparte: number;
};

export type VistaBarrido = { resumen: ResumenBarrido; lineas: LineaDelBarrido[]; conteoAbierto: string | null; ultimaLectura: string | null };

const MOTIVOS = new Set(["cuadra", "se_movio", "archivada", "no_es_inventario"]);

export function leerResumenBarrido(x: unknown): ResumenBarrido {
  const r = esObjeto(x) ? x : {};
  const par = (y: unknown) => (esObjeto(y) ? { piso: entero(y.piso), almacen: entero(y.almacen) } : { piso: 0, almacen: 0 });
  return {
    antes: par(r.antes),
    despues: par(r.despues),
    total: entero(r.total),
    escaneadas: entero(r.escaneadas),
    prendasAlPiso: entero(r.prendas_al_piso),
    prendasAlAlmacen: entero(r.prendas_al_almacen),
    prendasNoCargadas: entero(r.prendas_no_cargadas),
    lineasSeMovieron: entero(r.lineas_se_movieron),
    aparte: entero(r.aparte),
  };
}

/** Lo que devuelve `previsualizar_barrido_piso`. Lo que no tiene forma se ignora; sin forma, `null`. */
export function leerVistaBarrido(x: unknown): VistaBarrido | null {
  if (!esObjeto(x) || !esObjeto(x.resumen)) return null;
  const lineas = Array.isArray(x.lineas)
    ? x.lineas.filter(esObjeto).flatMap((l) => {
        const varianteId = texto(l.variante_id);
        const motivo = typeof l.motivo === "string" && MOTIVOS.has(l.motivo) ? (l.motivo as LineaDelBarrido["motivo"]) : null;
        if (!varianteId || !motivo) return [];
        return [
          {
            varianteId,
            prenda: texto(l.prenda) ?? "Una prenda",
            motivo,
            escaneadas: entero(l.escaneadas),
            piso: entero(l.piso),
            almacen: entero(l.almacen),
            alPiso: entero(l.al_piso),
            alAlmacen: entero(l.al_almacen),
            noCargadas: entero(l.no_cargadas),
            otrasSedes: Array.isArray(l.otras_sedes) ? l.otras_sedes.filter(esObjeto).map((o) => ({ sede: texto(o.sede) ?? "Otra sede", cantidad: entero(o.cantidad) })) : [],
            enCamino: entero(l.en_camino),
          },
        ];
      })
    : [];
  const conteo = esObjeto(x.conteo_abierto) ? `Conteo ${String(x.conteo_abierto.numero ?? "")}`.trim() : null;
  return { resumen: leerResumenBarrido(x.resumen), lineas, conteoAbierto: conteo, ultimaLectura: texto(x.ultima_lectura) };
}

/** «Trujillo tiene 2 · 1 en camino»: dónde tiene el sistema una prenda que no está en la tienda. Sin nada, «No está en ninguna tienda». */
export function dondeLaTiene(l: Pick<LineaDelBarrido, "otrasSedes" | "enCamino">): string {
  const partes = l.otrasSedes.map((o) => `${o.sede.replace(/^Tienda\s+/i, "")} tiene ${o.cantidad}`);
  if (l.enCamino > 0) partes.push(`${l.enCamino} en camino a esta tienda`);
  return partes.length > 0 ? partes.join(" · ") : "No está en ninguna tienda";
}

/**
 * La guía de la hoja «Revisar el barrido» (ADR-0284): quién confirma y que se escaneó TODO lo colgado (sin eso, «vuelve al almacén» no
 * vale: lo exige la base con `barrido_falta_todo`).
 */
export function camposGuiaConfirmar({ responsableListo, todoEscaneado }: { responsableListo: boolean; todoEscaneado: boolean }): CampoDeGuia[] {
  return [
    { id: "responsable", nombre: "Quién confirma", requerido: true, hecho: responsableListo, pendiente: "Elige quién confirma (arriba, en «Quién escanea»)." },
    { id: "todo", nombre: "Todo escaneado", requerido: true, hecho: todoEscaneado, pendiente: "Marca que se escaneó todo lo colgado." },
  ];
}

/** «2 pasaron al piso y 4 volvieron al almacén.» — lo que quedó hecho, en una línea. */
export function textoDelResultado(r: ResumenBarrido): string {
  const n = (k: number, uno: string, varios: string) => `${k.toLocaleString("es-PE")} ${k === 1 ? uno : varios}`;
  if (r.prendasAlPiso === 0 && r.prendasAlAlmacen === 0) return "El piso ya estaba al día: no hubo que mover nada.";
  const partes = [];
  if (r.prendasAlPiso > 0) partes.push(n(r.prendasAlPiso, "pasó al piso", "pasaron al piso"));
  if (r.prendasAlAlmacen > 0) partes.push(n(r.prendasAlAlmacen, "volvió al almacén", "volvieron al almacén"));
  return `${partes.join(" y ")}.`;
}

// ---------------------------------------------------------------------------------------------------------------------
// La entrada en Existencias: el barrido en curso («súmate») y el barrido del mes.
// ---------------------------------------------------------------------------------------------------------------------

/** Cada cuánto toca barrer el piso (Felipe, 2026-11-22: una vez al mes). */
export const DIAS_ENTRE_BARRIDOS = 30;

/** `titulo` corto (cabe en una línea a 375 px) y `detalle` debajo, en chico. */
export type AvisoDeBarrido = { tipo: "en_curso" | "toca"; titulo: string; detalle: string | null; boton: string };

/**
 * Lo que Existencias dice del barrido, o `null` si no hay nada que decir:
 *  · hay uno abierto → quiénes escanean y cuánto llevan, con «Sumarme»;
 *  · el último cuadre (o barrido) fue hace 30 días o más → toca el del mes.
 * Una tienda que NUNCA cuadró no pasa por aquí: ya tiene su aviso «el piso nunca se ha cuadrado», que lleva al barrido.
 */
export function avisoDeBarrido({ barrido, cuadradoEn, ahora }: { barrido: BarridoAbierto | null; cuadradoEn: string | null; ahora: Date }): AvisoDeBarrido | null {
  if (barrido) {
    const quienes = quienesEscanean(barrido.personas, ahora);
    const lleva = barrido.unidades === 1 ? "1 prenda" : `${barrido.unidades.toLocaleString("es-PE")} prendas`;
    return { tipo: "en_curso", titulo: `Barrido en curso · ${lleva}`, detalle: quienes, boton: "Sumarme" };
  }
  const t = cuadradoEn ? Date.parse(cuadradoEn) : NaN;
  if (!Number.isFinite(t)) return null;
  const dias = Math.floor((ahora.getTime() - t) / 86_400_000);
  if (dias < DIAS_ENTRE_BARRIDOS) return null;
  return { tipo: "toca", titulo: "Toca el barrido del mes", detalle: `El último fue hace ${dias} días`, boton: "Hacer el barrido" };
}

/**
 * Lo que se le dice a la persona cuando algo no se pudo guardar: la frase del rechazo si la base dijo por qué; «sin conexión» si no
 * hubo respuesta (nunca el «TypeError: Failed to fetch» crudo del navegador); y, si no, el mensaje de la base con lo que se intentaba.
 */
export function textoDeError(e: { code?: string | null; hint?: string | null; message?: string | null } | null | undefined, que: string): string {
  const conocido = textoDeRechazo(e?.hint);
  if (conocido) return conocido;
  if (clasificarError(e) === "red") return `No hay conexión: no se pudo ${que}. Vuelve a intentarlo.`;
  return `No se pudo ${que}: ${e?.message ?? "la base no respondió"}`;
}
