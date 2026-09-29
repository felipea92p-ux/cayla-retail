import { describe, it, expect } from "vitest";
import {
  alertaDeStock,
  textoDeStock,
  mensajeSinResultados,
  leerExistenciasProductos,
  lineasDeStock,
  hrefEnExistencias,
  SIN_EXISTENCIAS,
  ROTULO_STOCK_TOTAL,
  MENSAJE_SIN_RESULTADOS,
} from "./productos-stock";

const activo = (stockTotal: number, stockMinimo: number | null = null) => ({ estado: "activo", stockTotal, stockMinimo });
const descontinuado = (stockTotal: number, stockMinimo: number | null = null) => ({ estado: "descontinuado", stockTotal, stockMinimo });

describe("alertaDeStock — solo las prendas activas piden atención", () => {
  it("activa sin unidades en toda la red: sin stock", () => {
    expect(alertaDeStock(activo(0))).toBe("sin_stock");
  });

  it("descontinuada sin unidades: NO es alerta (no hay nada que reponer de lo que ya no se vende)", () => {
    expect(alertaDeStock(descontinuado(0))).toBeNull();
  });

  it("descontinuada por debajo de su mínimo: tampoco es «stock bajo»", () => {
    expect(alertaDeStock(descontinuado(1, 5))).toBeNull();
  });

  it("activa con menos que su mínimo: bajo", () => {
    expect(alertaDeStock(activo(2, 5))).toBe("bajo");
  });

  it("activa justo en su mínimo: sin alerta (bajo es ESTRICTAMENTE menos que el mínimo)", () => {
    expect(alertaDeStock(activo(5, 5))).toBeNull();
  });

  it("activa en 0 con mínimo: sin stock gana a bajo (excluyentes, igual que en la base)", () => {
    expect(alertaDeStock(activo(0, 5))).toBe("sin_stock");
  });

  it("activa sin mínimo cargado y con stock: sin alerta (38 de 39 productos activos hoy)", () => {
    expect(alertaDeStock(activo(3, null))).toBeNull();
  });

  it("mínimo 0: nada queda «por debajo» de 0, así que solo el 0 de stock avisa (como sin stock)", () => {
    expect(alertaDeStock(activo(3, 0))).toBeNull();
    expect(alertaDeStock(activo(0, 0))).toBe("sin_stock");
  });

  it("estado que no es exactamente «activo»: sin alerta (la base solo admite activo o descontinuado)", () => {
    expect(alertaDeStock({ estado: "Activo", stockTotal: 0, stockMinimo: null })).toBeNull();
    expect(alertaDeStock({ estado: "", stockTotal: 0, stockMinimo: 5 })).toBeNull();
  });

  it("stock negativo (la base lo impide con un CHECK): con mínimo se lee como «bajo», sin él no avisa", () => {
    expect(alertaDeStock(activo(-1, 5))).toBe("bajo");
    expect(alertaDeStock(activo(-1, null))).toBeNull();
  });
});

describe("textoDeStock — el rótulo dice de qué stock se habla", () => {
  it("con unidades: «Stock total N», no «Stock N» (no es el de la sede activa)", () => {
    expect(textoDeStock(26)).toBe("Stock total 26");
    expect(textoDeStock(26)).toContain(ROTULO_STOCK_TOTAL);
  });

  it("en cero: «Stock total 0» — la alerta «Sin stock» es del chip, no de este texto", () => {
    expect(textoDeStock(0)).toBe("Stock total 0");
  });
});

describe("mensajeSinResultados — un vacío que se explica cuando la combinación no puede devolver nada", () => {
  it("descontinuadas + cualquier alerta de stock: dice por qué está vacío", () => {
    for (const stock of ["sin_stock", "bajo", "reponer"]) {
      expect(mensajeSinResultados({ estado: "descontinuado", stock })).toContain("descontinuadas no cuentan");
    }
  });

  it("descontinuadas sin filtro de stock, o activas con alerta: el vacío de siempre", () => {
    expect(mensajeSinResultados({ estado: "descontinuado" })).toBe(MENSAJE_SIN_RESULTADOS);
    expect(mensajeSinResultados({ estado: "activo", stock: "sin_stock" })).toBe(MENSAJE_SIN_RESULTADOS);
    expect(mensajeSinResultados({})).toBe(MENSAJE_SIN_RESULTADOS);
  });
});

describe("leerExistenciasProductos — lo que devuelve fn_existencias_productos (ADR-0270)", () => {
  it("lee cada producto con los nombres de la base; los enteros pueden venir como texto", () => {
    const m = leerExistenciasProductos([
      {
        producto_id: "p1",
        aqui: 7,
        apartado_aqui: "1",
        danado_aqui: 2,
        en_camino_aqui: 0,
        en_otras_tiendas: 60,
        en_taller: 0,
        otras: [{ ubicacion_id: "lim", sede: "Tienda LIM", disponible: 60 }],
        en_tallas_retiradas: 0,
      },
    ]);
    expect(m.get("p1")).toEqual({
      aqui: 7,
      apartadoAqui: 1,
      danadoAqui: 2,
      enCaminoAqui: 0,
      enOtrasTiendas: 60,
      otras: [{ ubicacionId: "lim", sede: "Tienda LIM", disponible: 60 }],
      enTaller: 0,
      enTallasRetiradas: 0,
    });
  });

  it("tolera lo raro: sin arreglo es un mapa vacío; una fila sin producto se salta; una sede en 0 no se nombra", () => {
    expect(leerExistenciasProductos(null).size).toBe(0);
    expect(leerExistenciasProductos({ producto_id: "p1" }).size).toBe(0);
    const m = leerExistenciasProductos([{ aqui: 3 }, { producto_id: "p2", otras: [{ sede: "Tienda AQP", disponible: 0 }, null] }]);
    expect(m.size).toBe(1);
    expect(m.get("p2")).toEqual(SIN_EXISTENCIAS);
  });
});

describe("lineasDeStock — la tarjeta dice la sede elegida y aparte el resto (ADR-0270, decisiones 1 a 5)", () => {
  it("el caso de Felipe: 0 aquí en TRU, 60 en LIM — la tarjeta no dice «Sin stock», dice dónde hay", () => {
    expect(lineasDeStock({ ...SIN_EXISTENCIAS, enOtrasTiendas: 60, otras: [{ ubicacionId: "lim", sede: "Tienda LIM", disponible: 60 }] })).toEqual({
      principal: "0 aquí",
      detalle: "+60 en LIM",
      avisos: [],
    });
  });

  it("Taller y en camino van aparte, cada uno con su palabra", () => {
    expect(lineasDeStock({ ...SIN_EXISTENCIAS, aqui: 3, enTaller: 40, enCaminoAqui: 6 }).detalle).toBe("40 en taller · +6 en camino");
  });

  it("apartadas, dañadas y tallas retiradas son avisos, no suman a «aquí»; singular y plural", () => {
    expect(lineasDeStock({ ...SIN_EXISTENCIAS, aqui: 77, apartadoAqui: 1, danadoAqui: 2, enTallasRetiradas: 6 })).toEqual({
      principal: "77 aquí",
      detalle: null,
      avisos: ["1 apartada", "2 dañadas", "6 en tallas retiradas"],
    });
    expect(lineasDeStock({ ...SIN_EXISTENCIAS, apartadoAqui: 3, danadoAqui: 1 }).avisos).toEqual(["3 apartadas", "1 dañada"]);
  });

  it("dos otras sedes se nombran de más a menos; tres o más se agrupan para que quepa en un teléfono", () => {
    const dos = [
      { ubicacionId: "a", sede: "Tienda AQP", disponible: 2 },
      { ubicacionId: "l", sede: "Tienda LIM", disponible: 9 },
    ];
    expect(lineasDeStock({ ...SIN_EXISTENCIAS, enOtrasTiendas: 11, otras: dos }).detalle).toBe("+9 en LIM · +2 en AQP");
    const tres = [...dos, { ubicacionId: "t", sede: "Tienda TRU", disponible: 1 }];
    expect(lineasDeStock({ ...SIN_EXISTENCIAS, enOtrasTiendas: 12, otras: tres }).detalle).toBe("+12 en 3 sedes más");
  });

  it("nada fuera de la sede: sin línea de detalle", () => {
    expect(lineasDeStock({ ...SIN_EXISTENCIAS, aqui: 5 }).detalle).toBeNull();
  });
});

describe("hrefEnExistencias — el Catálogo enlaza a donde se ajusta (ADR-0270, decisión 9)", () => {
  const vs = [
    { varianteId: "a", activo: false, color: "Rojo" },
    { varianteId: "b", activo: true, color: "Rojo" },
    { varianteId: "c", activo: true, color: "Azul" },
  ];
  it("la primera talla activa del color que se mira", () => {
    expect(hrefEnExistencias(vs, "Azul")).toBe("/inventario?variante=c");
    expect(hrefEnExistencias(vs, "Rojo")).toBe("/inventario?variante=b");
  });
  it("sin color (o uno sin tallas activas): la primera activa; sin ninguna activa, la primera; sin tallas, Existencias a secas", () => {
    expect(hrefEnExistencias(vs)).toBe("/inventario?variante=b");
    expect(hrefEnExistencias([{ varianteId: "z", activo: false, color: null }])).toBe("/inventario?variante=z");
    expect(hrefEnExistencias([])).toBe("/inventario");
  });
});
