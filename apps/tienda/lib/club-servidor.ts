import "server-only";
import { leerConRespaldo } from "./base";
import {
  leerGuardados,
  leerMiClub,
  leerRespuestaAviso,
  leerRespuestaFavorito,
  leerRespuestaQuitar,
  type EstadoAviso,
  type EstadoFavorito,
  type EstadoQuitar,
  type Guardados,
  type MiClub,
} from "./club";

// El Club en la cuenta (ADR-0408, actividad 12) en la base del ERP, solo por sus funciones `retail.tienda_*` (20261015024000 y
// 20261015025000). Cada una busca la cuenta por el usuario del proyecto de CLIENTES que le pasa el servidor (el que ya validó la
// sesión) y solo toca lo de esa cuenta. Si la base no contesta, cada lectura lo dice y la pantalla se degrada: nunca se cae. En los
// registros del servidor no va ningún dato de la persona: solo el evento y el error de la base.

export type LecturaClub = { estado: "ok"; club: MiClub } | { estado: "sin_cuenta" } | { estado: "sin_respuesta" };

/** «Mi cuenta»: el Club, las novedades, los favoritos y las esperas (anota la visita, para «desde tu última visita»). */
export const leerMiClubEnBase = (usuarioWebId: string): Promise<LecturaClub> =>
  leerConRespaldo<LecturaClub>(
    "tienda_mi_club_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_mi_club(${usuarioWebId}::uuid) as r`;
      if (fila?.r === null || fila?.r === undefined) return { estado: "sin_cuenta" };
      const club = leerMiClub(fila.r);
      return club ? { estado: "ok", club } : { estado: "sin_respuesta" };
    },
    { estado: "sin_respuesta" },
  );

/**
 * @public Sin uso hasta que la ficha y las tarjetas (actividades 4 y 5) dibujen el corazón y «Avísame» con lo ya guardado.
 * Los favoritos y las esperas de esa cuenta, para dibujar el corazón de cada tarjeta y el «Te avisaremos» de la ficha. null si la
 * base no contesta o no hay cuenta: los botones se dibujan como «no guardado» (guardar y avisar son idempotentes, así que tocar
 * uno que ya estaba no duplica nada).
 */
export const leerGuardadosEnBase = (usuarioWebId: string): Promise<Guardados | null> =>
  leerConRespaldo(
    "tienda_mis_favoritos_y_esperas_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_mis_favoritos_y_esperas(${usuarioWebId}::uuid) as r`;
      return leerGuardados(fila?.r);
    },
    null,
  );

/** Guarda (o quita) un modelo de sus favoritos. */
export const guardarFavoritoEnBase = (usuarioWebId: string, productoId: string, guardar: boolean): Promise<EstadoFavorito> =>
  leerConRespaldo<EstadoFavorito>(
    "tienda_favorito_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_favorito(${usuarioWebId}::uuid, ${productoId}::uuid, ${guardar}::boolean) as r`;
      return leerRespuestaFavorito(fila?.r);
    },
    "sin_respuesta",
  );

/** «Avísame cuando llegue» esa prenda en esa tienda (`null`: en cualquier tienda de la web). */
export const pedirAvisoEnBase = (usuarioWebId: string, varianteId: string, sedeId: string | null): Promise<{ estado: EstadoAviso; esperaId: string | null }> =>
  leerConRespaldo<{ estado: EstadoAviso; esperaId: string | null }>(
    "tienda_avisame_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_avisame(${usuarioWebId}::uuid, ${varianteId}::uuid, ${sedeId}::uuid) as r`;
      return leerRespuestaAviso(fila?.r);
    },
    { estado: "sin_respuesta", esperaId: null },
  );

/** Quita una de sus esperas. */
export const quitarAvisoEnBase = (usuarioWebId: string, esperaId: string): Promise<EstadoQuitar> =>
  leerConRespaldo<EstadoQuitar>(
    "tienda_quitar_avisame_fallo",
    async (db) => {
      const [fila] = await db`select retail.tienda_quitar_avisame(${usuarioWebId}::uuid, ${esperaId}::uuid) as r`;
      return leerRespuestaQuitar(fila?.r);
    },
    "sin_respuesta",
  );
