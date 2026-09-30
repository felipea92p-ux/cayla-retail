import { describe, expect, it } from "vitest";
import {
  CLUB_APAGADO,
  CUMPLE_VACIO,
  ajustarAnio,
  ajustarDia,
  cajaDelClub,
  camposDeInvitar,
  camposDeRegistrar,
  celularLegible,
  celularParaInvitar,
  clubDeLaCaja,
  clubEnElTicket,
  cumpleDelResumen,
  cumpleParaGuardar,
  destinoDelQr,
  estadoEnLaLibreta,
  lineaDeLaClientaEnCaja,
  OPCIONES_MES_CUMPLE,
  problemaCelular,
  problemaCelularOpcional,
  problemaCumple,
  qrDeLaSocia,
  textoCumple,
  type ClubDeLaCaja,
  type HojaInvitar,
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

describe("la caja de la clienta en Cobrar (spike del club, `clientaDelTicketHTML`)", () => {
  const ficha = { documentoNumero: "45871236", nombre: "María Quispe", celular: "987654321" };
  const base = { puedeInvitar: true, club: CLUB, ahoraNo: false, ficha };

  it("mientras lee, si falló o sin clienta, no muestra nada del club", () => {
    for (const lectura of [{ estado: "sin_leer" }, { estado: "leyendo" }, { estado: "fallo" }] as LecturaClub[]) {
      expect(cajaDelClub({ ...base, lectura })).toEqual({ tipo: "nada" });
    }
  });

  it("una socia se ve con su código, su publicidad y su cumpleaños", () => {
    expect(cajaDelClub({ ...base, lectura: listo({ esSocia: true, codigoClub: "c-0142", cumpleDia: 12, cumpleMes: 9 }) })).toEqual({
      tipo: "socia",
      codigo: "C-0142",
      publicidad: "qr",
      cumple: "Cumple el 12 de setiembre",
    });
    const conPublicidad = cajaDelClub({ ...base, lectura: listo({ esSocia: true, codigoClub: "C-0142", conPublicidad: true }) });
    expect(conPublicidad).toMatchObject({ publicidad: "activa", cumple: null });
  });

  it("sin QR (la tienda sin su WhatsApp o sin mensaje), el chip de publicidad no se puede tocar", () => {
    const socia = listo({ esSocia: true, codigoClub: "C-0142" });
    expect(cajaDelClub({ ...base, club: { ...CLUB, whatsappTienda: null }, lectura: socia })).toMatchObject({ publicidad: "sin_qr" });
    expect(cajaDelClub({ ...base, club: { ...CLUB, textos: TEXTOS.filter((t) => t.tipo !== "mensaje_personal") }, lectura: socia })).toMatchObject({
      publicidad: "sin_qr",
    });
  });

  it("a quien no es socia se la invita en cada compra (CL-8); «Ahora no» deja solo el enlace, en esta venta", () => {
    expect(cajaDelClub({ ...base, lectura: listo({ celular: "987654321" }) })).toEqual({ tipo: "identificada", invitar: { callada: false, falta: null } });
    expect(cajaDelClub({ ...base, ahoraNo: true, lectura: listo() })).toMatchObject({ invitar: { callada: true } });
  });

  it("«· falta su celular» si ni la ficha ni el resumen lo tienen; sin documento o sin nombre, no se puede invitar aquí", () => {
    expect(cajaDelClub({ ...base, ficha: { ...ficha, celular: null }, lectura: listo() })).toMatchObject({ invitar: { falta: "celular" } });
    expect(cajaDelClub({ ...base, ficha: { ...ficha, documentoNumero: null }, lectura: listo() })).toMatchObject({ invitar: { falta: "documento" } });
    expect(cajaDelClub({ ...base, ficha: { ...ficha, nombre: "  " }, lectura: listo() })).toMatchObject({ invitar: { falta: "documento" } });
  });

  it("sin texto `club` o sin el módulo, es «Identificada» sin invitación", () => {
    expect(cajaDelClub({ ...base, club: { ...CLUB, textos: TEXTOS.filter((t) => t.tipo !== "club") }, lectura: listo() })).toEqual({
      tipo: "identificada",
      invitar: null,
    });
    expect(cajaDelClub({ ...base, puedeInvitar: false, lectura: listo() })).toEqual({ tipo: "identificada", invitar: null });
  });

  it("«Ahora no» no esconde a una socia", () => {
    expect(cajaDelClub({ ...base, ahoraNo: true, lectura: listo({ esSocia: true, codigoClub: "C-0001" }) }).tipo).toBe("socia");
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

describe("lo que pide «Invitar»", () => {
  it("el celular arranca con el de la ficha, limpio", () => {
    expect(celularParaInvitar(resumen({ celular: "+51 987 654 321" }), null)).toBe("987654321");
    expect(celularParaInvitar(null, "987 111 222")).toBe("987111222");
    expect(celularParaInvitar(null, null)).toBe("");
  });

  it("el celular es obligatorio y peruano; al registrarla, opcional pero bien escrito", () => {
    expect(problemaCelular("")).toMatch(/Escribe su celular/);
    expect(problemaCelular("98765432")).toMatch(/9 dígitos/);
    expect(problemaCelular("987654321")).toBeNull();
    expect(problemaCelularOpcional("")).toBeNull();
    expect(problemaCelularOpcional("98765")).toMatch(/9 dígitos/);
  });

  it("el celular se lee de a tres cifras, también a medio escribir o pegado con +51", () => {
    expect(celularLegible("987654321")).toBe("987 654 321");
    expect(celularLegible("9876")).toBe("987 6");
    expect(celularLegible("+51 987 654 321")).toBe("987 654 321");
    expect(celularLegible("")).toBe("");
  });

  it("el día y el año solo aceptan cifras; el mes, abreviado como el spike para caber a 375 px", () => {
    expect(ajustarDia("1a2b3")).toBe("12");
    expect(ajustarAnio("19x905")).toBe("1990");
    expect(OPCIONES_MES_CUMPLE).toHaveLength(12);
    expect(OPCIONES_MES_CUMPLE[8]).toEqual({ valor: "9", texto: "sep" });
  });

  it("el cumpleaños no es obligatorio; día y mes van juntos; el año, opcional (CL-3)", () => {
    expect(problemaCumple(CUMPLE_VACIO, 2026)).toBeNull();
    expect(problemaCumple({ dia: "14", mes: "", anio: "" }, 2026)).toMatch(/mes/);
    expect(problemaCumple({ dia: "", mes: "3", anio: "" }, 2026)).toMatch(/día/);
    expect(problemaCumple({ dia: "", mes: "", anio: "1990" }, 2026)).toMatch(/día y el mes/);
    expect(problemaCumple({ dia: "14", mes: "3", anio: "" }, 2026)).toBeNull();
    expect(problemaCumple({ dia: "14", mes: "3", anio: "1990" }, 2026)).toBeNull();
  });

  it("no deja un día que el mes no tiene, ni un año imposible", () => {
    expect(problemaCumple({ dia: "31", mes: "4", anio: "" }, 2026)).toBe("Abril no tiene día 31.");
    expect(problemaCumple({ dia: "30", mes: "2", anio: "" }, 2026)).toBe("Febrero no tiene día 30.");
    // El 29 de febrero sin año vale; con un año que no fue bisiesto, no.
    expect(problemaCumple({ dia: "29", mes: "2", anio: "" }, 2026)).toBeNull();
    expect(problemaCumple({ dia: "29", mes: "2", anio: "1992" }, 2026)).toBeNull();
    expect(problemaCumple({ dia: "29", mes: "2", anio: "1990" }, 2026)).toMatch(/28 días/);
    expect(problemaCumple({ dia: "1", mes: "1", anio: "90" }, 2026)).toMatch(/4 cifras/);
    expect(problemaCumple({ dia: "1", mes: "1", anio: "2031" }, 2026)).toMatch(/no puede ser/);
    expect(problemaCumple({ dia: "1", mes: "1", anio: "1900" }, 2026)).toMatch(/no puede ser/);
  });

  it("lo que viaja a la base: números o null, y el año solo con día y mes", () => {
    expect(cumpleParaGuardar({ dia: "14", mes: "3", anio: "1990" })).toEqual({ cumpleDia: 14, cumpleMes: 3, cumpleAnio: 1990 });
    expect(cumpleParaGuardar({ dia: "14", mes: "3", anio: "" })).toEqual({ cumpleDia: 14, cumpleMes: 3, cumpleAnio: null });
    expect(cumpleParaGuardar(CUMPLE_VACIO)).toEqual({ cumpleDia: null, cumpleMes: null, cumpleAnio: null });
  });

  it("si la ficha ya tenía el cumpleaños, la hoja lo trae", () => {
    expect(cumpleDelResumen(resumen({ cumpleDia: 14, cumpleMes: 3 }))).toEqual({ dia: "14", mes: "3", anio: "" });
    expect(cumpleDelResumen(resumen({ cumpleDia: 14 }))).toEqual(CUMPLE_VACIO);
    expect(cumpleDelResumen(null)).toEqual(CUMPLE_VACIO);
  });
});

describe("la guía de foco de «Invitar» sale de la misma regla que apaga «Unir al club»", () => {
  const lista: HojaInvitar = {
    celular: "987654321",
    cumple: { dia: "12", mes: "9", anio: "" },
    cumpleOmitido: false,
    leido: true,
    responsableListo: true,
    responsableMotivo: null,
  };

  it("con todo, se puede unir y no falta nada", () => {
    const c = camposDeInvitar(lista, 2026);
    expect(sePuedeConfirmar(c)).toBe(true);
    expect(Object.values(estadosDe(c)).every((e) => e === "hecho")).toBe(true);
  });

  it("el celular, el texto leído y quién registra bloquean; el cumpleaños vacío no", () => {
    expect(sePuedeConfirmar(camposDeInvitar({ ...lista, celular: "" }, 2026))).toBe(false);
    expect(sePuedeConfirmar(camposDeInvitar({ ...lista, celular: "98765" }, 2026))).toBe(false);
    expect(sePuedeConfirmar(camposDeInvitar({ ...lista, leido: false }, 2026))).toBe(false);
    expect(sePuedeConfirmar(camposDeInvitar({ ...lista, responsableListo: false }, 2026))).toBe(false);
    const sinCumple = camposDeInvitar({ ...lista, cumple: CUMPLE_VACIO }, 2026);
    expect(sePuedeConfirmar(sinCumple)).toBe(true);
    expect(estadosDe(sinCumple).cumple).toBe("ahora");
  });

  it("«Omitir por ahora» da el cumpleaños por visto; a medias, bloquea aunque se haya omitido", () => {
    expect(estadosDe(camposDeInvitar({ ...lista, cumple: CUMPLE_VACIO, cumpleOmitido: true }, 2026)).cumple).toBe("hecho");
    const aMedias = camposDeInvitar({ ...lista, cumple: { dia: "12", mes: "", anio: "" }, cumpleOmitido: true }, 2026);
    expect(sePuedeConfirmar(aMedias)).toBe(false);
    expect(aMedias.find((c) => c.id === "cumple")?.pendiente).toMatch(/mes/);
  });

  it("lo que sigue es lo primero que falta, en el orden de la hoja", () => {
    const e = estadosDe(camposDeInvitar({ ...lista, celular: "", leido: false }, 2026));
    expect(e).toMatchObject({ celular: "ahora", leido: "falta" });
  });
});

describe("la guía de foco de «Registrar clienta» del ticket", () => {
  const lista: HojaRegistrar = {
    documentoTipo: "dni",
    documentoNumero: "45871236",
    nombre: "MARIA QUISPE",
    celular: "",
    cumple: CUMPLE_VACIO,
    responsableListo: true,
    responsableMotivo: null,
  };

  it("con documento, nombre y quién registra, se puede registrar: el celular y el cumpleaños son sugeridos", () => {
    const c = camposDeRegistrar(lista, 2026);
    expect(sePuedeConfirmar(c)).toBe(true);
    expect(estadosDe(c)).toMatchObject({ documento: "hecho", celular: "ahora", cumple: "falta", responsable: "hecho" });
  });

  it("con DNI el nombre vive en el bloque del documento: sin él, lo que falta se llama «Nombre»", () => {
    const c = camposDeRegistrar({ ...lista, nombre: "" }, 2026);
    expect(sePuedeConfirmar(c)).toBe(false);
    expect(c.find((x) => x.id === "documento")?.nombre).toBe("Nombre");
    expect(c.some((x) => x.id === "nombre")).toBe(false);
  });

  it("con carné o pasaporte el nombre es su propio bloque", () => {
    const c = camposDeRegistrar({ ...lista, documentoTipo: "carne_extranjeria", documentoNumero: "001234567", nombre: "" }, 2026);
    expect(estadosDe(c)).toMatchObject({ documento: "hecho", nombre: "ahora" });
    expect(sePuedeConfirmar(c)).toBe(false);
  });

  it("sin documento, o con uno mal escrito, no se registra", () => {
    expect(sePuedeConfirmar(camposDeRegistrar({ ...lista, documentoNumero: "" }, 2026))).toBe(false);
    const mal = camposDeRegistrar({ ...lista, documentoNumero: "4587" }, 2026);
    expect(sePuedeConfirmar(mal)).toBe(false);
    expect(mal[0]!.pendiente).toMatch(/8 dígitos/);
  });

  it("un celular o un cumpleaños a medio escribir sí bloquean (la base los rechazaría)", () => {
    expect(sePuedeConfirmar(camposDeRegistrar({ ...lista, celular: "98765" }, 2026))).toBe(false);
    expect(sePuedeConfirmar(camposDeRegistrar({ ...lista, cumple: { dia: "", mes: "3", anio: "" } }, 2026))).toBe(false);
    expect(sePuedeConfirmar(camposDeRegistrar({ ...lista, celular: "987654321", cumple: { dia: "14", mes: "3", anio: "1990" } }, 2026))).toBe(true);
  });
});

describe("el QR de la socia (al terminar de invitarla)", () => {
  it("abre el WhatsApp de la tienda con su mensaje y su código", () => {
    expect(destinoDelQr(CLUB)).toBe("wa.me/51987654321");
    expect(destinoDelQr(CLUB_APAGADO)).toBeNull();
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
