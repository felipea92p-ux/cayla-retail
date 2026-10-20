import { describe, expect, it } from "vitest";
import { CAMPOS_CUENTA, estadoCuenta, REGISTRO_CUENTA_VACIO, type RegistroCuenta } from "./cuentas";
import type { CodigoDelCorreo } from "./correo-confirmado";
import {
  avanceDeLaCuenta,
  BENEFICIOS_DE_ENTRADA,
  buzonDelCorreo,
  CONFIANZA_ACCESO,
  estadoDelPaso,
  nombreParaLaTarjeta,
  PASOS_DE_ACCESO,
  PIE_DE_TARJETA,
  PROMESA_ACCESO,
  PROMESA_CLUB,
} from "./panel-entrada";

const SIN_PEDIR: CodigoDelCorreo = { estado: "sin_pedir" };

describe("el nombre de la tarjeta del Club mientras se crea la cuenta", () => {
  it("antes de saberlo no hay nombre: la tarjeta dice «Tu nombre aquí»", () => {
    expect(nombreParaLaTarjeta("")).toBeNull();
    expect(nombreParaLaTarjeta("   ")).toBeNull();
    expect(nombreParaLaTarjeta("A")).toBeNull();
  });

  it("con el nombre que escribe, tal cual y sin espacios de más", () => {
    expect(nombreParaLaTarjeta("María")).toBe("María");
    expect(nombreParaLaTarjeta("  María   Fernanda ")).toBe("María Fernanda");
  });

  it("un nombre demasiado largo no va a la tarjeta (el campo ya dice «Revisa»)", () => {
    expect(nombreParaLaTarjeta("x".repeat(121))).toBeNull();
  });
});

describe("cuánto de crear la cuenta está listo (la línea del pie)", () => {
  const consultas = { correo: "sin_revisar" as const, codigo: SIN_PEDIR };

  it("vacío: nada listo; se cuentan los campos de crear la cuenta (y nada del Club: ni documento ni celular)", () => {
    expect(avanceDeLaCuenta(estadoCuenta(REGISTRO_CUENTA_VACIO, consultas))).toEqual({ listos: 0, total: CAMPOS_CUENTA.length });
    expect(CAMPOS_CUENTA.map(([campo]) => campo)).toEqual(["correo", "codigo", "nombre", "clave", "acepta"]);
  });

  it("cuenta cada campo listo y nada más", () => {
    const r: RegistroCuenta = { ...REGISTRO_CUENTA_VACIO, clave: "clave-segura", nombre: "María" };
    expect(avanceDeLaCuenta(estadoCuenta(r, consultas))).toEqual({ listos: 2, total: 5 });
  });

  it("todo listo: listos = total", () => {
    const r: RegistroCuenta = { correo: "maria.perez@gmail.com", clave: "clave-segura", nombre: "María", acepta: true };
    const listo = estadoCuenta(r, { correo: "libre", codigo: { estado: "confirmado", correo: "maria.perez@gmail.com" } });
    expect(avanceDeLaCuenta(listo)).toEqual({ listos: 5, total: 5 });
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
