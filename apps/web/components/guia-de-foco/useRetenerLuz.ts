"use client";

import { createContext, useEffect, useRef, type FocusEvent, type PointerEvent } from "react";
import { esCajaDeTexto } from "@/components/alta-producto/useGuiaAlta";

// La mitad de la guía que mira a la PERSONA y no al formulario: ¿sigue tecleando en este campo? (CLAUDE.md «Guía de foco», ADR-0284
// act. h.) La comparten `CampoGuiado` (modales) y `FilaAlta` (Nuevo producto): una sola definición de «estar escribiendo».
//
// Por qué el FOCO y no el movimiento del mouse: el foco dice exactamente «el cursor sigue en esta caja» y sirve igual con teclado
// (Tab), con lector de pantalla y con el dedo en el celular, donde no hay mouse que mover. Un mouse que se roza a media palabra
// adelantaría la luz antes de tiempo. Lo que sí comparte con esa idea: mientras se teclea, la luz espera.

/** Quien decide qué campo sigue (el formulario o `useGuiaCampos`) escucha estas dos cosas. */
export type RetencionLuz = { enfocar: (id: string) => void; soltar: (id: string) => void };

/** El formulario del alta lo provee; `FilaAlta` lo lee. (Los modales lo reciben por `guia`.) */
export const RetencionLuzContexto = createContext<RetencionLuz | null>(null);

/** «texto»: retiene la luz solo mientras se TECLEA en él (un combo o un chip avanzan al elegir: elegir es «terminé»).
 *  «fila»: para un campo de VARIAS opciones (tallas, colores, etiquetas): la retiene mientras la persona siga tocando algo dentro de
 *  él, y la suelta al tocar o enfocar cualquier otra cosa de la página. No necesita cableado de quien lo usa. */
export type ModoRetencion = "texto" | "fila";

/**
 * Los manejadores de UN bloque con `data-campo`. Mientras la persona TECLEA en él (o, en modo «fila», elige dentro de él), la luz se
 * queda ahí; al salir, pasa al que sigue. Los eventos de foco que llegan de un portal (la lista de un combo, una hoja hija) no son de
 * este bloque: se ignoran. Sin `id` o sin `retencion` no hace nada.
 */
export function useRetenerLuz(id: string | undefined, retencion: RetencionLuz | null | undefined, modo: ModoRetencion = "texto") {
  const enfocar = retencion?.enfocar;
  const soltar = retencion?.soltar;
  const bloque = useRef<HTMLDivElement>(null);
  // El último evento NATIVO que React vio dentro de este bloque, contando el de una hoja que el bloque abrió (un portal: React lo sube
  // por su árbol aunque en el DOM esté fuera). El oyente de documento de abajo lo compara para saber si un toque fue «afuera».
  const dentro = useRef<Event | null>(null);

  // Si el campo desaparece con la persona escribiendo en él (se cierra el modal, se cambia de paso), la luz no se queda esperándola.
  // Solo si el bloque ya salió del DOM: en desarrollo React simula un desmontaje con el bloque aún en pantalla y el foco puesto (el
  // `autoFocus`), y soltar ahí borraría justo el registro que la persona necesita.
  useEffect(() => {
    const el = bloque.current;
    return () => {
      if (id && soltar && !el?.isConnected) soltar(id);
    };
  }, [id, soltar]);

  // Solo en modo «fila»: en un campo de varias opciones ninguna caja de texto avisa cuándo se terminó, y en Safari un botón ni toma el
  // foco al hacer clic. Se suelta al tocar o enfocar algo que React no vio dentro del bloque. El oyente va en burbuja sobre `document`:
  // para entonces React (que escucha en su raíz, más adentro) ya marcó en `dentro` lo que sí era de este bloque.
  useEffect(() => {
    if (modo !== "fila" || !id || !soltar) return;
    const alTocarAfuera = (ev: Event) => {
      if (dentro.current !== ev) soltar(id);
    };
    document.addEventListener("pointerdown", alTocarAfuera);
    document.addEventListener("focusin", alTocarAfuera);
    return () => {
      document.removeEventListener("pointerdown", alTocarAfuera);
      document.removeEventListener("focusin", alTocarAfuera);
    };
  }, [modo, id, soltar]);

  function onFocus(e: FocusEvent<HTMLDivElement>) {
    dentro.current = e.nativeEvent;
    if (!id || !enfocar || !soltar || !e.currentTarget.contains(e.target)) return;
    if (modo === "fila" || (esCajaDeTexto(e.target) && e.target.getAttribute("role") !== "combobox")) enfocar(id);
    else soltar(id);
  }

  // Solo en modo «fila»: el clic cuenta aunque el botón no tome el foco (Safari no se lo da), y el de una hoja que esta fila abrió
  // (un portal) también: React lo hace subir por el árbol de React, y por eso aquí no se mira el DOM.
  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    dentro.current = e.nativeEvent;
    if (modo === "fila" && id && enfocar) enfocar(id);
  }

  function onBlur(e: FocusEvent<HTMLDivElement>) {
    if (!id || !soltar || !e.currentTarget.contains(e.target)) return;
    // Pasar de una caja a otra del mismo bloque (un grupo de tres datos, la matriz de cantidades) no es salir de él.
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    // Un tick después, no dentro del blur: ahí el foco aún no llegó al control siguiente (`document.activeElement` es <body>) y la luz
    // que cambia de sitio mueve nodos del DOM. El FocusScope de Radix lo lee como «se perdió el foco», lo devuelve al contenedor del
    // modal y Tab nunca llega al campo de al lado.
    window.setTimeout(() => soltar(id), 0);
  }

  return { ref: bloque, onFocus, onBlur, onPointerDown };
}
