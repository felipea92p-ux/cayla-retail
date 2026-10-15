import { describe, expect, it } from "vitest";
import { TODOS } from "./pildora-reglas";
import {
  ESTADO_POR_DEFECTO,
  MAX_RESPUESTA,
  OPCIONES_ESTADO,
  accionPrincipal,
  cifrasDe,
  deQuien,
  esFiltroEstado,
  estadoDe,
  filtrar,
  hrefFicha,
  leerRecomendaciones,
  letras,
  opcionesSobre,
  pideReleer,
  problemaParaConfirmar,
  sePuedeResponder,
  sobreQue,
  textoLimpio,
  type Recomendacion,
} from "./recomendaciones-reglas";

const TRU = { id: "11111111-1111-4111-8111-111111111111", nombre: "Tienda Trujillo" };
const LIM = { id: "22222222-2222-4222-8222-222222222222", nombre: "Tienda Lima" };
const ANA = { ficha_id: "33333333-3333-4333-8333-333333333333", nombre: "Ana María Pérez" };

/** Una fila como la manda `fn_recomendaciones`. */
const cruda = (cambios: Record<string, unknown> = {}) => ({
  id: "44444444-4444-4444-8444-444444444444",
  texto: "Pongan más tallas grandes",
  creada_en: "2026-10-15T15:00:00+00:00",
  tienda: TRU,
  cliente: ANA,
  leida_en: null,
  leida_por: null,
  respuesta: null,
  respondida_en: null,
  respondida_por: null,
  archivada_en: null,
  archivada_por: null,
  ...cambios,
});

/** Una ya leída por la pantalla. */
function rec(cambios: Partial<Recomendacion> = {}, n = 1): Recomendacion {
  const base = leerRecomendaciones({ ve_fichas: true, tiendas: [TRU], hay_mas: false, recomendaciones: [cruda()] })!.recomendaciones[0]!;
  return { ...base, id: `44444444-4444-4444-8444-${String(n).padStart(12, "0")}`, ...cambios };
}

describe("lo que devuelve fn_recomendaciones", () => {
  it("se lee en tipos: el cliente con su ficha, la tienda, los «quién y cuándo»", () => {
    const l = leerRecomendaciones({
      ve_fichas: false,
      tiendas: [TRU, LIM],
      hay_mas: true,
      recomendaciones: [cruda({ leida_en: "2026-10-15T16:00:00+00:00", leida_por: "Rosa Prueba" })],
    });
    expect(l?.veFichas).toBe(false);
    expect(l?.hayMas).toBe(true);
    expect(l?.tiendas).toEqual([TRU, LIM]);
    expect(l?.recomendaciones[0]).toMatchObject({
      texto: "Pongan más tallas grandes",
      tienda: TRU,
      cliente: { fichaId: ANA.ficha_id, nombre: ANA.nombre },
      leidaPor: "Rosa Prueba",
      respuesta: null,
    });
  });

  it("sin cliente (ficha anonimizada) y sin tienda (CAYLA en general) se leen como tales", () => {
    const r = leerRecomendaciones({ ve_fichas: true, tiendas: [], hay_mas: false, recomendaciones: [cruda({ cliente: null, tienda: null })] })!
      .recomendaciones[0]!;
    expect(r.cliente).toBeNull();
    expect(r.tienda).toBeNull();
    expect(deQuien(r)).toBe("Sin nombre (ficha anonimizada)");
    expect(sobreQue(r)).toBe("CAYLA en general");
  });

  it("una fila rara no se muestra a medias (se deja fuera); una forma rara entera no se lee", () => {
    const l = leerRecomendaciones({
      ve_fichas: true,
      tiendas: [TRU, { id: "no-uuid", nombre: "X" }],
      hay_mas: false,
      recomendaciones: [cruda(), cruda({ id: "x" }), cruda({ creada_en: "ayer" }), cruda({ cliente: { nombre: "Sin ficha" } }), cruda({ tienda: { id: TRU.id } }), 7],
    });
    expect(l?.recomendaciones).toHaveLength(1);
    expect(l?.tiendas).toEqual([TRU]);
    expect(leerRecomendaciones(null)).toBeNull();
    expect(leerRecomendaciones({ ve_fichas: true, tiendas: [], recomendaciones: [] })).toBeNull();
    expect(leerRecomendaciones({ ve_fichas: "si", tiendas: [], hay_mas: false, recomendaciones: [] })).toBeNull();
  });
});

describe("el estado de cada una", () => {
  it("archivada manda; si no, respondida, leída o sin leer", () => {
    expect(estadoDe(rec())).toBe("sin_leer");
    expect(estadoDe(rec({ leidaEn: "2026-10-15T16:00:00Z" }))).toBe("leida");
    expect(estadoDe(rec({ leidaEn: "2026-10-15T16:00:00Z", respuesta: "Gracias" }))).toBe("respondida");
    expect(estadoDe(rec({ leidaEn: "2026-10-15T16:00:00Z", respuesta: "Gracias", archivadaEn: "2026-10-15T17:00:00Z" }))).toBe("archivada");
  });

  it("solo se responde una sin respuesta, en la bandeja y con nombre", () => {
    expect(sePuedeResponder(rec())).toBe(true);
    expect(sePuedeResponder(rec({ respuesta: "Ya" }))).toBe(false);
    expect(sePuedeResponder(rec({ archivadaEn: "2026-10-15T17:00:00Z" }))).toBe(false);
    expect(sePuedeResponder(rec({ cliente: null }))).toBe(false);
  });
});

describe("las cifras", () => {
  it("sin leer, respondidas, archivadas y las del mes de Lima (un instante de la madrugada UTC del 1 es del mes anterior en Lima)", () => {
    const lista = [
      rec({}, 1),
      rec({ leidaEn: "2026-10-02T10:00:00Z" }, 2),
      rec({ leidaEn: "2026-10-02T10:00:00Z", respuesta: "Gracias" }, 3),
      rec({ leidaEn: "2026-10-02T10:00:00Z", respuesta: "Gracias", archivadaEn: "2026-10-03T10:00:00Z" }, 4),
      rec({ creadaEn: "2026-10-01T03:00:00Z" }, 5), // 30 de setiembre a las 22:00 en Lima
      rec({ creadaEn: "2026-09-20T15:00:00Z", leidaEn: "2026-09-21T10:00:00Z", archivadaEn: "2026-09-22T10:00:00Z" }, 6),
    ];
    expect(cifrasDe(lista, "2026-10-15")).toEqual({ sinLeer: 2, respondidas: 2, delMes: 4, archivadas: 2, enBandeja: 4 });
    expect(cifrasDe([], "2026-10-15")).toEqual({ sinLeer: 0, respondidas: 0, delMes: 0, archivadas: 0, enBandeja: 0 });
  });
});

describe("los filtros y la búsqueda", () => {
  const lista = [
    rec({ texto: "Más tallas grandes en Trujillo" }, 1),
    rec({ texto: "Abran en Piura", tienda: null, leidaEn: "2026-10-15T16:00:00Z" }, 2),
    rec({ texto: "Mejor atención en Lima", tienda: LIM, leidaEn: "2026-10-15T16:00:00Z", respuesta: "Gracias, José" }, 3),
    rec({ texto: "Una vieja", leidaEn: "2026-10-15T16:00:00Z", archivadaEn: "2026-10-15T17:00:00Z" }, 4),
    rec({ texto: "Sin nombre", cliente: null }, 5),
  ];
  const ids = (l: Recomendacion[]) => l.map((r) => Number(r.id.slice(-1)));
  const sin = (estado: Parameters<typeof filtrar>[1]["estado"], sobre = TODOS, q = "") => ids(filtrar(lista, { estado, sobre, q }));

  it("por estado: la bandeja (lo de siempre) es todo lo no archivado", () => {
    expect(ESTADO_POR_DEFECTO).toBe("bandeja");
    expect(sin("bandeja")).toEqual([1, 2, 3, 5]);
    expect(sin("sin_leer")).toEqual([1, 5]);
    expect(sin("leidas")).toEqual([2]);
    expect(sin("respondidas")).toEqual([3]);
    expect(sin("archivadas")).toEqual([4]);
    expect(sin("todas")).toEqual([1, 2, 3, 4, 5]);
  });

  it("cada opción de la píldora es un estado que se entiende", () => {
    for (const o of OPCIONES_ESTADO) expect(esFiltroEstado(o.valor)).toBe(true);
    expect(esFiltroEstado("cualquiera")).toBe(false);
  });

  it("por tienda: todas, CAYLA en general o una tienda", () => {
    const opciones = opcionesSobre([TRU, LIM]);
    expect(opciones.map((o) => o.texto)).toEqual(["Todas", "CAYLA en general", "Tienda Trujillo", "Tienda Lima"]);
    expect(sin("todas", opciones[1]!.valor)).toEqual([2]);
    expect(sin("todas", LIM.id)).toEqual([3]);
    expect(sin("todas", TRU.id)).toEqual([1, 4, 5]);
  });

  it("buscar sin tildes ni mayúsculas, en el texto, el nombre y la respuesta", () => {
    expect(sin("todas", TODOS, "PIURA")).toEqual([2]);
    expect(sin("todas", TODOS, "atencion")).toEqual([3]);
    expect(sin("todas", TODOS, "jose")).toEqual([3]);
    expect(sin("todas", TODOS, "maría")).toEqual([1, 2, 3, 4]);
    expect(sin("bandeja", TODOS, "  ")).toEqual([1, 2, 3, 5]);
  });
});

describe("la respuesta", () => {
  it("se limpia como la limpia la base (fn_recomendacion_texto): los mismos casos que prueba la base", () => {
    expect(textoLimpio("  Pongan​   más   tallas\r\n\r\n\r\ngrandes  ")).toBe("Pongan más tallas\n\ngrandes");
    expect(textoLimpio("  Hola\t\tmundo  \r\n\r\n\r\n\r\notra   línea​ con‮raro  ")).toBe("Hola mundo\n\notra línea conraro");
    expect(textoLimpio("   \n\t  ")).toBe("");
  });

  it("las letras se cuentan como la base: un emoji es una", () => {
    expect(letras("Gracias 🙌")).toBe(9);
    expect(letras("a   b")).toBe(3);
  });

  it("lo que falta para confirmar: sin leer, vacía vale (la marca leída); ya leída, falta; de 2 a 400 letras", () => {
    const sinLeer = rec();
    const leida = rec({ leidaEn: "2026-10-15T16:00:00Z" });
    expect(problemaParaConfirmar(sinLeer, "")).toBeNull();
    expect(problemaParaConfirmar(leida, "")).toMatch(/Escribe tu respuesta/);
    expect(problemaParaConfirmar(sinLeer, "a")).toBe("Escribe tu respuesta.");
    expect(problemaParaConfirmar(sinLeer, "ok")).toBeNull();
    expect(problemaParaConfirmar(leida, "b".repeat(MAX_RESPUESTA))).toBeNull();
    expect(problemaParaConfirmar(leida, "b".repeat(MAX_RESPUESTA + 1))).toBe("Te pasaste por 1 letra: acórtala un poco.");
    expect(problemaParaConfirmar(leida, "b".repeat(MAX_RESPUESTA + 3))).toBe("Te pasaste por 3 letras: acórtala un poco.");
    // Respondida, archivada o sin nombre: solo se archiva o se saca del archivo, no hay respuesta que pedir.
    expect(problemaParaConfirmar(rec({ respuesta: "Ya" }), "")).toBeNull();
    expect(problemaParaConfirmar(rec({ archivadaEn: "2026-10-15T17:00:00Z" }), "")).toBeNull();
    expect(problemaParaConfirmar(rec({ cliente: null }), "")).toBeNull();
  });

  it("el botón principal: responder con texto, marcar leída sin texto y sin leer, nada si ya no se responde", () => {
    expect(accionPrincipal(rec(), "")).toBe("leer");
    expect(accionPrincipal(rec(), "Gracias")).toBe("responder");
    expect(accionPrincipal(rec({ leidaEn: "2026-10-15T16:00:00Z" }), "")).toBe("responder");
    expect(accionPrincipal(rec(), "​")).toBe("leer");
    expect(accionPrincipal(rec({ respuesta: "Ya" }), "Otra")).toBeNull();
    expect(accionPrincipal(rec({ archivadaEn: "2026-10-15T17:00:00Z" }), "Hola")).toBeNull();
    expect(accionPrincipal(rec({ cliente: null }), "Hola")).toBeNull();
  });

  it("lo que dice la base y pide releer la lista", () => {
    expect(pideReleer("recomendacion_ya_respondida")).toBe(true);
    expect(pideReleer("recomendacion_no_existe")).toBe(true);
    expect(pideReleer("recomendacion_sin_nombre")).toBe(true);
    expect(pideReleer("recomendacion_respuesta_larga")).toBe(false);
    expect(pideReleer(null)).toBe(false);
  });
});

describe("la ficha del cliente", () => {
  it("lleva a Clientes buscando su nombre (como desde el Historial de ventas)", () => {
    expect(hrefFicha("Ana María Pérez")).toBe("/clientas?q=Ana+Mar%C3%ADa+P%C3%A9rez");
  });
});
