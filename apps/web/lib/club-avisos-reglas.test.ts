import { describe, expect, it } from "vitest";
import {
  INFO_TIPO_AVISO,
  TIPOS_AVISO,
  agruparPorTipo,
  celularAMedias,
  claveDelAviso,
  contarPorTipo,
  enlaceWhatsAppWeb,
  leerAvisos,
  marcadoresSinCompletar,
  mismoCelular,
  primerNombre,
  problemaParaEnviar,
  sePuedeDeshacer,
  textoParaEnviar,
  type FilaAvisoPendiente,
} from "./club-avisos-reglas";

const fila = (extra: Partial<FilaAvisoPendiente> = {}): FilaAvisoPendiente => ({
  clienta_id: "c1",
  nombre: "LUCÍA PAREDES SOTO",
  telefono: "987654321",
  tipo: "cumpleanos",
  referencia: "2026",
  texto: "Feliz cumpleaños, Lucía.",
  detalle: "Cumple el 14 de octubre",
  ...extra,
});

describe("leerAvisos: las filas de fn_club_avisos_pendientes, sin confiar en ellas", () => {
  it("arma la fila con su clave por socia, tipo y referencia", () => {
    const [a] = leerAvisos([fila()]);
    expect(a).toEqual({
      clave: "c1:cumpleanos:2026",
      clientaId: "c1",
      nombre: "LUCÍA PAREDES SOTO",
      telefono: "987654321",
      tipo: "cumpleanos",
      referencia: "2026",
      texto: "Feliz cumpleaños, Lucía.",
      detalle: "Cumple el 14 de octubre",
    });
    expect(a!.clave).toBe(claveDelAviso("c1", "cumpleanos", "2026"));
  });

  it("un tipo que esta web no conoce (una base más nueva) no se muestra", () => {
    expect(leerAvisos([fila({ tipo: "te_extranamos" }), fila({ tipo: "rebaja", referencia: "p9" })]).map((a) => a.tipo)).toEqual(["rebaja"]);
  });

  it("la misma socia, tipo y referencia sale una vez; otra referencia del mismo tipo es otro aviso", () => {
    const avisos = leerAvisos([fila(), fila(), fila({ tipo: "rebaja", referencia: "p1" }), fila({ tipo: "rebaja", referencia: "p2" })]);
    expect(avisos.map((a) => a.clave)).toEqual(["c1:cumpleanos:2026", "c1:rebaja:p1", "c1:rebaja:p2"]);
  });

  it("sin nombre, sin teléfono, sin texto o sin detalle no se cae", () => {
    const [a] = leerAvisos([fila({ nombre: "  ", telefono: null, texto: null, detalle: " ", referencia: null })]);
    expect(a).toMatchObject({ nombre: "Socia sin nombre", telefono: null, texto: "", detalle: null, referencia: "" });
  });
});

describe("agrupar y contar por tipo", () => {
  const avisos = leerAvisos([
    fila({ clienta_id: "a", tipo: "rebaja", referencia: "p1" }),
    fila({ clienta_id: "b", tipo: "cumpleanos" }),
    fila({ clienta_id: "c", tipo: "rebaja", referencia: "p1" }),
    fila({ clienta_id: "d", tipo: "aniversario", referencia: "v1" }),
  ]);

  it("los grupos salen en el orden del club (cupones primero) y sin grupos vacíos; dentro, el orden de llegada", () => {
    expect(agruparPorTipo(avisos).map((g) => [g.tipo, g.avisos.map((a) => a.clientaId)])).toEqual([
      ["cumpleanos", ["b"]],
      ["aniversario", ["d"]],
      ["rebaja", ["a", "c"]],
    ]);
  });

  it("cuenta los cuatro tipos aunque alguno sea 0, y el total", () => {
    expect(contarPorTipo(avisos)).toEqual({ cumpleanos: 1, aniversario: 1, novedades: 0, rebaja: 2, total: 4 });
    expect(contarPorTipo([])).toEqual({ cumpleanos: 0, aniversario: 0, novedades: 0, rebaja: 0, total: 0 });
  });

  it("cada tipo tiene su texto, y solo novedades y rebajas cuentan para el tope de 2 al mes (CL-21)", () => {
    for (const t of TIPOS_AVISO) expect(INFO_TIPO_AVISO[t].titulo.length).toBeGreaterThan(3);
    expect(TIPOS_AVISO.filter((t) => INFO_TIPO_AVISO[t].promocional)).toEqual(["novedades", "rebaja"]);
  });
});

describe("el celular", () => {
  it("en pantalla va a medias, venga como venga escrito", () => {
    expect(celularAMedias("987654321")).toBe("9•• ••• 321");
    expect(celularAMedias("+51 987 654 321")).toBe("9•• ••• 321");
    expect(celularAMedias("01 234 5678")).toBe("Sin celular");
    expect(celularAMedias(null)).toBe("Sin celular");
  });

  it("el mismo número escrito de dos formas es uno (la BAJA vale por número)", () => {
    expect(mismoCelular("987654321", "+51 987 654 321")).toBe(true);
    expect(mismoCelular("987654321", "987654322")).toBe(false);
    expect(mismoCelular(null, null)).toBe(false);
  });
});

describe("enlaceWhatsAppWeb: WhatsApp Web con el número y el texto listos (G-8)", () => {
  it("abre web.whatsapp.com con el 51 y el texto codificado", () => {
    expect(enlaceWhatsAppWeb("987 654 321", "Hola Lucía & co.\n¿Vienes?")).toBe(
      "https://web.whatsapp.com/send?phone=51987654321&text=Hola%20Luc%C3%ADa%20%26%20co.%0A%C2%BFVienes%3F",
    );
  });

  it("sin un celular peruano no hay enlace: no se adivina a quién escribirle", () => {
    expect(enlaceWhatsAppWeb("12345", "Hola")).toBeNull();
    expect(enlaceWhatsAppWeb(null, "Hola")).toBeNull();
  });
});

describe("el texto que se manda", () => {
  it("completa {nombre} con su primer nombre y {tienda} con la tienda que envía", () => {
    expect(textoParaEnviar("Hola {nombre}, te escribimos de CAYLA {tienda}. {nombre}, te esperamos.", { nombre: "LUCÍA PAREDES", tienda: " Trujillo " })).toBe(
      "Hola Lucía, te escribimos de CAYLA Trujillo. Lucía, te esperamos.",
    );
  });

  it("si la base ya los completó, no cambia nada", () => {
    expect(textoParaEnviar("Hola Lucía.", { nombre: "Otra", tienda: "Lima" })).toBe("Hola Lucía.");
  });

  it("el primer nombre va con mayúscula inicial", () => {
    expect(primerNombre("  maría  josé ")).toBe("María");
    expect(primerNombre("")).toBe("");
  });

  it("lista los marcadores que quedaron sin completar, sin repetir", () => {
    expect(marcadoresSinCompletar("Tienes {pct}% · {pct} · {codigo}")).toEqual(["{pct}", "{codigo}"]);
    expect(marcadoresSinCompletar("Sin marcadores")).toEqual([]);
  });
});

describe("problemaParaEnviar: un aviso que no se manda así", () => {
  it("se manda con celular peruano y texto completo", () => {
    expect(problemaParaEnviar("987654321", "Feliz cumpleaños, Lucía.")).toBeNull();
  });
  it("sin celular válido, sin texto o con un marcador suelto, no", () => {
    expect(problemaParaEnviar("123", "Hola")).toMatch(/celular/);
    expect(problemaParaEnviar("987654321", "  ")).toMatch(/sin texto/);
    expect(problemaParaEnviar("987654321", "Tienes {pct}% este mes")).toMatch(/\{pct\}/);
  });
});

describe("Deshacer dura 10 minutos", () => {
  const enviado = Date.parse("2026-10-01T15:00:00Z");
  it("se puede justo después y hasta antes de los 10 minutos", () => {
    expect(sePuedeDeshacer(enviado, enviado)).toBe(true);
    expect(sePuedeDeshacer(enviado, enviado + 9 * 60_000 + 59_000)).toBe(true);
  });
  it("a los 10 minutos ya no; con el reloj movido hacia atrás, tampoco", () => {
    expect(sePuedeDeshacer(enviado, enviado + 10 * 60_000)).toBe(false);
    expect(sePuedeDeshacer(enviado, enviado - 1000)).toBe(false);
  });
});
