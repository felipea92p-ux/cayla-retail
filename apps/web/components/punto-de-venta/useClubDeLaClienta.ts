"use client";

import { useEffect, useState } from "react";
import { resumenClientaCaja, type ResumenClientaCaja } from "@/lib/club-acciones";
import type { LecturaClub } from "@/lib/club-caja-reglas";

/** Lo que el Punto de venta sabe de la clienta del ticket frente al club (ADR-0288, tanda 1b). */
export type ClubDeLaClienta = {
  lectura: LecturaClub;
  /** «Ahora no» en ESTA venta (CL-8): no se guarda en ningún lado y la próxima venta se vuelve a ofrecer. */
  ahoraNo: boolean;
  callarEnEstaVenta: () => void;
  /** Se unió desde la caja: la fila pasa a «Socia C-0142» y el ticket imprime su QR, sin volver a preguntarle a la base. */
  unida: (datos: { codigoClub: string | null; clubDesde: string | null; celular: string; cumpleDia: number | null; cumpleMes: number | null }) => void;
  /** Lo del club, abierto dentro de su caja (spike: nace plegado; la flecha lo abre). Por venta y por clienta: vive aquí
   *  porque la caja se desmonta al pasar a cobrar y, en el celular, al cerrar la hoja del ticket. */
  abierta: boolean;
  alternarAbierta: () => void;
  /** Vuelve a leer su resumen: la cara de su QR vio llegar la publicidad (camino B, ADR-0288 act. c) o se registró «Llegó
   *  su mensaje». El chip pasa a «Publicidad» y el ticket impreso deja de llevar su QR. */
  recargar: () => void;
};

/**
 * Vive en `PuntoDeVenta` y no en la fila (`ClientaDelTicket`) a propósito: la fila se desmonta al pasar a «cobrar» y en el
 * celular cada vez que se cierra la hoja del ticket. Si el «Ahora no» viviera ahí, la invitación volvería a salir en la
 * misma venta; y el ticket impreso necesita saber si es socia cuando la fila ya no está.
 *
 * `activo`: la cuenta ve el módulo «Clientas». Sin él, `resumen_clienta_caja` se rechaza y no se pregunta.
 * `resumen_` es lectura (lib/espera-reglas.ts): no abre el loader global. Si falla, la fila queda como antes del club.
 */
export function useClubDeLaClienta(clientaId: string | null, activo: boolean): ClubDeLaClienta {
  const [leido, setLeido] = useState<{ clientaId: string; resumen: ResumenClientaCaja | null } | null>(null);
  const [calladaPara, setCalladaPara] = useState<string | null>(null);
  const [abiertaPara, setAbiertaPara] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);

  // Sin clienta en el ticket es una venta nueva (se cobró, se vació, quedó en espera): «Ahora no» se olvida (CL-8). Otra
  // clienta, o ninguna, vuelve a plegar lo del club (spike: nace plegado en cada venta). Se ajusta durante el render, no en
  // un efecto, para que la caja no parpadee un cuadro con el valor viejo.
  const [clientaAnterior, setClientaAnterior] = useState(clientaId);
  if (clientaAnterior !== clientaId) {
    setClientaAnterior(clientaId);
    if (clientaId === null) setCalladaPara(null);
    setAbiertaPara(null);
  }

  useEffect(() => {
    if (!clientaId || !activo) return;
    let vigente = true;
    // Una relectura que falla no borra lo que ya se sabía de ELLA: la caja no se vacía (ni se cierra su QR) por un corte de
    // conexión justo después de que confirmó. Con otra clienta, un fallo deja la caja como antes del club (principio 9).
    const guardar = (resumen: ResumenClientaCaja | null) =>
      setLeido((l) => (!resumen && l?.clientaId === clientaId && l.resumen ? l : { clientaId, resumen }));
    // Se vuelve a leer cada vez que la clienta entra al ticket (pudo unirse en otra caja o en su ficha) y con `recargar`.
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
    ahoraNo: clientaId !== null && calladaPara === clientaId,
    callarEnEstaVenta: () => setCalladaPara(clientaId),
    abierta: clientaId !== null && abiertaPara === clientaId,
    alternarAbierta: () => setAbiertaPara((a) => (a === clientaId ? null : clientaId)),
    recargar: () => setVuelta((n) => n + 1),
    unida: (d) =>
      setLeido((l) =>
        l && l.clientaId === clientaId && l.resumen
          ? {
              clientaId: l.clientaId,
              resumen: {
                ...l.resumen,
                esSocia: true,
                codigoClub: d.codigoClub ?? l.resumen.codigoClub,
                clubDesde: d.clubDesde ?? l.resumen.clubDesde,
                celular: d.celular,
                cumpleDia: d.cumpleDia ?? l.resumen.cumpleDia,
                cumpleMes: d.cumpleMes ?? l.resumen.cumpleMes,
              },
            }
          : l
      ),
  };
}
