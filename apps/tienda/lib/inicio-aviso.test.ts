import { describe, expect, it } from "vitest";
import { beneficioAniversario, beneficioCumple } from "./club";
import { avisoAlEntrar, avisosDelClub, claveDeCookie, clavesDelNavegador, cookiesQueSobran, nombreCookieAviso, textoDeMas, vidaDeLaCookie } from "./inicio-aviso";

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

// Lo que devuelve `retail.tienda_mis_avisos_del_club` (20261015045000).
const RESPUESTA = {
  cumple: { pct: 10, hasta: "2026-10-31" },
  vale: { monto: 20, vence: "2026-12-14", aniversario: "2026-10-15" },
  llegaron: [llego(1), llego(2, { sede: null }), { id: "raro" }],
};

describe("lo que está a favor de la persona", () => {
  it("el cumpleaños, el vale y lo que llegó, en ese orden, cada uno con su clave (con dueño) y su ícono; una espera rara se deja fuera", () => {
    const a = avisosDelClub(RESPUESTA, USUARIO, HOY)!;
    expect(a.map((x) => [x.tipo, x.clave, x.icono])).toEqual([
      ["cumple", "cumple-abcdef12-2026-10-31", "regalo"],
      ["vale", "vale-abcdef12-2026-12-14", "ticket"],
      ["llego", `llego-abcdef12-${E(1)}`, "campana"],
      ["llego", `llego-abcdef12-${E(2)}`, "campana"],
    ]);
  });

  it("el cumpleaños y el vale se dicen con las MISMAS palabras de «Mi cuenta»", () => {
    const [cumple, vale] = avisosDelClub(RESPUESTA, USUARIO, HOY)!;
    const deLaCuenta = beneficioCumple({ estado: "disponible", dia: 3, mes: 10, pct: 10, hasta: "2026-10-31", canjeadoEl: null }, true, HOY);
    expect([cumple.titulo, cumple.texto]).toEqual([deLaCuenta.titulo, deLaCuenta.texto]);
    expect(cumple.texto).toContain("hasta el 31 de octubre");
    const valeDeLaCuenta = beneficioAniversario(
      {
        estado: "vale",
        valeMonto: 20,
        valeVence: "2026-12-14",
        valeCanjeadoEl: null,
        proximo: "2027-10-15",
        anioCuenta: false,
        compras: 2,
        monto: 150,
        comprasMeta: 6,
        montoMeta: 600,
        siguienteMonto: 30,
        dias: 60,
      },
      true,
      HOY,
    );
    expect([vale.titulo, vale.texto]).toEqual([valeDeLaCuenta.titulo, valeDeLaCuenta.texto]);
    expect(vale.titulo).toBe("Tienes un vale de S/ 20");
  });

  it("lo que llegó: qué prenda, su color y talla, y dónde hay (la tienda que esperaba o, si le daba igual, todas las que tienen)", () => {
    const [, , enTrujillo, enCualquiera] = avisosDelClub(RESPUESTA, USUARIO, HOY)!;
    expect(enTrujillo.titulo).toBe("Blusa 1 ya llegó");
    expect(enTrujillo.texto).toBe("Negro · Talla M. Hay en Trujillo: sepárala antes de que se acabe.");
    expect(enCualquiera.texto).toBe("Negro · Talla M. Hay en Lima y Trujillo: sepárala antes de que se acabe.");
    const [sinDatos] = avisosDelClub({ cumple: null, vale: null, llegaron: [llego(3, { color: null, talla: null, sede: null, hay_en: [] })] }, USUARIO, HOY)!;
    expect(sinDatos.texto).toBe("Sepárala antes de que se acabe.");
  });

  it("nada a favor: lista vacía; una respuesta sin forma o sin cuenta: null (no sale ningún aviso a medias)", () => {
    expect(avisosDelClub({ cumple: null, vale: null, llegaron: [] }, USUARIO, HOY)).toEqual([]);
    expect(avisosDelClub(null, USUARIO, HOY)).toBeNull();
    expect(avisosDelClub({ cumple: { pct: "mucho" }, vale: null, llegaron: [] }, USUARIO, HOY)).toBeNull();
  });
});

describe("cuándo sale el aviso", () => {
  const avisos = avisosDelClub(RESPUESTA, USUARIO, HOY)!;

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
    const conOtraTalla = [...avisos, ...avisosDelClub({ cumple: null, vale: null, llegaron: [llego(5)] }, USUARIO, HOY)!];
    expect(avisoAlEntrar(conOtraTalla, cerrados)?.lineas.map((l) => l.titulo)).toEqual(["Blusa 5 ya llegó"]);
    // El cumpleaños del año que viene es otro aviso (otra clave): vuelve a salir.
    const otroAnio = avisosDelClub({ cumple: { pct: 10, hasta: "2027-10-31" }, vale: null, llegaron: [] }, USUARIO, HOY)!;
    expect(avisoAlEntrar(otroAnio, cerrados)?.lineas).toHaveLength(1);
  });

  it("de lo que llegó se nombran tres; las demás se cuentan, y «Entendido» las da a todas por vistas", () => {
    const muchas = avisosDelClub({ cumple: null, vale: null, llegaron: [1, 2, 3, 4, 5].map((n) => llego(n)) }, USUARIO, HOY)!;
    const a = avisoAlEntrar(muchas, new Set())!;
    expect(a.lineas).toHaveLength(3);
    expect(a.mas).toBe(2);
    expect(a.claves).toHaveLength(5);
    expect(textoDeMas(2)).toBe("Y llegaron 2 tallas más que esperabas: míralas en Mi cuenta.");
    expect(textoDeMas(1)).toBe("Y llegó 1 talla más que esperabas: mírala en Mi cuenta.");
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

  it("del navegador solo pasan de 1 a 40 claves con forma de aviso (sin repetir); cualquier otra cosa no escribe nada", () => {
    expect(clavesDelNavegador(["cumple-abcdef12-2026-10-31", "cumple-abcdef12-2026-10-31"])).toEqual(["cumple-abcdef12-2026-10-31"]);
    for (const malo of [[], "cumple-abcdef12-2026-10-31", ["tienda-sesion"], ["cumple-abcdef12-2026-10-31", 3], null, Array(41).fill("cumple-abcdef12-2026-10-31")]) {
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
