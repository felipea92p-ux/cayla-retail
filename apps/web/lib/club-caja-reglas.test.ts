import { describe, expect, it } from "vitest";
import {
  CLUB_APAGADO,
  CONSULTA_QR_HASTA_MS,
  cajaDelClub,
  camposDeInvitar,
  camposDeLlegoSuMensaje,
  camposDeRegistrar,
  caraDelQr,
  celularLegible,
  celularParaInvitar,
  clubDeLaCaja,
  clubEnElTicket,
  cumpleDelResumen,
  debePedirInvitacion,
  destinoDePagina,
  destinoDelQr,
  esperaDelQr,
  estadoEnLaLibreta,
  lineaDeLaClientaEnCaja,
  pieDelQr,
  problemaCelular,
  problemaCelularOpcional,
  qrDeLaSocia,
  textoCumple,
  type ClubDeLaCaja,
  type HojaInvitar,
  type HojaRegistrar,
  type LecturaClub,
} from "./club-caja-reglas";
import { CUMPLE_VACIO } from "./club-cumple-reglas";
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

  it("con el camino B el chip «Sin publicidad · QR» se toca aunque la tienda no tenga WhatsApp: su QR es la página de CAYLA", () => {
    const socia = listo({ esSocia: true, codigoClub: "C-0142" });
    expect(cajaDelClub({ ...base, club: { ...CLUB, whatsappTienda: null }, lectura: socia })).toMatchObject({ publicidad: "qr" });
    expect(cajaDelClub({ ...base, club: CLUB_APAGADO, lectura: socia })).toMatchObject({ publicidad: "qr" });
    // Una socia de legado sin código también: la página no lo necesita.
    expect(cajaDelClub({ ...base, lectura: listo({ esSocia: true }) })).toMatchObject({ codigo: null, publicidad: "qr" });
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

  it("un día que el mes no tiene bloquea igual que en /clientas (una sola regla del cumpleaños)", () => {
    const abril31 = camposDeInvitar({ ...lista, cumple: { dia: "31", mes: "4", anio: "" } }, 2026);
    expect(sePuedeConfirmar(abril31)).toBe(false);
    expect(abril31.find((c) => c.id === "cumple")?.pendiente).toBe("Abril no tiene día 31.");
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

describe("la cara del QR: camino B, con el camino A de respaldo (ADR-0288 act. c)", () => {
  const base = {
    nombre: "María",
    codigo: "C-0142",
    club: CLUB,
    origen: "https://erp.cayla.pe/",
    invitacion: { estado: "sin_pedir" } as const,
    publicidad: null,
    responsableListo: true,
    responsableMotivo: null,
    espera: "esperando" as const,
  };
  const TOKEN = "Ab12_cd34-EF56gh";

  it("sin quién firme, la pide antes de crear la invitación (y no la pide)", () => {
    expect(caraDelQr({ ...base, responsableListo: false, responsableMotivo: "¿Quién está atendiendo?" })).toEqual({
      tipo: "pide_responsable",
      pendiente: "¿Quién está atendiendo?",
    });
    expect(caraDelQr({ ...base, responsableListo: false }).tipo).toBe("pide_responsable");
    expect(debePedirInvitacion({ invitacion: { estado: "sin_pedir" }, publicidad: null, responsableListo: false })).toBe(false);
  });

  it("con quién firme, la pide una sola vez: después ya no está «sin pedir»", () => {
    expect(caraDelQr(base)).toEqual({ tipo: "preparando" });
    expect(debePedirInvitacion({ invitacion: { estado: "sin_pedir" }, publicidad: null, responsableListo: true })).toBe(true);
    expect(debePedirInvitacion({ invitacion: { estado: "lista", token: TOKEN }, publicidad: null, responsableListo: true })).toBe(false);
    expect(debePedirInvitacion({ invitacion: { estado: "fallo", detalle: null }, publicidad: null, responsableListo: true })).toBe(false);
    expect(debePedirInvitacion({ invitacion: { estado: "sin_pedir" }, publicidad: "mensaje", responsableListo: true })).toBe(false);
  });

  it("con la invitación, el QR es su página en el mismo dominio del ERP, y se ve adónde lleva", () => {
    const cara = caraDelQr({ ...base, invitacion: { estado: "lista", token: TOKEN } });
    expect(cara).toMatchObject({
      tipo: "pagina",
      enlace: `https://erp.cayla.pe/club/${TOKEN}`,
      destino: `erp.cayla.pe/club/${TOKEN}`,
      espera: "esperando",
      consultar: true,
    });
    expect(destinoDePagina("http://localhost:3000/club/x")).toBe("localhost:3000/club/x");
  });

  it("pregunta sola solo a la vista y hasta los 10 minutos; después, «¿Ya lo hizo? Actualizar»", () => {
    expect(esperaDelQr({ visible: true, desdeMs: 0, ahoraMs: 3_000 })).toBe("esperando");
    expect(esperaDelQr({ visible: false, desdeMs: 0, ahoraMs: 3_000 })).toBe("pausada");
    expect(esperaDelQr({ visible: true, desdeMs: 0, ahoraMs: CONSULTA_QR_HASTA_MS - 1 })).toBe("esperando");
    expect(esperaDelQr({ visible: true, desdeMs: 0, ahoraMs: CONSULTA_QR_HASTA_MS })).toBe("vencida");
    expect(esperaDelQr({ visible: false, desdeMs: 0, ahoraMs: CONSULTA_QR_HASTA_MS })).toBe("vencida");
    for (const espera of ["pausada", "vencida"] as const) {
      expect(caraDelQr({ ...base, espera, invitacion: { estado: "lista", token: TOKEN } })).toMatchObject({ tipo: "pagina", espera, consultar: false });
    }
  });

  it("al llegar la publicidad: «Listo: María recibe novedades por WhatsApp», diga cómo llegó", () => {
    const porPagina = caraDelQr({ ...base, publicidad: "pagina", invitacion: { estado: "lista", token: TOKEN } });
    expect(porPagina).toMatchObject({ tipo: "listo", etiqueta: "Confirmó", titulo: "Listo: María recibe novedades por WhatsApp" });
    expect(caraDelQr({ ...base, publicidad: "mensaje", invitacion: { estado: "fallo", detalle: null } })).toMatchObject({
      tipo: "listo",
      etiqueta: "Registrado",
      titulo: "Listo: María recibe novedades por WhatsApp",
    });
    // `ya_tiene_publicidad` al crear la invitación.
    expect(caraDelQr({ ...base, publicidad: "ya_tenia" })).toMatchObject({ tipo: "listo", titulo: "Ya recibe novedades" });
    // La publicidad manda aunque falte quién firme: no hay nada más que pedirle.
    expect(caraDelQr({ ...base, publicidad: "pagina", responsableListo: false }).tipo).toBe("listo");
  });

  it("si la invitación falla (sin conexión, cualquier error), sale el QR del WhatsApp de la tienda con «Llegó su mensaje»", () => {
    const cara = caraDelQr({ ...base, invitacion: { estado: "fallo", detalle: "No hay conexión." } });
    expect(cara).toMatchObject({ tipo: "respaldo", destino: "wa.me/51987654321", detalle: "No hay conexión.", aviso: "No se pudo preparar su página de CAYLA." });
    if (cara.tipo === "respaldo") {
      expect(cara.enlace).toBe((qrDeLaSocia(CLUB, "C-0142") as { enlace: string }).enlace);
      expect(cara.como).toContain("Si no se abre la página, que te escriba por WhatsApp");
      expect(cara.como).toContain("Llegó su mensaje");
    }
  });

  it("sin página y sin QR de WhatsApp tampoco se queda sin salida: dice por qué y deja «Llegó su mensaje»", () => {
    const fallo = { estado: "fallo" as const, detalle: null };
    for (const [club, codigo, dice] of [
      [{ ...CLUB, whatsappTienda: null }, "C-0142", /WhatsApp cargado/],
      [{ ...CLUB, textos: TEXTOS.filter((t) => t.tipo !== "mensaje_personal") }, "C-0142", /mensaje del club/],
      [CLUB, null, /código de socia/],
    ] as const) {
      const cara = caraDelQr({ ...base, club, codigo, invitacion: fallo });
      expect(cara).toMatchObject({ tipo: "respaldo", enlace: null, destino: null });
      if (cara.tipo === "respaldo") {
        expect(cara.como).toMatch(dice);
        expect(cara.como).toContain("Llegó su mensaje");
      }
    }
  });
});

describe("la nota de abajo solo promete el QR del ticket si de verdad sale", () => {
  it("con el WhatsApp de la tienda, su mensaje y su código: «En su ticket también sale un QR»", () => {
    expect(pieDelQr(CLUB, "C-0142")).toMatch(/^En su ticket también sale un QR: puede hacerlo en casa\./);
    expect(clubEnElTicket(CLUB, resumen({ esSocia: true, codigoClub: "C-0142" }))).not.toBeNull();
  });

  it("sin número de la tienda, sin mensaje o sin código, el ticket no lo lleva: no se dice", () => {
    for (const [club, codigo] of [
      [{ ...CLUB, whatsappTienda: null }, "C-0142"],
      [{ ...CLUB, textos: TEXTOS.filter((t) => t.tipo !== "mensaje_personal") }, "C-0142"],
      [CLUB, null],
    ] as const) {
      expect(pieDelQr(club, codigo)).toBe("Sin QR no pasa nada: sigue siendo del club, solo que sin publicidad.");
    }
  });
});

describe("«Llegó su mensaje (respaldo)» en Cobrar", () => {
  it("el número (viene con el de su ficha) y quién registra bloquean; es la misma regla del celular", () => {
    const lista = { numero: "987654321", responsableListo: true, responsableMotivo: null };
    expect(sePuedeConfirmar(camposDeLlegoSuMensaje(lista))).toBe(true);
    expect(sePuedeConfirmar(camposDeLlegoSuMensaje({ ...lista, numero: "98765" }))).toBe(false);
    expect(sePuedeConfirmar(camposDeLlegoSuMensaje({ ...lista, responsableListo: false }))).toBe(false);
    expect(camposDeLlegoSuMensaje({ ...lista, numero: "" })[0]!.pendiente).toMatch(/desde el que le escribió/);
    expect(camposDeLlegoSuMensaje({ ...lista, numero: "98765" })[0]!.pendiente).toMatch(/9 dígitos/);
    expect(estadosDe(camposDeLlegoSuMensaje({ ...lista, numero: "" }))).toMatchObject({ numero: "ahora", responsable: "hecho" });
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
