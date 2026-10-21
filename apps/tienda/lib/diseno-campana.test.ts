import { describe, expect, it } from "vitest";
import { AMBIENTES_CAMPANA, ratioContraste } from "@cayla-retail/shared";
import { aplicaA, interpretarDisenoCampana, variablesDelDiseno } from "./diseno-campana";

const dato = (diseno: unknown, nombre = "Aniversario CAYLA") => ({ campana: { nombre, diseno } });
const disenoOk = { modo: "ambiente", plantilla: "aniversario", paleta: 0, acento: null };

describe("interpretarDisenoCampana: lo que la tienda pinta", () => {
  it("un diseño programado se convierte en tres colores, la letra del botón y dónde se ve", () => {
    const d = interpretarDisenoCampana(dato(disenoOk), "Aniversario CAYLA");
    expect(d).toMatchObject({
      plantilla: "aniversario",
      colores: { fondo: "#2b1016", texto: "#f6ecd8", acento: "#d9b878", boton: expect.any(String) },
      donde: { franja: true, portada: true, catalogo: true, sello: true, bolsa: true },
    });
    expect(ratioContraste(d!.colores.acento, d!.colores.boton)).toBeGreaterThanOrEqual(4.5);
  });

  it("el color propio manda sobre el de la paleta", () => {
    expect(interpretarDisenoCampana(dato({ ...disenoOk, paleta: 1, acento: "#00aa55" }), "Aniversario CAYLA")?.colores.acento).toBe("#00aa55");
  });

  it("lo que el líder apagó de «dónde se ve» se respeta; lo que falta o viene raro se ve (como siempre)", () => {
    const d = interpretarDisenoCampana(dato({ ...disenoOk, donde: { franja: false, portada: "no", sello: false } }), "Aniversario CAYLA");
    expect(d?.donde).toEqual({ franja: false, portada: true, catalogo: true, sello: false, bolsa: true });
  });

  it("todas las paletas del catálogo se pintan", () => {
    for (const a of AMBIENTES_CAMPANA) for (let p = 0; p < 3; p++) expect(interpretarDisenoCampana(dato({ modo: "ambiente", plantilla: a.clave, paleta: p }, "X"), "X")).not.toBeNull();
  });

  it("sin diseño, sin campaña o sin datos, la tienda se ve como siempre", () => {
    expect(interpretarDisenoCampana(dato(null), "Aniversario CAYLA")).toBeNull();
    expect(interpretarDisenoCampana({ campana: null }, "Aniversario CAYLA")).toBeNull();
    expect(interpretarDisenoCampana(null, "Aniversario CAYLA")).toBeNull();
    expect(interpretarDisenoCampana({}, "Aniversario CAYLA")).toBeNull();
    expect(interpretarDisenoCampana(dato(disenoOk), null)).toBeNull();
  });

  it("si la base y la portada no coinciden en cuál campaña gana, no se mezclan", () => {
    expect(interpretarDisenoCampana(dato(disenoOk, "Black Week"), "Aniversario CAYLA")).toBeNull();
  });

  it("un diseño que no se sabe pintar es «como siempre»: imagen propia (llega después), ambiente desconocido, paleta fuera de rango", () => {
    expect(interpretarDisenoCampana(dato({ modo: "imagen", plantilla: null, paleta: 0 }), "Aniversario CAYLA")).toBeNull();
    expect(interpretarDisenoCampana(dato({ ...disenoOk, plantilla: "halloween" }), "Aniversario CAYLA")).toBeNull();
    expect(interpretarDisenoCampana(dato({ ...disenoOk, paleta: 3 }), "Aniversario CAYLA")).toBeNull();
    expect(interpretarDisenoCampana(dato({ ...disenoOk, paleta: "x" }), "Aniversario CAYLA")).toBeNull();
  });

  it("un diseño cuyas letras no se leen nunca se pinta (candado de lectura)", () => {
    expect(interpretarDisenoCampana(dato({ modo: "ambiente", plantilla: "cyber", paleta: 0, acento: "#1a1a19" }, "X"), "X")).toBeNull();
  });

  it("un color propio que no es #rrggbb se ignora y queda el de la paleta", () => {
    expect(interpretarDisenoCampana(dato({ ...disenoOk, acento: "rojo" }), "Aniversario CAYLA")?.colores.acento).toBe("#d9b878");
  });
});

describe("variablesDelDiseno", () => {
  it("son las cuatro variables que usa campana.css", () => {
    const d = interpretarDisenoCampana(dato(disenoOk), "Aniversario CAYLA")!;
    expect(Object.keys(variablesDelDiseno(d)).sort()).toEqual(["--cmp-acento", "--cmp-boton", "--cmp-fondo", "--cmp-texto"]);
    expect(variablesDelDiseno(d)["--cmp-fondo"]).toBe("#2b1016");
  });
});

describe("el sello y a quién se le aplica", () => {
  const d = () => interpretarDisenoCampana(dato(disenoOk), "Aniversario CAYLA")!;

  it("el sello se lee sobre la foto y su letra se lee sobre él", () => {
    const { sello } = d();
    expect(ratioContraste(sello.fondo, "#e1ded7")).toBeGreaterThanOrEqual(3);
    expect(ratioContraste(sello.fondo, sello.texto)).toBeGreaterThanOrEqual(4.5);
    // el acento champán no se lee sobre la foto: el sello usa el fondo de la campaña
    expect(sello.fondo).toBe("#2b1016");
  });

  it("el diseño sabe de qué campaña es", () => {
    expect(d().campana).toBe("Aniversario CAYLA");
  });

  it("solo viste las piezas de SU campaña (sin tildes ni mayúsculas); las de otra o sin campaña quedan como siempre", () => {
    expect(aplicaA(d(), "Aniversario CAYLA")).toBe(true);
    expect(aplicaA(d(), "aniversario cayla")).toBe(true);
    expect(aplicaA(d(), "Black Week")).toBe(false);
    expect(aplicaA(d(), null)).toBe(false);
    expect(aplicaA(d(), undefined)).toBe(false);
    expect(aplicaA(null, "Aniversario CAYLA")).toBe(false);
  });
});

describe("el movimiento del diseño", () => {
  it("lo que falta toma su valor de siempre: franja rota, telón, sin efecto, poca, una vez y cuenta siempre", () => {
    expect(interpretarDisenoCampana(dato(disenoOk), "Aniversario CAYLA")?.movimiento).toEqual({
      franja: "rota", entrada: "telon", efecto: "ninguno", intensidad: "poca", duracion: "una", cuenta: "siempre",
    });
  });

  it("lee el movimiento que programó el líder", () => {
    const d = interpretarDisenoCampana(
      dato({ ...disenoOk, franja: "marquesina", entrada: "ninguna", efecto: "copos", intensidad: "media", duracion: "continuo", cuenta: "ultimo" }),
      "Aniversario CAYLA",
    );
    expect(d?.movimiento).toEqual({ franja: "marquesina", entrada: "ninguna", efecto: "copos", intensidad: "media", duracion: "continuo", cuenta: "ultimo" });
  });

  it("un dato de movimiento raro no tumba el diseño: toma su valor de siempre", () => {
    const d = interpretarDisenoCampana(dato({ ...disenoOk, efecto: "fuegos", franja: 3, cuenta: null, duracion: "siempre" }), "Aniversario CAYLA");
    expect(d?.movimiento).toMatchObject({ efecto: "ninguno", franja: "rota", cuenta: "siempre", duracion: "una" });
  });
});

describe("los textos del diseño", () => {
  it("sin textos, todo es null (el héroe dice el nombre de la campaña y «Ver la campaña»)", () => {
    expect(interpretarDisenoCampana(dato(disenoOk), "Aniversario CAYLA")?.textos).toEqual({ titular: null, bajada: null, boton: null });
  });

  it("lee los textos y los deja limpios", () => {
    const d = interpretarDisenoCampana(dato({ ...disenoOk, titular: "  Black   Week ", bajada: "Una semana, una sola vez al año", boton: "Ver las ofertas" }), "Aniversario CAYLA");
    expect(d?.textos).toEqual({ titular: "Black Week", bajada: "Una semana, una sola vez al año", boton: "Ver las ofertas" });
  });

  it("un texto vacío, de solo espacios o que no es texto es «sin texto»; uno largo se corta en su tope", () => {
    const d = interpretarDisenoCampana(dato({ ...disenoOk, titular: "   ", bajada: 7, boton: "a".repeat(60) }), "Aniversario CAYLA");
    expect(d?.textos.titular).toBeNull();
    expect(d?.textos.bajada).toBeNull();
    expect(d?.textos.boton).toHaveLength(22);
  });
});
