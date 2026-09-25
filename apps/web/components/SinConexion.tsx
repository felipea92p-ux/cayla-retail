"use client";

import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";
import { borrar, guardar, leer } from "@/lib/almacen-local";
import { diaYHoraLima } from "@/lib/fechas-lima";
import { esCopiaGuardada } from "@/lib/sin-conexion-reglas";

const CLAVE_PERSONA = "cayla:sw:persona";
/** En desarrollo el SW no se registra (serviría JavaScript viejo tras cada cambio); para probarlo: esta llave en "1". */
const CLAVE_SW_DEV = "cayla:sw-dev";

/**
 * Borra las copias de pantallas que guardó el service worker y las listas de turno recordadas (ADR-0207). Se llama
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
  const [enLinea, setEnLinea] = useState(true);
  const [copiaDe, setCopiaDe] = useState<string | null>(null);

  useEffect(() => {
    // Se mide UNA vez, al cargar la página entera: el layout no se vuelve a montar al navegar dentro de la app.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (esCopiaGuardada(generadoEn, new Date())) setCopiaDe(generadoEn);
    setEnLinea(navigator.onLine);
    const alCambiar = () => setEnLinea(navigator.onLine);
    window.addEventListener("online", alCambiar);
    window.addEventListener("offline", alCambiar);
    return () => {
      window.removeEventListener("online", alCambiar);
      window.removeEventListener("offline", alCambiar);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Volvió la red mientras se veía una copia: la copia deja de importar en cuanto se navega o se recarga.
  if (enLinea && !copiaDe) return null;

  return (
    <div role="status" className="mb-4 flex items-start gap-2 rounded-lg border border-ambar/35 bg-ambar/[0.08] px-3 py-2 text-[13px] text-ambar-profundo">
      <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>
        {!enLinea ? <b className="font-semibold">Sin conexión. </b> : null}
        {copiaDe
          ? `Estás viendo la copia guardada en este equipo (${diaYHoraLima(copiaDe).dia} · ${diaYHoraLima(copiaDe).hora}). Lo que guardes sube solo al volver el internet.`
          : "Lo que guardes en Vender, Recibir o Nuevo producto queda en este equipo y sube solo al volver el internet."}
        {enLinea && copiaDe ? " Ya hay internet: recarga la pantalla para ver lo de ahora." : null}
      </span>
    </div>
  );
}
