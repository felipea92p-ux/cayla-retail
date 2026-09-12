import { describe, it, expect } from "vitest";
import { parsearNumero, aplicarMapeo, camposFaltantes, planPorCabeceras, type PlanDeMapeo } from "./mapeo";

/**
 * `aplicarMapeo` es la pieza donde un bug entra SILENCIOSO a la base: no lanza
 * nada, simplemente importa el precio equivocado. Por eso es la más testeada del
 * importador, y por eso es determinista y sin IA.
 */

describe("parsearNumero — donde se pierde dinero", () => {
  const casos: Array<[string, number]> = [
    ["89.90", 89.9],
    ["89,90", 89.9],            // coma decimal, como escribe media Latinoamérica
    ["S/ 89.90", 89.9],         // con moneda peruana delante
    ["S/89,90", 89.9],
    // "S/." con punto: el símbolo oficial del sol hasta 2015, y el formato que
    // Excel en Perú sigue poniendo por defecto. Sin quitar el símbolo ENTERO,
    // el punto de "S/." contaba como separador y 89.90 salía como 8.990 — el
    // precio multiplicado por 100, sin ningún error. Revisión del 2026-09-11.
    ["S/. 89.90", 89.9],
    ["S/. 1,500.00", 1500],
    ["S/.89,90", 89.9],
    ["S/.120", 120],
    ["$ 45.00", 45],
    ["USD 45.00", 45],
    ["  1.234,56  ", 1234.56],  // europeo: punto de miles, coma decimal
    ["1,234.56", 1234.56],      // americano: al revés
    ["1,500", 1500],            // 3 dígitos detrás = miles, NO 1.5
    ["1.500", 1500],
    ["1.234.567", 1234567],     // varios separadores = todos de miles
    ["0", 0],
    ["", 0],
    ["sin precio", 0],
    ["-45.50", -45.5],
    ["45%", 45],
  ];

  for (const [entrada, esperado] of casos) {
    it(`"${entrada}" → ${esperado}`, () => {
      expect(parsearNumero(entrada)).toBe(esperado);
    });
  }

  it("NO confunde 1.234 europeo con 1,234 decimal — el error de mil veces", () => {
    // parseFloat("1.234,56") devuelve 1.234: mil veces menos. En un catálogo eso
    // no falla, importa una blusa a S/ 1,23 y nadie se entera hasta que se vende.
    expect(parsearNumero("1.234,56")).toBe(1234.56);
    expect(parsearNumero("1.234,56")).not.toBe(1.234);
  });
});

const planSimple: PlanDeMapeo = {
  disposicion: "fila_por_variante",
  columnasTalla: [],
  notas: "",
  columnas: [
    { indice: 0, campo: "codigoCliente", confianza: "alta", porque: "" },
    { indice: 1, campo: "referencia", confianza: "alta", porque: "" },
    { indice: 2, campo: "talla", confianza: "alta", porque: "" },
    { indice: 3, campo: "color", confianza: "alta", porque: "" },
    { indice: 4, campo: "precio", confianza: "alta", porque: "" },
    { indice: 5, campo: "ignorar", confianza: "alta", porque: "columna de notas" },
  ],
};

describe("aplicarMapeo — fila por variante", () => {
  const filas = [
    ["COD", "DESCRIPCION", "TALLA", "COLOR", "P. VENTA", "NOTAS"],
    ["0012", "Blusa manga larga", "M", "Azul marino", "S/ 89.90", "revisar"],
    ["0013", "Falda corta", "S", "Palo rosa", "S/ 59,00", ""],
  ];

  it("convierte cada fila a una variante, con los precios bien", () => {
    const r = aplicarMapeo(filas, planSimple, 0);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({
      codigoCliente: "0012",
      referencia: "Blusa manga larga",
      talla: "M",
      color: "Azul marino",
      precio: 89.9,
      filaOrigen: 1,
    });
    expect(r[1].precio).toBe(59);
  });

  it("respeta la columna marcada como ignorar", () => {
    const r = aplicarMapeo(filas, planSimple, 0);
    expect(JSON.stringify(r[0])).not.toContain("revisar");
  });

  it("descarta filas sin referencia (subtotales, notas al pie)", () => {
    const conBasura = [...filas, ["", "", "", "", "TOTAL: 148.90", ""], ["0014", "Chompa", "L", "Camel", "129", ""]];
    const r = aplicarMapeo(conBasura, planSimple, 0);
    expect(r).toHaveLength(3);
    expect(r.map((x) => x.referencia)).toEqual(["Blusa manga larga", "Falda corta", "Chompa"]);
  });

  it("respeta la fila de cabecera indicada, saltando lo que hay encima", () => {
    const conTitulo = [["INVENTARIO 2026", "", "", "", "", ""], ...filas];
    const r = aplicarMapeo(conTitulo, planSimple, 1);
    expect(r).toHaveLength(2);
    expect(r[0].referencia).toBe("Blusa manga larga");
  });
});

describe("aplicarMapeo — matriz de tallas", () => {
  // El formato clásico de un catálogo de moda: una columna por talla.
  const plan: PlanDeMapeo = {
    disposicion: "matriz_de_tallas",
    notas: "",
    columnas: [
      { indice: 0, campo: "referencia", confianza: "alta", porque: "" },
      { indice: 1, campo: "color", confianza: "alta", porque: "" },
      { indice: 5, campo: "precio", confianza: "alta", porque: "" },
    ],
    columnasTalla: [
      { indice: 2, talla: "S" },
      { indice: 3, talla: "M" },
      { indice: 4, talla: "L" },
    ],
  };

  const filas = [
    ["Referencia", "Color", "S", "M", "L", "Precio"],
    ["Blusa escote V", "Azul marino", "2", "5", "3", "89.90"],
    ["Falda corta", "Palo rosa", "0", "4", "", "59.00"],
  ];

  it("abre la fila en una variante por talla con existencia", () => {
    const r = aplicarMapeo(filas, plan, 0);
    // Blusa: S, M, L. Falda: solo M (0 y vacío no son tallas que existan).
    expect(r).toHaveLength(4);
    expect(r.filter((x) => x.referencia === "Blusa escote V").map((x) => x.talla)).toEqual(["S", "M", "L"]);
    expect(r.filter((x) => x.referencia === "Falda corta").map((x) => x.talla)).toEqual(["M"]);
  });

  it("copia los campos del producto a todas sus tallas", () => {
    const r = aplicarMapeo(filas, plan, 0);
    const blusas = r.filter((x) => x.referencia === "Blusa escote V");
    expect(blusas.every((b) => b.color === "Azul marino" && b.precio === 89.9)).toBe(true);
  });

  it("un 0 significa que esa talla NO existe, no que existe con stock cero", () => {
    const r = aplicarMapeo(filas, plan, 0);
    expect(r.some((x) => x.referencia === "Falda corta" && x.talla === "S")).toBe(false);
  });
});

describe("camposFaltantes", () => {
  it("avisa de lo imprescindible que el plan no cubrió", () => {
    const plan: PlanDeMapeo = {
      disposicion: "fila_por_variante",
      columnasTalla: [],
      notas: "",
      columnas: [{ indice: 0, campo: "referencia", confianza: "alta", porque: "" }],
    };
    expect(camposFaltantes(plan)).toEqual(["precio", "talla"]);
  });

  it("no exige columna de talla cuando las tallas son las cabeceras", () => {
    const plan: PlanDeMapeo = {
      disposicion: "matriz_de_tallas",
      columnasTalla: [{ indice: 2, talla: "S" }],
      notas: "",
      columnas: [
        { indice: 0, campo: "referencia", confianza: "alta", porque: "" },
        { indice: 1, campo: "precio", confianza: "alta", porque: "" },
      ],
    };
    expect(camposFaltantes(plan)).toEqual([]);
  });
});

describe("planPorCabeceras — el camino sin modelo", () => {
  it("reconoce las cabeceras de un catálogo peruano típico por su nombre", () => {
    // Las del archivo de prueba de CAYLA, tal cual.
    const plan = planPorCabeceras(["N", "COD", "CATEGORIA", "DESCRIPCION", "MARCA", "TALLA", "COLOR", "P. COMPRA", "PVP", "OBS"]);
    expect(plan.disposicion).toBe("fila_por_variante");
    expect(plan.columnas.map((c) => c.campo)).toEqual([
      "ignorar", "codigoCliente", "categoria", "referencia", "marca", "talla", "color", "costo", "precio", "ignorar",
    ]);
    expect(camposFaltantes(plan)).toEqual([]);
    // Nunca se declara seguro: es una coincidencia de palabra, no una certeza.
    expect(plan.columnas.every((c) => c.confianza !== "alta")).toBe(true);
  });

  it("un campo se asigna una sola vez y lo que no reconoce va a ignorar, visible", () => {
    const plan = planPorCabeceras(["Precio", "PRECIO", "xyz", ""]);
    expect(plan.columnas.map((c) => c.campo)).toEqual(["precio", "ignorar", "ignorar", "ignorar"]);
    expect(plan.columnas[2].confianza).toBe("baja");
    expect(camposFaltantes(plan)).toEqual(["referencia", "talla"]);
  });
});
