import { describe, it, expect } from "vitest";
import {
  mesEnCurso,
  mesEnCursoDe,
  recortarVentasDelMes,
  resumenDeStock,
  resumenDeVentas,
  tablaPorCategoria,
  SIN_CATEGORIA,
  type FilaDeStock,
  type VentaDelMes,
} from "./existencias-resumen";

function fila(p: Partial<FilaDeStock> & { varianteId: string; referencia: string }): FilaDeStock {
  const piso = p.pisoDisponible ?? 0;
  const almacen = p.almacenDisponible ?? 0;
  return {
    productoId: p.referencia,
    sku: `SKU-${p.varianteId}`,
    talla: "M",
    color: "Beige",
    colorHex: null,
    fotoUrl: null,
    codigosBarras: [],
    pisoDisponible: piso,
    almacenDisponible: almacen,
    disponible: piso + almacen,
    apartado: 0,
    danado: 0,
    enTransito: 0,
    accionHoy: null,
    marca: null,
    categoria: "Blusas",
    ...p,
  };
}

function venta(p: Partial<VentaDelMes> & { referencia: string; vendidas: number }): VentaDelMes {
  return { color: "Beige", colorHex: null, fotoUrl: null, categoria: "Blusas", ...p };
}

describe("el mes en curso: la ventana de lo vendido arranca el día 1 (Felipe, 2026-10-01)", () => {
  it("va del día 1 a hoy y se nombra en palabras de tienda", () => {
    expect(mesEnCurso("2026-10-15")).toEqual({ desde: "2026-10-01", hasta: "2026-10-15", nombre: "octubre", desdeTexto: "1 de octubre" });
  });

  it("el día 1 de cada mes el contador vuelve a cero: la ventana ya es solo ese día", () => {
    expect(mesEnCurso("2026-11-01")).toMatchObject({ desde: "2026-11-01", hasta: "2026-11-01", nombre: "noviembre" });
    expect(mesEnCurso("2027-01-01")).toMatchObject({ desde: "2027-01-01", nombre: "enero" });
  });

  it("el último día del mes todavía cuenta desde el día 1 de ese mes, no del siguiente", () => {
    expect(mesEnCurso("2026-12-31")).toMatchObject({ desde: "2026-12-01", hasta: "2026-12-31", nombre: "diciembre" });
  });

  it("«hoy» es el de Lima, no el de UTC: a las 10 de la noche del 31 en Lima todavía es el mes que termina", () => {
    expect(mesEnCursoDe(new Date("2026-11-01T03:00:00Z"))).toMatchObject({ desde: "2026-10-01", hasta: "2026-10-31", nombre: "octubre" });
    expect(mesEnCursoDe(new Date("2026-11-01T05:00:00Z"))).toMatchObject({ desde: "2026-11-01", nombre: "noviembre" });
  });

  it("una fecha que no es una fecha no se adivina: se rechaza", () => {
    expect(() => mesEnCurso("octubre")).toThrow();
    expect(() => mesEnCurso("2026-13-01")).toThrow();
  });
});

describe("recortarVentasDelMes: al navegador solo viaja lo que se vendió", () => {
  const base = { referencia: "Blusa Valentina", color: "Blanco", colorHex: "#fff", fotoUrl: null, categoria: "Blusas" };

  it("deja las tallas con ventas netas y descarta las demás", () => {
    expect(
      recortarVentasDelMes([
        { ...base, ventas: 5, devoluciones: 1 },
        { ...base, ventas: 0, devoluciones: 0 },
        { ...base, ventas: 1, devoluciones: 3 }, // más devoluciones que ventas: no cuenta (no baja de cero)
      ]),
    ).toEqual([{ referencia: "Blusa Valentina", color: "Blanco", colorHex: "#fff", fotoUrl: null, categoria: "Blusas", vendidas: 4 }]);
  });
});

describe("resumenDeStock: lo que hay, por categoría, y lo que sigue esperando", () => {
  const stock = [
    fila({ varianteId: "1", referencia: "Blusa A", categoria: "Blusas", pisoDisponible: 2, almacenDisponible: 8 }),
    fila({ varianteId: "2", referencia: "Blusa B", categoria: "Blusas", pisoDisponible: 0, almacenDisponible: 5 }), // espera en el almacén
    fila({ varianteId: "3", referencia: "Pantalón C", categoria: "Pantalones", pisoDisponible: 4, almacenDisponible: 0 }),
    fila({ varianteId: "4", referencia: "Body D", categoria: "Bodys", pisoDisponible: 0, almacenDisponible: 12 }), // espera en el almacén
    fila({ varianteId: "5", referencia: "Polo E", categoria: "Polos", pisoDisponible: 0, almacenDisponible: 0 }), // sin nada: no entra
  ];
  const r = resumenDeStock(stock, { separa: true });

  it("cuenta lo libre del piso, del almacén y el total, sin las prendas que no tienen nada", () => {
    expect([r.total, r.piso, r.almacen]).toEqual([31, 6, 25]);
    expect(r.prendas.map((p) => p.referencia).sort()).toEqual(["Blusa A", "Blusa B", "Body D", "Pantalón C"]);
  });

  it("agrupa por categoría, las de más unidades primero", () => {
    expect(r.porCategoria).toEqual([
      { nombre: "Blusas", piso: 2, almacen: 13, total: 15 },
      { nombre: "Bodys", piso: 0, almacen: 12, total: 12 },
      { nombre: "Pantalones", piso: 4, almacen: 0, total: 4 },
    ]);
  });

  it("«lo que más hay»: las prendas con más unidades, de mayor a menor", () => {
    expect(r.masStock.map((p) => [p.referencia, p.total])).toEqual([["Body D", 12], ["Blusa A", 10], ["Blusa B", 5], ["Pantalón C", 4]]);
  });

  it("«esperando en el almacén»: tienen atrás y ninguna en el piso, las de más unidades primero, con el total", () => {
    expect(r.esperando.lista.map((p) => [p.referencia, p.almacen])).toEqual([["Body D", 12], ["Blusa B", 5]]);
    expect(r.esperando.prendas).toBe(2);
    expect(r.esperando.unidades).toBe(17);
  });

  it("si la lista no alcanza para todas, dice cuántas son en total (la lista se corta, el conteo no)", () => {
    const muchas = Array.from({ length: 8 }, (_, i) => fila({ varianteId: `m${i}`, referencia: `Prenda ${i}`, pisoDisponible: 0, almacenDisponible: i + 1 }));
    const e = resumenDeStock(muchas, { separa: true }).esperando;
    expect(e.lista).toHaveLength(5);
    expect(e.prendas).toBe(8);
    expect(e.unidades).toBe(36);
    expect(e.lista[0].almacen).toBe(8);
  });

  it("lo apartado para clientas no cuenta: se mide lo libre, igual que la tarjeta de Existencias", () => {
    // 10 en el almacén, 4 apartadas → `almacenDisponible` ya viene en 6.
    const libre = resumenDeStock([fila({ varianteId: "9", referencia: "Falda", pisoDisponible: 0, almacenDisponible: 6, apartado: 4 })], { separa: true });
    expect(libre.total).toBe(6);
  });

  it("las tallas de una prenda suman en una sola; dos colores son dos prendas", () => {
    const tallas = resumenDeStock(
      [
        fila({ varianteId: "s", referencia: "Casaca", talla: "S", color: "Negro", pisoDisponible: 1, almacenDisponible: 2 }),
        fila({ varianteId: "m", referencia: "Casaca", talla: "M", color: "Negro", pisoDisponible: 0, almacenDisponible: 3 }),
        fila({ varianteId: "b", referencia: "Casaca", talla: "S", color: "Beige", pisoDisponible: 0, almacenDisponible: 1 }),
      ],
      { separa: true },
    );
    expect(tallas.prendas.map((p) => [p.color, p.total]).sort()).toEqual([["Beige", 1], ["Negro", 6]]);
    // Una talla sin colgar no hace que «toda la prenda espere»: la Negra ya tiene una en el piso.
    expect(tallas.esperando.lista.map((p) => p.color)).toEqual(["Beige"]);
  });

  it("una prenda sin categoría no se pierde: entra como «Sin categoría»", () => {
    const sin = resumenDeStock([fila({ varianteId: "x", referencia: "Rara", categoria: null, pisoDisponible: 1, almacenDisponible: 1 })], { separa: true });
    expect(sin.porCategoria.map((c) => c.nombre)).toEqual([SIN_CATEGORIA]);
  });

  it("donde no se separa piso y almacén (Taller) no hay piso, almacén ni «esperando»: solo lo que hay", () => {
    const taller = resumenDeStock(
      [fila({ varianteId: "t", referencia: "Tela", categoria: "Insumos", pisoDisponible: 0, almacenDisponible: 0, disponible: 20 })],
      { separa: false },
    );
    expect([taller.total, taller.piso, taller.almacen]).toEqual([20, null, null]);
    expect(taller.porCategoria).toEqual([{ nombre: "Insumos", piso: null, almacen: null, total: 20 }]);
    expect(taller.esperando).toEqual({ lista: [], prendas: 0, unidades: 0 });
  });
});

describe("resumenDeVentas y la tabla por categoría", () => {
  const stock = resumenDeStock(
    [
      fila({ varianteId: "1", referencia: "Blusa A", categoria: "Blusas", pisoDisponible: 2, almacenDisponible: 8 }),
      fila({ varianteId: "2", referencia: "Pantalón C", categoria: "Pantalones", pisoDisponible: 4, almacenDisponible: 0 }),
    ],
    { separa: true },
  );
  const ventas: VentaDelMes[] = [
    venta({ referencia: "Blusa A", vendidas: 3 }),
    venta({ referencia: "Blusa A", vendidas: 2 }), // otra talla de la misma prenda
    venta({ referencia: "Pantalón C", categoria: "Pantalones", vendidas: 1 }),
    venta({ referencia: "Polo agotado", color: "Blanco", categoria: "Polos", vendidas: 4 }), // se vendió todo: ya no hay stock
  ];
  const v = resumenDeVentas(ventas, stock);

  it("suma lo vendido en total y por categoría, juntando las tallas de una prenda", () => {
    expect(v.vendidas).toBe(10);
    expect(Object.fromEntries(v.porCategoria)).toEqual({ Blusas: 5, Pantalones: 1, Polos: 4 });
  });

  it("«lo que más se vende»: de más a menos, con lo que queda hoy de cada una (0 si se agotó)", () => {
    expect(v.masVendidas.map((p) => [p.referencia, p.vendidas, p.quedan])).toEqual([
      ["Blusa A", 5, 10],
      ["Polo agotado", 4, 0],
      ["Pantalón C", 1, 4],
    ]);
  });

  it("la tabla junta lo que hay y lo vendido; una categoría que se agotó vendiendo sigue a la vista, y el total cierra", () => {
    const { filas, total } = tablaPorCategoria(stock, v);
    expect(filas.map((f) => [f.nombre, f.almacen, f.piso, f.vendidas])).toEqual([
      ["Blusas", 8, 2, 5],
      ["Pantalones", 0, 4, 1],
      ["Polos", 0, 0, 4], // sin stock, pero se vendió: no desaparece
    ]);
    expect([total.nombre, total.almacen, total.piso, total.vendidas]).toEqual(["Total", 8, 6, 10]);
  });

  it("mientras las ventas no se han leído (o fallaron) la tabla dice «sin dato», no cero", () => {
    const { filas, total } = tablaPorCategoria(stock, null);
    expect(filas.every((f) => f.vendidas === null)).toBe(true);
    expect(total.vendidas).toBeNull();
    // Y lo que hay se ve igual: no depende de las ventas.
    expect(filas.map((f) => f.total)).toEqual([10, 4]);
  });

  it("sin ventas en el mes todo queda en cero, que es un dato (no «sin dato»)", () => {
    const vacio = resumenDeVentas([], stock);
    expect(vacio.vendidas).toBe(0);
    expect(vacio.masVendidas).toEqual([]);
    expect(tablaPorCategoria(stock, vacio).filas.map((f) => f.vendidas)).toEqual([0, 0]);
  });
});
