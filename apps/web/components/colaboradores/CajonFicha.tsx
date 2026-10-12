"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEscapeLibre } from "@/components/ui/useEscapeLibre";

/** Debe coincidir con `.anim-cajon-salida` en globals.css. */
const MS_SALIDA = 240;

/**
 * El cajón al costado de Equipo, igual al de Existencias (sin velo; la lista sigue viva y tocar otra fila le cambia el
 * contenido). Lo usan la ficha de una persona y la de una terminal. Quien lo usa pone su título y su bajada con `Dialog.Title` y `Dialog.Description`.
 * `clave`: al pasar de una fila a otra el contenido se re-asienta; el cajón no se cierra ni se vuelve a abrir.
 */
export function CajonFicha({ clave, onCerrar, children }: { clave: string; onCerrar: () => void; children: ReactNode }) {
  const [cerrando, setCerrando] = useState(false);
  const pedirCierre = useCallback(() => setCerrando(true), []);
  useEffect(() => {
    if (!cerrando) return;
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(onCerrar, reducido ? 0 : MS_SALIDA);
    return () => clearTimeout(t);
  }, [cerrando, onCerrar]);
  // Escape cierra el cajón solo si ningún control de adentro lo usó (useEscapeLibre.ts).
  const alEscape = useEscapeLibre(pedirCierre);

  return (
    <Dialog.Root open modal={false} onOpenChange={(abierto) => !abierto && pedirCierre()}>
      <Dialog.Portal>
        <Dialog.Content
          onEscapeKeyDown={alEscape}
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[27rem] flex-col border-l border-sand bg-papel outline-none ${cerrando ? "anim-cajon-salida" : "anim-cajon"}`}
        >
          <div key={clave} className="anim-asentar flex min-h-0 flex-1 flex-col">
            <button
              type="button"
              onClick={pedirCierre}
              aria-label="Cerrar"
              className="absolute right-5 top-5 z-10 rounded-full p-1.5 text-tinta transition-colors hover:bg-tinta/[0.05] hover:text-rojo"
            >
              <X aria-hidden className="h-5 w-5" strokeWidth={1.5} />
            </button>
            <div className="scroll-cayla min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-8 pt-7">{children}</div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
