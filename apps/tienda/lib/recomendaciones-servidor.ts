import "server-only";
import { leerConRespaldo } from "./base";
import { leerEnvio, leerMias, type MisRecomendaciones, type ResultadoEnvio } from "./recomendaciones";

// Las recomendaciones del cliente en la base (ADR-0408, Felipe 2026-10-15), solo por `retail.tienda_recomendar` y
// `retail.tienda_mis_recomendaciones` (20261015134000). La cuenta llega validada con el proyecto de clientes (`leerSesion`): la base
// escribe y devuelve solo lo de esa cuenta. Si la base no contesta, cada lectura lo dice y la página se degrada (principio 9). En los
// registros del servidor no va nada de la persona ni lo que escribió: solo el evento y el error de la base.

export type LecturaMisRecomendaciones = { estado: "ok"; mias: MisRecomendaciones } | { estado: "sin_cuenta" } | { estado: "sin_respuesta" };

/** Las suyas, la más nueva primero, con cuántas lleva hoy. */
export const leerMisRecomendaciones = (usuarioWebId: string): Promise<LecturaMisRecomendaciones> =>
  leerConRespaldo<LecturaMisRecomendaciones>(
    "tienda_mis_recomendaciones_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_mis_recomendaciones(${usuarioWebId}::uuid) as r`;
      if (fila?.r === null || fila?.r === undefined) return { estado: "sin_cuenta" };
      const mias = leerMias(fila.r);
      return mias ? { estado: "ok", mias } : { estado: "sin_respuesta" };
    },
    { estado: "sin_respuesta" },
  );

/** La guarda. `sedeId`: una tienda de la web, o null (CAYLA en general). `marca`: la del borrador (la misma no se guarda dos veces). */
export const recomendarEnBase = (usuarioWebId: string, texto: string, sedeId: string | null, marca: string): Promise<ResultadoEnvio> =>
  leerConRespaldo<ResultadoEnvio>(
    "tienda_recomendar_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_recomendar(${usuarioWebId}::uuid, ${texto}::text, ${sedeId}::uuid, ${marca}::uuid) as r`;
      return leerEnvio(fila?.r);
    },
    { estado: "sin_respuesta" },
  );
