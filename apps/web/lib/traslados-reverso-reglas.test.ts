import { describe, expect, it } from "vitest";
import { sePuedeConfirmar } from "./guia-campos";
import { leerConteo, puedeTerminar, type Conteos, type LineaRecepcion } from "./traslados-recepcion-reglas";
import { camposAnular, camposCerrar, camposDelConteo, consejoAlComparar, faltaQue, modoDelReverso, pieDelConteo, resumenCorto, selloAlConfirmar, tituloDelReverso, tonoDelReverso } from "./traslados-reverso-reglas";

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
  it("mientras falte contar no hay botón: se nombra cuántas faltan; sin guardar, se dice; listo, el botón", () => {
    const ls = [linea({ varianteId: "a" }), linea({ varianteId: "b" })];
    const sinNada = leerConteo(ls, {});
    expect(pieDelConteo(sinNada, puedeTerminar(sinNada, { pendientes: 0, errores: 0 }))).toEqual({ tipo: "faltan", cuantas: 2 });
    const todas = leerConteo(ls, { a: 3, b: 3 });
    expect(pieDelConteo(todas, puedeTerminar(todas, { pendientes: 0, errores: 0 }))).toEqual({ tipo: "listo" });
    expect(pieDelConteo(todas, puedeTerminar(todas, { pendientes: 0, errores: 1 }))).toEqual({ tipo: "sin-guardar", texto: "1 prenda no se guardó: reintenta" });
  });
  it("el pie dice «listo» exactamente cuando la base dejaría terminar (puedeTerminar)", () => {
    const ls = [linea({ varianteId: "a" }), linea({ varianteId: "b" })];
    for (const conteos of [{}, { a: 1 }, { a: 1, b: 0 }] as Conteos[]) {
      for (const errores of [0, 1]) {
        const l = leerConteo(ls, conteos);
        const t = puedeTerminar(l, { pendientes: 0, errores });
        expect(pieDelConteo(l, t).tipo === "listo").toBe(t.habilitado);
      }
    }
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

describe("comparar sin culpa", () => {
  const ls = [linea({ varianteId: "a", cantidadEnviada: 3 }), linea({ varianteId: "b", cantidadEnviada: 2 })];
  it("si falta, dice qué hacer: buscar otra vez y, si no está, confirmar", () => {
    expect(consejoAlComparar(ls, { a: 2, b: 2 }, { origen: "Trujillo", puedeCerrar: false })).toBe("Búscala otra vez en la caja. Si no está, confirma: tu líder lo revisa con Trujillo.");
    expect(consejoAlComparar(ls, { a: 2, b: 1 }, { origen: "Trujillo", puedeCerrar: false })).toBe("Búscalas otra vez en la caja. Si no están, confirma: tu líder lo revisa con Trujillo.");
  });
  it("si sobra, pide revisar que sea de esta caja; mezclado, mirar otra vez", () => {
    expect(consejoAlComparar(ls, { a: 4, b: 2 }, { origen: "Taller", puedeCerrar: false })).toBe("Revisa que sea de esta caja. Si lo es, confirma: tu líder lo revisa con Taller.");
    expect(consejoAlComparar(ls, { a: 4, b: 1 }, { origen: "Taller", puedeCerrar: false })).toBe("Vuelve a mirar la caja. Si sigue igual, confirma: tu líder lo revisa con Taller.");
  });
  it("al líder no le dice «tu líder»; sin diferencia, nada", () => {
    expect(consejoAlComparar(ls, { a: 2, b: 2 }, { origen: "Lima", puedeCerrar: true })).toContain("después lo revisas con Lima");
    expect(consejoAlComparar(ls, { a: 3, b: 2 }, { origen: "Lima", puedeCerrar: false })).toBeNull();
  });
  it("el resumen corto: cuánto entra y adónde, y cuántas quedan para revisar", () => {
    expect(resumenCorto(leerConteo(ls, { a: 3, b: 2 }), "piso_venta")).toEqual(["Entran 5 al piso"]);
    expect(resumenCorto(leerConteo(ls, { a: 2, b: 2 }), "almacen_tienda")).toEqual(["Entran 2 al almacén", "Falda Renata S beige queda para revisar"]);
    expect(resumenCorto(leerConteo(ls, { a: 0, b: 0 }), null)).toEqual(["No entra nada todavía", "2 prendas quedan para revisar"]);
  });
});
