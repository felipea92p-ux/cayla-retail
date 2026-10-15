import { describe, expect, it } from "vitest";
import {
  alternarTalla,
  avisoDelLook,
  cejaDeLook,
  hrefDePieza,
  hrefLook,
  hrefLooks,
  interpretarLook,
  interpretarLooks,
  lineaDeLook,
  lineasDelLook,
  precioDePieza,
  sinTallasPorAhora,
  tallasIniciales,
  textoAgregar,
  totalDelLook,
  variantesParaLaBolsa,
  type Look,
} from "./looks";

const ID = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const TRUJILLO = "f775651f-62c8-4ff4-a414-b5614026d0cd";

// Una prenda de un look tal como la devuelve `retail.tienda_look` (20261015032000): el precio es el de `tienda_catalogo` en esa tienda.
const pieza = (posicion: number, nombre: string, precio: number, final = precio, tallas?: { talla: string; hay: boolean }[]) => ({
  posicion,
  x: 6,
  y: 4,
  ancho: 50,
  giro: -5,
  prenda: {
    id: ID(posicion),
    nombre,
    categoria: { nombre: "Camisas y Blusas", prefijo: "CMS" },
    precio,
    precio_final: final,
    desde: false,
    campana: final < precio ? { nombre: "Aniversario", pct: 10 } : null,
  },
  color: { codigo: "NEG", nombre: "Negro", hex: "#2D2C2F" },
  foto: null,
  ...(tallas ? { tallas: tallas.map((t, i) => ({ variante_id: ID(i + 5), ...t })) } : {}),
});
const JSON_LOOK = {
  id: ID(9),
  nombre: "Fin de semana en la ciudad",
  frase: "Denim liviano y un básico blanco",
  numero: 2,
  de: 4,
  total: 304.7,
  total_final: 289.7,
  desde: false,
  piezas: [
    pieza(2, "Falda Renata", 74.9, 74.9, [{ talla: "Única", hay: true }]),
    pieza(1, "Blusa Emma", 79.9, 79.9, [
      { talla: "S", hay: true },
      { talla: "M", hay: false },
    ]),
    pieza(3, "Vestido Sofía", 149.9, 134.9, [{ talla: "M", hay: false }]),
  ],
};
const look = interpretarLook({ sede: TRUJILLO, look: JSON_LOOK })!.look as Look;

describe("interpretar lo que devuelve la base", () => {
  it("un look con sus prendas en su orden, en camelCase, y la tienda cuyo precio se usó", () => {
    expect(interpretarLook({ sede: TRUJILLO, look: JSON_LOOK })?.sede).toBe(TRUJILLO);
    expect(look).toMatchObject({ nombre: "Fin de semana en la ciudad", numero: 2, de: 4, total: 304.7, totalFinal: 289.7 });
    expect(look.piezas.map((p) => `${p.posicion}:${p.prenda.nombre}`)).toEqual(["1:Blusa Emma", "2:Falda Renata", "3:Vestido Sofía"]);
    expect(look.piezas[0].tallas.map((t) => `${t.talla}=${t.hay}`)).toEqual(["S=true", "M=false"]);
  });

  it("la lista: un look raro se deja fuera; una respuesta rara es «no se pudo cargar» (null), nunca una página caída", () => {
    const lista = interpretarLooks({ sede: null, looks: [JSON_LOOK, { ...JSON_LOOK, id: "no-es-un-uuid" }] });
    expect(lista?.looks.map((l) => l.nombre)).toEqual(["Fin de semana en la ciudad"]);
    expect(interpretarLooks({ looks: "no" })).toBeNull();
    expect(interpretarLooks(null)).toBeNull();
    // Una tienda que llega rara se lee como «Todas».
    expect(interpretarLooks({ sede: "trujillo", looks: [] })).toEqual({ sede: null, looks: [] });
  });

  it("un look se ve completo o no se ve: con una prenda rara, una sola prenda o un precio final mayor que el precio, se descarta", () => {
    for (const malo of [
      { ...JSON_LOOK, piezas: [JSON_LOOK.piezas[0], { ...JSON_LOOK.piezas[1], prenda: { ...JSON_LOOK.piezas[1].prenda, precio: 0 } }] },
      { ...JSON_LOOK, piezas: [JSON_LOOK.piezas[0]] },
      { ...JSON_LOOK, piezas: [JSON_LOOK.piezas[0], { ...JSON_LOOK.piezas[1], prenda: { ...JSON_LOOK.piezas[1].prenda, precio_final: 99 } }] },
      { ...JSON_LOOK, piezas: [JSON_LOOK.piezas[0], { ...JSON_LOOK.piezas[1], color: { codigo: "NEG", nombre: "Negro", hex: "negro" } }] },
    ]) {
      expect(interpretarLook({ sede: null, look: malo })?.look).toBeNull();
    }
  });

  it("un look que ya no se ve llega como null (la página dice que ya no está)", () => {
    expect(interpretarLook({ sede: null, look: null })).toEqual({ sede: null, look: null });
    expect(interpretarLook("raro")).toBeNull();
  });
});

describe("lo que se dibuja", () => {
  it("el precio de cada prenda con la regla de la tarjeta: con campaña, lo que paga y el precio tachado", () => {
    expect(precioDePieza(look.piezas[0])).toEqual({ principal: "S/ 79.90", anterior: null, oferta: false });
    expect(precioDePieza(look.piezas[2])).toEqual({ principal: "S/ 134.90", anterior: "S/ 149.90", oferta: true });
  });

  it("el total del look, la ceja y la línea de la tarjeta («desde» si una campaña no toca todas las tallas)", () => {
    expect(totalDelLook(look)).toBe("S/ 289.70");
    expect(totalDelLook({ ...look, desde: true })).toBe("Desde S/ 289.70");
    expect(cejaDeLook(look)).toBe("Look 2 · 3 prendas");
    expect(lineaDeLook(look)).toBe("Denim liviano y un básico blanco · S/ 289.70");
    expect(lineaDeLook({ ...look, frase: null, desde: true })).toBe("desde S/ 289.70");
  });

  it("las direcciones llevan la tienda elegida, y la ficha de una prenda, su color", () => {
    expect(hrefLooks()).toBe("/looks");
    expect(hrefLooks("trujillo")).toBe("/looks?sede=trujillo");
    expect(hrefLook(look.id, "san-isidro")).toBe(`/looks/${look.id}?sede=san-isidro`);
    expect(hrefDePieza(look.piezas[0])).toBe(`/catalogo/${ID(1)}?color=NEG`);
    expect(hrefDePieza(look.piezas[0], "lima")).toBe(`/catalogo/${ID(1)}?sede=lima&color=NEG`);
  });
});

describe("elegir las tallas (propuesta h)", () => {
  it("al abrir, la prenda de una sola talla que hay ya viene elegida; las demás no", () => {
    expect(tallasIniciales(look)).toEqual({ 2: ID(5) });
  });

  it("tocar una talla la elige, tocarla otra vez la suelta, y una que no hay no se elige", () => {
    let elegidas = tallasIniciales(look);
    elegidas = alternarTalla(elegidas, look, 1, ID(5));
    expect(elegidas[1]).toBe(ID(5));
    expect(alternarTalla(elegidas, look, 1, ID(6))).toBe(elegidas); // la M no hay
    expect(alternarTalla(elegidas, look, 1, ID(5))[1]).toBeUndefined();
  });

  it("se agrega una línea por prenda elegida (la variante y cómo se llama), sin precio: la bolsa lo pide a la base", () => {
    const elegidas = alternarTalla(tallasIniciales(look), look, 1, ID(5));
    expect(lineasDelLook(look, elegidas)).toEqual([
      { varianteId: ID(5), productoId: ID(1), nombre: "Blusa Emma", color: "Negro", talla: "S" },
      { varianteId: ID(5), productoId: ID(2), nombre: "Falda Renata", color: "Negro", talla: "Única" },
    ]);
    // Una elección vieja de una talla que dejó de haber no se cuela.
    expect(lineasDelLook(look, { 3: ID(5) })).toEqual([]);
  });

  it("la prenda sin ninguna talla se ve pero no se agrega; el botón dice cuántas van", () => {
    expect(look.piezas.map(sinTallasPorAhora)).toEqual([false, false, true]);
    expect(textoAgregar(1)).toBe("Agregar 1 prenda a mi bolsa");
    expect(textoAgregar(3)).toBe("Agregar 3 prendas a mi bolsa");
  });
});

describe("el look a la bolsa", () => {
  const emma = { varianteId: ID(5), productoId: ID(1), nombre: "Blusa Emma", color: "Negro", talla: "S" };
  const falda = { varianteId: ID(6), productoId: ID(2), nombre: "Falda Renata", color: "Negro", talla: "Única" };
  const vestido = { varianteId: ID(7), productoId: ID(3), nombre: "Vestido Sofía", color: "Negro", talla: "M" };

  it("del navegador solo pasan de 1 a 4 ids de la base (sin precios, sin nombres)", () => {
    expect(variantesParaLaBolsa([ID(5), ID(6)])).toEqual([ID(5), ID(6)]);
    expect(variantesParaLaBolsa([ID(1), ID(2), ID(3), ID(4)])).toHaveLength(4);
    const conLetras = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    expect(variantesParaLaBolsa([conLetras])).toEqual([conLetras]);
    for (const malo of [[], [ID(1), ID(2), ID(3), ID(4), ID(5)], ["no-es-un-id"], [conLetras.toUpperCase()], ID(5), null, [{ id: ID(5), precio: 1 }]]) {
      expect(variantesParaLaBolsa(malo), JSON.stringify(malo)).toBeNull();
    }
  });

  it("entraron todas: la hoja se cierra y el aviso dice cuántas y de qué look (como la maqueta)", () => {
    expect(avisoDelLook("Fin de semana", [emma, falda], { agregadas: [ID(5), ID(6)], agotadas: [], noEstan: [] })).toEqual({
      cerrar: true,
      texto: "Agregaste 2 prendas del look «Fin de semana» a tu bolsa.",
    });
    expect(avisoDelLook("Fin de semana", [falda], { agregadas: [ID(6)], agotadas: [], noEstan: [] }).texto).toBe(
      "Agregaste 1 prenda del look «Fin de semana» a tu bolsa.",
    );
  });

  it("entraron algunas: la hoja se cierra y el aviso dice cuál quedó fuera y por qué", () => {
    expect(avisoDelLook("Fin de semana", [emma, falda, vestido], { agregadas: [ID(5)], agotadas: [ID(6)], noEstan: [ID(7)] })).toEqual({
      cerrar: true,
      texto:
        "Agregaste 1 prenda del look «Fin de semana» a tu bolsa. Falda Renata (Única) ya no está en ninguna tienda. Vestido Sofía (M) ya no está en la tienda online.",
    });
  });

  it("no entró ninguna: la hoja sigue abierta y lo dice ahí, para elegir otra talla", () => {
    expect(avisoDelLook("Fin de semana", [emma, falda], { agregadas: [], agotadas: [ID(5), ID(6)], noEstan: [] })).toEqual({
      cerrar: false,
      texto: "Blusa Emma (S) y Falda Renata (Única) ya no están en ninguna tienda. Elige otra talla o vuelve a intentarlo.",
    });
    expect(avisoDelLook("X", [emma], { agregadas: [], agotadas: [], noEstan: [] }).cerrar).toBe(false);
  });
});
