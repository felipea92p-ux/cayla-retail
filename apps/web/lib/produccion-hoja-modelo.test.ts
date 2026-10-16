import { describe, expect, it } from "vitest";
import { filasPorModelo, seVendioYYaNoHay, sugerenciaDeOrden, type FilaModelo } from "./produccion-decisiones";
import type { DemandaVariante } from "./produccion-decision-reglas";
import { aclaracionDeLaBase, fraseDeLaFalta, hojaDelModelo, matrizDeLaHoja, materialesDelModelo, hrefVerEnExistencias, lineaDeOrigen, ordenesDelModelo, prendasPorFabricar, textoDeEntrega, SIN_COLOR, SIN_TALLA } from "./produccion-hoja-modelo";
import type { DemandaDeSede } from "./produccion-por-tienda";

// Una variante: [id, talla, color, hex, stockRed, ventasNetas, stockTaller]
type V = [string, string | null, string | null, string | null, number, number, number?];

const dem = (v: V): DemandaVariante => ({
  varianteId: v[0],
  productoId: "p1",
  stockRed: v[4],
  stockTaller: v[6] ?? 0,
  enCamino: 0,
  ritmoDia: v[5] > 0 ? v[5] / 30 : null,
  sedesConRitmo: v[5] > 0 ? 1 : 0,
  ventasNetas: v[5],
  ventasBase: v[5],
  cobertura: { tipo: "medida", dias: 10 },
  banda: "critica",
});

const fila = (vs: V[]): FilaModelo =>
  filasPorModelo(
    vs.map(dem),
    [{ productoId: "p1", referencia: "Blusa Encaje", variantesIds: vs.map((v) => v[0]), variantes: vs.map((v) => ({ varianteId: v[0], talla: v[1], color: v[2], colorHex: v[3] })) }],
    {}
  )[0];

describe("hojaDelModelo (la hoja «Ver el modelo» de Producción, tarea #8)", () => {
  const modelo = fila([
    ["a", "M", "Negro", "#111111", 3, 5],
    ["b", "S", "Negro", "#111111", 0, 7],
    ["c", "L", "Negro", "#111111", 2, 1],
    ["d", "S", "Beige", "#d8c3a5", 4, 0],
    ["e", "M", "Beige", "#d8c3a5", 0, 2],
  ]);
  const h = hojaDelModelo(modelo);

  it("las tallas van en orden de curva (no en el orden en que llegaron) y los colores por nombre", () => {
    expect(h.tallas).toEqual(["S", "M", "L"]);
    expect(h.colores.map((c) => c.nombre)).toEqual(["Beige", "Negro"]);
  });
  it("cada celda dice lo vendido y lo que queda, alineada con su talla; donde ese color no se hace en esa talla es null", () => {
    expect(h.colores[1].celdas).toEqual([
      { ventas: 7, stock: 0 }, // Negro S: se vendió y ya no hay
      { ventas: 5, stock: 3 },
      { ventas: 1, stock: 2 },
    ]);
    expect(h.colores[0].celdas).toEqual([{ ventas: 0, stock: 4 }, { ventas: 2, stock: 0 }, null]);
  });
  it("«se vendió y ya no hay» pide MÁS ventas que el umbral de poca base: con 2 ventas y stock 0 no, con 3 sí (la misma regla que el aviso de la fila)", () => {
    // Beige M: 2 ventas y 0 en tiendas → ruido, no se marca (ADR-0346).
    expect(seVendioYYaNoHay(2, 0)).toBe(false);
    expect(seVendioYYaNoHay(3, 0)).toBe(true);
    expect(seVendioYYaNoHay(40, 1)).toBe(false); // con stock no es «ya no hay»
    const marcadas = h.colores.flatMap((c) => c.celdas.map((x) => x && seVendioYYaNoHay(x.ventas, x.stock)));
    expect(marcadas.filter(Boolean)).toHaveLength(1); // solo Negro S
  });
  it("los totales por color, por talla y del modelo suman lo mismo por cualquier camino", () => {
    expect(h.colores.map((c) => [c.nombre, c.ventas, c.stock])).toEqual([["Beige", 2, 4], ["Negro", 13, 5]]);
    expect(h.porTalla).toEqual([
      { ventas: 7, stock: 4 }, // S
      { ventas: 7, stock: 3 }, // M
      { ventas: 1, stock: 2 }, // L
    ]);
    expect(h.total).toEqual({ ventas: 15, stock: 9 });
    expect(h.porTalla.reduce((s, t) => s + t.ventas, 0)).toBe(h.total.ventas);
    expect(h.colores.reduce((s, c) => s + c.ventas, 0)).toBe(h.total.ventas);
  });
  it("el total de ventas de la hoja es la suma de las ventas netas de las variantes del modelo", () => {
    expect(h.total.ventas).toBe(modelo.variantes.reduce((s, v) => s + v.ventasNetas, 0));
    expect(h.total.stock).toBe(modelo.stockRed);
  });
  it("conserva lo que el Resumen ya sabía del modelo (estado, stock, ritmo, lo que falta) y quita las variantes: no se mandan dos veces", () => {
    expect(h).toMatchObject({ productoId: "p1", referencia: "Blusa Encaje", estado: modelo.estado, stockRed: 9, ritmoDia: modelo.ritmoDia, ventasBase: 15, producir: modelo.producir, trasladar: modelo.trasladar });
    expect("variantes" in h).toBe(false);
  });

  describe("color y foto", () => {
    it("la foto y el hex de cada color vienen del catálogo; sin catálogo, el hex de la variante y sin foto (se dibuja su mosaico, nunca un hueco)", () => {
      const conCatalogo = hojaDelModelo(modelo, [{ nombre: "Negro", hex: "#000000", fotoUrl: "https://x/negro.jpg" }]);
      expect(conCatalogo.colores.find((c) => c.nombre === "Negro")).toMatchObject({ hex: "#000000", fotoUrl: "https://x/negro.jpg" });
      expect(conCatalogo.colores.find((c) => c.nombre === "Beige")).toMatchObject({ hex: "#d8c3a5", fotoUrl: null });
      expect(h.colores.find((c) => c.nombre === "Negro")).toMatchObject({ hex: "#111111", fotoUrl: null });
    });
    it("una foto es de SU color: la de otro color del catálogo no se le pega", () => {
      const r = hojaDelModelo(modelo, [{ nombre: "Rojo", hex: "#aa0000", fotoUrl: "https://x/rojo.jpg" }]);
      expect(r.colores.every((c) => c.fotoUrl === null)).toBe(true);
    });
    it("sin color en la variante no inventa uno: «Sin color», al final, y sin hex", () => {
      const r = hojaDelModelo(fila([["a", "M", null, null, 1, 4], ["b", "M", "Azul", "#0000aa", 1, 1]]));
      expect(r.colores.map((c) => c.nombre)).toEqual(["Azul", SIN_COLOR]);
      expect(r.colores[1].hex).toBeNull();
    });
  });

  describe("tallas raras", () => {
    it("sin talla va al final y se dice «Sin talla»", () => {
      const r = hojaDelModelo(fila([["a", null, "Negro", null, 0, 1], ["b", "M", "Negro", null, 0, 1]]));
      expect(r.tallas).toEqual(["M", SIN_TALLA]);
    });
    it("las tallas numéricas van por número, no como texto (28, 30, 32, no 28, 30, 4)", () => {
      const r = hojaDelModelo(fila([["a", "32", "Azul", null, 0, 1], ["b", "28", "Azul", null, 0, 1], ["c", "30", "Azul", null, 0, 1]]));
      expect(r.tallas).toEqual(["28", "30", "32"]);
    });
    it("dos variantes de la misma talla y color suman, no se pisan", () => {
      const r = hojaDelModelo(fila([["a", "M", "Negro", null, 1, 2], ["b", "M", "Negro", null, 2, 3]]));
      expect(r.colores[0].celdas[0]).toEqual({ ventas: 5, stock: 3 });
    });
  });

  describe("sin datos de venta", () => {
    it("un modelo sin ventas ni stock arma su matriz en cero, sin romper ni dividir", () => {
      const r = hojaDelModelo(fila([["a", "M", "Negro", null, 0, 0], ["b", "L", "Negro", null, 0, 0]]));
      expect(r.total).toEqual({ ventas: 0, stock: 0 });
      expect(r.colores[0].celdas.every((c) => c && !seVendioYYaNoHay(c.ventas, c.stock))).toBe(true);
    });
    it("un modelo sin variantes tiene una hoja vacía pero válida", () => {
      const r = hojaDelModelo({ ...modelo, variantes: [] });
      expect(r).toMatchObject({ tallas: [], colores: [], porTalla: [], total: { ventas: 0, stock: 0 } });
    });
  });

  describe("el traslado", () => {
    const conTaller = fila([["a", "M", "Negro", null, 0, 30, 40]]);
    it("con prendas en el Taller que cubren lo que falta, la hoja lleva a Mover mercadería con el Taller y la cantidad puestos", () => {
      expect(hojaDelModelo(conTaller, [], "T1").hrefTrasladar).toBe("/inventario/mover?origen=T1&lineas=a:30");
    });
    it("sin Taller conocido o sin nada que trasladar no hay enlace", () => {
      expect(hojaDelModelo(conTaller, [], null).hrefTrasladar).toBeNull();
      expect(hojaDelModelo(modelo, [], "T1").hrefTrasladar).toBeNull();
    });
  });

  describe("«Abrir orden sugerida»", () => {
    it("con base y algo que fabricar la hoja ofrece la orden sugerida; con poca base o sin nada que fabricar, la orden vacía", () => {
      const conBase = fila([["a", "M", "Negro", null, 0, 6]]); // 6 ventas: hay base
      expect(hojaDelModelo(conBase).sugerida).toBe(true);
      expect(hojaDelModelo(fila([["a", "M", "Negro", null, 0, 2]])).sugerida).toBe(false); // 2 ventas: poca base
      expect(hojaDelModelo(fila([["a", "M", "Negro", null, 90, 6]])).sugerida).toBe(false); // el stock alcanza: nada que fabricar
    });
    it("coincide con lo que dice la tarjeta: el mismo modelo, la misma respuesta", () => {
      const m = fila([["a", "M", "Negro", null, 0, 6], ["b", "S", "Negro", null, 0, 4]]);
      expect(hojaDelModelo(m).sugerida).toBe(sugerenciaDeOrden(m) !== null);
    });
  });

  it("es serializable (va de la página al navegador): solo JSON plano, sin funciones, Map, Set, undefined ni números que no son números", () => {
    const h = hojaDelModelo(modelo, [{ nombre: "Negro", hex: "#000000", fotoUrl: null }], "T1");
    expect(esJsonPlano(h)).toBe(true);
    expect(esJsonPlano(hojaDelModelo(modelo, [], null))).toBe(true);
    // La propia comprobación no está ciega: rechaza lo que Next no sabe mandar al navegador.
    expect(esJsonPlano({ a: undefined })).toBe(false);
    expect(esJsonPlano({ a: new Map() })).toBe(false);
    expect(esJsonPlano({ a: () => 1 })).toBe(false);
    expect(esJsonPlano({ a: NaN })).toBe(false);
    expect(esJsonPlano([new Set([1])])).toBe(false);
  });
});

/** ¿Es JSON plano? null, texto, booleano, número finito, listas y objetos simples de lo mismo. `JSON.stringify` descarta en silencio un `undefined` o una función, así que no sirve para saberlo. */
function esJsonPlano(v: unknown): boolean {
  if (v === null || typeof v === "string" || typeof v === "boolean") return true;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.every(esJsonPlano);
  if (typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) return Object.values(v as object).every(esJsonPlano);
  return false;
}

describe("fraseDeLaFalta", () => {
  const f = (trasladar: number, producir: number, extra: Partial<Parameters<typeof fraseDeLaFalta>[0]> = {}) =>
    fraseDeLaFalta({ estado: "producir_ya", ventasBase: 30, trasladar, producir, enProduccionContada: 0, ...extra });
  it("lo que falta se reparte en lo que ya está en el Taller y lo que hay que fabricar", () => {
    expect(f(5, 24)).toBe("Para cubrir 30 días de venta faltan 29: 5 ya están en el Taller y se trasladan; 24 hay que fabricarlas.");
  });
  it("solo trasladar, o solo fabricar, no nombra la parte que no existe", () => {
    expect(f(31, 0)).toBe("Para cubrir 30 días de venta faltan 31: 31 ya están en el Taller y se trasladan.");
    expect(f(0, 20)).toBe("Para cubrir 30 días de venta faltan 20: 20 hay que fabricarlas.");
  });
  it("en singular cuando falta una", () => {
    expect(f(0, 1)).toBe("Para cubrir 30 días de venta falta 1: 1 hay que fabricarla.");
    expect(f(1, 0)).toBe("Para cubrir 30 días de venta falta 1: 1 ya está en el Taller y se traslada.");
  });
  it("dice que ya contó las órdenes abiertas SOLO si de verdad se descontaron (en una variante que no se vende no se descuenta nada)", () => {
    expect(f(0, 29, { enProduccionContada: 1 })).toBe("Para cubrir 30 días de venta faltan 29: 29 hay que fabricarlas. Ya cuenta lo que hay en órdenes abiertas.");
    expect(f(0, 10, { enProduccionContada: 20 })).toContain("Ya cuenta lo que hay en órdenes abiertas.");
    expect(f(0, 10, { enProduccionContada: 0 })).not.toContain("órdenes abiertas");
  });
  it("si no falta nada no hay frase", () => {
    expect(f(0, 0)).toBeNull();
    expect(f(0, 0, { enProduccionContada: 40 })).toBeNull();
  });
  it("si el consejo del modelo no es fabricar («Alcanza», «Sobrestock», sin ritmo) no dice «hay que fabricar»: sería lo contrario de lo que aconseja", () => {
    for (const estado of ["alcanza", "sobrestock", "sin_ritmo"] as const) expect(f(5, 24, { estado })).toBeNull();
    for (const estado of ["producir_ya", "trasladar", "en_produccion", "vigilar"] as const) expect(f(5, 24, { estado })).not.toBeNull();
  });
  it("con poca base no dice cuánto fabricar (ruido, ADR-0346); lo que ya está en el Taller sí", () => {
    expect(f(0, 24, { ventasBase: 2 })).toBeNull();
    expect(f(5, 24, { ventasBase: 2 })).toBe("Para cubrir 30 días de venta faltan 5: 5 ya están en el Taller y se trasladan.");
    expect(f(0, 24, { ventasBase: 3 })).not.toBeNull();
  });
});

describe("aclaracionDeLaBase (la cabecera y el total de la matriz no cuentan las mismas ventas)", () => {
  const a = (ritmoDia: number | null, ventasBase: number, ventas: number) => aclaracionDeLaBase({ ritmoDia, ventasBase, total: { ventas, stock: 0 } });
  it("si el ritmo se midió con menos ventas que las de la matriz, lo dice con los dos números", () => {
    expect(a(0.4, 12, 15)).toBe("El ritmo de arriba se midió con 12 de estas 15 ventas: las de las tiendas donde se pudo medir.");
  });
  it("si coinciden, o no hay ritmo, no dice nada", () => {
    expect(a(0.4, 15, 15)).toBeNull();
    expect(a(null, 0, 15)).toBeNull();
  });
});


describe("la hoja con lo de cada tienda (marca, proveedor, tiendas, órdenes, insumos)", () => {
  const modelo = fila([
    ["a", "M", "Negro", "#111111", 3, 5],
    ["b", "S", "Negro", "#111111", 0, 7],
    ["d", "S", "Beige", "#d8c3a5", 4, 0],
  ]);
  // Llegan en orden CONTRARIO a lo que venden (Trujillo 0, Arequipa 2, Lima 10): si la hoja las ordenara por ventas, el orden de salida cambiaría.
  const sedes: DemandaDeSede[] = [
    { id: "tru", nombre: "Tienda Trujillo", tipo: "tienda", porVariante: {} },
    { id: "taller", nombre: "Taller", tipo: "taller", porVariante: { a: { ventas: 0, stock: 9, enCamino: 0, ritmoDia: null, ventasBase: 0 } } },
    { id: "aqp", nombre: "Tienda Arequipa", tipo: "tienda", porVariante: { a: { ventas: 2, stock: 1, enCamino: 0, ritmoDia: null, ventasBase: 0 }, d: { ventas: 0, stock: 4, enCamino: 0, ritmoDia: null, ventasBase: 0 } } },
    { id: "lim", nombre: "Tienda Lima", tipo: "tienda", porVariante: { a: { ventas: 3, stock: 2, enCamino: 1, ritmoDia: 0.1, ventasBase: 3 }, b: { ventas: 7, stock: 0, enCamino: 0, ritmoDia: 0.23, ventasBase: 7 } } },
  ];
  const h = hojaDelModelo(modelo, [], null, { sedes, precios: [49.9, 59.9, 0], ficha: { codigo: "BLU-0042", descripcion: null, marca: "Cayla", proveedor: "Textil Sur", tejido: null, patron: "Liso", temporada: null } });

  it("deja las tiendas y no el Taller (el Taller no vende: va en «En el Taller»), y no las ordena por lo que venden: salen en el orden en que llegan", () => {
    expect(h.tiendas.map((t) => t.id)).toEqual(["tru", "aqp", "lim"]);
  });
  it("cada tienda suma SUS ventas, su stock y lo que le viene; una que no tiene nada del modelo sigue en la lista con ceros", () => {
    const lim = h.tiendas.find((t) => t.id === "lim")!;
    expect([lim.ventas, lim.stock, lim.enCamino]).toEqual([10, 2, 1]);
    expect(lim.ritmoDia).toBeCloseTo(0.33, 2);
    expect(lim.dias).toBeCloseTo(2 / 0.33, 0);
    expect(h.tiendas.find((t) => t.id === "tru")).toMatchObject({ ventas: 0, stock: 0, enCamino: 0, ritmoDia: null, dias: null });
  });
  it("una tienda sin ritmo medido no inventa días", () => {
    const aqp = h.tiendas.find((t) => t.id === "aqp")!;
    expect(aqp.ritmoDia).toBeNull();
    expect(aqp.dias).toBeNull();
    expect(aqp.ventas).toBe(2); // las ventas se cuentan igual; solo el ritmo no se afirma
  });
  it("la matriz de una tienda tiene las mismas filas, columnas y huecos que la de la red", () => {
    const red = matrizDeLaHoja(h, null);
    const lim = matrizDeLaHoja(h, "lim");
    expect(lim.colores.map((c) => c.nombre)).toEqual(red.colores.map((c) => c.nombre));
    expect(lim.colores.map((c) => c.celdas.map((x) => x === null))).toEqual(red.colores.map((c) => c.celdas.map((x) => x === null)));
    // Negro (M y S) en Lima: la M vendió 3 y tiene 2; la S vendió 7 y tiene 0
    const negro = lim.colores.find((c) => c.nombre === "Negro")!;
    expect(negro.celdas).toEqual([{ ventas: 7, stock: 0 }, { ventas: 3, stock: 2 }]);
    expect(lim.total).toEqual({ ventas: 10, stock: 2 });
    expect(lim.porTalla.reduce((a, t) => a + t.ventas, 0)).toBe(lim.total.ventas);
  });
  it("la suma de las tiendas da la cifra de la red (las cifras son las mismas, solo partidas)", () => {
    const porTiendas = h.tiendas.reduce((a, t) => ({ ventas: a.ventas + t.ventas, stock: a.stock + t.stock }), { ventas: 0, stock: 0 });
    expect(porTiendas).toEqual({ ventas: 12, stock: 7 });
  });
  it("una tienda que no existe devuelve la matriz de la red, no un error", () => {
    expect(matrizDeLaHoja(h, "no-existe")).toEqual(matrizDeLaHoja(h, null));
  });
  it("«Ver en Existencias» abre la tienda que más tiene de ese color y su primera talla CON stock, no la primera de la curva ni el Taller", () => {
    const negro = h.colores.find((c) => c.nombre === "Negro")!; // a = M Negro, b = S Negro; Lima tiene 2 en M y 0 en S
    expect(negro.dondeVerlo).toEqual({ ubicacionId: "lim", varianteId: "a" });
    const beige = h.colores.find((c) => c.nombre === "Beige")!; // d = S Beige: solo Arequipa tiene (4)
    expect(beige.dondeVerlo).toEqual({ ubicacionId: "aqp", varianteId: "d" });
  });
  it("con prendas del color en varias tiendas gana la que más tiene, sin importar el orden en que llegan", () => {
    const una = fila([["a", "M", "Negro", "#111111", 6, 5, 0]]);
    const tienda = (id: string, stock: number): DemandaDeSede => ({ id, nombre: id, tipo: "tienda", porVariante: { a: { ventas: 1, stock, enCamino: 0, ritmoDia: null, ventasBase: 0 } } });
    expect(hojaDelModelo(una, [], "taller", { sedes: [tienda("poca", 1), tienda("mucha", 5)] }).colores[0].dondeVerlo).toEqual({ ubicacionId: "mucha", varianteId: "a" });
    expect(hojaDelModelo(una, [], "taller", { sedes: [tienda("mucha", 5), tienda("poca", 1)] }).colores[0].dondeVerlo).toEqual({ ubicacionId: "mucha", varianteId: "a" });
  });
  it("sin stock en tiendas, el Taller (la primera talla de la curva que tenga); sin stock en ninguna sede, nada: el enlace va a la lista y no a una talla que no abre", () => {
    const enTaller = fila([["m", "M", "Negro", "#111111", 0, 5, 6], ["s", "S", "Negro", "#111111", 0, 5, 3]]); // S y M del Taller
    const solo = hojaDelModelo(enTaller, [], "taller", { sedes: [] });
    expect(solo.colores[0].dondeVerlo).toEqual({ ubicacionId: null, varianteId: "s" }); // S va antes que M en la curva
    const sinNada = fila([["a", "M", "Negro", "#111111", 0, 5, 0]]);
    expect(hojaDelModelo(sinNada, [], "taller", { sedes: [] }).colores[0].dondeVerlo).toBeNull();
    expect(hrefVerEnExistencias(null)).toBe("/inventario");
    expect(hrefVerEnExistencias({ ubicacionId: null, varianteId: "v 1" })).toBe("/inventario?variante=v%201");
    expect(hrefVerEnExistencias({ ubicacionId: "lim", varianteId: "a" })).toBe("/inventario?ubicacion=lim&variante=a");
  });
  it("el precio sale de las variantes con precio (un 0 no baja el mínimo) y la ficha viaja tal cual", () => {
    expect([h.precioMin, h.precioMax]).toEqual([49.9, 59.9]);
    expect(h.ficha?.proveedor).toBe("Textil Sur");
    expect(hojaDelModelo(modelo).ficha).toBeNull(); // sin leer: null, nunca una ficha vacía que diga «sin registrar»
    expect(hojaDelModelo(modelo).precioMin).toBeNull();
  });
});

describe("órdenes y materiales del modelo", () => {
  const orden = (id: string, o: Partial<Parameters<typeof ordenesDelModelo>[0][number]> = {}) => ({ id, productoId: "p1", estado: "en_proceso", esMuestra: false, cantidadPlan: 20, etapas: {}, fechaEntrega: null as string | null, ...o });
  it("solo las abiertas del modelo, la que se entrega antes primero y sin fecha al final; dice en qué etapa va", () => {
    const r = ordenesDelModelo(
      [orden("sin"), orden("tarde", { fechaEntrega: "2026-11-01" }), orden("pronto", { fechaEntrega: "2026-10-15", etapas: { corte: "hecho" } }), orden("otra", { productoId: "p2" }), orden("cerrada", { estado: "terminada" })],
      "p1",
      "2026-10-13",
    );
    expect(r.map((o) => o.id)).toEqual(["pronto", "tarde", "sin"]);
    expect(r[0].etapa).toBe("Confección");
    expect(r[0].entrega).toEqual({ tipo: "pronto", dias: 2 });
    expect(r[2].entrega).toEqual({ tipo: "sin_fecha" });
  });
  it("la entrega se dice como se lee: hoy, mañana, en N días, vencida, o la fecha si hay tiempo", () => {
    const t = (entrega: Parameters<typeof textoDeEntrega>[0]["entrega"], fechaEntrega: string | null = "2026-11-20") => textoDeEntrega({ entrega, fechaEntrega });
    expect(t({ tipo: "sin_fecha" }, null)).toBe("Sin fecha de entrega");
    expect(t({ tipo: "vencida", dias: 1 })).toBe("Vencida hace 1 día");
    expect(t({ tipo: "vencida", dias: 4 })).toBe("Vencida hace 4 días");
    expect(t({ tipo: "pronto", dias: 0 })).toBe("Se entrega hoy");
    expect(t({ tipo: "pronto", dias: 1 })).toBe("Se entrega mañana");
    expect(t({ tipo: "pronto", dias: 3 })).toBe("Se entrega en 3 días");
    expect(t({ tipo: "holgada", dias: 38 })).toMatch(/^Se entrega el /);
  });
  it("con todas las etapas hechas la orden está «Lista para cerrar»", () => {
    expect(ordenesDelModelo([orden("x", { etapas: { corte: "hecho", confeccion: "hecho", acabado: "hecho" } })], "p1", "2026-10-13")[0].etapa).toBe("Lista para cerrar");
  });
  it("materiales: sin rendimiento medido es null; con él, dice si alcanza para lo que falta y cuántas prendas salen con el saldo", () => {
    expect(materialesDelModelo([], 10, new Map())).toBeNull();
    const rend = [{ insumoId: "t1", insumo: "Popelina", unidad: "metro" as const, tipo: "tela" as const, porPrenda: 1.5, ordenes: 2, prendas: 40 }];
    const m = materialesDelModelo(rend, 10, new Map([["t1", { insumoId: "t1", saldo: 12, porLlegar: 5 }]]))!;
    expect(m.prendas).toBe(10);
    expect(m.lineas[0]).toMatchObject({ insumo: "Popelina", porPrenda: 1.5, necesita: 15, estado: "alcanza_si_llega", prendasConElSaldo: 8 });
    expect(materialesDelModelo(rend, 10, new Map())!.lineas[0]).toMatchObject({ estado: "falta", faltan: 15, prendasConElSaldo: 0 }); // insumo sin saldo conocido: falta, no «alcanza»
  });
  it("las prendas por fabricar siguen la misma regla que la frase de «falta»: poca base no afirma una cantidad", () => {
    const base = { estado: "producir_ya" as const, producir: 12 };
    expect(prendasPorFabricar({ ...base, ventasBase: 30 })).toBe(12);
    expect(prendasPorFabricar({ ...base, ventasBase: 2 })).toBe(0);
    expect(prendasPorFabricar({ estado: "alcanza", producir: 12, ventasBase: 30 })).toBe(0);
  });
});

describe("lineaDeOrigen — marca y proveedor bajo el nombre del modelo", () => {
  it("dice las dos cosas cuando están registradas", () => {
    expect(lineaDeOrigen({ marca: "Cayla", proveedor: "Textil Sur" })).toBe("Marca Cayla · Proveedor Textil Sur");
  });

  it("dice lo que falta, sin esconder lo otro", () => {
    expect(lineaDeOrigen({ marca: "Cayla", proveedor: null })).toBe("Marca Cayla · Sin proveedor");
    expect(lineaDeOrigen({ marca: null, proveedor: "Textil Sur" })).toBe("Sin marca · Proveedor Textil Sur");
    expect(lineaDeOrigen({ marca: null, proveedor: null })).toBe("Sin marca · Sin proveedor");
  });

  it("no afirma «Sin marca» si la ficha no se pudo leer", () => {
    expect(lineaDeOrigen(null)).toBeNull();
  });
});
