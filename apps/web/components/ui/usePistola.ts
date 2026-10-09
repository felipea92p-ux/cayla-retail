"use client";

import { useEffect, useRef, type RefObject } from "react";
import { teclaSueltaVaAlEscaner } from "@/lib/escaner-tecla-suelta";
import { LECTOR_VACIO, lecturaSinEnter, teclaDePistola } from "@/lib/existencias-pistola";
import { conCambio, lecturaDePistola, PAUSA_FIN_LECTURA_MS, TECLAS_MIN_LECTURA, type Rafaga } from "@/lib/lectura-pistola";

/* ====================================================================
   usePistola · la pistola de códigos se comporta igual en todo el ERP (Felipe 2026-10-09: «la misma lógica de escanear de
   Vender, en Apartados, Cambios, Devoluciones, Existencias y donde se escanee una prenda»)

   Lo que Vender aprendió a golpes, en UNA pieza:
   1. Lo que entra al campo a ritmo de pistola es un CÓDIGO: exacto o nada. Nunca se resuelve con la fila resaltada de la
      lista ni arrastra lo que la persona ya había escrito delante (`lecturaDePistola` devuelve solo la ráfaga).
   2. Una pistola que no remata con Enter también lee: cuando la ráfaga se calla `PAUSA_FIN_LECTURA_MS`, es su Enter.
   3. Fuera del campo, según la pantalla: `fuera="atraer"` lleva el foco al campo con la primera tecla suelta (Vender: si el foco
      quedó en «Quitar» o «Cobrar», el código se perdía y el Enter activaba ese botón); `fuera="leer"` lee la ráfaga sin mover el
      foco (Existencias: con el panel lateral abierto, las teclas 1–7 son sus atajos y no se le pueden robar).

   La pantalla solo dice qué hacer con lo leído (`alLeer`): agregarlo al ticket, buscar la venta, abrir el panel. Y vacía el
   campo ahí: la pistola escribe la lectura siguiente encima de lo que quede. `antes` es lo que había en el campo antes de la
   ráfaga, por si la pantalla prefiere devolverlo (Existencias conserva el filtro que la persona tenía puesto).

   Una tecla tecleada a mano NO pasa por aquí: su Enter llega al `onKeyDown` del campo como siempre. El Enter de una lectura sí
   se detiene en la captura del documento, antes que React: así ninguna pantalla lo procesa dos veces.
   La lógica de qué cuenta como pistola es pura y vive en `lib/` con sus pruebas; aquí solo se escucha el teclado.
   ==================================================================== */

/** `dentro`: la ráfaga entró al campo (y `antes` es lo que había escrito antes de ella) o llegó con el foco fuera de él (y
 *  `antes` es lo que el campo tiene, que nadie tocó). */
export type Lectura = { codigo: string; antes: string; dentro: boolean };

export type OpcionesPistola = {
  /** Apagada (un modal encima, la caja cerrada, el campo deshabilitado): ni lee ni atrae teclas. */
  activa?: boolean;
  alLeer: (lectura: Lectura) => void;
  /** Qué hacer con una tecla que llega con el foco fuera de un campo de texto. Por defecto, nada. */
  fuera?: "atraer" | "leer" | "nada";
};

const CAMPOS_DE_TEXTO = new Set(["INPUT", "TEXTAREA", "SELECT"]);
function esCampoDeTexto(el: EventTarget | null): boolean {
  const h = el as HTMLElement | null;
  return !!h && (CAMPOS_DE_TEXTO.has(h.tagName) || h.isContentEditable);
}

export function usePistola(campo: RefObject<HTMLInputElement | null>, { activa = true, alLeer, fuera = "nada" }: OpcionesPistola) {
  // Lo leído se resuelve con la pantalla de AHORA (el ticket, el stock), no con la del render en que se colgó el oyente.
  const alLeerRef = useRef(alLeer);
  useEffect(() => {
    alLeerRef.current = alLeer;
  });

  // 1 y 2 · Dentro del campo. Se escucha en el documento y no en el elemento: un campo que se vuelve a montar (Cambios lo monta
  // de nuevo con cada búsqueda) seguiría sin oyente.
  useEffect(() => {
    if (!activa) return;
    let anterior = "";
    // La hora de la TECLA y no la del `input`: el navegador sella el `keydown` con la hora del teclado, pero el `input` con la
    // de cuando lo procesa, y si la pantalla tarda en repintar entre tecla y tecla (Existencias filtra cientos de prendas con
    // cada una) la ráfaga de la pistola parecía una persona y se partía a la mitad.
    let horaTecla: number | null = null;
    let rafaga: Rafaga | null = null;
    let espera: number | undefined;
    const esElCampo = (t: EventTarget | null) => t !== null && t === campo.current;

    function leer(el: HTMLInputElement): boolean {
      const codigo = lecturaDePistola(el.value, rafaga);
      if (codigo === null || rafaga === null) return false;
      const antes = el.value.slice(0, rafaga.desde);
      rafaga = null;
      window.clearTimeout(espera);
      alLeerRef.current({ codigo, antes, dentro: true });
      return true;
    }
    // El texto de antes de cada tecla: lo que haya puesto la pantalla (un `setQ("")`) no dispara eventos y no se puede seguir.
    function antesDeEscribir(e: Event) {
      if (esElCampo(e.target)) anterior = (e.target as HTMLInputElement).value;
    }
    function alEscribir(e: Event) {
      if (!esElCampo(e.target)) return;
      const el = e.target as HTMLInputElement;
      rafaga = conCambio(rafaga, anterior, el.value, horaTecla ?? e.timeStamp);
      horaTecla = null;
      anterior = el.value;
      window.clearTimeout(espera);
      if (rafaga) espera = window.setTimeout(() => leer(el), PAUSA_FIN_LECTURA_MS);
    }
    function alTecla(e: KeyboardEvent) {
      if (!esElCampo(e.target)) return;
      horaTecla = e.timeStamp;
      if (e.key !== "Enter" || e.isComposing) return;
      if (leer(e.target as HTMLInputElement)) {
        e.preventDefault();
        e.stopPropagation();
      } else {
        rafaga = null;
        window.clearTimeout(espera);
      }
    }
    document.addEventListener("beforeinput", antesDeEscribir, true);
    document.addEventListener("input", alEscribir, true);
    document.addEventListener("keydown", alTecla, true);
    return () => {
      window.clearTimeout(espera);
      document.removeEventListener("beforeinput", antesDeEscribir, true);
      document.removeEventListener("input", alEscribir, true);
      document.removeEventListener("keydown", alTecla, true);
    };
  }, [activa, campo]);

  // 3 · Fuera del campo.
  useEffect(() => {
    if (!activa || fuera === "nada") return;
    if (fuera === "atraer") {
      const atraer = (e: KeyboardEvent) => {
        if (e.defaultPrevented) return; // «/» ya lo usó el atajo de búsqueda
        const el = campo.current;
        if (el && !el.disabled && teclaSueltaVaAlEscaner(e, document.activeElement)) el.focus();
      };
      window.addEventListener("keydown", atraer);
      return () => window.removeEventListener("keydown", atraer);
    }
    let lector = LECTOR_VACIO;
    let espera: number | undefined;
    const leerFuera = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (esCampoDeTexto(e.target)) {
        lector = LECTOR_VACIO;
        return;
      }
      const r = teclaDePistola(lector, e.key, e.timeStamp || performance.now());
      lector = r.lector;
      window.clearTimeout(espera);
      if (r.codigo) {
        e.preventDefault();
        e.stopPropagation();
        alLeerRef.current({ codigo: r.codigo, antes: campo.current?.value ?? "", dentro: false });
        return;
      }
      if (lector.texto) {
        espera = window.setTimeout(() => {
          const codigo = lecturaSinEnter(lector, TECLAS_MIN_LECTURA);
          lector = LECTOR_VACIO;
          if (codigo) alLeerRef.current({ codigo, antes: campo.current?.value ?? "", dentro: false });
        }, PAUSA_FIN_LECTURA_MS);
      }
    };
    document.addEventListener("keydown", leerFuera, true);
    return () => {
      window.clearTimeout(espera);
      document.removeEventListener("keydown", leerFuera, true);
    };
  }, [activa, fuera, campo]);
}
