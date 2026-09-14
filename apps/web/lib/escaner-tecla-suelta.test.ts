import { describe, it, expect } from "vitest";
import { teclaSueltaVaAlEscaner } from "./escaner-tecla-suelta";

// La pistola escribe donde esté el foco. Si la encargada de sede tocó un chip, una
// tarjeta o «Quitar» antes de escanear, el código caería en ese botón y el Enter final
// lo activaría — cobrar a medio escaneo o quitar una línea del ticket. Estas pruebas
// fijan qué tecla suelta se redirige al escáner y cuál se deja en paz.

const letra = { key: "b", ctrlKey: false, metaKey: false, altKey: false };
const digito = { key: "7", ctrlKey: false, metaKey: false, altKey: false };
const boton = { tagName: "BUTTON", isContentEditable: false };

describe("teclaSueltaVaAlEscaner — cuándo redirigir", () => {
  it("una letra con el foco en un botón va al escáner (el chip, «Quitar», «Cobrar»)", () => {
    expect(teclaSueltaVaAlEscaner(letra, boton)).toBe(true);
  });

  it("un dígito también: los códigos de barras suelen empezar por número", () => {
    expect(teclaSueltaVaAlEscaner(digito, boton)).toBe(true);
  });

  it("sin nada enfocado (el body tras cerrar un modal) va al escáner", () => {
    expect(teclaSueltaVaAlEscaner(letra, null)).toBe(true);
    expect(teclaSueltaVaAlEscaner(letra, { tagName: "BODY", isContentEditable: false })).toBe(true);
  });

  it("tolera el tagName en minúsculas", () => {
    expect(teclaSueltaVaAlEscaner(letra, { tagName: "button", isContentEditable: false })).toBe(true);
    expect(teclaSueltaVaAlEscaner(letra, { tagName: "input", isContentEditable: false })).toBe(false);
  });
});

describe("teclaSueltaVaAlEscaner — cuándo dejar la tecla donde está", () => {
  it("con el foco en un campo de texto (DNI, cantidad, precio) la tecla es de ese campo", () => {
    expect(teclaSueltaVaAlEscaner(letra, { tagName: "INPUT", isContentEditable: false })).toBe(false);
    expect(teclaSueltaVaAlEscaner(letra, { tagName: "TEXTAREA", isContentEditable: false })).toBe(false);
    expect(teclaSueltaVaAlEscaner(letra, { tagName: "SELECT", isContentEditable: false })).toBe(false);
  });

  it("un contenteditable también es un campo de texto", () => {
    expect(teclaSueltaVaAlEscaner(letra, { tagName: "DIV", isContentEditable: true })).toBe(false);
  });

  it("Enter, Tab, flechas y Escape no son caracteres: no roban el foco", () => {
    for (const key of ["Enter", "Tab", "ArrowDown", "Escape", "F5", "Shift"]) {
      expect(teclaSueltaVaAlEscaner({ ...letra, key }, boton)).toBe(false);
    }
  });

  it("el espacio activa el botón enfocado, se respeta", () => {
    expect(teclaSueltaVaAlEscaner({ ...letra, key: " " }, boton)).toBe(false);
  });

  it("los atajos con Ctrl / Cmd / Alt no son escaneo", () => {
    expect(teclaSueltaVaAlEscaner({ ...letra, ctrlKey: true }, boton)).toBe(false);
    expect(teclaSueltaVaAlEscaner({ ...letra, metaKey: true }, boton)).toBe(false);
    expect(teclaSueltaVaAlEscaner({ ...letra, altKey: true }, boton)).toBe(false);
  });
});
