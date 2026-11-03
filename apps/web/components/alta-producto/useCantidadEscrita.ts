"use client";

import { useImperativeHandle, useState, type ChangeEvent, type FocusEvent, type Ref } from "react";
import { alEntrar, alEscribir, alQuererSeguir, alRechazar, alSalir, escritoInvalido, problemaEscrito, SIN_ESCRIBIR, textoEnLaCaja, type ReglaCantidad } from "../../lib/cantidad-escrita-reglas";

// La celda de cantidad que muestra lo que se escribe, y a la pantalla solo le llega una cantidad de verdad: el porqué, en `lib/cantidad-escrita-reglas.ts`.
// Imports RELATIVOS a propósito, como `MatrizCantidades`, que se dibuja sola en una prueba de node (vitest no resuelve `@/`).

/**
 * `regla`: qué cantidades valen en estas celdas y qué se dice de lo demás. Sin ella, las de una celda de stock, de 0 a 9999.
 * `freno`: para cuando las celdas viven en una tabla y el botón que sigue en la pantalla: la pantalla le pasa un `useRef` a la tabla y, en su botón, `if (freno.current?.()) return;`. Con una referencia, una tecla no vuelve a
 * dibujar toda la pantalla (`ProductoForm` tiene más de 2000 líneas).
 */
export function useCantidadEscrita(regla?: ReglaCantidad, freno?: Ref<() => boolean>) {
  const [estado, setEstado] = useState(SIN_ESCRIBIR);
  /** Para el botón que sigue: `true` = todavía no, lo escrito no valió y hay que leer por qué (`alQuererSeguir`). */
  function frenar(): boolean {
    const r = alQuererSeguir(estado, regla);
    setEstado(r.estado);
    return r.frena;
  }
  useImperativeHandle(freno, () => frenar);
  return {
    /** Lo que muestra la celda mientras se escribe en ella; si no, `undefined` y manda su número. */
    texto: (clave: string): string | undefined => (estado.escribiendo?.clave === clave ? estado.escribiendo.texto : undefined),
    /** ¿Lo escrito en esta celda no es una cantidad? */
    invalida: (clave: string): boolean => estado.escribiendo?.clave === clave && escritoInvalido(estado, regla),
    /** Qué decir bajo la tabla, o `null`. */
    problema: problemaEscrito(estado, regla),
    empezar(clave: string, valor: string) {
      setEstado(alEntrar(estado, clave, valor));
    },
    /** `fijar` recibe la cantidad que vale: la nueva, o lo que había si lo escrito no es una cantidad. */
    escribir(clave: string, crudo: string, valor: string, fijar: (valor: string) => void) {
      const r = alEscribir(estado, clave, crudo, valor, regla);
      setEstado(r.estado);
      fijar(r.paraLaPantalla);
    },
    terminar(clave: string) {
      setEstado(alSalir(estado, clave, regla));
    },
    /** Otra cosa cambió el número (− y +, «+1 a todas»): la celda vuelve a mostrarlo, aunque el cursor siga en ella (en el iPhone, un botón no se lo lleva), y se calla el aviso. */
    olvidar() {
      setEstado(SIN_ESCRIBIR);
    },
    /** Dice que esto no se guardó, para lo que se escribió fuera de una celda («Llenar todas con»). `suya`: si esa caja tiene otra regla que las celdas. */
    rechazar(texto: string, suya = regla) {
      setEstado(alRechazar(texto, suya));
    },
    frenar,
    /**
     * Las props de una caja cuyo número vive en la pantalla (el ticket, lo que se devuelve, lo que llegó), para no repetirlas en cada una.
     * `valor`: su número, como texto. `fijar`: recibe la cantidad que vale. `tope`: lo que pasa de ahí se ve recortado, como lo deja la pantalla, que recibe lo tecleado (Vender avisa cuando se pasa). Es texto y no `type="number"`: ese no deja entrar la coma («2,5» queda 25).
     */
    campo(clave: string, valor: string, fijar: (valor: string) => void, tope?: number) {
      const escrito = estado.escribiendo?.clave === clave ? estado.escribiendo.texto : undefined;
      return {
        inputMode: "numeric" as const,
        autoComplete: "off",
        value: escrito === undefined ? valor : textoEnLaCaja(escrito, tope),
        "aria-invalid": (escrito !== undefined && escritoInvalido(estado, regla)) || undefined,
        onFocus: (e: FocusEvent<HTMLInputElement>) => {
          e.currentTarget.select();
          setEstado(alEntrar(estado, clave, valor));
        },
        onChange: (e: ChangeEvent<HTMLInputElement>) => {
          const r = alEscribir(estado, clave, e.target.value, valor, regla);
          setEstado(r.estado);
          fijar(r.paraLaPantalla);
        },
        onBlur: () => setEstado(alSalir(estado, clave, regla)),
      };
    },
  };
}

export type CantidadEscrita = ReturnType<typeof useCantidadEscrita>;
