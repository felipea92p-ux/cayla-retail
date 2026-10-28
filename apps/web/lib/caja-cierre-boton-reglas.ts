// Lo que dice y cómo se ve el botón «Cerrar caja» de la pantalla de Caja (ADR-0318). Lógica pura, sin React ni Supabase.
// Reusa los cortes de la «Isla» (`recordatorio-cierre-reglas.ts`, ADR-0305) para que las dos piezas nunca discrepen:
// la hora de cierre y el instante desde el que se cuenta el retraso son los mismos.

import { formatoDuracion } from "./caja-panel-reglas";
import { estadoRecordatorio, hora12 } from "./recordatorio-cierre-reglas";

/** 0 = todavía no es hora · 1 = pasó la hora de cierre · 2 = 30 min o más tarde (cae el rojo profundo). */
export type NivelBotonCierre = 0 | 1 | 2;

export type EstadoBotonCierre = {
  nivel: NivelBotonCierre;
  /** La línea principal de la barra fija. */
  titulo: string;
  /** La línea de abajo: lo que pasa o lo que hay que hacer. */
  bajada: string;
};

export function estadoBotonCierre({
  ahora,
  abiertaEn,
  horaCierre,
  puedeCerrar,
}: {
  ahora: Date;
  abiertaEn: string;
  horaCierre: string | null;
  puedeCerrar: boolean;
}): EstadoBotonCierre {
  // Sin hora de cierre en la tienda no hay «tarde» que medir: el botón es notorio igual, pero no sube de nivel.
  const r = estadoRecordatorio({ ahora, abiertaEn, horaCierre });
  const nivel: NivelBotonCierre = r.nivel === 0 ? 0 : r.nivel === 1 ? 1 : 2;
  const h = horaCierre ? hora12(horaCierre) : null;

  if (!puedeCerrar) {
    return {
      nivel,
      titulo: nivel === 0 ? "Cuando termines tu turno, avisa a un líder" : "Es hora de cerrar la caja: avisa a un líder",
      bajada: "La caja la cierra un líder de equipo.",
    };
  }
  if (nivel === 0) {
    return {
      nivel,
      titulo: "Cuando termines tu turno, cierra la caja",
      // «p. m.» ya termina en punto: a la hora no se le suma otro.
      // El tiempo que lleva abierta ya lo dice la cabecera («lleva 6 h»): aquí solo lo que falta por hacer.
      bajada: h ? `La caja de hoy se cierra a las ${h}` : "Al terminar el turno, ciérrala para cuadrar el cajón.",
    };
  }
  if (nivel === 1) {
    return { nivel, titulo: "Es hora de cerrar la caja", bajada: `Pasó la hora de cierre (${h}). Cuenta el cajón y ciérrala.` };
  }
  return {
    nivel,
    titulo: `La caja sigue abierta · pasó la hora de cierre hace ${formatoDuracion(r.minutos)}`,
    bajada: "Si pasa la noche abierta, las ventas de hoy y de mañana se mezclan y el cajón no cuadra día por día.",
  };
}
