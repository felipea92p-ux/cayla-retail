import { describe, it, expect } from "vitest";
import {
  armarVariantesAjuste,
  MOTIVOS_AJUSTE,
  motivosAjusteDisponibles,
  NOTA_REPOSICION_CERRADA,
  reposicionCerrada,
  type FilaAjuste,
} from "./ajuste-reglas";

const PISO = "sub-piso";
const ALMACEN = "sub-almacen";

function fila(id: string, talla: string | null, extra: Partial<FilaAjuste> = {}): FilaAjuste {
  return {
    id,
    sku: `SKU-${id}`,
    talla: talla === null ? null : { valor: talla },
    color: { nombre: "Beige" },
    stock: [],
    ...extra,
  };
}

describe("armarVariantesAjuste — talla", () => {
  // Regresión: `variantes.talla` (texto) se eliminó en 20260917100500; la talla ahora
  // llega anidada como `talla:tallas ( valor )`. Si el mapeo lee la forma vieja, el
  // modal muestra todas las prendas como «Única» sin dar error.
  it("la talla sale de `talla.valor` (columna talla_id → tallas), no de una columna de texto", () => {
    const [v] = armarVariantesAjuste([fila("1", "M")], PISO, ALMACEN);
    expect(v.talla).toBe("M");
  });

  it("sin talla asignada queda en null (la pantalla la rotula «Única»)", () => {
    const [v] = armarVariantesAjuste([fila("1", null)], PISO, ALMACEN);
    expect(v.talla).toBeNull();
  });

  it("ordena como se cuenta una curva, no alfabéticamente: XS · S · M · L · XL", () => {
    const filas = ["L", "XS", "M", "XL", "S"].map((t, i) => fila(String(i), t));
    expect(armarVariantesAjuste(filas, PISO, ALMACEN).map((v) => v.talla)).toEqual(["XS", "S", "M", "L", "XL"]);
  });

  it("las tallas numéricas van en orden numérico: 28 · 30 · 32 · 34", () => {
    const filas = ["32", "28", "34", "30"].map((t, i) => fila(String(i), t));
    expect(armarVariantesAjuste(filas, PISO, ALMACEN).map((v) => v.talla)).toEqual(["28", "30", "32", "34"]);
  });

  it("una variante sin talla va al final, después de las que sí la tienen", () => {
    const filas = [fila("a", null), fila("b", "L"), fila("c", "S")];
    expect(armarVariantesAjuste(filas, PISO, ALMACEN).map((v) => v.talla)).toEqual(["S", "L", null]);
  });

  it("dentro de una misma talla respeta el orden en que llegaron (estable)", () => {
    const filas = [
      fila("1", "M", { color: { nombre: "Beige" } }),
      fila("2", "S", { color: { nombre: "Beige" } }),
      fila("3", "M", { color: { nombre: "Negro" } }),
      fila("4", "S", { color: { nombre: "Negro" } }),
    ];
    expect(armarVariantesAjuste(filas, PISO, ALMACEN).map((v) => v.varianteId)).toEqual(["2", "4", "1", "3"]);
  });

  it("no altera el arreglo que recibe", () => {
    const filas = [fila("1", "L"), fila("2", "S")];
    armarVariantesAjuste(filas, PISO, ALMACEN);
    expect(filas.map((f) => f.id)).toEqual(["1", "2"]);
  });
});

describe("armarVariantesAjuste — stock y datos de la fila", () => {
  it("separa piso y almacén y suma el total", () => {
    const [v] = armarVariantesAjuste(
      [
        fila("1", "M", {
          stock: [
            { cantidad: 5, sububicacion_id: PISO },
            { cantidad: 12, sububicacion_id: ALMACEN },
          ],
        }),
      ],
      PISO,
      ALMACEN
    );
    expect(v.stockPiso).toBe(5);
    expect(v.stockAlmacen).toBe(12);
    expect(v.stockSinDividir).toBe(17);
  });

  it("sin fila de stock en una sububicación, esa cantidad es 0 y no rompe", () => {
    const [v] = armarVariantesAjuste([fila("1", "M", { stock: [{ cantidad: 4, sububicacion_id: PISO }] })], PISO, ALMACEN);
    expect(v.stockAlmacen).toBe(0);
    expect(v.stockPiso).toBe(4);
  });

  it("una variante que nunca tuvo stock en la sede (stock null o vacío) queda en 0", () => {
    const filas = armarVariantesAjuste([fila("1", "S", { stock: null }), fila("2", "M", { stock: [] })], PISO, ALMACEN);
    expect(filas.map((v) => [v.stockPiso, v.stockAlmacen, v.stockSinDividir])).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ]);
  });

  it("en una sede que no separa piso de almacén, el total sigue saliendo de la suma", () => {
    const [v] = armarVariantesAjuste(
      [fila("1", "M", { stock: [{ cantidad: 9, sububicacion_id: null }] })],
      undefined,
      undefined
    );
    expect(v.stockPiso).toBe(0);
    expect(v.stockAlmacen).toBe(0);
    expect(v.stockSinDividir).toBe(9);
  });

  it("sku ausente pasa a texto vacío y color ausente a null", () => {
    const [v] = armarVariantesAjuste([fila("1", "M", { sku: null, color: null })], PISO, ALMACEN);
    expect(v.sku).toBe("");
    expect(v.color).toBeNull();
  });
});

describe("motivos del ajuste — «Reposición» no toca el piso (ADR-0208)", () => {
  const valores = (xs: readonly { valor: string }[]) => xs.map((m) => m.valor);

  it("en el piso de una tienda que separa piso y almacén, «Reposición» no se ofrece", () => {
    expect(valores(motivosAjusteDisponibles("piso", true))).toEqual(["merma", "conteo_fisico", "otro"]);
    expect(reposicionCerrada("piso", true)).toBe(true);
  });

  it("en el almacén sigue disponible", () => {
    expect(valores(motivosAjusteDisponibles("almacen", true))).toContain("reposicion");
    expect(reposicionCerrada("almacen", true)).toBe(false);
  });

  it("en una sede que no separa piso y almacén (el Taller) no cambia nada", () => {
    expect(valores(motivosAjusteDisponibles("piso", false))).toEqual(valores(MOTIVOS_AJUSTE));
    expect(reposicionCerrada("piso", false)).toBe(false);
  });

  it("la nota nombra los dos caminos que sí sacan del almacén y el motivo para lo encontrado de más", () => {
    expect(NOTA_REPOSICION_CERRADA).toContain("«Bajar al piso»");
    expect(NOTA_REPOSICION_CERRADA).toContain("«Reponer»");
    expect(NOTA_REPOSICION_CERRADA).toContain("«Conteo físico»");
  });
});
