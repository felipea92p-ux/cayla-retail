import { describe, expect, it } from "vitest";
import type { AccesoAnalisis, PrendaAnalisis, SedeAnalisis } from "./analisis-tipos";
import { grupoDe, LIQUIDAR_DEFECTO } from "./analisis-reglas";
import { hrefComprar, hrefLiquidar } from "./analisis-acciones";
import {
  accionPrincipal,
  barrasSemanas,
  chipDeGrupo,
  claseCelda,
  detalleLlegada,
  dineroDe,
  dondeHay,
  grillaDelModelo,
  hechosDe,
  iniciosDeSemana,
  PUNTOS_MAX,
  SEMANAS_FICHA,
  sedeParaPedir,
  solesFicha,
  subtituloFicha,
} from "./analisis-ficha";

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

  it("quieta para mandar: días sin venderse, cuánto hay y qué tienda sí la vende", () => {
    const p = prenda({ piso: 4, almacen: 2, diasSinVender: 64, otras: [{ sedeId: "s2", stock: 0, vendidas30: 3 }, { sedeId: "s3", stock: 1, vendidas30: 0 }] });
    expect(grupoDe(p, LIQUIDAR_DEFECTO)).toBe("enviar");
    expect(leer(p)).toEqual(["64 días · sin venderse", "Tienes 6 · 4 en el piso", "AQP vendió 3 · este mes"]);
    expect(hechosDe(p, "enviar", SEDES).map((h) => h.icono)).toEqual(["reloj", "caja", "camion"]);
  });

  it("para liquidar: desde 3 meses todo va en rojo; antes, en ámbar", () => {
    const vieja = prenda({ piso: 3, almacen: 2, diasSinVender: 104 });
    expect(leer(vieja)).toEqual(["104 días · sin venderse", "Tienes 5 · 3 en el piso", "Liquidar · tú eliges cuánto"]);
    expect(hechosDe(vieja, "liquidar", SEDES).map((h) => h.tono)).toEqual(["rojo", "taupe", "rojo"]);
    expect(hechosDe(vieja, "liquidar", SEDES)[0]).toMatchObject({ icono: "urg" });
    const menos = prenda({ piso: 2, diasSinVender: 72 });
    expect(hechosDe(menos, "liquidar", SEDES).map((h) => h.tono)).toEqual(["ambar", "taupe", "ambar"]);
  });

  it("para vigilar: solo los días y cuánto hay", () => {
    expect(leer(prenda({ piso: 2, almacen: 2, diasSinVender: 38 }))).toEqual(["38 días · sin venderse", "Tienes 4 · 2 en el piso"]);
  });

  it("si va bien: lo vendido y cuánto hay", () => {
    const p = prenda({ piso: 5, almacen: 4, vendidas30: 7 });
    expect(grupoDe(p, LIQUIDAR_DEFECTO)).toBeNull();
    expect(leer(p)).toEqual(["Vendiste 7 · en 30 días", "Tienes 9 · 5 en el piso"]);
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

describe("dónde hay: la red, mi tienda primero", () => {
  it("mi tienda dice «tú» y lo que hay en el piso y en el almacén; las demás, lo suyo", () => {
    const p = prenda({ piso: 2, almacen: 1, vendidas30: 5, otras: [{ sedeId: "s2", stock: 0, vendidas30: 1 }, { sedeId: "s3", stock: 4, vendidas30: 1 }] });
    const filas = dondeHay(p, SEDES, "s1");
    expect(filas.map((f) => [f.ciudad, f.tuya, f.tiene, f.vendio])).toEqual([
      ["Trujillo", true, 3, 5],
      ["Arequipa", false, 0, 1],
      ["Lima", false, 4, 1],
    ]);
    expect(filas[0].detalle).toBe("2 en el piso · 1 en el almacén");
    expect(filas.slice(1).every((f) => f.detalle === null)).toBe(true);
    // La barra de la que más tiene llega a 0,8; las demás, en proporción.
    expect(filas[0].ancho).toBeCloseTo(0.6);
    expect(filas[1].ancho).toBe(0);
    expect(filas[2].ancho).toBeCloseTo(0.8);
  });

  it("mi tienda va primero aunque la red venga en otro orden; una tienda sin la prenda dice 0", () => {
    const p = prenda({ piso: 1, otras: [] });
    const filas = dondeHay(p, [SEDES[1], SEDES[0], SEDES[2]], "s1");
    expect(filas.map((f) => f.sedeId)).toEqual(["s1", "s2", "s3"]);
    expect(filas.slice(1).map((f) => [f.tiene, f.vendio])).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it("los puntos de lo vendido llegan hasta 10 (la cifra dice el resto)", () => {
    const filas = dondeHay(prenda({ vendidas30: 23 }), SEDES, "s1");
    expect(filas[0].puntos).toBe(PUNTOS_MAX);
    expect(filas[0].vendio).toBe(23);
  });
});

describe("todo el modelo en mi tienda (talla × color)", () => {
  it("cómo se pinta cada celda", () => {
    expect(claseCelda(0, 2)).toBe("falta");
    expect(claseCelda(0, 0)).toBe("cero");
    expect(claseCelda(1, 3)).toBe("poco");
    expect(claseCelda(1, 2)).toBe("");
    expect(claseCelda(2, 9)).toBe("");
  });

  const esta = prenda({ varianteId: "a-s", color: "Celeste", colorHex: "#A9CADA", talla: "S", piso: 1, vendidas30: 5 });
  const modelo = [
    prenda({ varianteId: "b-m", color: "Azul claro", colorHex: "#80A0D4", talla: "M", piso: 0, vendidas30: 3 }),
    prenda({ varianteId: "a-l", color: "Celeste", colorHex: "#A9CADA", talla: "L", piso: 2, vendidas30: 1 }),
    esta,
    prenda({ varianteId: "a-m", color: "Celeste", colorHex: "#A9CADA", talla: "M", almacen: 3, vendidas30: 2 }),
    prenda({ varianteId: "b-s", color: "Azul claro", colorHex: "no-es-un-color", talla: "S", piso: 2, vendidas30: 1 }),
    prenda({ varianteId: "otro", productoId: "p2", color: "Rojo", talla: "XL", piso: 9 }),
  ];

  it("las tallas en orden de tienda, el color de la prenda primero, y nada de otro modelo", () => {
    const g = grillaDelModelo(esta, modelo)!;
    expect(g.tallas).toEqual(["S", "M", "L"]);
    expect(g.filas.map((f) => f.color)).toEqual(["Celeste", "Azul claro"]);
    expect(g.filas[0].celdas.map((c) => [c.tiene, c.clase])).toEqual([
      [1, "poco"],
      [3, ""],
      [2, ""],
    ]);
    expect(g.filas[1].celdas.map((c) => [c.tiene, c.clase])).toEqual([
      [2, ""],
      [0, "falta"],
      [0, "cero"],
    ]);
  });

  it("cada celda dice lo que queda y lo vendido; la que no está en los datos, «no hay»", () => {
    const g = grillaDelModelo(esta, modelo)!;
    expect(g.filas[0].celdas[0].tip).toBe("Celeste · S: queda 1 · se vendieron 5");
    expect(g.filas[0].celdas[1].tip).toBe("Celeste · M: quedan 3 · se vendieron 2");
    expect(g.filas[1].celdas[1].tip).toBe("Azul claro · M: no queda · se vendieron 3");
    expect(g.filas[1].celdas[0].tip).toBe("Azul claro · S: quedan 2 · se vendió 1");
    expect(g.filas[1].celdas[2].tip).toBe("Azul claro · L: no hay");
  });

  it("el punto de color sale de un hex válido de cualquiera de sus tallas; si ninguno lo es, sin punto", () => {
    const g = grillaDelModelo(esta, modelo)!;
    expect(g.filas[0].punto).toBe("#a9cada");
    expect(g.filas[1].punto).toBe("#80a0d4");
    const sinHex = grillaDelModelo(prenda({ varianteId: "x", talla: "S" }), [prenda({ varianteId: "y", talla: "M" })])!;
    expect(sinHex.filas[0].punto).toBeNull();
  });

  it("con una sola talla y un solo color no hay grilla; con dos colores de talla única, sí", () => {
    expect(grillaDelModelo(esta, [esta])).toBeNull();
    expect(grillaDelModelo(esta, [])).toBeNull();
    const unica = prenda({ varianteId: "u1", color: "Blanco", talla: "Estándar", piso: 9, vendidas30: 7 });
    const g = grillaDelModelo(unica, [unica, prenda({ varianteId: "u2", color: "Rosa", talla: "Estándar", vendidas30: 4 })])!;
    expect(g.tallas).toEqual(["Estándar"]);
    expect(g.filas.map((f) => [f.color, f.celdas[0].clase])).toEqual([
      ["Blanco", ""],
      ["Rosa", "falta"],
    ]);
  });

  it("dos variantes con la misma talla y el mismo color se suman", () => {
    const g = grillaDelModelo(esta, [esta, prenda({ varianteId: "a-s2", color: "Celeste", talla: "S", piso: 2, vendidas30: 1 }), prenda({ varianteId: "a-m", talla: "M" })])!;
    expect(g.filas[0].celdas[0]).toMatchObject({ tiene: 3, vendio: 6 });
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

  it("«Pedir a …»: solo si se acaba, otra tienda la tiene y la cuenta puede pedir (la que más tiene)", () => {
    const p = prenda({ vendidas30: 5, otras: [{ sedeId: "s2", stock: 1, vendidas30: 0 }, { sedeId: "s3", stock: 4, vendidas30: 0 }] });
    expect(sedeParaPedir(p, "comprar", SEDES, TODO)?.ciudad).toBe("Lima");
    expect(sedeParaPedir(p, "comprar", SEDES, { pedir: false })).toBeNull();
    expect(sedeParaPedir(p, "liquidar", SEDES, TODO)).toBeNull();
    expect(sedeParaPedir(prenda({ vendidas30: 5 }), "comprar", SEDES, TODO)).toBeNull();
  });
});
