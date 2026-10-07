"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpDown, Bookmark, FileText, History, LayoutGrid, Undo2, Wallet, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { accesosDeMas, type AccesoVenta, type IconoAcceso } from "@/lib/vender-accesos";

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
 * «Más» del Punto de venta (spike «el ticket a lo alto», `docs/maquetas/punto-venta-ticket-alto-2026-09/`, Felipe
 * 2026-09-26): la franja de ancho completo de arriba ya no existe —le quitaba alto al ticket— y todo lo que tenía vive
 * aquí: «Hoy» arriba (`arriba`), las pantallas vecinas que el rol abre (salvo Apartados, que va a la vista) y, al pie,
 * «Cerrar caja» (`pie`).
 */
export function MasDeLaTienda({ accesos, arriba, pie }: { accesos: readonly AccesoVenta[]; arriba?: ReactNode; pie?: (cerrar: () => void) => ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  const enMas = accesosDeMas(accesos);

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className={BOTON} aria-haspopup="dialog">
        <LayoutGrid className="h-4 w-4" aria-hidden />
        Más
      </button>

      {abierto && (
        <Modal titulo="Más de la tienda" subtitulo="Lo que trabaja de la mano con la venta." variante="hoja" ancho="max-w-md" onClose={() => setAbierto(false)}>
          {(cerrar) => (
            <div>
              {arriba}
              {enMas.length > 0 && (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  {enMas.map((a) => {
                    const Icono = ICONO[a.icono];
                    return (
                      <Link
                        key={a.href}
                        href={a.href}
                        onClick={cerrar}
                        className="flex flex-col items-center gap-2 rounded-xl border border-sand bg-crema px-2 py-4 text-center text-[13px] text-tinta transition-colors hover:border-taupe active:translate-y-px"
                      >
                        <Icono className="h-5 w-5 text-tinta/70" aria-hidden />
                        {a.texto}
                      </Link>
                    );
                  })}
                </div>
              )}
              {pie?.(cerrar)}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}

/**
 * «Apartados» a la vista (spike «el ticket a lo alto»): es el único acceso que se lleva el ticket. Con prendas dice
 * «Apartar N» y, al tocarlo, las lleva a Apartados ya cargadas (`onApartar`, `lib/apartar-desde-ticket.ts`) —antes eso
 * era un botón aparte en el pie del ticket—; con el ticket vacío abre Apartados tal cual.
 */
export function BotonApartados({ prendas, onApartar, deshabilitado }: { prendas: number; onApartar: () => void; deshabilitado: boolean }) {
  if (prendas > 0) {
    return (
      <button
        type="button"
        onClick={onApartar}
        disabled={deshabilitado}
        title={`Lleva ${prendas === 1 ? "la prenda" : `las ${prendas} prendas`} del ticket a Apartados`}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-tinta px-3 text-[12.5px] text-crema transition-[background-color,transform] duration-200 ease-[var(--ease-cayla)] hover:bg-rojo-profundo active:translate-y-px disabled:opacity-50"
      >
        <Bookmark className="h-4 w-4" aria-hidden />
        Apartar
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-crema px-1 text-[10.5px] font-semibold text-tinta tabular-nums">{prendas}</span>
      </button>
    );
  }
  return (
    <Link href="/vender/apartados" className={BOTON}>
      <Bookmark className="h-4 w-4" aria-hidden />
      Apartados
    </Link>
  );
}
