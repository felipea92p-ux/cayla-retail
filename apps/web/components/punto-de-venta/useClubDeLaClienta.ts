"use client";

import { useEffect, useState } from "react";
import { resumenClientaCaja, type ResumenClientaCaja } from "@/lib/club-acciones";
import type { LecturaClub } from "@/lib/club-caja-reglas";

/** Lo que el Punto de venta sabe de la clienta del ticket frente al club (ADR-0288, tandas 1b y 1g). Sus puntos y el cupón viven en
 *  `useCuponDelClub` (programa de puntos); el 10 % de cumpleaños y el vale de aniversario se retiraron el 2026-10-19. */
export type ClubDeLaClienta = {
  lectura: LecturaClub;
  /** Lo del club, abierto dentro de su caja (spike: nace plegado; la flecha lo abre). Por venta y por clienta: vive aquí
   *  porque la caja se desmonta al pasar a cobrar y, en el celular, al cerrar la hoja del ticket. */
  abierta: boolean;
  alternarAbierta: () => void;
  /** Vuelve a leer su resumen. */
  recargar: () => void;
  /** Se unió desde el cartel mientras su tarjeta estaba a la vista (tanda 1g): la tarjeta trae su resumen nuevo y la caja
   *  pasa a «Miembro» al instante, sin volver a preguntar. */
  seUnio: (resumen: ResumenClientaCaja) => void;
};

/**
 * Vive en `PuntoDeVenta` y no en la fila (`ClientaDelTicket`) a propósito: la fila se desmonta al pasar a «cobrar» y en el
 * celular cada vez que se cierra la hoja del ticket, y el ticket y el cobro necesitan saber del club cuando la fila ya no está.
 *
 * `activo`: la cuenta ve el módulo «Clientas». Sin él, `resumen_clienta_caja` se rechaza y no se pregunta.
 * `resumen_` es lectura (lib/espera-reglas.ts): no abre el loader global. Si falla, la fila queda como antes del club.
 */
export function useClubDeLaClienta(clientaId: string | null, activo: boolean): ClubDeLaClienta {
  const [leido, setLeido] = useState<{ clientaId: string; resumen: ResumenClientaCaja | null } | null>(null);
  const [abiertaPara, setAbiertaPara] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);

  // Otra clienta, o ninguna, vuelve a plegar lo del club (spike: nace plegado en cada venta). Se ajusta durante el render, no en un
  // efecto, para que la caja no parpadee un cuadro con el valor viejo.
  const [clientaAnterior, setClientaAnterior] = useState(clientaId);
  if (clientaAnterior !== clientaId) {
    setClientaAnterior(clientaId);
    setAbiertaPara(null);
  }

  useEffect(() => {
    if (!clientaId || !activo) return;
    let vigente = true;
    // Una relectura que falla no borra lo que ya se sabía de ELLA: la caja no se vacía por un corte de conexión. Con otra
    // clienta, un fallo deja la caja como antes del club (principio 9).
    const guardar = (resumen: ResumenClientaCaja | null) =>
      setLeido((l) => (!resumen && l?.clientaId === clientaId && l.resumen ? l : { clientaId, resumen }));
    // Se vuelve a leer cada vez que la clienta entra al ticket (pudo unirse desde el cartel) y con `recargar`.
    resumenClientaCaja(clientaId)
      .then(({ resumen, error }) => {
        if (vigente) guardar(error ? null : resumen);
      })
      .catch(() => {
        if (vigente) guardar(null);
      });
    return () => {
      vigente = false;
    };
  }, [clientaId, activo, vuelta]);

  const lectura: LecturaClub =
    !clientaId || !activo
      ? { estado: "sin_leer" }
      : leido?.clientaId !== clientaId
        ? { estado: "leyendo" }
        : leido.resumen
          ? { estado: "listo", resumen: leido.resumen }
          : { estado: "fallo" };

  return {
    lectura,
    abierta: clientaId !== null && abiertaPara === clientaId,
    alternarAbierta: () => setAbiertaPara((a) => (a === clientaId ? null : clientaId)),
    recargar: () => setVuelta((n) => n + 1),
    seUnio: (nuevo) => {
      if (clientaId) setLeido({ clientaId, resumen: nuevo });
    },
  };
}
