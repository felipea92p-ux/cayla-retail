// ¿Responde la base? — el sondeo de la tienda (ADR-0450). Lógica pura, sin la conexión: `salud-servidor.ts` le pasa la consulta de verdad y
// la prueba `salud.test.ts` le pasa una de mentira. No lleva `server-only` para poder probarse.

export type SaludDeLaTienda = { ok: true } | { ok: false; motivo: "no_responde" };

/** Cuánto se espera la consulta antes de darla por no respondida: una tienda cuya base tarda más de 4 s ya no está atendiendo. */
export const MS_TOPE_DEL_SONDEO = 4_000;
/** Cuánto se guarda la respuesta en cada instancia: aunque un monitor pregunte cada minuto y cien aparatos esperen, a la base le llega una pregunta cada 10 s. */
export const MS_DEL_SONDEO_GUARDADO = 10_000;

/**
 * Arma un sondeo con su respuesta guardada. `preguntar` corre una consulta mínima en la base (`select 1`): que corra dice que hay una
 * conexión libre en el grupo de la tienda Y que Postgres contesta, que es justo lo que se pierde cuando la tienda se satura o la base cae.
 * Un fallo o un tiempo agotado es `no_responde`; nunca se devuelve el mensaje del error (puede traer nombres de la base).
 */
export function crearSondeo(preguntar: () => Promise<unknown>, ahora: () => number = Date.now): () => Promise<SaludDeLaTienda> {
  let guardada: { en: number; resultado: SaludDeLaTienda } | null = null;
  return async () => {
    if (guardada && ahora() - guardada.en <= MS_DEL_SONDEO_GUARDADO) return guardada.resultado;
    let corte: ReturnType<typeof setTimeout> | undefined;
    let resultado: SaludDeLaTienda;
    try {
      await Promise.race([
        preguntar(),
        new Promise<never>((_, rechazar) => {
          corte = setTimeout(() => rechazar(new Error("tiempo agotado")), MS_TOPE_DEL_SONDEO);
        }),
      ]);
      resultado = { ok: true };
    } catch {
      resultado = { ok: false, motivo: "no_responde" };
    } finally {
      clearTimeout(corte);
    }
    guardada = { en: ahora(), resultado };
    return resultado;
  };
}
