import { describe, expect, it } from "vitest";
import { camposDelRegistro } from "./club-registro-guia";
import { problemasRegistro, type CampoRegistro, type RegistroEscrito } from "./club-registro-reglas";
import { estadosDe, faltanDe, sePuedeConfirmar } from "./guia-campos";

// ADR-0284: la guía de la página pública del club NO agrega reglas. Esta prueba recorre escenarios y exige que la guía diga
// exactamente lo que dice `problemasRegistro` (la regla que apaga «Unirme al Club CAYLA» y que el servidor vuelve a correr).

const HOY = "2026-10-01";
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
  nacimiento: { dia: "12", mes: "9", anio: "1990" },
  mayorDeEdad: true,
  aceptaTerminos: true,
};
const PASAPORTE: RegistroEscrito = { ...BIEN, documentoTipo: "pasaporte", documentoNumero: "AB123456", dniConfirmado: false, nombre: "Ana Torres" };

const ESCENARIOS: [string, RegistroEscrito][] = [
  ["vacío", VACIO],
  ["todo bien", BIEN],
  ["todo bien y con WhatsApp", { ...BIEN, aceptaPublicidad: true }],
  ["DNI sin confirmar", { ...BIEN, dniConfirmado: false }],
  ["DNI a medias", { ...BIEN, documentoNumero: "4602" }],
  ["pasaporte bien", PASAPORTE],
  ["pasaporte sin nombre", { ...PASAPORTE, nombre: "" }],
  ["carné mal escrito", { ...PASAPORTE, documentoTipo: "carne_extranjeria", documentoNumero: "AB-1" }],
  ["celular mal", { ...BIEN, celular: "887654321" }],
  ["sin año", { ...BIEN, nacimiento: { dia: "12", mes: "9", anio: "" } }],
  ["fecha que no existe", { ...BIEN, nacimiento: { dia: "31", mes: "4", anio: "1990" } }],
  ["menor de 18", { ...BIEN, nacimiento: { dia: "2", mes: "10", anio: "2008" } }],
  ["correo mal", { ...BIEN, correo: "ana@" }],
  ["correo bien", { ...BIEN, correo: "ana@correo.pe" }],
  ["sin la casilla de edad", { ...BIEN, mayorDeEdad: false }],
  ["sin aceptar los términos", { ...BIEN, aceptaTerminos: false }],
];

describe("guía de foco del registro público: dice lo mismo que la regla que apaga «Unirme»", () => {
  for (const [nombre, r] of ESCENARIOS) {
    it(nombre, () => {
      const campos = camposDelRegistro(r, HOY);
      const problemas = problemasRegistro(r, HOY);
      expect(sePuedeConfirmar(campos)).toBe(Object.keys(problemas).length === 0);
      // Cada campo de la regla: con problema, en la guía es requerido y no está hecho; sin problema, no bloquea.
      for (const id of ["documento", "nombre", "celular", "nacimiento", "correo", "mayor", "terminos"] as CampoRegistro[]) {
        const campo = campos.find((c) => c.id === id);
        if (!campo) {
          expect(r.documentoTipo === "dni" && id === "nombre", `${id} solo falta en la guía con DNI`).toBe(true);
          expect(problemas[id]).toBeUndefined();
          continue;
        }
        expect(campo.requerido && !campo.hecho, id).toBe(problemas[id] !== undefined);
        if (problemas[id]) expect(campo.pendiente, id).toBe(problemas[id]);
      }
    });
  }

  it("lo opcional no se lista como «falta»: el correo vacío y la casilla de WhatsApp", () => {
    const faltan = faltanDe(camposDelRegistro(VACIO, HOY)).map((c) => c.id);
    expect(faltan).not.toContain("correo");
    expect(faltan).not.toContain("publicidad");
    expect(estadosDe(camposDelRegistro(BIEN, HOY))).toMatchObject({ correo: "opcional", publicidad: "opcional" });
    expect(estadosDe(camposDelRegistro({ ...BIEN, aceptaPublicidad: true }, HOY)).publicidad).toBe("hecho");
  });

  it("con todo vacío, lo que sigue es el DNI; el nombre solo aparece con carné o pasaporte", () => {
    expect(estadosDe(camposDelRegistro(VACIO, HOY)).documento).toBe("ahora");
    expect(camposDelRegistro(VACIO, HOY).some((c) => c.id === "nombre")).toBe(false);
    expect(camposDelRegistro(PASAPORTE, HOY).some((c) => c.id === "nombre")).toBe(true);
  });

  it("lo que dice la consulta del padrón reemplaza al «confirma» genérico, sin cambiar qué está hecho", () => {
    const r = { ...BIEN, dniConfirmado: false };
    const [doc] = camposDelRegistro(r, HOY, "Buscando tu DNI…");
    expect(doc).toMatchObject({ id: "documento", hecho: false, pendiente: "Buscando tu DNI…" });
    expect(camposDelRegistro(BIEN, HOY, null)[0]!.hecho).toBe(true);
  });
});
