import { describe, expect, it } from "vitest";
import { tramoValido, type SemanaDeTienda } from "@cayla-retail/shared/horario-de-tienda";
import {
  RANGO_DE_FABRICA, cierresDeSerializados, cierresVigentes, conAperturaEn, conCierre, objecionAlCierre, serializarCierres, sinCierre, conCierreEn, conTecla, corridoPor, minutoDeLaPista, porcentajeDeMinuto, rangoVisible, semanaComoElLunes, tramoPintado, tramoParaAbrir,
} from "./horario-edicion-reglas";

const R = RANGO_DE_FABRICA; // 7 a. m. a 11 p. m. (420 a 1380)
const h = (horas: number) => horas * 60;

describe("de un punto de la pista a una hora", () => {
  it("cae de media en media hora y dentro del rango", () => {
    expect(minutoDeLaPista(0, R)).toBe(h(7));
    expect(minutoDeLaPista(1, R)).toBe(h(23));
    expect(minutoDeLaPista(0.5, R)).toBe(h(15));
    expect(minutoDeLaPista(0.02, R)).toBe(h(7) + 30); // 19 minutos de 960 → redondea a la media hora más cercana
    expect(minutoDeLaPista(0.01, R)).toBe(h(7)); // 10 minutos → a la hora
  });
  it("un gesto que se sale de la pista, o un número raro, no rompe nada", () => {
    expect(minutoDeLaPista(-3, R)).toBe(h(7));
    expect(minutoDeLaPista(9, R)).toBe(h(23));
    expect(minutoDeLaPista(Number.NaN, R)).toBe(h(7));
  });
  it("y de una hora a su lugar en la pista", () => {
    expect(porcentajeDeMinuto(h(7), R)).toBe(0);
    expect(porcentajeDeMinuto(h(15), R)).toBe(50);
    expect(porcentajeDeMinuto(h(2), R)).toBe(0);
    expect(porcentajeDeMinuto(h(24), R)).toBe(100);
  });
});

describe("el rango que se dibuja", () => {
  it("es el de fábrica, y se ensancha solo cuando un horario guardado se sale", () => {
    expect(rangoVisible(Array(7).fill(null))).toEqual(R);
    const s: SemanaDeTienda = [{ abre: h(6) + 30, cierra: h(18) }, null, null, null, null, null, { abre: h(10), cierra: h(23) + 30 }];
    expect(rangoVisible(s)).toEqual({ desde: h(6), hasta: h(24) });
  });
});

describe("pintar sobre un hueco", () => {
  it("va del punto donde se empezó al punto donde se está, en el orden que sea", () => {
    expect(tramoPintado(h(10), h(14), R)).toEqual({ abre: h(10), cierra: h(14) });
    expect(tramoPintado(h(14), h(10), R)).toEqual({ abre: h(10), cierra: h(14) });
  });
  it("con un solo punto queda de media hora, y en el borde derecho crece hacia la izquierda", () => {
    expect(tramoPintado(h(10), h(10), R)).toEqual({ abre: h(10), cierra: h(10) + 30 });
    expect(tramoPintado(h(23), h(23), R)).toEqual({ abre: h(22) + 30, cierra: h(23) });
  });
});

describe("estirar un borde y mover la barra", () => {
  const t = { abre: h(10), cierra: h(21) };
  it("estirar la apertura o el cierre; ninguno pasa al otro, queda siempre media hora", () => {
    expect(conAperturaEn(t, h(9), R)).toEqual({ abre: h(9), cierra: h(21) });
    expect(conAperturaEn(t, h(22), R)).toEqual({ abre: h(20) + 30, cierra: h(21) });
    expect(conCierreEn(t, h(22), R)).toEqual({ abre: h(10), cierra: h(22) });
    expect(conCierreEn(t, h(8), R)).toEqual({ abre: h(10), cierra: h(10) + 30 });
  });
  it("mover la barra la corre entera sin cambiar cuánto dura y sin salirse", () => {
    expect(corridoPor(t, 60, R)).toEqual({ abre: h(11), cierra: h(22) });
    expect(corridoPor(t, h(5), R)).toEqual({ abre: h(12), cierra: h(23) });
    expect(corridoPor(t, -h(9), R)).toEqual({ abre: h(7), cierra: h(18) });
  });
  it("lo que sale de un gesto cualquiera siempre es un tramo que la base acepta", () => {
    for (let a = 0; a <= 1000; a += 37) {
      for (let b = 0; b <= 1000; b += 53) {
        const x = (a / 1000) * 1.3 - 0.15;
        const y = (b / 1000) * 1.3 - 0.15;
        expect(tramoValido(tramoPintado(minutoDeLaPista(x, R), minutoDeLaPista(y, R), R))).toBe(true);
        expect(tramoValido(conAperturaEn(t, minutoDeLaPista(y, R), R))).toBe(true);
        expect(tramoValido(conCierreEn(t, minutoDeLaPista(y, R), R))).toBe(true);
        expect(tramoValido(corridoPor(t, (a - 500) * 3, R))).toBe(true);
      }
    }
  });
});

describe("abrir un día cerrado y copiar el lunes", () => {
  it("se abre de 10 a. m. a 9 p. m., recortado si el rango es más chico", () => {
    expect(tramoParaAbrir(R)).toEqual({ abre: h(10), cierra: h(21) });
    expect(tramoParaAbrir({ desde: h(7), hasta: h(18) })).toEqual({ abre: h(10), cierra: h(18) });
    expect(tramoParaAbrir({ desde: h(7), hasta: h(9) })).toEqual({ abre: h(7), cierra: h(7) + 30 });
  });
  it("«Copiar lunes a todos» da a cada día el horario del lunes; sin lunes abierto, deja todo cerrado", () => {
    const s: SemanaDeTienda = [{ abre: h(9), cierra: h(18) }, null, null, null, null, null, { abre: h(11), cierra: h(14) }];
    const c = semanaComoElLunes(s);
    expect(c.every((d) => d?.abre === h(9) && d.cierra === h(18))).toBe(true);
    expect(c[1]).not.toBe(c[2]); // cada día es suyo: cambiar uno no cambia los demás
    expect(semanaComoElLunes([null, ...s.slice(1)]).every((d) => d === null)).toBe(true);
  });
});

describe("el teclado sobre una barra", () => {
  const t = { abre: h(10), cierra: h(21) };
  it("las flechas la corren; Mayús mueve el cierre; Alt, la apertura; Suprimir cierra el día", () => {
    expect(conTecla(t, "ArrowRight", { mayus: false, alt: false }, R)).toEqual({ abre: h(10) + 30, cierra: h(21) + 30 });
    expect(conTecla(t, "ArrowLeft", { mayus: false, alt: false }, R)).toEqual({ abre: h(9) + 30, cierra: h(20) + 30 });
    expect(conTecla(t, "ArrowRight", { mayus: true, alt: false }, R)).toEqual({ abre: h(10), cierra: h(21) + 30 });
    expect(conTecla(t, "ArrowLeft", { mayus: false, alt: true }, R)).toEqual({ abre: h(9) + 30, cierra: h(21) });
    expect(conTecla(t, "Delete", { mayus: false, alt: false }, R)).toBe("cerrar");
    expect(conTecla(t, "Backspace", { mayus: false, alt: false }, R)).toBe("cerrar");
  });
  it("otra tecla no hace nada", () => {
    expect(conTecla(t, "a", { mayus: false, alt: false }, R)).toBeNull();
    expect(conTecla(t, "Enter", { mayus: false, alt: false }, R)).toBeNull();
  });
});

describe("los cierres por fecha en el borrador", () => {
  const HOY = "2026-10-26";
  it("se guardan como texto, sin repetir y en orden, y vuelven igual; un texto raro es «sin cierres»", () => {
    const t = serializarCierres(["2026-11-02", "2026-10-28", "2026-10-28"]);
    expect(t).toBe('["2026-10-28","2026-11-02"]');
    expect(cierresDeSerializados(t)).toEqual(["2026-10-28", "2026-11-02"]);
    expect(serializarCierres([])).toBe("[]");
    for (const raro of ["", "x", "{}", '["2026-02-30","hoy",3]', "null"]) expect(cierresDeSerializados(raro)).toEqual([]);
  });
  it("dice por qué no se puede cerrar un día", () => {
    expect(objecionAlCierre([], "2026-10-25", HOY)).toBe("Ese día ya pasó.");
    expect(objecionAlCierre([], "2026-02-30", HOY)).toBe("Esa no es una fecha.");
    expect(objecionAlCierre([], "2028-10-26", HOY)).toBe("Ese día está a más de dos años.");
    expect(objecionAlCierre([], "2028-10-25", HOY)).toBeNull(); // 730 días: 2028 es bisiesto
    expect(objecionAlCierre(["2026-10-28"], "2026-10-28", HOY)).toBe("Ese día ya está cerrado.");
    expect(objecionAlCierre(Array.from({ length: 60 }, (_, i) => `2027-01-${String((i % 28) + 1).padStart(2, "0")}-${i}`), "2026-10-28", HOY)).toBe("Caben hasta 60 cierres.");
    expect(objecionAlCierre([], HOY, HOY)).toBeNull();
  });
  it("agregar deja la lista en orden; si no se puede, no cambia nada", () => {
    expect(conCierre(["2026-11-02"], "2026-10-28", HOY)).toEqual(["2026-10-28", "2026-11-02"]);
    expect(conCierre(["2026-11-02"], "2026-11-02", HOY)).toEqual(["2026-11-02"]);
    expect(conCierre(["2026-11-02"], "2026-10-01", HOY)).toEqual(["2026-11-02"]);
  });
  it("quitar saca solo ese día", () => {
    expect(sinCierre(["2026-10-28", "2026-11-02"], "2026-10-28")).toEqual(["2026-11-02"]);
    expect(sinCierre(["2026-11-02"], "2027-01-01")).toEqual(["2026-11-02"]);
  });
  it("lo que se manda a guardar es de hoy en adelante", () => {
    expect(cierresVigentes(["2026-10-25", "2026-10-26", "2026-11-02"], HOY)).toEqual(["2026-10-26", "2026-11-02"]);
  });
});
