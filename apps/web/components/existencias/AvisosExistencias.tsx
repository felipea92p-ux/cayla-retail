"use client";

import { useRef, useState, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { Modal } from "@/components/ui/Modal";
import { PendienteDeCabecera } from "@/components/PendienteDeCabecera";
import { useLoQueSabeElPanel } from "@/components/existencias/cabecera-existencias";

/** El piso nunca cuadrado (ADR-0391): lo que dice y por qué importa, en UN lugar. Lo dibujan la franja sobre las tarjetas (desde
 *  640 px) y la hoja «Avisos» del celular; cada una le pone su botón. */
export function AvisoPisoSinCuadrar({ accion, guia, className }: { accion?: ReactNode; guia?: string; className?: string }) {
  return (
    <Aviso tono="atencion" guia={guia} className={className} titulo="El piso de esta tienda nunca se ha cuadrado" accion={accion}>
      Lo que dice «en almacén» puede estar colgado hasta el primer cuadre.
    </Aviso>
  );
}

/* ====================================================================
   «Avisos» en la cabecera de Existencias, solo en el celular (Felipe 2026-11-17: «que solo titile, así no tener un espacio ocupado
   del aviso, sino que se abra como se abren los filtros»)

   Bajo 640 px la franja «El piso de esta tienda nunca se ha cuadrado» ocupaba ~120 px sobre la primera prenda, con el título partido en
   cuatro líneas y sin lugar para su explicación (con ella serían 247 px, medido a 375). Ahora es un ícono más de la fila de la cabecera —la misma pieza de los pendientes de
   Productos (`PendienteDeCabecera`): su número en ámbar y el latido del sistema detrás, que corre solo donde las animaciones están
   encendidas (ADR-0625; quieto, avisa el número)— y al tocarlo se abre una hoja, como «Filtros» y «Resumen», donde el aviso sí cabe
   entero, con su porqué. Sin aviso, el ícono no se dibuja. Desde 640 px no cambia nada: la franja sigue sobre las tarjetas.

   El servidor adelanta si hay aviso (`pisoSinCuadrarAntes`, la fecha del último cuadre) para que el ícono no aparezca de golpe; cuando
   el plan del piso llega, manda lo que publica el panel (`cabecera-existencias.ts`), igual que la franja.
   ==================================================================== */
export function AvisosExistencias({
  pisoSinCuadrarAntes,
  puedeCuadrar,
}: {
  /** Lo que el servidor ya sabe al dibujar la página; el panel lo corrige cuando llega el plan del piso. */
  pisoSinCuadrarAntes: boolean;
  /** El barrido barre SIEMPRE la sede activa: sin esto (un líder mirando otra sede), el aviso informa y no lleva botón. */
  puedeCuadrar: boolean;
}) {
  const panel = useLoQueSabeElPanel();
  const pisoSinCuadrar = panel?.pisoSinCuadrar ?? pisoSinCuadrarAntes;
  const [abierto, setAbierto] = useState(false);
  // Al cerrar, el foco vuelve al ícono (la pieza no expone su `ref`: se guarda el botón en el clic, como en «Resumen»).
  const disparador = useRef<HTMLElement | null>(null);
  if (!pisoSinCuadrar) return null;
  return (
    <span
      className="inline-flex sm:hidden"
      onClickCapture={(e) => {
        // Solo los clics que nacieron en el ícono: los de la hoja (un portal) suben por React hasta aquí aunque en la página viva fuera
        // (CLAUDE.md, ADR-0128), y la × de la hoja se guardaba como «a dónde volver»: al cerrar con ella el foco caía al `body`.
        if (!e.currentTarget.contains(e.target as Node)) return;
        const boton = (e.target as HTMLElement).closest("button");
        if (boton) disparador.current = boton;
      }}
    >
      <PendienteDeCabecera
        guia="existencias.avisos"
        icono={<TriangleAlert aria-hidden className="h-4 w-4" />}
        palabra="Avisos"
        titulo="1 aviso: el piso de esta tienda nunca se ha cuadrado"
        n={1}
        queCuenta="aviso"
        onClick={() => setAbierto(true)}
      />
      {abierto && (
        // Sin bajada: la sede ya está en la cabecera de la pantalla, y la bajada de una hoja (taupe sobre el vidrio) no llega a 4,5:1 en
        // claro (4,12 medido con `tema:auditar`; es de la pieza `<Modal>`, pendiente de decisión). No se suma otro texto que no pasa.
        <Modal titulo="Avisos" onClose={() => setAbierto(false)} conCerrar alCerrarEnfocar={disparador}>
          {/* `mt-5`: sin bajada, el título no deja aire y la × (44 px) quedaba 16 px sobre la esquina del aviso (medido a 375 px). */}
          <div className="mt-5 grid gap-4">
            <AvisoPisoSinCuadrar />
            {puedeCuadrar && (
              // El barrido es la entrada de la tienda para cuadrar (2026-11-26, como la franja de la computadora).
              <BotonVer href="/inventario/barrido" alNavegar={() => setAbierto(false)} className="w-full justify-center">
                Hacer el barrido
              </BotonVer>
            )}
          </div>
        </Modal>
      )}
    </span>
  );
}
