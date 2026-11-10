import { describe, expect, it } from "vitest";
import { idDeAncla } from "./ancla-de-la-direccion";

// Tarea 60: «Probar escenario» llega con `#y-si`; el servidor no ve esa parte, así que se lee en el navegador.
describe("idDeAncla", () => {
  it("devuelve el id sin el numeral", () => {
    expect(idDeAncla("#y-si")).toBe("y-si");
  });
  it("sin ancla, o con el numeral solo, no hay nada que buscar", () => {
    expect(idDeAncla("")).toBeNull();
    expect(idDeAncla("#")).toBeNull();
  });
  it("lee un id codificado y no se cae con uno mal escrito", () => {
    expect(idDeAncla("#%C2%BFy-si")).toBe("¿y-si");
    expect(idDeAncla("#%E0%A4%A")).toBe("%E0%A4%A");
  });
});
