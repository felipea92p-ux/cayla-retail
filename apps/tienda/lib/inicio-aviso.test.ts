import { describe, expect, it } from "vitest";
import { leerMisPuntos } from "./puntos";
import {
  avisoAlEntrar,
  avisosDeRespuestas,
  avisosDelClub,
  claveDeCookie,
  clavesDelNavegador,
  cookiesQueSobran,
  nombreCookieAviso,
  presentacionDelAviso,
  textoDeMas,
  vidaDeLaCookie,
} from "./inicio-aviso";
import type { MiRecomendacion } from "./recomendaciones";

const HOY = { anio: 2026, mes: 10, dia: 14 };
const USUARIO = "abcdef12-3456-4789-8abc-def012345678";
const E = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const llego = (n: number, extra: object = {}) => ({
  id: E(n),
  producto_id: E(9),
  producto: `Blusa ${n}`,
  color: "Negro",
  talla: "M",
  sede: "Trujillo",
  hay_en: ["Lima", "Trujillo"],
  ...extra,
});

// Lo que devuelve `retail.tienda_mis_avisos_del_club` (20261015045000): de ella solo se leen las tallas que llegaron. El 10 % y el vale
// de aniversario (`cumple`, `vale`) se retiraron (programa de puntos): pueden seguir llegando y no se leen.
const RESPUESTA = {
  cumple: { pct: 10, hasta: "2026-10-31" },
  vale: { monto: 20, vence: "2026-12-14", aniversario: "2026-10-15" },
  llegaron: [llego(1), llego(2, { sede: null }), { id: "raro" }],
};
// Lo que devuelve `retail.tienda_mis_puntos`: es su mes con el regalo pendiente, y tiene dos cupones (uno vence en 2 días, otro en 10).
const PUNTOS = leerMisPuntos({
  puntos_por_sol: 1,
  soles_por_100: 5,
  canje_minimo: 200,
  compra_minima_x: 3,
  vigencia_dias: 7,
  regalo_cumple: 100,
  miembro: true,
  saldo: 840,
  valor_saldo: 40,
  regalo_disponible: true,
  cupones: [
    { codigo: "CAY-AAAA-BBBB", puntos: 200, valor: 10, compra_minima: 30, vence_el: "2026-10-16" },
    { codigo: "CAY-CCCC-DDDD", puntos: 400, valor: 20, compra_minima: 60, vence_el: "2026-10-24" },
  ],
  movimientos: [],
});
const SIN_TALLAS = { llegaron: [] };

describe("lo que está a favor de la persona", () => {
  it("el regalo de cumpleaños, el cupón que vence pronto y lo que llegó, en ese orden, cada uno con su clave (con dueño) y su ícono", () => {
    const a = avisosDelClub(RESPUESTA, USUARIO, HOY, PUNTOS)!;
    expect(a.map((x) => [x.tipo, x.clave, x.icono])).toEqual([
      ["cumple", "cumple-abcdef12-2026-10-31", "regalo"],
      ["vale", "vale-abcdef12-2026-10-16", "ticket"],
      ["llego", `llego-abcdef12-${E(1)}`, "campana"],
      ["llego", `llego-abcdef12-${E(2)}`, "campana"],
    ]);
  });

  it("el regalo y el cupón se dicen en palabras de tienda, con los números de la base", () => {
    const [cumple, cupon] = avisosDelClub(SIN_TALLAS, USUARIO, HOY, PUNTOS)!;
    expect(cumple.titulo).toBe("Es tu mes: +100 puntos de regalo");
    expect(cumple.texto).toBe("Se suman con tu primera compra de este mes, en tienda o en la web.");
    expect(cupon.titulo).toBe("Tu cupón de S/\u00a010: vence el 16 de octubre · te quedan 2 días");
    expect(cupon.texto).toMatch(/tus puntos vuelven/);
  });

  it("dos cupones que vencen el mismo día van en un solo aviso; el que vence en más de 3 días no avisa todavía", () => {
    const dos = leerMisPuntos({
      ...{ puntos_por_sol: 1, soles_por_100: 5, canje_minimo: 200, compra_minima_x: 3, vigencia_dias: 7, regalo_cumple: 100 },
      miembro: true,
      saldo: 0,
      regalo_disponible: false,
      cupones: [
        { codigo: "CAY-AAAA-BBBB", puntos: 200, valor: 10, compra_minima: 30, vence_el: "2026-10-15" },
        { codigo: "CAY-EEEE-FFFF", puntos: 300, valor: 15, compra_minima: 45, vence_el: "2026-10-15" },
        { codigo: "CAY-CCCC-DDDD", puntos: 400, valor: 20, compra_minima: 60, vence_el: "2026-10-30" },
      ],
    });
    const a = avisosDelClub(SIN_TALLAS, USUARIO, HOY, dos)!;
    expect(a.map((x) => x.titulo)).toEqual(["Tus 2 cupones (S/\u00a025): vence mañana"]);
  });

  it("sin regalo pendiente, sin ser miembro o sin respuesta de los puntos: solo lo que llegó", () => {
    const sinRegalo = leerMisPuntos({ puntos_por_sol: 1, soles_por_100: 5, canje_minimo: 200, compra_minima_x: 3, vigencia_dias: 7, regalo_cumple: 100, miembro: true, saldo: 0, regalo_disponible: false });
    expect(avisosDelClub(SIN_TALLAS, USUARIO, HOY, sinRegalo)).toEqual([]);
    const noMiembro = leerMisPuntos({ puntos_por_sol: 1, soles_por_100: 5, canje_minimo: 200, compra_minima_x: 3, vigencia_dias: 7, regalo_cumple: 100, miembro: false });
    expect(avisosDelClub(SIN_TALLAS, USUARIO, HOY, noMiembro)).toEqual([]);
    expect(avisosDelClub(RESPUESTA, USUARIO, HOY, null)!.map((x) => x.tipo)).toEqual(["llego", "llego"]);
  });

  it("lo que llegó: qué prenda, su color y talla, y dónde hay (la tienda que esperaba o, si le daba igual, todas las que tienen)", () => {
    const [enTrujillo, enCualquiera] = avisosDelClub(RESPUESTA, USUARIO, HOY)!;
    expect(enTrujillo.titulo).toBe("Blusa 1 ya llegó");
    expect(enTrujillo.texto).toBe("Negro · Talla M. Hay en Trujillo: sepárala antes de que se acabe.");
    expect(enCualquiera.texto).toBe("Negro · Talla M. Hay en Lima y Trujillo: sepárala antes de que se acabe.");
    const [sinDatos] = avisosDelClub({ llegaron: [llego(3, { color: null, talla: null, sede: null, hay_en: [] })] }, USUARIO, HOY)!;
    expect(sinDatos.texto).toBe("Sepárala antes de que se acabe.");
  });

  it("nada a favor: lista vacía; una respuesta sin forma o sin cuenta: null (no sale ningún aviso a medias)", () => {
    expect(avisosDelClub(SIN_TALLAS, USUARIO, HOY)).toEqual([]);
    expect(avisosDelClub(null, USUARIO, HOY)).toBeNull();
    expect(avisosDelClub({ llegaron: "mucho" }, USUARIO, HOY)).toBeNull();
  });
});

describe("cuándo sale el aviso", () => {
  const avisos = avisosDelClub(RESPUESTA, USUARIO, HOY, PUNTOS)!;

  it("sale lo que la persona no cerró; si ya lo cerró todo, no sale", () => {
    expect(avisoAlEntrar(avisos, new Set())?.lineas.map((l) => l.tipo)).toEqual(["cumple", "vale", "llego", "llego"]);
    const sinCumple = avisoAlEntrar(avisos, new Set(["cumple-abcdef12-2026-10-31"]))!;
    expect(sinCumple.lineas.map((l) => l.tipo)).toEqual(["vale", "llego", "llego"]);
    expect(sinCumple.claves).not.toContain("cumple-abcdef12-2026-10-31");
    expect(avisoAlEntrar(avisos, new Set(avisos.map((a) => a.clave)))).toBeNull();
    expect(avisoAlEntrar([], new Set())).toBeNull();
  });

  it("un beneficio nuevo vuelve a sacar el aviso, aunque los demás ya se hayan cerrado", () => {
    const cerrados = new Set(avisos.map((a) => a.clave));
    const conOtraTalla = [...avisos, ...avisosDelClub({ llegaron: [llego(5)] }, USUARIO, HOY)!];
    expect(avisoAlEntrar(conOtraTalla, cerrados)?.lineas.map((l) => l.titulo)).toEqual(["Blusa 5 ya llegó"]);
    // El cumpleaños del año que viene es otro aviso (otra clave: el fin de su mes): vuelve a salir.
    const otroAnio = avisosDelClub(SIN_TALLAS, USUARIO, { anio: 2027, mes: 10, dia: 3 }, PUNTOS)!;
    expect(avisoAlEntrar(otroAnio.filter((a) => a.tipo === "cumple"), cerrados)?.lineas).toHaveLength(1);
  });

  it("de lo que llegó se nombran tres; las demás se cuentan, y «Entendido» las da a todas por vistas", () => {
    const muchas = avisosDelClub({ llegaron: [1, 2, 3, 4, 5].map((n) => llego(n)) }, USUARIO, HOY)!;
    const a = avisoAlEntrar(muchas, new Set())!;
    expect(a.lineas).toHaveLength(3);
    expect(a.mas).toBe(2);
    expect(a.claves).toHaveLength(5);
    expect(textoDeMas(2)).toBe("Y llegaron 2 tallas más que esperabas: míralas en Mi perfil.");
    expect(textoDeMas(1)).toBe("Y llegó 1 talla más que esperabas: mírala en Mi perfil.");
  });
});

describe("la cookie de cada aviso cerrado", () => {
  it("se llama por su aviso, y solo se leen como aviso las que tienen esa forma", () => {
    const clave = `llego-abcdef12-${E(1)}`;
    expect(nombreCookieAviso(clave)).toBe(`tienda-aviso-${clave}`);
    expect(claveDeCookie(nombreCookieAviso(clave))).toBe(clave);
    expect(claveDeCookie("tienda-aviso-cumple-abcdef12-2026-10-31")).toBe("cumple-abcdef12-2026-10-31");
    for (const otra of ["tienda-sesion", "tienda-bolsa", "tienda-aviso-", "tienda-aviso-cumple-2026-10-31", "tienda-aviso-cumple-ABCDEF12-2026-10-31", `tienda-aviso-llego-${E(1)}`]) {
      expect(claveDeCookie(otra), otra).toBeNull();
    }
  });

  it("del navegador solo pasan de 1 a 80 claves con forma de aviso (sin repetir); cualquier otra cosa no escribe nada", () => {
    expect(clavesDelNavegador(["cumple-abcdef12-2026-10-31", "cumple-abcdef12-2026-10-31"])).toEqual(["cumple-abcdef12-2026-10-31"]);
    for (const malo of [[], "cumple-abcdef12-2026-10-31", ["tienda-sesion"], ["cumple-abcdef12-2026-10-31", 3], null, Array.from({ length: 81 }, (_, i) => `respuesta-abcdef12-00000000-0000-4000-8000-${String(i).padStart(12, "0")}`)]) {
      expect(clavesDelNavegador(malo), JSON.stringify(malo)).toBeNull();
    }
  });

  it("«Entendido» borra las cookies de la misma persona cuyo aviso ya no está a su favor; las de otra persona y las demás cookies, no", () => {
    const vieja = `llego-abcdef12-${E(7)}`;
    const deOtra = `llego-99999999-${E(8)}`;
    const nombres = ["tienda-sesion", "tienda-bolsa", nombreCookieAviso("cumple-abcdef12-2026-10-31"), nombreCookieAviso(vieja), nombreCookieAviso(deOtra)];
    expect(cookiesQueSobran(nombres, [`llego-abcdef12-${E(1)}`], ["cumple-abcdef12-2026-10-31", `llego-abcdef12-${E(1)}`])).toEqual([nombreCookieAviso(vieja)]);
  });

  it("dura lo que dura el beneficio: el cumpleaños y el vale, hasta un día después de su último día; lo que llegó, medio año", () => {
    const DIA = 24 * 60 * 60;
    expect(vidaDeLaCookie("cumple-abcdef12-2026-10-31", HOY)).toBe(19 * DIA);
    expect(vidaDeLaCookie("vale-abcdef12-2026-12-14", HOY)).toBe(63 * DIA);
    expect(vidaDeLaCookie("cumple-abcdef12-2026-10-01", HOY)).toBe(DIA);
    expect(vidaDeLaCookie("vale-abcdef12-2030-01-01", HOY)).toBe(400 * DIA);
    expect(vidaDeLaCookie(`llego-abcdef12-${E(1)}`, HOY)).toBe(180 * DIA);
  });
});

describe("«CAYLA te respondió» (hoja nueva de Recomendaciones, decisión #8 A)", () => {
  const mia = (n: number, extra: Partial<MiRecomendacion> = {}): MiRecomendacion => ({
    id: E(n),
    texto: "Podrían tener más tallas grandes",
    creadaEn: "2026-10-01T15:00:00Z",
    sobre: "Trujillo",
    estado: "respondida",
    respuesta: "Hola, Lucía. Gracias por escribirnos: se lo vamos a contar al taller.",
    respondidaEn: "2026-10-13T20:00:00Z",
    ...extra,
  });

  it("las respondidas de los últimos 30 días de Lima, la más nueva primero, con su clave (con dueño) y el camino a leerla", () => {
    const a = avisosDeRespuestas(
      [
        mia(1, { respondidaEn: "2026-10-10T15:00:00Z" }),
        mia(2, { respondidaEn: "2026-10-14T02:00:00Z", sobre: null }), // la noche del 13 en Lima
        mia(3, { respondidaEn: "2026-09-13T15:00:00Z" }), // hace 31 días: ya no
        mia(4, { estado: "leida", respuesta: null, respondidaEn: null }),
        mia(5, { respondidaEn: "2026-09-14T15:00:00Z" }), // hace 30 días: todavía
      ],
      USUARIO,
      HOY,
    );
    expect(a.map((x) => x.clave)).toEqual([`respuesta-abcdef12-${E(2)}`, `respuesta-abcdef12-${E(1)}`, `respuesta-abcdef12-${E(5)}`]);
    expect(a[0]).toMatchObject({
      tipo: "respuesta",
      icono: "chat",
      titulo: "CAYLA te respondió",
      texto: "Sobre CAYLA en general: «Hola, Lucía. Gracias por escribirnos: se lo vamos a contar al taller.»",
      href: "/recomendaciones",
    });
    expect(a[1]!.texto).toMatch(/^Sobre CAYLA Trujillo: «/);
  });

  it("una respuesta larga se corta en una palabra, con «…»; una sin fecha legible no sale", () => {
    const larga = "Gracias por escribirnos. ".repeat(12);
    const [a] = avisosDeRespuestas([mia(1, { respuesta: larga })], USUARIO, HOY);
    expect(a!.texto.endsWith("…»")).toBe(true);
    expect([...a!.texto].length).toBeLessThan(190);
    expect(avisosDeRespuestas([mia(1, { respondidaEn: "ayer" })], USUARIO, HOY)).toEqual([]);
  });

  it("su clave se acepta como cookie de aviso y dura 60 días; en el aviso va después del Club y antes de lo que llegó", () => {
    const clave = `respuesta-abcdef12-${E(1)}`;
    expect(claveDeCookie(nombreCookieAviso(clave))).toBe(clave);
    expect(clavesDelNavegador([clave])).toEqual([clave]);
    expect(vidaDeLaCookie(clave, HOY)).toBe(60 * 24 * 60 * 60);
    const club = avisosDelClub(RESPUESTA, USUARIO, HOY, PUNTOS)!;
    const respuestas = avisosDeRespuestas([mia(1)], USUARIO, HOY);
    const aviso = avisoAlEntrar([...club, ...respuestas], new Set())!;
    expect(aviso.lineas.map((l) => l.tipo)).toEqual(["cumple", "vale", "respuesta", "llego", "llego"]);
  });

  it("la ceja y el enlace siguen lo que trae: solo Club, solo respuestas, o las dos cosas", () => {
    const club = avisosDelClub(RESPUESTA, USUARIO, HOY)!;
    const respuestas = avisosDeRespuestas([mia(1)], USUARIO, HOY);
    expect(presentacionDelAviso(avisoAlEntrar(club, new Set())!)).toEqual({
      ceja: "Club CAYLA · Para ti",
      enlace: { texto: "Ver en Mi perfil", href: "/cuenta" },
      enlaceEnCadaLinea: false,
    });
    expect(presentacionDelAviso(avisoAlEntrar(respuestas, new Set())!)).toEqual({
      ceja: "Para ti",
      enlace: { texto: "Leer en Recomendaciones", href: "/recomendaciones" },
      enlaceEnCadaLinea: false,
    });
    expect(presentacionDelAviso(avisoAlEntrar([...club, ...respuestas], new Set())!)).toMatchObject({
      ceja: "Para ti",
      enlace: { href: "/cuenta" },
      enlaceEnCadaLinea: true,
    });
  });

  it("cerrada con «Entendido», no vuelve; y «Entendido» no borra la cookie de una respuesta que sigue vigente", () => {
    const clave = `respuesta-abcdef12-${E(1)}`;
    expect(avisoAlEntrar(avisosDeRespuestas([mia(1)], USUARIO, HOY), new Set([clave]))).toBeNull();
    const cumple = "cumple-abcdef12-2026-10-31";
    expect(cookiesQueSobran([nombreCookieAviso(clave)], [cumple], [cumple, clave])).toEqual([]);
  });
});
