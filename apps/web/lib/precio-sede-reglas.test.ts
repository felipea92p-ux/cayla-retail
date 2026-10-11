import { describe, expect, it } from "vitest";
import { sePuedeConfirmar } from "./guia-campos";
import {
  camposPonerPrecio,
  conPreciosDeSede,
  conPrecioDeLaSede,
  textoPonerPrecio,
  avisoEtiquetasDeTraslado,
  prendasConOtroPrecio,
  insigniaPrecios,
  preciosDeTiendaPorProducto,
  etiquetaPrecioDeSede,
  leerPreciosEnSede,
  desdeHace,
  fraseDiferencia,
  leerMonto,
  leerPreciosDeSede,
  muyLejos,
  tiendasLibres,
  preciosEnCadaTienda,
  precioUnico,
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
    expect(fraseDiferencia(129.9, 119.9)).toBe("S/ 10.00 más que el precio de la prenda (+8 %)");
    expect(fraseDiferencia(109.9, 119.9)).toBe("S/ 10.00 menos que el precio de la prenda (−8 %)");
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
        { productoId: "blusa", varianteIds: ["b1", "b2"], preciosPrenda: { desde: 119.9, hasta: 119.9 } },
        { productoId: "falda", varianteIds: ["f1"], preciosPrenda: { desde: 59.9, hasta: 59.9 } },
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
    expect(insigniaPrecios(lista)).toEqual({ texto: "2 precios", detalle: "AQP y LIM S/ 79.90 · TRU S/ 69.90" });
  });
  it("con precio por talla, la tienda sin precio propio es un rango y cuenta aparte (no se esconde detrás del más barato)", () => {
    const r = preciosDeTiendaPorProducto(
      [{ productoId: "falda", varianteIds: ["s", "xl"], preciosPrenda: { desde: 79.9, hasta: 89.9 } }],
      { aqp: { xl: 79.9 } },
      nombres,
    );
    expect(r.falda).toEqual([{ sede: "AQP", precio: 79.9 }, { sede: "LIM", precio: 79.9, hasta: 89.9 }, { sede: "TRU", precio: 79.9, hasta: 89.9 }]);
    expect(insigniaPrecios(r.falda)).toEqual({ texto: "2 precios", detalle: "AQP S/ 79.90 · LIM y TRU S/ 79.90–89.90" });
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
    expect(avisoEtiquetasAlCambiar(3, "Tienda AQP", 69.9)).toBe("En Tienda AQP hay 3 prendas con la etiqueta de S/ 69.90: cámbiales la etiqueta.");
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
