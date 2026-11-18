import { describe, expect, it } from "vitest";
import { camposDeAgregarVariante, type FotoDelModalDeAgregar } from "./agregar-variantes-guia";
import { estadosDe, faltanDe, sePuedeConfirmar } from "./guia-campos";
import { llaveDeUnidades, unidadesParaNuevas, type FilaFicha } from "./variantes-ficha-reglas";

const base: FotoDelModalDeAgregar = { elegidos: 0, nacen: 0, precioOk: false, puedeCargar: true, unidades: 0, que: "color", pideTallas: true, tallasMarcadas: 3 };

describe("la guía de «Agregar color»: qué falta y qué sigue", () => {
  it("sin nada elegido, lo que sigue es elegir el color, y no se puede confirmar", () => {
    const c = camposDeAgregarVariante(base);
    expect(faltanDe(c).map((x) => x.id)).toEqual(["elegidos"]);
    expect(estadosDe(c).elegidos).toBe("ahora");
    expect(sePuedeConfirmar(c)).toBe(false);
  });

  it("con el color elegido y las tallas marcadas, pide el precio; con el precio, solo sugiere las unidades y ya se puede confirmar", () => {
    const sinPrecio = camposDeAgregarVariante({ ...base, elegidos: 1, nacen: 3 });
    expect(faltanDe(sinPrecio).map((x) => x.id)).toEqual(["precio", "unidades"]);
    expect(sePuedeConfirmar(sinPrecio)).toBe(false);
    const conPrecio = camposDeAgregarVariante({ ...base, elegidos: 1, nacen: 3, precioOk: true });
    expect(sePuedeConfirmar(conPrecio)).toBe(true); // las unidades nunca son un candado
    expect(faltanDe(conPrecio).map((x) => x.id)).toEqual(["unidades"]);
    expect(estadosDe(conPrecio).unidades).toBe("ahora");
  });

  it("con unidades puestas todo está hecho; sin «Ajustar stock» las unidades ni se mencionan", () => {
    const listo = camposDeAgregarVariante({ ...base, elegidos: 1, nacen: 3, precioOk: true, unidades: 5 });
    expect(faltanDe(listo)).toEqual([]);
    const sinPermiso = camposDeAgregarVariante({ ...base, elegidos: 1, nacen: 3, precioOk: true, puedeCargar: false });
    expect(sinPermiso.some((x) => x.id === "unidades")).toBe(false);
  });

  it("una prenda «Sin color» pide primero de qué color son las que ya tiene", () => {
    const c = camposDeAgregarVariante({ ...base, eraSinColor: true, elegidos: 1, nacen: 3, precioOk: true });
    expect(c[0].id).toBe("color-previo");
    expect(sePuedeConfirmar(c)).toBe(false);
    expect(sePuedeConfirmar(camposDeAgregarVariante({ ...base, eraSinColor: true, colorDeLasQueTiene: "NEG", elegidos: 1, nacen: 3, precioOk: true }))).toBe(true);
  });

  it("sin tallas marcadas no se puede confirmar; una prenda de talla única no pide tallas", () => {
    expect(sePuedeConfirmar(camposDeAgregarVariante({ ...base, elegidos: 1, tallasMarcadas: 0, nacen: 0 }))).toBe(false);
    expect(camposDeAgregarVariante({ ...base, pideTallas: false, elegidos: 1 }).some((x) => x.id === "tallas")).toBe(false);
  });

  it("«Agregar talla» habla de la talla", () => {
    expect(camposDeAgregarVariante({ ...base, que: "talla", pideTallas: false })[0].pendiente).toBe("Elige la talla que llegó.");
  });
});

const fila = (clave: string, color: string | null, talla: string | null, extra: Partial<FilaFicha> = {}): FilaFicha =>
  ({ clave, id: null, colorCodigo: color, tallaId: talla, guardada: null, codigosBarras: [], precio: "10", costo: "5", costoFijo: false, activo: true, etiquetaIds: [], ...extra }) as FilaFicha;

describe("las unidades de partida llegan a las filas que nacen", () => {
  const antes = [fila("a", "BLA", "S", { id: "v1", guardada: { colorCodigo: "BLA", tallaId: "S" } as FilaFicha["guardada"] })];
  const despues = [...antes, fila("nueva:S|NEG", "NEG", "S"), fila("nueva:M|NEG", "NEG", "M")];

  it("solo las que nacieron, y con más de 0", () => {
    const u = { [llaveDeUnidades({ colorCodigo: "NEG", tallaId: "S" })]: 4, [llaveDeUnidades({ colorCodigo: "NEG", tallaId: "M" })]: 0 };
    expect(unidadesParaNuevas(antes, despues, u)).toEqual({ "nueva:S|NEG": 4 });
  });

  it("una variante que ya existía no recibe unidades (su stock es el que es)", () => {
    expect(unidadesParaNuevas(antes, despues, { [llaveDeUnidades({ colorCodigo: "BLA", tallaId: "S" })]: 9 })).toEqual({});
  });

  it("lo que no es un entero positivo se ignora", () => {
    expect(unidadesParaNuevas(antes, despues, { [llaveDeUnidades({ colorCodigo: "NEG", tallaId: "S" })]: 1.5 })).toEqual({});
    expect(unidadesParaNuevas(antes, despues, { [llaveDeUnidades({ colorCodigo: "NEG", tallaId: "S" })]: -2 })).toEqual({});
  });
});
