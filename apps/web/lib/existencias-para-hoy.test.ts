import { describe, expect, it } from "vitest";
import { porColgarDeLaSede } from "./existencias-para-hoy";
import type { FilaPrenda } from "./existencias-prendas";
import type { AccionPiso, PisoDeTalla } from "./piso-plan";

describe("porColgarDeLaSede (la única cuenta de «por colgar»)", () => {
  // La decisión de cada talla es la del motor del piso (`planPiso`, ADR-0328 act. 7): aquí se escribe a mano, porque lo que se prueba
  // es la CUENTA (qué suma, qué deja fuera, en qué orden), no la regla del motor (eso es `piso-plan.test.ts`).
  const decision = (accion: AccionPiso): PisoDeTalla => ({ accion, requisito: 1, central: true, vendidasRecientes: 0, anotadasRecientes: 0, ritmoAtributo: 0, entraUnaSaleUna: false });
  // Lo libre ya viene neto de apartados (`sumarCantidades`): aquí solo importa piso y almacén.
  const talla = (varianteId: string, productoId: string, color: string, t: string, piso: number | null, almacen: number | null, accion: AccionPiso | null): FilaPrenda =>
    ({
      varianteId, productoId, referencia: `Modelo ${productoId}`, sku: varianteId, talla: t, color, colorHex: null, fotoUrl: null,
      codigosBarras: [], pisoDisponible: piso, almacenDisponible: almacen, disponible: (piso ?? 0) + (almacen ?? 0),
      apartado: 0, danado: 0, enTransito: 0, planPiso: accion ? decision(accion) : null, marca: null,
    }) as FilaPrenda;
  const stock = [
    talla("a", "blusa", "Azul", "S", 0, 4, "por_colgar"), // por colgar: 4
    talla("b", "blusa", "Azul", "M", 0, 2, "por_colgar"), // por colgar: 2
    talla("c", "blusa", "Azul", "L", 1, 9, "mantener"), // colgada: no
    talla("d", "blusa", "Negro", "M", 0, 0, "sin_atras"), // agotada (sin stock atrás): no se puede colgar
    talla("x", "blusa", "Azul", "XL", 0, 3, "mantener"), // talla extrema que puede quedar guardada: el motor no la pide
    talla("e", "polo", "Blanco", "M", 0, 1, "por_colgar"), // por colgar: 1
  ];

  it("cuenta solo lo que el motor manda a colgar y suma lo que se puede colgar", () => {
    const r = porColgarDeLaSede(stock, ["e", "a", "b"]);
    expect(r.tallas).toBe(3);
    expect(r.unidades).toBe(7);
    expect(r.enPausa).toBe(0);
    expect(r.filas.map((f) => f.varianteId)).toEqual(["a", "b", "e"]);
    // Por prenda (modelo + color), en el orden de la lista del día del motor (lo vendido ayer primero), con solo sus tallas por colgar.
    expect(r.prendas.map((p) => [p.productoId, p.color, p.tallas.map((f) => f.talla)])).toEqual([
      ["polo", "Blanco", ["M"]],
      ["blusa", "Azul", ["S", "M"]],
    ]);
  });

  it("sin lista del día (el motor no respondió) las prendas quedan en el orden en que llegaron, y la cifra no cambia", () => {
    const r = porColgarDeLaSede(stock, []);
    expect(r.tallas).toBe(3);
    expect(r.prendas.map((p) => p.productoId)).toEqual(["blusa", "polo"]);
  });

  it("con el piso sin cuadrar no hay nada por colgar: cuenta cuántas tallas esperan, y eso dice el Inicio en su lugar", () => {
    const enPausa = [
      talla("a", "blusa", "Azul", "S", 0, 4, "pausa_sin_cuadre"),
      talla("b", "blusa", "Azul", "M", 0, 2, "pausa_sin_cuadre"),
      talla("c", "blusa", "Azul", "L", 1, 9, "mantener"),
      talla("d", "blusa", "Negro", "M", 0, 0, "sin_atras"),
    ];
    const r = porColgarDeLaSede(enPausa, []);
    expect(r).toMatchObject({ tallas: 0, unidades: 0, enPausa: 2, prendas: [] });
  });

  it("sin decisión del motor (no respondió), en el Taller (no separa piso y almacén) o sin nada, da cero y no NaN", () => {
    expect(porColgarDeLaSede([], [])).toMatchObject({ tallas: 0, unidades: 0, enPausa: 0, prendas: [] });
    expect(porColgarDeLaSede([talla("t", "blusa", "Azul", "M", null, null, "por_colgar")], ["t"])).toMatchObject({ tallas: 0, unidades: 0, enPausa: 0, prendas: [] });
    expect(porColgarDeLaSede([talla("s", "blusa", "Azul", "M", 0, 3, null)], [])).toMatchObject({ tallas: 0, unidades: 0, enPausa: 0, prendas: [] });
  });
});
