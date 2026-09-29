import { afterEach, describe, expect, it } from "vitest";
import {
  cambiosDeUrlDelPar,
  clavePeriodosElegidos,
  guardarParElegido,
  leerParElegido,
  normalizarPar,
  periodosParaSembrar,
  urlYaTraePeriodos,
} from "./resumen-periodos-guardados";

// Lo que fijan estas pruebas es la promesa de la persistencia de Comparar (2026-09-29): lo que la persona eligió vuelve
// cuando entra con la URL sin fechas; nunca pisa las fechas que la URL ya trae; no se mezcla entre personas ni entre
// sedes; y un almacenamiento lleno, bloqueado o con basura degrada a «los de por defecto», jamás a una excepción.

// «Hoy» de las pruebas: martes 29 de septiembre de 2026 (Lima).
const HOY = "2026-09-29";
const A = { desde: "2026-08-01", hasta: "2026-08-30" };
const B = { desde: "2026-08-31", hasta: "2026-09-29" };

type Falso = { datos: Record<string, string>; fallaAlGuardar?: boolean; bloqueado?: boolean };

function storageFalso(f: Falso): Storage {
  return {
    getItem: (k) => (k in f.datos ? f.datos[k] : null),
    setItem: (k, v) => {
      if (f.fallaAlGuardar) throw new DOMException("QuotaExceededError");
      f.datos[k] = v;
    },
    removeItem: (k) => {
      delete f.datos[k];
    },
    clear: () => {
      f.datos = {};
    },
    key: () => null,
    get length() {
      return Object.keys(f.datos).length;
    },
  };
}

const ORIGINAL = { window: (globalThis as { window?: unknown }).window, localStorage: Object.getOwnPropertyDescriptor(globalThis, "localStorage") };

function enNavegador(f: Falso) {
  (globalThis as { window?: unknown }).window = globalThis;
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      // Algunos navegadores lanzan al solo TOCAR localStorage (cookies bloqueadas).
      if (f.bloqueado) throw new DOMException("SecurityError");
      return storageFalso(f);
    },
  });
}

afterEach(() => {
  (globalThis as { window?: unknown }).window = ORIGINAL.window;
  if (ORIGINAL.localStorage) Object.defineProperty(globalThis, "localStorage", ORIGINAL.localStorage);
  else delete (globalThis as { localStorage?: unknown }).localStorage;
});

const sinParams = () => false;
const conParams =
  (...claves: string[]) =>
  (k: string) =>
    claves.includes(k);

describe("clavePeriodosElegidos — una llave por sede y por persona", () => {
  it("dos personas en el mismo navegador, o una persona en dos sedes, nunca comparten llave", () => {
    const base = clavePeriodosElegidos("sede-1", "persona-1");
    expect(clavePeriodosElegidos("sede-1", "persona-2")).not.toBe(base);
    expect(clavePeriodosElegidos("sede-2", "persona-1")).not.toBe(base);
    expect(clavePeriodosElegidos("sede-1", "persona-1")).toBe(base); // estable: si cambia, cada persona «pierde» lo elegido
  });

  it("una terminal (sin persona) se distingue por su sede", () => {
    expect(clavePeriodosElegidos("sede-1", null)).not.toBe(clavePeriodosElegidos("sede-2", null));
    expect(clavePeriodosElegidos("sede-1", null)).not.toBe(clavePeriodosElegidos("sede-1", "persona-1"));
  });
});

describe("cambiosDeUrlDelPar", () => {
  it("escribe A y B con los parámetros de Comparar; A entra como «otro período» (así lo resuelve el servidor)", () => {
    expect(cambiosDeUrlDelPar({ a: A, b: B })).toEqual({
      bdesde: "2026-08-31",
      bhasta: "2026-09-29",
      comparar: "personalizado",
      cdesde: "2026-08-01",
      chasta: "2026-08-30",
    });
  });
});

describe("normalizarPar — se guarda lo que la pantalla realmente muestra", () => {
  it("un par válido queda igual", () => {
    expect(normalizarPar(A, B, HOY)).toEqual({ a: A, b: B });
  });

  it("ordena fechas al revés y recorta lo que pasa de hoy (las mismas reglas del servidor)", () => {
    const r = normalizarPar({ desde: "2026-08-30", hasta: "2026-08-01" }, { desde: "2026-09-20", hasta: "2026-12-31" }, HOY);
    expect(r).toEqual({ a: A, b: { desde: "2026-09-20", hasta: HOY } });
  });

  it("si alguno no sirve (fecha inexistente o empieza en el futuro) no hay par: no se pisa lo último bueno", () => {
    expect(normalizarPar(A, { desde: "2026-10-15", hasta: "2026-10-30" }, HOY)).toBeNull();
    expect(normalizarPar({ desde: "2026-02-31", hasta: "2026-03-05" }, B, HOY)).toBeNull();
    expect(normalizarPar({ desde: "", hasta: "" }, B, HOY)).toBeNull();
  });
});

describe("leerParElegido — lo guardado es texto de afuera y se valida como entrada", () => {
  it("lo que se guardó vuelve", () => {
    expect(leerParElegido({ a: A, b: B }, HOY)).toEqual({ a: A, b: B });
  });

  it("basura, versiones viejas y formas equivocadas dan null (la pantalla usa los períodos de por defecto)", () => {
    for (const crudo of [null, undefined, "texto", 42, [], {}, { a: A }, { b: B }, { a: "x", b: "y" }, { a: { desde: 1, hasta: 2 }, b: B }, { a: A, b: { desde: "2026-13-40", hasta: "2026-14-40" } }]) {
      expect(leerParElegido(crudo, HOY)).toBeNull();
    }
  });

  it("un valor editado a mano con un período en el futuro no se siembra", () => {
    expect(leerParElegido({ a: A, b: { desde: "2027-01-01", hasta: "2027-01-31" } }, HOY)).toBeNull();
  });
});

describe("urlYaTraePeriodos — si la URL habla, manda ella", () => {
  it("cualquier fecha de Comparar cuenta: las de B, las de A o su modo", () => {
    for (const p of ["bdesde", "bhasta", "comparar", "cdesde", "chasta"]) expect(urlYaTraePeriodos(conParams(p))).toBe(true);
  });

  it("el período de Desempeño y los demás filtros NO cuentan: no le quitan a Comparar lo que la persona eligió", () => {
    expect(urlYaTraePeriodos(conParams("preset", "desde", "hasta", "q", "cat", "modo", "orden", "cambio", "pag"))).toBe(false);
    expect(urlYaTraePeriodos(sinParams)).toBe(false);
  });
});

describe("guardar y sembrar", () => {
  const clave = clavePeriodosElegidos("sede-1", "persona-1");

  it("lo que se guardó entra a la URL cuando la URL no trae fechas", () => {
    enNavegador({ datos: {} });
    expect(guardarParElegido(clave, A, B, HOY)).toBe(true);
    expect(periodosParaSembrar(clave, sinParams, HOY)).toEqual(cambiosDeUrlDelPar({ a: A, b: B }));
  });

  it("nunca pisa fechas que la URL ya trae (un enlace compartido, o lo elegido hace un momento)", () => {
    enNavegador({ datos: {} });
    guardarParElegido(clave, A, B, HOY);
    expect(periodosParaSembrar(clave, conParams("cdesde"), HOY)).toEqual({});
    expect(periodosParaSembrar(clave, conParams("bdesde", "bhasta"), HOY)).toEqual({});
  });

  it("sin nada guardado no se siembra nada: quedan los períodos de por defecto", () => {
    enNavegador({ datos: {} });
    expect(periodosParaSembrar(clave, sinParams, HOY)).toEqual({});
  });

  it("la última elección reemplaza a la anterior", () => {
    enNavegador({ datos: {} });
    guardarParElegido(clave, A, B, HOY);
    const otra = { desde: "2026-09-01", hasta: "2026-09-15" };
    guardarParElegido(clave, A, otra, HOY);
    expect(periodosParaSembrar(clave, sinParams, HOY)).toMatchObject({ bdesde: "2026-09-01", bhasta: "2026-09-15" });
  });

  it("una elección inválida no borra la última buena", () => {
    enNavegador({ datos: {} });
    guardarParElegido(clave, A, B, HOY);
    expect(guardarParElegido(clave, A, { desde: "2026-11-01", hasta: "2026-11-30" }, HOY)).toBe(false);
    expect(periodosParaSembrar(clave, sinParams, HOY)).toEqual(cambiosDeUrlDelPar({ a: A, b: B }));
  });

  it("no se mezcla entre personas ni entre sedes", () => {
    enNavegador({ datos: {} });
    guardarParElegido(clavePeriodosElegidos("sede-1", "persona-1"), A, B, HOY);
    expect(periodosParaSembrar(clavePeriodosElegidos("sede-1", "persona-2"), sinParams, HOY)).toEqual({});
    expect(periodosParaSembrar(clavePeriodosElegidos("sede-2", "persona-1"), sinParams, HOY)).toEqual({});
    expect(periodosParaSembrar(clavePeriodosElegidos("sede-1", "persona-1"), sinParams, HOY)).not.toEqual({});
  });

  it("JSON corrupto o de otra forma en la llave: se ignora, no revienta", () => {
    enNavegador({ datos: { [clave]: "{esto no es json" } });
    expect(periodosParaSembrar(clave, sinParams, HOY)).toEqual({});
    enNavegador({ datos: { [clave]: JSON.stringify({ a: "1", b: [] }) } });
    expect(periodosParaSembrar(clave, sinParams, HOY)).toEqual({});
  });

  it("almacenamiento lleno o bloqueado (modo privado, cookies bloqueadas): guardar dice false y sembrar da {} — nunca una excepción", () => {
    enNavegador({ datos: {}, fallaAlGuardar: true });
    expect(guardarParElegido(clave, A, B, HOY)).toBe(false);
    enNavegador({ datos: {}, bloqueado: true });
    expect(guardarParElegido(clave, A, B, HOY)).toBe(false);
    expect(periodosParaSembrar(clave, sinParams, HOY)).toEqual({});
  });

  it("en el servidor (sin window) no hay nada que sembrar ni que guardar", () => {
    (globalThis as { window?: unknown }).window = undefined;
    expect(periodosParaSembrar(clave, sinParams, HOY)).toEqual({});
    expect(guardarParElegido(clave, A, B, HOY)).toBe(false);
  });
});
