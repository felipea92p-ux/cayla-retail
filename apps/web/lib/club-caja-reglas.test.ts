import { describe, expect, it } from "vitest";
import {
  CLUB_APAGADO,
  CONSULTA_CARTEL_HASTA_MS,
  cajaDelClub,
  camposDeRegistrar,
  celularLegible,
  clubDeLaCaja,
  esperaDelCartel,
  estadoEnLaLibreta,
  filaDelCartel,
  lineaDeLaClientaEnCaja,
  problemaCelularOpcional,
  textoCumple,
  type ClubDeLaCaja,
  type HojaRegistrar,
  type LecturaClub,
} from "./club-caja-reglas";
import { estadosDe, sePuedeConfirmar } from "./guia-campos";
import type { ResumenClientaCaja } from "./club-acciones";

const TEXTOS = [
  { tipo: "club" as const, version: 2, texto: "Te unes al Club CAYLA…" },
  { tipo: "mensaje_personal" as const, version: 2, texto: "Hola CAYLA, quiero novedades. (Club {codigo})" },
  { tipo: "mensaje_generico" as const, version: 2, texto: "Hola CAYLA, quiero unirme al club." },
];
const CLUB: ClubDeLaCaja = { textos: TEXTOS, whatsappTienda: "987654321" };

const resumen = (parte: Partial<ResumenClientaCaja> = {}): ResumenClientaCaja => ({
  esSocia: false,
  codigoClub: null,
  clubDesde: null,
  conPublicidad: false,
  celular: null,
  cumpleDia: null,
  cumpleMes: null,
  cumpleDisponible: false,
  cumplePct: 10,
  cumpleCanjeadoEsteAnio: false,
  cumpleCanjeadoEl: null,
  aniversarioDisponible: false,
  aniversarioMonto: null,
  aniversarioVence: null,
  ...parte,
});
const listo = (parte: Partial<ResumenClientaCaja> = {}): LecturaClub => ({ estado: "listo", resumen: resumen(parte) });

describe("club en la caja (ADR-0288 tanda 1b): lo que llega del servidor", () => {
  it("se queda con los tres textos que conoce y con un número de tienda que es un celular", () => {
    const c = clubDeLaCaja([...TEXTOS, { tipo: "otro", version: 1, texto: "x" }, { tipo: "club", version: 3, texto: "  " }], " 987 654 321 ");
    expect(c.textos.map((t) => t.tipo)).toEqual(["club", "mensaje_personal", "mensaje_generico"]);
    expect(c.whatsappTienda).toBe("987654321");
    expect(clubDeLaCaja(TEXTOS, "12345").whatsappTienda).toBeNull();
  });

  it("si la lectura falló llega apagado, y la venta sigue igual (principio 9)", () => {
    expect(clubDeLaCaja(null, null)).toEqual(CLUB_APAGADO);
  });
});

describe("la caja de la clienta en Cobrar (spike del club, `clientaDelTicketHTML`; tanda 1g)", () => {
  const ficha = { documentoNumero: "45871236" };
  const base = { ficha };

  it("mientras lee, si falló o sin clienta, no muestra nada del club", () => {
    for (const lectura of [{ estado: "sin_leer" }, { estado: "leyendo" }, { estado: "fallo" }] as LecturaClub[]) {
      expect(cajaDelClub({ ...base, lectura })).toEqual({ tipo: "nada" });
    }
  });

  it("una socia se ve con su código, su publicidad y su cumpleaños", () => {
    expect(cajaDelClub({ ...base, lectura: listo({ esSocia: true, codigoClub: "c-0142", cumpleDia: 12, cumpleMes: 9 }) })).toEqual({
      tipo: "socia",
      codigo: "C-0142",
      publicidad: "sin",
      cumple: "Cumple el 12 de setiembre",
    });
    const conPublicidad = cajaDelClub({ ...base, lectura: listo({ esSocia: true, codigoClub: "C-0142", conPublicidad: true }) });
    expect(conPublicidad).toMatchObject({ publicidad: "activa", cumple: null });
    // Una socia de legado sin código también.
    expect(cajaDelClub({ ...base, lectura: listo({ esSocia: true }) })).toMatchObject({ codigo: null, publicidad: "sin" });
  });

  it("a quien no es socia se le pide escanear el cartel (G-2); sin documento en su ficha, la fila lo dice", () => {
    expect(cajaDelClub({ ...base, lectura: listo() })).toEqual({ tipo: "identificada", sinDocumento: false });
    expect(cajaDelClub({ ficha: { documentoNumero: null }, lectura: listo() })).toEqual({ tipo: "identificada", sinDocumento: true });
    expect(cajaDelClub({ ficha: { documentoNumero: "  " }, lectura: listo() })).toEqual({ tipo: "identificada", sinDocumento: true });
  });

  it("la línea de abajo: documento a medias, celular legible (el más fresco) y el código si es socia", () => {
    const c = { id: "1", nombre: "María Quispe", documentoTipo: "dni" as const, documentoNumero: "45871236", celular: "987654321" };
    expect(lineaDeLaClientaEnCaja(c, null, "C-0142")).toEqual({ titulo: "María Quispe", detalle: "DNI 45•••236 · Cel. 987 654 321 · C-0142" });
    expect(lineaDeLaClientaEnCaja(c, "911222333", null).detalle).toBe("DNI 45•••236 · Cel. 911 222 333");
    expect(lineaDeLaClientaEnCaja({ ...c, celular: null }, null, null).detalle).toBe("DNI 45•••236");
  });

  it("el cumpleaños se lee con el mes en palabras; sin día o sin mes, no hay fecha", () => {
    expect(textoCumple(1, 1)).toBe("Cumple el 1 de enero");
    expect(textoCumple(null, 3)).toBeNull();
    expect(textoCumple(3, 13)).toBeNull();
  });

  it("en el buscador, cada ficha dice si es miembro", () => {
    expect(estadoEnLaLibreta("2026-09-30T10:00:00Z")).toBe("Miembro");
    expect(estadoEnLaLibreta(null)).toBe("Identificado");
    expect(estadoEnLaLibreta(undefined)).toBe("Identificado");
  });
});

describe("el celular en la caja", () => {
  it("se lee de a tres cifras, también a medio escribir o pegado con +51", () => {
    expect(celularLegible("987654321")).toBe("987 654 321");
    expect(celularLegible("9876")).toBe("987 6");
    expect(celularLegible("+51 987 654 321")).toBe("987 654 321");
    expect(celularLegible("")).toBe("");
  });

  it("al editarlo es opcional, pero si se escribe, bien escrito", () => {
    expect(problemaCelularOpcional("")).toBeNull();
    expect(problemaCelularOpcional("987654321")).toBeNull();
    expect(problemaCelularOpcional("98765")).toMatch(/9 dígitos/);
  });
});

describe("«Pídele que escanee el cartel del club» (tanda 1g)", () => {
  it("pregunta cada 3 s con la pestaña a la vista; oculta, pausa; a los 10 minutos, vence", () => {
    expect(esperaDelCartel({ visible: true, desdeMs: 0, ahoraMs: 3_000 })).toBe("esperando");
    expect(esperaDelCartel({ visible: false, desdeMs: 0, ahoraMs: 3_000 })).toBe("pausada");
    expect(esperaDelCartel({ visible: true, desdeMs: 0, ahoraMs: CONSULTA_CARTEL_HASTA_MS - 1 })).toBe("esperando");
    expect(esperaDelCartel({ visible: true, desdeMs: 0, ahoraMs: CONSULTA_CARTEL_HASTA_MS })).toBe("vencida");
    expect(esperaDelCartel({ visible: false, desdeMs: 0, ahoraMs: CONSULTA_CARTEL_HASTA_MS })).toBe("vencida");
  });

  it("la fila dice por qué le conviene (el % sale de la base) y que se actualiza sola", () => {
    const f = filaDelCartel({ sinDocumento: false, espera: "esperando", cumplePct: 12.5 });
    expect(f.destacado).toBe("Pídele que escanee el cartel del club");
    expect(f.bajada).toBe("Gana 12.5 % en su cumpleaños y un vale cada aniversario · se actualiza sola");
    expect(f).toMatchObject({ actualizar: false, consultar: true });
    expect(filaDelCartel({ sinDocumento: false, espera: "esperando", cumplePct: null }).bajada).toMatch(/^Gana 10 %/);
  });

  it("pausada no pregunta; vencida ofrece «Actualizar»", () => {
    expect(filaDelCartel({ sinDocumento: false, espera: "pausada", cumplePct: 10 })).toMatchObject({ actualizar: false, consultar: false });
    const vencida = filaDelCartel({ sinDocumento: false, espera: "vencida", cumplePct: 10 });
    expect(vencida).toMatchObject({ actualizar: true, consultar: false });
    expect(vencida.bajada).toMatch(/¿Ya se unió\? Toca «Actualizar»/);
  });

  it("sin documento en su ficha no espera: al unirse desde el cartel caería en otra ficha", () => {
    const f = filaDelCartel({ sinDocumento: true, espera: "esperando", cumplePct: 10 });
    expect(f).toMatchObject({ actualizar: false, consultar: false });
    expect(f.bajada).toMatch(/complétalo en Clientes/);
  });
});

describe("la guía de foco de «Registrar cliente» (Cobrar y Nueva clienta): el documento y, opcional, el celular para su boleta", () => {
  const lista: HojaRegistrar = {
    documentoTipo: "dni",
    documentoNumero: "45871236",
    nombre: "MARIA QUISPE",
    celular: "",
    responsableListo: true,
    responsableMotivo: null,
  };

  it("con documento, nombre y quién registra, se puede registrar: el celular es opcional y el cumpleaños ya no se pide", () => {
    const c = camposDeRegistrar(lista);
    expect(sePuedeConfirmar(c)).toBe(true);
    expect(c.map((x) => x.id)).toEqual(["documento", "celular", "responsable"]);
    expect(estadosDe(c)).toMatchObject({ documento: "hecho", celular: "opcional", responsable: "hecho" });
  });

  it("el celular vacío no se lista como «falta» ni apaga el botón: no es sugerido, es opcional de verdad", () => {
    const c = camposDeRegistrar(lista);
    const celular = c.find((x) => x.id === "celular")!;
    expect(celular).toMatchObject({ requerido: false, hecho: false });
    expect(celular.sugerido).toBeUndefined();
  });

  it("un celular bien escrito queda hecho, y uno a medias o mal escrito bloquea (la base lo rechazaría con la ficha entera)", () => {
    const bien = camposDeRegistrar({ ...lista, celular: "987654321" });
    expect(estadosDe(bien).celular).toBe("hecho");
    expect(sePuedeConfirmar(bien)).toBe(true);
    for (const malo of ["9876", "887654321", "98765432"]) {
      const c = camposDeRegistrar({ ...lista, celular: malo });
      expect(sePuedeConfirmar(c), malo).toBe(false);
      expect(c.find((x) => x.id === "celular")!.pendiente).toMatch(/9 dígitos y empieza con 9/);
    }
  });

  it("el celular va antes de quién registra: «Quién registra» sigue siendo el último paso", () => {
    expect(camposDeRegistrar(lista).at(-1)!.id).toBe("responsable");
  });

  it("con DNI el nombre vive en el bloque del documento: sin él, lo que falta se llama «Nombre»", () => {
    const c = camposDeRegistrar({ ...lista, nombre: "" });
    expect(sePuedeConfirmar(c)).toBe(false);
    expect(c.find((x) => x.id === "documento")?.nombre).toBe("Nombre");
    expect(c.some((x) => x.id === "nombre")).toBe(false);
  });

  it("con carné o pasaporte el nombre es su propio bloque", () => {
    const c = camposDeRegistrar({ ...lista, documentoTipo: "carne_extranjeria", documentoNumero: "001234567", nombre: "" });
    expect(estadosDe(c)).toMatchObject({ documento: "hecho", nombre: "ahora" });
    expect(sePuedeConfirmar(c)).toBe(false);
  });

  it("un nombre de menos de 3 letras no alcanza (spike, `modalRegistrar`)", () => {
    expect(sePuedeConfirmar(camposDeRegistrar({ ...lista, documentoTipo: "pasaporte", documentoNumero: "AB123456", nombre: "Lu" }))).toBe(false);
    expect(sePuedeConfirmar(camposDeRegistrar({ ...lista, documentoTipo: "pasaporte", documentoNumero: "AB123456", nombre: "Lucía" }))).toBe(true);
  });

  it("sin documento, con uno mal escrito o sin quién registra, no se registra", () => {
    expect(sePuedeConfirmar(camposDeRegistrar({ ...lista, documentoNumero: "" }))).toBe(false);
    const mal = camposDeRegistrar({ ...lista, documentoNumero: "4587" });
    expect(sePuedeConfirmar(mal)).toBe(false);
    expect(mal[0]!.pendiente).toMatch(/8 dígitos/);
    const sinQuien = camposDeRegistrar({ ...lista, responsableListo: false, responsableMotivo: "¿Quién está atendiendo?" });
    expect(sePuedeConfirmar(sinQuien)).toBe(false);
    expect(sinQuien.at(-1)!.pendiente).toBe("¿Quién está atendiendo?");
  });
});

