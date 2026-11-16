import { describe, expect, it } from "vitest";
import { direccionSinMarca, frenoDeImpresion, VENTANAS, ventanaDeLaDireccion, ventanaDelEquipo, type QueSeImprime } from "./ventana-de-impresion";

const TODO: QueSeImprime[] = ["ticket", "etiqueta", "hoja"];

describe("ventanaDeLaDireccion", () => {
  it("lee la marca de los íconos", () => {
    expect(ventanaDeLaDireccion("?ventana=caja")).toBe("caja");
    expect(ventanaDeLaDireccion("?q=blusa&ventana=etiquetas")).toBe("etiquetas");
    expect(ventanaDeLaDireccion("?ventana=normal")).toBe("normal");
  });
  it("sin marca, o con una que no existe, no cambia nada", () => {
    expect(ventanaDeLaDireccion("")).toBeNull();
    expect(ventanaDeLaDireccion("?ventana=oficina")).toBeNull();
    expect(ventanaDeLaDireccion("?q=caja")).toBeNull();
  });
});

describe("direccionSinMarca", () => {
  it("quita solo la marca y deja lo demás", () => {
    expect(direccionSinMarca("?ventana=caja")).toBe("");
    expect(direccionSinMarca("?q=blusa&ventana=caja&p=2")).toBe("?q=blusa&p=2");
  });
});

describe("frenoDeImpresion", () => {
  it("una ventana sin marca imprime todo (con el cuadro de siempre)", () => {
    for (const que of TODO) for (const s of ["windows", "mac"] as const) expect(frenoDeImpresion("normal", que, s)).toBeNull();
  });

  it("«CAYLA Caja» imprime tickets y frena las hojas A4 y las etiquetas por el cuadro", () => {
    expect(frenoDeImpresion("caja", "ticket", "windows")).toBeNull();
    expect(frenoDeImpresion("caja", "hoja", "windows")).toMatch(/Microsoft Edge/);
    expect(frenoDeImpresion("caja", "etiqueta", "windows")).toMatch(/computadora de la Brother/);
    expect(frenoDeImpresion("caja", "etiqueta", "mac")).toMatch(/ayudante/);
  });

  it("en una Mac la etiqueta por el ayudante va a la Brother desde cualquier ventana", () => {
    for (const v of VENTANAS) expect(frenoDeImpresion(v, "etiqueta", "mac", true)).toBeNull();
  });

  it("«CAYLA Etiquetas» imprime etiquetas y frena tickets y hojas A4", () => {
    expect(frenoDeImpresion("etiquetas", "etiqueta", "windows")).toBeNull();
    expect(frenoDeImpresion("etiquetas", "ticket", "windows")).toMatch(/en la caja/);
    expect(frenoDeImpresion("etiquetas", "hoja", "windows")).toMatch(/Microsoft Edge/);
  });

  it("toda frase que frena dice dónde imprimirlo y cabe en una línea de aviso", () => {
    for (const v of VENTANAS) for (const que of TODO) for (const s of ["windows", "mac"] as const) {
      const f = frenoDeImpresion(v, que, s);
      if (f) expect(f.length).toBeLessThanOrEqual(110);
    }
  });
});

describe("ventanaDelEquipo", () => {
  it("arranca sin marca", () => {
    expect(ventanaDelEquipo.leerEnServidor()).toBe("normal");
  });
});
