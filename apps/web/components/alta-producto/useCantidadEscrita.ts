"use client";

import { useState } from "react";
import { alEntrar, alEscribir, alSalir, escritoInvalido, problemaEscrito, SIN_ESCRIBIR } from "../../lib/cantidad-escrita-reglas";

// La celda de cantidad que muestra lo que se escribe, y a la pantalla solo le llega una cantidad de verdad: el porqué, en `lib/cantidad-escrita-reglas.ts`.
// Imports RELATIVOS a propósito, como `MatrizCantidades`, que se dibuja sola en una prueba de node (vitest no resuelve `@/`).

export function useCantidadEscrita() {
  const [estado, setEstado] = useState(SIN_ESCRIBIR);
  return {
    /** Lo que muestra la celda mientras se escribe en ella; si no, `undefined` y manda su número. */
    texto: (clave: string): string | undefined => (estado.escribiendo?.clave === clave ? estado.escribiendo.texto : undefined),
    /** ¿Lo escrito en esta celda no es una cantidad? */
    invalida: (clave: string): boolean => estado.escribiendo?.clave === clave && escritoInvalido(estado),
    /** Qué decir bajo la tabla, o `null`. */
    problema: problemaEscrito(estado),
    empezar(clave: string, valor: string) {
      setEstado(alEntrar(estado, clave, valor));
    },
    /** `fijar` recibe la cantidad que vale: la nueva, o lo que había si lo escrito no es una cantidad. */
    escribir(clave: string, crudo: string, valor: string, fijar: (valor: string) => void) {
      const r = alEscribir(estado, clave, crudo, valor);
      setEstado(r.estado);
      fijar(r.paraLaPantalla);
    },
    terminar(clave: string) {
      setEstado(alSalir(estado, clave));
    },
    /** Otra cosa cambió el número (− y +, «+1 a todas»): la celda vuelve a mostrarlo, aunque el cursor siga en ella (en el iPhone, un botón no se lo lleva), y se calla el aviso. */
    olvidar() {
      setEstado(SIN_ESCRIBIR);
    },
    /** Dice que esto no se guardó, para lo que se escribió fuera de una celda («Llenar todas con»). */
    rechazar(texto: string) {
      setEstado({ ...SIN_ESCRIBIR, rechazado: texto });
    },
  };
}
