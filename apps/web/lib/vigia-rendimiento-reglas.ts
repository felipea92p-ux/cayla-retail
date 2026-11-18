// El vigía de rendimiento (ADR-0656): lo que responde `retail.fn_foto_rendimiento()`, leído en el borde.
//
// CONTRATO
//   PROMETE: `leerFotoRendimiento` convierte la respuesta de la base en un tipo cerrado, o en `null` si no tiene la forma esperada:
//            nunca inventa una foto que no se tomó. La respuesta que se arma con ella lleva conteos y fechas, nunca el texto de una
//            consulta (la base tampoco lo guarda).
//   ASUME:   la forma de `fn_foto_rendimiento` (migración 20261113194000). Si la base la cambia sin cambiar esto, se lee `null` y la
//            ruta del cron lo avisa a Sentry.

export type FotoRendimiento =
  | { corrio: false; motivo: "ya_corriendo" }
  | {
      corrio: true;
      corridaId: number;
      /** El tramo que cubre la foto: desde la anterior o, si arrancó de cero, desde el reinicio de pg_stat_statements. */
      desde: string;
      hasta: string;
      /** Sin foto anterior, o con un reinicio de pg_stat_statements en medio: la foto cuenta todo lo de después del reinicio. */
      arrancoDeCero: boolean;
      /** Consultas de retail que había en pg_stat_statements, y cuántas filas (función o tabla, por rol) dejó la foto. */
      consultas: number;
      filas: number;
      /** Consultas que pg_stat_statements tiró por falta de lugar desde su reinicio (`dealloc`); `null` si no lo dijo. */
      descartadas: number | null;
    };

const esConteo = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;
const esFecha = (x: unknown): x is string => typeof x === "string" && !Number.isNaN(Date.parse(x));

/** La respuesta de la base, o `null` si no tiene la forma de `fn_foto_rendimiento`. */
export function leerFotoRendimiento(datos: unknown): FotoRendimiento | null {
  if (typeof datos !== "object" || datos === null || Array.isArray(datos)) return null;
  const d = datos as Record<string, unknown>;
  if (d.ok === false) return d.motivo === "ya_corriendo" ? { corrio: false, motivo: "ya_corriendo" } : null;
  if (d.ok !== true) return null;
  if (!esConteo(d.corrida_id) || d.corrida_id === 0) return null;
  if (!esFecha(d.desde) || !esFecha(d.hasta) || Date.parse(d.desde) > Date.parse(d.hasta)) return null;
  if (typeof d.arranco_de_cero !== "boolean" || !esConteo(d.consultas) || !esConteo(d.filas)) return null;
  if (d.descartadas !== null && d.descartadas !== undefined && !esConteo(d.descartadas)) return null;
  return {
    corrio: true,
    corridaId: d.corrida_id,
    desde: d.desde,
    hasta: d.hasta,
    arrancoDeCero: d.arranco_de_cero,
    consultas: d.consultas,
    filas: d.filas,
    descartadas: (d.descartadas as number | null | undefined) ?? null,
  };
}
