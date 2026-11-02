import { describe, it, expect } from "vitest";
import {
  alertaDeStock,
  mensajeSinResultados,
  leerExistenciasProductos,
  lineasDeStock,
  hrefEnExistencias,
  SIN_EXISTENCIAS,
  stockDeTarjeta,
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

describe("mensajeSinResultados — la lista abre con las activas", () => {
  it("si lo buscado está descontinuado, lo dice en vez de dejar creer que no existe", () => {
    expect(mensajeSinResultados({ estado: "activo" }, { descontinuadas: 1 })).toContain("hay 1 descontinuada que sí");
    expect(mensajeSinResultados({ estado: "activo" }, { descontinuadas: 3 })).toContain("hay 3 descontinuadas que sí");
    expect(mensajeSinResultados({ estado: "activo" }, { descontinuadas: 0 })).toBe(MENSAJE_SIN_RESULTADOS);
    expect(mensajeSinResultados({ estado: "activo" })).toBe(MENSAJE_SIN_RESULTADOS);
  });
});

describe("mensajeSinResultados — «Hay en [sede]» sí trae descontinuadas", () => {
  it("con «Hay en …» el vacío es el de siempre, no culpa a la Disponibilidad", () => {
    expect(mensajeSinResultados({ estado: "descontinuado", stock: "en_sede" })).toBe(MENSAJE_SIN_RESULTADOS);
    expect(mensajeSinResultados({ estado: "descontinuado", stock: "sin_red" })).toContain("filtro de Disponibilidad");
  });
});

describe("stockDeTarjeta — la tarjeta «A · Catálogo de moda» (Felipe 2026-11-02)", () => {
  const prenda = (stockTotal: number, stockMinimo: number | null = null, estado = "activo", marca: string | null = "CAYLA", proveedor: string | null = "Taller Lima") => ({
    estado,
    stockTotal,
    stockMinimo,
    marca,
    proveedor,
  });
  const sinLeer = { existencias: null, enSede: null, sede: "Tienda Trujillo" } as const;

  it("lo de siempre es tenue: «34 en stock»", () => {
    expect(stockDeTarjeta(prenda(34, 10), sinLeer)).toMatchObject({ texto: "34 en stock", tono: "tenue" });
  });
  it("solo pesa si es poco: bajo su mínimo, «Quedan 8» en ámbar", () => {
    expect(stockDeTarjeta(prenda(8, 10), sinLeer)).toMatchObject({ texto: "Quedan 8", tono: "poco" });
  });
  it("o si no hay: «Sin stock» en rojo", () => {
    expect(stockDeTarjeta(prenda(0, 10), sinLeer)).toMatchObject({ texto: "Sin stock", tono: "cero" });
  });
  it("una descontinuada no alerta: su cero es un hecho, tenue", () => {
    expect(stockDeTarjeta(prenda(0, 10, "descontinuado"), sinLeer)).toMatchObject({ texto: "0 en stock", tono: "tenue" });
    expect(stockDeTarjeta(prenda(3, 10, "descontinuado"), sinLeer)).toMatchObject({ texto: "3 en stock", tono: "tenue" });
  });
  it("los miles con coma", () => {
    expect(stockDeTarjeta(prenda(1250), sinLeer).texto).toBe("1,250 en stock");
  });
  it("el title: marca · proveedor primero y lo de la sede después, una cosa por renglón", () => {
    const { titulo } = stockDeTarjeta(prenda(60), {
      existencias: { ...SIN_EXISTENCIAS, aqui: 0, apartadoAqui: 1, enOtrasTiendas: 60, otras: [{ ubicacionId: "lim", sede: "Tienda LIM", disponible: 60 }] },
      enSede: 3,
      sede: "Tienda Trujillo",
    });
    expect(titulo.split("\n").slice(0, 3)).toEqual(["CAYLA · Taller Lima", "0 para vender en Trujillo", "+60 en LIM · 1 apartada"]);
  });
  it("lo que falta de marca o proveedor se dice con palabras (ADR-0283)", () => {
    const primero = (marca: string | null, proveedor: string | null) => stockDeTarjeta(prenda(5, null, "activo", marca, proveedor), sinLeer).titulo.split("\n")[0];
    expect(primero(null, "Taller Lima")).toBe("Sin marca · Taller Lima");
    expect(primero("CAYLA", null)).toBe("CAYLA · Sin proveedor");
    expect(primero(null, null)).toBe("Sin marca ni proveedor");
  });
  it("sin la cifra de la sede, el respaldo de useStockEnSede; si falló, lo dice; mientras lee, nada", () => {
    expect(stockDeTarjeta(prenda(5), { existencias: null, enSede: 3, sede: "Tienda Trujillo" }).titulo).toContain("3 en Trujillo");
    expect(stockDeTarjeta(prenda(5), { existencias: null, enSede: "error", sede: "" }).titulo).toContain("No se pudo leer lo de tu sede");
    expect(stockDeTarjeta(prenda(5), sinLeer).titulo.split("\n")).toHaveLength(2);
  });
});
