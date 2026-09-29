"use client";

import type { ReactNode } from "react";
import { EtiquetaAhora, MarcaCampo } from "@/components/alta-producto/guia";
import type { EstadoCampo } from "@/lib/alta-producto-guia";
import type { PendienteFicha } from "@/lib/producto-ficha-guia";

// «Para completar esta ficha» (Editar producto, ADR-0284 actualización c): lo que le falta a una prenda que YA existe —fotos, y
// tejido y patrón en una prenda de tela— como botones que llevan a cada lugar. Es el «qué falta» del alta, pero aquí nada
// bloquea: guardar no depende de esto. Solo se dibuja si la ficha llegó incompleta (o si se completó estando aquí: entonces
// dice «Ficha completa» con su ✓). Una ficha que ya venía completa no muestra nada: quien entra a cambiar un precio no necesita
// leer un ✓.

export function TiraFicha({ pendientes, completadaAqui, onIr }: { pendientes: readonly PendienteFicha[]; completadaAqui: boolean; onIr: (p: PendienteFicha) => void }) {
  if (pendientes.length === 0) {
    if (!completadaAqui) return null;
    return (
      <div role="status" className="anim-revelar flex items-center gap-2 rounded-xl border border-sand bg-papel px-4 py-3 text-[13px] font-medium text-verde">
        <MarcaCampo estado="hecho" />
        Ficha completa
      </div>
    );
  }
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-xl border border-sand bg-papel px-4 py-3 text-[12.5px] text-taupe">
      <span className="mr-1 text-[13px] font-medium text-tinta">Para completar esta ficha</span>
      {pendientes.map((p, i) => (
        <button key={p.id} type="button" onClick={() => onIr(p)} title={p.detalle} className="hilo-chip">
          <MarcaCampo estado={i === 0 ? "ahora" : "falta"} />
          {p.etiqueta}
        </button>
      ))}
      <span className="text-[12px]">· no hace falta para guardar</span>
    </div>
  );
}

/** El título de un campo con su marca a la izquierda (y «Sigue aquí» si es el que sigue). `null` = el campo ya venía completo: sin marca. */
export function ConMarca({ estado, children }: { estado: EstadoCampo | null; children: ReactNode }) {
  if (!estado) return <>{children}</>;
  // La marca y el texto van en una fila que NO se envuelve: una etiqueta larga («Acepta que la contactemos por WhatsApp») se parte
  // dentro de su propio texto, no deja la marca sola en una línea de arriba.
  return (
    <span className="inline-flex items-start gap-x-1.5 align-middle">
      <span className="mt-px shrink-0">
        <MarcaCampo estado={estado} />
      </span>
      <span className="min-w-0">{children}</span>
      {estado === "ahora" && (
        <span className="shrink-0 self-center">
          <EtiquetaAhora />
        </span>
      )}
    </span>
  );
}
