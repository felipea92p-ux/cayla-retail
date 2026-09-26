"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpDown, Bookmark, FileText, History, LayoutGrid, Undo2, Wallet, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { repartirAccesos, type AccesoVenta, type IconoAcceso } from "@/lib/vender-accesos";

const ICONO: Record<IconoAcceso, LucideIcon> = {
  caja: Wallet,
  apartados: Bookmark,
  cambios: ArrowUpDown,
  devoluciones: Undo2,
  historial: History,
  proformas: FileText,
};

const BOTON =
  "inline-flex h-9 items-center gap-1.5 rounded-lg border border-sand bg-crema px-2.5 text-[12.5px] text-tinta/80 transition-[background-color,border-color,color,transform] duration-200 ease-[var(--ease-cayla)] hover:border-taupe hover:text-tinta active:translate-y-px";

/**
 * Los accesos del Punto de venta a las pantallas que trabajan de la mano con él (spike 2026-09-26, hallazgo 1). Solo
 * llegan los que el rol de la cuenta abre (`accesosVisibles`, en la página).
 *
 *  · Escritorio (`sm` en adelante): los de uso diario a la vista, con ícono; Historial y Proformas en «Más».
 *  · Celular: un solo botón «Más» que abre la hoja con todos. Antes se escondían bajo 640 px y el teléfono —donde las
 *    colaboradoras pasan el día— no tenía ninguna puerta desde la caja.
 */
export function AccesosVenta({ accesos, extraMas }: { accesos: readonly AccesoVenta[]; extraMas?: (cerrar: () => void) => React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const { aLaVista, enMas } = repartirAccesos(accesos);
  if (accesos.length === 0 && !extraMas) return null;

  return (
    <>
      <nav aria-label="Otras operaciones de la tienda" className="hidden items-center gap-1.5 sm:flex">
        {aLaVista.map((a) => {
          const Icono = ICONO[a.icono];
          return (
            <Link key={a.href} href={a.href} className={BOTON}>
              <Icono className="h-4 w-4" aria-hidden />
              {a.texto}
            </Link>
          );
        })}
        {enMas.length > 0 && (
          <button type="button" onClick={() => setAbierto(true)} className={BOTON} aria-haspopup="dialog">
            <LayoutGrid className="h-4 w-4" aria-hidden />
            Más
          </button>
        )}
      </nav>

      {/* Celular: todo en «Más» (no hay ancho para una fila de botones). */}
      <button type="button" onClick={() => setAbierto(true)} className={`${BOTON} sm:hidden`} aria-haspopup="dialog">
        <LayoutGrid className="h-4 w-4" aria-hidden />
        Más
      </button>

      {abierto && (
        <Modal titulo="Más de la tienda" subtitulo="Lo que trabaja de la mano con la venta." variante="hoja" ancho="max-w-md" onClose={() => setAbierto(false)}>
          {(cerrar) => (
            <div>
              {/* En escritorio solo lo que no está a la vista; en el celular, todo. */}
              <div className="grid grid-cols-3 gap-2">
                {accesos.map((a) => {
                  const Icono = ICONO[a.icono];
                  const yaVisible = aLaVista.includes(a);
                  return (
                    <Link
                      key={a.href}
                      href={a.href}
                      onClick={cerrar}
                      className={`flex flex-col items-center gap-2 rounded-xl border border-sand bg-crema px-2 py-4 text-center text-[13px] text-tinta transition-colors hover:border-taupe active:translate-y-px ${yaVisible ? "sm:hidden" : ""}`}
                    >
                      <Icono className="h-5 w-5 text-tinta/70" aria-hidden />
                      {a.texto}
                    </Link>
                  );
                })}
              </div>
              {extraMas?.(cerrar)}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
