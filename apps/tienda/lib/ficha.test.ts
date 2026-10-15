import { describe, expect, it } from "vitest";
import {
  campanaDeLaFicha,
  chipCampana,
  colorInicial,
  esIdDePrenda,
  faltaParaTerminar,
  fotosDelColor,
  interpretarFicha,
  notaDeTalla,
  precioDeLaFicha,
  tallaDelPrecio,
  tallasDelColor,
  type Ficha,
} from "./ficha";

const TRU = "f775651f-62c8-4ff4-a414-b5614026d0cd";
const LIM = "2d97d322-8a0a-4cd5-99c4-70e52b9c01db";
const T = { S: "96c0560a-1612-4fde-8ef7-d6aeab8c75c8", M: "1cfc459c-03e1-42d4-b950-a2a744da887a", L: "da3b908f-27d0-41a7-89e0-e002c79655a7" };
const FOTO = (n: string) => `https://x.supabase.co/storage/v1/object/public/retail-productos-fotos/fotos/${n}.jpg`;
const CAMPANA = { id: "5a5a5a5a-1111-4222-8333-444444444444", nombre: "Aniversario CAYLA", pct: 20, hasta: "2026-10-21" };
const variante = (id: string, color: string, talla: string, tru: unknown, lim: unknown, total: unknown, campana: unknown = null) => ({
  id,
  color,
  talla,
  precio: 79.9,
  precio_final: campana ? 63.9 : 79.9,
  campana,
  stock: { [TRU]: tru, [LIM]: lim },
  total,
});
// Una ficha tal como la devuelve `retail.tienda_ficha(p_producto, p_sede)` (20261015012000).
const BASE = {
  sede: null,
  umbral: 3,
  sedes: [
    { id: LIM, nombre: "Lima" },
    { id: TRU, nombre: "Trujillo" },
  ],
  prenda: {
    id: "3f0e8a8e-2f1b-4c3e-9a55-111111111111",
    codigo: "CMS-0001",
    nombre: "Blusa Emma",
    descripcion: "Lino liviano que cae bien",
    categoria: { nombre: "Camisas y Blusas", prefijo: "CMS" },
    precio: 79.9,
    precio_final: 63.9,
    desde: true,
    campana: CAMPANA,
    colores: [
      { codigo: "NEG", nombre: "Negro", hex: "#2D2C2F", foto: null },
      { codigo: "BEI", nombre: "Beige", hex: "#D5BA98", foto: FOTO("bei") },
    ],
    tallas: [
      { id: T.S, nombre: "S" },
      { id: T.M, nombre: "M" },
      { id: T.L, nombre: "L" },
    ],
    fotos: [
      { url: FOTO("principal"), color: null },
      { url: FOTO("bei"), color: "BEI" },
    ],
    variantes: [
      variante("00000000-0000-4000-8000-000000000001", "NEG", T.S, 3, 0, 3, CAMPANA),
      variante("00000000-0000-4000-8000-000000000002", "NEG", T.M, "hay", 2, "hay", CAMPANA),
      variante("00000000-0000-4000-8000-000000000003", "NEG", T.L, 0, 0, 0, CAMPANA),
      variante("00000000-0000-4000-8000-000000000004", "BEI", T.S, 1, 0, 1),
      variante("00000000-0000-4000-8000-000000000005", "BEI", T.M, 0, 1, 1),
    ],
  },
};
const ficha = interpretarFicha(BASE) as Ficha;

describe("interpretarFicha", () => {
  it("lee lo que devuelve la base, en camelCase", () => {
    expect(ficha).toMatchObject({ nombre: "Blusa Emma", precio: 79.9, precioFinal: 63.9, desde: true, umbral: 3, sede: null });
    expect(ficha.sedes.map((s) => s.nombre)).toEqual(["Lima", "Trujillo"]);
    expect(ficha.variantes).toHaveLength(5);
    expect(ficha.variantes[1]).toMatchObject({ precioFinal: 63.9, total: "hay", stock: { [TRU]: "hay", [LIM]: 2 } });
  });

  it("null de la base es «no está»; una respuesta sin forma de ficha, null (no se pudo cargar)", () => {
    expect(interpretarFicha(null)).toBe("no_esta");
    for (const raro of [undefined, "x", 3, {}, { prenda: null }, { ...BASE, prenda: { ...BASE.prenda, colores: [] } }]) {
      expect(interpretarFicha(raro)).toBeNull();
    }
  });

  it("una talla con un dato raro —o una cifra de 4 o más— se deja fuera; las demás se ven", () => {
    const f = interpretarFicha({
      ...BASE,
      prenda: {
        ...BASE.prenda,
        variantes: [...BASE.prenda.variantes, variante("00000000-0000-4000-8000-000000000006", "BEI", T.L, 4, 0, "hay"), { id: "x" }],
      },
    }) as Ficha;
    expect(f.variantes).toHaveLength(5);
    // Sin ninguna talla que se pueda leer, no hay ficha que mostrar.
    expect(interpretarFicha({ ...BASE, prenda: { ...BASE.prenda, variantes: [{ id: "x" }] } })).toBeNull();
  });

  it("lo que llega raro y no es esencial se lee como «sin dato»: umbral 3, sin tiendas, sin descripción, una talla sin nombre es «Única»", () => {
    const f = interpretarFicha({
      ...BASE,
      umbral: 9,
      sedes: "x",
      prenda: { ...BASE.prenda, descripcion: "", tallas: [{ id: null, nombre: null }], fotos: "x" },
    }) as Ficha;
    expect(f).toMatchObject({ umbral: 3, sedes: [], descripcion: null, fotos: [], tallas: [{ id: null, nombre: "Única" }] });
  });

  it("el id de la dirección tiene que ser un uuid", () => {
    expect(esIdDePrenda("3f0e8a8e-2f1b-4c3e-9a55-111111111111")).toBe(true);
    expect(esIdDePrenda("blusa-emma")).toBe(false);
    expect(esIdDePrenda("3f0e8a8e-2f1b-4c3e-9a55-11111111111")).toBe(false);
  });
});

describe("al elegir color y talla", () => {
  it("abre con el color pedido; si no, el primero con foto y con algo; si no, el primero con foto; si no, el primero", () => {
    expect(colorInicial(ficha, "NEG")).toBe("NEG");
    expect(colorInicial(ficha, "ROS")).toBe("BEI");
    expect(colorInicial(ficha)).toBe("BEI");
    const sinStockBei = { ...ficha, variantes: ficha.variantes.map((v) => (v.color === "BEI" ? { ...v, total: 0 as const } : v)) };
    expect(colorInicial(sinStockBei)).toBe("BEI");
    const sinFotos = { ...ficha, colores: ficha.colores.map((c) => ({ ...c, foto: null })) };
    expect(colorInicial(sinFotos)).toBe("NEG");
  });

  it("las tallas de un color, en el orden de la tienda (BEI no tiene L)", () => {
    expect(tallasDelColor(ficha, "NEG").map((t) => t.talla.nombre)).toEqual(["S", "M", "L"]);
    expect(tallasDelColor(ficha, "BEI").map((t) => t.talla.nombre)).toEqual(["S", "M"]);
    expect(tallasDelColor(ficha, "ROS")).toEqual([]);
  });

  it("las fotos del color primero; un color sin foto propia se ve con la del modelo y lo dice", () => {
    expect(fotosDelColor(ficha, "BEI")).toEqual({ fotos: [FOTO("bei"), FOTO("principal")], enOtroColor: false });
    expect(fotosDelColor(ficha, "NEG")).toEqual({ fotos: [FOTO("principal"), FOTO("bei")], enOtroColor: true });
    expect(fotosDelColor({ ...ficha, fotos: [] }, "NEG")).toEqual({ fotos: [], enOtroColor: false });
  });

  it("la nota de la talla: «Otra tienda» si la elegida no tiene y otra sí, «No hay» si ninguna; sin tiendas, nada", () => {
    const [negS, negM, negL, beiS, beiM] = ficha.variantes;
    expect(notaDeTalla(negS, LIM, true)).toBe("Otra tienda");
    expect(notaDeTalla(negM, LIM, true)).toBeNull();
    expect(notaDeTalla(negL, TRU, true)).toBe("No hay");
    expect(notaDeTalla(beiS, null, true)).toBeNull();
    expect(notaDeTalla(negL, null, true)).toBe("No hay");
    expect(notaDeTalla(beiM, TRU, true)).toBe("Otra tienda");
    expect(notaDeTalla(negL, null, false)).toBeNull();
  });

  it("el precio lo decide la talla elegida; sin talla, el color si todas sus tallas cuestan lo mismo; si no, el modelo (con «Desde»)", () => {
    const [negS, , , beiS] = ficha.variantes;
    // Todas las NEG cuestan lo mismo y con la misma campaña: ya es exacto sin elegir talla.
    expect(tallaDelPrecio(ficha, "NEG", null)).toBe(negS);
    expect(tallaDelPrecio(ficha, "BEI", null)).toBe(beiS);
    expect(tallaDelPrecio(ficha, "BEI", negS)).toBe(negS);
    expect(tallaDelPrecio(ficha, "ROS", null)).toBeNull();
    // Si una talla del color cuesta distinto, el precio exacto pide la talla.
    const distinta = { ...ficha, variantes: ficha.variantes.map((v, i) => (i === 1 ? { ...v, precio: 89.9, precioFinal: 71.9 } : v)) };
    expect(tallaDelPrecio(distinta, "NEG", null)).toBeNull();

    expect(precioDeLaFicha(ficha, null)).toEqual({ principal: "Desde S/ 63.90", anterior: "S/ 79.90", oferta: true });
    expect(precioDeLaFicha(ficha, negS)).toEqual({ principal: "S/ 63.90", anterior: "S/ 79.90", oferta: true });
    expect(precioDeLaFicha(ficha, beiS)).toEqual({ principal: "S/ 79.90", anterior: null, oferta: false });
  });

  it("la campaña que se ve: la de la talla que decide el precio o la del modelo; su chip", () => {
    expect(chipCampana(campanaDeLaFicha(ficha, null))).toBe("−20 % · Aniversario CAYLA");
    expect(campanaDeLaFicha(ficha, ficha.variantes[0])?.hasta).toBe("2026-10-21");
    expect(campanaDeLaFicha(ficha, ficha.variantes[3])).toBeNull();
    expect(chipCampana(null)).toBeNull();
    // Una campaña que no baja nada no se anuncia.
    expect(campanaDeLaFicha({ ...ficha, precioFinal: ficha.precio }, null)).toBeNull();
  });

  it("lo que falta para que termine la campaña: días y horas, o el reloj el último día; terminada, nada", () => {
    const lima = (fecha: string) => new Date(`${fecha}-05:00`).getTime();
    expect(faltaParaTerminar("2026-10-21", lima("2026-10-18T10:00:00"))).toBe("3 días 13 h");
    expect(faltaParaTerminar("2026-10-21", lima("2026-10-20T23:00:00"))).toBe("1 día 0 h");
    expect(faltaParaTerminar("2026-10-21", lima("2026-10-21T18:47:51"))).toBe("05:12:08");
    expect(faltaParaTerminar("2026-10-21", lima("2026-10-22T00:00:01"))).toBeNull();
  });
});
