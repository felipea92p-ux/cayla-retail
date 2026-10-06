import { describe, expect, it } from "vitest";
import { sePuedeConfirmar } from "./guia-campos";
import { leerConteo, puedeTerminar, type Conteos, type LineaRecepcion } from "./traslados-recepcion-reglas";
import { camposAnular, camposCerrar, camposDelConteo, faltaQue, modoDelReverso, selloAlConfirmar, textoTerminar, tituloDelReverso, tonoDelReverso } from "./traslados-reverso-reglas";

const linea = (p: Partial<LineaRecepcion> & { varianteId: string }): LineaRecepcion => ({
  referencia: "Falda Renata",
  talla: "S",
  color: "Beige",
  sku: "FAL-1",
  codigo: null,
  cantidadEnviada: 3,
  cantidadRecibida: null,
  ingresado: false,
  ...p,
});

describe("modoDelReverso", () => {
  it("la sede destino cuenta a ciegas y, al terminar, compara", () => {
    expect(modoDelReverso({ estado: "en_transito", esDestino: true, terminoDeContar: false })).toBe("contar");
    expect(modoDelReverso({ estado: "en_transito", esDestino: true, terminoDeContar: true })).toBe("comparar");
  });
  it("quien no recibe solo mira lo que va en la caja", () => {
    expect(modoDelReverso({ estado: "en_transito", esDestino: false, terminoDeContar: true })).toBe("envio");
  });
  it("con diferencia se revisa; cerrada se mira; anulada dice por qué", () => {
    expect(modoDelReverso({ estado: "recibido_con_diferencia", esDestino: false, terminoDeContar: false })).toBe("revisar");
    expect(modoDelReverso({ estado: "cerrada", esDestino: true, terminoDeContar: false })).toBe("llegada");
    expect(modoDelReverso({ estado: "anulada", esDestino: true, terminoDeContar: false })).toBe("anulada");
  });
});

describe("faltaQue", () => {
  it("nombra la prenda que no cuadró y cuántas", () => {
    const ls = [linea({ varianteId: "a", cantidadEnviada: 4 }), linea({ varianteId: "b", referencia: "Vestido Sofía", talla: "L", color: "Negro", cantidadEnviada: 2 })];
    expect(faltaQue(ls, { a: 3, b: 2 })).toBe("Faltó 1 Falda Renata S beige");
    expect(faltaQue(ls, { a: 1, b: 2 })).toBe("Faltaron 3 Falda Renata S beige");
    expect(faltaQue(ls, { a: 5, b: 2 })).toBe("Sobró 1 Falda Renata S beige");
  });
  it("si son varias, nombra la primera y dice cuántas más", () => {
    const ls = [linea({ varianteId: "a" }), linea({ varianteId: "b" }), linea({ varianteId: "c" })];
    expect(faltaQue(ls, { a: 2, b: 1, c: 3 })).toBe("Faltó 1 Falda Renata S beige y 1 más");
  });
  it("lee lo ya guardado si la pantalla no tocó la casilla; vacío si todo coincide", () => {
    expect(faltaQue([linea({ varianteId: "a", cantidadRecibida: 3 })])).toBe("");
    expect(faltaQue([linea({ varianteId: "a", cantidadRecibida: 2 })])).toBe("Faltó 1 Falda Renata S beige");
  });
  it("una prenda de más (no venía) cuenta como sobrante", () => {
    expect(faltaQue([linea({ varianteId: "x", cantidadEnviada: null, cantidadRecibida: 1 })])).toBe("Sobró 1 Falda Renata S beige");
  });
});

describe("cabecera, color, botón y sello", () => {
  it("contar nunca dice cuántas venían (el título es el número de la caja)", () => {
    expect(tituloDelReverso("contar", { numero: 289, faltaQue: "Faltó 1 Falda" })).toBe("Contando la caja Nº 289");
  });
  it("comparar dice qué faltó o que todo coincide", () => {
    expect(tituloDelReverso("comparar", { numero: 1, faltaQue: "" })).toBe("Todo coincide");
    expect(tituloDelReverso("comparar", { numero: 1, faltaQue: "Faltó 1 Falda" })).toBe("Faltó 1 Falda");
  });
  it("el color sigue a lo que pasa en el reverso", () => {
    expect(tonoDelReverso("contar", { tonoDelPase: "llega", hayDiferencia: false })).toBe("contando");
    expect(tonoDelReverso("comparar", { tonoDelPase: "llega", hayDiferencia: true })).toBe("revisar");
    expect(tonoDelReverso("comparar", { tonoDelPase: "llega", hayDiferencia: false })).toBe("cerrado");
    expect(tonoDelReverso("llegada", { tonoDelPase: "dif", hayDiferencia: true })).toBe("dif");
  });
  it("el botón de terminar dice cuántas faltan en vez de quedarse gris", () => {
    const ls = [linea({ varianteId: "a" }), linea({ varianteId: "b" })];
    const sinNada = leerConteo(ls, {});
    expect(textoTerminar(sinNada, puedeTerminar(sinNada, { pendientes: 0, errores: 0 }))).toBe("Faltan 2 por contar");
    const una = leerConteo(ls, { a: 3 });
    expect(textoTerminar(una, puedeTerminar(una, { pendientes: 0, errores: 0 }))).toBe("Falta 1 por contar");
    const todas = leerConteo(ls, { a: 3, b: 3 });
    expect(textoTerminar(todas, puedeTerminar(todas, { pendientes: 0, errores: 0 }))).toBe("Terminé de contar");
    expect(textoTerminar(todas, puedeTerminar(todas, { pendientes: 0, errores: 1 }))).toBe("1 prenda no se guardó: reintenta");
  });
  it("el sello al confirmar: RECIBIDA si todo coincide, FALTÓ ALGO si no", () => {
    const ls = [linea({ varianteId: "a" })];
    expect(selloAlConfirmar(leerConteo(ls, { a: 3 }))).toEqual({ texto: "RECIBIDA", tono: "cerrado" });
    expect(selloAlConfirmar(leerConteo(ls, { a: 2 }))).toEqual({ texto: "FALTÓ ALGO", tono: "revisar" });
  });
});

describe("guía de foco del reverso", () => {
  it("cerrar pide la nota con el mismo mínimo que la base", () => {
    expect(camposCerrar("")[0].hecho).toBe(false);
    expect(camposCerrar("no vino")[0].hecho).toBe(true);
  });
  it("anular pide motivo y quién", () => {
    expect(camposAnular("talla equivocada", false).map((c) => c.hecho)).toEqual([true, false]);
    expect(camposAnular("", true).map((c) => c.hecho)).toEqual([false, true]);
  });
});

describe("guía del conteo", () => {
  const ls = [
    linea({ varianteId: "a" }),
    linea({ varianteId: "b", cantidadRecibida: 2 }),
    linea({ varianteId: "c", ingresado: true, cantidadRecibida: 3 }),
    linea({ varianteId: "x", cantidadEnviada: null, cantidadRecibida: 1 }),
  ];
  it("cuenta solo lo enviado que no entró al stock; 0 cuenta como contado", () => {
    expect(camposDelConteo(ls, {}).map((c) => [c.id, c.hecho])).toEqual([
      ["prenda-a", false],
      ["prenda-b", true],
    ]);
    expect(camposDelConteo(ls, { a: 0 })[0].hecho).toBe(true);
  });
  it("coincide con lo que apaga «Terminé de contar» en todos los casos", () => {
    const casos: Conteos[] = [{}, { a: 1 }, { a: null }, { a: 0, b: null }, { a: 3, b: 3 }];
    for (const conteos of casos) {
      const lectura = leerConteo(ls, conteos);
      expect(sePuedeConfirmar(camposDelConteo(ls, conteos))).toBe(puedeTerminar(lectura, { pendientes: 0, errores: 0 }).habilitado);
    }
  });
});
