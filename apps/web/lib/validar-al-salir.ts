/**
 * Cuándo se avisa que un dato está mal escrito (ADR-0611, mejora 2).
 *
 * Mientras alguien escribe «20601», el RUC todavía no está mal: está a medias. Regañarlo a la primera letra lo distrae y le hace pensar que se
 * equivocó. Por eso: se avisa al SALIR del campo; si vuelve a entrar y sigue mal, el aviso se queda, para que vea qué corrige; y apenas queda
 * bien, se va al instante. Corregido, la próxima vez vuelve a esperar a que salga.
 *
 * `salio` es el único recuerdo: «ya salió de este campo con el dato mal». `motivo` sale de la validación que ya existe; aquí no hay reglas.
 */

/** Al salir del campo: se recuerda solo si salió con el dato mal. */
export const salioAlDejarlo = (motivo: string | null): boolean => motivo !== null;

/** Mientras cambia: un dato corregido olvida que salió. */
export const salioTrasCambiar = (salio: boolean, motivo: string | null): boolean => salio && motivo !== null;

/** Lo que se le dice ahora, o null. */
export const avisoVisible = (salio: boolean, motivo: string | null): string | null => (salio ? motivo : null);
