/**
 * «Esta pestaña acaba de apretar Salir» (ADR-0309). El botón la marca ANTES de cerrar la sesión; `SesionEntrePestanas` la consulta
 * cuando le llega el aviso de cierre, para no contarle a quien salió que «la sesión se cerró en otra pestaña». Vive en memoria
 * de esta pestaña: otra pestaña no la ve, y por eso un cierre hecho en otra sigue avisando. La regla (cuánto vale) está en
 * `lib/sesion-entre-pestanas-reglas.ts`.
 */
import { esSalidaPropia } from "./sesion-entre-pestanas-reglas";

let marcadaEn: number | null = null;

export function marcarSalidaPropia() {
  marcadaEn = Date.now();
}

export function salidaPropiaReciente(): boolean {
  return esSalidaPropia(marcadaEn, Date.now());
}
