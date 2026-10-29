// «Preguntas del equipo» (ADR-0536, actividad 9): lo que el equipo le pregunta a «Pregúntale a CAYLA», en Gestión. Aquí lo puro:
// leer lo que devuelve `fn_asistente_preguntas_equipo` sin creerle a ciegas, y traducir cada respuesta a lenguaje de tienda. Las
// cifras las cuenta la base sobre TODO el período (la lista trae solo las 300 más recientes): aquí solo se juntan por clase.

import type { TonoChip } from "../../components/ui/Chip";
import { GUIAS } from "../guias/registro";
import { MODULOS } from "../modulos";

/** Lo que le pasó a la pregunta, en las cinco cajas que le importan al líder. */
export type ClaseRespuesta = "resuelta" | "sin_respuesta" | "sin_acceso" | "sin_ia" | "fuera_de_tema";

/** `nombre` va en la insignia de una pregunta; `plural`, en el filtro de la lista. */
export const CLASES: Record<ClaseRespuesta, { nombre: string; plural: string; tono: TonoChip }> = {
  resuelta: { nombre: "Resuelta", plural: "Resueltas", tono: "verde" },
  // Lo que falta construir o escribir: la señal más valiosa de la pantalla.
  sin_respuesta: { nombre: "Sin respuesta", plural: "Sin respuesta", tono: "ambar" },
  sin_acceso: { nombre: "Pide un acceso", plural: "Piden un acceso", tono: "pizarra" },
  // «Sin IA» no se entendía (prueba ciega de Formidable, 2026-10-27): es lo que la persona vio, las demos parecidas.
  sin_ia: { nombre: "Solo sugirió demos", plural: "Solo sugirió demos", tono: "neutro" },
  // Neutro y no `apagado`: apagado se dibuja tachado y quiere decir «anulada»; una pregunta fuera de tema sí cuenta.
  fuera_de_tema: { nombre: "Fuera de tema", plural: "Fuera de tema", tono: "neutro" },
};

export const ORDEN_CLASES: readonly ClaseRespuesta[] = ["resuelta", "sin_respuesta", "sin_acceso", "sin_ia", "fuera_de_tema"];

/** La caja de una respuesta (`asistente_preguntas.tipo`). Un tipo que no se conoce cae en «Solo sugirió demos»: no se pierde de las cifras. */
export function claseDe(tipo: string): ClaseRespuesta {
  if (tipo === "guia" || tipo === "regla" || tipo === "error") return "resuelta";
  if (tipo === "no_existe") return "sin_respuesta";
  if (tipo === "sin_acceso") return "sin_acceso";
  if (tipo === "fuera_de_tema") return "fuera_de_tema";
  return "sin_ia";
}

/** Qué se respondió, en una frase corta. «Sin respuesta» se parte por lo que preguntaba: una regla que no está escrita, un error
 *  que no está explicado, o algo que CAYLA todavía no hace. */
export function queRespondio(p: Pick<PreguntaEquipo, "tipo" | "tema" | "motivo">): string {
  switch (p.tipo) {
    case "guia":
      return "La llevó a la pantalla";
    case "regla":
      return "Le dio la regla de tienda";
    case "error":
      return "Le explicó el error";
    case "sin_acceso":
      return "Le falta un acceso";
    case "no_existe":
      return p.tema === "regla" ? "Regla sin escribir" : p.tema === "por_que" ? "Error sin explicar" : "No existe en CAYLA";
    case "fuera_de_tema":
      return "No era del sistema";
    default:
      return p.motivo === "tope"
        ? "Sin IA: se gastó el tope del mes"
        : p.motivo === "sin_clave"
          ? "Sin IA: falta la clave"
          : "La IA no respondió a tiempo";
  }
}

/** Lo que se lee bajo la insignia de una pregunta, corto y con lo importante primero, para que no se corte: «→ Caja», «Le falta:
 *  Traslados», «Regla sin escribir» (Formidable 2026-10-27: «Vive en un módulo que su rol no tie…» se cortaba antes de decir cuál). */
export function respuestaCorta(p: Pick<PreguntaEquipo, "tipo" | "tema" | "motivo" | "guiaId" | "modulo">): string {
  if (p.tipo === "guia") {
    const pantalla = nombreDeGuia(p.guiaId);
    return pantalla ? `→ ${pantalla}` : queRespondio(p);
  }
  if (p.tipo === "sin_acceso") {
    const modulo = nombreDeModulo(p.modulo);
    return modulo ? `Le falta: ${modulo}` : queRespondio(p);
  }
  return queRespondio(p);
}

/** El nombre de la pantalla de una guía, o nada si la guía ya no existe. */
export function nombreDeGuia(guiaId: string | null): string | null {
  if (!guiaId) return null;
  return GUIAS.find((g) => g.id === guiaId)?.titulo ?? null;
}

/** El nombre del módulo, como en Roles y accesos. */
export function nombreDeModulo(clave: string | null): string | null {
  if (!clave) return null;
  return MODULOS.find((m) => m.clave === clave)?.nombre ?? clave;
}

export type PreguntaEquipo = {
  id: string;
  creadaEn: string;
  persona: string | null;
  personaId: string | null;
  sede: string | null;
  ruta: string;
  pregunta: string;
  tipo: string;
  tema: string | null;
  motivo: string | null;
  guiaId: string | null;
  modulo: string | null;
  referencia: string | null;
  sirvio: boolean | null;
  comentario: string | null;
};

export type DatosEquipo = {
  cifras: { total: number; personas: number; sirvioSi: number; sirvioNo: number; gastoUsd: number };
  porClase: Record<ClaseRespuesta, number>;
  /** Las pantallas que más responden (o que se pidieron sin acceso), con cuántas no sirvieron. */
  pantallas: { guiaId: string; n: number; no: number }[];
  /** Los módulos que más se piden. */
  accesos: { modulo: string; n: number }[];
  /** Las 300 más recientes. */
  preguntas: PreguntaEquipo[];
};

const numero = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : typeof x === "string" && x.trim() !== "" && Number.isFinite(Number(x)) ? Number(x) : 0);
const texto = (x: unknown) => (typeof x === "string" && x !== "" ? x : null);
const filas = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter((f): f is Record<string, unknown> => !!f && typeof f === "object") : []);

/** Lo que devuelve `fn_asistente_preguntas_equipo`. `null` si no se entiende (la pantalla lo dice en vez de mostrar ceros). */
export function leerPreguntasEquipo(data: unknown): DatosEquipo | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as Record<string, unknown>;
  if (!d.cifras || typeof d.cifras !== "object") return null;
  const c = d.cifras as Record<string, unknown>;

  const porClase = Object.fromEntries(ORDEN_CLASES.map((k) => [k, 0])) as Record<ClaseRespuesta, number>;
  for (const f of filas(d.clases)) {
    if (typeof f.tipo === "string") porClase[claseDe(f.tipo)] += numero(f.n);
  }

  return {
    cifras: { total: numero(c.total), personas: numero(c.personas), sirvioSi: numero(c.sirvio_si), sirvioNo: numero(c.sirvio_no), gastoUsd: numero(c.gasto_usd) },
    porClase,
    pantallas: filas(d.pantallas).flatMap((f) => (typeof f.guia_id === "string" ? [{ guiaId: f.guia_id, n: numero(f.n), no: numero(f.no) }] : [])),
    accesos: filas(d.accesos).flatMap((f) => (typeof f.modulo === "string" ? [{ modulo: f.modulo, n: numero(f.n) }] : [])),
    preguntas: filas(d.preguntas).flatMap((f): PreguntaEquipo[] =>
      typeof f.id === "string" && typeof f.pregunta === "string" && typeof f.tipo === "string" && typeof f.creada_en === "string"
        ? [
            {
              id: f.id,
              creadaEn: f.creada_en,
              persona: texto(f.persona),
              personaId: texto(f.persona_id),
              sede: texto(f.sede),
              ruta: typeof f.ruta === "string" ? f.ruta : "/",
              pregunta: f.pregunta,
              tipo: f.tipo,
              tema: texto(f.tema),
              motivo: texto(f.motivo),
              guiaId: texto(f.guia_id),
              modulo: texto(f.modulo),
              referencia: texto(f.referencia),
              sirvio: typeof f.sirvio === "boolean" ? f.sirvio : null,
              comentario: texto(f.comentario),
            },
          ]
        : [],
    ),
  };
}

/** El filtro de la lista: una clase, las que no sirvieron, o todas. */
export type FiltroEquipo = "todas" | ClaseRespuesta | "no_sirvio";

export function filtrarPreguntas(preguntas: readonly PreguntaEquipo[], filtro: FiltroEquipo): PreguntaEquipo[] {
  if (filtro === "todas") return [...preguntas];
  if (filtro === "no_sirvio") return preguntas.filter((p) => p.sirvio === false);
  return preguntas.filter((p) => claseDe(p.tipo) === filtro);
}

/** «45 %» de una parte sobre un total; nada si no hay total. */
export function porcentaje(parte: number, total: number): string | null {
  if (total <= 0) return null;
  return `${Math.round((parte / total) * 100)} %`;
}
