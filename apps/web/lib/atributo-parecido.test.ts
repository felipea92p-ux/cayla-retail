import { describe, expect, it } from "vitest";
import { atributosParecidos, existentesParecidos, nivelMasFuerte, plegarPalabra, preguntaPendiente, textoDeLaPregunta, vistaDeCoincidencias, VOCABLOS } from "./atributo-parecido";
import { claveTexto } from "./nombres-parecidos";

const f = (nombre: string, sinonimos: string[] = []) => ({ nombre, sinonimos });
const motivos = (nombre: string, existentes: ReturnType<typeof f>[]) => atributosParecidos(nombre, existentes).map((c) => `${c.item.nombre}:${c.por}`);

// Los 90 colores de la carta de CAYLA (los mismos de `color-escala.test.ts`). Si la regla acusa a dos de ellos entre sí, grita
// sobre un vocabulario que ya está bien, y quien la ve todos los días aprende a tocar «No, es otro» sin leer.
const CARTA = [
  "Blanco", "Crudo", "Perla", "Nude", "Gris perla", "Beige", "Gris piedra", "Arena", "Gris melange", "Gris", "Topo", "Gris antracita", "Negro",
  "Caqui", "Camel", "Moka", "Tostado", "Terracota", "Coñac", "Marrón", "Chocolate", "Rosa pálido", "Rosado", "Palo rosa", "Rosa chicle",
  "Rosa sandía", "Fucsia", "Coral", "Rojo tomate", "Rojo", "Marsala", "Frambuesa", "Cereza", "Vino", "Durazno", "Albaricoque", "Salmón",
  "Mandarina", "Naranja", "Ámbar", "Naranja quemado", "Amarillo mantequilla", "Vainilla", "Amarillo limón", "Amarillo", "Girasol",
  "Amarillo chartreuse", "Mostaza", "Pistacho", "Verde limón", "Salvia", "Verde hoja", "Verde oliva", "Verde militar", "Menta", "Verde agua",
  "Verde jade", "Esmeralda", "Verde", "Verde botella", "Celeste", "Turquesa", "Azul petróleo", "Azul claro", "Azur", "Azul denim",
  "Azul eléctrico", "Azul medio", "Cobalto", "Índigo", "Azul zafiro", "Azul marino", "Lavanda", "Lila", "Glicina", "Violeta", "Morado", "Malva",
  "Orquídea", "Mora", "Ciruela", "Berenjena", "Champán", "Plateado", "Oro rosa", "Dorado", "Oro viejo", "Plata vieja", "Cobre", "Bronce",
];

describe("plegarPalabra: sin plural ni femenino", () => {
  it("olivo y oliva dan lo mismo; también plural y singular", () => {
    expect(plegarPalabra("olivo")).toBe(plegarPalabra("oliva"));
    expect(plegarPalabra("rayas")).toBe(plegarPalabra("raya"));
    expect(plegarPalabra("lunares")).toBe(plegarPalabra("lunar"));
    expect(plegarPalabra("verdes")).toBe(plegarPalabra("verde"));
    expect(plegarPalabra("azules")).toBe(plegarPalabra("azul"));
  });
  it("lo corto y los números quedan tal cual", () => {
    expect(plegarPalabra("xs")).toBe("xs");
    expect(plegarPalabra("38")).toBe("38");
    expect(plegarPalabra("uva")).toBe("uva");
  });
  it("dos colores que de verdad son distintos no se confunden", () => {
    expect(plegarPalabra("lila")).not.toBe(plegarPalabra("lima"));
    expect(plegarPalabra("vino")).not.toBe(plegarPalabra("pino"));
  });
});

describe("atributosParecidos: el caso que lo originó", () => {
  const colores = [f("Verde oliva"), f("Verde hoja"), f("Azul marino")];

  it("«Verde Olivo» frente a «Verde oliva»: casi el mismo nombre", () => {
    expect(motivos("Verde Olivo", colores)).toEqual(["Verde oliva:casi-igual"]);
  });
  it("el mismo nombre sin tildes ni mayúsculas es el MISMO, no «casi»", () => {
    expect(motivos("VERDE OLIVA", colores)).toEqual(["Verde oliva:mismo-nombre"]);
  });
  it("un nombre nuevo de verdad no avisa de nada", () => {
    expect(motivos("Verde pacay", colores)).toEqual([]);
    expect(atributosParecidos("   ", colores)).toEqual([]);
  });
});

describe("atributosParecidos: femenino, plural y una letra", () => {
  it("rojo/roja, rayas/raya, lunares/lunar", () => {
    expect(motivos("Roja", [f("Rojo")])).toEqual(["Rojo:casi-igual"]);
    expect(motivos("Raya", [f("Rayas")])).toEqual(["Rayas:casi-igual"]);
    expect(motivos("Lunar", [f("Lunares")])).toEqual(["Lunares:casi-igual"]);
  });
  it("un error de tipeo en un nombre largo («Gris melange» / «Gris melanje»)", () => {
    expect(motivos("Gris melanje", [f("Gris melange")])).toEqual(["Gris melange:casi-igual"]);
  });
  it("con nombres cortos una letra ya es otro nombre", () => {
    expect(motivos("Lima", [f("Lila")])).toEqual([]);
    expect(motivos("Pino", [f("Vino")])).toEqual([]);
  });
  it("con signos: «T.U.» es «TU»", () => {
    expect(motivos("T.U.", [f("TU")])).toEqual(["TU:casi-igual"]);
  });
});

describe("atributosParecidos: los números y lo contenido NO avisan", () => {
  it("«Talla 38» no es «Talla 40»; «38» no es «40»; «Jersey 30/1» no es «Jersey 24/1»", () => {
    expect(motivos("Talla 38", [f("Talla 40")])).toEqual([]);
    expect(motivos("38", [f("40")])).toEqual([]);
    expect(motivos("Jersey 30/1", [f("Jersey 24/1")])).toEqual([]);
  });
  it("con los mismos números sí es el mismo: «Jerseys 30/1» y «Jersey 30/1»", () => {
    expect(motivos("Jerseys 30/1", [f("Jersey 30/1")])).toEqual(["Jersey 30/1:casi-igual"]);
  });
  it("XL no es XXL ni XS", () => {
    expect(motivos("XXL", [f("XL"), f("XS")])).toEqual([]);
  });
  it("«Azul rey» no se acusa con «Azul»: el nombre dentro de otro es otro color", () => {
    expect(motivos("Azul rey", [f("Azul"), f("Azul marino")])).toEqual([]);
    expect(motivos("Punto jersey", [f("Punto"), f("Jersey")])).toEqual([]);
  });
});

describe("atributosParecidos: sinónimos y orden", () => {
  const nude = f("Nude", ["color piel", "piel"]);
  it("lo escrito es un sinónimo cargado: «otro nombre de este»", () => {
    const [c] = atributosParecidos("Piel", [nude]);
    expect(c.por).toBe("otro-nombre");
    expect(c.con).toBe("piel");
  });
  it("también se parece a un sinónimo («Colores piel» ~ «color piel»)", () => {
    const [c] = atributosParecidos("Colores piel", [nude]);
    expect(c.por).toBe("casi-igual");
    expect(c.con).toBe("color piel");
  });
  it("el más claro primero: mismo nombre, otro nombre, casi igual", () => {
    const lista = [f("Verde olivo"), nude, f("Piel")];
    expect(atributosParecidos("Piel", lista).map((c) => `${c.item.nombre}:${c.por}`)).toEqual(["Piel:mismo-nombre", "Nude:otro-nombre"]);
    expect(atributosParecidos("Verde oliva", lista).map((c) => c.por)).toEqual(["casi-igual"]);
  });
  it("cada existente aparece una sola vez aunque coincida por varios de sus nombres", () => {
    expect(atributosParecidos("Colores piel", [f("Nude", ["color piel", "colores piel"])])).toHaveLength(1);
  });
  it("`excluir` deja fuera al que se está editando", () => {
    const olivo = f("Verde olivo");
    expect(atributosParecidos("Verde oliva", [olivo, f("Verde oliva")], { excluir: (x) => x === olivo }).map((c) => c.item.nombre)).toEqual(["Verde oliva"]);
  });
});

describe("la carta oficial de CAYLA no se acusa a sí misma", () => {
  it("ninguno de los 90 colores es «mismo», «otro» ni «casi» igual a otro", () => {
    const choques: string[] = [];
    CARTA.forEach((nombre, i) => {
      const otros = CARTA.filter((_, j) => j !== i).map((n) => f(n));
      for (const c of atributosParecidos(nombre, otros, { max: 99 })) choques.push(`${nombre} ~ ${c.item.nombre} (${c.por})`);
    });
    expect(choques).toEqual([]);
  });
  it("y los 90 nombres son distintos entre sí (la prueba de arriba no es vacía)", () => {
    expect(new Set(CARTA.map((n) => n.toLowerCase())).size).toBe(CARTA.length);
    expect(CARTA).toHaveLength(90);
  });
});

describe("nivelMasFuerte y textoDeLaPregunta", () => {
  it("el nivel más fuerte manda: mismo nombre frena, casi igual pregunta, tono solo avisa", () => {
    expect(nivelMasFuerte([])).toBeNull();
    expect(nivelMasFuerte([{ por: "tono" }])).toBe("avisa");
    expect(nivelMasFuerte([{ por: "tono" }, { por: "casi-igual" }])).toBe("pregunta");
    expect(nivelMasFuerte([{ por: "casi-igual" }, { por: "mismo-nombre" }])).toBe("frena");
  });
  it("sin coincidencias no dice nada", () => {
    expect(textoDeLaPregunta("color", "Verde pacay", [])).toBeNull();
  });
  it("mismo nombre: dice cuál ya existe, no ofrece «No, es otro» y explica por qué guardar está apagado", () => {
    const t = textoDeLaPregunta("color", "verde oliva", [{ nombre: "Verde oliva", por: "mismo-nombre" }])!;
    expect(t.titulo).toBe("«Verde oliva» ya existe");
    expect(t.no).toBeNull();
    expect(t.falta).toBe("«Verde oliva» ya existe: elígelo en vez de crearlo otra vez.");
  });
  it("casi igual: pregunta, dice qué se parte en dos y deja contestar «No, es otro»", () => {
    const t = textoDeLaPregunta("color", " Verde Olivo ", [{ nombre: "Verde oliva", por: "casi-igual" }])!;
    expect(t.titulo).toBe("¿No será un color que ya existe?");
    expect(t.bajada).toBe("Si es el mismo color, usa el que ya existe: con dos nombres, la misma prenda queda registrada de dos formas y su stock se parte en dos.");
    expect(t.no).toBe("No, «Verde Olivo» es otro color");
    expect(t.falta).toBe("Antes de guardar, dinos si «Verde Olivo» es el mismo color que «Verde oliva».");
  });
  it("solo el tono: avisa, no pregunta ni apaga guardar", () => {
    const t = textoDeLaPregunta("color", "Verde pacay", [{ nombre: "Verde jade", por: "tono" }])!;
    expect(t.titulo).toMatch(/casi igual/);
    expect(t.no).toBeNull();
    expect(t.falta).toBeNull();
  });
  it("el mismo nombre habla con el género de cada vocabulario: elígelo / elígela", () => {
    expect(textoDeLaPregunta("tejido", "Denim", [{ nombre: "Denim", por: "mismo-nombre" }])!.falta).toBe("«Denim» ya existe: elígelo en vez de crearlo otra vez.");
    expect(textoDeLaPregunta("talla", "xl", [{ nombre: "XL", por: "mismo-nombre" }])!.falta).toBe("«XL» ya existe: elígela en vez de crearla otra vez.");
    expect(textoDeLaPregunta("familia", "calzado", [{ nombre: "Calzado", por: "mismo-nombre" }])!.bajada).toMatch(/elige la que ya existe/);
  });
  it("con un mismo nombre y un parecido a la vez, manda el mismo nombre", () => {
    const t = textoDeLaPregunta("color", "Rojo", [{ nombre: "Roja", por: "casi-igual" }, { nombre: "Rojo", por: "mismo-nombre" }])!;
    expect(t.titulo).toBe("«Rojo» ya existe");
  });
  it("cada vocabulario habla con su género y dice qué se parte", () => {
    expect(textoDeLaPregunta("talla", "XXS", [{ nombre: "XS", por: "casi-igual" }])!.titulo).toBe("¿No será una talla que ya existe?");
    expect(textoDeLaPregunta("talla", "XXS", [{ nombre: "XS", por: "casi-igual" }])!.bajada).toMatch(/^Si es la misma talla, usa la que ya existe/);
    expect(textoDeLaPregunta("patron", "Raya", [{ nombre: "Rayas", por: "casi-igual" }])!.no).toBe("No, «Raya» es otro patrón");
    for (const v of Object.values(VOCABLOS)) expect(v.consecuencia.length).toBeGreaterThan(20);
  });
});

describe("vistaDeCoincidencias", () => {
  const leer = (c: { codigo: string; nombre: string; activo?: boolean }) => ({ id: c.codigo, nombre: c.nombre, extra: c.activo === false ? "desactivado" : undefined });
  it("pone el motivo en palabras y aclara lo desactivado", () => {
    const olivo = { codigo: "VOL", nombre: "Verde oliva", activo: false };
    const [v] = vistaDeCoincidencias([{ item: olivo, por: "casi-igual" as const }], leer);
    expect(v).toEqual({ id: "VOL", nombre: "Verde oliva", por: "casi-igual", detalle: "casi el mismo nombre · desactivado" });
  });
  it("por un sinónimo, dice cuál", () => {
    const nude = { codigo: "NUD", nombre: "Nude" };
    const [v] = vistaDeCoincidencias([{ item: nude, por: "otro-nombre" as const, con: "piel" }], leer);
    expect(v.detalle).toBe("«piel» es otro nombre de este");
  });
});

describe("existentesParecidos", () => {
  const lista = [
    { id: "t1", nombre: "Rayas", activo: true },
    { id: "t2", nombre: "Lunares", activo: false },
    { id: "t3", nombre: "Floral" },
  ];
  it("arma la pregunta de un vocabulario de un solo nombre y marca al desactivado", () => {
    expect(existentesParecidos("Lunar", lista)).toEqual([{ id: "t2", nombre: "Lunares", por: "casi-igual", detalle: "casi el mismo nombre · desactivado" }]);
    expect(existentesParecidos("raya", lista).map((c) => c.id)).toEqual(["t1"]);
  });
  it("`excluirId` deja fuera al que se está editando; un nombre nuevo no dice nada", () => {
    expect(existentesParecidos("Rayas", lista, { excluirId: "t1" })).toEqual([]);
    expect(existentesParecidos("Cuadros", lista)).toEqual([]);
  });
});

describe("preguntaPendiente: qué falta contestar antes de guardar", () => {
  const casi = [{ id: "VOL", nombre: "Verde oliva", por: "casi-igual" as const, detalle: "" }];
  const mismo = [{ id: "VOL", nombre: "Verde oliva", por: "mismo-nombre" as const, detalle: "" }];
  const tono = [{ id: "CRU", nombre: "Crudo", por: "tono" as const, detalle: "" }];

  it("sin respuesta, lo casi igual y lo del mismo nombre apagan «Guardar»; solo el tono no", () => {
    expect(preguntaPendiente("Verde olivo", casi, "").bloquea).toBe(true);
    expect(preguntaPendiente("Verde oliva", mismo, "").bloquea).toBe(true);
    expect(preguntaPendiente("Blanco roto", tono, "").bloquea).toBe(false);
    expect(preguntaPendiente("Cuadros", [], "").bloquea).toBe(false);
  });
  it("«No, es otro» destraba lo casi igual para ESE nombre, aunque tenga distinta mayúscula o tilde", () => {
    const r = preguntaPendiente("Verde  OLIVO", casi, claveTexto("verde olivo"));
    expect(r.bloquea).toBe(false);
    expect(r.visibles).toEqual([]);
  });
  it("si la persona cambia el nombre, la pregunta vuelve", () => {
    expect(preguntaPendiente("Verde olivos", casi, claveTexto("Verde olivo")).bloquea).toBe(true);
  });
  it("la respuesta NO calla el mismo nombre: la base lo rechaza diga lo que diga la persona", () => {
    // La lista se refrescó mientras tanto y la otra persona ya había creado «Verde oliva».
    const r = preguntaPendiente("Verde oliva", [...mismo, ...casi], claveTexto("Verde oliva"));
    expect(r.bloquea).toBe(true);
    expect(r.visibles.map((c) => c.por)).toEqual(["mismo-nombre"]);
  });
  it("la respuesta tampoco calla el aviso del tono: sigue a la vista, sin apagar «Guardar»", () => {
    const r = preguntaPendiente("Verde olivo", [...casi, ...tono], claveTexto("Verde olivo"));
    expect(r.bloquea).toBe(false);
    expect(r.visibles.map((c) => c.por)).toEqual(["tono"]);
  });
  it("no toca la lista que recibe", () => {
    const lista = [...casi];
    preguntaPendiente("Verde olivo", lista, claveTexto("Verde olivo"));
    expect(lista).toHaveLength(1);
  });
});

describe("tejido nuevo escrito a mano (Insumos ▸ Nueva tela): cuándo se pregunta antes de crearlo", () => {
  const tejidos = [
    { id: "t1", nombre: "Algodón pima" },
    { id: "t2", nombre: "Jersey 30/1" },
    { id: "t3", nombre: "Piqué" },
    { id: "t4", nombre: "Franela" },
  ];
  const pregunta = (texto: string) => preguntaPendiente(texto, existentesParecidos(texto, tejidos), "").bloquea;

  it("el plural, el femenino y la tilde que falta preguntan", () => {
    expect(pregunta("Algodón pimas")).toBe(true);
    expect(pregunta("Franelas")).toBe(true);
    expect(pregunta("Pique")).toBe(true);
  });
  it("lo que de verdad es otro tejido se crea sin preguntar", () => {
    expect(pregunta("Jersey 24/1")).toBe(false);
    expect(pregunta("Algodón")).toBe(false);
    expect(pregunta("Gabardina")).toBe(false);
  });
});
