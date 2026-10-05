"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { ArrowLeftRight, ChevronRight, ClipboardCheck, PackageOpen, ScanLine, ShoppingBag } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { IconoPercha } from "@/components/ui/IconoPercha";
import type { AccionHacer, ClaveAccionHacer } from "@/lib/existencias-hacer";

/* ====================================================================
   El botón fijo de abajo de Existencias en el celular (rediseño 2026-10-04): «Escanear prenda» y «Hacer…».

   «Escanear prenda» es la consulta más frecuente del piso («¿hay en M?»); «Hacer…» abre una hoja con lo que en pantallas anchas es la
   fila de accesos de la cabecera (`lib/existencias-hacer.ts`: colgar, recibir, contar, trasladar, apartados), cada uno solo si su rol
   lo ve. Sin ninguna acción, solo está «Escanear», a todo el ancho. Es una acción de ESTA pantalla, no navegación (ADR-0206). Desde
   `sm` no existe (CSS): ahí manda la fila de la cabecera.

   La hoja es solo una lista de enlaces: sin campos, sin pasos. Cada fila dice qué es y, en una línea, para qué sirve.
   ==================================================================== */

const ICONO: Record<ClaveAccionHacer, (clase: string) => ReactNode> = {
  colgar: (c) => <IconoPercha aria-hidden className={c} strokeWidth={1.6} />,
  recibir: (c) => <PackageOpen aria-hidden className={c} strokeWidth={1.6} />,
  contar: (c) => <ClipboardCheck aria-hidden className={c} strokeWidth={1.6} />,
  trasladar: (c) => <ArrowLeftRight aria-hidden className={c} strokeWidth={1.6} />,
  apartados: (c) => <ShoppingBag aria-hidden className={c} strokeWidth={1.6} />,
};

export function DockExistencias({ acciones, onEscanear }: { acciones: readonly AccionHacer[]; onEscanear: () => void }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 bg-gradient-to-t from-crema from-70% to-crema/0 px-4 pt-3 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:hidden">
        <button
          type="button"
          onClick={onEscanear}
          className="flex h-14 min-w-0 flex-1 items-center justify-center gap-2.5 rounded-2xl bg-tinta text-[15px] font-semibold text-crema active:scale-[0.99]"
        >
          <ScanLine size={19} aria-hidden />
          Escanear prenda
        </button>
        {acciones.length > 0 && (
          <button
            type="button"
            onClick={() => setAbierta(true)}
            aria-haspopup="dialog"
            className="h-14 shrink-0 rounded-2xl border border-tinta/15 bg-papel px-5 text-[15px] font-semibold text-tinta active:scale-[0.99]"
          >
            Hacer…
          </button>
        )}
      </div>

      {abierta && (
        <Modal variante="hoja" titulo="Hacer" subtitulo="Elige qué vas a hacer en esta sede." onClose={() => setAbierta(false)}>
          <ul className="-mx-1 divide-y divide-tinta/10">
            {acciones.map((a) => {
              return (
                <li key={a.clave}>
                  <Link href={a.href} onClick={() => setAbierta(false)} className="flex min-h-14 items-center gap-3.5 px-1 py-2.5 active:bg-tinta/[0.04]">
                    <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-hueso text-tinta">
                      {ICONO[a.clave]("h-5 w-5")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium text-tinta">{a.etiqueta}</span>
                      <span className="block text-[13px] leading-snug text-taupe">{a.detalle}</span>
                    </span>
                    <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-taupe" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Modal>
      )}
    </>
  );
}
