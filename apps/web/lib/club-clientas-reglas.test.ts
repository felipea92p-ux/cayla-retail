import { describe, expect, it } from "vitest";
import {
  ajustarAnio,
  cambiaDeCelular,
  cumpleLegible,
  estadoCumple,
  faltaParaSerSocia,
  FILTROS_CLUB,
  MESES_CUMPLE,
  pasaFiltroClub,
  leerMensaje,
  normalizarMensaje,
  pideBaja,
  problemaAnio,
  queHacerConElMensaje,
  textoEstadoClub,
} from "./club-clientas-reglas";

// Los mensajes que ella envía desde el QR (textos v2 de la «Actualización 2026-09-30» del ADR-0288).
const PERSONAL =
  "Hola CAYLA, quiero recibir por WhatsApp novedades, rebajas y mi saludo de cumpleaños. Sé que me doy de baja escribiendo BAJA. (Club C-0142)";
const GENERICO =
  "Hola CAYLA, quiero unirme al Club CAYLA y recibir por WhatsApp novedades, rebajas y mi saludo de cumpleaños. Sé que me doy de baja escribiendo BAJA.";

const fecha = (iso: string) => iso.slice(0, 10);
type FichaDePrueba = {
  cumpleMes: number | null;
  clubDesde: string | null;
  publicidadDesde: string | null;
  codigoClub: string | null;
  documentoNumero: string | null;
  nombre: string | null;
  telefonoWhatsapp: string | null;
};
const ficha = (o: Partial<FichaDePrueba> = {}): FichaDePrueba => ({
  cumpleMes: null,
  clubDesde: null,
  publicidadDesde: null,
  codigoClub: null,
  documentoNumero: null,
  nombre: null,
  telefonoWhatsapp: null,
  ...o,
});

describe("textoEstadoClub — la ficha dice dónde está frente al club", () => {
  it("no socia", () => {
    expect(textoEstadoClub(ficha(), fecha)).toEqual({ titulo: "No es del club", detalle: null, corto: "No es del club" });
  });

  it("socia sin publicidad: desde cuándo y su código; aclara que las novedades las pide ella", () => {
    const t = textoEstadoClub(ficha({ clubDesde: "2026-09-30T10:00:00Z", codigoClub: "c-0142" }), fecha);
    expect(t.titulo).toBe("Socia desde 2026-09-30 · C-0142");
    expect(t.corto).toBe("C-0142 · Socia");
    expect(t.detalle).toContain("QR");
  });

  it("socia con publicidad", () => {
    const t = textoEstadoClub(ficha({ clubDesde: "2026-09-30T10:00:00Z", publicidadDesde: "2026-10-01T10:00:00Z", codigoClub: "C-0142" }), fecha);
    expect(t.titulo).toBe("Socia · recibe novedades por WhatsApp");
    expect(t.corto).toBe("C-0142 · Con novedades");
    expect(t.detalle).toBe("C-0142 · socia desde 2026-09-30 · novedades desde 2026-10-01");
  });

  it("una socia de legado sin código no deja un « · » colgando", () => {
    expect(textoEstadoClub(ficha({ clubDesde: "2026-09-30T10:00:00Z" }), fecha).corto).toBe("Socia");
  });
});

describe("cumpleaños con año opcional (CL-3)", () => {
  it("se lee con o sin año", () => {
    expect(cumpleLegible(12, 3, null)).toBe("12/3");
    expect(cumpleLegible(12, 3, 1990)).toBe("12/3/1990");
    expect(cumpleLegible(null, 3, 1990)).toBe("—");
  });

  it("la caja del año solo guarda 4 cifras", () => {
    expect(ajustarAnio("19a90x5")).toBe("1990");
  });

  it("vacío está bien; si se escribe, 4 cifras entre 1900 y hoy", () => {
    expect(problemaAnio("", 2026)).toBeNull();
    expect(problemaAnio("1990", 2026)).toBeNull();
    expect(problemaAnio("2026", 2026)).toBeNull();
    expect(problemaAnio("199", 2026)).not.toBeNull();
    expect(problemaAnio("1899", 2026)).not.toBeNull();
    expect(problemaAnio("2027", 2026)).not.toBeNull();
  });
});

describe("leerMensaje — qué pide la clienta que escribió", () => {
  it("normaliza sin tildes, signos ni emojis", () => {
    expect(normalizarMensaje("  ¡BAJA! 🙏 ")).toBe("baja");
    expect(normalizarMensaje("Darme  de   baja.")).toBe("darme de baja");
  });

  it("la baja es el mensaje ENTERO: BAJA, baja., STOP, «darme de baja»", () => {
    for (const t of ["BAJA", "baja", "Baja.", "  baja 🙏", "STOP", "stop!", "Darme de baja", "Quiero darme de baja"]) expect(pideBaja(t), t).toBe(true);
  });

  it("los mensajes del QR NO son una baja, aunque digan «escribiendo BAJA»", () => {
    expect(pideBaja(PERSONAL)).toBe(false);
    expect(pideBaja(GENERICO)).toBe(false);
    expect(pideBaja("¿la blusa baja de precio?")).toBe(false);
  });

  it("el mensaje personal trae su código; el genérico no", () => {
    expect(leerMensaje(PERSONAL)).toEqual({ pide: "novedades", codigo: "C-0142" });
    expect(leerMensaje(GENERICO)).toEqual({ pide: "novedades", codigo: null });
    expect(leerMensaje("BAJA")).toEqual({ pide: "baja", codigo: null });
  });

  it("un número de celular en el mensaje no se confunde con un código", () => {
    expect(leerMensaje("Hola, mi número es 987654321").codigo).toBeNull();
  });
});

describe("cambiaDeCelular — si escribió desde otro número", () => {
  it("compara los 9 dígitos, sin fijarse en espacios ni +51", () => {
    expect(cambiaDeCelular("987 654 321", "+51 987654321")).toBe(false);
    expect(cambiaDeCelular("987654321", "912345678")).toBe(true);
    expect(cambiaDeCelular(null, "912345678")).toBe(true);
  });
});

describe("queHacerConElMensaje — qué función del club corresponde", () => {
  const socia = ficha({ clubDesde: "2026-09-30", codigoClub: "C-0142", documentoNumero: "71234482", nombre: "Ana Pérez", telefonoWhatsapp: "987654321" });

  it("una baja es siempre una baja, haya ficha o no", () => {
    expect(queHacerConElMensaje("baja", null, "987654321")).toEqual({ accion: "baja" });
    expect(queHacerConElMensaje("baja", socia, "987654321")).toEqual({ accion: "baja" });
  });

  it("sin ficha (cartel, ticket sin clienta): se le pide el documento en el chat", () => {
    expect(queHacerConElMensaje("novedades", null, "987654321")).toEqual({ accion: "pedir_documento", completaFicha: false });
  });

  it("socia sin publicidad: se registra su mensaje, y avisa si escribió desde otro número", () => {
    expect(queHacerConElMensaje("novedades", socia, "987654321")).toEqual({ accion: "registrar_mensaje", cambiaCelular: false });
    expect(queHacerConElMensaje("novedades", socia, "912345678")).toEqual({ accion: "registrar_mensaje", cambiaCelular: true });
  });

  it("socia que ya tiene la publicidad: nada que registrar, salvo que escribiera desde otro número (pasa a ser su celular)", () => {
    expect(queHacerConElMensaje("novedades", { ...socia, publicidadDesde: "2026-10-01" }, "987654321")).toEqual({ accion: "ya_tiene_publicidad" });
    expect(queHacerConElMensaje("novedades", { ...socia, publicidadDesde: "2026-10-01" }, "912345678")).toEqual({ accion: "registrar_mensaje", cambiaCelular: true });
  });

  it("ficha que no es socia: con documento y nombre se une con ellos; si le falta uno, se le pide y se completa SU ficha (CL-1)", () => {
    const noSocia = ficha({ documentoNumero: "71234482", nombre: "Ana Pérez", telefonoWhatsapp: "987654321" });
    expect(queHacerConElMensaje("novedades", noSocia, "987654321")).toEqual({ accion: "unir_con_su_documento" });
    expect(queHacerConElMensaje("novedades", { ...noSocia, documentoNumero: null }, "987654321")).toEqual({ accion: "pedir_documento", completaFicha: true });
    expect(queHacerConElMensaje("novedades", { ...noSocia, nombre: "  " }, "987654321")).toEqual({ accion: "pedir_documento", completaFicha: true });
  });
});

describe("faltaParaSerSocia — CL-1: documento, nombre y celular", () => {
  it("con documento y nombre no falta nada (el celular se pide al unirla)", () => {
    expect(faltaParaSerSocia({ documentoNumero: "71234482", nombre: "Ana" })).toBeNull();
  });

  it("dice qué falta, en palabras", () => {
    expect(faltaParaSerSocia({ documentoNumero: null, nombre: "Ana" })).toContain("documento:");
    expect(faltaParaSerSocia({ documentoNumero: "71234482", nombre: null })).toContain("nombre:");
    expect(faltaParaSerSocia({ documentoNumero: null, nombre: "" })).toContain("documento y nombre");
  });
});

describe("pasaFiltroClub — el filtro de la lista", () => {
  const identificada = ficha({ telefonoWhatsapp: "987654321" });
  const socia = ficha({ clubDesde: "2026-09-30", codigoClub: "C-0001", telefonoWhatsapp: "987654321" });
  const conPublicidad = { ...socia, publicidadDesde: "2026-10-01" };
  const sinCelular = ficha({ cumpleMes: 9 });

  it("cada filtro deja pasar lo suyo", () => {
    const todas = [identificada, socia, conPublicidad, sinCelular];
    const cuenta = (f: Parameters<typeof pasaFiltroClub>[1]) => todas.filter((c) => pasaFiltroClub(c, f, 9)).length;
    expect(cuenta("todas")).toBe(4);
    expect(cuenta("socias")).toBe(2);
    expect(cuenta("con_publicidad")).toBe(1);
    expect(cuenta("sin_publicidad")).toBe(1);
    expect(cuenta("sin_celular")).toBe(1);
    expect(cuenta("cumplen_este_mes")).toBe(1);
  });

  it("todos los filtros del control están cubiertos (ninguno cae fuera del switch)", () => {
    for (const f of FILTROS_CLUB) expect(typeof pasaFiltroClub(socia, f.valor, 1)).toBe("boolean");
  });
});

describe("estadoCumple — opcional, pero si se empieza, completo", () => {
  it("vacío del todo: ni completo ni problema", () => {
    expect(estadoCumple("", "", "", 2026)).toEqual({ completo: false, problema: null });
  });

  it("día y mes: completo; con año válido también", () => {
    expect(estadoCumple("12", "3", "", 2026)).toEqual({ completo: true, problema: null });
    expect(estadoCumple("12", "3", "1990", 2026)).toEqual({ completo: true, problema: null });
  });

  it("a medias o fuera de rango: dice qué falta", () => {
    expect(estadoCumple("12", "", "", 2026).problema).toBe("Falta el día o el mes.");
    expect(estadoCumple("", "3", "", 2026).problema).toBe("Falta el día o el mes.");
    expect(estadoCumple("32", "3", "", 2026).problema).toBe("El día va del 1 al 31.");
    expect(estadoCumple("", "", "1990", 2026).problema).toBe("Falta el día y el mes.");
    expect(estadoCumple("12", "3", "2030", 2026).completo).toBe(false);
  });

  it("el combo del mes tiene los 12, del 1 al 12", () => {
    expect(MESES_CUMPLE.map((m) => m.valor)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]);
  });
});
