import { describe, it, expect } from "vitest";
import { calcularEstado, fotoPrincipal, necesitaReponerPiso, sumarCantidades, UMBRAL_REPOSICION_PISO, UMBRAL_STOCK_BAJO_ALMACEN } from "./inventario-reglas";

// La miniatura de una prenda: Existencias y Conteo tienen que elegir LA MISMA foto
// para la misma prenda, así que la regla vive en un solo lugar y se prueba acá.
describe("fotoPrincipal", () => {
  it("sin fotos no hay miniatura (la fila dibuja el perchero, nunca un roto)", () => {
    expect(fotoPrincipal(undefined)).toBeNull();
    expect(fotoPrincipal(null)).toBeNull();
    expect(fotoPrincipal([])).toBeNull();
  });

  it("gana la marcada como principal, aunque no sea la primera ni la de menor orden", () => {
    expect(
      fotoPrincipal([
        { url: "a.jpg", orden: 0, es_principal: false },
        { url: "b.jpg", orden: 5, es_principal: true },
      ])
    ).toBe("b.jpg");
  });

  it("si ninguna está marcada, gana la de menor orden — sin importar cómo llegaron", () => {
    expect(
      fotoPrincipal([
        { url: "tercera.jpg", orden: 3, es_principal: false },
        { url: "primera.jpg", orden: 1, es_principal: false },
        { url: "segunda.jpg", orden: 2, es_principal: false },
      ])
    ).toBe("primera.jpg");
  });

  it("no reordena el arreglo que recibe", () => {
    const fotos = [
      { url: "b.jpg", orden: 2, es_principal: false },
      { url: "a.jpg", orden: 1, es_principal: false },
    ];
    fotoPrincipal(fotos);
    expect(fotos.map((f) => f.url)).toEqual(["b.jpg", "a.jpg"]);
  });
});

// Umbrales de Felipe: «Reponer piso» con 7 o menos en el piso; «Stock bajo»
// con 10 o menos en el ALMACÉN (no el total — mira solo la reserva). Bajó de
// 20 a 10 el 2026-09-17, probando la pantalla: con 20, un lote chico de
// arranque (boutique, no cadena) caía en "Stock bajo" de entrada. Los ifs de
// `calcularEstado` siguen en orden de severidad: stock_bajo (la reserva ya
// está baja) gana sobre reponer_piso COMO ETIQUETA — pero `necesitaReponerPiso`
// (independiente del chip) sigue ofreciendo el botón mientras quede algo en
// el almacén: "pide traslado" y "reponer lo que queda" no se excluyen.

describe("calcularEstado", () => {
  it("los umbrales son 7 en el piso y 10 en el almacén", () => {
    expect(UMBRAL_REPOSICION_PISO).toBe(7);
    expect(UMBRAL_STOCK_BAJO_ALMACEN).toBe(10);
  });

  it("piso en el umbral o por debajo, con el almacén por encima de 10: reponer", () => {
    expect(calcularEstado(7, 11)).toBe("reponer_piso");
    expect(calcularEstado(1, 50)).toBe("reponer_piso");
    expect(calcularEstado(0, 100)).toBe("reponer_piso");
  });

  it("piso por encima del umbral y almacén sano: normal", () => {
    expect(calcularEstado(8, 11)).toBe("normal");
    expect(calcularEstado(50, 100)).toBe("normal");
  });

  it("almacén en 10 o menos: stock bajo, tenga el piso lo que tenga", () => {
    expect(calcularEstado(50, 10)).toBe("stock_bajo"); // piso lleno, reserva al límite
    expect(calcularEstado(3, 10)).toBe("stock_bajo");
    expect(calcularEstado(0, 5)).toBe("stock_bajo"); // piso vacío, algo de reserva
    expect(calcularEstado(2, 0)).toBe("stock_bajo"); // sin reserva, algo en piso
  });

  it("stock_bajo gana sobre reponer_piso cuando los dos calzarían", () => {
    // Piso bajo (2 <= 7) Y almacén bajo (5 <= 10): la reserva manda como etiqueta.
    expect(calcularEstado(2, 5)).toBe("stock_bajo");
  });

  it("nada en ningún lado: sin stock", () => {
    expect(calcularEstado(0, 0)).toBe("sin_stock");
  });
});

describe("necesitaReponerPiso", () => {
  it("ofrece bajar del almacén aunque el chip diga stock bajo (reserva crítica pero > 0)", () => {
    expect(necesitaReponerPiso(2, 5)).toBe(true); // estado sería stock_bajo, igual hay qué bajar
    expect(necesitaReponerPiso(0, 1)).toBe(true);
    expect(necesitaReponerPiso(7, 11)).toBe(true); // estado reponer_piso
  });

  it("no ofrece nada si el almacén está vacío o el piso ya está cubierto", () => {
    expect(necesitaReponerPiso(2, 0)).toBe(false); // nada que bajar — es sin_stock si piso también es 0
    expect(necesitaReponerPiso(8, 20)).toBe(false); // piso ya cubierto, es normal
  });
});

describe("sumarCantidades (la regla que comparten Existencias y la caja)", () => {
  const fila = (variante_id: string, tipo: string | null, cantidad: number, cantidad_apartada = 0) => ({
    variante_id, cantidad, cantidad_apartada, sububicacion: tipo === null ? null : { tipo },
  });

  it("en una tienda suma piso y almacén, descuenta lo apartado y deja la cuarentena fuera del total", () => {
    const c = sumarCantidades([fila("v1", "piso_venta", 5, 2), fila("v1", "almacen_tienda", 10, 1), fila("v1", "cuarentena", 3)]).get("v1")!;
    expect(c).toMatchObject({ total: 15, piso: 5, almacen: 10, danado: 3, apartado: 3, disponible: 12, pisoDisponible: 3, almacenDisponible: 9 });
    expect(c.estado).toBe(calcularEstado(3, 9));
  });

  it("donde no se separa piso/almacén (Taller) piso, almacén, dañado y estado quedan null", () => {
    const c = sumarCantidades([fila("v1", null, 4, 1)]).get("v1")!;
    expect(c).toMatchObject({ total: 4, disponible: 3, piso: null, almacen: null, danado: null, pisoDisponible: null, estado: null });
  });
});
