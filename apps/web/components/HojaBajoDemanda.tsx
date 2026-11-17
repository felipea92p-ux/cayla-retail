"use client";

import { useEffect, useState, type ComponentType } from "react";
import { avisar } from "@/components/ui/Avisos";
import { useEsperando } from "@/components/ui/Espera";
import { bajoDemanda } from "@/lib/bajo-demanda";

// Una hoja cuyo código se descarga recién al abrirla (ADR-0674, actividad 7). La pantalla la monta igual que antes, solo cuando está
// abierta (`{abierta && <Hoja … />}`): la primera vez baja su código y, mientras tanto, se ve el loader de siempre (ADR-0149).
//
// Si el internet se cae justo al abrirla (principio 9): no tumba la pantalla. Avisa «No se pudo abrir …», llama a `alFallar` (la pantalla
// cierra la hoja) y la próxima vez lo intenta de nuevo. Por eso NO es `next/dynamic`: ese recuerda el fallo y lanza el error al árbol.
//
// Qué NO va aquí: lo que hace falta para cobrar sin conexión (la hoja de cobro, «Venta registrada», el cobro en duda). Eso se queda fijo.

export function hojaBajoDemanda<P extends object>(cargar: () => Promise<ComponentType<P>>, que: string) {
  const pieza = bajoDemanda(cargar);

  function Hoja({ alFallar, ...props }: P & { alFallar: () => void }) {
    const [Lista, setLista] = useState<ComponentType<P> | null>(() => pieza.lista());
    useEsperando(Lista === null);
    useEffect(() => {
      if (Lista) return;
      let vivo = true;
      pieza.pedir().then(
        // La función va envuelta: `setState(Componente)` lo llamaría como un actualizador.
        (c) => vivo && setLista(() => c),
        () => {
          if (!vivo) return;
          avisar.error(`No se pudo abrir ${que}`, { detalle: "Revisa la conexión y vuelve a intentarlo." });
          alFallar();
        },
      );
      return () => {
        vivo = false;
      };
      // Solo al montar: `alFallar` cambia en cada pintada de la pantalla y no debe volver a pedir la pieza.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return Lista ? <Lista {...(props as unknown as P)} /> : null;
  }

  /** Empieza a bajarla sin abrirla (al acercar el mouse o el foco al botón, o cuando la pantalla queda libre). Un fallo aquí no se dice. */
  const precargar = () => void pieza.pedir().catch(() => {});

  return Object.assign(Hoja, { precargar });
}
