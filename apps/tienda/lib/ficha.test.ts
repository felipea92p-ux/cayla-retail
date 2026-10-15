import { describe, expect, it } from "vitest";
import type { Prenda } from "./catalogo";
import {
  avisoOtrosSepararon,
  botonDeLaFicha,
  campanaDeLaFicha,
  chipCampana,
  chipsDelCatalogo,
  colorInicial,
  combinaCon,
  esIdDePrenda,
  faltaParaTerminar,
  fotosDelColor,
  interpretarFicha,
  interpretarSeparadas,
  notaDeTalla,
  precioDeLaFicha,
  tallaDelPrecio,
  tallasDelColor,
  tallasRapidas,
  type Ficha,
} from "./ficha";
import type { Look } from "./looks";

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

  it("la nota de la talla: «Otra tienda» si la elegida no tiene y otra sí, «Avísame» si ninguna; sin tiendas, nada", () => {
    const [negS, negM, negL, beiS, beiM] = ficha.variantes;
    expect(notaDeTalla(negS, LIM, true)).toBe("Otra tienda");
    expect(notaDeTalla(negM, LIM, true)).toBeNull();
    expect(notaDeTalla(negL, TRU, true)).toBe("Avísame");
    expect(notaDeTalla(beiS, null, true)).toBeNull();
    expect(notaDeTalla(negL, null, true)).toBe("Avísame");
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

describe("los chips que salen del catálogo (actividad 5)", () => {
  it("«Nuevo» con hace cuántos días llegó (o «llegó hoy»), solo «Nuevo» si está fijado sin días, y su puesto en Más vendidos", () => {
    expect(chipsDelCatalogo({ nuevo: { dias: 4 }, vendidos: 3 })).toEqual([
      { texto: "Nuevo · llegó hace 4 días", tono: "nuevo" },
      { texto: "N.º 3 en más vendidos" },
    ]);
    expect(chipsDelCatalogo({ nuevo: { dias: 1 }, vendidos: null })).toEqual([{ texto: "Nuevo · llegó hace 1 día", tono: "nuevo" }]);
    expect(chipsDelCatalogo({ nuevo: { dias: 0 }, vendidos: null })).toEqual([{ texto: "Nuevo · llegó hoy", tono: "nuevo" }]);
    expect(chipsDelCatalogo({ nuevo: { dias: null }, vendidos: null })).toEqual([{ texto: "Nuevo", tono: "nuevo" }]);
    expect(chipsDelCatalogo({ nuevo: null, vendidos: 1 })).toEqual([{ texto: "N.º 1 en más vendidos" }]);
    // Sin la prenda en el catálogo (o sin base), ningún chip: nunca se afirma lo que no se sabe.
    expect(chipsDelCatalogo({ nuevo: null, vendidos: null })).toEqual([]);
    expect(chipsDelCatalogo(null)).toEqual([]);
  });
});

describe("lo que la ficha conecta: el botón, la propuesta k, «Agregar» de la tarjeta y «Combínalo con»", () => {
  const [negS, negM, negL, beiS, beiM] = ficha.variantes;
  const TRUJILLO = { id: TRU, nombre: "Trujillo" };

  it("el botón: sin talla «Elige tu talla»; si hay en ALGUNA tienda, agregar (aunque no en la elegida); si no hay en ninguna, «Avísame»", () => {
    expect(botonDeLaFicha(null)).toEqual({ tipo: "elige" });
    expect(botonDeLaFicha(negS)).toEqual({ tipo: "agregar", varianteId: negS.id });
    expect(botonDeLaFicha(beiM)).toEqual({ tipo: "agregar", varianteId: beiM.id });
    expect(botonDeLaFicha(negL)).toEqual({ tipo: "avisame", varianteId: negL.id });
  });

  it("la propuesta k: «la última» si queda una en esa tienda, «las que quedan» si hay más; nada sin tienda, sin talla o sin nada libre ahí", () => {
    const separadas = new Set([beiS.id, negM.id, beiM.id]);
    expect(avisoOtrosSepararon(beiS, TRUJILLO, separadas)).toBe(
      "Otra persona ya separó la última en Trujillo. Igual puedes separarla: la tienda te confirma o te ofrece otra opción.",
    );
    expect(avisoOtrosSepararon(negM, TRUJILLO, separadas)).toBe(
      "Otras personas ya separaron las que quedan en Trujillo. Igual puedes separarla: la tienda te confirma o te ofrece otra opción.",
    );
    // La base no dijo que sí para esa talla; nada libre en Trujillo; sin tienda («Todas») o sin talla elegida.
    expect(avisoOtrosSepararon(negS, TRUJILLO, separadas)).toBeNull();
    expect(avisoOtrosSepararon(beiM, TRUJILLO, separadas)).toBeNull();
    expect(avisoOtrosSepararon(beiS, null, separadas)).toBeNull();
    expect(avisoOtrosSepararon(null, TRUJILLO, separadas)).toBeNull();
  });

  it("lo que dice la base de la propuesta k: solo las tallas con sí; lo raro se lee como «nadie» (nunca frena)", () => {
    expect([...interpretarSeparadas({ [negS.id]: true, [negM.id]: false })]).toEqual([negS.id]);
    for (const raro of [null, undefined, "x", 3, [], { "no-es-un-id": true }, { [negS.id]: "sí" }, { [negS.id]: 1 }]) {
      expect(interpretarSeparadas(raro).size).toBe(0);
    }
  });

  it("«Agregar» de la tarjeta: el primer color con algo en la tienda elegida (o en alguna) y sus tallas, tachadas las que no hay ahí", () => {
    expect(tallasRapidas(ficha, null)).toEqual([
      { talla: "S", varianteId: negS.id },
      { talla: "M", varianteId: negM.id },
      { talla: "L", varianteId: null },
    ]);
    expect(tallasRapidas(ficha, LIM)).toEqual([
      { talla: "S", varianteId: null },
      { talla: "M", varianteId: negM.id },
      { talla: "L", varianteId: null },
    ]);
    // Negro sin nada: el primer color que tiene algo es el beige.
    const sinNegro = { ...ficha, variantes: ficha.variantes.map((v) => (v.color === "NEG" ? { ...v, total: 0 as const, stock: { [TRU]: 0 as const, [LIM]: 0 as const } } : v)) };
    expect(tallasRapidas(sinNegro, TRU)).toEqual([
      { talla: "S", varianteId: beiS.id },
      { talla: "M", varianteId: null },
    ]);
    // Nada en ninguna tienda: no hay «Agregar».
    expect(tallasRapidas({ ...ficha, variantes: ficha.variantes.map((v) => ({ ...v, total: 0 as const, stock: {} })) }, null)).toEqual([]);
  });

  it("«Combínalo con»: el PRIMER look que la lleva y sus otras prendas, como las trae el catálogo; sin look, nada", () => {
    const prenda = (id: string) => ({ id, nombre: `Prenda ${id.slice(-1)}` }) as Prenda;
    const pieza = (id: string, posicion: number) => ({ posicion, prenda: { id } });
    const look = (id: string, ids: string[]) => ({ id, nombre: `Look ${id}`, piezas: ids.map(pieza) }) as unknown as Look;
    const [A, B, C, D] = ["a", "b", "c", "d"].map((x) => `00000000-0000-4000-8000-00000000000${x}`);
    const catalogo = [prenda(A), prenda(B), prenda(C)];
    const looks = [look("1", [B, C]), look("2", [A, B, D]), look("3", [A, C])];
    // A está en los looks 2 y 3: manda el 2 (el primero), y D ya no se ve (no está en el catálogo).
    expect(combinaCon(looks, A, catalogo)).toEqual({ look: looks[1], prendas: [prenda(B)] });
    expect(combinaCon(looks, C, catalogo)?.prendas.map((p) => p.id)).toEqual([B]);
    expect(combinaCon(looks, D, catalogo)?.prendas.map((p) => p.id)).toEqual([A, B]);
    // Sin un look que la lleve, o si las otras prendas del look ya no se ven, la sección no sale.
    expect(combinaCon(looks, "00000000-0000-4000-8000-00000000000e", catalogo)).toBeNull();
    expect(combinaCon([look("4", [A, D])], A, catalogo)).toBeNull();
    expect(combinaCon([], A, catalogo)).toBeNull();
  });
});
