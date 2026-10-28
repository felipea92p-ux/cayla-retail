import { describe, expect, it } from "vitest";
import { fraseDeMotivo } from "./parecidas-alta-reglas";
import type { CandidataAlta, MotivoParecida, NivelParecida, ParecidaAlta, ResultadoParecidas } from "./parecidas-alta-tipos";
import {
  FRASE,
  TEXTO,
  armarAlerta,
  armarAvisoNombre,
  armarHoja,
  armarTarjeta,
  descripcionSinCodigo,
  hrefProducto,
  marcarRevisada,
  marcarVariasRevisadas,
  quitarRevisada,
  textoAnuncio,
  textoDisponible,
  tituloHoja,
  tonoChipDeAlerta,
  type BuscarEnHoja,
  type EntradaAlerta,
} from "./parecidas-alta-vista";

// La vista pura de «Prendas parecidas»: qué tono, qué frase, cuántas filas y cuándo «Crear» espera. Los datos son los 8 productos
// reales del 2026-09-29 (solo lo que hace falta) más ejemplos rotulados en el nombre del caso.

const SEDES = (tru: number, aqp = 0, lim = 0, taller = 0) => [
  { sede: "Tienda TRU", disponible: tru },
  { sede: "Tienda AQP", disponible: aqp },
  { sede: "Tienda LIM", disponible: lim },
  { sede: "Taller", disponible: taller },
];

function cand(o: Partial<CandidataAlta> & { id: string; referencia: string }): CandidataAlta {
  return {
    categoriaId: "c-jeans",
    categoria: "Jeans",
    marcaId: "m-jirish",
    marca: "Jirish",
    estado: "activo",
    descripcion: null,
    tejido: "Denim",
    patron: "Liso",
    temporada: "Verano",
    creadoEn: "2026-09-29T17:04:00.000Z",
    fotoUrl: null,
    colores: [{ nombre: "Celeste", hex: "#A9CADA" }],
    tallas: ["28", "34"],
    disponible: { total: 2, porSede: SEDES(2) },
    cargadaEn: "Tienda TRU",
    ...o,
  };
}

function par(
  c: CandidataAlta,
  nivel: NivelParecida = "contexto",
  motivo: MotivoParecida = "misma_marca_y_categoria",
  frase = "",
  deLaOtra: string | null = null,
): ParecidaAlta {
  return { candidata: c, nivel, puntaje: 0.5, motivo, frase, codigo: { suyo: null, deLaOtra, distintos: false } };
}

function resultado(lista: ParecidaAlta[], ambito: ResultadoParecidas["ambito"] = "marca"): ResultadoParecidas {
  return {
    lista,
    ambito,
    hayIdentico: lista.some((p) => p.nivel === "identico"),
    hayCasiIgual: lista.some((p) => p.nivel === "casi_igual"),
    hayParecida: lista.some((p) => p.nivel === "parecida"),
  };
}

const ancho = cand({ id: "wide", referencia: "Wide Leg", descripcion: "Wide leg - |79-SS24", colores: [{ nombre: "Azul denim", hex: "#5979A2" }, { nombre: "Celeste", hex: "#A9CADA" }], tallas: ["32"] });
const corto = cand({ id: "corto", referencia: "Wide Leg Corto Comfo", descripcion: "wide leg corto - SS25 311 - C", creadoEn: "2026-09-29T16:58:00.000Z" });
const lara = cand({ id: "lara", referencia: "Camisa Lara", marca: "La Femme 21", marcaId: "m-lf21", categoria: "Camisas y Blusas", categoriaId: "c-camisas", disponible: { total: 5, porSede: SEDES(5) } });
const adelle = cand({ id: "adelle", referencia: "Adelle Wide Leg", marca: "Pilar", marcaId: "m-pilar" });
const g44 = cand({ id: "g44", referencia: "Polo G44", marca: "Krisstell", marcaId: "m-kris", categoria: "Polos", categoriaId: "c-polos", cargadaEn: null });
const nube = cand({ id: "nube", referencia: "Palazo Nube", marca: "Wayi", marcaId: "m-wayi", estado: "descontinuado", disponible: { total: 3, porSede: SEDES(0, 0, 3) } });

const rotuloTiempo = (iso: string) => (iso.includes("16:58") ? "hace 22\u00A0h" : "hace 21\u00A0h");

function entrada(o: Partial<EntradaAlerta>): EntradaAlerta {
  return { resultado: null, marca: "Jirish", categoria: "Jeans", nombre: "", revisadas: [], cargando: false, fallo: false, rotuloTiempo, ...o };
}

const jirish = () => resultado([par(ancho), par(corto)]);

describe("textoDisponible: lo que se puede vender hoy, sede por sede", () => {
  it("con el nombre corto de cada sede", () => {
    expect(textoDisponible(SEDES(2))).toBe("TRU 2 · AQP 0 · LIM 0 · Taller 0");
  });
  it("lista vacía = sin stock en ninguna sede; sin lectura = no se inventan ceros", () => {
    expect(textoDisponible([])).toBe("Sin stock en ninguna sede");
    expect(textoDisponible(null)).toBe("No pude leer el stock");
  });
});

describe("armarAlerta: cuándo no dice nada", () => {
  it("sin resultado o sin ámbito no hay alerta", () => {
    expect(armarAlerta(entrada({ resultado: null }))).toBeNull();
    expect(armarAlerta(entrada({ resultado: resultado([], "ninguno") }))).toBeNull();
  });
  it("sin marca y sin nombre escrito no hay nada que comparar (la lista de la categoría se ofrece cuando ya escribió)", () => {
    expect(armarAlerta(entrada({ marca: null, resultado: resultado([par(ancho)], "categoria") }))).toBeNull();
    expect(armarAlerta(entrada({ marca: null, cargando: true }))).toBeNull();
    expect(armarAlerta(entrada({ marca: null, fallo: true }))).toBeNull();
  });
});

describe("armarAlerta: cargando y falló", () => {
  it("cargando: esqueleto parcial, neutra, y «Crear» no espera (la base vuelve a comprobar al guardar)", () => {
    const a = armarAlerta(entrada({ cargando: true, resultado: jirish() }))!;
    expect(a.tipo).toBe("cargando");
    expect(a.tono).toBe("neutra");
    expect(a.esqueleto).toBe(true);
    expect(a.titulo).toBe("Buscando lo que ya hay de Jirish en Jeans…");
    expect(a.bloqueaCrear).toBe(false);
    expect(a.filas).toEqual([]);
  });
  it("sin marca pero con nombre, el esqueleto habla de la categoría", () => {
    const a = armarAlerta(entrada({ marca: null, nombre: "Billie", cargando: true }))!;
    expect(a.titulo).toBe("Buscando lo que ya hay en Jeans…");
  });
  it("fallo: lo dice, ofrece reintentar y deja seguir; nunca inventa «todo bien»", () => {
    const a = armarAlerta(entrada({ fallo: true }))!;
    expect(a.tipo).toBe("fallo");
    expect(a.tono).toBe("neutra");
    expect(a.titulo).toBe("No pude ver lo que ya hay");
    expect(a.texto).toBe("Puedes seguir: el sistema revisa el nombre otra vez al guardar.");
    expect(a.accion).toMatchObject({ tipo: "reintentar", etiqueta: "Reintentar" });
    expect(a.tira).toMatchObject({ texto: "No pude ver lo que ya hay", etiqueta: "Reintentar" });
    expect(a.bloqueaCrear).toBe(false);
    expect(a.resumenAvance).toBeNull();
    expect(a.pieRevisa).toBeNull();
  });
  it("mientras carga tiene prioridad sobre el fallo y sobre un resultado viejo", () => {
    const a = armarAlerta(entrada({ cargando: true, fallo: true, resultado: resultado([par(lara, "identico", "mismo_nombre")]) }))!;
    expect(a.tipo).toBe("cargando");
    expect(a.bloqueaCrear).toBe(false);
  });
});

describe("armarAlerta: informativa (se eligió la marca)", () => {
  it("«Ya hay 2 prendas de Jirish en Jeans», dos filas con «Disp. 2 · hace 21\u00A0h», avance y pie", () => {
    const a = armarAlerta(entrada({ resultado: jirish() }))!;
    expect(a.tipo).toBe("lista_de_marca");
    expect(a.tono).toBe("informativa");
    expect(tonoChipDeAlerta(a.tono)).toBe("pizarra");
    expect(a.titulo).toBe("Ya hay 2 prendas de Jirish en Jeans");
    expect(a.texto).toBe("Si la tuya es una de ellas, ábrela y súmale tallas o colores. Si no, sigue.");
    expect(a.filas.map((f) => [f.nombre, f.detalle, f.destacada])).toEqual([
      ["Wide Leg", "Disp. 2 · hace 21\u00A0h", false],
      ["Wide Leg Corto Comfo", "Disp. 2 · hace 22\u00A0h", false],
    ]);
    expect(a.masFilas).toBe(0);
    expect(a.accion).toMatchObject({ tipo: "comparar", etiqueta: "Ver y comparar", estilo: "boton" });
    expect(a.bloqueaCrear).toBe(false);
    expect(a.resumenAvance).toBe("Hay 2 parecidas: míralas");
    expect(a.pieRevisa).toBe("Revisa: 2 parecidas");
    expect(a.tira).toMatchObject({ texto: "Ya hay 2 prendas de Jirish en Jeans", etiqueta: "Ver", conAviso: false });
  });
  it("con una sola prenda habla en singular", () => {
    const a = armarAlerta(entrada({ resultado: resultado([par(ancho)]) }))!;
    expect(a.titulo).toBe("Ya hay 1 prenda de Jirish en Jeans");
    expect(a.texto).toBe("Si la tuya es esa, ábrela y súmale tallas o colores. Si no, sigue.");
    expect(a.resumenAvance).toBe("Hay 1 parecida: mírala");
    expect(a.pieRevisa).toBe("Revisa: 1 parecida");
  });
  it("en el resumen caben 2 filas como máximo: las demás se cuentan («y N más») y solo viven en la hoja", () => {
    const cuatro = [ancho, corto, cand({ id: "c3", referencia: "Jogger Uno" }), cand({ id: "c4", referencia: "Jogger Dos" })].map((c) => par(c));
    const a = armarAlerta(entrada({ resultado: resultado(cuatro) }))!;
    expect(a.filas).toHaveLength(2);
    expect(a.masFilas).toBe(2);
    expect(a.resumenAvance).toBe("Hay 4 parecidas: míralas");
  });
  it("con más de 8 no promete «míralas»: dice que la busque", () => {
    const muchas = Array.from({ length: 12 }, (_, i) => par(cand({ id: `m${i}`, referencia: `Modelo ${i}`, marca: "CAYLA" })));
    const a = armarAlerta(entrada({ marca: "CAYLA", resultado: resultado(muchas) }))!;
    expect(a.resumenAvance).toBe("Hay 12 prendas de CAYLA: búscala");
    expect(a.filas).toHaveLength(2);
    expect(a.masFilas).toBe(10);
  });
  it("una prenda sin lectura de stock no inventa ceros", () => {
    const sin = cand({ id: "sinstock", referencia: "Sin Lectura", disponible: null });
    const a = armarAlerta(entrada({ resultado: resultado([par(sin)]) }))!;
    expect(a.filas[0].detalle).toBe("Stock sin leer · hace 21\u00A0h");
  });
});

describe("armarAlerta: el sistema no empuja a unir prendas (decisión 1 de Felipe)", () => {
  it("las alertas que sugieren abrir una prenda dicen también el otro camino: «Si no, sigue»", () => {
    const info = armarAlerta(entrada({ resultado: jirish() }))!;
    const sin = armarAlerta(entrada({ marca: null, nombre: "Billie", resultado: resultado([par(ancho), par(corto)], "categoria") }))!;
    const una = armarAlerta(entrada({ resultado: resultado([par(ancho)]) }))!;
    for (const a of [info, sin, una]) expect(a.texto).toMatch(/Si no, sigue\.$/);
  });
  it("«Es el mismo diseño» y «No, es otro diseño» se dicen con las mismas palabras en la hoja y en el aviso: ninguna frase afirma que sea la misma", () => {
    expect(TEXTO.subtextoNombreMismoDiseno).toMatch(/^Si es el mismo diseño/);
    expect(TEXTO.subtextoNombreMismoDiseno).not.toMatch(/es la misma\b/i);
  });
});

describe("armarAlerta: ámbar (lo tecleado se parece)", () => {
  const lista = () => resultado([par(corto, "parecida", "mismo_modelo", "Mismo modelo: Wide Leg Corto", "SS25 311"), par(ancho, "contexto", "misma_marca_y_categoria", "", "79-SS24")]);

  it("se parece a «Wide Leg Corto Comfo»: esa fila sube y se resalta; los códigos distintos se muestran sin veredicto", () => {
    const a = armarAlerta(entrada({ nombre: "Wide Leg Corto", resultado: lista() }))!;
    expect(a.tipo).toBe("parecida");
    expect(a.tono).toBe("ambar");
    expect(a.titulo).toBe("Se parece a «Wide Leg Corto Comfo»");
    expect(a.texto).toBe("Las dos tienen códigos distintos (SS25 311 y 79-SS24). Mira la etiqueta de tu prenda: ¿cuál dice?");
    expect(a.textoPartes?.filter((p) => p.codigo).map((p) => p.texto)).toEqual(["SS25 311", "79-SS24"]);
    expect(a.filas.map((f) => [f.nombre, f.destacada])).toEqual([
      ["Wide Leg Corto Comfo", true],
      ["Wide Leg", false],
    ]);
    expect(a.bloqueaCrear).toBe(false);
    expect(a.resumenAvance).toBe("Hay 2 parecidas: míralas");
    expect(a.tira).toMatchObject({ texto: "2 prendas parecidas", conAviso: true }); // la misma cuenta que el pie y «Avance»
  });
  it("sin códigos distintos dice que compare foto, colores y tallas", () => {
    const l = resultado([par(corto, "parecida", "mismo_modelo", "Mismo modelo: Wide Leg Corto"), par(ancho)]);
    const a = armarAlerta(entrada({ nombre: "Wide Leg Corto", resultado: l }))!;
    expect(a.texto).toBe("Compara su foto, sus colores y sus tallas con la prenda que tienes en la mano.");
    expect(a.textoPartes).toBeUndefined();
  });
  it("si la parecida no venía primera, igual va primera en las filas", () => {
    const l = resultado([par(ancho), par(corto, "parecida", "mismo_modelo", "x")]);
    const a = armarAlerta(entrada({ nombre: "Wide Leg Corto", resultado: l }))!;
    expect(a.filas[0]).toMatchObject({ nombre: "Wide Leg Corto Comfo", destacada: true });
  });
  it("una parecida de OTRA marca no sube la alerta a ámbar: solo informa en la hoja", () => {
    const l = resultado([par(adelle, "parecida", "otra_marca", "Nombre parecido"), par(ancho)]);
    const a = armarAlerta(entrada({ nombre: "Wide Leg", resultado: l }))!;
    expect(a.tipo).toBe("lista_de_marca");
    expect(a.titulo).toBe("Ya hay 1 prenda de Jirish en Jeans");
  });
});

describe("armarAlerta: revisadas («No, es otro diseño») bajan la alerta", () => {
  it("una de dos revisada: sigue informativa y cuenta lo revisado", () => {
    const a = armarAlerta(entrada({ resultado: jirish(), revisadas: ["wide"] }))!;
    expect(a.tipo).toBe("lista_de_marca");
    expect(a.titulo).toBe("Ya hay 2 prendas de Jirish en Jeans");
    expect(a.texto).toBe("Si la tuya es una de ellas, ábrela y súmale tallas o colores. Si no, sigue. Revisaste 1 de 2.");
    expect(a.filas.map((f) => f.nombre)).toEqual(["Wide Leg Corto Comfo"]);
    expect(a.resumenAvance).toBe("Hay 1 parecida: mírala");
  });
  it("todas revisadas: neutra, «Revisaste 2 parecidas ✓» y «Ver de nuevo»", () => {
    const a = armarAlerta(entrada({ resultado: jirish(), revisadas: ["wide", "corto"] }))!;
    expect(a.tipo).toBe("revisadas");
    expect(a.tono).toBe("neutra");
    expect(a.titulo).toBe("Revisaste 2 parecidas ✓");
    expect(a.resumenAvance).toBe("Revisaste 2 parecidas ✓");
    expect(a.accion).toMatchObject({ tipo: "ver_lista", etiqueta: "Ver de nuevo", estilo: "enlace" });
    expect(a.filas).toEqual([]);
    expect(a.pieRevisa).toBeNull();
    expect(a.tira).toBeNull();
    expect(a.bloqueaCrear).toBe(false);
  });
  it("revisar la ámbar la baja a informativa (ya no hay nada que se parezca sin mirar)", () => {
    const l = resultado([par(corto, "parecida", "mismo_modelo", "x"), par(ancho)]);
    expect(armarAlerta(entrada({ nombre: "Wide Leg Corto", resultado: l }))!.tono).toBe("ambar");
    expect(armarAlerta(entrada({ nombre: "Wide Leg Corto", resultado: l, revisadas: ["corto"] }))!.tono).toBe("informativa");
  });
  it("acepta un Set o un arreglo", () => {
    expect(armarAlerta(entrada({ resultado: jirish(), revisadas: new Set(["wide", "corto"]) }))!.tipo).toBe("revisadas");
  });
});

describe("armarAlerta: lo que frena", () => {
  it("el idéntico frena siempre, aunque la persona lo haya «revisado»", () => {
    const l = resultado([par(lara, "identico", "mismo_nombre", "Mismo nombre")]);
    const e = entrada({ marca: "La Femme 21", categoria: "Camisas y Blusas", nombre: "Camisa Lara", resultado: l });
    const a = armarAlerta(e)!;
    expect(a.tipo).toBe("identico");
    expect(a.tono).toBe("roja");
    expect(a.titulo).toBe("Ya existe «Camisa Lara»");
    expect(a.texto).toBe("Un nombre identifica a una sola prenda: ábrela o cámbiale el nombre.");
    expect(a.bloqueaCrear).toBe(true);
    expect(a.motivoBloqueo).toBe("“Camisa Lara” ya existe: ábrela o cámbiale el nombre para seguir.");
    expect(a.resumenAvance).toBe("Ese nombre ya existe: no se puede crear igual.");
    expect(a.accion).toMatchObject({ tipo: "comparar", etiqueta: "Ver y comparar", id: "lara" });
    expect(a.filas).toHaveLength(1);
    expect(a.filas[0]).toMatchObject({ nombre: "Camisa Lara", detalle: "Disp. 5 · hace 21\u00A0h", destacada: true });
    expect(a.tira).toMatchObject({ texto: "«Camisa Lara» ya existe", conAviso: true });
    expect(armarAlerta({ ...e, revisadas: ["lara"] })!.bloqueaCrear).toBe(true);
  });
  it("el idéntico de OTRA marca: lo dice con su marca y lleva a su ficha, no a la hoja", () => {
    const l = resultado([par(ancho, "identico", "mismo_nombre", "Mismo nombre")]);
    const a = armarAlerta(entrada({ marca: "Pilar", nombre: "Wide Leg", resultado: l }))!;
    expect(a.titulo).toBe("Ya existe «Wide Leg» en Jirish");
    // Dice antes de tocar que el enlace saca de la pantalla y que lo llenado no se guarda.
    expect(a.texto).toBe("Hoy el sistema no acepta el mismo nombre en dos marcas: agrégale el modelo o la marca. Si la abres, lo que llenaste aquí no se guarda.");
    expect(a.accion).toMatchObject({ tipo: "ver_ficha", etiqueta: "Ver Wide Leg de Jirish", href: "/productos/wide/editar" });
    expect(a.bloqueaCrear).toBe(true);
    // Con otra marca, «ábrela» no es lo que la persona busca: el pie del paso dice qué cambiar, no empuja a abrir la prenda de otra marca.
    expect(a.motivoBloqueo).toBe("“Wide Leg” ya existe en Jirish: agrégale el modelo o la marca para seguir.");
    expect(a.motivoBloqueo).not.toMatch(/ábrela/);
  });
  it("el idéntico de la MISMA marca con tarjeta en la hoja no avisa «no se guarda»: abre la hoja, no sale de la pantalla", () => {
    const l = resultado([par(lara, "identico", "mismo_nombre", "Mismo nombre")]);
    const a = armarAlerta(entrada({ marca: "La Femme 21", categoria: "Camisas y Blusas", nombre: "Camisa Lara", resultado: l }))!;
    expect(a.accion).toMatchObject({ tipo: "comparar" });
    expect(a.texto).not.toMatch(/no se guarda/);
  });
  it("el idéntico que no tiene tarjeta (otra categoría de la misma marca) lleva a su ficha y lo dice antes de tocar", () => {
    const enPolos = cand({ id: "polos", referencia: "Jogger Jirish", categoria: "Polos", categoriaId: "c-polos" });
    const l = resultado([par(enPolos, "identico", "mismo_nombre", "Mismo nombre")]);
    const a = armarAlerta(entrada({ nombre: "Jogger Jirish", resultado: l }))!;
    expect(a.accion).toMatchObject({ tipo: "ver_ficha", href: "/productos/polos/editar" });
    expect(a.texto).toBe("Un nombre identifica a una sola prenda: ábrela o cámbiale el nombre. Si la abres, lo que llenaste aquí no se guarda.");
    expect(a.motivoBloqueo).toBe("“Jogger Jirish” ya existe: ábrela o cámbiale el nombre para seguir.");
  });
  it("lo casi igual AVISA pero no frena: solo frena el idéntico exacto (decisión 3 de Felipe); la base lo acepta con p_confirmo_distinto", () => {
    const g45 = cand({ id: "g45", referencia: "Polo G45", marca: "Krisstell", marcaId: "m-kris", categoria: "Polos", categoriaId: "c-polos" });
    const l = resultado([par(g45, "casi_igual", "una_letra", "Una letra de diferencia"), par(g44)]);
    const e = entrada({ marca: "Krisstell", categoria: "Polos", nombre: "Polo G44", resultado: l });
    const a = armarAlerta(e)!;
    expect(a.tipo).toBe("casi_igual");
    expect(a.tono).toBe("ambar");
    expect(a.titulo).toBe("Se escribe casi igual que «Polo G45»");
    expect(a.texto).toBe("Se escribe con una letra de diferencia. Compara su foto, sus colores y sus tallas con la prenda que tienes en la mano.");
    expect(a.bloqueaCrear).toBe(false);
    expect(a.motivoBloqueo).toBeNull();
    expect(a.resumenAvance).toBe("Se escribe casi igual: míralo");
    expect(a.tira).toMatchObject({ texto: "1 prenda casi igual", conAviso: true, frena: false });
    const respondida = armarAlerta({ ...e, revisadas: ["g45"] })!;
    expect(respondida.bloqueaCrear).toBe(false);
    expect(respondida.tipo).not.toBe("casi_igual");
  });
  it("lo casi igual de otra marca igual tiene tarjeta en la hoja (pide una respuesta)", () => {
    const l = resultado([par(adelle, "casi_igual", "una_letra", "Una letra de diferencia")]);
    const h = armarHoja({ resultado: l, marca: "Jirish", categoria: "Jeans", alcance: "lista", revisadas: [], busqueda: "", buscar: buscarDemo, rotuloTiempo, fallo: false });
    expect(h.tarjetas.map((t) => t.nombre)).toEqual(["Adelle Wide Leg"]);
  });
  it("lo parecido, lo casi igual y lo informativo nunca frenan: de todas las alertas, solo el idéntico", () => {
    const l = resultado([par(corto, "parecida", "mismo_modelo", "x"), par(ancho)]);
    expect(armarAlerta(entrada({ nombre: "Wide Leg Corto", resultado: l }))!.bloqueaCrear).toBe(false);
    expect(armarAlerta(entrada({ resultado: jirish() }))!.bloqueaCrear).toBe(false);
    const casi = resultado([par(adelle, "casi_igual", "una_letra", "x")]);
    expect(armarAlerta(entrada({ nombre: "Adelle Wide Les", resultado: casi }))!.bloqueaCrear).toBe(false);
    const tipos = [
      armarAlerta(entrada({ resultado: jirish() })),
      armarAlerta(entrada({ resultado: jirish(), revisadas: ["wide", "corto"] })),
      armarAlerta(entrada({ cargando: true })),
      armarAlerta(entrada({ fallo: true })),
      armarAlerta(entrada({ nombre: "Adelle Wide Les", resultado: casi })),
      armarAlerta(entrada({ marca: null, nombre: "Billie", resultado: resultado([par(ancho)], "categoria") })),
      armarAlerta(entrada({ marca: "Krisstell", categoria: "Blazers", resultado: resultado([]) })),
    ];
    expect(tipos.every((a) => a !== null && !a.bloqueaCrear && a.motivoBloqueo === null && !a.tira?.frena)).toBe(true);
  });
  it("y el idéntico lo dice también la tira, con «frena»", () => {
    const l = resultado([par(lara, "identico", "mismo_nombre", "Mismo nombre")]);
    const a = armarAlerta(entrada({ marca: "La Femme 21", categoria: "Camisas y Blusas", nombre: "Camisa Lara", resultado: l }))!;
    expect(a.tira?.frena).toBe(true);
  });
});

describe("armarAlerta: neutras (sin lista o sin marca)", () => {
  it("Krisstell en Blazers: una línea, sin tranquilizar, y «Ver las de Krisstell» si tiene prendas en otra categoría", () => {
    const l = resultado([par(g44)]);
    const a = armarAlerta(entrada({ marca: "Krisstell", categoria: "Blazers", resultado: l }))!;
    expect(a.tipo).toBe("vacia");
    expect(a.tono).toBe("neutra");
    expect(a.formaTitulo).toBe("linea");
    expect(a.titulo).toBe("No hay prendas de Krisstell en Blazers todavía.");
    expect(a.titulo).not.toMatch(/primera/i);
    expect(a.accion).toMatchObject({ tipo: "ver_marca", etiqueta: "Ver las de Krisstell", estilo: "enlace" });
    expect(a.filas).toEqual([]);
    expect(a.resumenAvance).toBeNull();
    expect(a.tira).toBeNull();
  });
  it("una marca sin ninguna prenda no ofrece nada que ver", () => {
    const a = armarAlerta(entrada({ marca: "Krisstell", categoria: "Blazers", resultado: resultado([]) }))!;
    expect(a.accion).toBeNull();
  });
  it("sin marca y con nombre: «Sin marca no puedo reducir la lista» y «Ver las de Jeans»", () => {
    const l = resultado([par(ancho), par(corto), par(adelle)], "categoria");
    const a = armarAlerta(entrada({ marca: null, nombre: "Billie", resultado: l }))!;
    expect(a.tipo).toBe("sin_marca");
    expect(a.tono).toBe("neutra");
    expect(a.titulo).toBe("Sin marca no puedo reducir la lista");
    expect(a.texto).toBe("Hay 3 prendas de Jeans. Si la tuya es una de ellas, ábrela y súmale tallas o colores. Si no, sigue.");
    expect(a.accion).toMatchObject({ tipo: "ver_lista", etiqueta: "Ver las de Jeans" });
    expect(a.tira).toMatchObject({ texto: "Sin marca no puedo reducir la lista", etiqueta: "Ver" });
  });
  it("sin marca y sin prendas en la categoría: no ofrece nada", () => {
    const a = armarAlerta(entrada({ marca: null, nombre: "Billie", resultado: resultado([], "categoria") }))!;
    expect(a.texto).toBe("No hay prendas de Jeans todavía.");
    expect(a.accion).toBeNull();
    expect(a.tira).toBeNull();
  });
});

describe("armarAlerta: descontinuada", () => {
  it("va con su chip en la fila y no cambia el nivel (va al final de su nivel: lo ordenan las reglas)", () => {
    const wayi = cand({ id: "billie", referencia: "Palazo Billie", marca: "Wayi", marcaId: "m-wayi" });
    const a = armarAlerta(entrada({ marca: "Wayi", resultado: resultado([par(wayi), par(nube)]) }))!;
    expect(a.filas.map((f) => [f.nombre, f.descontinuada])).toEqual([
      ["Palazo Billie", false],
      ["Palazo Nube", true],
    ]);
    expect(a.bloqueaCrear).toBe(false);
  });
});

describe("armarAlerta: la clave cambia cuando cambia lo que se dice (es lo que dispara el pulso)", () => {
  it("misma alerta, misma clave; otro nivel u otra prenda, otra clave", () => {
    const l1 = resultado([par(corto, "parecida", "mismo_modelo", "x"), par(ancho)]);
    const l2 = resultado([par(ancho, "parecida", "mismo_modelo", "x"), par(corto)]);
    const a = armarAlerta(entrada({ nombre: "Wide Leg Corto", resultado: l1 }))!;
    expect(armarAlerta(entrada({ nombre: "Wide Leg Corto", resultado: l1 }))!.clave).toBe(a.clave);
    expect(armarAlerta(entrada({ nombre: "Wide Leg", resultado: l2 }))!.clave).not.toBe(a.clave);
    expect(armarAlerta(entrada({ resultado: jirish() }))!.clave).not.toBe(a.clave);
  });
});

describe("textoAnuncio: lo que lee un lector de pantalla cuando la alerta cambia", () => {
  it("el título y la frase, sin filas ni botones; vacío si no hay alerta", () => {
    expect(textoAnuncio(null)).toBe("");
    const a = armarAlerta(entrada({ resultado: jirish() }))!;
    expect(textoAnuncio(a)).toBe("Ya hay 2 prendas de Jirish en Jeans. Si la tuya es una de ellas, ábrela y súmale tallas o colores. Si no, sigue.");
    const vacia = armarAlerta(entrada({ marca: "Krisstell", categoria: "Blazers", resultado: resultado([]) }))!;
    expect(textoAnuncio(vacia)).toBe("No hay prendas de Krisstell en Blazers todavía.");
  });
  it("el idéntico no se anuncia dos veces: con el aviso en línea bajo Nombre (que ya se anuncia solo) la región calla; lo demás se anuncia igual", () => {
    const l = resultado([par(lara, "identico", "mismo_nombre", "Mismo nombre")]);
    const ident = armarAlerta(entrada({ marca: "La Femme 21", categoria: "Camisas y Blusas", nombre: "Camisa Lara", resultado: l }))!;
    expect(textoAnuncio(ident)).toContain("Ya existe «Camisa Lara»");
    expect(textoAnuncio(ident, { avisoEnLinea: true })).toBe("");
    const info = armarAlerta(entrada({ resultado: jirish() }))!;
    expect(textoAnuncio(info, { avisoEnLinea: true })).toBe(textoAnuncio(info));
  });
  it("el «casi igual» tampoco se anuncia dos veces cuando el aviso ámbar bajo Nombre ya lo dice", () => {
    const l = resultado([par(cand({ id: "g44", referencia: "Polo G44", categoria: "Polos" }), "casi_igual", "una_letra", "Casi igual: una letra de diferencia")]);
    const casi = armarAlerta(entrada({ marca: "Jirish", categoria: "Polos", nombre: "Polo G45", resultado: l }))!;
    expect(casi.tipo).toBe("casi_igual");
    expect(textoAnuncio(casi)).toContain("casi igual");
    expect(textoAnuncio(casi, { avisoEnLinea: true })).toBe("");
  });
  it("mientras la base responde hay algo que anunciar (la tira del celular no dice nada en ese momento): el título del esqueleto", () => {
    const a = armarAlerta(entrada({ cargando: true }))!;
    expect(textoAnuncio(a)).toBe("Buscando lo que ya hay de Jirish en Jeans…");
    expect(a.tira).toBeNull();
  });
});

describe("armarAvisoNombre: el rojo en línea bajo el campo Nombre", () => {
  it("otra marca: dice qué hacer para distinguirla y lleva a la ficha", () => {
    const l = resultado([par(ancho, "identico", "mismo_nombre", "Mismo nombre")]);
    const v = armarAvisoNombre({ resultado: l, marca: "Pilar", categoria: "Jeans", cargando: false, fallo: false })!;
    expect(v.texto).toBe("Ese nombre ya existe en Jirish. Agrégale el modelo o la marca para distinguirla (ej.: Pilar Wide Leg).");
    expect(v.partes.find((p) => p.negrita)?.texto).toBe("Jirish");
    // El enlace saca a la persona del formulario: se le dice antes de que lo toque.
    expect(v.subtexto).toBe("Si la abres, lo que llenaste aquí no se guarda.");
    expect(v.accion).toMatchObject({ tipo: "ver_ficha", etiqueta: "Ver Wide Leg de Jirish", href: "/productos/wide/editar" });
  });
  it("misma marca: «Ya existe Camisa Lara en La Femme 21», «Ver y comparar» y cómo distinguirla", () => {
    const l = resultado([par(lara, "identico", "mismo_nombre", "Mismo nombre")]);
    const v = armarAvisoNombre({ resultado: l, marca: "La Femme 21", categoria: "Camisas y Blusas", cargando: false, fallo: false })!;
    expect(v.texto).toBe("Ya existe Camisa Lara en La Femme 21. Un nombre identifica a una sola prenda.");
    expect(v.accion).toMatchObject({ tipo: "comparar", etiqueta: "Ver y comparar", id: "lara" });
    expect(v.subtexto).toBe("Si es el mismo diseño, ábrela desde «Ver y comparar». Si es otro diseño, ponle un nombre que lo distinga: el largo, el corte, el detalle.");
  });
  it("sin idéntico, cargando o con la lectura caída no dice nada", () => {
    expect(armarAvisoNombre({ resultado: jirish(), marca: "Jirish", categoria: "Jeans", cargando: false, fallo: false })).toBeNull();
    const l = resultado([par(lara, "identico", "mismo_nombre", "x")]);
    expect(armarAvisoNombre({ resultado: l, marca: "La Femme 21", categoria: "Camisas y Blusas", cargando: true, fallo: false })).toBeNull();
    expect(armarAvisoNombre({ resultado: l, marca: "La Femme 21", categoria: "Camisas y Blusas", cargando: false, fallo: true })).toBeNull();
  });
});

describe("armarTarjeta: lo que dice cada tarjeta de la hoja", () => {
  it("«Wide Leg»: sin foto, código leído de la descripción (una sola vez), tejido y patrón como chips, stock por sede y cuándo se cargó", () => {
    const t = armarTarjeta({ parecida: par(ancho, "contexto", "misma_marca_y_categoria", "", "79-SS24"), rotuloTiempo });
    expect(t.nombre).toBe("Wide Leg");
    expect(t.href).toBe("/productos/wide/editar");
    expect(t.marcaCategoria).toBe("Jirish · Jeans");
    expect(t.fotoUrl).toBeNull();
    expect(t.codigo).toEqual({ texto: "79-SS24", titulo: "Leído de la descripción" });
    expect(t.descripcion).toBe("Wide leg");
    expect(t.chips).toEqual(["Denim", "Liso", "Verano"]);
    expect(t.textoColores).toBe("Azul denim · Celeste");
    expect(t.tallas).toBe("Tallas: 32");
    expect(t.disponible).toBe("TRU 2 · AQP 0 · LIM 0 · Taller 0");
    expect(t.cargada).toBe("Cargada en Tienda TRU hace 21\u00A0h");
    expect(t.evidencia).toBeNull();
    expect(t.exacto).toBe(false);
    expect(t.puedeDescartar).toBe(true);
    expect(t.frase).toBe("Te lleva a esa prenda: ahí le sumas tallas y colores. Las unidades se registran en Recibir. Lo que llenaste aquí no se guarda.");
  });
  it("el código que vive en el NOMBRE («Polo G44») se dice leído del nombre y la descripción queda entera; sin sede inferida solo dice cuándo", () => {
    const t = armarTarjeta({ parecida: par(g44, "contexto", "misma_marca_y_categoria", "", "G44"), rotuloTiempo });
    expect(t.codigo).toEqual({ texto: "G44", titulo: "Leído del nombre" });
    expect(t.cargada).toBe("Cargada hace 21\u00A0h");
  });
  it("la descripción sin el código: «wide leg corto - SS25 311 - C» → «wide leg corto - C»", () => {
    expect(descripcionSinCodigo("wide leg corto - SS25 311 - C", "SS25 311")).toBe("wide leg corto - C");
    expect(descripcionSinCodigo("Wide leg - |79-SS24", "79-SS24")).toBe("Wide leg");
    expect(descripcionSinCodigo("Palazo", "G44")).toBe("Palazo");
    expect(descripcionSinCodigo(null, "G44")).toBeNull();
    expect(descripcionSinCodigo("SS25 311", "ss25  311")).toBeNull();
  });
  it("quita el código TAL COMO lo escribieron (con guion, pegado o con «Ref.»), no solo con el espacio normalizado", () => {
    // Con la forma normalizada («SS25 311») estos dos quedaban sin limpiar: «wide leg corto - SS25-311 - C» y «Wide leg Ref.  - crudo».
    expect(descripcionSinCodigo("wide leg corto - SS25-311 - C", "SS25 311")).toBe("wide leg corto - C");
    expect(descripcionSinCodigo("Wide leg Ref. 311 - crudo", "311")).toBe("Wide leg - crudo");
    expect(descripcionSinCodigo("wide leg ss25311 corto", "SS25 311")).toBe("wide leg corto");
    expect(descripcionSinCodigo("Mod. G-44 polo", "G44")).toBe("polo");
  });
  it("«Cargada en el Taller hace 3 días»: el taller lleva artículo", () => {
    const t = armarTarjeta({ parecida: par(cand({ id: "t", referencia: "Blusa", cargadaEn: "Taller" })), rotuloTiempo: () => "hace 3 días" });
    expect(t.cargada).toBe("Cargada en el Taller hace 3\u00A0días");
  });
  it("sin foto, sin marca, sin cuándo y sin lectura de stock: no inventa nada", () => {
    const t = armarTarjeta({ parecida: par(cand({ id: "x", referencia: "X", marca: null, marcaId: null, creadoEn: null, cargadaEn: null, disponible: null, tallas: [] })), rotuloTiempo });
    expect(t.marcaCategoria).toBe("Sin marca · Jeans");
    expect(t.cargada).toBeNull();
    expect(t.disponible).toBe("No pude leer el stock");
    expect(t.disponibleSedes).toBeNull();
    expect(t.tallas).toBeNull();
  });
  it("más de 4 colores: cuatro cápsulas y el resto se cuenta", () => {
    const colores = ["Beige", "Azul marino", "Blanco", "Celeste", "Chocolate", "Marrón"].map((nombre) => ({ nombre, hex: "#cccccc" }));
    const t = armarTarjeta({ parecida: par(cand({ id: "e", referencia: "Polo Evaluna", colores })), rotuloTiempo });
    expect(t.coloresVisibles).toHaveLength(4);
    expect(t.masColores).toBe(2);
    expect(t.textoColores).toBe("Beige · Azul marino · Blanco · Celeste +2");
  });
  it("un color sin hex (Estampado, Multicolor, Animal print) se marca como «varios»: la cápsula no se dibuja vacía", () => {
    const colores = [{ nombre: "Celeste", hex: "#A9CADA" }, { nombre: "Estampado", hex: "" }];
    const t = armarTarjeta({ parecida: par(cand({ id: "est", referencia: "Blusa Floral", colores })), rotuloTiempo });
    expect(t.coloresVisibles).toEqual([
      { nombre: "Celeste", hex: "#A9CADA", varios: false },
      { nombre: "Estampado", hex: "", varios: true },
    ]);
    expect(t.textoColores).toBe("Celeste · Estampado");
  });
  it("«hace 22 h» no se parte: la unidad va pegada a su número (no queda una «h» sola en el renglón de abajo); «hace un momento» no se toca", () => {
    const t = armarTarjeta({ parecida: par(ancho), rotuloTiempo });
    expect(t.cargada).toBe("Cargada en Tienda TRU hace 21\u00A0h");
    expect(t.cargada?.endsWith("21\u00A0h")).toBe(true);
    const ahora = armarTarjeta({ parecida: par(ancho), rotuloTiempo: () => "hace un momento" });
    expect(ahora.cargada).toBe("Cargada en Tienda TRU hace un momento");
    const fila = armarAlerta(entrada({ resultado: resultado([par(ancho)]) }))!.filas[0];
    expect(fila.detalle).toBe("Disp. 2 · hace 21\u00A0h");
  });
  it("el chip de evidencia dice QUÉ vio, nunca un veredicto: los motivos de contexto no llevan chip", () => {
    // Con las reglas REALES la frase de `mismo_modelo` es «Mismo modelo: …»: la tarjeta no la repite, dice «Nombre parecido» (README de la maqueta).
    expect(armarTarjeta({ parecida: par(corto, "parecida", "mismo_modelo", "Mismo modelo: Wide Leg Corto"), rotuloTiempo }).evidencia).toEqual({ texto: "Nombre parecido", tono: "pizarra" });
    expect(armarTarjeta({ parecida: par(corto, "parecida", "nombre_parecido", "Nombre parecido"), rotuloTiempo }).evidencia).toEqual({ texto: "Algo parecido", tono: "neutro" });
    expect(armarTarjeta({ parecida: par(corto, "contexto", "misma_marca_y_categoria", "Misma marca y categoría"), rotuloTiempo }).evidencia).toBeNull();
    expect(armarTarjeta({ parecida: par(adelle, "contexto", "otra_marca", "Otra marca"), rotuloTiempo }).evidencia).toBeNull();
  });
  it("ningún chip de evidencia dice «mismo» salvo el nombre exacto, sea cual sea la frase que traigan las reglas", () => {
    const motivos: MotivoParecida[] = ["una_letra", "mismo_modelo", "nombre_parecido", "coincide_codigo", "misma_marca_y_categoria", "misma_marca_otra_categoria", "misma_categoria", "otra_marca"];
    for (const m of motivos) {
      // La frase es la que entregan las reglas de verdad para ese motivo («Mismo modelo: …» para `mismo_modelo`).
      const ev = armarTarjeta({ parecida: par(corto, "parecida", m, fraseDeMotivo(m, "SS25 311"), "SS25 311"), rotuloTiempo }).evidencia;
      expect(ev?.texto ?? "").not.toMatch(/mismo modelo|misma prenda|es la misma/i);
    }
    expect(armarTarjeta({ parecida: par(lara, "identico", "mismo_nombre", "Mismo nombre"), rotuloTiempo }).evidencia?.texto).toBe("Mismo nombre");
  });
  it("«una letra» conserva la frase de las reglas (un hecho: «Casi igual: una letra de diferencia») y cae a una propia si falta", () => {
    expect(armarTarjeta({ parecida: par(ancho, "casi_igual", "una_letra", "Casi igual: una letra de diferencia"), rotuloTiempo }).evidencia).toEqual({ texto: "Casi igual: una letra de diferencia", tono: "ambar" });
    expect(armarTarjeta({ parecida: par(ancho, "casi_igual", "una_letra", ""), rotuloTiempo }).evidencia?.texto).toBe("Casi igual: una letra de diferencia");
  });
  it("la idéntica: borde de tinta, «Mismo nombre», y «No, es otro diseño» no se ofrece", () => {
    const t = armarTarjeta({ parecida: par(lara, "identico", "mismo_nombre", "Mismo nombre"), rotuloTiempo });
    expect(t.exacto).toBe(true);
    expect(t.puedeDescartar).toBe(false);
    expect(t.evidencia).toEqual({ texto: "Mismo nombre", tono: "tinta" });
  });
  it("con un código buscado: «Coincide el código: SS25 311» en la que lo lleva y «Otro código» en la que tiene otro", () => {
    const lleva = armarTarjeta({ parecida: par(corto, "contexto", "misma_marca_y_categoria", "", "SS25 311"), rotuloTiempo, codigoBuscado: "SS25 311", llevaCodigo: true });
    const otro = armarTarjeta({ parecida: par(ancho, "contexto", "misma_marca_y_categoria", "", "79-SS24"), rotuloTiempo, codigoBuscado: "SS25 311", llevaCodigo: false });
    // El código va con espacio duro: en 375 px no se parte entre «SS25» y «311» (la persona lo compara con la etiqueta).
    expect(lleva.evidencia).toEqual({ texto: "Coincide el código: SS25\u00A0311", tono: "verde" });
    expect(lleva.evidencia?.texto.replace(/\u00A0/g, " ")).toBe("Coincide el código: SS25 311");
    expect(otro.evidencia).toEqual({ texto: "Otro código", tono: "pizarra" });
  });
  it("descontinuada: lo dice y explica que no se activa sola", () => {
    const t = armarTarjeta({ parecida: par(nube), rotuloTiempo });
    expect(t.descontinuada).toBe(true);
    expect(t.frase).toBe("Te lleva a su ficha. Para volver a usarla, cambia ahí «Estado» a «Activo» y guarda: no se activa sola. Lo que llenaste aquí no se guarda.");
  });
  it("«Marcaste … como otro diseño»", () => {
    expect(armarTarjeta({ parecida: par(ancho), rotuloTiempo }).textoRevisada).toBe("Marcaste Wide Leg como otro diseño.");
  });
});

// Un filtro de juguete, el que las reglas entregan de verdad: sin tildes ni mayúsculas, todas las palabras.
const sinTilde = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const buscarDemo: BuscarEnHoja = (lista, q) => {
  const esCodigo = /\d/.test(q) && q.replace(/[^a-z0-9]/gi, "").length >= 3;
  if (esCodigo) {
    const n = q.replace(/[^a-z0-9]/gi, "").toUpperCase();
    const lleva = lista.filter((p) => `${p.candidata.referencia} ${p.candidata.descripcion ?? ""}`.replace(/[^a-z0-9]/gi, "").toUpperCase().includes(n)).map((p) => p.candidata.id);
    const orden = [...lista].sort((a, b) => Number(lleva.includes(b.candidata.id)) - Number(lleva.includes(a.candidata.id)));
    return { lista: orden, codigo: q, llevanCodigo: lleva, coincideEn: {} };
  }
  const palabras = sinTilde(q).split(/\s+/);
  const coincideEn: Record<string, { campo: string; texto: string }> = {};
  const quedan = lista.filter((p) => {
    const c = p.candidata;
    if (palabras.every((w) => sinTilde(c.referencia).includes(w))) return true;
    const desc = c.descripcion ?? "";
    if (desc && palabras.every((w) => sinTilde(desc).includes(w))) {
      coincideEn[c.id] = { campo: "descripción", texto: desc };
      return true;
    }
    return false;
  });
  return { lista: quedan, codigo: null, llevanCodigo: [], coincideEn };
};

const hoja = (o: Partial<Parameters<typeof armarHoja>[0]> = {}) =>
  armarHoja({ resultado: jirish(), marca: "Jirish", categoria: "Jeans", alcance: "lista", revisadas: [], busqueda: "", buscar: buscarDemo, rotuloTiempo, fallo: false, ...o });

describe("armarHoja", () => {
  it("«Prendas parecidas de Jirish en Jeans», la bajada, el buscador como instrucción y el contador", () => {
    const h = hoja();
    expect(h.titulo).toBe("Prendas parecidas de Jirish en Jeans");
    expect(h.bajada).toBe("Compara el diseño con la prenda que tienes en la mano.");
    expect(h.placeholder).toBe("Busca por nombre o por el código de la etiqueta…");
    // En 375 px el largo no cabe a 16 px (el mínimo que evita el zoom de Safari al enfocar): hay una versión corta, también una instrucción.
    expect(h.placeholderCorto).toBe("Nombre o código de la etiqueta…");
    expect(h.placeholderCorto.length).toBeLessThan(h.placeholder.length);
    expect(h.cuenta).toBe("2 prendas");
    expect(h.tarjetas.map((t) => t.nombre)).toEqual(["Wide Leg", "Wide Leg Corto Comfo"]);
    expect(h.pie).toEqual({ nota: "Lo que llenaste aquí no se guarda.", boton: "Ninguna es mi prenda" });
    expect(h.vacio).toBeNull();
  });
  it("los títulos según de dónde viene la lista", () => {
    expect(tituloHoja("marca", "lista", "Jirish", "Jeans")).toBe("Prendas parecidas de Jirish en Jeans");
    expect(tituloHoja("marca", "marca", "Krisstell", "Blazers")).toBe("Prendas de Krisstell");
    expect(tituloHoja("categoria", "lista", null, "Jeans")).toBe("Prendas de Jeans");
  });
  it("con códigos distintos lo dice sin veredicto", () => {
    const l = resultado([par(ancho, "contexto", "misma_marca_y_categoria", "", "79-SS24"), par(corto, "contexto", "misma_marca_y_categoria", "", "SS25 311")]);
    const av = hoja({ resultado: l }).avisos[0];
    expect(av.forma).toBe("neutro");
    expect(av.texto).toBe("Las dos tienen códigos distintos (79-SS24 y SS25 311). Mira la etiqueta de tu prenda: ¿cuál dice?");
  });
  it("con más de dos prendas, «Dos de ellas…»; con dos, «Las dos…» (un «ellas» sin a quién referirse confunde)", () => {
    const tres = resultado([par(ancho, "contexto", "misma_marca_y_categoria", "", "79-SS24"), par(corto, "contexto", "misma_marca_y_categoria", "", "SS25 311"), par(cand({ id: "otra", referencia: "Wide Leg Largo" }))]);
    expect(hoja({ resultado: tres }).avisos[0].texto).toBe("Dos de ellas tienen códigos distintos (79-SS24 y SS25 311). Mira la etiqueta de tu prenda: ¿cuál dice?");
  });
  it("H3: «Ninguna es mi prenda» con una búsqueda de texto activa marca solo lo que la persona VE, no lo que la búsqueda ocultó", () => {
    const polo = (id: string, referencia: string, nivel: NivelParecida = "contexto") => par(cand({ id, referencia, categoria: "Polos", categoriaId: "c-polos" }), nivel);
    const l = resultado([polo("g44", "Polo G44", "casi_igual"), polo("aurora", "Polo Aurora"), polo("brisa", "Polo Brisa")]);
    // Sin búsqueda: las tres. Con «aurora»: solo la que se ve; la «casi igual» oculta NO queda respondida sin haberla mirado.
    expect(hoja({ resultado: l, categoria: "Polos" }).idsNinguna).toEqual(["g44", "aurora", "brisa"]);
    expect(hoja({ resultado: l, categoria: "Polos", busqueda: "aurora" }).idsNinguna).toEqual(["aurora"]);
    // Un código solo ordena: la lista sigue completa y entran todas.
    expect(hoja({ resultado: l, categoria: "Polos", busqueda: "G44" }).idsNinguna).toHaveLength(3);
  });
  it("buscar un CÓDIGO no oculta nada: sube la que lo lleva y el aviso dice que es una pista, no una prueba", () => {
    const l = resultado([par(ancho, "contexto", "misma_marca_y_categoria", "", "79-SS24"), par(corto, "contexto", "misma_marca_y_categoria", "", "SS25 311")]);
    const h = hoja({ resultado: l, busqueda: "SS25 311" });
    expect(h.tarjetas.map((t) => t.nombre)).toEqual(["Wide Leg Corto Comfo", "Wide Leg"]);
    expect(h.tarjetas[0].evidencia).toEqual({ texto: "Coincide el código: SS25\u00A0311", tono: "verde" });
    expect(h.tarjetas[1].evidencia).toEqual({ texto: "Otro código", tono: "pizarra" });
    expect(h.avisos[0].texto).toBe("1 prenda lleva SS25 311 en el nombre o la descripción. Las demás siguen abajo: el código es una pista, no una prueba.");
    expect(h.cuenta).toBe("2 prendas");
    expect(h.resaltar).toBe("");
  });
  it("un código que nadie lleva: lo dice y aun así deja mirar el diseño", () => {
    const h = hoja({ busqueda: "ZZ99 000" });
    expect(h.tarjetas).toHaveLength(2);
    expect(h.avisos[0]).toMatchObject({ forma: "neutro" });
    expect(h.avisos[0].texto).toBe("Ninguna lleva ZZ99 000 en el nombre ni en la descripción. El código es una pista, no una prueba: mira el diseño igual.");
  });
  it("buscar un TEXTO sí filtra, cuenta «N resultados de M» y dice en qué campo coincidió", () => {
    const l = resultado([par(ancho), par(corto)]);
    const h = hoja({ resultado: l, busqueda: "corto" });
    expect(h.tarjetas.map((t) => t.nombre)).toEqual(["Wide Leg Corto Comfo"]);
    expect(h.cuenta).toBe("1 resultado de 2");
    expect(h.resaltar).toBe("corto");
    const d = hoja({ resultado: l, busqueda: "79" }); // «79» sola no es código (menos de 3): busca en el texto
    expect(d.cuenta).toBe("1 resultado de 2");
    expect(d.tarjetas[0].coincide).toEqual({ campo: "descripción", texto: "Wide leg - |79-SS24" });
  });
  it("sin resultados: lo dice (y no se oculta detrás de una tarjeta vacía)", () => {
    const h = hoja({ busqueda: "palabra que nadie usa" });
    expect(h.tarjetas).toEqual([]);
    // Sin veredicto: lo que no aparece aquí puede ser la misma prenda cargada con OTRO nombre; no se dice «es nueva».
    expect(h.vacio).toBe("No encontré ninguna con esa palabra. Prueba con otra o con el código de la etiqueta.");
    expect(h.vacio).not.toMatch(/es nueva|primera/i);
  });
  it("la línea gris de otra marca no tiene acción; la de otra categoría de la misma marca sí ofrece «Ver las de …»", () => {
    const enPolos = cand({ id: "polos", referencia: "Jogger Jirish", categoria: "Polos", categoriaId: "c-polos" });
    const l = resultado([par(ancho), par(adelle, "parecida", "otra_marca", "Nombre parecido"), par(enPolos, "parecida", "misma_marca_otra_categoria", "Mismo modelo")]);
    const h = hoja({ resultado: l });
    const otra = h.avisos.find((a) => a.texto.startsWith("Hay una"))!;
    expect(otra.texto).toBe("Hay una «Adelle Wide Leg» de Pilar.");
    expect(otra.accion).toBeUndefined();
    const cat = h.avisos.find((a) => a.texto.includes("también está en"))!;
    expect(cat.texto).toBe("Jogger Jirish también está en Polos, de Jirish.");
    expect(cat.accion).toEqual({ tipo: "ver_marca", etiqueta: "Ver las de Jirish" });
    // Esas dos no son tarjetas: solo informan.
    expect(h.tarjetas.map((t) => t.nombre)).toEqual(["Wide Leg"]);
  });
  it("una prenda de otra marca que las reglas dejan en «contexto» (nunca suben de ahí) también sale en la línea gris; una sin marca no es «de otra marca»", () => {
    const sinMarca = cand({ id: "sm", referencia: "Jean Suelto", marca: null, marcaId: null });
    const l = resultado([par(ancho), par(adelle, "contexto", "otra_marca", "De otra marca"), par(sinMarca, "contexto", "otra_marca", "Sin marca")]);
    const h = hoja({ resultado: l });
    expect(h.avisos.filter((a) => a.texto.startsWith("Hay una")).map((a) => a.texto)).toEqual(["Hay una «Adelle Wide Leg» de Pilar."]);
    expect(h.tarjetas.map((t) => t.nombre)).toEqual(["Wide Leg"]); // solo informa: no es una tarjeta ni una alerta
  });
  it("«Ver las de Krisstell»: toda la marca, en todas sus categorías", () => {
    const l = resultado([par(g44), par(cand({ id: "evaluna", referencia: "Polo Evaluna", marca: "Krisstell", marcaId: "m-kris", categoria: "Polos" })), par(ancho)]);
    const h = hoja({ resultado: l, marca: "Krisstell", categoria: "Blazers", alcance: "marca" });
    expect(h.titulo).toBe("Prendas de Krisstell");
    expect(h.tarjetas.map((t) => t.nombre)).toEqual(["Polo G44", "Polo Evaluna"]);
    expect(h.idsNinguna).toEqual([]);
  });
  it("«Ninguna es mi prenda» marca las de la lista, nunca la idéntica ni las ya revisadas", () => {
    const l = resultado([par(lara, "identico", "mismo_nombre", "Mismo nombre"), par(cand({ id: "otra", referencia: "Camisa Otra", marca: "La Femme 21", marcaId: "m-lf21", categoria: "Camisas y Blusas", categoriaId: "c-camisas" }))]);
    const h = hoja({ resultado: l, marca: "La Femme 21", categoria: "Camisas y Blusas" });
    expect(h.idsNinguna).toEqual(["otra"]);
    expect(hoja({ resultado: jirish(), revisadas: ["wide"] }).idsNinguna).toEqual(["corto"]);
  });
  it("si la lectura falló, el aviso de la hoja lo dice", () => {
    const h = hoja({ resultado: resultado([]), fallo: true });
    expect(h.avisos[0]).toEqual({ forma: "neutro", texto: "No pude ver lo que ya hay. Puedes seguir: el sistema revisa el nombre otra vez al guardar." });
    expect(h.vacio).toBeNull();
  });
});

describe("«No, es otro diseño» → revisadas", () => {
  it("suma sin repetir y sin tocar el arreglo de antes", () => {
    const antes = ["wide"];
    expect(marcarRevisada(antes, "corto", jirish())).toEqual(["wide", "corto"]);
    expect(antes).toEqual(["wide"]);
    expect(marcarRevisada(["wide"], "wide", jirish())).toBeNull();
  });
  it("la idéntica no se puede marcar: con el mismo nombre, decir «es otro diseño» no destraba nada", () => {
    expect(marcarRevisada([], "lara", resultado([par(lara, "identico", "mismo_nombre", "x")]))).toBeNull();
  });
  it("deshacer quita solo esa", () => {
    expect(quitarRevisada(["wide", "corto"], "wide")).toEqual(["corto"]);
    expect(quitarRevisada(["corto"], "wide")).toBeNull();
  });
  it("«Ninguna es mi prenda» suma varias de una vez", () => {
    expect(marcarVariasRevisadas(["wide"], ["wide", "corto"])).toEqual(["wide", "corto"]);
  });
});

describe("candado de dinero (ADR-0126): ninguna salida lleva precio ni costo", () => {
  it("ni la alerta, ni la tarjeta, ni la hoja, ni el aviso del nombre", () => {
    const l = resultado([par(lara, "identico", "mismo_nombre", "Mismo nombre"), par(corto, "parecida", "mismo_modelo", "x", "SS25 311"), par(ancho, "casi_igual", "una_letra", "Una letra", "79-SS24"), par(nube)]);
    const e = entrada({ marca: "La Femme 21", categoria: "Camisas y Blusas", nombre: "Camisa Lara", resultado: l });
    const todo = JSON.stringify([
      armarAlerta(e),
      armarAlerta({ ...e, resultado: jirish() }),
      armarAlerta({ ...e, fallo: true }),
      armarAlerta({ ...e, cargando: true }),
      armarAvisoNombre({ resultado: l, marca: "La Femme 21", categoria: "Camisas y Blusas", cargando: false, fallo: false }),
      armarHoja({ resultado: l, marca: "La Femme 21", categoria: "Camisas y Blusas", alcance: "lista", revisadas: [], busqueda: "", buscar: buscarDemo, rotuloTiempo, fallo: false }),
    ]);
    // «\bS\/» y no «S/» a secas: «productos/lara/editar» termina en «s/» y no es un precio.
    expect(todo).not.toMatch(/\bS\/|precio|costo|margen/i);
  });
  it("y nada de jerga en pantalla: ni «umbral», ni «duplicado», ni «coincidencia», ni «la base», ni «mismo modelo» como veredicto", () => {
    const l = resultado([par(corto, "parecida", "mismo_modelo", fraseDeMotivo("mismo_modelo", "Wide Leg Corto"), "SS25 311"), par(ancho, "casi_igual", "una_letra", fraseDeMotivo("una_letra"), "79-SS24")]);
    const ident = resultado([par(lara, "identico", "mismo_nombre", "Mismo nombre")]);
    const otra = resultado([par(ancho, "identico", "mismo_nombre", "Mismo nombre")]);
    const todo = JSON.stringify([
      armarAlerta(entrada({ nombre: "Wide Leg", resultado: l })),
      armarAlerta(entrada({ nombre: "Wide Leg", resultado: l, fallo: true })),
      armarAlerta(entrada({ marca: "La Femme 21", categoria: "Camisas y Blusas", nombre: "Camisa Lara", resultado: ident })),
      armarAlerta(entrada({ marca: "Pilar", nombre: "Wide Leg", resultado: otra })),
      armarAvisoNombre({ resultado: ident, marca: "La Femme 21", categoria: "Camisas y Blusas", cargando: false, fallo: false }),
      armarAvisoNombre({ resultado: otra, marca: "Pilar", categoria: "Jeans", cargando: false, fallo: false }),
      hoja({ resultado: l }),
      hoja({ resultado: l, busqueda: "corto" }),
      hoja({ resultado: l, busqueda: "palabra que nadie usa" }),
      hoja({ resultado: resultado([]), fallo: true }),
      // Todo texto fijo y toda frase con dato: los componentes no escriben los suyos.
      TEXTO,
      [FRASE.yMas(2), FRASE.filaAria("Wide Leg", "Disp. 2"), FRASE.deshacerAria("Wide Leg"), FRASE.fotoAlt("Wide Leg"), FRASE.esElMismoAria("Wide Leg"), FRASE.noEsOtroAria("Wide Leg"), FRASE.coincideEn("tejido")],
    ]);
    expect(todo).not.toMatch(/umbral|duplicad|coincidencia|puntaje|es la misma|son distintas|la base|mismo modelo|es nueva/i);
  });
});

describe("hrefProducto", () => {
  it("lleva a la ficha del existente, donde ya están «Agregar tallas» y «Agregar colores»", () => {
    expect(hrefProducto("abc")).toBe("/productos/abc/editar");
  });
});
