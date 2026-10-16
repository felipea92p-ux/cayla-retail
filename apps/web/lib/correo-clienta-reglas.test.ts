import { describe, expect, it } from "vitest";
import {
  CORREO_MAL_ESCRITO,
  correoEnmascarado,
  correoVisible,
  esRechazoDelCorreo,
  normalizarCorreo,
  problemaCorreo,
  rechazoVigente,
} from "./correo-clienta-reglas";

// El correo de contacto en la ficha (Felipe 2026-10-15, 20261015123000). La regla es la de la base (`editar_clienta` y el candado
// `clientas_correo_formato`): estos casos son los mismos que la base acepta o rechaza en scripts/pruebas/clientas_correo_en_la_ficha.mjs.

describe("el formato: el mismo que la base", () => {
  it("vacío vale (es opcional), también con espacios", () => {
    expect(problemaCorreo("")).toBeNull();
    expect(problemaCorreo("   ")).toBeNull();
  });

  it("algo@algo.algo vale, en mayúsculas o con espacios alrededor (la base lo guarda en minúsculas y sin ellos)", () => {
    expect(problemaCorreo("ana@gmail.com")).toBeNull();
    expect(problemaCorreo("  ZZ.Bea.Nuevo@Ejemplo.COM ")).toBeNull();
    expect(normalizarCorreo("  ZZ.Bea.Nuevo@Ejemplo.COM ")).toBe("zz.bea.nuevo@ejemplo.com");
  });

  it("sin dominio, sin @, con espacios adentro o demasiado largo: mal escrito, con la frase de la base", () => {
    for (const malo of ["ana@", "ana", "ana@gmail", "zz.bea@ejemplo", "zz bea@ejemplo.com", "@gmail.com", "ana@@gmail.com", `${"a".repeat(250)}@x.pe`]) {
      expect(problemaCorreo(malo), malo).toBe(CORREO_MAL_ESCRITO);
    }
    expect(CORREO_MAL_ESCRITO).toBe("Revisa el correo: parece incompleto. Si no lo tiene, déjalo vacío.");
  });
});

describe("cómo se ve: completo para el líder, a medias para los demás (como el DNI y el celular)", () => {
  it("a medias: dos letras, ••• y el dominio entero", () => {
    expect(correoEnmascarado("Ana.Perez@Gmail.com")).toBe("an•••@gmail.com");
    expect(correoEnmascarado("a@x.pe")).toBe("a•••@x.pe");
    expect(correoEnmascarado("sin-arroba")).toBe("•••");
    expect(correoEnmascarado("@x.pe")).toBe("•••");
    expect(correoEnmascarado("ana@")).toBe("•••");
  });

  it("completo para el líder; sin correo, nada", () => {
    expect(correoVisible("Ana.Perez@Gmail.com", true)).toBe("ana.perez@gmail.com");
    expect(correoVisible("ana.perez@gmail.com", false)).toBe("an•••@gmail.com");
    expect(correoVisible(null, true)).toBeNull();
    expect(correoVisible("  ", false)).toBeNull();
  });
});

describe("lo que dijo la base del correo, bajo su caja", () => {
  it("son del correo: mal escrito, de otra ficha (dice de cuál) y el del disparador sin nombre", () => {
    expect(esRechazoDelCorreo({ message: "…", code: "22023", hint: "correo_invalido", details: "correo" })).toBe(true);
    expect(esRechazoDelCorreo({ message: "Ese correo ya es de la ficha de Ana…", code: "23505", hint: "correo_de_otra_ficha", details: "correo" })).toBe(true);
    expect(esRechazoDelCorreo({ message: "…", code: "23505", hint: "correo_repetido", details: "correo" })).toBe(true);
  });

  it("no son del correo: el documento de otra ficha, la versión cambiada, un corte de red, nada", () => {
    expect(esRechazoDelCorreo({ message: "…", code: "23505", hint: "documento_de_otra_ficha", details: "documento" })).toBe(false);
    expect(esRechazoDelCorreo({ message: "…", code: "PT409", hint: "version_cambiada" })).toBe(false);
    expect(esRechazoDelCorreo({ message: "TypeError: Failed to fetch" })).toBe(false);
    expect(esRechazoDelCorreo(null)).toBe(false);
  });

  it("vale mientras la caja diga el mismo correo (escrito como sea); si escribe otro o lo borra, ya no", () => {
    const rechazo = { valor: "zz.ana@ejemplo.com", mensaje: "Ese correo ya es de la ficha de Ana." };
    expect(rechazoVigente(rechazo, "zz.ana@ejemplo.com")).toBe(rechazo.mensaje);
    expect(rechazoVigente(rechazo, " ZZ.Ana@Ejemplo.com ")).toBe(rechazo.mensaje);
    expect(rechazoVigente(rechazo, "zz.ana2@ejemplo.com")).toBeNull();
    expect(rechazoVigente(rechazo, "")).toBeNull();
    expect(rechazoVigente(null, "zz.ana@ejemplo.com")).toBeNull();
  });
});
