import { describe, expect, it } from "vitest";
import { PAUSA_MISMO_CODIGO_MS, esLecturaRepetida, estadoCorto, keyframesAviso, keyframesVuelo, mensajeEscaneo, normalizarLectura } from "./escaner-reglas";

describe("escaner-reglas", () => {
  it("normaliza la lectura como la dejaría el lector", () => {
    expect(normalizarLectura("  CAY-0012\n")).toBe("CAY-0012");
  });

  it("ignora la misma etiqueta mientras sigue delante de la cámara", () => {
    const ultima = { codigo: "CAY-0012", en: 1_000 };
    expect(esLecturaRepetida("CAY-0012", ultima, 1_000 + PAUSA_MISMO_CODIGO_MS - 1)).toBe(true);
  });

  it("vuelve a contar la misma etiqueta pasada la pausa (segunda unidad)", () => {
    const ultima = { codigo: "CAY-0012", en: 1_000 };
    expect(esLecturaRepetida("CAY-0012", ultima, 1_000 + PAUSA_MISMO_CODIGO_MS)).toBe(false);
  });

  it("una etiqueta distinta nunca espera", () => {
    expect(esLecturaRepetida("CAY-0099", { codigo: "CAY-0012", en: 1_000 }, 1_001)).toBe(false);
    expect(esLecturaRepetida("CAY-0012", null, 0)).toBe(false);
  });

  it("dice qué pasó con cada lectura", () => {
    expect(mensajeEscaneo({ estado: "agregada", codigo: "C1", nombre: "Blusa Emma · M" })).toEqual({ tono: "verde", texto: "Blusa Emma · M · al ticket" });
    expect(mensajeEscaneo({ estado: "agotada", codigo: "C1", nombre: "Blusa Emma · M" }).tono).toBe("ambar");
    expect(mensajeEscaneo({ estado: "tope", codigo: "C1", nombre: "Blusa Emma · M" }).texto).toContain("Ya están todas");
    expect(mensajeEscaneo({ estado: "no-encontrada", codigo: "XYZ" }).texto).toBe("No encontramos «XYZ» en esta tienda");
    expect(mensajeEscaneo({ estado: "en_almacen", codigo: "C1", nombre: "Blusa Emma · M", almacen: 2 })).toEqual({
      tono: "ambar",
      texto: "Blusa Emma · M no entró: está en el almacén",
    });
  });

  it("la etiqueta corta de lo que está en el almacén empieza por el NO: no entró al ticket (D-40)", () => {
    expect(estadoCorto({ estado: "agregada", codigo: "C1" })).toBeNull();
    expect(estadoCorto({ estado: "agotada", codigo: "C1" })).toBe("Agotada aquí");
    expect(estadoCorto({ estado: "en_almacen", codigo: "C1", almacen: 2 })).toBe("No entró · en almacén");
    // Todas las del piso ya están en el ticket y hay más en el almacén: la que se escaneó, para el sistema, está ahí.
    expect(estadoCorto({ estado: "tope", codigo: "C1", almacen: 3 })).toBe("No entró · en almacén");
    expect(estadoCorto({ estado: "tope", codigo: "C1", almacen: null })).toBe("Sin más stock");
    expect(estadoCorto({ estado: "no-encontrada", codigo: "XYZ" })).toBe("No es de esta tienda");
  });
});

describe("el vuelo de la tarjeta al ticket", () => {
  const escala = (t: unknown) => Number(/scale\(([\d.]+)\)/.exec(String(t))?.[1]);

  it("sale del visor y termina exactamente en la bolsa", () => {
    const k = keyframesVuelo(-120, 340);
    expect(k[0].transform).toContain("translate3d(0, 10px, 0)");
    expect(k.at(-1)?.transform).toContain("translate3d(-120px, 340px, 0)");
    expect(k.at(-1)?.offset).toBe(1);
  });

  it("no rebota: la tarjeta nunca crece por encima de su tamaño", () => {
    for (const f of [...keyframesVuelo(80, 300), ...keyframesAviso()]) expect(escala(f.transform)).toBeLessThanOrEqual(1);
  });

  it("los tramos van en orden", () => {
    const offsets = keyframesVuelo(0, 0).map((f) => f.offset as number);
    expect(offsets).toEqual([...offsets].sort((a, b) => a - b));
  });
});
