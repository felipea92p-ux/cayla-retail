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

describe("diferencia con el general", () => {
  it("dice cuánto más o menos", () => {
    expect(fraseDiferencia(129.9, 119.9)).toBe("S/ 10.00 más que el general (+8 %)");
    expect(fraseDiferencia(109.9, 119.9)).toBe("S/ 10.00 menos que el general (−8 %)");
    expect(fraseDiferencia(119.9, 119.9)).toBe("igual que el general");
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
    expect(falta({ monto: "119.90" })).toEqual(["precio"]); // igual al general: la base dice «ya es el precio general»
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
  const nombres = new Map([["aqp", "Tienda Arequipa"], ["lim", "Tienda Lima"]]);
  it("junta por prenda las tiendas con otro precio, una vez por tienda y precio", () => {
    const r = preciosDeTiendaPorProducto(
      [{ productoId: "blusa", varianteIds: ["b1", "b2"] }, { productoId: "falda", varianteIds: ["f1"] }],
      { aqp: { b1: 129.9, b2: 129.9 }, lim: { b1: 109.9 } },
      nombres,
    );
    expect(r).toEqual({ blusa: [{ sede: "Arequipa", precio: 129.9 }, { sede: "Lima", precio: 109.9 }] });
  });
  it("la insignia cuenta el general más los de tienda y dice cuáles", () => {
    expect(insigniaPrecios([{ sede: "Arequipa", precio: 129.9 }])).toEqual({ texto: "2 precios", detalle: "Otro precio en Arequipa S/ 129.90" });
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
