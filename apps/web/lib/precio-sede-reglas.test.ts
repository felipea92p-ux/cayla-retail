import { describe, expect, it } from "vitest";
import { sePuedeConfirmar } from "./guia-campos";
import {
  cambioPrecioAqui,
  problemaPrecioAqui,
  camposPonerPrecio,
  conPreciosDeSede,
  conPrecioDeLaSede,
  textoPonerPrecio,
  avisoEtiquetasDeTraslado,
  prendasConOtroPrecio,
  insigniaPrecios,
  preciosDeTiendaPorProducto,
  leerExcepcionesDeSede,
  excepcionesDeLaTienda,
  precioDeLaTiendaPorTalla,
  etiquetaPrecioDeSede,
  leerPreciosEnSede,
  desdeHace,
  fraseDiferencia,
  leerMonto,
  leerPreciosDeSede,
  muyLejos,
  tiendasLibres,
  preciosEnCadaTienda,
  precioEnLaSede,
  precioMasBajoEnTiendas,
  precioPropioMasBajo,
  precioUnico,
  quedaBajoElCosto,
  bajoElCostoSinIgual,
  FRASE_BAJO_COSTO,
  tiendasAlCambiarPrecio,
  avisoEtiquetasAlCambiar,
  unirConY,
} from "./precio-sede-reglas";

describe("leerMonto", () => {
  it("acepta como lo escribe la gente", () => {
    expect(leerMonto("129.90")).toBe(129.9);
    expect(leerMonto("129,90")).toBe(129.9);
    expect(leerMonto("S/ 129.90")).toBe(129.9);
    expect(leerMonto(" 129 ")).toBe(129);
  });
  it("rechaza lo que no es un precio", () => {
    for (const t of ["", "0", "-5", "abc", "12.345", "1.2.3", "1,299.90"]) expect(leerMonto(t)).toBeNull();
  });
});

describe("diferencia con el precio de la prenda", () => {
  it("dice cuánto más o menos, en palabras de tienda (nunca «general»)", () => {
    expect(fraseDiferencia(129.9, 119.9)).toBe("S/\u00a010.00 más que el precio de la prenda (+8 %)");
    expect(fraseDiferencia(109.9, 119.9)).toBe("S/\u00a010.00 menos que el precio de la prenda (−8 %)");
    expect(fraseDiferencia(119.9, 119.9)).toBe("igual que el precio de la prenda");
    expect(fraseDiferencia(100, null)).toBeNull();
  });
  it("avisa pasado el 30 %, en los dos sentidos", () => {
    expect(muyLejos(1299, 119.9)).toBe(true);
    expect(muyLejos(50, 119.9)).toBe(true);
    expect(muyLejos(150, 119.9)).toBe(false);
    expect(muyLejos(null, 119.9)).toBe(false);
  });
});

describe("desdeHace", () => {
  const ahora = new Date(2026, 9, 9, 18, 0);
  it("cuenta días de calendario", () => {
    expect(desdeHace(new Date(2026, 9, 9, 8, 0).toISOString(), ahora)).toBe("desde hoy");
    expect(desdeHace(new Date(2026, 9, 8, 23, 0).toISOString(), ahora)).toBe("desde ayer");
    expect(desdeHace(new Date(2026, 8, 24).toISOString(), ahora)).toBe("desde hace 15 días");
    expect(desdeHace(new Date(2026, 5, 1).toISOString(), ahora)).toBe("desde hace 4 meses");
  });
});

describe("tiendas y precio", () => {
  const precios = leerPreciosDeSede([
    { ubicacion_id: "aqp", sede: "Tienda Arequipa", precio: "129.90", variantes: 6, desde: "2026-10-01", motivo: "Mercado", creado_por_nombre: "Lucía" },
  ]);
  it("lee la fila de la base con el precio como número", () => {
    expect(precios[0].precio).toBe(129.9);
  });
  it("ofrece solo las tiendas que aún no tienen precio propio", () => {
    expect(tiendasLibres([{ id: "aqp" }, { id: "tru" }], precios).map((t) => t.id)).toEqual(["tru"]);
  });
});

describe("la guía de «Precio distinto en una sede»", () => {
  const base: Parameters<typeof camposPonerPrecio>[0] = { tiendaId: "aqp", monto: "129.90", general: 119.9, motivo: "Mercado", responsableListo: true, responsableMotivo: null };
  it("con todo, se puede guardar", () => {
    expect(sePuedeConfirmar(camposPonerPrecio(base))).toBe(true);
  });
  it("lo que falta coincide con lo que la base rechaza", () => {
    const falta = (h: Partial<typeof base>) => camposPonerPrecio({ ...base, ...h }).filter((c) => !c.hecho).map((c) => c.id);
    expect(falta({ tiendaId: null })).toEqual(["tienda"]);
    expect(falta({ monto: "" })).toEqual(["precio"]);
    expect(falta({ monto: "0" })).toEqual(["precio"]);
    expect(falta({ monto: "119.90" })).toEqual(["precio"]); // igual al de la prenda: la base dice «ya es el precio de la prenda»
    expect(camposPonerPrecio({ ...base, monto: "119.90" }).find((c) => c.id === "precio")?.pendiente).toBe("Ese ya es el precio de la prenda: escribe otro.");
    // Con tallas a distinto precio (`general` null) ningún monto es «igual»: la base solo rechaza si TODAS valen eso.
    expect(falta({ monto: "119.90", general: null })).toEqual([]);
    expect(falta({ motivo: "  " })).toEqual(["motivo"]);
    expect(falta({ responsableListo: false })).toEqual(["responsable"]);
  });
  it("bajo el costo SÍ bloquea (Felipe 2026-10-11): la hoja dice lo mismo que la base y deja de bloquear justo en el costo", () => {
    const falta = (h: Partial<typeof base>) => camposPonerPrecio({ ...base, ...h }).filter((c) => !c.hecho).map((c) => c.id);
    expect(falta({ monto: "47.93", costoMaximo: 47.94 })).toEqual(["precio"]);
    expect(camposPonerPrecio({ ...base, monto: "47.93", costoMaximo: 47.94 }).find((c) => c.id === "precio")?.pendiente).toBe(FRASE_BAJO_COSTO);
    expect(falta({ monto: "47.94", costoMaximo: 47.94 })).toEqual([]); // justo en el costo se puede
    expect(falta({ monto: "47.93", costoMaximo: null })).toEqual([]); // quien no ve costos: lo dice la base al guardar
    expect(falta({ monto: "47.93" })).toEqual([]); // sin el dato, igual que antes
  });
  it("igual al precio de la prenda manda sobre el piso: dice «ya es el precio de la prenda», no «bajo el costo»", () => {
    // La prenda (119.90) está bajo un costo de 130 que subió: igualar es quitar, y la base lo permite.
    const pendiente = camposPonerPrecio({ ...base, monto: "119.90", costoMaximo: 130 }).find((c) => c.id === "precio")?.pendiente;
    expect(pendiente).toBe("Ese ya es el precio de la prenda: escribe otro.");
    expect(bajoElCostoSinIgual(119.9, 119.9, 130)).toBe(false);
    expect(bajoElCostoSinIgual(100, 119.9, 130)).toBe(true);
    expect(bajoElCostoSinIgual(100, null, 130)).toBe(true); // con precio por talla no hay «igual»
  });
  it("un precio muy lejos NO bloquea: solo pregunta", () => {
    expect(sePuedeConfirmar(camposPonerPrecio({ ...base, monto: "1299" }))).toBe(true);
  });
});

describe("el precio en una tienda, sobre lo ya leído", () => {
  it("el propio pisa al general; las demás prendas quedan igual", () => {
    const generales = new Map([["a", 79.9], ["b", 59.9]]);
    const propios = leerPreciosEnSede([{ variante_id: "a", precio: "89.90" }, { variante_id: "zz", precio: 10 }]);
    expect([...conPreciosDeSede(generales, propios)]).toEqual([["a", 89.9], ["b", 59.9]]);
  });
  it("sin propios, el general tal cual", () => {
    expect([...conPreciosDeSede(new Map([["a", 79.9]]), new Map())]).toEqual([["a", 79.9]]);
  });
  it("la marca para la colaboradora dice la tienda corta", () => {
    expect(etiquetaPrecioDeSede("Tienda Arequipa")).toBe("Precio de Arequipa");
    expect(etiquetaPrecioDeSede("Taller")).toBe("Precio de Taller");
  });
});

describe("prendas con el precio de una tienda", () => {
  const prendas = [{ id: "a", precio: 79.9 }, { id: "b", precio: 59.9 }];
  it("la que tiene precio propio lo toma; la otra queda igual", () => {
    expect(conPrecioDeLaSede(prendas, { a: 89.9 }, (p) => p.id)).toEqual([{ id: "a", precio: 89.9 }, { id: "b", precio: 59.9 }]);
  });
  it("sin precios propios, el mismo arreglo", () => {
    expect(conPrecioDeLaSede(prendas, undefined, (p) => p.id)).toBe(prendas);
    expect(conPrecioDeLaSede(prendas, {}, (p) => p.id)).toBe(prendas);
  });
});

describe("«2 precios» en Catálogo ▸ Productos", () => {
  const nombres = new Map([["aqp", "Tienda AQP"], ["lim", "Tienda LIM"], ["tru", "Tienda TRU"]]);
  it("da el precio en CADA tienda abierta: el propio o el de la prenda", () => {
    const r = preciosDeTiendaPorProducto(
      [
        { productoId: "blusa", precios: { b1: 119.9, b2: 119.9 } },
        { productoId: "falda", precios: { f1: 59.9 } },
      ],
      { aqp: { b1: 129.9, b2: 129.9 }, tru: {} },
      nombres,
    );
    expect(r).toEqual({
      blusa: [{ sede: "AQP", precio: 129.9 }, { sede: "LIM", precio: 119.9 }, { sede: "TRU", precio: 119.9 }],
    });
  });
  it("FAL-0008: AQP 79.90 (igual a la prenda) y TRU 69.90 son DOS precios, no tres", () => {
    const lista = [{ sede: "AQP", precio: 79.9 }, { sede: "LIM", precio: 79.9 }, { sede: "TRU", precio: 69.9 }];
    expect(insigniaPrecios(lista)).toEqual({ texto: "2 precios", detalle: "AQP y LIM S/\u00a079.90 · TRU S/\u00a069.90" });
  });
  it("con precio por talla, la tienda sin precio propio es un rango y cuenta aparte (no se esconde detrás del más barato)", () => {
    const r = preciosDeTiendaPorProducto(
      [{ productoId: "falda", precios: { s: 79.9, xl: 89.9 } }],
      { aqp: { xl: 79.9 } },
      nombres,
    );
    expect(r.falda).toEqual([{ sede: "AQP", precio: 79.9 }, { sede: "LIM", precio: 79.9, hasta: 89.9 }, { sede: "TRU", precio: 79.9, hasta: 89.9 }]);
    expect(insigniaPrecios(r.falda)).toEqual({ texto: "2 precios", detalle: "AQP S/\u00a079.90 · LIM y TRU S/\u00a079.90–89.90" });
  });
  it("si todas las tiendas venden igual, no hay insignia", () => {
    expect(insigniaPrecios([{ sede: "AQP", precio: 79.9 }, { sede: "LIM", precio: 79.9 }])).toBeNull();
    expect(insigniaPrecios([])).toBeNull();
    expect(insigniaPrecios(undefined)).toBeNull();
  });
  it("tres precios distintos se cuentan tres", () => {
    expect(insigniaPrecios([{ sede: "AQP", precio: 89.9 }, { sede: "LIM", precio: 79.9 }, { sede: "TRU", precio: 69.9 }])?.texto).toBe("3 precios");
  });
  it("junta nombres como se dicen", () => {
    expect(unirConY(["AQP"])).toBe("AQP");
    expect(unirConY(["AQP", "LIM"])).toBe("AQP y LIM");
    expect(unirConY(["AQP", "LIM", "TRU"])).toBe("AQP, LIM y TRU");
  });
});

describe("el piso de costo del precio de una tienda", () => {
  it("por debajo del costo de la talla que más cuesta: sí; justo en el costo: no; sin costo conocido: no", () => {
    expect(quedaBajoElCosto(39.9, 40)).toBe(true);
    expect(quedaBajoElCosto(40, 40)).toBe(false);
    expect(quedaBajoElCosto(40.01, 40)).toBe(false);
    expect(quedaBajoElCosto(30, null)).toBe(false);
    expect(quedaBajoElCosto(null, 40)).toBe(false);
    expect(quedaBajoElCosto(30, 0)).toBe(false);
  });
  it("compara en céntimos, no en coma flotante (47.94 es 47.94)", () => {
    expect(quedaBajoElCosto(79.9 * 0.6, 47.94)).toBe(false); // 47.940000000000005 en flotante
    expect(quedaBajoElCosto(47.93, 47.94)).toBe(true);
  });
  it("la frase no dice cuánto cuesta y manda a la campaña", () => {
    expect(FRASE_BAJO_COSTO).not.toMatch(/\d/);
    expect(FRASE_BAJO_COSTO).toContain("campaña");
  });
});

describe("el precio de una variante en UNA tienda (Dañadas, y las pantallas de una sede)", () => {
  const propios = { s: 69.9 };
  it("el propio si lo tiene; si no, el de la prenda", () => {
    expect(precioEnLaSede(propios, "s", 79.9)).toBe(69.9);
    expect(precioEnLaSede(propios, "m", 79.9)).toBe(79.9);
  });
  it("un precio propio MÁS ALTO que el de la prenda también gana", () => {
    expect(precioEnLaSede({ s: 89.9 }, "s", 79.9)).toBe(89.9);
  });
  it("sin lectura (la RPC falló) o sin variante, el de la prenda; sin ninguno, null", () => {
    expect(precioEnLaSede(undefined, "s", 79.9)).toBe(79.9);
    expect(precioEnLaSede({}, undefined, 79.9)).toBe(79.9);
    expect(precioEnLaSede(propios, "x", null)).toBeNull();
    expect(precioEnLaSede(propios, "x", undefined)).toBeNull();
  });
});

describe("el precio más bajo de una prenda entre las tiendas (aviso de costo de una campaña)", () => {
  const nombres = new Map([["tru", "Tienda Trujillo"], ["aqp", "Tienda Arequipa"]]);
  it("sin precios propios: el de la prenda y ninguna tienda", () => {
    expect(precioMasBajoEnTiendas(79.9, "v1", {}, nombres)).toEqual({ precio: 79.9, sede: null });
    expect(precioMasBajoEnTiendas(79.9, "v1", { tru: { otra: 50 } }, nombres)).toEqual({ precio: 79.9, sede: null });
  });
  it("un propio más bajo gana y dice la tienda en corto", () => {
    expect(precioMasBajoEnTiendas(79.9, "v1", { tru: { v1: 69.9 } }, nombres)).toEqual({ precio: 69.9, sede: "Trujillo" });
  });
  it("un propio más alto no: el peor caso sigue siendo el de la prenda", () => {
    expect(precioMasBajoEnTiendas(79.9, "v1", { tru: { v1: 89.9 } }, nombres)).toEqual({ precio: 79.9, sede: null });
  });
  it("con varias tiendas, la menor", () => {
    expect(precioMasBajoEnTiendas(79.9, "v1", { tru: { v1: 69.9 }, aqp: { v1: 64.9 } }, nombres)).toEqual({ precio: 64.9, sede: "Arequipa" });
  });
  it("un empate con la prenda no nombra tienda", () => {
    expect(precioMasBajoEnTiendas(69.9, "v1", { tru: { v1: 69.9 } }, nombres)).toEqual({ precio: 69.9, sede: null });
  });
  it("una tienda sin nombre en el mapa dice «otra tienda»", () => {
    expect(precioMasBajoEnTiendas(79.9, "v1", { xx: { v1: 50 } }, nombres)).toEqual({ precio: 50, sede: "otra tienda" });
  });
});

describe("el precio propio más bajo de un modelo (margen de Producción, Felipe 2026-10-11)", () => {
  const nombres = new Map([["tru", "Tienda Trujillo"], ["aqp", "Tienda Arequipa"], ["lim", "Tienda Lima"]]);
  it("sin ninguna tienda con precio más bajo: null (el margen sigue con el precio de la prenda)", () => {
    expect(precioPropioMasBajo(79.9, ["v1", "v2"], {}, nombres)).toBeNull();
    expect(precioPropioMasBajo(79.9, ["v1"], { tru: { otra: 50 } }, nombres)).toBeNull();
    expect(precioPropioMasBajo(79.9, ["v1"], { tru: { v1: 89.9 } }, nombres)).toBeNull();
  });
  it("un propio igual al de la prenda no cuenta (no hay nada que nombrar)", () => {
    expect(precioPropioMasBajo(69.9, ["v1"], { tru: { v1: 69.9 } }, nombres)).toBeNull();
  });
  it("la tienda más barata gana y se nombra en corto", () => {
    expect(precioPropioMasBajo(79.9, ["v1"], { tru: { v1: 69.9 } }, nombres)).toEqual({ precio: 69.9, sede: "Trujillo" });
    expect(precioPropioMasBajo(79.9, ["v1"], { tru: { v1: 69.9 }, aqp: { v1: 64.9 } }, nombres)).toEqual({ precio: 64.9, sede: "Arequipa" });
  });
  it("mira todas las tallas: basta que una lo tenga", () => {
    expect(precioPropioMasBajo(79.9, ["v1", "v2", "v3"], { tru: { v3: 59.9 } }, nombres)).toEqual({ precio: 59.9, sede: "Trujillo" });
  });
  it("un empate entre tiendas las nombra juntas, sin repetir una tienda por cada talla", () => {
    expect(precioPropioMasBajo(79.9, ["v1", "v2"], { tru: { v1: 69.9, v2: 69.9 }, aqp: { v1: 69.9 } }, nombres)).toEqual({ precio: 69.9, sede: "Trujillo y Arequipa" });
  });
  it("un precio que no es un monto (0, negativo, NaN) no baja el margen", () => {
    expect(precioPropioMasBajo(79.9, ["v1"], { tru: { v1: 0 }, aqp: { v1: Number.NaN }, lim: { v1: -5 } }, nombres)).toBeNull();
  });
  it("una tienda sin nombre en el mapa dice «otra tienda»", () => {
    expect(precioPropioMasBajo(79.9, ["v1"], { xx: { v1: 50 } }, nombres)).toEqual({ precio: 50, sede: "otra tienda" });
  });
});

describe("la ficha: cada tienda con su precio", () => {
  const tiendas = [{ id: "tru", nombre: "Tienda TRU" }, { id: "aqp", nombre: "Tienda AQP" }, { id: "lim", nombre: "Tienda LIM" }];
  const propio = (ubicacionId: string, sede: string, precio: number) => ({ ubicacionId, sede, precio, variantes: 9, desde: "2026-10-10", motivo: "Mercado", creadoPor: null });
  it("las que tienen precio propio lo muestran; las otras, el de la prenda (nunca «las demás tiendas»)", () => {
    expect(preciosEnCadaTienda(tiendas, [propio("tru", "Tienda TRU", 69.9)], 79.9).map((f) => [f.sede, f.precio, f.propio !== null])).toEqual([
      ["Tienda AQP", 79.9, false],
      ["Tienda LIM", 79.9, false],
      ["Tienda TRU", 69.9, true],
    ]);
  });
  it("una tienda cerrada con precio propio igual aparece", () => {
    expect(preciosEnCadaTienda([], [propio("x", "Tienda Vieja", 50)], 79.9).map((f) => f.sede)).toEqual(["Tienda Vieja"]);
  });
  it("el precio de la prenda es uno solo si todas las tallas valen igual", () => {
    expect(precioUnico([79.9, 79.9])).toBe(79.9);
    expect(precioUnico([79.9, 89.9])).toBeNull();
    expect(precioUnico([])).toBeNull();
  });
});

describe("al cambiar el precio de la prenda, la hoja pregunta por las tiendas", () => {
  const tiendas = [{ id: "tru", nombre: "Tienda TRU" }, { id: "aqp", nombre: "Tienda AQP" }, { id: "lim", nombre: "Tienda LIM" }];
  const propio = (ubicacionId: string, sede: string, precio: number) => ({ ubicacionId, sede, precio, variantes: 2, desde: "2026-10-10", motivo: "Mercado", creadoPor: null });
  const todo = () => true;
  it("agregar o desactivar una talla al mismo precio no es cambiar el precio", () => {
    expect(tiendasAlCambiarPrecio({ propios: [propio("tru", "Tienda TRU", 69.9)], tiendas, antes: [79.9, 79.9], despues: [79.9, 79.9, 79.9], puedeTocar: todo })).toBeNull();
    expect(tiendasAlCambiarPrecio({ propios: [propio("tru", "Tienda TRU", 69.9)], tiendas, antes: [79.9, 79.9, 79.9], despues: [79.9], puedeTocar: todo })).toBeNull();
  });
  it("sin cambio de precio o sin precios propios no pregunta nada", () => {
    expect(tiendasAlCambiarPrecio({ propios: [propio("tru", "Tienda TRU", 69.9)], tiendas, antes: [79.9, 79.9], despues: [79.9, 79.9], puedeTocar: todo })).toBeNull();
    expect(tiendasAlCambiarPrecio({ propios: [], tiendas, antes: [69.9], despues: [79.9], puedeTocar: todo })).toBeNull();
  });
  it("FAL-0008: subir 69.90 → 79.90 con AQP 79.90 y TRU 69.90: AQP se iguala sola, TRU se queda (y se puede igualar), Lima sigue", () => {
    const r = tiendasAlCambiarPrecio({
      propios: [propio("tru", "Tienda TRU", 69.9), propio("aqp", "Tienda AQP", 79.9)],
      tiendas,
      antes: [69.9, 69.9],
      despues: [79.9, 79.9],
      puedeTocar: todo,
    });
    expect(r).toEqual({
      conPropio: [
        { ubicacionId: "aqp", sede: "Tienda AQP", propio: 79.9, que: "se-iguala", puedeIgualar: false },
        { ubicacionId: "tru", sede: "Tienda TRU", propio: 69.9, que: "se-queda", puedeIgualar: true },
      ],
      siguen: ["Tienda LIM"],
      antes: 69.9,
      despues: 79.9,
    });
  });
  it("quien no puede tocar esa tienda la ve, pero no la iguala", () => {
    const r = tiendasAlCambiarPrecio({ propios: [propio("aqp", "Tienda AQP", 89.9)], tiendas, antes: [79.9], despues: [69.9], puedeTocar: (id) => id === "tru" });
    expect(r?.conPropio[0]?.puedeIgualar).toBe(false);
  });
  it("con tallas a distinto precio después, nada «se iguala» solo", () => {
    const r = tiendasAlCambiarPrecio({ propios: [propio("aqp", "Tienda AQP", 79.9)], tiendas, antes: [69.9, 69.9], despues: [79.9, 89.9], puedeTocar: todo });
    expect(r?.conPropio[0]?.que).toBe("se-queda");
    expect(r?.despues).toBeNull();
  });
});

describe("las etiquetas colgadas al cambiar el precio de una tienda", () => {
  it("dice cuántas y con qué precio, en singular y plural", () => {
    expect(avisoEtiquetasAlCambiar(3, "Tienda AQP", 69.9)).toBe("En Tienda AQP hay 3 prendas con la etiqueta de S/\u00a069.90: cámbiales la etiqueta.");
    expect(avisoEtiquetasAlCambiar(1, "Tienda AQP", null)).toBe("En Tienda AQP hay 1 prenda con la etiqueta de antes: cámbiale la etiqueta.");
    expect(avisoEtiquetasAlCambiar(0, "Tienda AQP", 69.9)).toBeNull();
  });
});

describe("traslados: la etiqueta que hay que cambiar", () => {
  const generales = new Map([["a", 79.9], ["b", 59.9], ["c", 49.9]]);
  it("cambia la que vale distinto en destino que en origen, en cualquiera de los dos sentidos", () => {
    expect(prendasConOtroPrecio(["a", "b", "c"], generales, { b: 69.9 }, { a: 89.9, b: 69.9 })).toEqual(["a"]);
    expect(prendasConOtroPrecio(["a", "b"], generales, { a: 89.9 }, undefined)).toEqual(["a"]);
    expect(prendasConOtroPrecio(["a"], generales, undefined, undefined)).toEqual([]);
  });
  it("le habla a quien recibe y a quien envía; a nadie más", () => {
    expect(avisoEtiquetasDeTraslado(3, "Tienda Trujillo", "Tienda Arequipa", "origen")).toBe("3 prendas se venden a otro precio en Arequipa: allá les cambiarán la etiqueta.");
    expect(avisoEtiquetasDeTraslado(1, "Tienda Trujillo", "Tienda Arequipa", "destino")).toBe("1 prenda se vende aquí a otro precio que en Trujillo: al recibirla, cámbiale la etiqueta.");
    expect(avisoEtiquetasDeTraslado(2, "Tienda Trujillo", "Tienda Arequipa", "destino")).toBe("2 prendas se venden aquí a otro precio que en Trujillo: al recibirlas, cámbiales la etiqueta.");
    expect(avisoEtiquetasDeTraslado(2, "Tienda Trujillo", "Tienda Arequipa", "otro")).toBeNull();
    expect(avisoEtiquetasDeTraslado(0, "Tienda Trujillo", "Tienda Arequipa", "destino")).toBeNull();
  });
});

describe("el botón que abre la hoja nombra la tienda si queda una sola", () => {
  it("una libre: la nombra; varias: una u otra; ninguna: sin botón", () => {
    expect(textoPonerPrecio([{ nombre: "Tienda Lima" }], true)).toBe("Precio distinto en Tienda Lima");
    expect(textoPonerPrecio([{ nombre: "Tienda Lima" }, { nombre: "Tienda AQP" }], false)).toBe("Precio distinto en una tienda");
    expect(textoPonerPrecio([{ nombre: "Tienda Lima" }, { nombre: "Tienda AQP" }], true)).toBe("Precio distinto en otra tienda");
    expect(textoPonerPrecio([], true)).toBeNull();
  });
});

// ADR-0415: el precio de una tienda tampoco pasa de S/ 5 000 (la base lo rechaza con `precios_sede_prenda_precio_con_tope`).
describe("el precio de una sede tiene techo", () => {
  const base: Parameters<typeof camposPonerPrecio>[0] = { tiendaId: "aqp", monto: "5990", general: 59.9, motivo: "Mercado", responsableListo: true, responsableMotivo: null };
  it("5990 (el punto que falta) deja el precio por hacer, con la frase del tope", () => {
    const precio = camposPonerPrecio(base).find((c) => c.id === "precio");
    expect(precio?.hecho).toBe(false);
    expect(precio?.pendiente).toMatch(/pasa de S\/ 5000/);
  });
  it("S/ 5 000 justos sí", () => {
    expect(camposPonerPrecio({ ...base, monto: "5000" }).find((c) => c.id === "precio")?.hecho).toBe(true);
  });
});

describe("cambioPrecioAqui: lo que una terminal escribe en la tabla de Precios", () => {
  it("sin tocar, o con el precio que ya vende la tienda, no cambia nada", () => {
    expect(cambioPrecioAqui({ escrito: null, propio: null, general: 89.9 })).toEqual({ que: "nada" });
    expect(cambioPrecioAqui({ escrito: "89.90", propio: null, general: 89.9 })).toEqual({ que: "nada" });
    expect(cambioPrecioAqui({ escrito: "79.9", propio: 79.9, general: 89.9 })).toEqual({ que: "nada" });
  });
  it("otro precio: la tienda pasa a venderlo, y se dice el de antes", () => {
    expect(cambioPrecioAqui({ escrito: "79.90", propio: null, general: 89.9 })).toEqual({ que: "poner", precio: 79.9, antes: 89.9 });
    expect(cambioPrecioAqui({ escrito: "69,90", propio: 79.9, general: 89.9 })).toEqual({ que: "poner", precio: 69.9, antes: 79.9 });
  });
  it("el precio de la prenda sobre un precio propio: vuelve al de la prenda (la base no deja uno igual)", () => {
    expect(cambioPrecioAqui({ escrito: "89.90", propio: 79.9, general: 89.9 })).toEqual({ que: "quitar", antes: 79.9, general: 89.9 });
  });
  it("si el precio cambia según la talla, cualquier monto es un precio propio para todas", () => {
    expect(cambioPrecioAqui({ escrito: "80", propio: null, general: null })).toEqual({ que: "poner", precio: 80, antes: null });
  });
  it("lo que no es un monto no se guarda", () => {
    expect(cambioPrecioAqui({ escrito: "", propio: null, general: 89.9 })).toEqual({ que: "invalido" });
    expect(cambioPrecioAqui({ escrito: "0", propio: null, general: 89.9 })).toEqual({ que: "invalido" });
  });
  it("problemaPrecioAqui dice lo que la base rechazaría", () => {
    expect(problemaPrecioAqui({ que: "invalido" }, "Tienda TRU", 89.9, null)).toMatch(/TRU/);
    expect(problemaPrecioAqui({ que: "poner", precio: 30, antes: 89.9 }, "Tienda TRU", 89.9, 40)).toBe(FRASE_BAJO_COSTO);
    expect(problemaPrecioAqui({ que: "poner", precio: 9000, antes: 89.9 }, "Tienda TRU", 89.9, null)).not.toBeNull();
    expect(problemaPrecioAqui({ que: "poner", precio: 79.9, antes: 89.9 }, "Tienda TRU", 89.9, 40)).toBeNull();
    expect(problemaPrecioAqui({ que: "quitar", antes: 79.9, general: 89.9 }, "Tienda TRU", 89.9, 95)).toBeNull();
  });
});

describe("«N precios» con excepciones por combinación (Felipe 2026-10-28)", () => {
  const nombres = new Map([["aqp", "Tienda AQP"], ["tru", "Tienda TRU"]]);
  it("una tienda con una sola talla distinta vende «de menor a mayor», no el precio de la primera talla que se encuentre", () => {
    // La blusa vale 119.90 en sus tres tallas; en TRU solo la M tiene otro precio (129.90).
    const r = preciosDeTiendaPorProducto([{ productoId: "blusa", precios: { s: 119.9, m: 119.9, l: 119.9 } }], { tru: { m: 129.9 } }, nombres);
    expect(r.blusa).toEqual([{ sede: "AQP", precio: 119.9 }, { sede: "TRU", precio: 119.9, hasta: 129.9 }]);
    expect(insigniaPrecios(r.blusa)).toEqual({ texto: "2 precios", detalle: "AQP S/\u00a0119.90 · TRU S/\u00a0119.90–129.90" });
  });
  it("el precio de la primera talla que se encuentre ya no decide por toda la prenda (el orden de las tallas no cambia el resultado)", () => {
    const a = preciosDeTiendaPorProducto([{ productoId: "p", precios: { s: 100, m: 100 } }], { tru: { m: 120 } }, nombres);
    const b = preciosDeTiendaPorProducto([{ productoId: "p", precios: { m: 100, s: 100 } }], { tru: { m: 120 } }, nombres);
    expect(a).toEqual(b);
    expect(a.p.find((t) => t.sede === "TRU")).toEqual({ sede: "TRU", precio: 100, hasta: 120 });
  });
  it("todas las tallas con precio propio en la tienda siguen siendo UN precio (el precio de la prenda en esa tienda)", () => {
    const r = preciosDeTiendaPorProducto([{ productoId: "p", precios: { s: 100, m: 100 } }], { tru: { s: 90, m: 90 } }, nombres);
    expect(r.p).toEqual([{ sede: "AQP", precio: 100 }, { sede: "TRU", precio: 90 }]);
  });
  it("sin ningún precio propio, la prenda no aparece; una talla que no se vende no cuenta", () => {
    expect(preciosDeTiendaPorProducto([{ productoId: "p", precios: { s: 100 } }], { tru: {} }, nombres)).toEqual({});
    expect(preciosDeTiendaPorProducto([{ productoId: "p", precios: { s: 100 } }], { tru: { inactiva: 50 } }, nombres)).toEqual({});
    expect(preciosDeTiendaPorProducto([{ productoId: "p", precios: {} }], { tru: { s: 50 } }, nombres)).toEqual({});
  });
});

describe("las excepciones por combinación de la ficha", () => {
  const fila = { variante_id: "v1", ubicacion_id: "tru", sede: "Tienda TRU", precio: "159.90", desde: "2026-10-28T10:00:00Z", motivo: "Recepción ENV-001282", creado_por_nombre: "Ana Pérez" };
  it("se leen tal cual y se descartan las filas sin combinación, sin tienda o con un precio que no es un monto", () => {
    expect(leerExcepcionesDeSede([fila])).toEqual([{ varianteId: "v1", ubicacionId: "tru", sede: "Tienda TRU", precio: 159.9, desde: "2026-10-28T10:00:00Z", motivo: "Recepción ENV-001282", creadoPor: "Ana Pérez" }]);
    expect(leerExcepcionesDeSede([{ ...fila, variante_id: "" }, { ...fila, ubicacion_id: "" }, { ...fila, precio: "abc" }, { ...fila, precio: 0 }])).toEqual([]);
    expect(leerExcepcionesDeSede(null)).toEqual([]);
    expect(leerExcepcionesDeSede(undefined)).toEqual([]);
  });
  it("las de una tienda", () => {
    const todas = leerExcepcionesDeSede([fila, { ...fila, variante_id: "v2", ubicacion_id: "aqp" }]);
    expect(excepcionesDeLaTienda(todas, "tru").map((e) => e.varianteId)).toEqual(["v1"]);
    expect(excepcionesDeLaTienda(todas, "lim")).toEqual([]);
  });
  it("con excepciones, el precio de la tienda ya no es uno solo («según la talla»); sin ellas es el de la prenda", () => {
    const e = leerExcepcionesDeSede([fila]);
    expect(precioDeLaTiendaPorTalla(119.9, e)).toEqual({ unico: false, precio: null });
    expect(precioDeLaTiendaPorTalla(119.9, [])).toEqual({ unico: true, precio: 119.9 });
    expect(precioDeLaTiendaPorTalla(null, [])).toEqual({ unico: false, precio: null });
  });
});
