import { describe, expect, it } from "vitest";
import type { AccesoAnalisis, PrendaAnalisis, SedeAnalisis } from "./analisis-tipos";
import { grupoDe, LIQUIDAR_DEFECTO } from "./analisis-reglas";
import { hrefComprar, hrefLiquidar } from "./analisis-acciones";
import {
  accionPrincipal,
  barrasSemanas,
  chipDeGrupo,
  detalleLlegada,
  dineroDe,
  fraseDelModelo,
  lineaOtrasTiendas,
  hechosDe,
  iniciosDeSemana,
  SEMANAS_FICHA,
  sedeParaPedir,
  solesFicha,
  subtituloFicha,
  tablaDelModelo,
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

/** Lo que se lee de una tarjetita: «valor · etiqueta». */
const leer = (p: PrendaAnalisis) => hechosDe(p, grupoDe(p, LIQUIDAR_DEFECTO), SEDES).map((h) => [h.valor, h.etiqueta].filter(Boolean).join(" · "));

describe("el chip de la prenda (el título de su grupo)", () => {
  it("cada grupo con su estado; sin grupo, «Va bien»", () => {
    expect(chipDeGrupo("comprar")).toEqual({ est: "urg", texto: "Cómpralas" });
    expect(chipDeGrupo("enviar")).toEqual({ est: "ate", texto: "Mándalas a donde sí se venden" });
    expect(chipDeGrupo("liquidar")).toEqual({ est: "ate", texto: "Liquidar" });
    expect(chipDeGrupo("vigila")).toEqual({ est: "nd", texto: "Vigílalas" });
    expect(chipDeGrupo(null)).toEqual({ est: "bien", texto: "Va bien" });
    // Guardada y nunca colgada: no «va bien», nadie la vio (20261007120000). Un grupo manda sobre eso.
    expect(chipDeGrupo(null, true)).toEqual({ est: "ate", texto: "Nunca salió al piso" });
    expect(chipDeGrupo("comprar", true)).toEqual({ est: "urg", texto: "Cómpralas" });
  });
});

describe("el dinero, como se lee en tienda", () => {
  it("entero sin decimales; con céntimos, dos; sin dato, «—»", () => {
    expect(solesFicha(60)).toBe("S/ 60");
    expect(solesFicha(59.9)).toBe("S/ 59.90");
    expect(solesFicha(1250)).toBe("S/ 1,250");
    expect(solesFicha(0)).toBe("S/ 0");
    expect(solesFicha(null)).toBe("—");
    expect(solesFicha(Number.NaN)).toBe("—");
    expect(solesFicha(-5)).toBe("−S/ 5");
  });
  it("lo que se gana por cada una es precio menos costo, sin arrastrar el error de los decimales", () => {
    expect(dineroDe({ precio: 60, costo: 27 })).toEqual({ costo: "S/ 27", ganas: "S/ 33" });
    expect(dineroDe({ precio: 79.9, costo: 32.92 })).toEqual({ costo: "S/ 32.92", ganas: "S/ 46.98" });
  });
  it("si falta el precio o el costo, «—» (nunca una ganancia inventada)", () => {
    expect(dineroDe({ precio: 60, costo: null })).toEqual({ costo: "—", ganas: "—" });
    expect(dineroDe({ precio: null, costo: 27 })).toEqual({ costo: "S/ 27", ganas: "—" });
  });
  it("la línea bajo el nombre: color, talla y precio", () => {
    expect(subtituloFicha({ color: "Celeste", talla: "S", precio: 60 })).toBe("Celeste · talla S · S/ 60");
    expect(subtituloFicha({ color: "Negro", talla: "Estándar", precio: 59.9 })).toBe("Negro · talla Estándar · S/ 59.90");
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

describe("las tarjetitas de la ficha (como `hechos()` de la maqueta)", () => {
  it("se acaba y ya no hay: rojo, lo vendido, de dónde se repone y qué otra tienda la tiene", () => {
    const p = prenda({ vendidas30: 6, otras: [{ sedeId: "s2", stock: 3, vendidas30: 0 }, { sedeId: "s3", stock: 0, vendidas30: 0 }] });
    expect(leer(p)).toEqual(["Ya no hay · en tu tienda", "Vendiste 6 · en 30 días", "Proveedor taller", "AQP tiene 3 · se podría pedir"]);
    const [agotada] = hechosDe(p, "comprar", SEDES);
    expect(agotada).toMatchObject({ icono: "agotado", tono: "rojo" });
  });

  it("se acaba con días: ámbar hasta una semana, pizarra después; «Queda 1 día» en singular", () => {
    const seis = prenda({ piso: 1, vendidas30: 5 });
    expect(leer(seis)[0]).toBe("Quedan 6 días · tienes 1");
    expect(hechosDe(seis, "comprar", SEDES)[0]).toMatchObject({ icono: "reloj", tono: "ambar" });
    const diez = prenda({ piso: 2, almacen: 1, vendidas30: 9 });
    expect(leer(diez)[0]).toBe("Quedan 10 días · tienes 3");
    expect(hechosDe(diez, "comprar", SEDES)[0]).toMatchObject({ tono: "pizarra" });
    expect(leer(prenda({ piso: 1, vendidas30: 30 }))[0]).toBe("Queda 1 día · tienes 1");
  });

  it("lo que viene en camino y el proveedor de terceros; sin origen conocido, no dice proveedor", () => {
    const llega = [
      { de: "compra" as const, cantidad: 10, fecha: "2026-10-15" },
      { de: "almacen" as const, cantidad: 2, fecha: "2026-10-08" },
      { de: "taller" as const, cantidad: 1, fecha: null },
    ];
    const p = prenda({ vendidas30: 5, origen: "terceros", llega });
    expect(leer(p)).toEqual(["Ya no hay · en tu tienda", "Vendiste 5 · en 30 días", "Proveedor terceros", "Por llegar 13 · compra 10 · almacén 2 · taller 1"]);
    expect(hechosDe(p, "comprar", SEDES)[2]).toMatchObject({ icono: "caja", tono: "taupe" });
    expect(leer(prenda({ vendidas30: 5, origen: null }))).toEqual(["Ya no hay · en tu tienda", "Vendiste 5 · en 30 días"]);
  });

  it("quieta para mandar: días en el piso sin venderse, cuánto hay y qué tienda sí la vende", () => {
    const p = prenda({ piso: 4, almacen: 2, diasSinVender: 64, otras: [{ sedeId: "s2", stock: 0, vendidas30: 3 }, { sedeId: "s3", stock: 1, vendidas30: 0 }] });
    expect(grupoDe(p, LIQUIDAR_DEFECTO)).toBe("enviar");
    expect(leer(p)).toEqual(["64 días · en el piso sin venderse", "Tienes 6 · 4 en el piso", "AQP vendió 3 · este mes"]);
    expect(hechosDe(p, "enviar", SEDES).map((h) => h.icono)).toEqual(["reloj", "caja", "camion"]);
  });

  it("para liquidar: desde 3 meses todo va en rojo; antes, en ámbar", () => {
    const vieja = prenda({ piso: 3, almacen: 2, diasSinVender: 104 });
    expect(leer(vieja)).toEqual(["104 días · en el piso sin venderse", "Tienes 5 · 3 en el piso", "Liquidar · tú eliges cuánto"]);
    expect(hechosDe(vieja, "liquidar", SEDES).map((h) => h.tono)).toEqual(["rojo", "taupe", "rojo"]);
    expect(hechosDe(vieja, "liquidar", SEDES)[0]).toMatchObject({ icono: "urg" });
    const menos = prenda({ piso: 2, diasSinVender: 72 });
    expect(hechosDe(menos, "liquidar", SEDES).map((h) => h.tono)).toEqual(["ambar", "taupe", "ambar"]);
  });

  it("para vigilar: solo los días y cuánto hay", () => {
    expect(leer(prenda({ piso: 2, almacen: 2, diasSinVender: 38 }))).toEqual(["38 días · en el piso sin venderse", "Tienes 4 · 2 en el piso"]);
  });

  it("si va bien: lo vendido y cuánto hay", () => {
    const p = prenda({ piso: 5, almacen: 4, vendidas30: 7 });
    expect(grupoDe(p, LIQUIDAR_DEFECTO)).toBeNull();
    expect(leer(p)).toEqual(["Vendiste 7 · en 30 días", "Tienes 9 · 5 en el piso"]);
    // Una tienda con 8 días de ventas en el ERP dice sus días, no 30; y a ese ritmo las 9 duran 10 días: se acaba.
    expect(leer({ ...p, piso: 50, almacen: 40, diasDeVentas: 8 })).toEqual(["Vendiste 7 · en 8 días", "Tienes 90 · 50 en el piso"]);
    expect(grupoDe({ ...p, diasDeVentas: 8 }, LIQUIDAR_DEFECTO)).toBe("comprar");
  });

  it("nunca salió al piso: los días que lleva guardada y que no hay nada colgado; sin fecha de llegada, solo que nunca salió", () => {
    const p = prenda({ piso: 0, almacen: 3, salioAlPiso: null, llego: "2026-09-29" });
    const texto = (h: { valor: string; etiqueta: string | null }) => [h.valor, h.etiqueta].filter(Boolean).join(" · ");
    expect(hechosDe(p, null, SEDES, { dias: 8 }).map(texto)).toEqual(["8 días · en el almacén, sin salir al piso", "Tienes 3 · 0 en el piso"]);
    expect(hechosDe(p, null, SEDES, { dias: 8 })[0]).toMatchObject({ icono: "reloj", tono: "ambar" });
    expect(hechosDe(p, null, SEDES, { dias: null }).map(texto)).toEqual(["Nunca salió al piso", "Tienes 3 · 0 en el piso"]);
  });

  it("una tienda que no está en la red se nombra «Otra tienda» (no se cae)", () => {
    const p = prenda({ vendidas30: 4, origen: null, otras: [{ sedeId: "s9", stock: 2, vendidas30: 0 }] });
    expect(leer(p)).toContain("Otra tienda tiene 2 · se podría pedir");
  });
});

describe("las semanas: las mismas 8 que cuenta la lectura, la última termina hoy", () => {
  it("cada semana empieza 6 días antes de su último día; la última va de hace 6 días a hoy", () => {
    // `fn_analisis_sede` (20261006214000): la semana k son los 7 días que terminan hoy − 7·(7−k).
    expect(iniciosDeSemana("2026-10-06")).toEqual(["2026-08-12", "2026-08-19", "2026-08-26", "2026-09-02", "2026-09-09", "2026-09-16", "2026-09-23", "2026-09-30"]);
    expect(iniciosDeSemana("2026-01-03").slice(-2)).toEqual(["2025-12-21", "2025-12-28"]); // cruzando el año
  });

  it("cada barra con su fecha corta, su alto y su tooltip; la última, marcada", () => {
    const barras = barrasSemanas([0, 1, 0, 1, 1, 1, 2, 2], "2026-10-06");
    expect(barras).toHaveLength(SEMANAS_FICHA);
    expect(barras.map((b) => b.etiqueta)).toEqual(["12 ago.", "19 ago.", "26 ago.", "2 set.", "9 set.", "16 set.", "23 set.", "30 set."]);
    expect(barras.map((b) => b.alto)).toEqual([0, 31, 0, 31, 31, 31, 62, 62]);
    expect(barras.map((b) => b.ultima)).toEqual([false, false, false, false, false, false, false, true]);
    expect(barras[7].tip).toBe("Semana del 30 set.: 2 vendidas");
    expect(barras[1].tip).toBe("Semana del 19 ago.: 1 vendida");
    expect(barras[0].tip).toBe("Semana del 12 ago.: 0 vendidas");
  });

  it("sin ventas: todas a ras (sin dividir entre 0)", () => {
    expect(barrasSemanas([0, 0, 0, 0, 0, 0, 0, 0], "2026-10-06").every((b) => b.alto === 0 && b.vendidas === 0)).toBe(true);
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

  it("para liquidar: sus etiquetas; vigilar o ir bien no tienen botón principal", () => {
    const p = prenda({ piso: 2, diasSinVender: 80 });
    expect(accionPrincipal(p, "liquidar", SEDES, TODO)).toEqual({ texto: "Liquidar", href: hrefLiquidar([p], TODO)! });
    expect(accionPrincipal(p, "liquidar", SEDES, { ...TODO, etiquetas: false })).toBeNull();
    expect(accionPrincipal(p, "vigila", SEDES, TODO)).toBeNull();
    expect(accionPrincipal(p, null, SEDES, TODO)).toBeNull();
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

  it("los colores que más se venden arriba (a igual venta, el que más tienes y luego por nombre); las tallas en orden de tienda", () => {
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

  it("cada celda dice con palabras qué pasó: se vendía y no queda, te queda, o no hay", () => {
    const t = tablaDelModelo(m)!;
    const celda = (color: string, talla: string) => t.filas.find((f) => f.color === color)!.celdas.find((c) => c.talla === talla)!;
    expect(celda("Blanco", "M")).toMatchObject({ estado: "pedir", fuerte: "2 vendidas", suave: "no queda", tip: "Blanco · M: 2 vendidas, no queda" });
    expect(celda("Negro", "S")).toMatchObject({ estado: "pedir", fuerte: "1 vendida" });
    expect(celda("Verde agua", "S")).toMatchObject({ estado: "queda", fuerte: "queda 1", suave: "sin ventas" });
    expect(celda("Vino", "M")).toMatchObject({ estado: "nada", fuerte: "no hay", suave: null });
    const vende = tablaDelModelo(modeloDe([v("x", "Rosa", "S", 2, 3), v("y", "Rosa", "M", 0, 0)], HOY_FICHA))!;
    expect(vende.filas[0].celdas[0]).toMatchObject({ estado: "queda", fuerte: "quedan 3", suave: "vendiste 2" });
    expect(vende.filas[0].celdas[1]).toMatchObject({ estado: "nada", fuerte: "no hay" });
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
    expect(subtituloFicha(conPrecios)).toBe("2 colores · S, M · desde S/ 90");
  });
});
