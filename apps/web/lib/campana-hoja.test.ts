import { describe, expect, it } from "vitest";
import { categoriasDeLaHoja, ejemplosDeCaja, familiasConMarcadas, nombreSinSku, pasoDeDescuento, piezasDelMosaico, textoDuracion, unSoloEnvio } from "./campana-hoja";
import { parsearDescuento } from "./etiqueta-campana";

describe("pasoDeDescuento (− y + de la hoja de campaña)", () => {
  it("sube y baja de 5 en 5", () => {
    expect(pasoDeDescuento("10", 5)).toBe("15");
    expect(pasoDeDescuento("15", -5)).toBe("10");
  });

  it("un decimal va al múltiplo de 5 más cercano en la dirección del toque", () => {
    expect(pasoDeDescuento("12.5", 5)).toBe("20");
    expect(pasoDeDescuento("12,5", -5)).toBe("10");
    expect(pasoDeDescuento("3", 5)).toBe("10");
  });

  it("vacío (sin descuento) sube a 5 y bajar de 5 vuelve a vacío", () => {
    expect(pasoDeDescuento("", 5)).toBe("5");
    expect(pasoDeDescuento("5", -5)).toBe("");
    expect(pasoDeDescuento("", -5)).toBe("");
  });

  it("no pasa de 100", () => {
    expect(pasoDeDescuento("100", 5)).toBe("100");
    expect(pasoDeDescuento("98", 5)).toBe("100");
  });

  it("lo mal escrito cuenta como cero", () => {
    expect(pasoDeDescuento("abc", 5)).toBe("5");
    expect(pasoDeDescuento("150", -5)).toBe("");
  });

  it("todo lo que devuelve se puede guardar (la misma regla que apaga «Guardar»)", () => {
    for (const texto of ["", "5", "12.5", "33", "97.5", "100", "abc", "-4"]) {
      for (const delta of [5, -5]) expect(parsearDescuento(pasoDeDescuento(texto, delta)).ok).toBe(true);
    }
  });
});

describe("textoDuracion (la temporada en una frase)", () => {
  it("cuenta las dos puntas y dice los días de la semana", () => {
    // El 1 de octubre de 2026 es jueves y el 25, domingo.
    expect(textoDuracion("2026-10-01", "2026-10-25")).toBe("25 días, de jueves a domingo");
  });

  it("un solo día", () => {
    expect(textoDuracion("2026-10-24", "2026-10-24")).toBe("1 día, el sábado");
  });

  it("cruza meses y años", () => {
    expect(textoDuracion("2026-12-26", "2027-01-02")).toBe("8 días, de sábado a sábado");
  });

  it("sin una fecha o con las fechas al revés no dice nada", () => {
    expect(textoDuracion(null, "2026-10-25")).toBeNull();
    expect(textoDuracion("2026-10-01", null)).toBeNull();
    expect(textoDuracion("2026-10-25", "2026-10-01")).toBeNull();
  });
});

describe("categoriasDeLaHoja (la grilla de casillas)", () => {
  const cat = (id: string, nombre: string, familia: string) => ({ id, nombre, familia });
  const categorias = [
    cat("vest", "Vestidos", "Indumentaria"),
    cat("blus", "Camisas y Blusas", "Indumentaria"),
    cat("polo", "Polos", "Indumentaria"),
    cat("falda", "Faldas", "Indumentaria"),
    cat("abri", "Abrigos", "Indumentaria"),
    cat("bols", "Bolsos y Carteras", "Accesorios y Complementos"),
    cat("ani", "Anillos", "Bisutería"),
    cat("are", "Aretes", "Bisutería"),
    cat("bolsa", "Bolsas", "Empaque"),
    cat("zap", "Zapatillas", "Calzado"),
  ];
  const prendas = new Map([
    ["vest", 169],
    ["blus", 430],
    ["polo", 339],
    ["falda", 143],
    ["abri", 6],
    ["bols", 38],
    ["ani", 6],
    ["are", 4],
    ["bolsa", 5],
  ]);

  it("familias de la que más trae a la que menos, y sus categorías igual", () => {
    const r = categoriasDeLaHoja(categorias, prendas);
    expect(r.grandes.map((g) => g.familia)).toEqual(["Indumentaria"]);
    expect(r.grandes[0].categorias.map((c) => c.nombre)).toEqual(["Camisas y Blusas", "Polos", "Vestidos", "Faldas", "Abrigos"]);
    expect(r.grandes[0].total).toBe(1087);
  });

  it("las familias chicas comparten fila, y las categorías sin prendas van aparte", () => {
    const r = categoriasDeLaHoja(categorias, prendas);
    expect(r.chicas.map((g) => g.familia)).toEqual(["Accesorios y Complementos", "Bisutería", "Empaque"]);
    expect(r.sinPrendas.map((c) => c.nombre)).toEqual(["Zapatillas"]);
    expect(r.coinciden).toBe(10);
  });

  it("la barra se mide contra la categoría más grande de todas, aunque se busque", () => {
    expect(categoriasDeLaHoja(categorias, prendas).mayor).toBe(430);
    expect(categoriasDeLaHoja(categorias, prendas, "bol").mayor).toBe(430);
  });

  it("busca sin tildes ni mayúsculas, por la categoría o por su familia", () => {
    const bol = categoriasDeLaHoja(categorias, prendas, "BOL");
    expect([...bol.chicas, ...bol.grandes].flatMap((g) => g.categorias.map((c) => c.nombre))).toEqual(["Bolsos y Carteras", "Bolsas"]);
    expect(bol.coinciden).toBe(2);
    const bisu = categoriasDeLaHoja(categorias, prendas, "bisuteria");
    expect(bisu.chicas.map((g) => g.familia)).toEqual(["Bisutería"]);
    expect(bisu.chicas[0].categorias).toHaveLength(2);
  });

  // /chaos y /formidable del 2026-10-23: la casilla «Toda la familia Indumentaria» marcaba solo las categorías con prendas (13 de 18
  // en local) y Poleras quedaba sin descuento sin que nada lo dijera.
  it("«Toda la familia» es toda: también sus categorías sin prendas y las que no coinciden con lo buscado", () => {
    const conPoleras = [...categorias, cat("pole", "Poleras", "Indumentaria")];
    const r = categoriasDeLaHoja(conPoleras, prendas);
    expect([...r.grandes[0].todas].sort()).toEqual(["abri", "blus", "falda", "pole", "polo", "vest"]);
    expect(r.sinPrendas.map((c) => c.nombre)).toEqual(["Poleras", "Zapatillas"]);
    const buscado = categoriasDeLaHoja(conPoleras, prendas, "faldas");
    const indumentaria = [...buscado.grandes, ...buscado.chicas].find((g) => g.familia === "Indumentaria");
    expect(indumentaria?.categorias.map((c) => c.nombre)).toEqual(["Faldas"]);
    expect(indumentaria?.todas).toHaveLength(6);
  });

  it("sin coincidencias no deja nada", () => {
    const r = categoriasDeLaHoja(categorias, prendas, "zzz");
    expect(r.coinciden).toBe(0);
    expect([...r.grandes, ...r.chicas, ...r.sinPrendas]).toHaveLength(0);
  });
});

describe("piezasDelMosaico (las categorías en la etiqueta)", () => {
  const cats = Array.from({ length: 14 }, (_, i) => ({ id: `c${i}`, nombre: `Cat ${String(i).padStart(2, "0")}` }));
  const prendas = new Map(cats.map((c, i) => [c.id, i * 10]));

  it("solo las elegidas, de la que más trae a la que menos", () => {
    const r = piezasDelMosaico(cats, new Set(["c1", "c5", "c3"]), prendas);
    expect(r.piezas.map((p) => p.id)).toEqual(["c5", "c3", "c1"]);
    expect(r.piezas[0].prendas).toBe(50);
    expect(r.mas).toBe(0);
  });

  it("si no caben, la última es «+N»", () => {
    const r = piezasDelMosaico(cats, new Set(cats.map((c) => c.id)), prendas);
    expect(r.piezas).toHaveLength(11);
    expect(r.mas).toBe(3);
  });

  it("con justo el cupo, sin «+N»", () => {
    const r = piezasDelMosaico(cats, new Set(cats.slice(0, 12).map((c) => c.id)), prendas);
    expect(r.piezas).toHaveLength(12);
    expect(r.mas).toBe(0);
  });
});

describe("ejemplosDeCaja (cuánto cobra la caja)", () => {
  const prenda = (id: string, categoriaId: string | null, precio: number, enSede: string | null = null) => ({ id, categoriaId, precio, costo: 1, nombre: `Prenda ${id}`, enSede });
  const prendas = [prenda("v1", "vest", 219.9), prenda("b1", "blus", 79.9), prenda("b2", "blus", 69.9), prenda("m1", null, 49.9, "Trujillo")];
  const cuantas = new Map([
    ["vest", 169],
    ["blus", 430],
  ]);

  it("una prenda por categoría elegida, la de más prendas primero, con el precio que cobra la caja", () => {
    const r = ejemplosDeCaja(prendas, new Set(["vest", "blus"]), new Set(), cuantas, 10);
    expect(r.map((e) => e.id)).toEqual(["b1", "v1"]);
    // La caja baja el precio final al múltiplo de 10 céntimos (descuentoUnitarioPorPorcentaje): 79.90 − 10 % = 71.91 → 71.90.
    expect(r[0]).toMatchObject({ antes: 79.9, despues: 71.9 });
    expect(r[1].despues).toBe(197.9);
  });

  it("sin descuento, el precio no cambia", () => {
    expect(ejemplosDeCaja(prendas, new Set(["blus"]), new Set(), cuantas, null)[0]).toMatchObject({ antes: 79.9, despues: 79.9 });
  });

  it("sin categorías, las marcadas a mano, con su tienda", () => {
    const r = ejemplosDeCaja(prendas, new Set(), new Set(["m1"]), cuantas, 20);
    expect(r).toEqual([{ id: "m1", nombre: "Prenda m1", categoriaId: null, enSede: "Trujillo", antes: 49.9, despues: 39.9 }]);
  });

  it("sin nada elegido, ningún ejemplo", () => {
    expect(ejemplosDeCaja(prendas, new Set(), new Set(), cuantas, 10)).toEqual([]);
  });
});

describe("nombreSinSku", () => {
  it("quita el SKU del final y deja lo demás", () => {
    expect(nombreSinSku("Blusa Emma (BLU-0001-CAM-M)")).toBe("Blusa Emma");
    expect(nombreSinSku("Polo (manga corta) Lucía (POL-0002)")).toBe("Polo (manga corta) Lucía");
    expect(nombreSinSku("Vestido Aurora")).toBe("Vestido Aurora");
    expect(nombreSinSku("(SKU)")).toBe("(SKU)");
  });
});

// /chaos del 2026-10-23 (DC-01): tres clics en «Guardar» en el mismo instante mandaban tres PATCH iguales.
describe("unSoloEnvio (el candado de «Guardar»)", () => {
  it("mientras un envío viaja, los clics de más no mandan otro", async () => {
    const envio = unSoloEnvio();
    let llamadas = 0;
    let soltar: () => void = () => {};
    const enviar = () => {
      llamadas++;
      return new Promise<void>((listo) => (soltar = listo));
    };
    const a = envio(enviar);
    void envio(enviar);
    void envio(enviar);
    expect(llamadas).toBe(1);
    soltar();
    await a;
    await envio(async () => {
      llamadas++;
    });
    expect(llamadas).toBe(2);
  });

  it("si el envío falla, el candado se suelta y se puede reintentar", async () => {
    const envio = unSoloEnvio();
    await expect(envio(async () => Promise.reject(new Error("red")))).rejects.toThrow("red");
    let reintento = false;
    await envio(async () => {
      reintento = true;
    });
    expect(reintento).toBe(true);
  });
});

describe("familiasConMarcadas (qué familias abren solas en la grilla plegable)", () => {
  const categorias = [
    { id: "a", familia: "Indumentaria" },
    { id: "b", familia: "Indumentaria" },
    { id: "c", familia: "Bisutería" },
    { id: "d", familia: "Belleza" },
  ];
  it("abren las familias con alguna categoría marcada, y solo esas", () => {
    expect([...familiasConMarcadas(categorias, new Set(["b", "d"]))].sort()).toEqual(["Belleza", "Indumentaria"]);
  });
  it("sin nada marcado, todo empieza plegado", () => {
    expect(familiasConMarcadas(categorias, new Set()).size).toBe(0);
  });
  it("una marca de una categoría que ya no existe no abre nada", () => {
    expect(familiasConMarcadas(categorias, new Set(["zzz"])).size).toBe(0);
  });
});
