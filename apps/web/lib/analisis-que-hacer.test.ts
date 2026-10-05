import { describe, expect, it } from "vitest";
import type { DatosPeriodo, FilaComparacion } from "./resumen-comparacion";
import { analizarDesempeno, dividirPeriodo } from "./resumen-desempeno";
import type { Lectura } from "./resumen-lectura";
import {
  accionesDelDetalle,
  accionPrincipal,
  agruparPrendas,
  calcularCifrasAccion,
  enlacesDeMarcadas,
  grupoDeTalla,
  grupoMostrado,
  mejorTiendaParaPedir,
  ordenarPrendas,
  tendenciaPrenda,
  ventasPorTalla,
  type AccesoAnalisis,
  type GrupoQueHacer,
  type RedVariante,
  type TallaAnalisis,
} from "./analisis-que-hacer";

// Análisis conectado (ADR-0245): de la lectura de cada talla a su grupo de «Qué hacer», de las tallas a la prenda, y de la
// prenda al botón que lleva a la pantalla que hace el trabajo. Lo que se prueba: que los grupos salen de las lecturas de
// siempre (no de reglas nuevas), que ningún botón promete algo que no se puede hacer (bajar sin almacén, pedir a quien no
// tiene) y que cada enlace lleva una unidad por talla (ADR-0231: nunca cantidades sugeridas).

const M30 = dividirPeriodo({ desde: "2026-09-01", hasta: "2026-09-30" });
const periodo = (o: Partial<DatosPeriodo> = {}): DatosPeriodo => ({
  ventas: 0,
  devoluciones: 0,
  importe: 0,
  costoVentas: 0,
  costoDevoluciones: 0,
  unidadesSinCosto: 0,
  entradas: 0,
  stockInicio: 0,
  stockCierre: 0,
  diasConStock: 15,
  pisoPromedio: 0,
  totalPromedio: 0,
  ...o,
});

function fila(o: {
  id: string;
  producto?: string;
  color?: string;
  talla?: string;
  a?: Partial<DatosPeriodo>;
  b?: Partial<DatosPeriodo>;
  hoy?: { piso: number; almacen: number } | null;
  costo?: number | null;
}): FilaComparacion {
  return {
    varianteId: o.id,
    productoId: o.producto ?? "p1",
    productoCodigo: null,
    productoEstado: "activo",
    referencia: "Blusa Carlita",
    categoriaId: "c1",
    categoria: "Blusas",
    sku: o.id,
    codigo: null,
    codigosBarras: [],
    talla: o.talla ?? "M",
    colorCodigo: o.color ?? "BL",
    color: o.color === "NE" ? "Negro" : "Blanco",
    colorHex: null,
    costo: o.costo === undefined ? 40 : o.costo,
    estadoCosto: "oficial",
    ledgerConsistente: true,
    a: periodo(o.a),
    b: periodo(o.b),
    ultimaVentaEn: null,
    pisoExpuestoDesdeUltimaVentaDias: null,
    pisoEventos: [],
    stockActualPisoAlmacen: o.hoy === undefined ? { piso: 1, almacen: 0 } : o.hoy,
  };
}
const lectura = (regla: Lectura["regla"]): Lectura => ({ regla, texto: regla, tono: "neutro", detalle: "" });
const talla = (f: FilaComparacion, grupo: GrupoQueHacer): TallaAnalisis => ({ x: analizarDesempeno(f, M30), lectura: lectura("sin_cambio"), grupo });

const TODO: AccesoAnalisis = { bajar: true, traslados: true, pedir: true, compras: true, produccion: true, productos: true, existencias: true };
const NADA: AccesoAnalisis = { bajar: false, traslados: false, pedir: false, compras: false, produccion: false, productos: false, existencias: false };

describe("grupoDeTalla: los grupos salen de las lecturas de siempre", () => {
  const x = (hoy: { piso: number; almacen: number } | null) => analizarDesempeno(fila({ id: "v", hoy }), M30);
  it("agotada, estancamiento y recién colgada van a su grupo", () => {
    expect(grupoDeTalla(x(null), lectura("agotada"), false)).toBe("agotada");
    expect(grupoDeTalla(x(null), lectura("estancamiento"), false)).toBe("estancada");
    expect(grupoDeTalla(x(null), lectura("reposicion_reciente"), false)).toBe("sinbase");
    expect(grupoDeTalla(x(null), lectura("datos_insuficientes"), false)).toBe("sinbase");
  });
  it("«Duerme en almacén» solo si HOY hay algo en el almacén que bajar", () => {
    expect(grupoDeTalla(x({ piso: 0, almacen: 3 }), lectura("problema_reposicion"), false)).toBe("duerme");
    expect(grupoDeTalla(x({ piso: 1, almacen: 4 }), lectura("sobrestock"), false)).toBe("duerme");
    expect(grupoDeTalla(x({ piso: 2, almacen: 0 }), lectura("sobrestock"), false)).toBe("otras");
    expect(grupoDeTalla(x(null), lectura("problema_reposicion"), false)).toBe("otras");
  });
  it("saludable solo es «Las que más venden» si está entre las más vendidas; cifras estimadas no entran a ningún grupo", () => {
    expect(grupoDeTalla(x(null), lectura("saludable"), true)).toBe("top");
    expect(grupoDeTalla(x(null), lectura("saludable"), false)).toBe("otras");
    expect(grupoDeTalla(x(null), lectura("estimada"), true)).toBe("otras");
    expect(grupoDeTalla(x(null), null, true)).toBe("otras");
  });
});

describe("agruparPrendas: modelo + color, como Existencias", () => {
  const tallas = [
    talla(fila({ id: "m", talla: "M", b: { ventas: 3, importe: 270 }, hoy: { piso: 0, almacen: 2 } }), "agotada"),
    talla(fila({ id: "s", talla: "S", a: { ventas: 1 }, b: { ventas: 1 }, hoy: { piso: 2, almacen: 1 } }), "otras"),
    talla(fila({ id: "n", color: "NE", talla: "L", hoy: { piso: 3, almacen: 0 } }), "estancada"),
  ];
  const prendas = agruparPrendas(tallas, M30);

  it("junta las tallas del mismo color, en el orden de las tallas, y suma lo vendido", () => {
    expect(prendas).toHaveLength(2);
    const blanca = prendas.find((p) => p.color === "Blanco")!;
    expect(blanca.tallas.map((t) => t.x.fila.talla)).toEqual(["S", "M"]);
    expect(blanca.vendidas).toBe(5);
    expect(blanca.importe).toBe(270);
    expect(blanca.hoy).toEqual({ piso: 2, almacen: 3 });
  });
  it("el grupo de la prenda es el más urgente de sus tallas", () => {
    expect(prendas.find((p) => p.color === "Blanco")!.grupo).toBe("agotada");
    expect(prendas.find((p) => p.color === "Negro")!.grupo).toBe("estancada");
  });
  it("con un filtro, la fila habla del grupo filtrado", () => {
    const blanca = prendas.find((p) => p.color === "Blanco")!;
    expect(grupoMostrado(blanca, "otras")).toBe("otras");
    expect(grupoMostrado(blanca, "estancada")).toBe("agotada"); // no tiene tallas estancadas: su propio grupo
  });
  it("«Piden algo primero» ordena por urgencia", () => {
    expect(ordenarPrendas(prendas, "urgencia").map((p) => p.grupo)).toEqual(["agotada", "estancada"]);
  });
  it("hoy desconocido si una talla no separa piso y almacén", () => {
    const [p] = agruparPrendas([talla(fila({ id: "a", hoy: null }), "otras"), talla(fila({ id: "b", talla: "L" }), "otras")], M30);
    expect(p!.hoy).toBeNull();
  });
});

describe("tendenciaPrenda", () => {
  it("compara ventas por día de las dos mitades con los umbrales de siempre", () => {
    const t = [talla(fila({ id: "a", a: { ventas: 2 }, b: { ventas: 6 } }), "otras")];
    const r = tendenciaPrenda(t, M30);
    expect(r?.direccion).toBe("alza");
    expect(r?.variacionPct).toBeCloseTo(200);
  });
  it("con menos de 4 unidades no afirma nada", () => {
    expect(tendenciaPrenda([talla(fila({ id: "a", a: { ventas: 1 }, b: { ventas: 2 } }), "otras")], M30)).toBeNull();
  });
});

describe("accionPrincipal: el botón que conviene y que se puede usar", () => {
  const red: Record<string, RedVariante> = {
    m: {
      tiendas: [
        { id: "aqp", nombre: "AQP", libre: 2 },
        { id: "lim", nombre: "LIM", libre: 5 },
      ],
      origen: "produccion",
    },
    l: { tiendas: [{ id: "aqp", nombre: "AQP", libre: 1 }], origen: "produccion" },
  };
  const prendaAgotada = (almacen: number) =>
    agruparPrendas([talla(fila({ id: "m", hoy: { piso: 0, almacen } }), "agotada"), talla(fila({ id: "l", talla: "L", hoy: { piso: 0, almacen: 0 } }), "agotada")], M30)[0]!;

  it("se agotó con almacén → Colgar en el piso, solo las tallas con almacén, una unidad cada una", () => {
    const a = accionPrincipal(prendaAgotada(2), "agotada", red, TODO);
    expect(a).toMatchObject({ clave: "bajar", href: "/inventario/bajar?lineas=m:1" });
  });
  it("se agotó sin almacén → pedir a la tienda que cubre más tallas (AQP tiene M y L; LIM solo M)", () => {
    const a = accionPrincipal(prendaAgotada(0), "agotada", red, TODO);
    expect(a).toMatchObject({ clave: "pedir", texto: "Pedir a AQP", origen: { id: "aqp", nombre: "AQP" } });
    expect(a && a.clave === "pedir" ? a.lineas.map((l) => [l.varianteId, l.cantidad]) : []).toEqual([
      ["m", 1],
      ["l", 1],
    ]);
  });
  it("sin nadie que tenga → Reponer según cómo se abastece; sin acceso a nada, ningún botón", () => {
    expect(accionPrincipal(prendaAgotada(0), "agotada", {}, TODO)).toBeNull();
    expect(accionPrincipal(prendaAgotada(0), "agotada", { m: { tiendas: [], origen: "produccion" } }, TODO)).toMatchObject({
      clave: "reponer",
      href: "/produccion/ordenes?nueva=1",
    });
    expect(accionPrincipal(prendaAgotada(0), "agotada", { m: { tiendas: [], origen: "compra" } }, TODO)).toMatchObject({ clave: "reponer", href: "/compras/nueva" });
    expect(accionPrincipal(prendaAgotada(2), "agotada", red, NADA)).toBeNull();
  });
  it("estancada: traslada lo del almacén; si todo está colgado, rebaja con etiquetas", () => {
    const conAlmacen = agruparPrendas([talla(fila({ id: "e", hoy: { piso: 3, almacen: 2 } }), "estancada")], M30)[0]!;
    const colgada = agruparPrendas([talla(fila({ id: "e", hoy: { piso: 3, almacen: 0 } }), "estancada")], M30)[0]!;
    expect(accionPrincipal(conAlmacen, "estancada", {}, TODO)).toMatchObject({ clave: "trasladar", href: "/inventario/mover?lineas=e:1" });
    expect(accionPrincipal(colgada, "estancada", {}, TODO)).toMatchObject({ clave: "rebajar", href: "/etiquetas-de-precio?variantes=e" });
  });
  it("vende bien: solo si una talla se está cortando y tiene almacén", () => {
    const corta = agruparPrendas([talla(fila({ id: "t", hoy: { piso: 1, almacen: 3 } }), "top")], M30)[0]!;
    const cubierta = agruparPrendas([talla(fila({ id: "t", hoy: { piso: 4, almacen: 3 } }), "top")], M30)[0]!;
    expect(accionPrincipal(corta, "top", {}, TODO)).toMatchObject({ clave: "bajar" });
    expect(accionPrincipal(cubierta, "top", {}, TODO)).toBeNull();
  });
});

describe("accionesDelDetalle y marcadas", () => {
  const p = agruparPrendas([talla(fila({ id: "m", hoy: { piso: 0, almacen: 2 } }), "agotada")], M30)[0]!;
  it("la principal primero y sin repetirla; historial y Existencias solo con acceso", () => {
    const claves = accionesDelDetalle(p, "agotada", {}, TODO).map((a) => a.clave);
    expect(claves[0]).toBe("bajar");
    expect(claves.filter((c) => c === "bajar")).toHaveLength(1);
    expect(claves).toEqual(expect.arrayContaining(["trasladar", "rebajar", "historial", "existencias"]));
    expect(accionesDelDetalle(p, "agotada", {}, NADA).map((a) => a.clave)).toEqual(["rebajar"]);
  });
  it("las marcadas llevan una unidad por talla y solo lo que se puede bajar", () => {
    const otra = agruparPrendas([talla(fila({ id: "x", producto: "p2", hoy: { piso: 2, almacen: 0 } }), "otras")], M30)[0]!;
    expect(enlacesDeMarcadas([p, otra], TODO)).toEqual({
      bajar: "/inventario/bajar?lineas=m:1",
      trasladar: "/inventario/mover?lineas=m:1",
      etiquetas: "/etiquetas-de-precio?variantes=m,x",
      tallas: 2,
    });
    expect(enlacesDeMarcadas([otra], TODO).bajar).toBeNull();
  });
});

describe("cifras de acción", () => {
  it("cuenta prendas por grupo, las que piden algo, lo quieto y lo que salen las tallas", () => {
    const tallas = [
      talla(fila({ id: "a", b: { ventas: 2, stockCierre: 0 } }), "agotada"),
      talla(fila({ id: "b", talla: "L", b: { stockCierre: 5 } }), "estancada"),
      talla(fila({ id: "c", producto: "p2", talla: "S", b: { ventas: 4, stockCierre: 2 } }), "top"),
    ];
    const prendas = agruparPrendas(tallas, M30);
    const c = calcularCifrasAccion(tallas, prendas);
    expect(c.grupos).toMatchObject({ agotada: 1, estancada: 1, top: 1 });
    expect(c.pidenAlgo).toBe(1);
    expect(c.quieto).toEqual({ unidades: 5, costo: 200 });
    expect(ventasPorTalla(tallas)).toEqual([
      { talla: "S", unidades: 4 },
      { talla: "M", unidades: 2 },
    ]);
  });
  it("sin costo confiable, lo quieto se dice en unidades", () => {
    const tallas = [talla(fila({ id: "b", costo: null, b: { stockCierre: 5 } }), "estancada")];
    expect(calcularCifrasAccion(tallas, agruparPrendas(tallas, M30)).quieto).toEqual({ unidades: 5, costo: null });
  });
});

describe("mejorTiendaParaPedir", () => {
  it("sin nadie con stock libre, no hay a quién pedir", () => {
    const t = [talla(fila({ id: "m" }), "agotada")];
    expect(mejorTiendaParaPedir(t, { m: { tiendas: [{ id: "aqp", nombre: "AQP", libre: 0 }], origen: null } })).toBeNull();
  });
});
