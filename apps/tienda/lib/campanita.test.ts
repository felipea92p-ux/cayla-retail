import { describe, expect, it } from "vitest";
import {
  armarCampanita,
  cookieDelDia,
  diasEntre,
  etiquetaCampanita,
  LLEGADAS_EN_LA_CAMPANITA,
  leerDia,
  nombreCookieCampanita,
  novedadesDesde,
  textoDia,
  textoGlobo,
  textoLlegadasMas,
  textoNovedades,
} from "./campanita";
import type { AvisoClub } from "./inicio-aviso";

const HOY = { anio: 2026, mes: 10, dia: 17 };
const prenda = (dias: number | null | "no") => ({ nuevo: dias === "no" ? null : { dias } });

const llego = (n: number, extra: Partial<AvisoClub> = {}): AvisoClub => ({
  clave: `llego-abcdef12-${n}`,
  tipo: "llego",
  icono: "campana",
  titulo: `Blusa ${n} ya llegó`,
  texto: "Negro · Talla M. Hay en Trujillo: sepárala antes de que se acabe.",
  href: `/catalogo/modelo-${n}`,
  ...extra,
});
const cumple: AvisoClub = { clave: "cumple-abcdef12-2026-10-31", tipo: "cumple", icono: "regalo", titulo: "Tu mes", texto: "10 %" };

describe("el día de la última mirada", () => {
  it("se escribe y se lee igual, y una cookie rara no cuenta como visita", () => {
    expect(textoDia({ anio: 2026, mes: 3, dia: 5 })).toBe("2026-03-05");
    expect(leerDia("2026-03-05")).toEqual({ anio: 2026, mes: 3, dia: 5 });
    for (const rara of [undefined, null, "", "ayer", "2026-3-5", "2026-02-30", "2026-13-01", "2026-10-17T10:00", "9999-99-99"]) expect(leerDia(rara)).toBeNull();
  });

  it("cuenta días de calendario, también entre meses y años, y sale negativo si el reloj anda atrasado", () => {
    expect(diasEntre({ anio: 2026, mes: 10, dia: 14 }, HOY)).toBe(3);
    expect(diasEntre({ anio: 2026, mes: 9, dia: 30 }, { anio: 2026, mes: 10, dia: 1 })).toBe(1);
    expect(diasEntre({ anio: 2025, mes: 12, dia: 31 }, { anio: 2026, mes: 1, dia: 1 })).toBe(1);
    expect(diasEntre(HOY, HOY)).toBe(0);
    expect(diasEntre(HOY, { anio: 2026, mes: 10, dia: 15 })).toBe(-2);
  });
});

describe("las novedades desde la última mirada", () => {
  it("sin mirada anterior no hay número: no se sabe qué es nuevo PARA ELLA (el primer globo no dice «298»)", () => {
    expect(novedadesDesde([prenda(0), prenda(3), prenda(20)], null, HOY)).toBeNull();
  });

  it("si miró hoy, 0 (aunque el catálogo traiga prendas de hoy: ya las vio o llegan mañana a la cuenta)", () => {
    expect(novedadesDesde([prenda(0), prenda(1)], HOY, HOY)).toBe(0);
  });

  it("cuenta solo lo que llegó DESPUÉS del día de la mirada: miró el 14, hoy es 17 → llegaron el 15, 16 y 17 (hace 2, 1 y 0 días), no el 14", () => {
    const visto = { anio: 2026, mes: 10, dia: 14 };
    const prendas = [prenda(0), prenda(1), prenda(2), prenda(3), prenda(4), prenda(30)];
    expect(novedadesDesde(prendas, visto, HOY)).toBe(3);
  });

  it("una prenda fijada en la Vitrina sin fecha, o que no es de Lo nuevo, no cuenta", () => {
    const visto = { anio: 2026, mes: 10, dia: 10 };
    expect(novedadesDesde([prenda(null), prenda("no"), prenda(1)], visto, HOY)).toBe(1);
  });

  it("con el reloj del aparato atrasado (mirada «en el futuro») no inventa novedades", () => {
    expect(novedadesDesde([prenda(0), prenda(1)], { anio: 2026, mes: 10, dia: 20 }, HOY)).toBe(0);
  });

  it("no depende del orden ni cambia el catálogo recibido", () => {
    const prendas = [prenda(5), prenda(0), prenda(2)];
    const copia = JSON.stringify(prendas);
    expect(novedadesDesde(prendas, { anio: 2026, mes: 10, dia: 14 }, HOY)).toBe(2);
    expect(JSON.stringify(prendas)).toBe(copia);
  });
});

describe("la cookie de la campanita", () => {
  it("es de cada persona (sus 8 primeras letras) para que dos personas en un aparato no se pisen", () => {
    expect(nombreCookieCampanita("ABCDEF12-3456-4789-8abc-def012345678")).toBe("tienda-campanita-abcdef12");
  });

  it("anota el día de hoy, vale en toda la tienda, dura 400 días y solo es «Secure» en https", () => {
    const http = cookieDelDia("tienda-campanita-abcdef12", HOY, false);
    expect(http).toBe("tienda-campanita-abcdef12=2026-10-17; Path=/; Max-Age=34560000; SameSite=Lax");
    expect(cookieDelDia("tienda-campanita-abcdef12", HOY, true)).toBe(`${http}; Secure`);
  });

  it("lo que escribe es lo que `leerDia` entiende", () => {
    const valor = /=([^;]+);/.exec(cookieDelDia("x", HOY, false))![1];
    expect(leerDia(valor)).toEqual(HOY);
  });
});

describe("lo que muestra la campanita", () => {
  it("solo cuentan las tallas que llegaron: el cumpleaños y el vale ya los dice el aviso del Inicio", () => {
    const d = armarCampanita([cumple, llego(1)], new Set(), null);
    expect(d.llegadas.map((f) => f.clave)).toEqual(["llego-abcdef12-1"]);
    expect(d.globo).toBe(1);
  });

  it("el globo suma las tallas sin ver y las novedades; las ya cerradas con «Entendido» siguen en el panel pero no suman", () => {
    const d = armarCampanita([llego(1), llego(2), llego(3)], new Set(["llego-abcdef12-2"]), 4);
    expect(d.globo).toBe(2 + 4);
    expect(d.llegadas.map((f) => [f.clave, f.sinVer])).toEqual([
      ["llego-abcdef12-1", true],
      ["llego-abcdef12-3", true],
      ["llego-abcdef12-2", false],
    ]);
  });

  it("sin nada: sin globo, y sin número de novedades si nunca miró", () => {
    expect(armarCampanita([], new Set(), null)).toEqual({ llegadas: [], llegadasMas: 0, novedades: null, globo: 0 });
    expect(armarCampanita([], new Set(), 0).globo).toBe(0);
  });

  it("si la base no contestó (null) no hay tallas, pero las novedades se ven igual", () => {
    expect(armarCampanita(null, new Set(), 3)).toEqual({ llegadas: [], llegadasMas: 0, novedades: 3, globo: 3 });
  });

  it("nombra hasta cuatro tallas y cuenta las demás", () => {
    const seis = [1, 2, 3, 4, 5, 6].map((n) => llego(n));
    const d = armarCampanita(seis, new Set(), null);
    expect(d.llegadas).toHaveLength(LLEGADAS_EN_LA_CAMPANITA);
    expect(d.llegadasMas).toBe(2);
    expect(d.globo).toBe(6);
  });

  it("una talla sin el modelo (una base anterior) lleva a «Mi perfil», nunca a un enlace roto", () => {
    const d = armarCampanita([llego(1, { href: undefined })], new Set(), null);
    expect(d.llegadas[0].href).toBe("/cuenta");
  });
});

describe("las palabras", () => {
  it("el botón dice cuántos hay sin ver", () => {
    expect(etiquetaCampanita(0)).toBe("Avisos");
    expect(etiquetaCampanita(1)).toBe("Avisos: 1 nuevo");
    expect(etiquetaCampanita(5)).toBe("Avisos: 5 nuevos");
  });

  it("el globo no pasa de «9+» (mide 18 px)", () => {
    expect(textoGlobo(3)).toBe("3");
    expect(textoGlobo(9)).toBe("9");
    expect(textoGlobo(10)).toBe("9+");
    expect(textoGlobo(298)).toBe("9+");
  });

  it("Lo nuevo, en una línea: singular, plural, y sin nada o sin dato, «Nada nuevo» (sin inventar un número)", () => {
    expect(textoNovedades(1)).toBe("1 prenda nueva");
    expect(textoNovedades(3)).toBe("3 prendas nuevas");
    expect(textoNovedades(0)).toBe("Nada nuevo");
    expect(textoNovedades(null)).toBe("Nada nuevo");
  });

  it("las tallas que no se nombran", () => {
    expect(textoLlegadasMas(1)).toBe("Y llegó 1 talla más que esperabas: mírala en Mi perfil.");
    expect(textoLlegadasMas(2)).toBe("Y llegaron 2 tallas más que esperabas: míralas en Mi perfil.");
  });
});
