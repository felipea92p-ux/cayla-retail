/**
 * Reservas heredadas (ADR-0381, act. 2026-10-29; Felipe eligió la opción A en el PR #1487): números reservados por una rama
 * que ya no es la que los lleva, porque la MISMA obra siguió en otra rama. Una sesión en la nube termina y la siguiente sigue
 * el trabajo con otro nombre de rama, o una rama base nunca llegó a `main` y su trabajo viaja dentro de la que la siguió. Las
 * reservas no se mueven (el remoto rechaza la etiqueta repetida), y una migración que ya está en producción no se renumera
 * nunca: su versión está en el historial de allá.
 *
 * Cada línea dice el número, la rama que lo reservó, la rama que lo hereda y por qué. El candado acepta el número SOLO en la
 * rama heredera y solo si la reserva sigue a nombre de la rama de origen: no es un comodín. Una línea nueva la decide Felipe.
 */
export const HEREDADAS = [
  {
    tipo: "adr",
    numero: "0570",
    de: "claude/module-registration-editing-4c6c12",
    a: "claude/module-registration-editing-4c6c12-j5lpdz",
    motivo: "La misma obra (ADR-0570) siguió en otra sesión con el sufijo de la rama nueva; la punta de la rama vieja está contenida en la heredera.",
  },
  {
    tipo: "migracion",
    numero: "20261029164000",
    de: "claude/module-registration-editing-4c6c12",
    a: "claude/module-registration-editing-4c6c12-j5lpdz",
    motivo: "ADR-0570, actividad 2; ya pegada en producción: no se renumera.",
  },
  {
    tipo: "migracion",
    numero: "20261029173000",
    de: "claude/module-registration-editing-4c6c12",
    a: "claude/module-registration-editing-4c6c12-j5lpdz",
    motivo: "ADR-0570, actividad 3; ya pegada en producción: no se renumera.",
  },
  {
    tipo: "migracion",
    numero: "20261029190000",
    de: "claude/module-registration-editing-4c6c12",
    a: "claude/module-registration-editing-4c6c12-j5lpdz",
    motivo: "ADR-0570, actividad 4; ya pegada en producción: no se renumera.",
  },
  {
    tipo: "adr",
    numero: "0563",
    de: "claude/multiple-garment-materials-9d1c52",
    a: "claude/module-registration-editing-4c6c12-j5lpdz",
    motivo: "La rama base de ADR-0570 se borró sin llegar a main; su trabajo (forro y otros materiales) viaja en la heredera.",
  },
  {
    tipo: "migracion",
    numero: "20261029021000",
    de: "claude/multiple-garment-materials-9d1c52",
    a: "claude/module-registration-editing-4c6c12-j5lpdz",
    motivo: "ADR-0563 (complementos de la orden), de la rama base; ya pegada en producción: no se renumera.",
  },
  {
    tipo: "migracion",
    numero: "20261029051000",
    de: "claude/multiple-garment-materials-9d1c52",
    a: "claude/module-registration-editing-4c6c12-j5lpdz",
    motivo: "ADR-0566 (agregar un paso), de la rama base; ya pegada en producción: no se renumera.",
  },
  {
    tipo: "adr",
    numero: "0566",
    de: "claude/multiple-garment-materials-9d1c52",
    a: "claude/module-registration-editing-4c6c12-j5lpdz",
    motivo: "La rama base de ADR-0570 (ADR-0563 y ADR-0566) se borró sin llegar a main; su trabajo viaja en la heredera.",
  },
];

/** ¿La reserva `r` (a nombre de `r.rama`) la hereda `rama`? */
export function esHeredada(r, rama, heredadas = HEREDADAS) {
  return heredadas.some((h) => h.tipo === r.tipo && h.numero === r.numero && h.de === r.rama && h.a === rama);
}
