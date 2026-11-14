import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { alEntrar, alEscribir, problemaEscrito, SIN_ESCRIBIR } from "./cantidad-escrita-reglas";

// Enter y Tab tienen que dejar lo mismo cuando se sale de una celda con algo que no es una cantidad. Con Tab, el navegador saca el cursor de la celda (se dibuja) y recién entonces lo mete en la otra; con Enter,
// la tabla lo pasa con `focus()` DESDE la tecla: salir de la una y entrar a la otra ocurren en el mismo ciclo, sin dibujar entre las dos. Si `empezar` y `terminar` calculan sobre el estado de «este dibujo», la
// segunda pisa a la primera y el aviso de lo que no se guardó se pierde (la celda vuelve a su número y nadie dice por qué); si calculan sobre el más reciente, no. Es lo que se prueba aquí, sin navegador.
//
// CONTRATO
//   PROMETE: que `terminar(a)` seguido de `empezar(b)` en el mismo ciclo deja el mismo estado que cada uno en su propio ciclo (Tab): el aviso de lo que no se guardó, el freno del botón que sigue y el cursor en `b`.
//   ASUME:   que React junta los cambios de un evento y los aplica en orden: uno funcional recibe lo que dejó el anterior, uno de valor lo reemplaza (`alFinalDelEvento` hace exactamente eso).
//   NO PROMETE: cómo se dibuja la celda ni qué hace el navegador con el foco: eso es de `matriz-cantidades.test.ts` y del navegador.

// `useState` y `useImperativeHandle` se sustituyen: el hook se llama aquí fuera de un componente, con el estado de «este dibujo» a la vista y los cambios anotados en una cola.
const react = vi.hoisted(() => ({ dibujo: undefined as unknown, cola: [] as unknown[] }));
vi.mock("react", async (importar) => ({
  ...(await importar<typeof import("react")>()),
  useState: (inicial: unknown) => [react.dibujo ?? inicial, (cambio: unknown) => void react.cola.push(cambio)],
  useImperativeHandle: () => {},
}));

import { useCantidadEscrita } from "../components/alta-producto/useCantidadEscrita";

type Estado = typeof SIN_ESCRIBIR;

/** Lo que deja React al final de UN evento: cada cambio, en orden; uno funcional recibe lo que dejó el anterior y uno de valor lo reemplaza. */
const alFinalDelEvento = (dibujo: Estado): Estado => react.cola.reduce<Estado>((e, cambio) => (typeof cambio === "function" ? (cambio as (e: Estado) => Estado)(e) : (cambio as Estado)), dibujo);

/** Lo que pasa en UN evento sobre el estado de ese dibujo: el hook se dibuja una vez (un componente sonda, como en `useParecidasAlta.test.ts`) y `hacer` usa lo que devuelve. */
function enUnEvento(dibujo: Estado, hacer: (h: ReturnType<typeof useCantidadEscrita>) => void): Estado {
  react.dibujo = dibujo;
  react.cola.length = 0;
  let escrita!: ReturnType<typeof useCantidadEscrita>;
  function Sonda() {
    escrita = useCantidadEscrita();
    return null;
  }
  renderToString(createElement(Sonda));
  hacer(escrita);
  return alFinalDelEvento(dibujo);
}

/** Negro en S con «12345» escrito sobre un 8: no es una cantidad (pasa de 9999), la pantalla se quedó en 8. */
const conMalEscrito = alEscribir(alEntrar(SIN_ESCRIBIR, "negro-s", "8"), "negro-s", "12345", "8").estado;

describe("Enter y Tab dejan lo mismo al salir de una celda con algo que no es una cantidad", () => {
  it("Enter (los dos cambios en el mismo ciclo): el aviso sigue a la vista, el botón que sigue frena una vez y el cursor está en la otra celda", () => {
    const final = enUnEvento(conMalEscrito, (h) => {
      h.terminar("negro-s");
      h.empezar("crudo-s", "3");
    });
    expect(problemaEscrito(final) ?? "(ningún aviso)").toContain("«12345» no se guardó");
    expect(final.frena).toBe(true);
    expect(final.escribiendo?.clave).toBe("crudo-s");
  });

  it("es lo mismo que Tab, que deja el estado de una celda y recién después entra a la otra (un ciclo por evento)", () => {
    const enter = enUnEvento(conMalEscrito, (h) => {
      h.terminar("negro-s");
      h.empezar("crudo-s", "3");
    });
    const trasSalir = enUnEvento(conMalEscrito, (h) => h.terminar("negro-s"));
    const tab = enUnEvento(trasSalir, (h) => h.empezar("crudo-s", "3"));
    expect(enter).toEqual(tab);
  });

  it("si lo escrito sí valía, pasar de una celda a la otra no inventa ningún aviso", () => {
    const valida = alEscribir(alEntrar(SIN_ESCRIBIR, "negro-s", "8"), "negro-s", "5", "8").estado;
    const final = enUnEvento(valida, (h) => {
      h.terminar("negro-s");
      h.empezar("crudo-s", "3");
    });
    expect(problemaEscrito(final)).toBeNull();
    expect(final.frena).toBe(false);
    expect(final.escribiendo?.clave).toBe("crudo-s");
  });

  it("salir de una celda que no es la que se escribía no toca lo escrito (el cursor ya estaba en otra)", () => {
    const final = enUnEvento(conMalEscrito, (h) => h.terminar("otra"));
    expect(final).toBe(conMalEscrito);
  });
});
