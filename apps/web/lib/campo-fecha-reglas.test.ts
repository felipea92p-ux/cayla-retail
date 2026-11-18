import { describe, expect, it } from "vitest";
import { alConfirmarConEnter, conBarras, leerFechaEscrita, mesAlAlcance, mesPorTecla, motivoFueraDeLimites } from "./campo-fecha-reglas";

/** Lo que queda escrito al teclear de una en una, como una persona. */
const teclear = (s: string) => [...s].reduce((t, c) => conBarras(t + c), "");

describe("escribir una fecha", () => {
  it("de corrido, las barras se ponen solas", () => {
    expect(teclear("14092026")).toBe("14/09/2026");
    expect(teclear("1409")).toBe("14/09");
    expect(conBarras("140920269999")).toBe("14/09/2026");
  });

  it("si la persona pone sus barras, se respetan", () => {
    expect(teclear("5/11")).toBe("5/11");
    expect(teclear("5/11/26")).toBe("5/11/26");
    expect(teclear("14/9/2026")).toBe("14/9/2026");
  });

  it("se puede borrar de a una sin que se trabe", () => {
    let t = "14/09/2026";
    const vistos = [];
    while (t) {
      t = conBarras(t.slice(0, -1));
      vistos.push(t);
    }
    expect(vistos.at(-1)).toBe("");
    expect(vistos.length).toBeLessThanOrEqual(10);
  });

  it("no deja entrar letras", () => {
    expect(conBarras("1a4b")).toBe("14");
    expect(conBarras("5/x11")).toBe("5/11");
  });
});

describe("leerFechaEscrita", () => {
  it("entiende la fecha completa y lo que se dice de corrido", () => {
    expect(leerFechaEscrita("14/09/2026", 2026)).toBe("2026-09-14");
    expect(leerFechaEscrita("5/11", 2026)).toBe("2026-11-05");
    expect(leerFechaEscrita("5/11/26", 2030)).toBe("2026-11-05");
    expect(leerFechaEscrita(" 5/1 ", 2027)).toBe("2027-01-05");
  });

  it("un día que no existe o a medias es null, nunca otra fecha", () => {
    for (const t of ["31/02", "31/02/2026", "0/5", "5/0", "5/13", "5", "5/", "5/11/2", "5/11/202", "", "29/02/2026"]) expect(leerFechaEscrita(t, 2026), t).toBeNull();
    expect(leerFechaEscrita("29/02/2028", 2026)).toBe("2028-02-29");
    expect(leerFechaEscrita("29/02", 2028)).toBe("2028-02-29");
  });
});

describe("motivoFueraDeLimites", () => {
  const L = { min: "2026-11-05", max: "2026-11-20", motivoMax: "No puede ser futura." };

  it("dentro del rango no dice nada, y los extremos valen", () => {
    for (const d of ["2026-11-05", "2026-11-10", "2026-11-20"]) expect(motivoFueraDeLimites(d, L), d).toBeNull();
  });

  it("fuera dice por qué: el motivo de quien lo pone, o la fecha", () => {
    expect(motivoFueraDeLimites("2026-11-21", L)).toBe("No puede ser futura.");
    expect(motivoFueraDeLimites("2026-11-04", L)).toBe("No puede ser antes del 05/11/2026.");
  });

  it("sin fecha o sin límites no opina", () => {
    expect(motivoFueraDeLimites("", L)).toBeNull();
    expect(motivoFueraDeLimites("2030-01-01", {})).toBeNull();
  });
});

describe("mesAlAlcance", () => {
  const L = { min: "2026-03-15", max: "2026-11-05" };
  it("un mes vale si algún día suyo se puede elegir", () => {
    expect(mesAlAlcance(2026, 2, L)).toBe(true); // marzo: desde el 15
    expect(mesAlAlcance(2026, 10, L)).toBe(true); // noviembre: hasta el 5
    expect(mesAlAlcance(2026, 1, L)).toBe(false);
    expect(mesAlAlcance(2026, 11, L)).toBe(false);
    expect(mesAlAlcance(2020, 0, {})).toBe(true);
  });
});

describe("mesPorTecla — la grilla de meses, de 3 columnas", () => {
  it("las flechas mueven una celda o una fila, y cruzan de año", () => {
    expect(mesPorTecla(2026, 5, "ArrowRight")).toEqual({ anio: 2026, mes: 6 });
    expect(mesPorTecla(2026, 5, "ArrowDown")).toEqual({ anio: 2026, mes: 8 });
    expect(mesPorTecla(2026, 0, "ArrowLeft")).toEqual({ anio: 2025, mes: 11 });
    expect(mesPorTecla(2026, 11, "ArrowRight")).toEqual({ anio: 2027, mes: 0 });
    expect(mesPorTecla(2026, 1, "ArrowUp")).toEqual({ anio: 2025, mes: 10 });
  });

  it("Inicio, Fin y cambiar de año; otra tecla no es de la grilla", () => {
    expect(mesPorTecla(2026, 5, "Home")).toEqual({ anio: 2026, mes: 0 });
    expect(mesPorTecla(2026, 5, "End")).toEqual({ anio: 2026, mes: 11 });
    expect(mesPorTecla(2026, 5, "PageUp")).toEqual({ anio: 2025, mes: 5 });
    expect(mesPorTecla(2026, 5, "Enter")).toBeNull();
  });
});

describe("Enter y ⌘↵ guardan sin salir del campo: lo escrito cuenta antes (/chaos 2026-11-05)", () => {
  it("lo que se entiende se usa: «3/11» no puede guardarse con la fecha de antes", () => {
    expect(alConfirmarConEnter("3/11", 2026)).toEqual({ accion: "usar", iso: "2026-11-03" });
    expect(alConfirmarConEnter("03/11/2026", 2026)).toEqual({ accion: "usar", iso: "2026-11-03" });
    expect(alConfirmarConEnter("3/11/26", 2030)).toEqual({ accion: "usar", iso: "2026-11-03" });
  });

  it("lo que no se entiende frena el guardado: nunca se guarda otra fecha en silencio", () => {
    for (const t of ["03/1/2", "03/11/202", "31/02", "5", "5/", "13/13/2026"]) expect(alConfirmarConEnter(t, 2026), t).toEqual({ accion: "frenar" });
  });

  it("vacío no opina: de eso se ocupa quien guarda", () => {
    expect(alConfirmarConEnter("", 2026)).toEqual({ accion: "nada" });
    expect(alConfirmarConEnter("   ", 2026)).toEqual({ accion: "nada" });
  });
});
