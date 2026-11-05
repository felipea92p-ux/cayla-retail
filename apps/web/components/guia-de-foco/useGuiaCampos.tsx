"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ConMarca } from "@/components/ficha-producto/TiraFicha";
import { asegurarVisible, estaEscribiendo, irAlIdCampo } from "@/components/alta-producto/useGuiaAlta";
import { errorDeCampo, estadosDe, faltanDe, fraseDeLoQueFalta, palabraDeGrado, primeroQueBloquea, sePuedeConfirmar, siguienteDe, type CampoDeGuia, type EstadoCampo } from "@/lib/guia-campos";

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
  /** La hoja pidió decir el grado de cada campo en palabras (`conGrado`): `PieGuia` separa «Faltan» de «Conviene». */
  conGrado: boolean;
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
  /** Quiso confirmar: si falta algo, cada campo pendiente dice su error y se va al primero. Devuelve si se puede seguir (ADR-0611, mejora 1). */
  revisar: () => boolean;
  /** El error que dice un campo bajo su control, o null. Lo dibuja `CampoGuiado`. */
  errorDe: (id: string) => string | null;
  /** Un error que devolvió el guardado para un campo: lo dice bajo él y lleva hasta allá. */
  marcarError: (id: string, mensaje: string) => void;
  /** La persona ya está corrigiendo este campo: su error del guardado se borra (lo llama `CampoGuiado`). */
  limpiarError: (id: string) => void;
};

/**
 * `enModal` (por defecto sí): el formulario vive dentro de un modal, que se desplaza solo lo mínimo. Una PANTALLA con su propio
 * formulario corto (Conteo ▸ Abrir un conteo) pasa `{ enModal: false }`: se lleva el campo a la vista de la ventana, sin taparlo
 * con la barra de abajo ni con la cabecera.
 *
 * `conGrado` (por defecto no): cada título dice en palabras si su campo es «obligatorio», «conviene» u «opcional» mientras no esté hecho, y el pie separa
 * «Faltan:» (lo que bloquea) de «Conviene:» (lo que no). Es opt-in a propósito: lo piden las hojas del Taller (P09 del análisis del 2-nov); que lo adopte
 * el resto de las hojas lo decide Felipe mirándolo (`/unificar`).
 */
export function useGuiaCampos(campos: readonly CampoDeGuia[], { enModal = true, conGrado = false }: { enModal?: boolean; conGrado?: boolean } = {}): GuiaCampos {
  // El campo de texto donde la persona está escribiendo: mientras siga ahí conserva la luz (`siguienteDe`). Sin esto, la primera
  // letra del nombre ya lo daba por «hecho» y la luz se iba al siguiente campo a media palabra.
  const [escribiendoEn, setEscribiendoEn] = useState<string | null>(null);
  const enfocar = useCallback((id: string) => setEscribiendoEn(id), []);
  const soltar = useCallback((id: string) => setEscribiendoEn((actual) => (actual === id ? null : actual)), []);

  // Se avisa solo después de intentar confirmar: un campo vacío no regaña a quien todavía no llega a él.
  const [mostrarFaltas, setMostrarFaltas] = useState(false);
  const [externos, setExternos] = useState<Record<string, string>>({});
  const limpiarError = useCallback((id: string) => {
    setExternos((e) => {
      if (!(id in e)) return e;
      const { [id]: _quitado, ...resto } = e;
      return resto;
    });
  }, []);

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
    etiqueta: (id, texto) => {
      const campo = conGrado ? campos.find((c) => c.id === id) : undefined;
      return (
        <ConMarca estado={estados[id] ?? "opcional"} grado={campo ? palabraDeGrado(campo) : null}>
          {texto}
        </ConMarca>
      );
    },
    faltan: faltanDe(campos),
    conGrado,
    ahora,
    puedeConfirmar,
    frase: fraseDeLoQueFalta(campos),
    claseConfirmar: puedeConfirmar ? "hilo-seguir" : "",
    ir: (id) => irAlIdCampo(id, { cursor: true, enModal }),
    revisar: () => {
      const primero = primeroQueBloquea(campos);
      if (!primero) return true;
      setMostrarFaltas(true);
      irAlIdCampo(primero.id, { cursor: true, enModal });
      return false;
    },
    errorDe: (id) => errorDeCampo(campos, id, mostrarFaltas, externos[id]),
    marcarError: (id, mensaje) => {
      setExternos((e) => ({ ...e, [id]: mensaje }));
      irAlIdCampo(id, { cursor: true, enModal });
    },
    limpiarError,
    enfocar,
    soltar,
  };
}
