import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  agregarUna,
  agregarVarias,
  BOLSA_VACIA,
  cuantasDe,
  elegirSede,
  escribirBolsa,
  interpretarBolsaEnBase,
  leerBolsa,
  ofreceOtra,
  pasaElTopePorPrenda,
  prendaParaLeer,
  quitarLinea,
  quitarUna,
  respuestaDeSeparar,
  revisarParaAgregar,
  SEPARAR_SIN_RESPUESTA,
  sinPrendas,
  textoDeLaMarca,
  TOPE_POR_PRENDA,
  TOPE_PRENDAS,
  unidades,
  vistaBolsa,
  type Bolsa,
  type BolsaEnBase,
  type MarcaDeLinea,
} from "./bolsa";

const A = "11111111-2222-4333-8444-555555555551";
const B = "11111111-2222-4333-8444-555555555552";
const TRU = "aaaaaaaa-0000-4000-8000-000000000001";
const LIM = "aaaaaaaa-0000-4000-8000-000000000002";
const M1 = "bbbbbbbb-0000-4000-8000-000000000001";
const M2 = "bbbbbbbb-0000-4000-8000-000000000002";

describe("la cookie de la bolsa", () => {
  it("se lee lo que se escribe (prendas, tienda y marca)", () => {
    const b: Bolsa = {
      lineas: [
        { varianteId: A, cantidad: 2 },
        { varianteId: B, cantidad: 1 },
      ],
      sedeId: TRU,
      marca: M1,
    };
    expect(leerBolsa(escribirBolsa(b))).toEqual(b);
    expect(leerBolsa(escribirBolsa(BOLSA_VACIA))).toEqual(BOLSA_VACIA);
    // Nada que el navegador tenga que codificar.
    expect(escribirBolsa(b)).toMatch(/^[0-9a-z._~-]+$/);
  });

  it("lo que no tiene forma se descarta: otra versión, ids raros, cantidades fuera de rango", () => {
    for (const raro of [
      undefined,
      null,
      "",
      "basura",
      "2._._",
      `1.${TRU}.${M1}.no-es-id~1`,
      `1._._.${A}~0`,
      `1._._.${A}~x`,
      `1._._.${M1.toUpperCase()}~1`,
    ]) {
      expect(leerBolsa(raro).lineas, String(raro)).toEqual([]);
    }
    expect(leerBolsa(`1.no-es-tienda.no-es-marca.${A}~1`)).toEqual({ lineas: [{ varianteId: A, cantidad: 1 }], sedeId: null, marca: null });
  });

  it("la misma prenda dos veces se suma, nunca pasa de 2 de una prenda (D2) ni de 20 prendas", () => {
    expect(leerBolsa(`1._._.${A}~1.${A}~1`).lineas).toEqual([{ varianteId: A, cantidad: 2 }]);
    expect(leerBolsa(`1._._.${A}~2.${A}~3`).lineas).toEqual([{ varianteId: A, cantidad: TOPE_POR_PRENDA }]);
    expect(leerBolsa(`1._._.${A}~15.${B}~15`).lineas).toEqual([
      { varianteId: A, cantidad: TOPE_POR_PRENDA },
      { varianteId: B, cantidad: TOPE_POR_PRENDA },
    ]);
    // Once prendas distintas de 2: la que pasa de 20 entra con lo que cabe.
    const ids = Array.from({ length: 11 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const llena = leerBolsa(`1._._.${ids.map((v) => `${v}~2`).join(".")}`);
    expect(unidades(llena)).toBe(TOPE_PRENDAS);
    expect(llena.lineas.at(-1)).toEqual({ varianteId: ids[9], cantidad: 2 });
  });

  it("agregar suma una; si no había tienda elegida, toma la que venía mirando; con 20 ya no cabe", () => {
    const una = agregarUna(BOLSA_VACIA, A, { marca: M1, sedeId: LIM });
    expect(una).toEqual({ lineas: [{ varianteId: A, cantidad: 1 }], sedeId: LIM, marca: M1 });
    const dos = agregarUna(una!, A, { marca: M2, sedeId: TRU });
    expect(dos).toEqual({ lineas: [{ varianteId: A, cantidad: 2 }], sedeId: LIM, marca: M2 });
    expect(agregarUna({ lineas: [{ varianteId: A, cantidad: TOPE_PRENDAS }], sedeId: null, marca: null }, B, { marca: M1 })).toBeNull();
  });

  it("de una misma prenda y talla entran 2 (D2): la tercera no", () => {
    const dos: Bolsa = { lineas: [{ varianteId: A, cantidad: TOPE_POR_PRENDA }], sedeId: null, marca: M1 };
    expect(cuantasDe(dos, A)).toBe(2);
    expect(cuantasDe(dos, B)).toBe(0);
    expect(agregarUna(dos, A, { marca: M2 })).toBeNull();
    expect(agregarUna(dos, B, { marca: M2 })?.lineas).toEqual([
      { varianteId: A, cantidad: 2 },
      { varianteId: B, cantidad: 1 },
    ]);
    expect(pasaElTopePorPrenda(dos, [A])).toBe(true);
    expect(pasaElTopePorPrenda(dos, [B, B])).toBe(false);
    expect(pasaElTopePorPrenda(dos, [B, B, B])).toBe(true);
    expect(agregarVarias(dos, [B, A], { marca: M2 })).toBeNull();
  });

  it("un look entra entero o no entra: varias de una vez, la misma dos veces suma dos, y si no caben todas la bolsa no cambia", () => {
    const b: Bolsa = { lineas: [{ varianteId: A, cantidad: 1 }], sedeId: TRU, marca: M1 };
    expect(agregarVarias(b, [A, B], { marca: M2 })).toEqual({
      lineas: [
        { varianteId: A, cantidad: 2 },
        { varianteId: B, cantidad: 1 },
      ],
      sedeId: TRU,
      marca: M2,
    });
    expect(agregarVarias(BOLSA_VACIA, [B, B], { marca: M1 })?.lineas).toEqual([{ varianteId: B, cantidad: 2 }]);
    // 19 prendas (de a 1, cada una distinta): cabe una más, no dos.
    const casiLlena: Bolsa = {
      lineas: Array.from({ length: TOPE_PRENDAS - 1 }, (_, i) => ({ varianteId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, cantidad: 1 })),
      sedeId: null,
      marca: null,
    };
    expect(agregarVarias(casiLlena, [B], { marca: M1 })).not.toBeNull();
    expect(agregarVarias(casiLlena, [B, M2], { marca: M1 })).toBeNull();
    expect(agregarVarias(b, [], { marca: M1 })).toBeNull();
  });

  it("«−» saca UNA, y solo si el cliente veía esa cantidad (dos toques seguidos sacan una sola)", () => {
    const b: Bolsa = {
      lineas: [
        { varianteId: A, cantidad: 2 },
        { varianteId: B, cantidad: 1 },
      ],
      sedeId: TRU,
      marca: M1,
    };
    const una = quitarUna(b, A, { vista: 2, marca: M2 });
    expect(una.lineas).toEqual([
      { varianteId: A, cantidad: 1 },
      { varianteId: B, cantidad: 1 },
    ]);
    expect(una.marca).toBe(M2);
    expect(quitarUna(una, A, { vista: 2, marca: M1 })).toBe(una);
    expect(quitarUna(una, B, { vista: 1, marca: M1 }).lineas).toEqual([{ varianteId: A, cantidad: 1 }]);
    expect(quitarUna(b, "no-esta", { vista: 1, marca: M1 })).toBe(b);
  });

  it("«Quitar» saca la prenda entera (con todas las que lleva), con la misma guarda: si ya no son las que veía, nada", () => {
    const b: Bolsa = {
      lineas: [
        { varianteId: A, cantidad: 3 },
        { varianteId: B, cantidad: 1 },
      ],
      sedeId: TRU,
      marca: M1,
    };
    const sinA = quitarLinea(b, A, { vista: 3, marca: M2 });
    expect(sinA).toEqual({ lineas: [{ varianteId: B, cantidad: 1 }], sedeId: TRU, marca: M2 });
    // Un doble toque (ya no está) u otra pestaña que cambió la cantidad: la bolsa no cambia.
    expect(quitarLinea(sinA, A, { vista: 3, marca: M1 })).toBe(sinA);
    expect(quitarLinea(b, A, { vista: 2, marca: M2 })).toBe(b);
    expect(quitarLinea(b, B, { vista: 1, marca: M2 }).lineas).toEqual([{ varianteId: A, cantidad: 3 }]);
  });

  it("elegir la tienda cambia la marca (un pedido de otra tienda es otro «Separar»); separar vacía la bolsa y deja la tienda", () => {
    const b: Bolsa = { lineas: [{ varianteId: A, cantidad: 1 }], sedeId: TRU, marca: M1 };
    expect(elegirSede(b, TRU, M2)).toBe(b);
    expect(elegirSede(b, LIM, M2)).toEqual({ ...b, sedeId: LIM, marca: M2 });
    expect(sinPrendas(b)).toEqual({ lineas: [], sedeId: TRU, marca: null });
  });
});

const sedesBase = [
  { id: TRU, nombre: "Trujillo", direccion: "Jr. Pizarro 123", horario: null, whatsapp: "987000001" },
  { id: LIM, nombre: "Lima", direccion: "Av. Larco 345", horario: "Todos los días", whatsapp: "987000002" },
];
const lineaBase = (id: string, cantidad: number, en: Record<string, [boolean, boolean, boolean?]>, extra: object = {}) => ({
  variante_id: id,
  cantidad,
  disponible: true,
  producto_id: M1,
  nombre: "Blusa Valentina",
  categoria: { nombre: "Blusas", prefijo: "CMS" },
  color: { codigo: "BLA", nombre: "Blanco", hex: "#F4F9FF" },
  talla: "M",
  foto: null,
  precio_lista: 69.9,
  precio: 69.9,
  campana: null,
  en_sedes: Object.fromEntries(Object.entries(en).map(([s, [alcanza, hay, seVende = true]]) => [s, { alcanza, hay, se_vende: seVende }])),
  alcanza_en_total: Object.values(en).some(([alcanza]) => alcanza),
  ...extra,
});
const enBase = (sede: string | null, lineas: unknown[]): BolsaEnBase => interpretarBolsaEnBase({ sede, sedes: sedesBase, lineas })!;

describe("lo que dice la base", () => {
  it("una prenda que ya no está llega sin nombre; un dato raro de una prenda la deja como «ya no está», no tumba la bolsa", () => {
    const b = enBase(null, [
      lineaBase(A, 1, { [TRU]: [true, true] }),
      { variante_id: B, cantidad: 1, disponible: false },
      { ...lineaBase(M2, 1, {}), precio: "mucho" },
    ]);
    expect(b.lineas.map((l) => ("noEsta" in l ? "no" : "si"))).toEqual(["si", "no", "no"]);
    expect(interpretarBolsaEnBase({ nada: true })).toBeNull();
  });

  it("al agregar (una prenda o un look): entra si alcanza; si no queda ninguna, agotada; si quedan pero no tantas, no alcanza; sin respuesta o fuera, no está", () => {
    const b = enBase(null, [
      lineaBase(A, 1, { [TRU]: [true, true] }),
      // Lleva 2 y en Trujillo queda 1: las que quedan ya están en su bolsa. No es «ya no está en ninguna tienda».
      lineaBase(B, 2, { [TRU]: [false, true], [LIM]: [false, false] }),
      lineaBase(M1, 1, { [TRU]: [false, false], [LIM]: [false, false] }),
      { variante_id: M2, cantidad: 1, disponible: false },
    ]);
    const tipo = (id: string) => revisarParaAgregar(b.lineas.find((l) => l.varianteId === id)).tipo;
    expect(tipo(A)).toBe("entra");
    expect(tipo(B)).toBe("no_alcanza");
    expect(tipo(M1)).toBe("agotada");
    expect(tipo(M2)).toBe("no_esta");
    expect(tipo("cccccccc-0000-4000-8000-000000000009")).toBe("no_esta");
    const entra = revisarParaAgregar(b.lineas[0]);
    expect(entra.tipo === "entra" && entra.linea.nombre).toBe("Blusa Valentina");
  });
});

describe("la página de la bolsa", () => {
  it("sin tienda: «Falta: elegir la tienda», no se puede separar todavía y el botón lleva a elegirla", () => {
    const v = vistaBolsa(enBase(null, [lineaBase(A, 1, { [TRU]: [true, true], [LIM]: [false, false] })]));
    expect(v.nota).toEqual({ antes: "Falta: ", destacado: "elegir la tienda", despues: "" });
    expect(v.boton).toBe("Separar");
    expect(v.listo).toBe(false);
    expect(v.faltaTienda).toBe(true);
    expect(v.lineas[0].marca).toEqual({ tipo: "nada" });
    // Con tienda ya no falta; con una agotada, lo que falta es quitarla (el botón no promete llevar a la tienda).
    expect(vistaBolsa(enBase(TRU, [lineaBase(A, 1, { [TRU]: [true, true] })])).faltaTienda).toBe(false);
    expect(vistaBolsa(enBase(null, [lineaBase(A, 1, { [TRU]: [false, false], [LIM]: [false, false] })])).faltaTienda).toBe(false);
    // Sin tiendas en la web no hay a cuál llevar.
    expect(vistaBolsa(interpretarBolsaEnBase({ sede: null, sedes: [], lineas: [lineaBase(A, 1, {})] })!).faltaTienda).toBe(false);
  });

  it("con tienda: «Hay en Trujillo» o «No está en Trujillo: la tienda puede traerla de Lima», y se puede separar", () => {
    const v = vistaBolsa(
      enBase(TRU, [
        lineaBase(A, 1, { [TRU]: [true, true], [LIM]: [false, false] }),
        lineaBase(B, 1, { [TRU]: [false, false], [LIM]: [true, true] }),
      ]),
    );
    expect(v.lineas.map((l) => textoDeLaMarca(l.marca))).toEqual([
      "Hay en Trujillo",
      "No está en Trujillo: la tienda puede traerla de Lima",
    ]);
    expect(v.nota.antes).toBe("No pagas nada ahora: CAYLA Trujillo te confirma por WhatsApp.");
    expect(v.boton).toBe("Separar en Trujillo");
    expect(v.listo).toBe(true);
    expect(v.paraSeparar).toEqual([
      { variante_id: A, cantidad: 1, precio: 69.9 },
      { variante_id: B, cantidad: 1, precio: 69.9 },
    ]);
  });

  it("si en la tienda elegida hay alguna pero no todas las que lleva, no dice «No está» (sería falso): dice que no alcanzan", () => {
    const v = vistaBolsa(
      enBase(TRU, [
        // Lleva 2: en Trujillo hay (no alcanza), en Lima alcanza.
        lineaBase(A, 2, { [TRU]: [false, true], [LIM]: [true, true] }),
        // Lleva 2 y en Trujillo no hay ninguna: plural.
        lineaBase(B, 2, { [TRU]: [false, false], [LIM]: [true, true] }),
      ]),
    );
    expect(v.lineas.map((l) => textoDeLaMarca(l.marca))).toEqual([
      "No alcanzan en Trujillo: la tienda puede traer las que faltan de Lima",
      "No están en Trujillo: la tienda puede traerlas de Lima",
    ]);
    expect(v.listo).toBe(true);
  });

  it("las tiendas van en orden alfabético y dicen cuánto de lo elegido tienen (cuenta filas, como la maqueta)", () => {
    const v = vistaBolsa(
      enBase(null, [
        lineaBase(A, 1, { [TRU]: [true, true], [LIM]: [false, false] }),
        lineaBase(B, 2, { [TRU]: [false, true], [LIM]: [true, true] }),
      ]),
    );
    expect(v.tiendas.map((t) => [t.sede.nombre, t.texto])).toEqual([
      ["Lima", "Tiene 1 de 2; lo demás lo trae de otra tienda"],
      ["Trujillo", "Tiene 1 de 2; lo demás lo trae de otra tienda"],
    ]);
    const todo = vistaBolsa(enBase(LIM, [lineaBase(A, 1, { [TRU]: [true, true], [LIM]: [true, true] })]));
    expect(todo.tiendas.find((t) => t.elegida)?.texto).toBe("Tiene todo lo que elegiste");
  });

  it("una prenda agotada (o que no alcanza) bloquea «Separar» y lo dice; una que ya no está, también", () => {
    const agotada = vistaBolsa(enBase(TRU, [lineaBase(A, 1, { [TRU]: [false, false], [LIM]: [false, false] })]));
    expect(textoDeLaMarca(agotada.lineas[0].marca)).toBe("Se agotó en todas las tiendas. Quítala para separar.");
    expect(agotada.nota.destacado).toBe("Hay una prenda agotada.");
    expect(agotada.listo).toBe(false);
    const noAlcanza = vistaBolsa(enBase(TRU, [lineaBase(A, 3, { [TRU]: [false, true], [LIM]: [false, true] })]));
    expect(noAlcanza.lineas[0].marca).toEqual({ tipo: "no_alcanza" });
    expect(noAlcanza.listo).toBe(false);
    // Quedan algunas: no está agotada, y se arregla bajando la cantidad (no hace falta quitarla).
    expect(noAlcanza.nota).toEqual({ antes: "", destacado: "De una prenda no quedan tantas.", despues: " Baja la cantidad para separar." });
    expect(textoDeLaMarca(noAlcanza.lineas[0].marca)).toBe("No quedan tantas en las tiendas: baja la cantidad para separar.");
    // Con una agotada y otra que no alcanza, manda la agotada (esa hay que quitarla).
    const las2 = vistaBolsa(
      enBase(TRU, [lineaBase(A, 3, { [TRU]: [false, true] }), lineaBase(B, 1, { [TRU]: [false, false], [LIM]: [false, false] })]),
    );
    expect(las2.nota.destacado).toBe("Hay una prenda agotada.");
    const noEsta = vistaBolsa(enBase(TRU, [{ variante_id: A, cantidad: 1, disponible: false }]));
    expect(noEsta.nota.destacado).toBe("Una prenda ya no está en la tienda online.");
    expect(noEsta.listo).toBe(false);
    expect(noEsta.lineas[0].importe).toBeNull();
  });

  it("una prenda que no se vende en la tienda elegida lo dice y bloquea; en otra tienda se puede", () => {
    const linea = lineaBase(A, 1, { [TRU]: [true, true, false], [LIM]: [true, true] });
    const enTru = vistaBolsa(enBase(TRU, [linea]));
    expect(textoDeLaMarca(enTru.lineas[0].marca)).toBe("No se vende en Trujillo. Quítala o elige otra tienda.");
    expect(enTru.listo).toBe(false);
    expect(vistaBolsa(enBase(LIM, [linea])).listo).toBe(true);
    // Al elegir tienda: la que no la vende no promete traerla de otra.
    expect(enTru.tiendas.map((t) => [t.sede.nombre, t.texto])).toEqual([
      ["Lima", "Tiene todo lo que elegiste"],
      ["Trujillo", "Tiene 0 de 1; 1 no se vende ahí"],
    ]);
    const dos = vistaBolsa(
      enBase(TRU, [linea, lineaBase(B, 1, { [TRU]: [false, false], [LIM]: [true, true] }), lineaBase(M1, 1, { [TRU]: [true, true], [LIM]: [true, true] })]),
    );
    expect(dos.tiendas.find((t) => t.elegida)?.texto).toBe("Tiene 1 de 3; 1 no se vende ahí; lo demás lo trae de otra tienda");
  });

  it("el total es lo que se paga con las campañas, y aparte cuánto ahorran; «Prendas» cuenta unidades", () => {
    const v = vistaBolsa(
      enBase(TRU, [
        lineaBase(A, 2, { [TRU]: [true, true] }, { precio_lista: 79.9, precio: 63.9, campana: { nombre: "Aniversario", pct: 20 } }),
        lineaBase(B, 1, { [TRU]: [true, true] }),
      ]),
    );
    expect(v.prendas).toBe(3);
    expect(v.total).toBe(197.7);
    expect(v.ahorro).toBe(32);
    expect(v.lineas.map((l) => l.importe)).toEqual([127.8, 69.9]);
    // Con campaña, la fila dice lo que costaría sin ella (tachado); sin campaña, nada.
    expect(v.lineas.map((l) => l.antes)).toEqual([159.8, null]);
  });

  it("el resumen cuadra a la vista: «Prendas» (sin campañas) − «Ahorras» = «Total»", () => {
    const v = vistaBolsa(
      enBase(TRU, [
        lineaBase(A, 1, { [TRU]: [true, true] }, { precio_lista: 89.9, precio: 79.1, campana: { nombre: "Aniversario CAYLA", pct: 12 } }),
        lineaBase(B, 2, { [TRU]: [true, true] }, { precio_lista: 65, precio: 65 }),
      ]),
    );
    // Antes «Prendas (3)» mostraba S/ 209.10, la misma cifra del total, con «Ahorras −S/ 10.80» en medio: la resta no cuadraba.
    expect(v.subtotal).toBe(219.9);
    expect(v.ahorro).toBe(10.8);
    expect(v.total).toBe(209.1);
    expect(Math.round((v.subtotal - v.ahorro) * 100) / 100).toBe(v.total);
    // Sin campañas, subtotal y total son lo mismo (y no hay fila de ahorro).
    const sin = vistaBolsa(enBase(TRU, [lineaBase(B, 1, { [TRU]: [true, true] })]));
    expect([sin.subtotal, sin.ahorro, sin.total]).toEqual([69.9, 0, 69.9]);
  });

  it("sin tiendas en la web no se puede separar, y lo dice", () => {
    const v = vistaBolsa(interpretarBolsaEnBase({ sede: null, sedes: [], lineas: [lineaBase(A, 1, {})] })!);
    expect(v.tiendas).toEqual([]);
    expect(v.listo).toBe(false);
    expect(v.nota.destacado).toBe("Por ahora no recibimos pedidos de la web.");
  });
});

describe("las marcas que dice cada prenda", () => {
  it("cubren todos los casos sin decir una cifra", () => {
    const traslado = (parte: boolean, varias: boolean, desde: string | null): MarcaDeLinea => ({ tipo: "traslado", sede: "Lima", desde, parte, varias });
    const textos = [
      textoDeLaMarca({ tipo: "no_esta" }),
      textoDeLaMarca({ tipo: "agotada" }),
      textoDeLaMarca({ tipo: "no_alcanza" }),
      textoDeLaMarca({ tipo: "no_se_vende", sede: "Lima" }),
      textoDeLaMarca({ tipo: "hay", sede: "Lima" }),
      ...[true, false].flatMap((parte) => [true, false].flatMap((varias) => [textoDeLaMarca(traslado(parte, varias, null)), textoDeLaMarca(traslado(parte, varias, "Trujillo"))])),
    ];
    for (const t of textos) expect(t).not.toMatch(/\d/);
    expect(textoDeLaMarca({ tipo: "nada" })).toBeNull();
    expect(textoDeLaMarca(traslado(false, false, null))).toBe("No está en Lima: la tienda puede traerla de otra tienda");
  });

  it("el «+» de la cantidad no ofrece otra de lo que se agotó, no alcanza o ya no está", () => {
    expect(ofreceOtra({ tipo: "hay", sede: "Lima" })).toBe(true);
    expect(ofreceOtra({ tipo: "nada" })).toBe(true);
    expect(ofreceOtra({ tipo: "traslado", sede: "Lima", desde: "Trujillo", parte: false, varias: false })).toBe(true);
    expect(ofreceOtra({ tipo: "no_se_vende", sede: "Lima" })).toBe(true);
    for (const tipo of ["agotada", "no_alcanza", "no_esta"] as const) expect(ofreceOtra({ tipo })).toBe(false);
  });

  it("la prenda dicha entera para el lector de pantalla, sin inventar lo que no tiene", () => {
    expect(prendaParaLeer({ nombre: "Chaleco Zenit", color: { nombre: "Chocolate", hex: null }, talla: "S" })).toBe("Chaleco Zenit, Chocolate, talla S");
    expect(prendaParaLeer({ nombre: "Collar", color: { nombre: null, hex: null }, talla: null })).toBe("Collar");
  });
});

describe("lo que dice «Separar» cuando no separa", () => {
  it("con el tope de separaciones abiertas: dice el número que manda la base y lleva a «Mis pedidos»", () => {
    const r = respuestaDeSeparar("tienda_separar_tope", "3");
    expect(r.mensaje).toBe("Ya tienes 3 separaciones abiertas. Cuando recojas alguna (o se cierre), puedes separar otra.");
    expect(r.enlace).toEqual({ texto: "Ver mis pedidos", href: "/cuenta/pedidos" });
    // El número es el de la base, no uno escrito en la tienda.
    expect(respuestaDeSeparar("tienda_separar_tope", "5").mensaje).toMatch(/^Ya tienes 5 separaciones/);
    // Sin un número que se pueda leer, la frase no inventa uno.
    for (const detalle of [null, "", "tres", "0", "-1", "999"]) {
      const sin = respuestaDeSeparar("tienda_separar_tope", detalle);
      expect(sin.mensaje).toBe("Ya tienes el máximo de separaciones abiertas. Cuando recojas alguna (o se cierre), puedes separar otra.");
      expect(sin.enlace).toEqual({ texto: "Ver mis pedidos", href: "/cuenta/pedidos" });
    }
  });

  it("con el tope por prenda (D2): dice cuántas y lleva a «Mis pedidos», donde están las otras", () => {
    expect(respuestaDeSeparar("tienda_separar_tope_prenda", "00000000-0000-4000-8000-000000000001")).toEqual({
      mensaje: "Puedes separar hasta 2 de la misma prenda y talla, contando las que ya separaste. Quita una para separar.",
      enlace: { texto: "Ver mis pedidos", href: "/cuenta/pedidos" },
    });
  });

  it("cada negativa conocida dice su frase, sin camino aparte; lo que la base no explica, «no pudimos separar ahora»", () => {
    expect(respuestaDeSeparar("tienda_separar_precio")).toEqual({
      mensaje: "El precio de una prenda cambió. Revisa tu bolsa y vuelve a tocar «Separar».",
      enlace: null,
    });
    for (const raro of [null, "otra_cosa", "toString", "__proto__"]) {
      expect(respuestaDeSeparar(raro), String(raro)).toEqual({ mensaje: SEPARAR_SIN_RESPUESTA, enlace: null });
    }
  });
});

describe("cómo viaja la bolsa a la base", () => {
  it("un JSON viaja como texto y lo convierte la base (`${…}::text::jsonb`): con `${…}::jsonb` el driver lo vuelve a codificar", () => {
    // Pasó al probarla en el navegador: la base recibía un texto con la lista adentro, no la lista, y la bolsa salía vacía.
    const servidor = readdirSync(__dirname).filter((f) => f.endsWith("-servidor.ts"));
    expect(servidor).toContain("bolsa-servidor.ts");
    expect(servidor.filter((f) => /\}::jsonb/.test(readFileSync(join(__dirname, f), "utf8")))).toEqual([]);
  });
});
