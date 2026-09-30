"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ConMarca } from "@/components/ficha-producto/TiraFicha";
import { asegurarVisible, estaEscribiendo, irAlIdCampo } from "@/components/alta-producto/useGuiaAlta";
import { estadosDe, faltanDe, fraseDeLoQueFalta, sePuedeConfirmar, siguienteDe, type CampoDeGuia, type EstadoCampo } from "@/lib/guia-campos";

// El estado de la guía de foco de UN modal (o de cualquier formulario corto). CLAUDE.md «Guía de foco», ADR-0284.
//
//   const guia = useGuiaCampos([
//     { id: "monto", nombre: "Monto", requerido: true, hecho: monto > 0, pendiente: "Escribe el monto." },
//     { id: "nota", nombre: "Nota", requerido: false, hecho: nota !== "", pendiente: "" },
//   ]);
//   <CampoGuiado guia={guia} id="monto"><CampoTexto etiqueta={guia.etiqueta("monto", "Monto")} … /></CampoGuiado>
//   <PieGuia guia={guia} />
//   <Boton disabled={!guia.puedeConfirmar} title={guia.frase ?? undefined} className={guia.claseConfirmar}>Guardar</Boton>
//
// `hecho` y `requerido` salen de la validación REAL del modal (la misma regla que apaga su botón): la guía no inventa reglas.

export type GuiaCampos = {
  campos: readonly CampoDeGuia[];
  estado: (id: string) => EstadoCampo;
  /** El título de un campo con su marca a la izquierda (y «Sigue aquí» si es el que sigue): para el `etiqueta` de `CampoTexto`, `Interruptor`… */
  etiqueta: (id: string, texto: ReactNode) => ReactNode;
  faltan: CampoDeGuia[];
  /** El id del campo que sigue, o null. */
  ahora: string | null;
  /** Solo lo REQUERIDO cuenta. */
  puedeConfirmar: boolean;
  /** «Falta: nombre y motivo» (para el `title` del botón apagado), o null si nada bloquea. */
  frase: string | null;
  /** «hilo-seguir» cuando ya se puede confirmar: un solo aro sobre el botón principal. */
  claseConfirmar: string;
  /** Lleva a un campo (lo deja a la vista, lo destella y, si es de texto, le pone el cursor). */
  ir: (id: string) => void;
  /** La persona empezó a escribir en una caja de texto de este campo: conserva la luz hasta que salga (lo llama `CampoGuiado`). */
  enfocar: (id: string) => void;
  /** Dejó de escribir en ese campo (salió de él, o el campo desapareció): la luz puede pasar al que sigue. */
  soltar: (id: string) => void;
};

/**
 * `enModal` (por defecto sí): el formulario vive dentro de un modal, que se desplaza solo lo mínimo. Una PANTALLA con su propio
 * formulario corto (Conteo ▸ Abrir un conteo) pasa `{ enModal: false }`: se lleva el campo a la vista de la ventana, sin taparlo
 * con la barra de abajo ni con la cabecera.
 */
export function useGuiaCampos(campos: readonly CampoDeGuia[], { enModal = true }: { enModal?: boolean } = {}): GuiaCampos {
  // El campo de texto donde la persona está escribiendo: mientras siga ahí conserva la luz (`siguienteDe`). Sin esto, la primera
  // letra del nombre ya lo daba por «hecho» y la luz se iba al siguiente campo a media palabra.
  const [escribiendoEn, setEscribiendoEn] = useState<string | null>(null);
  const enfocar = useCallback((id: string) => setEscribiendoEn(id), []);
  const soltar = useCallback((id: string) => setEscribiendoEn((actual) => (actual === id ? null : actual)), []);

  const estados = estadosDe(campos, escribiendoEn);
  const ahora = siguienteDe(campos, escribiendoEn)?.id ?? null;
  const puedeConfirmar = sePuedeConfirmar(campos);

  // Cuando lo que sigue cambia, si el nuevo campo quedó fuera de vista dentro del modal se le trae con suavidad. Nunca mientras la
  // persona teclea (mover la luz sí, mover el modal no), y no al abrir (ahí el modal ya pone su propio foco).
  const previo = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const antes = previo.current;
    previo.current = ahora;
    if (antes === undefined || antes === ahora || ahora === null || estaEscribiendo()) return;
    asegurarVisible(ahora, { enModal });
  }, [ahora, enModal]);

  return {
    campos,
    estado: (id) => estados[id] ?? "opcional",
    etiqueta: (id, texto) => <ConMarca estado={estados[id] ?? "opcional"}>{texto}</ConMarca>,
    faltan: faltanDe(campos),
    ahora,
    puedeConfirmar,
    frase: fraseDeLoQueFalta(campos),
    claseConfirmar: puedeConfirmar ? "hilo-seguir" : "",
    ir: (id) => irAlIdCampo(id, { cursor: true, enModal }),
    enfocar,
    soltar,
  };
}
