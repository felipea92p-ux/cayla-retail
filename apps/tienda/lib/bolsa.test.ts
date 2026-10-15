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
  pasaElTopePorPrenda,
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

  it("«Quitar» saca UNA, y solo si el cliente veía esa cantidad (dos toques seguidos sacan una sola)", () => {
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

  it("al agregar (una prenda o un look): entra si alcanza en alguna tienda; si no alcanza, agotada; sin respuesta o fuera, no está", () => {
    const b = enBase(null, [
      lineaBase(A, 1, { [TRU]: [true, true] }),
      lineaBase(B, 2, { [TRU]: [false, true], [LIM]: [false, false] }),
      { variante_id: M2, cantidad: 1, disponible: false },
    ]);
    const tipo = (id: string) => revisarParaAgregar(b.lineas.find((l) => l.varianteId === id)).tipo;
    expect(tipo(A)).toBe("entra");
    expect(tipo(B)).toBe("agotada");
    expect(tipo(M2)).toBe("no_esta");
    expect(tipo(M1)).toBe("no_esta");
    const entra = revisarParaAgregar(b.lineas[0]);
    expect(entra.tipo === "entra" && entra.linea.nombre).toBe("Blusa Valentina");
  });
});

describe("la página de la bolsa", () => {
  it("sin tienda: «Falta: elegir la tienda», el botón dice «Separar» y no se puede tocar", () => {
    const v = vistaBolsa(enBase(null, [lineaBase(A, 1, { [TRU]: [true, true], [LIM]: [false, false] })]));
    expect(v.nota).toEqual({ antes: "Falta: ", destacado: "elegir la tienda", despues: "" });
    expect(v.boton).toBe("Separar");
    expect(v.listo).toBe(false);
    expect(v.lineas[0].marca).toEqual({ tipo: "nada" });
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
    const textos = [
      textoDeLaMarca({ tipo: "no_esta" }),
      textoDeLaMarca({ tipo: "agotada" }),
      textoDeLaMarca({ tipo: "no_alcanza" }),
      textoDeLaMarca({ tipo: "no_se_vende", sede: "Lima" }),
      textoDeLaMarca({ tipo: "hay", sede: "Lima" }),
      textoDeLaMarca({ tipo: "traslado", sede: "Lima", desde: null }),
    ];
    for (const t of textos) expect(t).not.toMatch(/\d/);
    expect(textoDeLaMarca({ tipo: "nada" })).toBeNull();
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
