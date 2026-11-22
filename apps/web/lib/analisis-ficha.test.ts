import { describe, expect, it } from "vitest";
import type { AccesoAnalisis, PrendaAnalisis, SedeAnalisis } from "./analisis-tipos";
import { grupoDe, LIQUIDAR_DEFECTO } from "./analisis-reglas";
import { hrefComprar } from "./analisis-acciones";
import {
  accionPrincipal,
  barrasSemanas,
  cifrasDe,
  detalleLlegada,
  fraseDelModelo,
  lineaOtrasTiendas,
  iniciosDeSemana,
  SEMANAS_FICHA,
  sedeParaPedir,
  solesFicha,
  subtituloFicha,
  tablaDelModelo,
  veredictoDe,
} from "./analisis-ficha";
import { modeloDe } from "./analisis-modelo";

// Datos inventados para la prueba (no son de producción): una red de tres tiendas y prendas de un modelo de ensayo.
const SEDES: SedeAnalisis[] = [
  { id: "s1", codigo: "TRU", nombre: "Tienda TRU", ciudad: "Trujillo" },
  { id: "s2", codigo: "AQP", nombre: "Tienda AQP", ciudad: "Arequipa" },
  { id: "s3", codigo: "LIM", nombre: "Tienda LIM", ciudad: "Lima" },
];

const TODO: AccesoAnalisis = {
  existencias: true,
  traslados: true,
  pedir: true,
  compras: true,
  produccion: true,
  etiquetas: true,
  movimientos: true,
  regularizar: true,
  cuadrar: true,
  conteo: true,
  frescura: true,
  planCompra: true,
};

function prenda(parcial: Partial<PrendaAnalisis>): PrendaAnalisis {
  return {
    varianteId: "v1",
    productoId: "p1",
    nombre: "Blusa Ensayo",
    color: "Celeste",
    colorHex: null,
    talla: "S",
    categoria: "Blusas",
    categoriaPrefijo: "BLU",
    categoriaFamilia: null,
    fotoUrl: null,
    precio: 60,
    costo: 27,
    origen: "taller",
    proveedorId: null,
    piso: 0,
    almacen: 0,
    vendidas30: 0,
    semanas: [0, 0, 0, 0, 0, 0, 0, 0],
    diasSinVender: null,
    salioAlPiso: null,
    llego: null,
    llegaron30: 0,
    vendidasDeLasQueLlegaron30: 0,
    otras: [
      { sedeId: "s2", stock: 0, vendidas30: 0 },
      { sedeId: "s3", stock: 0, vendidas30: 0 },
    ],
    llega: [],
    ...parcial,
  };
}

/** Lo que se lee de las tres cifras: «Etiqueta valor · detalle». */
const leer = (p: PrendaAnalisis) => cifrasDe(p, grupoDe(p, LIQUIDAR_DEFECTO), SEDES).map((c) => `${c.etiqueta} ${c.valor} · ${c.detalle}`);

describe("el veredicto de la ficha (una frase que dice cómo va, cara B)", () => {
  it("cada grupo con su estado y su frase; sin grupo, «Va bien.»", () => {
    expect(veredictoDe(prenda({ piso: 0, almacen: 0, vendidas30: 4 }), "comprar", false)).toEqual({ est: "urg", texto: "Ya no hay." });
    expect(veredictoDe(prenda({ piso: 2, almacen: 0, vendidas30: 30, diasDeVentas: 30 }), "comprar", false)).toEqual({ est: "urg", texto: "Se acaba: quedan 2 días." });
    expect(veredictoDe(prenda({ piso: 1, almacen: 0, vendidas30: 30, diasDeVentas: 30 }), "comprar", false)).toEqual({ est: "urg", texto: "Se acaba: queda 1 día." });
    expect(veredictoDe(prenda({ piso: 2 }), "enviar", false, "Arequipa")).toEqual({ est: "ate", texto: "Aquí no se vende; en Arequipa sí." });
    expect(veredictoDe(prenda({ piso: 2 }), "enviar", false).texto).toBe("Aquí no se vende; en otra tienda sí.");
    expect(veredictoDe(prenda({ piso: 2, diasSinVender: 1 }), "vigila", false)).toEqual({ est: "nd", texto: "Va lenta: 1 día sin venderse." });
    expect(veredictoDe(prenda({ piso: 2 }), "duda", false)).toEqual({ est: "nd", texto: "Puede que ya se vendió: hay una venta sin registrar." });
    expect(veredictoDe(prenda({ piso: 2 }), null, false)).toEqual({ est: "bien", texto: "Va bien." });
  });
  it("lo que no se vende: desde 3 meses en rojo, antes en ámbar; nunca dice «Liquidar» (Felipe 2026-11-21: decide la persona)", () => {
    expect(veredictoDe(prenda({ piso: 2, diasSinVender: 80 }), "liquidar", false)).toEqual({ est: "ate", texto: "80 días sin venderse." });
    expect(veredictoDe(prenda({ piso: 2, diasSinVender: 104 }), "liquidar", false)).toEqual({ est: "urg", texto: "104 días sin venderse." });
    expect(veredictoDe(prenda({ piso: 2, diasSinVender: 104 }), "liquidar", false).texto).not.toMatch(/liquid/i);
  });
  it("guardada y nunca colgada no «va bien»: nadie la vio; un grupo manda sobre eso", () => {
    expect(veredictoDe(prenda({ almacen: 3 }), null, true)).toEqual({ est: "ate", texto: "Está guardada y nadie la vio." });
    expect(veredictoDe(prenda({ piso: 0, almacen: 0, vendidas30: 4 }), "comprar", true).est).toBe("urg");
  });
});

describe("el dinero, como se lee en tienda", () => {
  it("entero sin decimales; con céntimos, dos; sin dato, «—»", () => {
    expect(solesFicha(60)).toBe("S/\u00a060");
    expect(solesFicha(59.9)).toBe("S/\u00a059.90");
    expect(solesFicha(1250)).toBe("S/\u00a01,250");
    expect(solesFicha(0)).toBe("S/\u00a00");
    expect(solesFicha(null)).toBe("—");
    expect(solesFicha(Number.NaN)).toBe("—");
    expect(solesFicha(-5)).toBe("−S/\u00a05");
  });
  it("la línea bajo el nombre: color, talla y precio", () => {
    expect(subtituloFicha({ color: "Celeste", talla: "S", precio: 60 })).toBe("Celeste · talla S · S/\u00a060");
    expect(subtituloFicha({ color: "Negro", talla: "Estándar", precio: 59.9 })).toBe("Negro · talla Estándar · S/\u00a059.90");
    expect(subtituloFicha({ color: "Celeste", talla: "S", precio: null })).toBe("Celeste · talla S");
  });
});

describe("lo que viene en camino, en una línea", () => {
  it("sumado por origen, en el orden en que aparece", () => {
    const llega = [
      { de: "compra" as const, cantidad: 4, fecha: null },
      { de: "almacen" as const, cantidad: 2, fecha: "2026-10-08" },
      { de: "compra" as const, cantidad: 6, fecha: "2026-10-15" },
      { de: "taller" as const, cantidad: 1, fecha: null },
    ];
    expect(detalleLlegada(llega)).toBe("compra 10 · almacén 2 · taller 1");
    expect(detalleLlegada([{ de: "tienda", cantidad: 2, fecha: null }])).toBe("otra tienda 2");
    expect(detalleLlegada([])).toBe("");
  });
});

describe("las tres cifras de la ficha (cara B): «Vendiste», «Tienes» y la que dice por qué está ahí", () => {
  it("se acaba y ya no hay: lo vendido, lo que tienes y qué otra tienda la tiene", () => {
    const p = prenda({ vendidas30: 6, otras: [{ sedeId: "s2", stock: 3, vendidas30: 0 }, { sedeId: "s3", stock: 0, vendidas30: 0 }] });
    expect(leer(p)).toEqual(["Vendiste 6 · en 30 días", "Tienes 0 · 0 en el piso", "En AQP 3 · se podría pedir"]);
  });

  it("se acaba: lo que viene en camino manda sobre la otra tienda; sin nada, «nada en camino»", () => {
    const llega = [
      { de: "compra" as const, cantidad: 10, fecha: "2026-10-15" },
      { de: "almacen" as const, cantidad: 2, fecha: "2026-10-08" },
      { de: "taller" as const, cantidad: 1, fecha: null },
    ];
    expect(leer(prenda({ vendidas30: 5, origen: "terceros", llega }))[2]).toBe("Llegan 13 · compra 10 · almacén 2 · taller 1");
    expect(leer(prenda({ vendidas30: 5, origen: null }))[2]).toBe("Llegan 0 · nada en camino");
  });

  it("aquí no se vende y allá sí: cuánto vendió la tienda que más la vende", () => {
    const p = prenda({ piso: 4, almacen: 2, diasSinVender: 64, otras: [{ sedeId: "s2", stock: 0, vendidas30: 3 }, { sedeId: "s3", stock: 1, vendidas30: 0 }] });
    expect(grupoDe(p, LIQUIDAR_DEFECTO)).toBe("enviar");
    expect(leer(p)).toEqual(["Vendiste 0 · en 30 días", "Tienes 6 · 4 en el piso", "En AQP 3 · vendidas este mes"]);
  });

  it("lo que no se vende y lo que va lento: lo parado a su costo (como «No se vende»); sin costo, «—»", () => {
    expect(leer(prenda({ piso: 3, almacen: 2, diasSinVender: 104 }))[2]).toBe("Parados S/\u00a0135 · a su costo");
    expect(leer(prenda({ piso: 2, almacen: 2, diasSinVender: 38 }))[2]).toBe("Parados S/\u00a0108 · a su costo");
    expect(leer(prenda({ piso: 2, diasSinVender: 104, costo: null }))[2]).toBe("Parados — · sin costo registrado");
  });

  it("lo parado con la vara de su tipo dice contra qué se juzgó (ADR-0357, act. 2026-10-14)", () => {
    const p = prenda({ piso: 2, diasSinVender: 8, umbrales: { vigila: 3, liquidar: 6, vara: "hoy", vendidas: 30 } });
    expect(cifrasDe(p, "liquidar", SEDES)[2]).toEqual({ etiqueta: "Parados", valor: "S/\u00a054", detalle: "su tipo se vende antes de 6 días" });
  });

  it("el modelo entero suma lo parado de todas sus tallas", () => {
    const m = { ...prenda({ piso: 1, diasSinVender: 104 }), variantes: [prenda({ piso: 1 }), prenda({ varianteId: "v2", almacen: 2, costo: 30 })] };
    expect(cifrasDe(m, "liquidar", SEDES)[2].valor).toBe("S/\u00a087");
  });

  it("lo que puede haberse vendido sin registrar: cuántas están en duda", () => {
    expect(leer(prenda({ piso: 2, diasSinVender: 80, enDuda: 1 }))[2]).toBe("En duda 1 · puede ser una venta sin registrar");
    expect(cifrasDe(prenda({ piso: 3, diasSinVender: 80, enDuda: 2 }), "duda", SEDES)[2].detalle).toBe("pueden ser ventas sin registrar");
  });

  it("si va bien: cuánto le dura lo que tiene, en semanas; la tienda con pocos días de ventas dice sus días", () => {
    const p = prenda({ piso: 5, almacen: 4, vendidas30: 7 });
    expect(grupoDe(p, LIQUIDAR_DEFECTO)).toBeNull();
    expect(leer(p)).toEqual(["Vendiste 7 · en 30 días", "Tienes 9 · 5 en el piso", "Te dura 6 · semanas"]);
    // Una tienda con 8 días de ventas en el ERP dice sus días, no 30.
    expect(leer({ ...p, piso: 50, almacen: 40, diasDeVentas: 8 })).toEqual(["Vendiste 7 · en 8 días", "Tienes 90 · 50 en el piso", "Te dura 15 · semanas"]);
    expect(grupoDe({ ...p, diasDeVentas: 8 }, LIQUIDAR_DEFECTO)).toBe("comprar");
  });

  it("nunca salió al piso: los días que lleva guardada; sin fecha de llegada, «—»", () => {
    const p = prenda({ piso: 0, almacen: 3, salioAlPiso: null, llego: "2026-09-29" });
    expect(cifrasDe(p, null, SEDES, { dias: 8 }).map((c) => `${c.etiqueta} ${c.valor} · ${c.detalle}`)).toEqual([
      "Vendiste 0 · en 30 días",
      "Tienes 3 · 0 en el piso",
      "Guardada 8 · días sin salir",
    ]);
    expect(cifrasDe(p, null, SEDES, { dias: 1 })[2].detalle).toBe("día sin salir");
    expect(cifrasDe(p, null, SEDES, { dias: null })[2]).toEqual({ etiqueta: "Guardada", valor: "—", detalle: "sin fecha de llegada" });
  });

  it("una tienda que no está en la red se nombra «Otra tienda» (no se cae)", () => {
    const p = prenda({ vendidas30: 4, origen: null, otras: [{ sedeId: "s9", stock: 2, vendidas30: 0 }] });
    expect(leer(p)[2]).toBe("Otra tienda 2 · se podría pedir");
  });

  it("siempre son tres, sea cual sea el grupo", () => {
    const p = prenda({ piso: 2, vendidas30: 2, diasSinVender: 40, enDuda: 1 });
    for (const g of ["comprar", "enviar", "liquidar", "vigila", "duda", null] as const) expect(cifrasDe(p, g, SEDES)).toHaveLength(3);
  });
});

describe("las semanas: las mismas 8 que cuenta la lectura, la última termina hoy", () => {
  it("cada semana empieza 6 días antes de su último día; la última va de hace 6 días a hoy", () => {
    // `fn_analisis_sede` (20261006214000): la semana k son los 7 días que terminan hoy − 7·(7−k).
    expect(iniciosDeSemana("2026-10-06")).toEqual(["2026-08-12", "2026-08-19", "2026-08-26", "2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23", "2026-09-30"]);
    expect(iniciosDeSemana("2026-01-03").slice(-2)).toEqual(["2025-12-21", "2025-12-28"]); // cruzando el año
  });

  it("cada barra con su fecha corta y su tooltip; la última, marcada", () => {
    const barras = barrasSemanas([0, 1, 0, 1, 1, 1, 2, 2], "2026-10-06");
    expect(barras).toHaveLength(SEMANAS_FICHA);
    expect(barras.map((b) => b.etiqueta)).toEqual(["12 ago.", "19 ago.", "26 ago.", "2 set.", "9 set.", "16 set.", "23 set.", "30 set."]);
    expect(barras.map((b) => b.vendidas)).toEqual([0, 1, 0, 1, 1, 1, 2, 2]);
    expect(barras.map((b) => b.ultima)).toEqual([false, false, false, false, false, false, false, true]);
    expect(barras[7].tip).toBe("Semana del 30 set.: 2 vendidas");
    expect(barras[1].tip).toBe("Semana del 19 ago.: 1 vendida");
    expect(barras[0].tip).toBe("Semana del 12 ago.: 0 vendidas");
  });

  it("sin ventas: todas en 0", () => {
    expect(barrasSemanas([0, 0, 0, 0, 0, 0, 0, 0], "2026-10-06").every((b) => b.vendidas === 0)).toBe(true);
  });

  it("si la lectura trae menos semanas, las que faltan al principio valen 0; si trae más, cuentan las últimas 8", () => {
    expect(barrasSemanas([3, 1], "2026-10-06").map((b) => b.vendidas)).toEqual([0, 0, 0, 0, 0, 0, 3, 1]);
    expect(barrasSemanas([9, 9, 1, 2, 3, 4, 5, 6, 7, 8], "2026-10-06").map((b) => b.vendidas)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(barrasSemanas([-2, Number.NaN, 1, 1, 1, 1, 1, 1], "2026-10-06").map((b) => b.vendidas)).toEqual([0, 0, 1, 1, 1, 1, 1, 1]);
  });
});

describe("los botones del pie", () => {
  it("se acaba: Comprar (lo mismo que su carril); sin el módulo, sin botón", () => {
    const p = prenda({ vendidas30: 4, origen: "terceros", proveedorId: "prov-1" });
    expect(accionPrincipal(p, "comprar", SEDES, TODO)).toEqual({ texto: "Comprar", href: hrefComprar(p, TODO)! });
    expect(accionPrincipal(p, "comprar", SEDES, { ...TODO, compras: false })).toBeNull();
  });

  it("para mandar: a la ciudad que más la vende, con ella ya elegida", () => {
    const p = prenda({ piso: 2, diasSinVender: 70, otras: [{ sedeId: "s2", stock: 0, vendidas30: 1 }, { sedeId: "s3", stock: 0, vendidas30: 4 }] });
    const a = accionPrincipal(p, "enviar", SEDES, TODO)!;
    expect(a.texto).toBe("Enviar a Lima");
    expect(a.href).toContain("destino=s3");
    expect(accionPrincipal(p, "enviar", SEDES, { ...TODO, traslados: false })).toBeNull();
    expect(accionPrincipal(p, "enviar", [SEDES[0]], TODO)).toBeNull(); // la tienda que la vende ya no está en la red
  });

  it("lo que no se vende, vigilar o ir bien no tienen botón principal (sin «Liquidar»: decide la persona)", () => {
    const p = prenda({ piso: 2, diasSinVender: 80 });
    expect(accionPrincipal(p, "liquidar", SEDES, TODO)).toBeNull();
    expect(accionPrincipal(p, "vigila", SEDES, TODO)).toBeNull();
    expect(accionPrincipal(p, null, SEDES, TODO)).toBeNull();
  });

  it("lo que puede haberse vendido sin registrar: «Registrar ventas» (Por regularizar); sin Existencias, sin botón", () => {
    const p = prenda({ piso: 2, diasSinVender: 80, enDuda: 1 });
    expect(accionPrincipal(p, "duda", SEDES, TODO)).toEqual({ texto: "Registrar ventas", href: "/inventario/por-regularizar" });
    expect(accionPrincipal(p, "duda", SEDES, { ...TODO, regularizar: false })).toBeNull();
  });

  it("nunca salió al piso: «Bajar al piso» (Reponer a piso con ella); sin Existencias, sin botón", () => {
    const p = prenda({ varianteId: "g44", piso: 0, almacen: 2, salioAlPiso: null });
    expect(accionPrincipal(p, null, SEDES, TODO, true)).toEqual({ texto: "Bajar al piso", href: "/inventario/bajar?lineas=g44:1" });
    expect(accionPrincipal(p, null, SEDES, { ...TODO, existencias: false }, true)).toBeNull();
  });

  it("«Pedir a …»: solo si se acaba, otra tienda la tiene y la cuenta puede pedir (la que más tiene)", () => {
    const p = prenda({ vendidas30: 5, otras: [{ sedeId: "s2", stock: 1, vendidas30: 0 }, { sedeId: "s3", stock: 4, vendidas30: 0 }] });
    expect(sedeParaPedir(p, "comprar", SEDES, TODO)?.ciudad).toBe("Lima");
    expect(sedeParaPedir(p, "comprar", SEDES, { pedir: false })).toBeNull();
    expect(sedeParaPedir(p, "liquidar", SEDES, TODO)).toBeNull();
    expect(sedeParaPedir(prenda({ vendidas30: 5 }), "comprar", SEDES, TODO)).toBeNull();
  });
});

describe("el modelo en tu tienda: frase, tabla y otras tiendas (opción B, Felipe 2026-10-10)", () => {
  const HOY_FICHA = "2026-10-10";
  // La forma de la captura de Felipe (TRU, 11 días): 6 colores × S y M, 10 vendidas y 1 que queda. Nombres de color inventados.
  const v = (varianteId: string, color: string, talla: string, vendidas30: number, piso = 0) => prenda({ varianteId, color, talla, vendidas30, piso });
  const m = modeloDe(
    [
      v("a", "Verde agua", "S", 0, 1),
      v("b", "Blanco", "S", 1),
      v("c", "Blanco", "M", 2),
      v("d", "Chocolate", "S", 1),
      v("e", "Chocolate", "M", 2),
      v("f", "Negro", "S", 1),
      v("g", "Vainilla", "M", 1),
      v("h", "Vino", "S", 2),
    ],
    HOY_FICHA,
  );

  it("la frase responde: cuánto vendiste en tus días y cuánto te queda", () => {
    expect(fraseDelModelo(m, 11)).toBe("Vendiste 10 en 11 días y te queda 1.");
    expect(fraseDelModelo(modeloDe([v("x", "Rosa", "S", 0, 3)], HOY_FICHA), 1)).toBe("No vendiste ninguna en 1 día; te quedan 3.");
    expect(fraseDelModelo(modeloDe([v("x", "Rosa", "S", 2)], HOY_FICHA), 11)).toBe("Vendiste 2 en 11 días y no te queda ninguna.");
  });

  it("los colores que más se venden arriba, quede o no (a igual venta, por nombre); las tallas en orden de tienda", () => {
    const t = tablaDelModelo(m)!;
    expect(t.tallas).toEqual(["S", "M"]);
    expect(t.filas.map((f) => [f.color, f.vendio])).toEqual([
      ["Blanco", 3],
      ["Chocolate", 3],
      ["Vino", 2],
      ["Negro", 1],
      ["Vainilla", 1],
      ["Verde agua", 0],
    ]);
    expect(t.vendioPorTalla).toEqual([5, 5]);
    expect(t.vendio).toBe(10);
  });

  it("cada celda dice con palabras qué pasó: vendido y sin stock, te queda, o no hay; la fila de un color sin stock lo alerta", () => {
    const t = tablaDelModelo(m)!;
    const celda = (color: string, talla: string) => t.filas.find((f) => f.color === color)!.celdas.find((c) => c.talla === talla)!;
    expect(celda("Blanco", "M")).toMatchObject({ estado: "pedir", fuerte: "2 vendidas", suave: "sin stock", tip: "Blanco · M: 2 vendidas, sin stock" });
    expect(t.filas.find((f) => f.color === "Blanco")!.sinStock).toBe(true);
    expect(t.filas.find((f) => f.color === "Verde agua")!.sinStock).toBe(false);
    expect(celda("Negro", "S")).toMatchObject({ estado: "pedir", fuerte: "1 vendida" });
    expect(celda("Verde agua", "S")).toMatchObject({ estado: "queda", fuerte: "sin ventas", suave: "queda 1" });
    expect(celda("Vino", "M")).toMatchObject({ estado: "nada", fuerte: "no hay", suave: null });
    const vende = tablaDelModelo(modeloDe([v("x", "Rosa", "S", 2, 3), v("y", "Rosa", "M", 0, 0)], HOY_FICHA))!;
    // Arriba siempre lo vendido y abajo lo que queda, haya stock o no (Felipe 2026-10-12).
    expect(vende.filas[0].celdas[0]).toMatchObject({ estado: "queda", fuerte: "2 vendidas", suave: "quedan 3", tip: "Rosa · S: 2 vendidas, quedan 3" });
    expect(vende.filas[0].celdas[1]).toMatchObject({ estado: "nada", fuerte: "no hay" });
  });

  it("a igual venta no importa si queda: el orden es solo por lo vendido y después por nombre", () => {
    const t = tablaDelModelo(modeloDe([v("a", "Rosa", "S", 2, 3), v("b", "Azul", "S", 2, 0), v("c", "Azul", "M", 0, 0), v("d", "Rosa", "M", 0, 0)], HOY_FICHA))!;
    expect(t.filas.map((f) => [f.color, f.sinStock])).toEqual([["Azul", true], ["Rosa", false]]);
  });

  it("lo que ni se vendió ni tienes va al final, debajo de lo que no se vendió pero tienes", () => {
    const t = tablaDelModelo(
      modeloDe([v("a", "Azul", "Estándar", 0, 0), v("b", "Rosa", "Estándar", 0, 2), v("c", "Negro", "Estándar", 1, 0), v("d", "Beige", "Estándar", 0, 3)], HOY_FICHA),
    )!;
    expect(t.filas.map((f) => f.color)).toEqual(["Negro", "Beige", "Rosa", "Azul"]);
    expect(t.filas[3].celdas[0].fuerte).toBe("no hay");
    // Solo se alerta lo que se vendió y se quedó sin stock: «Azul» nunca se vendió y su celda ya dice «no hay».
    expect(t.filas.map((f) => f.sinStock)).toEqual([true, false, false, false]);
  });

  it("una sola talla de un solo color no lleva tabla: la frase ya lo dice", () => {
    expect(tablaDelModelo(modeloDe([v("x", "Rosa", "S", 2, 1)], HOY_FICHA))).toBeNull();
  });

  it("las otras tiendas en una línea, con sus propios 30 días", () => {
    expect(lineaOtrasTiendas(m, SEDES, "s1")).toBe("Arequipa y Lima no tienen este modelo.");
    const conOtras = { otras: [{ sedeId: "s2", stock: 3, vendidas30: 2 }, { sedeId: "s3", stock: 0, vendidas30: 0 }] };
    expect(lineaOtrasTiendas(conOtras, SEDES, "s1")).toBe("Arequipa tiene 3 (vendió 2 en sus últimos 30 días). Lima no tiene.");
    expect(lineaOtrasTiendas({ otras: [] }, [SEDES[0]], "s1")).toBeNull();
  });

  it("el subtítulo dice sus colores y tallas, y el precio «desde» el menor si varía", () => {
    const conPrecios = modeloDe([prenda({ varianteId: "p1", color: "Arena", talla: "S", precio: 100 }), prenda({ varianteId: "p2", color: "Tostado", talla: "M", precio: 90 })], HOY_FICHA);
    expect(subtituloFicha(conPrecios)).toBe("2 colores · S, M · desde S/\u00a090");
  });
});
