"use client";

import { useState } from "react";
import { alEntrar, alEscribir, alQuererSeguir, alRechazar, alSalir, escritoInvalido, problemaEscrito, SIN_ESCRIBIR, type ReglaCantidad } from "../../lib/cantidad-escrita-reglas";

// La celda de cantidad que muestra lo que se escribe, y a la pantalla solo le llega una cantidad de verdad: el porqué, en `lib/cantidad-escrita-reglas.ts`.
// Imports RELATIVOS a propósito, como `MatrizCantidades`, que se dibuja sola en una prueba de node (vitest no resuelve `@/`).

/** `regla`: qué cantidades valen en estas celdas y qué se dice de lo demás. Sin ella, las de una celda de stock, de 0 a 9999. */
export function useCantidadEscrita(regla?: ReglaCantidad) {
  const [estado, setEstado] = useState(SIN_ESCRIBIR);
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
    /** Para el botón que sigue: `true` = todavía no, lo escrito no valió y hay que leer por qué (`alQuererSeguir`). */
    frenar(): boolean {
      const r = alQuererSeguir(estado, regla);
      setEstado(r.estado);
      return r.frena;
    },
  };
}
