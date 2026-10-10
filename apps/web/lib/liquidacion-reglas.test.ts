import { describe, expect, it } from "vitest";
import {
  cifrasDe,
  codigoDeLiquidacion,
  diasALaVenta,
  tiempoALaVenta,
  errorDeLiquidacion,
  fechaLima,
  filtrar,
  nombreEnVenta,
  piezaDeJson,
  piezaLeidaDeJson,
  precioDeTexto,
  problemaDePrecio,
  type PiezaLiquidacion,
} from "./liquidacion-reglas";

const pieza = (p: Partial<PiezaLiquidacion> = {}): PiezaLiquidacion => ({
  id: "p1",
  estado: "disponible",
  precio: 30,
  precioInicial: 30,
  ubicacionId: "u1",
  ubicacion: "Tienda Trujillo",
  categoriaId: "c1",
  categoria: "Blusas",
  prefijo: "BLU",
  familia: "superior",
  codigo: "LQ7K3M9P",
  etiquetas: 1,
  creadoEn: "2026-10-01T15:00:00Z",
  vendidaEn: null,
  retiradaEn: null,
  motivoRetiro: null,
  ventaId: null,
  ...p,
});

describe("el código de la etiqueta", () => {
  it("acepta el código tal cual, en minúsculas, con espacios o con guion", () => {
    expect(codigoDeLiquidacion("LQ7K3M9P")).toBe("LQ7K3M9P");
    expect(codigoDeLiquidacion("lq7k3m9p")).toBe("LQ7K3M9P");
    expect(codigoDeLiquidacion(" LQ-7K3 M9P ")).toBe("LQ7K3M9P");
  });
  it("no confunde un código de prenda ni uno con letras que el alfabeto no tiene", () => {
    expect(codigoDeLiquidacion("BLU-EMMA-NEG-M")).toBeNull();
    expect(codigoDeLiquidacion("LQ7K3M9")).toBeNull();
    expect(codigoDeLiquidacion("LQ7K3M9PX")).toBeNull();
    expect(codigoDeLiquidacion("LQ0K3M9P")).toBeNull();
    expect(codigoDeLiquidacion("LQOK3M9P")).toBeNull();
    expect(codigoDeLiquidacion("LQIK3M9P")).toBeNull();
  });
});

describe("el precio", () => {
  it("lee coma o punto, hasta dos decimales, y nunca cero", () => {
    expect(precioDeTexto("25")).toBe(25);
    expect(precioDeTexto("25,5")).toBe(25.5);
    expect(precioDeTexto("25.50")).toBe(25.5);
    expect(precioDeTexto("0")).toBeNull();
    expect(precioDeTexto("-5")).toBeNull();
    expect(precioDeTexto("2.555")).toBeNull();
    expect(precioDeTexto("abc")).toBeNull();
  });
  it("bajo el mínimo solo pasa con un líder", () => {
    expect(problemaDePrecio("5", 10, false)).toMatch(/líder/);
    expect(problemaDePrecio("5", 10, true)).toBeNull();
    expect(problemaDePrecio("10", 10, false)).toBeNull();
    expect(problemaDePrecio("", 10, false)).toBe("Escribe el precio.");
  });
});

describe("lo que manda la base", () => {
  it("arma la pieza desde su JSON", () => {
    const p = piezaDeJson({
      id: "p1", estado: "vendida", precio: "20.00", precio_inicial: 35, ubicacion_id: "u1", ubicacion: "TRU", categoria_id: "c1",
      categoria: "Blusas", prefijo: "BLU", familia: null, codigo: null, etiquetas: 3, creado_en: "x", vendida_en: "y", venta_id: "v1",
    });
    expect(p).toMatchObject({ estado: "vendida", precio: 20, precioInicial: 35, etiquetas: 3, familia: null, codigo: null, ventaId: "v1" });
  });
  it("distingue una pieza de otra sede y un código que no existe", () => {
    expect(piezaLeidaDeJson(null)).toBeNull();
    expect(piezaLeidaDeJson({ otra_sede: true, codigo_leido: "LQ7K3M9P", ubicacion: "Tienda Lima" })).toEqual({
      tipo: "otra_sede", codigoLeido: "LQ7K3M9P", ubicacion: "Tienda Lima",
    });
    const leida = piezaLeidaDeJson({ id: "p1", estado: "disponible", precio: 30, codigo_leido: "LQ22222222", vigente: false });
    expect(leida?.tipo === "pieza" && leida.vigente).toBe(false);
  });
});

describe("las cifras", () => {
  const piezas = [
    pieza({ id: "a", precio: 30 }),
    pieza({ id: "b", precio: 20, etiquetas: 2 }),
    pieza({ id: "c", estado: "vendida", precio: 15, vendidaEn: "2026-10-05T20:00:00Z" }),
    // Vendida el 1 de octubre a las 3 a. m. UTC = 30 de setiembre en Lima: es del mes anterior.
    pieza({ id: "d", estado: "vendida", precio: 40, vendidaEn: "2026-10-01T03:00:00Z" }),
    pieza({ id: "e", estado: "retirada", retiradaEn: "2026-10-02T15:00:00Z" }),
  ];
  it("cuenta lo que está a la venta y lo cobrado en el mes de Lima", () => {
    expect(cifrasDe(piezas, "2026-10-10")).toEqual({ disponibles: 2, valorDisponible: 50, vendidasMes: 1, cobradoMes: 15, rebajadas: 1 });
  });
  it("filtra por estado", () => {
    expect(filtrar(piezas, "disponibles").map((p) => p.id)).toEqual(["a", "b"]);
    expect(filtrar(piezas, "vendidas").map((p) => p.id)).toEqual(["c", "d"]);
    expect(filtrar(piezas, "retiradas").map((p) => p.id)).toEqual(["e"]);
  });
  it("las fechas son de Lima", () => {
    expect(fechaLima("2026-10-01T03:00:00Z")).toBe("2026-09-30");
    expect(diasALaVenta(pieza({ creadoEn: "2026-10-01T15:00:00Z" }), "2026-10-10")).toBe(9);
    expect([0, 1, 9].map(tiempoALaVenta)).toEqual(["desde hoy", "1 día", "9 días"]);
  });
});

describe("la línea en la venta", () => {
  it("dice que es de liquidación y su categoría", () => {
    expect(nombreEnVenta("Blusas")).toBe("Liquidación · Blusas");
    expect(nombreEnVenta(" ")).toBe("Liquidación");
  });
});

describe("los errores", () => {
  it("traduce cada marca de la base y conserva el detalle", () => {
    expect(errorDeLiquidacion("liquidacion_etiqueta_vieja Esa etiqueta ya no vale: la pieza cuesta ahora S/ 20.00")).toEqual({
      titulo: "Esa etiqueta ya no vale",
      detalle: "Esa etiqueta ya no vale: la pieza cuesta ahora S/ 20.00",
      releer: true,
    });
    expect(errorDeLiquidacion("liquidacion_bajo_minimo x")?.titulo).toBe("Ese precio necesita un líder");
    expect(errorDeLiquidacion("liquidacion_sin_cambios")).toEqual({ titulo: "Ese ya es su precio" });
    expect(errorDeLiquidacion("otra cosa")).toBeNull();
  });
});
