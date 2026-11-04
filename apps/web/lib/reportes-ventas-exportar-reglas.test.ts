import { describe, expect, it } from "vitest";
import { csvDeRanking, csvDeVentasDelMes, nombreArchivoRanking, nombreArchivoVentasDelMes, type RankingCompleto } from "./reportes-ventas-exportar-reglas";
import { leerCortesMes, leerReporteMes } from "./reportes-ventas-reglas";

const sinBom = (csv: string) => csv.replace(/^﻿/, "");
const lineas = (csv: string) => sinBom(csv).trimEnd().split("\r\n");

const MES = leerReporteMes({
  mes: "2026-10-01",
  hoy: "2026-11-02",
  en_curso: false,
  primera_venta: "2026-08-20",
  actual: { desde: "2026-10-01", hasta: "2026-11-01", vendido: 1000, tickets: 10, unidades: 25, devuelto: 30 },
  anterior: { desde: "2026-09-01", hasta: "2026-10-01", vendido: 800, tickets: 8, unidades: 20, devuelto: 0 },
})!;
const c = (v: number, t: number, u: number, d = 0) => ({ vendido: v, tickets: t, unidades: u, devuelto: d });
const CORTES = leerCortesMes({
  mes: "2026-10-01",
  hoy: "2026-11-02",
  tiendas: [
    { id: "t1", nombre: "Tienda Trujillo", actual: c(700, 7, 18, 30), anterior: c(400, 4, 10) },
    { id: "t2", nombre: "Tienda Lima", actual: c(300, 3, 7), anterior: c(0, 0, 0) },
  ],
  categorias: [
    { id: null, nombre: "Sin categoría", actual: { vendido: 500, unidades: 10 }, anterior: { vendido: 100, unidades: 2 } },
    { id: "a", nombre: "Blusas, camisas \"x\"", actual: { vendido: 300, unidades: 9 }, anterior: { vendido: 300, unidades: 9 } },
    { id: "b", nombre: "=Polos", actual: { vendido: 200, unidades: 6 }, anterior: { vendido: 400, unidades: 9 } },
  ],
})!;

describe("csvDeVentasDelMes", () => {
  it("empieza con BOM (Excel lee bien las tildes) y termina con salto de línea", () => {
    const csv = csvDeVentasDelMes(MES, CORTES, "tienda");
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("por tienda: la cabecera, cada tienda con su parte y su cambio, y el Total de las cifras al pie", () => {
    const l = lineas(csvDeVentasDelMes(MES, CORTES, "tienda"));
    expect(l[0]).toBe("Tienda,Vendido (S/),% del total,Cambio vs mes pasado (%),Ventas,Ticket promedio (S/),Prendas,Devuelto (S/)");
    expect(l[1]).toBe("Tienda Trujillo,700.00,70.0,75.0,7,100.00,18,30.00");
    expect(l[2]).toBe("Tienda Lima,300.00,30.0,,3,100.00,7,0.00"); // no vendió antes: el cambio va vacío, no 0
    expect(l[3]).toBe("Total,1000.00,100.0,25.0,10,100.00,25,30.00");
    expect(l).toHaveLength(4);
  });

  it("por categoría: todas (sin juntar la cola), «Sin categoría» al final, y las celdas con coma, comillas o = van protegidas", () => {
    const l = lineas(csvDeVentasDelMes(MES, CORTES, "categoria"));
    expect(l[0]).toBe("Categoría,Vendido (S/),% del total,Cambio vs mes pasado (%),Prendas");
    expect(l[1]).toBe('"Blusas, camisas ""x""",300.00,30.0,0.0,9');
    expect(l[2]).toBe("'=Polos,200.00,20.0,-50.0,6");
    expect(l[3]).toBe("Sin categoría,500.00,50.0,400.0,10");
    expect(l[4]).toBe("Total,1000.00,100.0,25.0,25");
  });

  it("si el mes anterior quedó a medias, ninguna fila trae cambio", () => {
    const amedias = { ...MES, primeraVenta: "2026-09-30" };
    const l = lineas(csvDeVentasDelMes(amedias, CORTES, "tienda"));
    expect(l.slice(1).map((x) => x.split(",")[3])).toEqual(["", "", ""]);
  });

  it("un cambio negativo sigue siendo un número (sin apóstrofo, que Excel lo leería como texto), pero lo que parece fórmula sí se protege", () => {
    const l = lineas(csvDeVentasDelMes(MES, CORTES, "categoria"));
    expect(l[2]!.split(",")[3]).toBe("-50.0");
    expect(l[2]!.startsWith("'=Polos")).toBe(true);
  });

  it("el archivo no lleva costo ni margen", () => {
    expect(csvDeVentasDelMes(MES, CORTES, "tienda").toLowerCase()).not.toMatch(/costo|margen/);
  });
});

describe("nombres de archivo", () => {
  it("se reconocen sin abrirlos: mes, corte y alcance, sin tildes ni espacios", () => {
    expect(nombreArchivoVentasDelMes("2026-10-01", "categoria", "Tienda Trujillo")).toBe("ventas-2026-10-por-categoria-trujillo.csv");
    expect(nombreArchivoVentasDelMes("2026-10-01", "tienda", "Todas las tiendas")).toBe("ventas-2026-10-por-tienda-todas-las-tiendas.csv");
    expect(nombreArchivoVentasDelMes("2026-10-01", "tienda", "")).toBe("ventas-2026-10-por-tienda-todas.csv");
    expect(nombreArchivoRanking({ desde: "2026-10-01", hasta: "2026-11-01" }, { nivel: "modelo" }, "Arequipa")).toBe("ranking-prendas-2026-10-01-a-2026-10-31-arequipa.csv");
    expect(nombreArchivoRanking({ desde: "2026-10-01", hasta: "2026-11-01" }, { nivel: "variante" }, "")).toBe("ranking-prendas-por-color-y-talla-2026-10-01-a-2026-10-31-todas.csv");
  });
});

const fila = (pos: number, nombre: string, unidades: number, vendido: number, ant: [number, number], extra: object = {}) => ({
  pos, productoId: `p${pos}`, nombre, codigo: `COD-${pos}`, categoria: "Faldas", categoriaPrefijo: "FAL", categoriaFamilia: "indumentaria", marca: "Aluna",
  colorNombre: "Vino", colorHex: "#7a2e2a", talla: "M", unidades, vendido, unidadesAnt: ant[0], vendidoAnt: ant[1], stock: 7, ...extra,
});
const RANKING: RankingCompleto = {
  filas: [fila(1, "Falda Inti", 5, 250, [2, 100]), fila(2, "Blusa, Emma", 4, 180, [0, 0]), fila(3, "+Top", 1, 300, [1, 300])],
  totalPeriodo: { unidades: 100, vendido: 5000 },
  primeraVenta: "2026-08-20",
  anterior: { desde: "2026-09-01", hasta: "2026-10-01" },
  mayor: { unidades: 5, vendido: 300 },
};

describe("csvDeRanking", () => {
  it("por modelo: sin color ni talla, con la parte, el período anterior y el cambio de lo que se ordena", () => {
    const l = lineas(csvDeRanking(RANKING, "modelo", "unidades"));
    expect(l[0]).toBe("Posición,Modelo,Código,Categoría,Marca,Prendas,Vendido (S/),% del total,Prendas del período anterior,Vendido del período anterior (S/),Cambio vs período anterior (%),Quedan en tiendas");
    expect(l[1]).toBe("1,Falda Inti,COD-1,Faldas,Aluna,5,250.00,5.0,2,100.00,150.0,7");
    expect(l[2]).toBe('2,"Blusa, Emma",COD-2,Faldas,Aluna,4,180.00,4.0,0,0.00,,7'); // sin ventas antes: el cambio va vacío
    expect(l[3]).toBe("3,'+Top,COD-3,Faldas,Aluna,1,300.00,1.0,1,300.00,0.0,7");
  });

  it("ordenado por soles, la parte y el cambio son de los soles", () => {
    const l = lineas(csvDeRanking(RANKING, "modelo", "soles"));
    expect(l[1]!.split(",")[7]).toBe("5.0"); // 250 de 5.000
    expect(l[1]!.split(",")[10]).toBe("150.0"); // 250 contra 100
    expect(l[3]!.split(",")[10]).toBe("0.0"); // 300 contra 300
  });

  it("por color y talla trae las dos columnas más", () => {
    const l = lineas(csvDeRanking(RANKING, "variante", "unidades"));
    expect(l[0]).toContain("Marca,Color,Talla,Prendas");
    expect(l[1]).toBe("1,Falda Inti,COD-1,Faldas,Aluna,Vino,M,5,250.00,5.0,2,100.00,150.0,7");
  });

  it("si no se puede comparar, el período anterior y el cambio van vacíos (no ceros)", () => {
    const l = lineas(csvDeRanking({ ...RANKING, primeraVenta: "2026-09-30" }, "modelo", "unidades"));
    expect(l[1]).toBe("1,Falda Inti,COD-1,Faldas,Aluna,5,250.00,5.0,,,,7");
  });

  it("sin filas es solo la cabecera, y los datos que faltan (código, marca) van vacíos", () => {
    expect(lineas(csvDeRanking({ ...RANKING, filas: [] }, "modelo", "unidades"))).toHaveLength(1);
    const l = lineas(csvDeRanking({ ...RANKING, filas: [fila(1, "X", 1, 10, [0, 0], { codigo: null, marca: null, categoria: null })] }, "modelo", "unidades"));
    expect(l[1]!.startsWith("1,X,,,,")).toBe(true);
  });

  it("no lleva costo ni margen", () => {
    expect(csvDeRanking(RANKING, "variante", "soles").toLowerCase()).not.toMatch(/costo|margen/);
  });
});
