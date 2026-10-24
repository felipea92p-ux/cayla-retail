"use client";

import { useEffect, useState } from "react";
import { resumenPuntosCaja } from "@/lib/club-acciones";
import type { CuponPuesto, ResumenPuntos } from "@/lib/club-puntos-reglas";
import { useEnLinea } from "@/lib/useEnLinea";

/** Los puntos y el cupón del Club en la caja (programa de puntos, actividad 5). */
export type CuponDelClubEnCaja = {
  /** Lo que se sabe de los puntos de la clienta del ticket: la configuración vigente y, si es miembro, su saldo. */
  puntos: ResumenPuntos | null;
  /** Vuelve a leerlos (tras canjear o cobrar). */
  recargar: () => void;
  /** El cupón puesto en ESTA compra (de «Usar puntos» o de «Código de cupón»), o null. Es al portador: no depende de quién
   *  está en el ticket. */
  cupon: CuponPuesto | null;
  poner: (c: CuponPuesto) => void;
  quitar: () => void;
  /** La base rechazó el cupón al cobrar: se quita y se relee lo que ella sabe. */
  apagarTrasRechazo: () => void;
  /** Se quitó SOLO (se perdió la conexión): el Punto de venta lo avisa. `vez` cambia en cada apagado. */
  seApago: { valor: number; vez: number } | null;
};

/**
 * Vive en `PuntoDeVenta` (no en la tarjeta del cliente) por la misma razón que `useClubDeLaClienta`: la tarjeta se desmonta
 * al pasar a «cobrar», y el ticket, el cobro y el papel necesitan saber del cupón cuando ya no está.
 *
 * `activo`: la cuenta ve el módulo «Clientas» o «Vender» (la lectura de los puntos lo pide). Sin la clienta o sin permiso no se
 * lee nada y el cupón por código sigue funcionando.
 *
 * Sin conexión el cupón se quita y no vuelve solo: otra caja podría haberlo usado, y un total que baja y sube bajo las manos de
 * quien cobra confunde. Se ajusta durante el render, como `useClubDeLaClienta`, para que el total no se pinte un cuadro con un
 * cupón que ya no vale.
 */
export function useCuponDelClub(clientaId: string | null, activo: boolean): CuponDelClubEnCaja {
  const [leido, setLeido] = useState<{ clientaId: string; resumen: ResumenPuntos | null } | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const [cupon, setCupon] = useState<CuponPuesto | null>(null);
  const [seApago, setSeApago] = useState<CuponDelClubEnCaja["seApago"]>(null);
  const enLinea = useEnLinea();

  useEffect(() => {
    if (!clientaId || !activo) return;
    let vigente = true;
    // Una relectura que falla no borra lo que ya se sabía de ELLA: la caja no se vacía por un corte de conexión.
    const guardar = (resumen: ResumenPuntos | null) =>
      setLeido((l) => (!resumen && l?.clientaId === clientaId && l.resumen ? l : { clientaId, resumen }));
    resumenPuntosCaja(clientaId)
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

  if (cupon && !enLinea) {
    setCupon(null);
    setSeApago({ valor: cupon.valor, vez: (seApago?.vez ?? 0) + 1 });
  }

  return {
    puntos: clientaId && leido?.clientaId === clientaId ? leido.resumen : null,
    recargar: () => setVuelta((n) => n + 1),
    cupon,
    poner: (c) => setCupon(c),
    quitar: () => setCupon(null),
    apagarTrasRechazo: () => {
      setCupon(null);
      setVuelta((n) => n + 1);
    },
    seApago,
  };
}
