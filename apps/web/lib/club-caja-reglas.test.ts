import { describe, expect, it } from "vitest";
import {
  CLUB_APAGADO,
  CONSULTA_CARTEL_HASTA_MS,
  cajaDelClub,
  camposDeRegistrar,
  celularLegible,
  clubDeLaCaja,
  clubEnElTicket,
  esperaDelCartel,
  estadoEnLaLibreta,
  filaDelCartel,
  lineaDeLaClientaEnCaja,
  problemaCelularOpcional,
  qrDeLaSocia,
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

  it("en el buscador, cada ficha dice si es socia", () => {
    expect(estadoEnLaLibreta("2026-09-30T10:00:00Z")).toBe("Socia");
    expect(estadoEnLaLibreta(null)).toBe("Identificada");
    expect(estadoEnLaLibreta(undefined)).toBe("Identificada");
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
    expect(f.bajada).toMatch(/complétalo en Clientas/);
  });
});

describe("la guía de foco de «Registrar clienta» (Cobrar y Nueva clienta): solo el documento (tanda 1g)", () => {
  const lista: HojaRegistrar = {
    documentoTipo: "dni",
    documentoNumero: "45871236",
    nombre: "MARIA QUISPE",
    responsableListo: true,
    responsableMotivo: null,
  };

  it("con documento, nombre y quién registra, se puede registrar: ni celular ni cumpleaños", () => {
    const c = camposDeRegistrar(lista);
    expect(sePuedeConfirmar(c)).toBe(true);
    expect(c.map((x) => x.id)).toEqual(["documento", "responsable"]);
    expect(estadosDe(c)).toMatchObject({ documento: "hecho", responsable: "hecho" });
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

describe("el QR de la socia (al terminar de invitarla)", () => {
  it("abre el WhatsApp de la tienda con su mensaje y su código", () => {
    const qr = qrDeLaSocia(CLUB, "C-0142");
    expect(qr.tipo).toBe("qr");
    if (qr.tipo === "qr") {
      expect(qr.enlace.startsWith("https://wa.me/51987654321?text=")).toBe(true);
      expect(decodeURIComponent(qr.enlace.split("text=")[1]!)).toBe("Hola CAYLA, quiero novedades. (Club C-0142)");
    }
  });

  it("sin número de la tienda no hay QR, y se dice por qué", () => {
    expect(qrDeLaSocia({ ...CLUB, whatsappTienda: null }, "C-0142")).toEqual({ tipo: "sin_numero" });
    expect(qrDeLaSocia({ ...CLUB, textos: [] }, "C-0142")).toEqual({ tipo: "sin_mensaje" });
  });
});

describe("el QR al pie del ticket impreso", () => {
  const texto = (enlace: string) => decodeURIComponent(enlace.split("text=")[1]!);

  it("venta a una socia: el personal, con su código", () => {
    const t = clubEnElTicket(CLUB, resumen({ esSocia: true, codigoClub: "C-0142" }));
    expect(t?.titulo).toBe("Club CAYLA · Socia C-0142");
    expect(texto(t!.enlace)).toContain("(Club C-0142)");
  });

  it("venta sin clienta o a una que no es socia: el genérico", () => {
    expect(texto(clubEnElTicket(CLUB, null)!.enlace)).toBe("Hola CAYLA, quiero unirme al club.");
    expect(texto(clubEnElTicket(CLUB, resumen())!.enlace)).toBe("Hola CAYLA, quiero unirme al club.");
    expect(clubEnElTicket(CLUB, null)?.titulo).toBe("Club CAYLA");
  });

  it("una socia que ya recibe novedades no lleva QR: no hay nada nuevo que pedirle", () => {
    expect(clubEnElTicket(CLUB, resumen({ esSocia: true, codigoClub: "C-0142", conPublicidad: true }))).toBeNull();
  });

  it("sin número de la tienda o sin texto, el ticket sale sin QR del club", () => {
    expect(clubEnElTicket({ ...CLUB, whatsappTienda: null }, null)).toBeNull();
    expect(clubEnElTicket(CLUB_APAGADO, null)).toBeNull();
    expect(clubEnElTicket({ ...CLUB, textos: TEXTOS.filter((t) => t.tipo !== "mensaje_generico") }, null)).toBeNull();
    expect(clubEnElTicket({ ...CLUB, textos: TEXTOS.filter((t) => t.tipo !== "mensaje_personal") }, resumen({ esSocia: true, codigoClub: "C-0142" }))).toBeNull();
  });

  it("el enlace cabe en un QR de 57 módulos (nivel L): con los textos v2, menos de 271 bytes", () => {
    const v2 = clubDeLaCaja(
      [
        {
          tipo: "mensaje_personal",
          version: 2,
          texto:
            "Hola CAYLA, quiero recibir por WhatsApp novedades, rebajas y mi saludo de cumpleaños. Sé que me doy de baja escribiendo BAJA. (Club {codigo})",
        },
        {
          tipo: "mensaje_generico",
          version: 2,
          texto:
            "Hola CAYLA, quiero unirme al Club CAYLA y recibir por WhatsApp novedades, rebajas y mi saludo de cumpleaños. Sé que me doy de baja escribiendo BAJA.",
        },
      ],
      "987654321"
    );
    expect(clubEnElTicket(v2, resumen({ esSocia: true, codigoClub: "C-0142" }))!.enlace.length).toBeLessThan(271);
    expect(clubEnElTicket(v2, null)!.enlace.length).toBeLessThan(271);
  });
});
