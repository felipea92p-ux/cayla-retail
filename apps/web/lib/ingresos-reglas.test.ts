import { describe, expect, it } from "vitest";
import {
  MAXIMO_DIAS_INGRESOS,
  ORDEN_INICIAL_INGRESOS,
  buscarModelosIngresos,
  conPreposicion,
  costoDelModelo,
  cuentaNovedad,
  diaLargo,
  esFechaIso,
  filtrarPorNovedad,
  hrefIngresos,
  leerResumenIngresos,
  matrizDeVariantes,
  modelosTexto,
  ordenarModelosIngresos,
  precioDelModelo,
  prendasTexto,
  rangoIngresos,
  rangoSolesTexto,
  siguienteOrdenIngresos,
  solesTexto,
} from "./ingresos-reglas";

const HOY = "2026-10-29";

describe("rangoIngresos", () => {
  it("por defecto son los últimos 7 días, contando hoy", () => {
    expect(rangoIngresos({}, HOY)).toEqual({ periodo: "7", desde: "2026-10-23", hasta: HOY, texto: "los últimos 7 días" });
  });

  it("30 y 90 días; cualquier otro valor cae en 7", () => {
    expect(rangoIngresos({ p: "30" }, HOY)).toMatchObject({ periodo: "30", desde: "2026-09-30", hasta: HOY });
    expect(rangoIngresos({ p: "90" }, HOY)).toMatchObject({ periodo: "90", desde: "2026-08-01", hasta: HOY });
    expect(rangoIngresos({ p: "1000" }, HOY)).toMatchObject({ periodo: "7" });
    expect(rangoIngresos({ p: "'; drop" }, HOY)).toMatchObject({ periodo: "7" });
  });

  it("«desde el día que llegó el fardo hasta hoy»: con solo `desde`, el hasta es hoy", () => {
    const r = rangoIngresos({ desde: "2026-10-20" }, HOY);
    expect(r).toEqual({ periodo: "fechas", desde: "2026-10-20", hasta: HOY, texto: "del 20 de octubre al 29 de octubre" });
  });

  it("un solo día se dice «el …»", () => {
    expect(rangoIngresos({ desde: "2026-10-20", hasta: "2026-10-20" }, HOY).texto).toBe("el 20 de octubre");
  });

  it("nunca pasa de hoy ni se invierte", () => {
    expect(rangoIngresos({ desde: "2026-10-20", hasta: "2026-12-31" }, HOY)).toMatchObject({ desde: "2026-10-20", hasta: HOY });
    // Un desde en el futuro se queda en el hasta: un rango de un día, no uno al revés.
    expect(rangoIngresos({ desde: "2026-12-01" }, HOY)).toMatchObject({ desde: HOY, hasta: HOY });
    expect(rangoIngresos({ desde: "2026-10-25", hasta: "2026-10-20" }, HOY)).toMatchObject({ desde: "2026-10-20", hasta: "2026-10-20" });
  });

  it("recorta lo que pasa del tope de la base (400 días), no lo rechaza", () => {
    const r = rangoIngresos({ desde: "2020-01-01" }, HOY);
    expect(r.hasta).toBe(HOY);
    expect(r.desde).toBe("2025-09-24");
    // 400 días antes de hoy son 401 días contando ambos extremos; la base acepta p_hasta - p_desde <= 400.
    const dias = (Date.parse(r.hasta) - Date.parse(r.desde)) / 86_400_000;
    expect(dias).toBeLessThanOrEqual(MAXIMO_DIAS_INGRESOS);
  });

  it("una fecha que no existe se ignora y vuelve al período de fábrica", () => {
    expect(rangoIngresos({ desde: "2026-02-31" }, HOY)).toMatchObject({ periodo: "7" });
    expect(rangoIngresos({ desde: "ayer" }, HOY)).toMatchObject({ periodo: "7" });
  });
});

describe("esFechaIso y diaLargo", () => {
  it("solo acepta días que existen", () => {
    expect(esFechaIso("2028-02-29")).toBe(true);
    expect(esFechaIso("2026-02-29")).toBe(false);
    expect(esFechaIso("2026-2-1")).toBe(false);
    expect(esFechaIso(undefined)).toBe(false);
  });

  it("agrega el año solo si no es el de hoy", () => {
    expect(diaLargo("2026-03-10", HOY)).toBe("10 de marzo");
    expect(diaLargo("2025-12-31", HOY)).toBe("31 de diciembre de 2025");
  });
});

describe("hrefIngresos", () => {
  it("el período de fábrica no va en la URL", () => {
    expect(hrefIngresos()).toBe("/inventario/movimientos?vista=ingresos");
    expect(hrefIngresos({ periodo: "7" })).toBe("/inventario/movimientos?vista=ingresos");
    expect(hrefIngresos({ periodo: "30" })).toBe("/inventario/movimientos?vista=ingresos&p=30");
  });

  it("un rango a medida lleva sus fechas y no el período", () => {
    expect(hrefIngresos({ periodo: "30", desde: "2026-10-20", hasta: "2026-10-25" })).toBe("/inventario/movimientos?vista=ingresos&desde=2026-10-20&hasta=2026-10-25");
    expect(hrefIngresos({ desde: "2026-10-20" })).toBe("/inventario/movimientos?vista=ingresos&desde=2026-10-20");
  });

  it("una fecha inválida no entra a la URL", () => {
    expect(hrefIngresos({ desde: "mañana", hasta: "2026-10-25" })).toBe("/inventario/movimientos?vista=ingresos");
  });
});

describe("leerResumenIngresos", () => {
  const bueno = {
    desde: "2026-10-23",
    hasta: "2026-10-29",
    ve_costo: true,
    modelos: [
      {
        producto_id: "p1",
        referencia: "Blusa Emma",
        codigo: "BLU-0042",
        categoria: "Blusas",
        unidades: 24,
        de_stock_inicial: 15,
        de_recepcion: 9,
        primer_dia: "2026-10-24",
        ultimo_dia: "2026-10-26",
        variantes: [
          { variante_id: "v1a", color: "Negro", color_hex: "#111111", talla: "M", unidades: 19 },
          { variante_id: "v1b", color: "Negro", color_hex: "#111111", talla: "S", unidades: 5 },
        ],
        es_nuevo: false,
        precio_min: 50,
        precio_max: 70,
        costo_min: 20,
        costo_max: 30,
      },
      {
        producto_id: "p2",
        referencia: "Casaca Lola",
        codigo: null,
        categoria: null,
        unidades: 4,
        de_stock_inicial: 0,
        de_recepcion: 4,
        primer_dia: "2026-10-25",
        ultimo_dia: "2026-10-25",
        es_nuevo: true,
        precio_min: 40,
        precio_max: 40,
        costo_min: null,
        costo_max: null,
      },
    ],
    totales: { modelos: 2, unidades: 28, de_stock_inicial: 15, de_recepcion: 13, nuevos: 1 },
  };

  it("lee la respuesta de la base", () => {
    const r = leerResumenIngresos(bueno);
    expect(r?.totales).toEqual({ modelos: 2, unidades: 28, deStockInicial: 15, deRecepcion: 13, nuevos: 1 });
    expect(r?.veCosto).toBe(true);
    expect(r?.modelos[0]).toEqual({
      productoId: "p1",
      referencia: "Blusa Emma",
      codigo: "BLU-0042",
      categoria: "Blusas",
      unidades: 24,
      deStockInicial: 15,
      deRecepcion: 9,
      primerDia: "2026-10-24",
      ultimoDia: "2026-10-26",
      variantes: [
        { varianteId: "v1a", color: "Negro", colorHex: "#111111", talla: "M", unidades: 19 },
        { varianteId: "v1b", color: "Negro", colorHex: "#111111", talla: "S", unidades: 5 },
      ],
      esNuevo: false,
      precioMin: 50,
      precioMax: 70,
      costoMin: 20,
      costoMax: 30,
    });
    expect(r?.modelos[1]).toMatchObject({ codigo: null, categoria: null, esNuevo: true, costoMin: null, costoMax: null });
  });

  it("una respuesta que no tiene la forma es `null`, nunca un 0", () => {
    expect(leerResumenIngresos(null)).toBeNull();
    expect(leerResumenIngresos("hola")).toBeNull();
    expect(leerResumenIngresos({})).toBeNull();
    expect(leerResumenIngresos({ ...bueno, modelos: "x" })).toBeNull();
    expect(leerResumenIngresos({ ...bueno, totales: undefined })).toBeNull();
    expect(leerResumenIngresos({ ...bueno, desde: undefined })).toBeNull();
  });

  it("un modelo sin id o sin nombre se descarta; los demás se leen", () => {
    const r = leerResumenIngresos({ ...bueno, modelos: [{ unidades: 3 }, { producto_id: "p9", referencia: "  " }, bueno.modelos[0], 7, null] });
    expect(r?.modelos.map((m) => m.productoId)).toEqual(["p1"]);
  });

  it("una cantidad que viene como texto numérico se lee como número", () => {
    const r = leerResumenIngresos({ ...bueno, modelos: [{ ...bueno.modelos[0], unidades: "24" }] });
    expect(r?.modelos[0].unidades).toBe(24);
  });
});

describe("precio, costo y novedad", () => {
  it("un monto redondo no lleva decimales y uno con centavos sí (formato de Perú: punto decimal); el espacio no se corta", () => {
    expect(solesTexto(59)).toBe("S/\u00a059");
    expect(solesTexto(59.9)).toBe("S/\u00a059.90");
    expect(solesTexto(1234.5)).toBe("S/\u00a01,234.50");
  });

  it("un solo valor o un rango por tallas; sin monto no inventa uno", () => {
    expect(rangoSolesTexto(40, 40)).toBe("S/\u00a040");
    expect(rangoSolesTexto(50, 70)).toBe("S/\u00a050 – 70");
    expect(rangoSolesTexto(null, null)).toBeNull();
    expect(rangoSolesTexto(50, null)).toBeNull();
  });

  it("el precio sin dato es un guion; el costo sin dato es «Sin costo», nunca S/ 0", () => {
    expect(precioDelModelo({ precioMin: null, precioMax: null })).toBe("—");
    expect(precioDelModelo({ precioMin: 59, precioMax: 59 })).toBe("S/\u00a059");
    expect(costoDelModelo({ costoMin: null, costoMax: null })).toBe("Sin costo");
    expect(costoDelModelo({ costoMin: 20, costoMax: 30 })).toBe("S/\u00a020 – 30");
  });

  it("un monto que falta se lee como `null`, no como 0", () => {
    const r = leerResumenIngresos({
      desde: "2026-10-23",
      hasta: "2026-10-29",
      ve_costo: false,
      modelos: [{ producto_id: "p1", referencia: "Blusa", unidades: 1, precio_min: "59", precio_max: "59", costo_min: null }],
      totales: {},
    });
    expect(r?.veCosto).toBe(false);
    expect(r?.modelos[0]).toMatchObject({ precioMin: 59, precioMax: 59, costoMin: null, costoMax: null, esNuevo: false });
  });

  it("filtra por Nuevo o Reingreso y cuenta cada clase", () => {
    const modelos = [{ esNuevo: true }, { esNuevo: false }, { esNuevo: false }];
    expect(filtrarPorNovedad(modelos, "todos")).toHaveLength(3);
    expect(filtrarPorNovedad(modelos, "nuevo")).toEqual([{ esNuevo: true }]);
    expect(filtrarPorNovedad(modelos, "reingreso")).toHaveLength(2);
    expect(cuentaNovedad(modelos)).toEqual({ nuevos: 1, reingresos: 2, hayDeLasDos: true });
  });

  it("el filtro solo se ofrece si hay de las dos clases", () => {
    expect(cuentaNovedad([{ esNuevo: true }, { esNuevo: true }]).hayDeLasDos).toBe(false);
    expect(cuentaNovedad([{ esNuevo: false }]).hayDeLasDos).toBe(false);
    expect(cuentaNovedad([]).hayDeLasDos).toBe(false);
  });
});

describe("matrizDeVariantes", () => {
  const v = (color: string | null, talla: string | null, unidades: number, colorHex: string | null = null) => ({ color, colorHex, talla, unidades });

  it("un color por fila y una talla por columna, en el orden de la curva, con sus totales", () => {
    const m = matrizDeVariantes([v("Negro", "M", 5), v("Negro", "S", 2), v("Rojo", "S", 3), v("Negro", "L", 1), v("Rojo", "XL", 4)]);
    expect(m.tallas).toEqual(["S", "M", "L", "XL"]);
    expect(m.filas.map((f) => f.color)).toEqual(["Negro", "Rojo"]);
    expect(m.filas[0]).toMatchObject({ total: 8, porTalla: { S: 2, M: 5, L: 1 } });
    expect(m.filas[1]).toMatchObject({ total: 7, porTalla: { S: 3, XL: 4 } });
    expect(m.totalPorTalla).toEqual({ S: 5, M: 5, L: 1, XL: 4 });
    expect(m.total).toBe(15);
  });

  it("la suma de las filas, la de las columnas y el total son la misma cifra", () => {
    const m = matrizDeVariantes([v("Negro", "38", 5), v("Negro", "36", 2), v("Rojo", "40", 3), v(null, "36", 6)]);
    const porFilas = m.filas.reduce((s, f) => s + f.total, 0);
    const porColumnas = Object.values(m.totalPorTalla).reduce((s, n) => s + n, 0);
    expect(porFilas).toBe(m.total);
    expect(porColumnas).toBe(m.total);
    expect(m.tallas).toEqual(["36", "38", "40"]);
  });

  it("el que no tiene color va al final y el que no tiene talla, después de las tallas", () => {
    const m = matrizDeVariantes([v(null, "M", 1), v("Azul", null, 2), v("Beige", "S", 3)]);
    expect(m.filas.map((f) => f.color)).toEqual(["Azul", "Beige", null]);
    expect(m.tallas).toEqual(["S", "M", "Sin talla"]);
  });

  it("dos variantes del mismo color y talla se suman en una celda; dos colores con el mismo nombre y otro hex no se mezclan", () => {
    const m = matrizDeVariantes([v("Rojo", "M", 2, "#aa0000"), v("Rojo", "M", 3, "#aa0000"), v("Rojo", "M", 4, "#ff0000")]);
    expect(m.filas).toHaveLength(2);
    expect(m.filas.find((f) => f.colorHex === "#aa0000")?.porTalla.M).toBe(5);
  });

  it("sin variantes es una matriz vacía, no un error", () => {
    expect(matrizDeVariantes([])).toEqual({ tallas: [], filas: [], totalPorTalla: {}, total: 0 });
  });

  it("lee las variantes de la base y descarta las que no traen id", () => {
    const r = leerResumenIngresos({
      desde: "2026-10-23",
      hasta: "2026-10-29",
      modelos: [{ producto_id: "p1", referencia: "Blusa", variantes: [{ variante_id: "x", color: "Azul", talla: "S", unidades: "2" }, { unidades: 4 }, null] }],
      totales: {},
    });
    expect(r?.modelos[0].variantes).toEqual([{ varianteId: "x", color: "Azul", colorHex: null, talla: "S", unidades: 2 }]);
  });
});

describe("ordenar y buscar", () => {
  const m = (referencia: string, unidades: number, precio: number | null, costo: number | null, codigo: string | null = null, categoria: string | null = null) => ({
    referencia,
    unidades,
    precioMin: precio,
    precioMax: precio,
    costoMin: costo,
    costoMax: costo,
    codigo,
    categoria,
  });
  const lista = [m("Blusa Emma", 24, 59, 20, "CMS-0011", "Camisas y Blusas"), m("Casaca Lola", 4, 120, null, "CSC-0001", "Casacas"), m("Jean Dalia", 30, 90, 40, "JEA-0001", "Jeans")];

  it("al llegar, el de más prendas va primero", () => {
    expect(ordenarModelosIngresos(lista, ORDEN_INICIAL_INGRESOS).map((x) => x.referencia)).toEqual(["Jean Dalia", "Blusa Emma", "Casaca Lola"]);
  });

  it("por nombre de A a Z y al revés; sin tildes de por medio", () => {
    expect(ordenarModelosIngresos(lista, { campo: "modelo", dir: "asc" }).map((x) => x.referencia)).toEqual(["Blusa Emma", "Casaca Lola", "Jean Dalia"]);
    expect(ordenarModelosIngresos(lista, { campo: "modelo", dir: "desc" }).map((x) => x.referencia)).toEqual(["Jean Dalia", "Casaca Lola", "Blusa Emma"]);
  });

  it("un costo sin cargar va siempre al final, ordenes hacia donde ordenes", () => {
    expect(ordenarModelosIngresos(lista, { campo: "costo", dir: "asc" }).map((x) => x.referencia)).toEqual(["Blusa Emma", "Jean Dalia", "Casaca Lola"]);
    expect(ordenarModelosIngresos(lista, { campo: "costo", dir: "desc" }).map((x) => x.referencia)).toEqual(["Jean Dalia", "Blusa Emma", "Casaca Lola"]);
  });

  it("un empate se resuelve por nombre y no cambia el original", () => {
    const empate = [m("Zeta", 5, 10, 1), m("Alfa", 5, 10, 1)];
    expect(ordenarModelosIngresos(empate, { campo: "prendas", dir: "desc" }).map((x) => x.referencia)).toEqual(["Alfa", "Zeta"]);
    expect(empate.map((x) => x.referencia)).toEqual(["Zeta", "Alfa"]);
  });

  it("tocar otra columna empieza donde se espera; tocar la misma, invierte", () => {
    expect(siguienteOrdenIngresos(ORDEN_INICIAL_INGRESOS, "modelo")).toEqual({ campo: "modelo", dir: "asc" });
    expect(siguienteOrdenIngresos(ORDEN_INICIAL_INGRESOS, "precio")).toEqual({ campo: "precio", dir: "desc" });
    expect(siguienteOrdenIngresos({ campo: "precio", dir: "desc" }, "precio")).toEqual({ campo: "precio", dir: "asc" });
  });

  it("busca sin tildes ni mayúsculas en el nombre, el código y la categoría", () => {
    expect(buscarModelosIngresos(lista, "BLUSA").map((x) => x.referencia)).toEqual(["Blusa Emma"]);
    expect(buscarModelosIngresos(lista, "jea-0001").map((x) => x.referencia)).toEqual(["Jean Dalia"]);
    expect(buscarModelosIngresos(lista, "camisas").map((x) => x.referencia)).toEqual(["Blusa Emma"]);
    expect(buscarModelosIngresos([m("Camisa Áurea", 1, 1, 1)], "aurea")).toHaveLength(1);
  });

  it("todas las palabras tienen que estar, en cualquier orden; vacío es todo", () => {
    expect(buscarModelosIngresos(lista, "emma blusa")).toHaveLength(1);
    expect(buscarModelosIngresos(lista, "blusa lola")).toHaveLength(0);
    expect(buscarModelosIngresos(lista, "   ")).toHaveLength(3);
    expect(buscarModelosIngresos(lista, "")).toHaveLength(3);
  });
});

describe("conPreposicion", () => {
  it("cada forma del rango se lee bien detrás de «nada entró»", () => {
    expect(conPreposicion(rangoIngresos({}, HOY).texto)).toBe("en los últimos 7 días");
    expect(conPreposicion(rangoIngresos({ desde: "2026-10-03", hasta: "2026-10-20" }, HOY).texto)).toBe("del 3 de octubre al 20 de octubre");
    expect(conPreposicion(rangoIngresos({ desde: "2026-10-20", hasta: "2026-10-20" }, HOY).texto)).toBe("el 20 de octubre");
  });
});

describe("textos", () => {
  it("singular y plural", () => {
    expect(prendasTexto(1)).toBe("1 prenda");
    expect(prendasTexto(28)).toBe("28 prendas");
    expect(modelosTexto(1)).toBe("1 modelo");
    expect(modelosTexto(2)).toBe("2 modelos");
  });
});
