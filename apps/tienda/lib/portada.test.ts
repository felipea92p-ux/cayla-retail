import { describe, expect, it } from "vitest";
import { DISENO_DE_SIEMPRE, partirTitulo } from "@cayla-retail/portada";
import {
  anioLima,
  anuncios,
  fechaCorta,
  fechaLarga,
  conFotoDeCasa,
  interpretarPortada,
  pctTexto,
  PORTADA_SIN_DATOS,
} from "./portada";
import { finDeCampana, partesCuenta } from "./cuenta-regresiva";

const ANIVERSARIO = { id: null, nombre: "Aniversario CAYLA", pct: 12, hasta: "2026-10-21", diseno: null, prendas: [] as string[] };
const BOSQUE = { ...DISENO_DE_SIEMPRE, paleta: "bosque" };

describe("interpretarPortada", () => {
  it("acepta lo que devuelve retail.tienda_portada()", () => {
    // Una base de antes del carrusel solo manda `campana`: es la única de la lista.
    expect(interpretarPortada({ campana: ANIVERSARIO })).toEqual({ campana: ANIVERSARIO, campanas: [ANIVERSARIO] });
    expect(interpretarPortada({ campana: { ...ANIVERSARIO, diseno: BOSQUE } }).campana?.diseno).toEqual(BOSQUE);
    expect(interpretarPortada({ campana: { ...ANIVERSARIO, hasta: null } }).campana?.hasta).toBeNull();
    expect(interpretarPortada({ campana: null })).toEqual({ campana: null, campanas: [] });
  });

  it("con el carrusel (actividad 6b): todas en orden, y una rara se salta sin tumbar a las demás", () => {
    const navidad = { ...ANIVERSARIO, nombre: "Navidad", pct: null };
    const leida = interpretarPortada({ campana: ANIVERSARIO, campanas: [ANIVERSARIO, { ...ANIVERSARIO, pct: "12" }, navidad] });
    expect(leida.campanas.map((c) => c.nombre)).toEqual(["Aniversario CAYLA", "Navidad"]);
    expect(leida.campana).toEqual(ANIVERSARIO);
    expect(interpretarPortada({ campana: null, campanas: [] })).toEqual(PORTADA_SIN_DATOS);
  });

  it("si la base responde algo raro, la portada sale sin campaña (no se cae)", () => {
    for (const raro of [null, undefined, "x", 3, {}, { campana: { nombre: "", pct: 12, hasta: null } }, { campana: { ...ANIVERSARIO, pct: 0 } },
      { campana: { ...ANIVERSARIO, pct: "12" } }, { campana: { ...ANIVERSARIO, hasta: "21/10/2026" } }]) {
      expect(interpretarPortada(raro)).toEqual(PORTADA_SIN_DATOS);
    }
  });

  it("una campaña sin descuento (actividad 6a), con su id y sus modelos; un % de 0 sigue siendo raro", () => {
    const id = "8a6f1c1e-3b55-4c8e-9a55-333333333333";
    const modelo = "8a6f1c1e-3b55-4c8e-9a55-444444444444";
    const leida = interpretarPortada({ campana: { id, nombre: "Navidad", pct: null, hasta: "2026-12-25", diseno: null, prendas: [modelo] } }).campana;
    expect(leida).toEqual({ id, nombre: "Navidad", pct: null, hasta: "2026-12-25", diseno: null, prendas: [modelo] });
    expect(anuncios(leida ? [leida] : [])[0]).toBe("Navidad · mira lo que elegimos");
    expect(interpretarPortada({ campana: { ...ANIVERSARIO, prendas: ["no-es-un-id"] } }).campana?.prendas).toEqual([]);
    expect(interpretarPortada({ campana: { ...ANIVERSARIO, pct: 0 } })).toEqual(PORTADA_SIN_DATOS);
  });

  it("un diseño que no se puede pintar no tumba la campaña: sale con el rojo de siempre", () => {
    const sinDiseno = { nombre: ANIVERSARIO.nombre, pct: ANIVERSARIO.pct, hasta: ANIVERSARIO.hasta };
    expect(interpretarPortada({ campana: sinDiseno }).campana).toEqual(ANIVERSARIO); // una base de antes, sin el campo
    expect(interpretarPortada({ campana: { ...ANIVERSARIO, diseno: { ...BOSQUE, fondo: "video" } } }).campana).toEqual(ANIVERSARIO);
    expect(interpretarPortada({ campana: { ...ANIVERSARIO, diseno: "rojo" } }).campana).toEqual(ANIVERSARIO);
  });
});

describe("textos de la campaña", () => {
  it("parte el nombre en dos líneas: la última palabra en cursiva", () => {
    expect(partirTitulo("Aniversario CAYLA")).toEqual(["Aniversario", "CAYLA"]);
    expect(partirTitulo("Día de la Madre")).toEqual(["Día de la", "Madre"]);
    expect(partirTitulo("  CyberWow ")).toEqual(["CyberWow", ""]);
  });

  it("el % sin ceros de más", () => {
    expect(pctTexto(12)).toBe("12");
    expect(pctTexto(12.5)).toBe("12.5");
    expect(pctTexto(12.0)).toBe("12");
  });

  it("las fechas, en Lima", () => {
    expect(fechaLarga("2026-10-21")).toBe("21 de octubre");
    expect(fechaCorta("2026-10-21")).toMatch(/^21 oct\.?$/);
  });

  it("la franja de arriba: las campañas primero, en su orden; sin campaña, solo las frases fijas", () => {
    const con = anuncios([ANIVERSARIO]);
    // El «%» va pegado a su número con un espacio que no se parte.
    expect(con[0]).toMatch(/^Aniversario CAYLA · −12\u00a0% hasta el 21 oct\.?$/);
    expect(con).toHaveLength(4);
    expect(anuncios([{ ...ANIVERSARIO, hasta: null }])[0]).toBe("Aniversario CAYLA · −12\u00a0%");
    // Con el carrusel (actividad 6b), una frase por campaña, en el orden de la portada.
    expect(anuncios([ANIVERSARIO, { ...ANIVERSARIO, nombre: "Navidad", pct: null }]).slice(0, 2)).toEqual([con[0], "Navidad · mira lo que elegimos"]);
    expect(anuncios([])).toEqual(["Separa online y recoge en tu tienda", "Mira cuánto hay en cada tienda", "Crea tu cuenta y forma parte del Club CAYLA"]);
  });

  it("con cuenta, la franja no invita a crear la cuenta: recuerda dónde están los beneficios del Club", () => {
    expect(anuncios([], true)).toEqual(["Separa online y recoge en tu tienda", "Mira cuánto hay en cada tienda", "Tus beneficios del Club CAYLA están en Mi perfil"]);
    expect(anuncios([ANIVERSARIO], true)).not.toContain("Crea tu cuenta y forma parte del Club CAYLA");
  });
});


describe("anioLima", () => {
  it("el año de Lima, no el del servidor (el 31 a las 23:30 en Lima ya es 1 de enero en UTC)", () => {
    expect(anioLima(new Date("2027-01-01T04:30:00Z"))).toBe(2026);
    expect(anioLima(new Date("2027-01-01T05:30:00Z"))).toBe(2027);
  });
});

describe("la foto del fondo solo es de nuestro almacén", () => {
  const ORIGEN = "https://abc.supabase.co";
  const ruta = "/storage/v1/object/public/retail-campanas-fotos/fondos/0f0f0f0f-1111-4222-8333-444455556666.jpg";
  const conFoto = { ...DISENO_DE_SIEMPRE, fondo: "foto" as const, foto: `${ORIGEN}${ruta}`, fotoTono: "#e8dcc8", oscuro: 0.5 };

  it("una foto de nuestro origen se pinta", () => {
    expect(conFotoDeCasa(conFoto, ORIGEN)).toBe(conFoto);
    expect(conFotoDeCasa(null, ORIGEN)).toBeNull();
    expect(conFotoDeCasa(DISENO_DE_SIEMPRE, ORIGEN)).toBe(DISENO_DE_SIEMPRE);
  });

  it("una foto de otro sitio no se pinta: sale la portada de siempre", () => {
    expect(conFotoDeCasa({ ...conFoto, foto: `https://malo.example${ruta}` }, ORIGEN)).toBeNull();
    expect(conFotoDeCasa({ ...conFoto, foto: `${ORIGEN}.malo.example${ruta}` }, ORIGEN)).toBeNull();
  });

  it("sin origen configurado no se puede comprobar: tampoco se pinta", () => {
    expect(conFotoDeCasa(conFoto, undefined)).toBeNull();
  });

  it("una foto que quedó guardada con otro fondo no se pinta, pero el diseño sí (solo se le quita la foto ajena)", () => {
    const ajena = { ...DISENO_DE_SIEMPRE, foto: `https://malo.example${ruta}`, fotoTono: "#ffffff" };
    expect(conFotoDeCasa(ajena, ORIGEN)).toEqual({ ...DISENO_DE_SIEMPRE, foto: null, fotoTono: null });
  });

  it("la portada leída pasa por la misma revisión", () => {
    const campana = { id: null, nombre: "Gato", pct: 15, hasta: "2026-10-30", prendas: [] as string[] };
    const ajena = { ...conFoto, foto: `https://malo.example${ruta}` };
    expect(interpretarPortada({ campana: { ...campana, diseno: ajena } }, ORIGEN).campana?.diseno).toBeNull();
    expect(interpretarPortada({ campana: { ...campana, diseno: conFoto } }, ORIGEN).campana?.diseno?.foto).toBe(conFoto.foto);
  });
});
