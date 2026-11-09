// El vigía diario de invariantes (ADR-0632): lo que responde la base, leído en el borde, y cuándo merece un aviso.
//
// CONTRATO
//   PROMETE: `leerEstadoVigia` convierte la respuesta de `retail.fn_invariantes_estado()` (o de `fn_correr_invariantes()`, que
//            devuelve lo mismo) en un tipo cerrado, o en `null` si no tiene la forma esperada: nunca inventa un «todo bien».
//            `hayQueAvisar` dice si una corrida merece un aviso: algo NUEVO roto o algo que no se pudo mirar. Lo heredado o aceptado no.
//            `contextoParaSentry` arma lo que se manda: conteos e ids de invariante, nunca una fila ni un dato de una persona.
//   ASUME:   la forma de `fn_invariantes_estado` (migración 20261109152000). Si la base cambia esa forma sin cambiar esto, se lee
//            `null` y quien llama lo dice («no se pudo leer»), no «al día».

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
