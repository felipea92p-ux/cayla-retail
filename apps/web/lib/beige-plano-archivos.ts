// Los archivos que todavía tienen beige plano (`bg-hueso`, `bg-sand`, `background: var(--color-hueso)`…) y por qué (Felipe 2026-11-19:
// «ese color plano le quita la estética al sistema, quítalo de donde sea que aparezca»). Lo lee `lib/beige-plano.test.ts`, que falla si
// aparece beige en un archivo que no está aquí o si el número no coincide.
//
// Una superficie de la interfaz va en vidrio: las clases `vd-*` (`app/estilos/vidrio/rellenos.css`) o una receta. Dos clases de entrada:
//
//   · PERMANENTE (sin `deuda`): el archivo entero no es interfaz que se ve sobre el vidrio (papel que se imprime, un dibujo). Una sola
//     línea legítima no viene aquí: lleva `// beige-fijo: <por qué>` en la misma línea.
//   · DEUDA (`deuda: "<módulo>"`): se pasa a vidrio al migrar su módulo. Solo baja: `cuenta` es exacta. La reescribe
//     `pnpm --filter web tema:beige:registro`; una pantalla nueva no puede nacer aquí.

export type BeigeAMano = { cuenta: number; motivo: string; deuda?: string };

const DEUDA = "Superficie, botón o estado de la interfaz con beige plano: pasa a vidrio al migrar su módulo.";

export const BEIGE_A_MANO: Record<string, BeigeAMano> = {
  // ---------- Permanentes ----------

  // ---------- Deuda: se pasa a vidrio módulo por módulo ----------
};

/** La deuda que queda: la suma de `cuenta` de las entradas con `deuda`. Solo baja. */
export const DEUDA_BEIGE_HOY = Object.values(BEIGE_A_MANO)
  .filter((e) => e.deuda)
  .reduce((suma, e) => suma + e.cuenta, 0);
