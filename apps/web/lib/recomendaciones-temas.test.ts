import { describe, expect, it } from "vitest";
import { necesitaCatalogo, resumirCatalogo, tallasParaMostrar, temaQueSeRepite, temasDe, type DatosCatalogo } from "./recomendaciones-temas";

const ids = (texto: string) => temasDe(texto).map((t) => t.id);

describe("de qué habla lo que escribió el cliente", () => {
  it("los casos de la maqueta: tallas y colores, envío, un elogio, el horario", () => {
    const lucia = temasDe("Podrían tener más tallas grandes, XXXL, y más variedad de colores.");
    expect(lucia.map((t) => t.id)).toEqual(["tallas", "colores"]);
    expect(lucia[0]).toMatchObject({ nombre: "Tallas grandes · XXXL", talla: "XXXL", rango: "grandes" });
    expect(temasDe("Me encantaría que la tienda online haga envíos a provincia. Vivo en Chiclayo.")).toEqual([
      { id: "envio", nombre: "Envío a provincia" },
    ]);
    expect(ids("La chica que me atendió el sábado fue súper amable y me ayudó a combinar todo. ¡Gracias!")).toEqual(["elogio"]);
    expect(ids("Deberían abrir los domingos en la tarde, es cuando más puedo ir.")).toEqual(["horario"]);
  });

  it("la talla como se escribe en el catálogo: 3XL es XXXL, 2xl es XXL, «talla 42» es 42, «talla m» es M", () => {
    expect(temasDe("Quisiera la blusa en 3XL")[0]).toMatchObject({ id: "tallas", talla: "XXXL", nombre: "Tallas grandes · XXXL" });
    expect(temasDe("¿Tienen 2xl?")[0]).toMatchObject({ talla: "XXL" });
    expect(temasDe("No encuentro jean talla 42")[0]).toMatchObject({ talla: "42", rango: null, nombre: "Talla 42" });
    expect(temasDe("Necesito talla m")[0]).toMatchObject({ talla: "M" });
    expect(temasDe("Ojalá tengan tallas pequeñas")[0]).toMatchObject({ talla: null, rango: "pequenas", nombre: "Tallas pequeñas" });
  });

  it("una queja de atención no es un elogio, aunque diga «gracias»", () => {
    expect(ids("La vendedora fue grosera conmigo, gracias por nada")).toEqual(["atencion"]);
    expect(ids("Me atendieron muy mal en Lima")).toEqual(["atencion"]);
    expect(ids("Todo excelente, ¡gracias!")).toEqual(["elogio"]);
  });

  it("un elogio que pide algo más no se cuenta como elogio: lo que pide va primero", () => {
    expect(ids("Me encantó la tienda, pero falta talla XXL")).toEqual(["tallas"]);
  });

  it("no se confunde: el nombre Rosa no es un color, «destino» no es una tela desteñida, un texto sin tema no inventa uno", () => {
    expect(ids("Hola, soy Rosa y quisiera envío a domicilio")).toEqual(["envio"]);
    expect(temasDe("Hola, soy Rosa y quisiera envío a domicilio")[0]!.nombre).toBe("Envío a domicilio");
    expect(ids("Mi destino es Lima, me gusta la marca")).toEqual([]);
    expect(ids("Solo quería saludar")).toEqual([]);
  });

  it("precio y calidad", () => {
    expect(ids("Está muy caro el pantalón")).toEqual(["precio"]);
    expect(ids("La blusa se descosió a la semana")).toEqual(["calidad"]);
  });

  it("solo tallas y colores piden leer el catálogo", () => {
    expect(necesitaCatalogo(temasDe("Más colores, por favor"))).toBe(true);
    expect(necesitaCatalogo(temasDe("Envío a provincia"))).toBe(false);
    expect(necesitaCatalogo([])).toBe(false);
  });
});

describe("el catálogo que sirve para responder", () => {
  const TALLAS = [
    { id: "t-xl", valor: "XL" },
    { id: "t-xxl", valor: "xxl " },
    { id: "t-42", valor: "42" },
  ];
  const COLORES = [
    { codigo: "NEG", nombre: "Negro", hex: "#222222" },
    { codigo: "BEI", nombre: "Beige", hex: "#d8c3a5" },
    { codigo: "VIN", nombre: "Vino", hex: null },
  ];

  it("cuenta MODELOS por talla (no prendas) y colores en uso; lo que no se reconoce no cuenta", () => {
    const d = resumirCatalogo(
      [
        { producto_id: "p1", talla_id: "t-xl", color_codigo: "NEG" },
        { producto_id: "p1", talla_id: "t-xl", color_codigo: "BEI" }, // el mismo modelo en otro color: sigue siendo 1 modelo en XL
        { producto_id: "p2", talla_id: "t-xl", color_codigo: "NEG" },
        { producto_id: "p2", talla_id: "t-xxl", color_codigo: "NEG" },
        { producto_id: "p3", talla_id: null, color_codigo: "XXX" }, // sin talla y con un color que no existe
      ],
      TALLAS,
      COLORES,
    );
    expect(d.modelosPorTalla).toEqual({ XL: 2, XXL: 1 });
    expect(d.colores.total).toBe(2);
    expect(d.colores.masUsados.map((c) => c.nombre)).toEqual(["Negro", "Beige"]);
  });

  it("las tallas que se muestran: la que pidió con sus vecinas, o las grandes / las pequeñas", () => {
    const tallas = (texto: string, datos: DatosCatalogo | null = null) => tallasParaMostrar(temasDe(texto)[0]!, datos);
    expect(tallas("Tallas XXXL")).toEqual(["XL", "XXL", "XXXL"]);
    expect(tallas("Talla XS")).toEqual(["XS", "S", "M"]);
    expect(tallas("Talla M")).toEqual(["S", "M", "L"]);
    expect(tallas("Más tallas grandes")).toEqual(["XL", "XXL", "XXXL"]);
    expect(tallas("Más tallas pequeñas")).toEqual(["XS", "S", "M"]);
    const numeros: DatosCatalogo = { modelosPorTalla: { "38": 3, "40": 2, "44": 1, M: 9 }, colores: { total: 0, masUsados: [] } };
    expect(tallas("Jean talla 42", numeros)).toEqual(["40", "42", "44"]);
  });
});

describe("lo que se repite en el mes (para el Resumen)", () => {
  it("el tema que nombran dos o más; elogios y quejas de atención no cuentan; con una sola no hay patrón", () => {
    expect(temaQueSeRepite(["Más tallas grandes", "Necesito XXL", "Me encantó, gracias"])).toEqual({ id: "tallas", nombre: "tallas grandes", veces: 2 });
    expect(temaQueSeRepite(["Más tallas grandes"])).toBeNull();
    expect(temaQueSeRepite(["Todo excelente, gracias", "Súper amable la chica que me atendió"])).toBeNull();
    expect(temaQueSeRepite([])).toBeNull();
  });
});
