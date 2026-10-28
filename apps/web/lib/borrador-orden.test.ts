import { describe, expect, it } from "vitest";
import {
  borrarBorrador,
  claveDelBorrador,
  guardarBorrador,
  haceCuanto,
  leerBorrador,
  leerBorradorGuardado,
  modeloDelBorrador,
  prendasDelBorrador,
  resumenDelBorrador,
  textoDelUltimoBorrador,
  tieneTrabajo,
  type Almacen,
  type FotoDelBorrador,
} from "./borrador-orden";
import { fasesIniciales } from "./orden-fases-reglas";

// El borrador de «Nueva orden» (ADR-0509). Lo que importa: que lo guardado se vuelva a leer igual, que lo que no sirve se ignore sin romper nada y que un almacén que falla nunca lance.

const TALLER = "t-1";
const foto = (parche: Partial<FotoDelBorrador> = {}): FotoDelBorrador => ({
  tipo: "produccion", modoModelo: "existe", productoId: "m-1", nombreNuevo: "", categoriaNuevaId: "", tallasNuevas: [], coloresNuevos: [], precioNuevo: "", cantidades: { "v-1": "12" },
  fases: fasesIniciales(), telasManual: null, fechaEntrega: "", nota: "", ...parche,
});

/** Lo que ofrece la lista: el último borrador del Taller, leído del texto guardado. */
const ultimoBorrador = (a: Almacen | null, taller: string) => leerBorrador(textoDelUltimoBorrador(a, taller));
const hayBorradorEnElTaller = (a: Almacen | null, taller: string) => ultimoBorrador(a, taller) !== null;

/** Un `localStorage` de mentira que se puede romper. */
function almacen(falla: "no" | "leer" | "escribir" | "todo" = "no"): Almacen & { datos: Map<string, string> } {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (k) => {
      if (falla === "leer" || falla === "todo") throw new Error("SecurityError");
      return datos.get(k) ?? null;
    },
    setItem: (k, v) => {
      if (falla === "escribir" || falla === "todo") throw new Error("QuotaExceededError");
      datos.set(k, v);
    },
    removeItem: (k) => {
      if (falla === "todo") throw new Error("SecurityError");
      datos.delete(k);
    },
  };
}

describe("tieneTrabajo — qué vale la pena guardar", () => {
  it("elegir el modelo o el tipo no es trabajo", () => {
    expect(tieneTrabajo(foto({ cantidades: {} }))).toBe(false);
    expect(tieneTrabajo(foto({ cantidades: { "v-1": "0", "v-2": "" }, tipo: "muestra" }))).toBe(false);
  });
  it("una cantidad, un nombre, un precio, una nota, una fecha o una tela sí", () => {
    expect(tieneTrabajo(foto())).toBe(true);
    expect(tieneTrabajo(foto({ cantidades: {}, nombreNuevo: "Blusa Aurora", modoModelo: "nuevo" }))).toBe(true);
    expect(tieneTrabajo(foto({ cantidades: {}, precioNuevo: "79.90" }))).toBe(true);
    expect(tieneTrabajo(foto({ cantidades: {}, nota: "urgente" }))).toBe(true);
    expect(tieneTrabajo(foto({ cantidades: {}, fechaEntrega: "2026-11-14" }))).toBe(true);
    expect(tieneTrabajo(foto({ cantidades: {}, telasManual: [] }))).toBe(true);
  });
  it("lo que se elige de un modelo nuevo (categoría, tallas, colores) también es trabajo: son varios clics", () => {
    const nuevo = { modoModelo: "nuevo" as const, productoId: "", cantidades: {} };
    expect(tieneTrabajo(foto({ ...nuevo }))).toBe(false);
    expect(tieneTrabajo(foto({ ...nuevo, categoriaNuevaId: "c-1" }))).toBe(true);
    expect(tieneTrabajo(foto({ ...nuevo, tallasNuevas: ["t-1"] }))).toBe(true);
    expect(tieneTrabajo(foto({ ...nuevo, coloresNuevos: ["ROJ"] }))).toBe(true);
  });
  it("una fase distinta de la de siempre sí; las fases de fábrica, no", () => {
    expect(tieneTrabajo(foto({ cantidades: {} }))).toBe(false);
    const costuraAfuera = fasesIniciales().map((f) => (f.clave === "costura" ? { ...f, quien: "servicio" as const } : f));
    expect(tieneTrabajo(foto({ cantidades: {}, fases: costuraAfuera }))).toBe(true);
  });
});

describe("modeloDelBorrador", () => {
  it("es el id del producto, o «nuevo»; sin modelo no hay nada que guardar", () => {
    expect(modeloDelBorrador({ modoModelo: "existe", productoId: "m-9" })).toBe("m-9");
    expect(modeloDelBorrador({ modoModelo: "nuevo", productoId: "" })).toBe("nuevo");
    expect(modeloDelBorrador({ modoModelo: "existe", productoId: "" })).toBeNull();
  });
});

describe("guardar y leer", () => {
  it("lo guardado vuelve a leerse igual, con la hora, y queda como el último del Taller", () => {
    const a = almacen();
    const f = foto({ cantidades: { "v-1": "12", "v-2": "8" }, nota: "para Trujillo", fechaEntrega: "2026-11-14" });
    expect(guardarBorrador(a, TALLER, f, new Date("2026-10-25T15:00:00.000Z"))).toBe(true);
    const leido = leerBorradorGuardado(a, TALLER, "m-1");
    expect(leido?.foto).toEqual(f);
    expect(leido?.guardadoEn).toBe("2026-10-25T15:00:00.000Z");
    expect(ultimoBorrador(a, TALLER)?.foto).toEqual(f);
    expect(hayBorradorEnElTaller(a, TALLER)).toBe(true);
  });
  it("un borrador con una fase «por definir» (ADR-0550) se guarda y vuelve a leerse: el que lo escribió no lo pierde", () => {
    const a = almacen();
    const fases = fasesIniciales().map((f) => (f.clave === "corte" ? { ...f, quien: "por_definir" as const } : f));
    const f = foto({ fases });
    expect(guardarBorrador(a, TALLER, f)).toBe(true);
    expect(leerBorradorGuardado(a, TALLER, "m-1")?.foto.fases.find((x) => x.clave === "corte")?.quien).toBe("por_definir");
  });
  it("es por Taller y por modelo: otro modelo u otro Taller no lo ven", () => {
    const a = almacen();
    guardarBorrador(a, TALLER, foto({ productoId: "m-1" }));
    guardarBorrador(a, TALLER, foto({ productoId: "m-2", cantidades: { "w-1": "5" } }));
    expect(leerBorradorGuardado(a, TALLER, "m-1")?.foto.cantidades).toEqual({ "v-1": "12" });
    expect(leerBorradorGuardado(a, TALLER, "m-2")?.foto.cantidades).toEqual({ "w-1": "5" });
    expect(leerBorradorGuardado(a, "otro-taller", "m-1")).toBeNull();
    expect(ultimoBorrador(a, TALLER)?.foto.productoId).toBe("m-2");
  });
  it("un modelo nuevo se guarda bajo «nuevo»", () => {
    const a = almacen();
    guardarBorrador(a, TALLER, foto({ modoModelo: "nuevo", productoId: "", cantidades: {}, nombreNuevo: "Falda Plisada" }));
    expect(a.datos.has(claveDelBorrador(TALLER, "nuevo"))).toBe(true);
  });
  it("sin modelo o sin trabajo, no guarda nada (y lo dice)", () => {
    const a = almacen();
    expect(guardarBorrador(a, TALLER, foto({ productoId: "" }))).toBe(false);
    expect(guardarBorrador(a, TALLER, foto({ cantidades: {} }))).toBe(false);
    expect(a.datos.size).toBe(0);
  });
});

describe("borrar", () => {
  it("quita el borrador de ese modelo y suelta el apunte si era el último", () => {
    const a = almacen();
    guardarBorrador(a, TALLER, foto({ productoId: "m-1" }));
    borrarBorrador(a, TALLER, "m-1");
    expect(leerBorradorGuardado(a, TALLER, "m-1")).toBeNull();
    expect(hayBorradorEnElTaller(a, TALLER)).toBe(false);
  });
  it("borrar el de un modelo no toca el de otro ni el apunte del último", () => {
    const a = almacen();
    guardarBorrador(a, TALLER, foto({ productoId: "m-1" }));
    guardarBorrador(a, TALLER, foto({ productoId: "m-2" }));
    borrarBorrador(a, TALLER, "m-1");
    expect(leerBorradorGuardado(a, TALLER, "m-2")).not.toBeNull();
    expect(ultimoBorrador(a, TALLER)?.foto.productoId).toBe("m-2");
  });
});

describe("varios borradores en un mismo Taller: ninguno queda huérfano", () => {
  it("empezar A, pasar a B y abrir la orden de B: la lista sigue ofreciendo A (antes quedaba guardado pero invisible)", () => {
    const a = almacen();
    guardarBorrador(a, TALLER, foto({ productoId: "m-A", cantidades: { "a-1": "12" } }));
    guardarBorrador(a, TALLER, foto({ productoId: "m-B", cantidades: { "b-1": "8" } }));
    expect(ultimoBorrador(a, TALLER)?.foto.productoId).toBe("m-B");
    borrarBorrador(a, TALLER, "m-B");
    expect(ultimoBorrador(a, TALLER)?.foto.productoId).toBe("m-A");
    borrarBorrador(a, TALLER, "m-A");
    expect(hayBorradorEnElTaller(a, TALLER)).toBe(false);
  });
  it("el último es el que se tocó más recientemente, no el que se creó primero", () => {
    const a = almacen();
    guardarBorrador(a, TALLER, foto({ productoId: "m-A" }));
    guardarBorrador(a, TALLER, foto({ productoId: "m-B" }));
    guardarBorrador(a, TALLER, foto({ productoId: "m-A", nota: "volví a A" }));
    expect(ultimoBorrador(a, TALLER)?.foto.productoId).toBe("m-A");
  });
  it("son diez como máximo por Taller: al llegar el once, se suelta el más viejo (el almacén del navegador es chico y no se llena de borradores olvidados)", () => {
    const a = almacen();
    for (let i = 1; i <= 11; i++) guardarBorrador(a, TALLER, foto({ productoId: `m-${i}` }));
    expect(leerBorradorGuardado(a, TALLER, "m-1")).toBeNull();
    expect(a.datos.has(claveDelBorrador(TALLER, "m-1"))).toBe(false);
    for (let i = 2; i <= 11; i++) expect(leerBorradorGuardado(a, TALLER, `m-${i}`), `m-${i}`).not.toBeNull();
    expect(ultimoBorrador(a, TALLER)?.foto.productoId).toBe("m-11");
  });
  it("un índice roto o con un modelo cuyo borrador ya no está se ignora: se ofrece el siguiente que sí se pueda leer", () => {
    const a = almacen();
    guardarBorrador(a, TALLER, foto({ productoId: "m-A" }));
    a.datos.set(`cayla:borrador-orden:${TALLER}:indice`, JSON.stringify(["m-fantasma", "m-A"]));
    expect(ultimoBorrador(a, TALLER)?.foto.productoId).toBe("m-A");
    a.datos.set(`cayla:borrador-orden:${TALLER}:indice`, "no es json");
    expect(ultimoBorrador(a, TALLER)).toBeNull();
    a.datos.set(`cayla:borrador-orden:${TALLER}:indice`, JSON.stringify([1, 2]));
    expect(ultimoBorrador(a, TALLER)).toBeNull();
  });
  it("es por Taller: el índice de uno no mezcla los borradores del otro", () => {
    const a = almacen();
    guardarBorrador(a, "t-1", foto({ productoId: "m-A" }));
    guardarBorrador(a, "t-2", foto({ productoId: "m-B" }));
    borrarBorrador(a, "t-1", "m-A");
    expect(ultimoBorrador(a, "t-1")).toBeNull();
    expect(ultimoBorrador(a, "t-2")?.foto.productoId).toBe("m-B");
  });
});

describe("lo leído se valida: un borrador malo se ignora, no rompe nada", () => {
  const bueno = JSON.stringify({ v: 1, guardadoEn: "2026-10-25T15:00:00.000Z", foto: foto() });
  it("el bueno se lee", () => {
    expect(leerBorrador(bueno)?.foto.cantidades).toEqual({ "v-1": "12" });
  });
  it("vacío, texto que no es JSON, otro tipo de valor y otra versión dan null", () => {
    for (const malo of [null, "", "{", "no es json", "42", "[]", "null", JSON.stringify({ v: 2, guardadoEn: "2026-10-25T15:00:00.000Z", foto: foto() })]) {
      expect(leerBorrador(malo), String(malo)).toBeNull();
    }
  });
  it("una hora que no es hora, o una foto a medias, dan null", () => {
    expect(leerBorrador(JSON.stringify({ v: 1, guardadoEn: "ayer", foto: foto() }))).toBeNull();
    expect(leerBorrador(JSON.stringify({ v: 1, guardadoEn: "2026-10-25T15:00:00.000Z" }))).toBeNull();
    const sinNota: Partial<FotoDelBorrador> = { ...foto() };
    delete sinNota.nota;
    expect(leerBorrador(JSON.stringify({ v: 1, guardadoEn: "2026-10-25T15:00:00.000Z", foto: sinNota }))).toBeNull();
  });
  it("una fase de una clave que ya no existe, o una cantidad que no es texto, dan null", () => {
    const fases = [...fasesIniciales(), { ...fasesIniciales()[0], clave: "fase_inventada" }];
    expect(leerBorrador(JSON.stringify({ v: 1, guardadoEn: "2026-10-25T15:00:00.000Z", foto: foto({ fases: fases as never }) }))).toBeNull();
    expect(leerBorrador(JSON.stringify({ v: 1, guardadoEn: "2026-10-25T15:00:00.000Z", foto: foto({ cantidades: { "v-1": 12 } as never }) }))).toBeNull();
  });
  it("un borrador guardado a medias en el almacén (basura) se lee como «no hay»", () => {
    const a = almacen();
    a.datos.set(claveDelBorrador(TALLER, "m-1"), "{\"v\":1,");
    a.datos.set(`cayla:borrador-orden:${TALLER}:indice`, JSON.stringify(["m-1"]));
    expect(leerBorradorGuardado(a, TALLER, "m-1")).toBeNull();
    expect(ultimoBorrador(a, TALLER)).toBeNull();
    expect(hayBorradorEnElTaller(a, TALLER)).toBe(false);
  });
});

describe("un almacén que falla nunca lanza (ventana privada, disco lleno, datos del sitio bloqueados)", () => {
  it("al escribir dice false; al leer dice null; al borrar no hace nada", () => {
    const sinEscribir = almacen("escribir");
    expect(guardarBorrador(sinEscribir, TALLER, foto())).toBe(false);
    const sinLeer = almacen("leer");
    expect(leerBorradorGuardado(sinLeer, TALLER, "m-1")).toBeNull();
    expect(ultimoBorrador(sinLeer, TALLER)).toBeNull();
    const roto = almacen("todo");
    expect(() => borrarBorrador(roto, TALLER, "m-1")).not.toThrow();
    expect(guardarBorrador(roto, TALLER, foto())).toBe(false);
    expect(hayBorradorEnElTaller(roto, TALLER)).toBe(false);
  });
  it("sin almacén (null: ni se puede pedir) tampoco lanza", () => {
    expect(guardarBorrador(null, TALLER, foto())).toBe(false);
    expect(leerBorradorGuardado(null, TALLER, "m-1")).toBeNull();
    expect(ultimoBorrador(null, TALLER)).toBeNull();
    expect(() => borrarBorrador(null, TALLER, "m-1")).not.toThrow();
  });
});

describe("el resumen que la lista le muestra a la persona", () => {
  it("cuenta solo las cantidades válidas: un texto a medias, un cero o un número partido no suman", () => {
    expect(prendasDelBorrador({ cantidades: { a: "12", b: "8", c: "", d: "0", e: "abc", f: "1.5", g: " 5 ", h: "-3" } })).toBe(25);
    expect(prendasDelBorrador({ cantidades: {} })).toBe(0);
  });
  it("nombra el modelo por lo que ve la persona; uno nuevo, por el nombre que le estaba poniendo; uno que ya no está, sin inventar", () => {
    const nombres = new Map([["m-1", "Blusa Emma"]]);
    expect(resumenDelBorrador(foto(), nombres)).toEqual({ modelo: "Blusa Emma", prendas: 12 });
    expect(resumenDelBorrador(foto({ modoModelo: "nuevo", productoId: "", nombreNuevo: " Falda Plisada " }), nombres).modelo).toBe("Falda Plisada");
    expect(resumenDelBorrador(foto({ modoModelo: "nuevo", productoId: "", nombreNuevo: "" }), nombres).modelo).toBe("un modelo nuevo");
    expect(resumenDelBorrador(foto({ productoId: "m-borrado" }), nombres).modelo).toBe("un modelo que ya no está");
  });
});

describe("el texto crudo del último (lo que compara la lista para repintarse)", () => {
  it("es el mismo texto mientras no cambia nada, y cambia cuando se guarda otra cosa", () => {
    const a = almacen();
    expect(textoDelUltimoBorrador(a, TALLER)).toBeNull();
    guardarBorrador(a, TALLER, foto(), new Date("2026-10-25T15:00:00.000Z"));
    const uno = textoDelUltimoBorrador(a, TALLER);
    expect(uno).toBe(textoDelUltimoBorrador(a, TALLER));
    guardarBorrador(a, TALLER, foto({ nota: "otra" }), new Date("2026-10-25T15:00:00.000Z"));
    expect(textoDelUltimoBorrador(a, TALLER)).not.toBe(uno);
  });
  it("sin almacén o con un almacén roto da null, sin lanzar", () => {
    expect(textoDelUltimoBorrador(null, TALLER)).toBeNull();
    expect(textoDelUltimoBorrador(almacen("leer"), TALLER)).toBeNull();
  });
});

describe("haceCuanto", () => {
  const ahora = new Date("2026-10-25T15:00:00.000Z");
  it("lo dice en la unidad que se entiende", () => {
    expect(haceCuanto("2026-10-25T14:59:40.000Z", ahora)).toBe("hace un momento");
    expect(haceCuanto("2026-10-25T14:55:00.000Z", ahora)).toBe("hace 5 min");
    expect(haceCuanto("2026-10-25T12:00:00.000Z", ahora)).toBe("hace 3 h");
    expect(haceCuanto("2026-10-23T15:00:00.000Z", ahora)).toBe("hace 2 d");
  });
  it("una hora del futuro (el reloj cambió) no sale negativa", () => {
    expect(haceCuanto("2026-10-25T16:00:00.000Z", ahora)).toBe("hace un momento");
  });
});
