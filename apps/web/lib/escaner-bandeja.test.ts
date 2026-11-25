import { describe, expect, it } from "vitest";
import { avisoDeLectura, filasDeLaBandeja, msDelAvisoDeLectura, type LineaEscaneada, type ResultadoEscaneo } from "./escaner-reglas";

// La bandeja «Escaneadas» y el aviso sobre la cámara (2026-11-25, Felipe): una fila por prenda con su cantidad, y lo que no entró
// se dice arriba y se va solo, sin quedarse en la lista.
const linea = (clave: string, cantidad = 1): LineaEscaneada => ({ clave, referencia: `Blusa ${clave}`, detalle: "Negro · M", fotoUrl: null, cantidad, importe: 50 * cantidad });
const prenda = { referencia: "Blusa Emma", detalle: "Negro · M", precio: 79, fotoUrl: null };

describe("filasDeLaBandeja", () => {
  it("pone la más nueva arriba", () => {
    expect(filasDeLaBandeja([linea("a"), linea("b"), linea("c")]).map((l) => l.clave)).toEqual(["c", "b", "a"]);
  });
  it("la misma prenda dos veces es UNA fila con su cantidad", () => {
    const filas = filasDeLaBandeja([linea("a", 2), linea("b")]);
    expect(filas).toHaveLength(2);
    expect(filas.find((l) => l.clave === "a")?.cantidad).toBe(2);
  });
  it("no repite una clave aunque el ticket la traiga dos veces, ni muestra cantidad 0", () => {
    expect(filasDeLaBandeja([linea("a"), linea("a"), linea("z", 0)]).map((l) => l.clave)).toEqual(["a"]);
  });
  it("sin ticket, sin filas", () => {
    expect(filasDeLaBandeja([])).toEqual([]);
  });
});

describe("avisoDeLectura", () => {
  it("lo que entró se confirma en verde, y desde la segunda dice cuántas van", () => {
    expect(avisoDeLectura({ estado: "agregada", codigo: "x", prenda, lleva: 1 })).toEqual({ tono: "verde", titulo: "Entró al ticket", nombre: "Blusa Emma · Negro · M" });
    expect(avisoDeLectura({ estado: "agregada", codigo: "x", prenda, lleva: 2 }).titulo).toBe("Entró · van 2");
  });
  it("lo que no entró va en ámbar con su motivo corto", () => {
    expect(avisoDeLectura({ estado: "tope", codigo: "x", prenda, almacen: 0 })).toEqual({ tono: "ambar", titulo: "Sin más stock", nombre: "Blusa Emma · Negro · M" });
    expect(avisoDeLectura({ estado: "no-encontrada", codigo: "Q1" })).toEqual({ tono: "ambar", titulo: "No es de esta tienda", nombre: "Código Q1" });
  });
});

describe("msDelAvisoDeLectura", () => {
  const r = (estado: ResultadoEscaneo["estado"], almacen = 0) => ({ estado, almacen });
  it("lo que entró dura menos que lo que no", () => {
    expect(msDelAvisoDeLectura(r("agregada"))).toBeLessThan(msDelAvisoDeLectura(r("agotada")));
  });
  it("lo del almacén con «Agregar» espera más; sin el botón, como cualquier otro", () => {
    expect(msDelAvisoDeLectura(r("en_almacen", 2), { conAgregar: true })).toBeGreaterThan(msDelAvisoDeLectura(r("en_almacen", 2)));
  });
});
