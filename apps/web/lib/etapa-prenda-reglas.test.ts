import { describe, expect, it } from "vitest";
import { etapasDesdeFilas, sinLasEnProduccion, soloLasQueLlegaron } from "./etapa-prenda-reglas";

const etapas = etapasDesdeFilas([
  { producto_id: "a", etapa: "en_produccion" },
  { producto_id: "b", etapa: "terminada" },
  { producto_id: "c", etapa: "algo_nuevo" },
]);
const catalogo = ["a", "b", "c", "d"].map((productoId) => ({ productoId }));
const productos = ["a", "b", "c", "d"].map((id) => ({ id }));

describe("las etapas de una prenda en la web", () => {
  it("una etapa que no se reconoce no esconde nada", () => {
    expect([...etapas.keys()]).toEqual(["a", "b"]);
  });

  it("Vender ofrece solo lo que ya llegó a una tienda", () => {
    expect(soloLasQueLlegaron(catalogo, etapas).map((v) => v.productoId)).toEqual(["c", "d"]);
  });

  it("Existencias quita solo lo que aún está en producción", () => {
    expect(sinLasEnProduccion(productos, etapas).map((p) => p.id)).toEqual(["b", "c", "d"]);
  });

  it("si la lectura falla, se muestra todo: nunca se esconde por no saber", () => {
    expect(soloLasQueLlegaron(catalogo, null)).toHaveLength(4);
    expect(sinLasEnProduccion(productos, null)).toHaveLength(4);
  });
});
