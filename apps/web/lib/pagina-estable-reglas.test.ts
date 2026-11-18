import { describe, expect, it } from "vitest";
import { esCambioDeVista, esChangeInmediatoAlClic, esContinuacionDeTecleo, puedeSoltar, reservaNecesaria } from "./pagina-estable-reglas";

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

// La red (ADR-0185, act. 2026-11-05): si volver adonde estaba la vista la dejaría casi sin contenido, lo que se veía ya no existe. Las cifras de
// los dos primeros casos son las medidas en Devoluciones a 375 px, con clic real, cuando el flujo todavía no declaraba su cambio de vista.
describe("esCambioDeVista", () => {
  const celular = 812;

  it("registrar una devolución: lo que queda acaba 393 px por encima de donde estaba la vista", () => {
    expect(esCambioDeVista({ arriba: 1351, alto: 2163, visible: celular }, { arriba: 147, alto: 958, visible: celular })).toBe(true);
  });

  it("entrar a un flujo desde abajo de una lista larga", () => {
    expect(esCambioDeVista({ arriba: 2198, alto: 3975, visible: celular }, { arriba: 221, alto: 1033, visible: celular })).toBe(true);
  });

  it("un bloque que se acorta y deja contenido a la vista sigue siendo un bloque: se reserva como siempre", () => {
    // La casilla de la verificación de ADR-0185: quita 276 px al fondo y quedan 524 px de contenido.
    expect(esCambioDeVista({ arriba: 1200, alto: 2000, visible: 800 }, { arriba: 924, alto: 1724, visible: 800 })).toBe(false);
    // Todos los recortes de las pruebas de `reservaNecesaria`.
    expect(esCambioDeVista(alFondo, { arriba: 1050, alto: 1850, visible: 800 })).toBe(false);
    expect(esCambioDeVista({ arriba: 1100, alto: 2000, visible: 800 }, { arriba: 1050, alto: 1850, visible: 800 })).toBe(false);
  });

  it("no alcanza para todo: con 445 px a la vista no salta, y por eso un flujo sigue declarando su cambio de vista", () => {
    // Entrar a un flujo con dos resultados: el título del paso quedaba fuera aunque hubiera contenido.
    expect(esCambioDeVista({ arriba: 588, alto: 1915, visible: celular }, { arriba: 221, alto: 1033, visible: celular })).toBe(false);
  });

  it("el borde: exactamente un cuarto de lo visible todavía se reserva; menos, ya no", () => {
    const alClic = { arriba: 1200, alto: 2400, visible: 800 };
    expect(esCambioDeVista(alClic, { arriba: 600, alto: 1400, visible: 800 })).toBe(false);
    expect(esCambioDeVista(alClic, { arriba: 599, alto: 1399, visible: 800 })).toBe(true);
  });

  it("el aire ya reservado no cuenta como contenido", () => {
    // De los 1800 px de alto, 600 son aire de un clic anterior: el contenido real acaba justo donde estaba la vista.
    const alClic = { arriba: 1200, alto: 2000, visible: 800 };
    const ahora = { arriba: 1000, alto: 1800, visible: 800 };
    expect(esCambioDeVista(alClic, ahora)).toBe(false);
    expect(esCambioDeVista(alClic, ahora, 600)).toBe(true);
  });

  it("si nada se acortó, no hay nada que decidir", () => {
    expect(esCambioDeVista(alFondo, alFondo)).toBe(false);
    expect(esCambioDeVista({ arriba: 1200, alto: 1300, visible: 800 }, { arriba: 1200, alto: 1300, visible: 800 })).toBe(false);
  });

  it("también vale dentro de una hoja: se mide contra lo que se ve de ella", () => {
    expect(esCambioDeVista({ arriba: 900, alto: 1400, visible: 500 }, { arriba: 200, alto: 700, visible: 500 })).toBe(true);
    expect(esCambioDeVista({ arriba: 900, alto: 1400, visible: 500 }, { arriba: 780, alto: 1280, visible: 500 })).toBe(false);
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
