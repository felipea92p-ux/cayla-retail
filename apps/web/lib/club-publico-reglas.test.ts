import { describe, expect, it } from "vitest";
import { camposDelRegistro } from "./club-registro-guia";
import { lecturaDePagina, problemasRegistro, type PaginaClub, type RegistroEscrito } from "./club-registro-reglas";
import {
  COLORES_PETALO,
  avanceDelRegistro,
  avisoDeCumple,
  barrasDelVale,
  esMesDeCumple,
  iniciales,
  notaDelUmbral,
  petalos,
  rangoDelVale,
  sociaDesde,
  tarjetasDelInicio,
  ultimoDiaDelMes,
} from "./club-publico-reglas";

// La página pública del club en tres pasos (diseño aprobado el 2026-10-01): las cifras del inicio salen de la base, la barra de
// avance dice lo mismo que la guía de foco, y las fechas del final se leen con el calendario de Lima.

const HOY = "2026-10-01";

const pagina = (cambios: Record<string, unknown> = {}): PaginaClub => {
  const l = lecturaDePagina({
    tienda: "Tienda TRU",
    whatsapp: "953585537",
    pct: 10,
    escala: [
      { anio: 1, monto: 20 },
      { anio: 2, monto: 30 },
      { anio: 3, monto: 40 },
      { anio: 4, monto: 50 },
      { anio: 5, monto: 60 },
    ],
    compras: 6,
    monto_minimo: 600,
    dias: 60,
    textos: {
      terminos: { version: 1, texto: "Términos" },
      privacidad: { version: 1, texto: "Privacidad" },
      casilla_publicidad: { version: 1, texto: "Acepto WhatsApp." },
    },
    ...cambios,
  });
  if (l.estado !== "lista") throw new Error("la página de prueba debería leerse");
  return l.pagina;
};

describe("paso 1: las cifras del inicio salen de fn_club_pagina", () => {
  it("las tres tarjetas, con el % y la escala vigentes", () => {
    const [cumple, vale, whatsapp] = tarjetasDelInicio(pagina());
    expect(cumple).toEqual({ tipo: "cumple", cifra: "10 %", fuerte: "En tu mes de cumpleaños", resto: ", en una compra en cualquier tienda CAYLA." });
    expect(vale).toMatchObject({ tipo: "vale", fuerte: "Un vale cada aniversario", resto: ", de S/ 20 a S/ 60, que crece contigo.*" });
    expect(whatsapp).toEqual({ tipo: "whatsapp", fuerte: "Lo nuevo, primero", resto: ", por WhatsApp. Solo si quieres." });
  });

  it("si la base cambia el % o la escala, cambia la página (nada escrito a mano)", () => {
    const p = pagina({ pct: 12.5, escala: [{ anio: 1, monto: 25 }, { anio: 2, monto: 80 }] });
    const [cumple, vale] = tarjetasDelInicio(p);
    expect(cumple).toMatchObject({ cifra: "12.5 %" });
    expect(vale).toMatchObject({ resto: ", de S/ 25 a S/ 80, que crece contigo.*" });
  });

  it("la escalera: una barra por año, de menor a mayor, la más baja al 30 % y la más alta al 100 %", () => {
    const barras = barrasDelVale([{ anio: 3, monto: 40 }, { anio: 1, monto: 20 }, { anio: 5, monto: 60 }, { anio: 2, monto: 30 }, { anio: 4, monto: 50 }]);
    expect(barras.map((b) => b.anio)).toEqual([1, 2, 3, 4, 5]);
    expect(barras.map((b) => b.alto)).toEqual([30, 47.5, 65, 82.5, 100]);
  });

  it("con un solo monto la escalera no sube y el texto no promete que crezca", () => {
    expect(barrasDelVale([{ anio: 1, monto: 20 }, { anio: 2, monto: 20 }]).map((b) => b.alto)).toEqual([100, 100]);
    expect(rangoDelVale([{ anio: 1, monto: 20 }, { anio: 2, monto: 20 }])).toBe("de S/ 20");
    expect(rangoDelVale([{ anio: 1, monto: 20 }])).toBe("de S/ 20");
    expect(rangoDelVale([])).toBe("");
  });

  it("la nota del umbral, con las compras y el monto vigentes", () => {
    expect(notaDelUmbral(pagina())).toBe("*Un año cuenta si hiciste 6 compras o sumaste S/ 600 en compras.");
    expect(notaDelUmbral(pagina({ compras: 1, monto_minimo: 350.5 }))).toBe("*Un año cuenta si hiciste 1 compra o sumaste S/ 350.50 en compras.");
  });
});

describe("paso 2: la barra de avance dice lo mismo que la guía de foco", () => {
  const VACIO: RegistroEscrito = {
    documentoTipo: "dni",
    documentoNumero: "",
    dniConfirmado: false,
    nombre: "",
    celular: "",
    nacimiento: { dia: "", mes: "", anio: "" },
    correo: "",
    mayorDeEdad: false,
    aceptaTerminos: false,
    aceptaPublicidad: false,
  };
  const BIEN: RegistroEscrito = {
    ...VACIO,
    documentoNumero: "46027897",
    dniConfirmado: true,
    celular: "987654321",
    nacimiento: { dia: "14", mes: "10", anio: "1992" },
    mayorDeEdad: true,
    aceptaTerminos: true,
  };
  const avance = (r: RegistroEscrito) => avanceDelRegistro(camposDelRegistro(r, HOY));

  it("vacío: nada hecho, barra en cero", () => {
    expect(avance(VACIO)).toMatchObject({ hechos: 0, total: 5, fraccion: 0, estado: "Empecemos", falta: "0 de 5 listos" });
  });

  it("como el diseño: todo menos aceptar → «Casi lista» / «Te falta aceptar»", () => {
    expect(avance({ ...BIEN, aceptaTerminos: false })).toMatchObject({ hechos: 4, total: 5, fraccion: 0.8, estado: "Casi lista", falta: "Te falta aceptar" });
  });

  it("todo listo: la barra llena y se puede unir, igual que el botón (sin correo ni WhatsApp, que son opcionales)", () => {
    const a = avance(BIEN);
    expect(a).toMatchObject({ hechos: 5, total: 5, fraccion: 1, estado: "Todo listo", falta: "Ya puedes unirte" });
    expect(Object.keys(problemasRegistro(BIEN, HOY))).toEqual([]);
    expect(avance({ ...BIEN, aceptaPublicidad: true, correo: "ana@correo.pe" })).toMatchObject({ hechos: 5, total: 5 });
  });

  it("un correo mal escrito sí cuenta como falta, porque bloquea el botón", () => {
    expect(avance({ ...BIEN, correo: "ana@" })).toMatchObject({ hechos: 5, total: 6, falta: "Te falta revisar tu correo" });
  });

  it("con carné o pasaporte el nombre suma a lo requerido", () => {
    const pasaporte: RegistroEscrito = { ...BIEN, documentoTipo: "pasaporte", documentoNumero: "AB123456", dniConfirmado: false, nombre: "" };
    expect(avance(pasaporte)).toMatchObject({ hechos: 5, total: 6, falta: "Te falta tu nombre" });
  });

  it("en el medio: «Vas bien» con tres o más por hacer, y el conteo de lo listo", () => {
    expect(avance({ ...VACIO, celular: "987654321", nacimiento: { dia: "14", mes: "10", anio: "1992" } })).toMatchObject({
      hechos: 2,
      estado: "Vas bien",
      falta: "2 de 5 listos",
    });
    expect(avance({ ...BIEN, mayorDeEdad: false, aceptaTerminos: false })).toMatchObject({ estado: "Casi lista", falta: "3 de 5 listos" });
  });

  it("nunca dice «Te falta» con un campo que la guía no conoce sin nombrarlo", () => {
    const a = avanceDelRegistro([{ id: "otro", nombre: "Tienda", requerido: true, hecho: false, pendiente: "" }]);
    expect(a.falta).toBe("Te falta tienda");
    expect(avanceDelRegistro([]).fraccion).toBe(1);
  });

  it("las iniciales del «¿Eres …?»: nombre y primer apellido", () => {
    expect(iniciales("Mariela Q. R.")).toBe("MQ");
    expect(iniciales("Lucía P. S.")).toBe("LP");
    expect(iniciales("Ana")).toBe("A");
    expect(iniciales("  ")).toBe("");
  });
});

describe("paso 3: el cumpleaños y la fecha de socia, con el calendario de Lima", () => {
  it("¿este mes es su cumpleaños? Solo si el mes que eligió es el de hoy en Lima", () => {
    expect(esMesDeCumple("10", HOY)).toBe(true);
    expect(esMesDeCumple("9", HOY)).toBe(false);
    expect(esMesDeCumple("", HOY)).toBe(false);
    expect(esMesDeCumple("13", HOY)).toBe(false);
    expect(esMesDeCumple("1", "2027-01-31")).toBe(true);
  });

  it("el último día del mes, con febrero bisiesto", () => {
    expect(ultimoDiaDelMes(HOY)).toBe("31 de octubre");
    expect(ultimoDiaDelMes("2026-09-15")).toBe("30 de setiembre");
    expect(ultimoDiaDelMes("2028-02-03")).toBe("29 de febrero");
    expect(ultimoDiaDelMes("2027-02-03")).toBe("28 de febrero");
  });

  it("el aviso de cumpleaños solo sale en su mes, con el % vigente y hasta el último día", () => {
    expect(avisoDeCumple(pagina(), "10", HOY)).toEqual({ titulo: "¡Este mes es tu cumpleaños!", texto: "Tienes 10 % en una compra hasta el 31 de octubre." });
    expect(avisoDeCumple(pagina({ pct: 15 }), "10", "2026-10-20")?.texto).toBe("Tienes 15 % en una compra hasta el 31 de octubre.");
    expect(avisoDeCumple(pagina(), "11", HOY)).toBeNull();
  });

  it("«Socia desde oct. 2026», en hora de Lima", () => {
    expect(sociaDesde("2026-10-01T15:00:00Z")).toBe("Socia desde oct. 2026");
    // 9 p. m. del 30 de setiembre en Lima = 2 a. m. del 1 de octubre en UTC: para ella sigue siendo setiembre.
    expect(sociaDesde("2026-10-01T02:00:00Z")).toBe("Socia desde set. 2026");
    expect(sociaDesde("2026-03-12")).toBe("Socia desde mar. 2026");
    expect(sociaDesde(null)).toBeNull();
    expect(sociaDesde("no es fecha")).toBeNull();
  });

  it("los pétalos: siempre los mismos, a lo ancho de la página y en los colores de la marca", () => {
    const p = petalos();
    expect(p).toHaveLength(18);
    expect(petalos()).toEqual(p);
    for (const x of p) {
      expect(x.izquierda).toBeGreaterThanOrEqual(2);
      expect(x.izquierda).toBeLessThanOrEqual(97);
      expect(COLORES_PETALO).toContain(x.color);
      expect(x.retraso + x.duracion).toBeLessThan(4600);
    }
    expect(new Set(p.map((x) => x.color)).size).toBe(COLORES_PETALO.length);
  });
});
