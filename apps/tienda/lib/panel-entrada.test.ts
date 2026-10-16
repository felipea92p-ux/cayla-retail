import { describe, expect, it } from "vitest";
import { CAMPOS_REGISTRO, estadoRegistro, REGISTRO_VACIO, type ConsultaDocumento, type Registro } from "./cuentas";
import type { CodigoDelCorreo } from "./correo-confirmado";
import {
  avanceDelRegistro,
  BENEFICIOS_DE_ENTRADA,
  buzonDelCorreo,
  CONFIANZA_ACCESO,
  CONFIANZA_CLUB,
  estadoDelPaso,
  nombreParaLaTarjeta,
  PASOS_DE_ACCESO,
  PIE_DE_TARJETA,
  PROMESA_ACCESO,
  PROMESA_CLUB,
} from "./panel-entrada";

const HOY = { anio: 2026, mes: 10, dia: 16 };
const SIN_REVISAR: ConsultaDocumento = { estado: "sin_revisar" };
const ENCONTRADO: ConsultaDocumento = { estado: "encontrado", aMedias: "María P. S." };
const LIBRE: ConsultaDocumento = { estado: "libre" };
const SIN_PEDIR: CodigoDelCorreo = { estado: "sin_pedir" };
/** Un DNI completo (el nombre todavía no se sabe: sale del padrón). */
const CON_DNI: Registro = { ...REGISTRO_VACIO, documento: "45871236" };

describe("el nombre de la tarjeta del Club mientras se crea la cuenta", () => {
  it("antes de saberlo no hay nombre: la tarjeta dice «Tu nombre aquí»", () => {
    expect(nombreParaLaTarjeta(REGISTRO_VACIO, SIN_REVISAR)).toBeNull();
    expect(nombreParaLaTarjeta(CON_DNI, { estado: "buscando" })).toBeNull();
  });

  it("con DNI, el del padrón a medias, el mismo que dice el DNI (nunca más)", () => {
    expect(nombreParaLaTarjeta(CON_DNI, ENCONTRADO)).toBe("María P. S.");
  });

  it("con DNI, sin el padrón (no lo encontró, no respondió, repetido) no hay nombre", () => {
    for (const consulta of [
      { estado: "sin_nombre", motivo: "no_encontrado" },
      { estado: "sin_nombre", motivo: "sin_padron" },
      { estado: "repetido" },
      { estado: "archivada" },
      LIBRE,
    ] as ConsultaDocumento[]) {
      expect(nombreParaLaTarjeta(CON_DNI, consulta)).toBeNull();
    }
  });

  it("con DNI, lo que haya en las cajas del nombre no cuenta (con DNI no se escribe)", () => {
    expect(nombreParaLaTarjeta({ ...REGISTRO_VACIO, nombres: "Otra", apellidos: "Persona" }, SIN_REVISAR)).toBeNull();
  });

  it("con carné o pasaporte, el nombre que escribe, con la forma del padrón: el primer nombre y la inicial de cada apellido", () => {
    const carne: Pick<Registro, "documentoTipo" | "nombres" | "apellidos"> = { documentoTipo: "carne_extranjeria", nombres: "maría fernanda", apellidos: "pérez garcía" };
    expect(nombreParaLaTarjeta(carne, LIBRE)).toBe("María P. G.");
    expect(nombreParaLaTarjeta({ ...carne, documentoTipo: "pasaporte" }, SIN_REVISAR)).toBe("María P. G.");
  });

  it("con carné o pasaporte, se llena mientras escribe: primero el nombre, y las iniciales cuando el apellido ya sirve", () => {
    const tipo = "pasaporte" as const;
    expect(nombreParaLaTarjeta({ documentoTipo: tipo, nombres: "J", apellidos: "" }, LIBRE)).toBeNull();
    expect(nombreParaLaTarjeta({ documentoTipo: tipo, nombres: "José", apellidos: "" }, LIBRE)).toBe("José");
    expect(nombreParaLaTarjeta({ documentoTipo: tipo, nombres: "José", apellidos: "d" }, LIBRE)).toBe("José");
    expect(nombreParaLaTarjeta({ documentoTipo: tipo, nombres: "José", apellidos: "de la Cruz" }, LIBRE)).toBe("José C.");
  });

  it("un nombre con números no va a la tarjeta (la caja ya dice «Revisa»)", () => {
    expect(nombreParaLaTarjeta({ documentoTipo: "carne_extranjeria", nombres: "Ana2", apellidos: "Ruiz" }, LIBRE)).toBeNull();
    expect(nombreParaLaTarjeta({ documentoTipo: "carne_extranjeria", nombres: "Ana", apellidos: "Ruiz 3" }, LIBRE)).toBe("Ana");
  });
});

describe("cuánto del registro está listo (la línea del pie)", () => {
  const consultas = { correo: "sin_revisar" as const, documento: SIN_REVISAR, codigo: SIN_PEDIR };

  it("vacío: nada listo; con DNI se cuentan 8 campos (el nombre sale del padrón), con carné o pasaporte los 10", () => {
    expect(avanceDelRegistro(estadoRegistro(REGISTRO_VACIO, consultas, HOY), "dni")).toEqual({ listos: 0, total: 8 });
    const carne: Registro = { ...REGISTRO_VACIO, documentoTipo: "carne_extranjeria" };
    expect(avanceDelRegistro(estadoRegistro(carne, consultas, HOY), "carne_extranjeria")).toEqual({ listos: 0, total: CAMPOS_REGISTRO.length });
  });

  it("cuenta cada campo listo y nada más (los avisos por WhatsApp son opcionales)", () => {
    const r: Registro = { ...REGISTRO_VACIO, clave: "clave-segura", celular: "987654321", mayor: true, avisos: true };
    expect(avanceDelRegistro(estadoRegistro(r, consultas, HOY), "dni")).toEqual({ listos: 3, total: 8 });
  });

  it("todo listo: listos = total", () => {
    const r: Registro = {
      ...REGISTRO_VACIO,
      correo: "maria.perez@gmail.com",
      clave: "clave-segura",
      documento: "45871236",
      celular: "987654321",
      cumple: { d: "14", m: "10", a: "" },
      mayor: true,
      acepta: true,
    };
    const listo = estadoRegistro(r, { correo: "libre", documento: ENCONTRADO, codigo: { estado: "confirmado", correo: "maria.perez@gmail.com" } }, HOY);
    expect(avanceDelRegistro(listo, "dni")).toEqual({ listos: 8, total: 8 });
  });
});

describe("los pasos para volver a entrar", () => {
  it("antes del que toca, hechos; el que toca, ahora; después, luego", () => {
    expect([0, 1, 2].map((i) => estadoDelPaso(i, 1))).toEqual(["hecho", "ahora", "luego"]);
    expect([0, 1, 2].map((i) => estadoDelPaso(i, 0))).toEqual(["ahora", "luego", "luego"]);
    expect([0, 1, 2].map((i) => estadoDelPaso(i, 2))).toEqual(["hecho", "hecho", "ahora"]);
  });

  it("los dos caminos tienen tres pasos (la promesa lo dice: «en tres pasos»)", () => {
    expect(PROMESA_ACCESO.cursiva).toContain("tres pasos");
    expect(PASOS_DE_ACCESO.olvide).toHaveLength(3);
    expect(PASOS_DE_ACCESO.restablecer).toHaveLength(3);
  });
});

describe("los textos del panel", () => {
  const todos = [
    PROMESA_CLUB.ceja,
    PROMESA_CLUB.linea,
    PROMESA_CLUB.cursiva,
    CONFIANZA_CLUB,
    PIE_DE_TARJETA.sin,
    PIE_DE_TARJETA.con,
    PROMESA_ACCESO.ceja,
    PROMESA_ACCESO.linea,
    PROMESA_ACCESO.cursiva,
    CONFIANZA_ACCESO,
    ...BENEFICIOS_DE_ENTRADA.flatMap((b) => [b.titulo, b.texto]),
    ...Object.values(PASOS_DE_ACCESO).flatMap((pasos) => pasos.flatMap((p) => [p.titulo, p.texto])),
  ];

  it("tres beneficios, cada uno con su ícono", () => {
    expect(BENEFICIOS_DE_ENTRADA).toHaveLength(3);
    expect(new Set(BENEFICIOS_DE_ENTRADA.map((b) => b.icono)).size).toBe(3);
  });

  it("hablan de «tú» y sin género: nunca «clienta», «socia» ni «bienvenida»", () => {
    for (const t of todos) expect(t).not.toMatch(/\b(clientas?|socias?|bienvenida|emplead[ao]s?|sucursal(es)?)\b/i);
  });

  it("caben: un título corto y un texto de una o dos líneas (se leen de un vistazo)", () => {
    for (const b of BENEFICIOS_DE_ENTRADA) {
      expect(b.titulo.length).toBeLessThanOrEqual(32);
      expect(b.texto.length).toBeLessThanOrEqual(64);
    }
    for (const p of Object.values(PASOS_DE_ACCESO).flat()) {
      expect(p.titulo.length).toBeLessThanOrEqual(32);
      expect(p.texto.length).toBeLessThanOrEqual(64);
    }
  });
});

describe("abrir el correo para buscar el enlace o el código", () => {
  it("un buzón conocido lleva a su página, sin importar mayúsculas ni espacios", () => {
    expect(buzonDelCorreo("carmen@gmail.com")).toEqual({ nombre: "Gmail", href: "https://mail.google.com/" });
    expect(buzonDelCorreo("  Carmen@Gmail.COM ")?.nombre).toBe("Gmail");
    expect(buzonDelCorreo("ana@hotmail.com")?.nombre).toBe("Outlook");
    expect(buzonDelCorreo("ana@outlook.es")?.nombre).toBe("Outlook");
    expect(buzonDelCorreo("luis@yahoo.com")?.nombre).toBe("Yahoo Mail");
    expect(buzonDelCorreo("luis@icloud.com")?.nombre).toBe("iCloud Mail");
  });

  it("cualquier otro correo, o uno a medio escribir, no ofrece nada", () => {
    for (const correo of ["ventas@cayla.pe", "carmen@gmial.com", "carmen@", "@gmail.com", "carmen", "", "a@b@gmail.com"]) {
      expect(buzonDelCorreo(correo)).toBeNull();
    }
  });

  it("todas las direcciones son https de los buzones mismos", () => {
    for (const correo of ["a@gmail.com", "a@outlook.com", "a@yahoo.com", "a@icloud.com"]) {
      expect(buzonDelCorreo(correo)?.href).toMatch(/^https:\/\/(mail\.google|outlook\.live|mail\.yahoo|www\.icloud)\.com\//);
    }
  });
});
