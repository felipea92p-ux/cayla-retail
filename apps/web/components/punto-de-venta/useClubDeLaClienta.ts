"use client";

import { useEffect, useState } from "react";
import { resumenClientaCaja, type ResumenClientaCaja } from "@/lib/club-acciones";
import type { LecturaClub } from "@/lib/club-caja-reglas";
import { cumpleEnCaja, pctDelCanje, PCT_CUMPLE_POR_DEFECTO, type CumpleEnCaja, type MotivoCumpleApagado } from "@/lib/club-cumple-canje-reglas";
import { montoDelVale, valeEnCaja, type MotivoValeApagado, type ValeEnCaja } from "@/lib/club-aniversario-canje-reglas";
import { useEnLinea } from "@/lib/useEnLinea";

/** Lo que el Punto de venta sabe de la clienta del ticket frente al club (ADR-0288, tandas 1b, 1c y 1g). */
export type ClubDeLaClienta = {
  lectura: LecturaClub;
  /** Lo del club, abierto dentro de su caja (spike: nace plegado; la flecha lo abre). Por venta y por clienta: vive aquí
   *  porque la caja se desmonta al pasar a cobrar y, en el celular, al cerrar la hoja del ticket. */
  abierta: boolean;
  alternarAbierta: () => void;
  /** Vuelve a leer su resumen. */
  recargar: () => void;
  /** Se unió desde el cartel mientras su tarjeta estaba a la vista (tanda 1g): la tarjeta trae su resumen nuevo y la caja
   *  pasa a «Socia» al instante, con su cumpleaños y su vale si los tiene, sin volver a preguntar. */
  seUnio: (resumen: ResumenClientaCaja) => void;
  /** El canje del cumpleaños (tanda 1c, ADR-0288 D-5), como lo dice su caja: disponible, sin conexión, canjeado o nada. */
  cumple: CumpleEnCaja;
  /** La asesora tocó «Canjear» en esta venta y sigue disponible. */
  cumpleAplicado: boolean;
  /** El % que entra al ticket (`ticketConCumple`), o null sin canje. */
  pctCumple: number | null;
  canjearCumple: () => void;
  quitarCumple: () => void;
  /** La base rechazó el canje (`rechazoDelCanje`): se apaga y, si la base sabe algo que la caja no, se vuelve a leer. */
  apagarCumpleTrasRechazo: (releer: boolean) => void;
  /** Se apagó SOLO (sin conexión, o una relectura dice que ya no está disponible): el Punto de venta lo avisa. `vez` cambia
   *  en cada apagado, así el aviso sale una vez por cada uno. */
  cumpleSeApago: { motivo: MotivoCumpleApagado; pct: number; vez: number } | null;
  /** El vale de aniversario (tanda 1g, G-13), igual que el cumpleaños: disponible, sin conexión o nada. */
  vale: ValeEnCaja;
  /** La asesora tocó «Usar vale» en esta venta y sigue disponible. */
  valeAplicado: boolean;
  /** El monto del vale que entra al ticket (`ticketConVale`), o null sin vale. */
  montoVale: number | null;
  usarVale: () => void;
  quitarVale: () => void;
  /** La base rechazó el vale (`rechazoDelVale`). */
  apagarValeTrasRechazo: (releer: boolean) => void;
  /** Se apagó solo (como `cumpleSeApago`). */
  valeSeApago: { motivo: MotivoValeApagado; monto: number; vez: number } | null;
};

/**
 * Vive en `PuntoDeVenta` y no en la fila (`ClientaDelTicket`) a propósito: la fila se desmonta al pasar a «cobrar» y en el
 * celular cada vez que se cierra la hoja del ticket, y el ticket, el cobro y el papel necesitan saber del club cuando la fila
 * ya no está.
 *
 * Una sola ventaja del club por compra (G-13): con el cumpleaños puesto, «Usar vale» no hace nada (la fila lo apaga y dice
 * por qué), y al revés.
 *
 * `activo`: la cuenta ve el módulo «Clientas». Sin él, `resumen_clienta_caja` se rechaza y no se pregunta.
 * `resumen_` es lectura (lib/espera-reglas.ts): no abre el loader global. Si falla, la fila queda como antes del club.
 */
export function useClubDeLaClienta(clientaId: string | null, activo: boolean): ClubDeLaClienta {
  const [leido, setLeido] = useState<{ clientaId: string; resumen: ResumenClientaCaja | null } | null>(null);
  const [abiertaPara, setAbiertaPara] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  // Los canjes son por venta y por clienta: otra clienta, o ninguna, los apaga.
  const [cumplePara, setCumplePara] = useState<string | null>(null);
  const [cumpleSeApago, setCumpleSeApago] = useState<ClubDeLaClienta["cumpleSeApago"]>(null);
  const [valePara, setValePara] = useState<string | null>(null);
  const [valeSeApago, setValeSeApago] = useState<ClubDeLaClienta["valeSeApago"]>(null);
  const enLinea = useEnLinea();

  // Otra clienta, o ninguna, vuelve a plegar lo del club (spike: nace plegado en cada venta) y apaga los canjes. Se ajusta
  // durante el render, no en un efecto, para que la caja no parpadee un cuadro con el valor viejo.
  const [clientaAnterior, setClientaAnterior] = useState(clientaId);
  if (clientaAnterior !== clientaId) {
    setClientaAnterior(clientaId);
    setAbiertaPara(null);
    setCumplePara(null);
    setValePara(null);
  }

  useEffect(() => {
    if (!clientaId || !activo) return;
    let vigente = true;
    // Una relectura que falla no borra lo que ya se sabía de ELLA: la caja no se vacía por un corte de conexión. Con otra
    // clienta, un fallo deja la caja como antes del club (principio 9).
    const guardar = (resumen: ResumenClientaCaja | null) =>
      setLeido((l) => (!resumen && l?.clientaId === clientaId && l.resumen ? l : { clientaId, resumen }));
    // Se vuelve a leer cada vez que la clienta entra al ticket (pudo unirse desde el cartel, o canjear en otra tienda) y
    // con `recargar`.
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

  // Lo que manda es la base (`cumple_disponible`, `aniversario_disponible`); sin conexión, fuera de su mes o con el vale
  // vencido no se ofrece.
  const resumen = lectura.estado === "listo" ? lectura.resumen : null;
  const cumple = cumpleEnCaja(resumen, enLinea);
  const vale = valeEnCaja(resumen, enLinea);
  const cumpleMarcado = clientaId !== null && cumplePara === clientaId;
  const valeMarcado = clientaId !== null && valePara === clientaId;
  // Se apagan solos y NO vuelven solos (spike del club: sin conexión el canje se apaga y queda así). Si volvieran al
  // recuperar la red, el total bajaría y subiría bajo las manos de quien cobra, con los pagos ya puestos. Se ajusta durante
  // el render, como la clienta de arriba, para que el total no se pinte un cuadro con el canje que ya no vale.
  if (cumpleMarcado && cumple.tipo !== "disponible") {
    setCumplePara(null);
    setCumpleSeApago({
      motivo: cumple.tipo === "sin_conexion" ? "sin_conexion" : "no_disponible",
      pct: cumple.tipo === "sin_conexion" ? cumple.pct : (resumen?.cumplePct ?? PCT_CUMPLE_POR_DEFECTO),
      vez: (cumpleSeApago?.vez ?? 0) + 1,
    });
  }
  if (valeMarcado && vale.tipo !== "disponible") {
    setValePara(null);
    setValeSeApago({
      motivo: vale.tipo === "sin_conexion" ? "sin_conexion" : "no_disponible",
      monto: vale.tipo === "sin_conexion" ? vale.monto : (resumen?.aniversarioMonto ?? 0),
      vez: (valeSeApago?.vez ?? 0) + 1,
    });
  }
  const pctCumple = pctDelCanje(cumpleMarcado, cumple);
  const montoVale = montoDelVale(valeMarcado, vale);

  return {
    lectura,
    abierta: clientaId !== null && abiertaPara === clientaId,
    alternarAbierta: () => setAbiertaPara((a) => (a === clientaId ? null : clientaId)),
    recargar: () => setVuelta((n) => n + 1),
    seUnio: (nuevo) => {
      if (clientaId) setLeido({ clientaId, resumen: nuevo });
    },
    cumple,
    cumpleAplicado: pctCumple !== null,
    pctCumple,
    canjearCumple: () => {
      if (clientaId && cumple.tipo === "disponible" && montoVale === null) setCumplePara(clientaId);
    },
    quitarCumple: () => setCumplePara(null),
    apagarCumpleTrasRechazo: (releer) => {
      setCumplePara(null);
      if (releer) setVuelta((n) => n + 1);
    },
    cumpleSeApago,
    vale,
    valeAplicado: montoVale !== null,
    montoVale,
    usarVale: () => {
      if (clientaId && vale.tipo === "disponible" && pctCumple === null) setValePara(clientaId);
    },
    quitarVale: () => setValePara(null),
    apagarValeTrasRechazo: (releer) => {
      setValePara(null);
      if (releer) setVuelta((n) => n + 1);
    },
    valeSeApago,
  };
}
