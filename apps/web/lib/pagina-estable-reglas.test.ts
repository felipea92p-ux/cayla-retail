import { describe, expect, it } from "vitest";
import { esChangeInmediatoAlClic, esContinuacionDeTecleo, puedeSoltar, reservaNecesaria } from "./pagina-estable-reglas";

// Página de 2000 px, se ven 800: abajo del todo el scroll vale 1200.
const alFondo = { arriba: 1200, alto: 2000, visible: 800 };

describe("reservaNecesaria", () => {
  it("reserva lo que el navegador recortó cuando la página se acorta estando al fondo", () => {
    // Un bloque de 150 px desaparece: el nuevo final obliga a subir 150.
    expect(reservaNecesaria(alFondo, { arriba: 1050, alto: 1850, visible: 800 })).toBe(150);
  });

  it("solo reserva lo recortado, no todo lo que se acortó, si la vista no estaba al fondo", () => {
    // Estaba 100 px por encima del final; se van 150: el navegador solo recorta 50.
    const casiAlFondo = { arriba: 1100, alto: 2000, visible: 800 };
    expect(reservaNecesaria(casiAlFondo, { arriba: 1050, alto: 1850, visible: 800 })).toBe(50);
  });

  it("no hace nada si la página se acortó pero la vista no se movió (había aire abajo)", () => {
    const arriba = { arriba: 300, alto: 2000, visible: 800 };
    expect(reservaNecesaria(arriba, { arriba: 300, alto: 1850, visible: 800 })).toBe(0);
  });

  it("no hace nada si la página creció", () => {
    expect(reservaNecesaria(alFondo, { arriba: 1200, alto: 2100, visible: 800 })).toBe(0);
  });

  it("respeta un scroll pedido por el código (volver arriba, ir a un campo con error)", () => {
    // Subió y además se acortó, pero la vista no quedó pegada al final: no fue un recorte.
    expect(reservaNecesaria(alFondo, { arriba: 0, alto: 1850, visible: 800 })).toBe(0);
    expect(reservaNecesaria(alFondo, { arriba: 600, alto: 1850, visible: 800 })).toBe(0);
  });
});

describe("puedeSoltar", () => {
  it("no suelta mientras el aire reservado se ve", () => {
    // Con 150 reservados y la vista al fondo, el aire está en pantalla.
    expect(puedeSoltar({ arriba: 1200, alto: 2000, visible: 800 }, 150)).toBe(false);
  });

  it("suelta cuando la persona subió lo suficiente para que el aire quede fuera de la vista", () => {
    expect(puedeSoltar({ arriba: 1050, alto: 2000, visible: 800 }, 150)).toBe(true);
    expect(puedeSoltar({ arriba: 400, alto: 2000, visible: 800 }, 150)).toBe(true);
  });
});

// 2026-09-25 — cobertura del buscador con filtrado en vivo (evento `input`, antes fuera del radar de
// PaginaEstable) y del microtask que se adelanta al ResizeObserver: ver PaginaEstable.tsx.
describe("esChangeInmediatoAlClic", () => {
  it("ignora un change pegado a un clic muy reciente (<300ms): ese clic ya abrió la vigilancia", () => {
    expect(esChangeInmediatoAlClic("change", 50)).toBe(true);
    expect(esChangeInmediatoAlClic("change", 299)).toBe(true);
  });

  it("un change que llega 300ms o más después del clic sí abre su propia vigilancia (select con teclado)", () => {
    expect(esChangeInmediatoAlClic("change", 300)).toBe(false);
    expect(esChangeInmediatoAlClic("change", 5000)).toBe(false);
  });

  it("nunca ignora un click, sin importar el tiempo", () => {
    expect(esChangeInmediatoAlClic("click", 10)).toBe(false);
  });

  it("sin vigilancia previa (null), no hay clic reciente que lo cubra", () => {
    expect(esChangeInmediatoAlClic("change", null)).toBe(false);
  });
});

describe("esContinuacionDeTecleo", () => {
  it("una tecla mientras ya hay vigilancia abierta sobre el MISMO contenedor continúa esa vigilancia", () => {
    expect(esContinuacionDeTecleo("input", true, true)).toBe(true);
  });

  it("la primera tecla (sin vigilancia previa) abre una vigilancia nueva, no la continúa", () => {
    expect(esContinuacionDeTecleo("input", false, true)).toBe(false);
  });

  it("una tecla sobre OTRO contenedor (cambió de buscador) abre una vigilancia nueva", () => {
    expect(esContinuacionDeTecleo("input", true, false)).toBe(false);
  });

  it("no aplica a click ni a change, aunque haya vigilancia sobre el mismo contenedor", () => {
    expect(esContinuacionDeTecleo("click", true, true)).toBe(false);
    expect(esContinuacionDeTecleo("change", true, true)).toBe(false);
  });
});
