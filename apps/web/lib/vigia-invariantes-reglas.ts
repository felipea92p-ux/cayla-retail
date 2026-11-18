// El vigía diario de invariantes (ADR-0632): lo que responde la base, leído en el borde, y cuándo merece un aviso.
//
// CONTRATO
//   PROMETE: `leerEstadoVigia` convierte la respuesta de `retail.fn_invariantes_estado()` (o de `fn_correr_invariantes()`, que
//            devuelve lo mismo) en un tipo cerrado, o en `null` si no tiene la forma esperada: nunca inventa un «todo bien».
//            `hayQueAvisar` dice si una corrida merece un aviso: algo NUEVO roto o algo que no se pudo mirar. Lo heredado o aceptado no.
//            `contextoParaSentry` arma lo que se manda: conteos e ids de invariante, nunca una fila ni un dato de una persona.
//   ASUME:   la forma de `fn_invariantes_estado` (migración 20261109152000). Si la base cambia esa forma sin cambiar esto, se lee
//            `null` y quien llama lo dice («no se pudo leer»), no «al día».
//            `avisoDelVigia` arma la lente «Vigía de la base» del Observatorio del Admin con esa lectura y la hora.

import type { AvisoObs } from "./observatorio-reglas";

export type DetalleInvariante = {
  id: string;
  nombre: string;
  gravedad: 1 | 2;
  estado: "viola" | "error";
  total: number;
  nuevas: number;
  mensaje: string | null;
};

export type EstadoVigia =
  | { corrio: false }
  | {
      corrio: true;
      ultimaCorridaEn: string;
      invariantes: number;
      limpias: number;
      violadas: number;
      nuevasGraves: number;
      nuevasLeves: number;
      conocidas: number;
      errores: number;
      omitidas: number;
      detalle: DetalleInvariante[];
    };

const esConteo = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;

function leerDetalle(x: unknown): DetalleInvariante | null {
  if (typeof x !== "object" || x === null) return null;
  const d = x as Record<string, unknown>;
  if (typeof d.id !== "string" || typeof d.nombre !== "string") return null;
  if (d.gravedad !== 1 && d.gravedad !== 2) return null;
  if (d.estado !== "viola" && d.estado !== "error") return null;
  if (!esConteo(d.total) || !esConteo(d.nuevas)) return null;
  if (d.mensaje !== null && d.mensaje !== undefined && typeof d.mensaje !== "string") return null;
  return { id: d.id, nombre: d.nombre, gravedad: d.gravedad, estado: d.estado, total: d.total, nuevas: d.nuevas, mensaje: d.mensaje ?? null };
}

/** La respuesta de la base, o `null` si no tiene la forma de `fn_invariantes_estado`. */
export function leerEstadoVigia(datos: unknown): EstadoVigia | null {
  if (typeof datos !== "object" || datos === null || Array.isArray(datos)) return null;
  const e = datos as Record<string, unknown>;
  if (!("ultima_corrida_en" in e)) return null;
  if (e.ultima_corrida_en === null) return { corrio: false };
  if (typeof e.ultima_corrida_en !== "string" || Number.isNaN(Date.parse(e.ultima_corrida_en))) return null;
  const conteos = ["invariantes", "limpias", "violadas", "nuevas_graves", "nuevas_leves", "conocidas", "errores", "omitidas"] as const;
  if (!conteos.every((k) => esConteo(e[k]))) return null;
  if (!Array.isArray(e.detalle)) return null;
  const detalle = e.detalle.map(leerDetalle);
  if (detalle.some((d) => d === null)) return null;
  return {
    corrio: true,
    ultimaCorridaEn: e.ultima_corrida_en,
    invariantes: e.invariantes as number,
    limpias: e.limpias as number,
    violadas: e.violadas as number,
    nuevasGraves: e.nuevas_graves as number,
    nuevasLeves: e.nuevas_leves as number,
    conocidas: e.conocidas as number,
    errores: e.errores as number,
    omitidas: e.omitidas as number,
    detalle: detalle as DetalleInvariante[],
  };
}

/** ¿Merece un aviso? Algo nuevo roto, o una invariante que no se pudo mirar. Lo heredado o aceptado, no: ya se sabe. */
export function hayQueAvisar(e: EstadoVigia): boolean {
  return e.corrio && e.nuevasGraves + e.nuevasLeves + e.errores > 0;
}

/** Lo que va a Sentry: cuántas y cuáles invariantes, nunca una fila. */
export function contextoParaSentry(e: EstadoVigia): Record<string, unknown> {
  if (!e.corrio) return { corrio: false };
  return {
    nuevas_graves: e.nuevasGraves,
    nuevas_leves: e.nuevasLeves,
    errores: e.errores,
    invariantes: e.detalle.filter((d) => d.nuevas > 0 || d.estado === "error").map((d) => `${d.id}:${d.estado}:${d.nuevas}`),
  };
}

// ── El aviso del Observatorio del Admin ─────────────────────────────────────────────────────────────────────────────────────

/** Pasadas estas horas sin una corrida, el vigía «no corre»: corre cada madrugada, así que 26 h es un día y un margen. */
export const HORAS_SIN_CORRER = 26;

/** «venta_cuadra_con_sus_pagos» → «Venta cuadra con sus pagos»: lo que la regla promete, dicho en palabras. */
export function reglaEnPalabras(nombre: string): string {
  const texto = nombre.replaceAll("_", " ");
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function filasDelDetalle(e: Extract<EstadoVigia, { corrio: true }>) {
  return e.detalle
    .filter((d) => d.nuevas > 0 || d.estado === "error")
    .map((d) => ({
      titulo: reglaEnPalabras(d.nombre),
      detalle:
        d.estado === "error"
          ? `${d.id} · no se pudo mirar`
          : `${d.id} · ${d.nuevas} ${d.nuevas === 1 ? "nueva" : "nuevas"} de ${d.total}${d.gravedad === 2 ? " · dato dudoso" : ""}`,
      chip: d.estado === "error" ? "Sin mirar" : "Nueva",
    }));
}

/**
 * El aviso «Vigía de la base» del Observatorio. En orden: no se pudo leer (la migración sin pegar o la base sin responder) → «?»;
 * nunca corrió → «aún no corre»; la última corrida tiene más de 26 h → «no corre» (urgente: un vigía detenido no avisa de nada);
 * algo nuevo roto → urgente si es un estado imposible; solo reglas sin mirar → hoy; nada de eso → al día. Sin pantalla propia: no
 * lleva enlace, el detalle es la lista.
 */
export function avisoDelVigia(e: EstadoVigia | null, ahora: Date): AvisoObs {
  const base = { clave: "vigia", icono: "alerta" as const, corto: "la base", porTienda: null, href: null };
  if (e === null) {
    return { ...base, nivel: "semana", n: null, titulo: "Vigía de la base", edad: null, detalle: null };
  }
  if (!e.corrio) {
    return {
      ...base,
      nivel: "semana",
      n: 1,
      titulo: "El vigía aún no corre",
      edad: null,
      detalle: {
        tipo: "lista",
        filas: [{ titulo: "Corre cada madrugada a las 3:30", detalle: "Si mañana sigue así, el trabajo programado de Vercel no está corriendo.", chip: null }],
      },
    };
  }
  const horas = (ahora.getTime() - Date.parse(e.ultimaCorridaEn)) / 3_600_000;
  if (horas > HORAS_SIN_CORRER) {
    return {
      ...base,
      nivel: "urg",
      n: 1,
      titulo: "El vigía no corre",
      edad: Math.floor(horas / 24),
      detalle: {
        tipo: "lista",
        filas: [
          {
            titulo: `Última revisión hace ${Math.floor(horas)} h`,
            detalle: "Mientras no corra, nada avisa si el stock, la caja o un comprobante dejan de cuadrar.",
            chip: "Detenido",
          },
          ...filasDelDetalle(e),
        ],
      },
    };
  }
  const nuevas = e.nuevasGraves + e.nuevasLeves;
  if (nuevas > 0) {
    return {
      ...base,
      nivel: e.nuevasGraves > 0 ? "urg" : "semana",
      n: nuevas,
      titulo: nuevas === 1 ? "Problema nuevo en la base" : "Problemas nuevos en la base",
      edad: 1,
      detalle: { tipo: "lista", filas: filasDelDetalle(e) },
    };
  }
  if (e.errores > 0) {
    return {
      ...base,
      nivel: "hoy",
      n: e.errores,
      titulo: e.errores === 1 ? "Regla que el vigía no pudo mirar" : "Reglas que el vigía no pudo mirar",
      edad: null,
      detalle: { tipo: "lista", filas: filasDelDetalle(e) },
    };
  }
  return { ...base, nivel: "ok", n: 0, titulo: "La base cuadra", edad: null, detalle: null };
}
