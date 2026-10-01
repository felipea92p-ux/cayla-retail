import { describe, expect, it } from "vitest";
import {
  MAX_PRENDAS_POR_CONTEO,
  buscarPrendas,
  indiceDePrendas,
  nombreDePrenda,
  podarElegidas,
  prendaDelLugarDesdeStock,
  prendasDelLugar,
  sumarElegidas,
  textoPrendas,
  type PrendaDelLugar,
} from "./conteo-por-prenda";
import type { FilaStock } from "./inventario-v2";

// Prendas inventadas: ninguna es del catálogo real (un dato real invitaría a copiarlo).
const CATEGORIA: Record<string, string> = { aurora: "Blusas", lino: "Pantalones", emma: "Casacas" };

function prenda(id: string, producto: string, referencia: string, color: string, talla: string, lugares: Partial<Pick<PrendaDelLugar, "enPiso" | "enAlmacen" | "enUbicacion">> = {}): PrendaDelLugar {
  const codigo = `${referencia.slice(0, 3)}-${color.slice(0, 3)}-${talla}`.toUpperCase();
  return {
    varianteId: id,
    productoId: producto,
    referencia,
    sku: codigo,
    codigosBarras: [`77${id.padStart(6, "0")}`],
    color,
    colorHex: "#aabbcc",
    talla,
    categoria: CATEGORIA[producto] ?? null,
    fotoUrl: null,
    enPiso: true,
    enAlmacen: false,
    enUbicacion: true,
    ...lugares,
  };
}

const PRENDAS: PrendaDelLugar[] = [
  prenda("1", "aurora", "Blusa Aurora", "Rosado", "S"),
  prenda("2", "aurora", "Blusa Aurora", "Rosado", "M"),
  prenda("3", "aurora", "Blusa Aurora", "Rosado", "L", { enPiso: false, enAlmacen: true }),
  prenda("4", "aurora", "Blusa Aurora", "Blanco", "M"),
  prenda("5", "lino", "Pantalón Lino", "Beige", "M"),
  prenda("6", "lino", "Pantalón Lino", "Beige", "30"),
  prenda("7", "emma", "Casaca Emma", "Negro", "XL", { enPiso: false, enAlmacen: true }),
];

const ids = (ps: readonly PrendaDelLugar[]) => ps.map((p) => p.varianteId);

describe("prendaDelLugarDesdeStock — solo lo que el buscador necesita, nunca cantidades", () => {
  const fila: FilaStock = {
    varianteId: "v1",
    productoId: "p1",
    sku: "BLU-AUR-ROS-M",
    talla: "M",
    color: "Rosado",
    colorHex: "#f4b",
    referencia: "Blusa Aurora",
    categoria: "Blusas",
    codigosBarras: ["7750001"],
    fotoUrl: null,
    total: 9,
    piso: 4,
    almacen: 5,
    danado: 0,
    apartado: 2,
    disponible: 7,
    pisoDisponible: 3,
    almacenDisponible: 4,
  };

  it("dice dónde hay stock, sin llevar ninguna cantidad", () => {
    const p = prendaDelLugarDesdeStock(fila);
    expect(p).toMatchObject({ varianteId: "v1", enPiso: true, enAlmacen: true, enUbicacion: true });
    expect(Object.keys(p).sort()).not.toEqual(expect.arrayContaining(["total", "piso", "almacen", "apartado", "disponible"]));
    expect(JSON.stringify(p)).not.toMatch(/"(total|piso|almacen|apartado|disponible|danado)"/);
  });

  it("piso y almacén se miran por separado, y 0 o ausente es «no hay»", () => {
    expect(prendaDelLugarDesdeStock({ ...fila, piso: 0, almacen: 3 })).toMatchObject({ enPiso: false, enAlmacen: true });
    expect(prendaDelLugarDesdeStock({ ...fila, piso: 2, almacen: 0 })).toMatchObject({ enPiso: true, enAlmacen: false });
  });

  it("una sede que no separa piso y almacén (Taller: null) solo cuenta como «en la ubicación»", () => {
    expect(prendaDelLugarDesdeStock({ ...fila, piso: null, almacen: null, total: 6 })).toMatchObject({ enPiso: false, enAlmacen: false, enUbicacion: true });
  });

  it("sin stock en ningún lado no está en ninguna parte", () => {
    expect(prendaDelLugarDesdeStock({ ...fila, piso: 0, almacen: 0, total: 0 })).toMatchObject({ enPiso: false, enAlmacen: false, enUbicacion: false });
  });
});

describe("prendasDelLugar — solo lo que la foto del conteo traería", () => {
  it("el piso, el almacén y toda la ubicación ofrecen cada uno lo suyo", () => {
    expect(ids(prendasDelLugar(PRENDAS, "piso_venta"))).toEqual(["1", "2", "4", "5", "6"]);
    expect(ids(prendasDelLugar(PRENDAS, "almacen_tienda"))).toEqual(["3", "7"]);
    expect(ids(prendasDelLugar(PRENDAS, "toda"))).toHaveLength(7);
  });
});

describe("buscarPrendas — el buscador de Existencias, sobre las prendas del lugar", () => {
  const indice = indiceDePrendas(PRENDAS);
  const buscar = (q: string) => ids(buscarPrendas(indice, q));

  it("sin texto no ofrece nada (cientos de variantes no ayudan a elegir una)", () => {
    expect(buscar("")).toEqual([]);
    expect(buscar("   ")).toEqual([]);
  });

  it("«blusa rosado m» encuentra la blusa rosada en M, en el orden que se le ocurra a quien escribe", () => {
    expect(buscar("blusa rosado m")).toEqual(["2"]);
    expect(buscar("m rosado blusa")).toEqual(["2"]);
    expect(buscar("ROSADA blusa M")).toEqual(["2"]);
  });

  it("el nombre solo trae todas sus tallas y colores, juntas", () => {
    expect(buscar("blusa").sort()).toEqual(["1", "2", "3", "4"]);
    expect(buscar("aurora")).toEqual(expect.arrayContaining(["1", "2", "3", "4"]));
  });

  it("una talla suelta es la talla exacta: «m» no trae «Emma»", () => {
    expect(buscar("m").sort()).toEqual(["2", "4", "5"]);
  });

  it("sin tildes ni mayúsculas, y parcial mientras se escribe", () => {
    expect(buscar("pantalon").sort()).toEqual(["5", "6"]);
    expect(buscar("PANTALÓN")).toHaveLength(2);
    expect(buscar("pant")).toHaveLength(2);
  });

  it("encuentra por el código de la etiqueta y por el escaneado, con o sin guiones", () => {
    expect(buscar("BLU-ROS-M")).toEqual(["2"]);
    expect(buscar("blurosm")).toEqual(["2"]);
    expect(buscar("77000004")).toEqual(["4"]);
  });

  it("una prenda que no está en la lista (fuera del lugar) no aparece aunque exista", () => {
    const soloPiso = indiceDePrendas(prendasDelLugar(PRENDAS, "piso_venta"));
    expect(ids(buscarPrendas(soloPiso, "casaca"))).toEqual([]);
    // En el piso no hay ninguna talla L, así que el filtro de Existencias no la lee como talla sino como texto; lo que importa
    // aquí es que la blusa L del ALMACÉN (variante 3) no se ofrece desde el piso.
    expect(ids(buscarPrendas(soloPiso, "blusa rosado l"))).not.toContain("3");
  });

  it("lo que no coincide con nada devuelve vacío, no todo", () => {
    expect(buscar("zzz")).toEqual([]);
    expect(buscar("blusa negro")).toEqual([]);
  });
});

describe("sumarElegidas", () => {
  it("suma sin repetir y conserva el orden en que se eligió", () => {
    expect(sumarElegidas(["a"], ["b", "a", "c"])).toEqual({ elegidas: ["a", "b", "c"], sobraron: 0 });
  });

  it("no pasa del tope y dice cuántas no entraron, en vez de callarlo", () => {
    expect(sumarElegidas(["a", "b"], ["c", "d", "e"], 3)).toEqual({ elegidas: ["a", "b", "c"], sobraron: 2 });
  });

  it("lo repetido no cuenta como «sobró», aunque ya esté en el tope", () => {
    expect(sumarElegidas(["a", "b"], ["a", "b"], 2)).toEqual({ elegidas: ["a", "b"], sobraron: 0 });
  });

  it("el tope por defecto cabe en una URL", () => {
    expect(MAX_PRENDAS_POR_CONTEO * 37).toBeLessThan(4_000);
    const muchas = Array.from({ length: MAX_PRENDAS_POR_CONTEO + 5 }, (_, i) => `id${i}`);
    const r = sumarElegidas([], muchas);
    expect(r.elegidas).toHaveLength(MAX_PRENDAS_POR_CONTEO);
    expect(r.sobraron).toBe(5);
  });
});

describe("podarElegidas — al cambiar de lugar", () => {
  it("las que no están en el lugar nuevo salen, y se sabe cuáles", () => {
    const piso = new Set(ids(prendasDelLugar(PRENDAS, "piso_venta")));
    expect(podarElegidas(["2", "3", "5", "7"], piso)).toEqual({ quedan: ["2", "5"], quitadas: ["3", "7"] });
  });

  it("si todas siguen, no se quita nada", () => {
    expect(podarElegidas(["1", "2"], new Set(["1", "2", "9"]))).toEqual({ quedan: ["1", "2"], quitadas: [] });
  });
});

describe("textos", () => {
  it("singular y plural", () => {
    expect(textoPrendas(1)).toBe("1 prenda");
    expect(textoPrendas(12)).toBe("12 prendas");
  });

  it("el nombre de una prenda omite lo que falta", () => {
    expect(nombreDePrenda({ referencia: "Blusa Aurora", color: "Rosado", talla: "M" })).toBe("Blusa Aurora · Rosado · M");
    expect(nombreDePrenda({ referencia: "Cinturón", color: null, talla: null })).toBe("Cinturón");
  });
});
