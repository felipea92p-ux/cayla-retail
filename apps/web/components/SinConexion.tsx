"use client";

import { useEffect, useState } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { borrar, guardar, leer } from "@/lib/almacen-local";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { esCopiaGuardada } from "@/lib/sin-conexion-reglas";
import { usePendientesSinSubir } from "@/lib/usePendientesSinSubir";
import { sondearLaBase } from "@/lib/sondear-la-base";
import { useEnLinea } from "@/lib/useEnLinea";

const CLAVE_PERSONA = "cayla:sw:persona";
/** En desarrollo el SW no se registra (serviría JavaScript viejo tras cada cambio); para probarlo: esta llave en "1". */
const CLAVE_SW_DEV = "cayla:sw-dev";
/** Cada cuánto se le pregunta a la base si responde mientras el navegador dice «sin red». */
const CADA_MS_SONDA = 20_000;

/**
 * Borra las copias de pantallas que guardó el service worker y las listas de turno recordadas (ADR-0210). Se llama
 * al cerrar sesión y cuando entra otra persona en el mismo navegador: esas copias tienen datos de la cuenta anterior.
 * Las COLAS no se tocan: son trabajo ya hecho en la tienda que todavía no subió, y perderlo es peor (principio 9).
 */
export async function borrarCopiasSinConexion(): Promise<void> {
  try {
    for (const nombre of await caches.keys()) {
      if (!nombre.startsWith("cayla-paginas-")) continue;
      const cache = await caches.open(nombre);
      for (const req of await cache.keys()) if (!req.url.endsWith("/sin-conexion.html")) await cache.delete(req);
    }
  } catch {
    // Sin Cache API (navegador viejo o modo privado): no hay copias que borrar.
  }
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith("cayla:turno:")) borrar(k);
    }
  } catch {
    // localStorage bloqueado: tampoco se guardó nada.
  }
}

/**
 * Montado una vez en `app/(app)/layout.tsx`. Registra el service worker (`public/sw.js`), borra las copias si en este
 * navegador entró otra persona, y avisa arriba cuando no hay red o cuando lo que se ve es una copia guardada.
 * `generadoEn` es la hora en que el servidor armó esta carga: en una copia, es la hora de la copia.
 */
export function SinConexion({ cuenta, generadoEn }: { cuenta: string; generadoEn: string }) {
  // «Sin conexión» se dice solo con evidencia: el navegador lo dice (`navigator.onLine` puede mentir, 2026-10-10, caja
  // de TRU), nada de la base respondió en los últimos 90 s Y la sonda de abajo tampoco obtuvo respuesta.
  const enLinea = useEnLinea();
  const [sondaFallo, setSondaFallo] = useState(false);
  const [copiaDe, setCopiaDe] = useState<string | null>(null);

  useEffect(() => {
    // Se mide UNA vez, al cargar la página entera: el layout no se vuelve a montar al navegar dentro de la app.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (esCopiaGuardada(generadoEn, new Date())) setCopiaDe(generadoEn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mientras parezca que no hay red, se le pregunta a la base cada 20 s: si responde, el aviso no sale (y si ya
  // estaba, se va). Con red no se sondea: los sondeos de cada pantalla ya traen la evidencia.
  useEffect(() => {
    if (enLinea) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSondaFallo(false);
      return;
    }
    let vivo = true;
    const sondear = async () => {
      if (document.visibilityState !== "visible") return;
      const respondio = await sondearLaBase();
      if (vivo) setSondaFallo(!respondio);
    };
    void sondear();
    const id = window.setInterval(sondear, CADA_MS_SONDA);
    return () => {
      vivo = false;
      window.clearInterval(id);
    };
  }, [enLinea]);
  const sinRed = !enLinea && sondaFallo;

  useEffect(() => {
    if (leer<string | null>(CLAVE_PERSONA, null) !== cuenta) {
      void borrarCopiasSinConexion();
      guardar(CLAVE_PERSONA, cuenta);
    }
    if (!("serviceWorker" in navigator)) return;
    const enDesarrollo = process.env.NODE_ENV !== "production";
    if (enDesarrollo && leer<string | null>(CLAVE_SW_DEV, null) !== "1") return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sin SW la app funciona igual; solo no se abre sin red.
    });
  }, [cuenta]);

  // Lo que espera subir, en cualquier pantalla (ADR-0210, «huecos»): el aviso de cada cola solo se ve en la suya.
  const { pendientes, rechazadas } = usePendientesSinSubir();

  if (!sinRed && !copiaDe && pendientes === 0 && rechazadas === 0) return null;

  return (
    <Aviso tono="atencion" className="mb-4" titulo={sinRed ? "Sin conexión" : undefined}>
      {copiaDe
        ? `Estás viendo la copia guardada en este equipo (${diaYHoraLima(copiaDe).dia} · ${diaYHoraLima(copiaDe).hora}). Lo que guardes sube solo al volver el internet.`
        : sinRed
          ? "Lo que guardes en Vender, Recibir o Nuevo producto queda en este equipo y sube solo al volver el internet."
          : null}
      {!sinRed && copiaDe ? " Ya hay internet: recarga la pantalla para ver lo de ahora." : null}
      {pendientes > 0 ? (
        <b className="font-semibold">
          {" "}
          {pendientes === 1 ? "1 operación espera subir" : `${pendientes} operaciones esperan subir`} desde este equipo.
        </b>
      ) : null}
      {rechazadas > 0 ? (
        <span className="text-rojo-profundo">
          {" "}
          {rechazadas === 1 ? "1 no pudo subir" : `${rechazadas} no pudieron subir`}: revísalas en Vender, Recibir o Nuevo producto.
        </span>
      ) : null}
    </Aviso>
  );
}
