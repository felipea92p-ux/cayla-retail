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

/** Lo que devuelve `fn_barrido_piso_estado` (o el `estado` de `abrir_barrido_piso`). Con una forma rara, «no hay barrido». */
export function leerEstadoBarrido(x: unknown): EstadoBarrido {
  if (!esObjeto(x)) return { separa: false, barrido: null };
  const separa = x.separa === true;
  const b = x.barrido;
  if (!esObjeto(b) || !texto(b.id)) return { separa, barrido: null };
  const personas = Array.isArray(b.personas)
    ? b.personas.filter(esObjeto).flatMap((p) => {
        const personaId = texto(p.persona_id);
        if (!personaId) return [];
        return [{ personaId, nombre: texto(p.nombre) ?? "Alguien del equipo", unidades: entero(p.unidades), lecturas: entero(p.lecturas), ultima: texto(p.ultima) ?? "" }];
      })
    : [];
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
    },
  };
}

/** Lo que devuelve `registrar_lecturas_barrido`. */
export type RespuestaLecturas = { guardadas: number; yaEstaban: number; unidades: number; porPrenda: Record<string, number> };

export function leerRespuestaLecturas(x: unknown): RespuestaLecturas | null {
  if (!esObjeto(x)) return null;
  return { guardadas: entero(x.guardadas), yaEstaban: entero(x.ya_estaban), unidades: entero(x.unidades), porPrenda: leerPorPrenda(x.por_prenda) };
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
 */
export function siguienteLote(cola: readonly LecturaBarrido[], max = LECTURAS_POR_LOTE): LecturaBarrido[] {
  const primera = cola[0];
  if (!primera) return [];
  const lote: LecturaBarrido[] = [];
  for (const l of cola) {
    if (lote.length >= max || !mismaFirma(l.firma, primera.firma)) break;
    lote.push(l);
  }
  return lote;
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
      return "Una prenda escaneada ya no está en el catálogo. Recarga la página.";
    default:
      return null;
  }
}

/** ¿Este rechazo deja la cola como está para reintentar (la red, la base que no respondió) o hay que pararse? */
export function esRechazoQueFrena(hint: string | null | undefined): boolean {
  return textoDeRechazo(hint) !== null;
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
