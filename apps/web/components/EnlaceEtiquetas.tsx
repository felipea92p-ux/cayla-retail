"use client";

import { useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { avisar } from "@/components/ui/Avisos";
import { avisoSinStock } from "@/lib/stock-en-sede-reglas";

/** Un enlace a Etiquetas de precio (Productos ▸ Tabla y ▸ Grilla) que antes pregunta si en la sede hay algo que imprimir. Sin unidades no navega: la
 *  pantalla de etiquetas solo diría «no hay prendas» y habría que volver. Sale el aviso (qué pasó y cómo se arregla) y el
 *  botón queda en rojo (relleno rojo y letra crema, igual en todos), para que se vea cuál se negó. Si la base no responde, se abre como siempre: la pantalla de
 *  etiquetas sabe decir que está vacía, así que dudar nunca bloquea imprimir. Ctrl/⌘-clic (otra pestaña) no pregunta. */
export function EnlaceEtiquetas({
  href,
  unidades,
  que,
  varias = false,
  sede,
  className,
  children,
  ...resto
}: {
  href: string;
  unidades: () => Promise<number | null>;
  /** Qué se quiso imprimir, para el aviso: «XS Beige», «Blusa Carlita», «Las 3 prendas marcadas». */
  que: string;
  /** `que` nombra varias prendas: «no tienen». */
  varias?: boolean;
  sede: string;
  className: (negado: boolean) => string;
  children: ReactNode;
  "aria-label"?: string;
  title?: string;
  tabIndex?: number;
  "aria-disabled"?: boolean;
}) {
  const router = useRouter();
  const [negado, setNegado] = useState(false);
  const [contando, setContando] = useState(false);
  async function alClic(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (contando) return;
    setContando(true);
    const n = await unidades();
    setContando(false);
    if (n === 0) {
      const aviso = avisoSinStock(que, sede, varias);
      avisar.error(aviso.texto, { detalle: aviso.detalle });
      setNegado(true);
      return;
    }
    setNegado(false);
    router.push(href);
  }
  return (
    <Link href={href} onClick={alClic} aria-busy={contando || undefined} data-sin-stock={negado || undefined} className={className(negado)} {...resto}>
      {children}
    </Link>
  );
}
