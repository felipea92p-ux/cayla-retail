import { describe, expect, it } from "vitest";
import { faltanDe, sePuedeConfirmar } from "./guia-campos";
import {
  camposAprobar,
  camposRendir,
  cuentaRendicion,
  estadoPorFondo,
  etiquetaItem,
  fraseAprobar,
  fraseCuenta,
  fraseRendir,
  fraseSinFoto,
  leerItemsRendicion,
  leerMiFondoRendicion,
  leerRendiciones,
  textoPapel,
  type Rendicion,
} from "./rendicion-reglas";

// La rendición del fondo (ADR-0362, fase 6 · actividad 5). Lo que falta en cada hoja tiene que ser lo MISMO que rechaza la base
// (20261013235000, `scripts/pruebas/rendicion_fondo.mjs`): estos casos son los suyos, del lado de la pantalla.

const PERSONA = { esPersona: true, listo: true, motivo: null };
const R: Rendicion = {
  id: "r1",
  cuentaId: "f1",
  personaId: "p1",
  persona: "Ana Prueba",
  estado: "por_aprobar",
  arrastre: 0,
  entregado: 500,
  devuelto: 0,
  pagado: 300,
  gastos: 80,
  otros: 0,
  saldo: 120,
  efectivo: 100,
  faltante: 20,
  explicacion: "Se me cayó un billete",
  items: 3,
  sinFoto: 2,
  rendidaEn: "2026-10-13T22:00:00Z",
  decision: null,
  nota: null,
  aprobadaEn: null,
  aprobadaPor: null,
  motivoDevolucion: null,
  devueltaEn: null,
  devueltaPor: null,
  porQueNoAprueba: null,
};

describe("leer lo que manda la base", () => {
  it("lo que la tarjeta suma por la rendición; sin fila, nada", () => {
    expect(
      leerMiFondoRendicion([
        { arrastre: "120.00", items: 2, sin_foto: "1", rendicion_id: "r1", rendicion_en: "2026-10-13T22:00:00Z", rendicion_faltante: "20.00", deuda: "0" },
      ]),
    ).toEqual({ arrastre: 120, items: 2, sinFoto: 1, abierta: { id: "r1", en: "2026-10-13T22:00:00Z", faltante: 20 }, deuda: 0 });
    expect(leerMiFondoRendicion([{ arrastre: 0, items: 0 }])).toEqual({ arrastre: 0, items: 0, sinFoto: 0, abierta: null, deuda: 0 });
    expect(leerMiFondoRendicion([])).toBeNull();
  });
  it("las filas de una rendición: un tipo desconocido es «otro», sin papel es null, sin clave se descarta", () => {
    const items = leerItemsRendicion([
      { clave: "pago:a", origen: "pago", monto: "-300.00", fecha: "2026-10-12", detalle: "Pago a X", tipo: "pago", ref_id: "a", compra_id: "c", con_foto: false, fotos: 0 },
      { clave: "mov:b", origen: "movimiento", monto: 500, tipo: "mov", con_foto: null },
      { clave: "z:1", tipo: "raro" },
      { tipo: "gasto" },
    ]);
    expect(items.map((i) => [i.clave, i.tipo, i.monto, i.conFoto])).toEqual([
      ["pago:a", "pago", -300, false],
      ["mov:b", "mov", 500, null],
      ["z:1", "otro", 0, null],
    ]);
  });
  it("el tablero: una fila sin id o con un estado que no existe se descarta; la decisión se lee o queda en null", () => {
    const rs = leerRendiciones([
      { id: "r1", estado: "aprobada", persona_nombre: "Ana", faltante: "20", decision: "deuda_persona", saldo: 120, efectivo: 100 },
      { id: "r2", estado: "rara" },
      { estado: "por_aprobar" },
    ]);
    expect(rs.map((r) => [r.id, r.estado, r.faltante, r.decision])).toEqual([["r1", "aprobada", 20, "deuda_persona"]]);
  });
});

describe("la cuenta de la rendición (la misma que la base)", () => {
  it("cuadra, falta o sobra contra lo que debería tener", () => {
    expect(cuentaRendicion(120, "120")).toMatchObject({ estado: "cuadra", deberias: 120 });
    expect(cuentaRendicion(120, "100")).toMatchObject({ estado: "falta", faltante: 20 });
    expect(cuentaRendicion(120, "150")).toMatchObject({ estado: "sobra", sobra: 30 });
    expect(cuentaRendicion(120, "")).toMatchObject({ estado: "sin_escribir", efectivo: null });
    expect(cuentaRendicion(120, "abc")).toMatchObject({ estado: "invalido" });
  });
  it("con el fondo en negativo debería tener 0 y CAYLA le debe (decisión 32): en cero cuadra; con plata, sobra", () => {
    expect(cuentaRendicion(-280, "0")).toMatchObject({ estado: "cuadra", deberias: 0, caylaTeDebe: 280 });
    expect(cuentaRendicion(-280, "10")).toMatchObject({ estado: "sobra", sobra: 10 });
    expect(fraseCuenta(cuentaRendicion(-280, "0"))).toBe("Cuadra. CAYLA te debe S/ 280.00: se te devuelve con una entrega.");
  });
  it("lo que dice bajo el campo", () => {
    expect(fraseCuenta(cuentaRendicion(120, "120"))).toBe("Cuadra.");
    expect(fraseCuenta(cuentaRendicion(120, "100"))).toBe("Te faltan S/ 20.00. Escribe qué pasó: si no, quedan como deuda tuya.");
    expect(fraseCuenta(cuentaRendicion(120, "150"))).toMatch(/^Tienes S\/ 30\.00 más de lo que dice tu fondo/);
    expect(fraseCuenta(cuentaRendicion(120, ""))).toBeNull();
  });
});

describe("lo que falta en «Rendir tu fondo»", () => {
  it("sin el efectivo no se rinde; con lo justo o con menos, sí (la explicación no es obligatoria)", () => {
    expect(faltanDe(camposRendir({ efectivo: "", explicacion: "" }, 120)).map((c) => c.id)).toEqual(["efectivo"]);
    expect(sePuedeConfirmar(camposRendir({ efectivo: "120", explicacion: "" }, 120))).toBe(true);
    expect(sePuedeConfirmar(camposRendir({ efectivo: "100", explicacion: "" }, 120))).toBe(true);
  });
  it("con faltante la explicación se sugiere; si cuadra ni aparece", () => {
    expect(camposRendir({ efectivo: "100", explicacion: "" }, 120).map((c) => [c.id, c.requerido, c.sugerido])).toEqual([
      ["efectivo", true, undefined],
      ["explicacion", false, true],
    ]);
    expect(camposRendir({ efectivo: "120", explicacion: "" }, 120).map((c) => c.id)).toEqual(["efectivo"]);
  });
  it("más plata de la que dice el fondo no se rinde (la base la frena)", () => {
    expect(sePuedeConfirmar(camposRendir({ efectivo: "150", explicacion: "" }, 120))).toBe(false);
    expect(sePuedeConfirmar(camposRendir({ efectivo: "1", explicacion: "" }, -280))).toBe(false);
  });
});

describe("lo que falta en «Revisar la rendición»", () => {
  it("faltante con explicación: hay que elegir quién lo asume", () => {
    expect(faltanDe(camposAprobar(R, { decision: "", nota: "" }, PERSONA)).map((c) => c.id)).toEqual(["decision"]);
    expect(sePuedeConfirmar(camposAprobar(R, { decision: "asume_cayla", nota: "" }, PERSONA))).toBe(true);
  });
  it("sin explicación, o sin faltante, no se elige (es deuda, o cuadró)", () => {
    expect(camposAprobar({ ...R, explicacion: null }, { decision: "", nota: "" }, PERSONA).map((c) => c.id)).toEqual(["nota"]);
    expect(sePuedeConfirmar(camposAprobar({ ...R, faltante: 0 }, { decision: "", nota: "" }, PERSONA))).toBe(true);
  });
  it("desde una terminal, además, quién aprueba", () => {
    expect(faltanDe(camposAprobar({ ...R, faltante: 0 }, { decision: "", nota: "" }, { esPersona: false, listo: false, motivo: null })).map((c) => c.id)).toEqual([
      "responsable",
    ]);
  });
});

describe("los textos", () => {
  it("los botones dicen cómo queda", () => {
    expect(fraseRendir(cuentaRendicion(120, "100"))).toBe("Rendir: tengo S/ 100.00");
    expect(fraseRendir(cuentaRendicion(120, ""))).toBe("Rendir mi fondo");
    expect(fraseAprobar(R, "asume_cayla")).toBe("Aprobar: CAYLA asume S/ 20.00");
    expect(fraseAprobar(R, "deuda_persona")).toBe("Aprobar: debe S/ 20.00");
    expect(fraseAprobar({ ...R, explicacion: null }, "")).toBe("Aprobar: debe S/ 20.00");
    expect(fraseAprobar({ ...R, faltante: 0 }, "")).toBe("Aprobar la rendición");
  });
  it("cada fila en palabras de tienda, según quién lee; su papel; cuántos sin foto", () => {
    const entrega = leerItemsRendicion([{ clave: "mov:x", tipo: "mov", monto: 500 }])[0]!;
    const devolucion = leerItemsRendicion([{ clave: "mov:y", tipo: "mov", monto: -50 }])[0]!;
    expect([etiquetaItem(entrega), etiquetaItem(entrega, "revisa"), etiquetaItem(devolucion), etiquetaItem(devolucion, "revisa")]).toEqual([
      "Te entregaron",
      "Le entregaron",
      "Devolviste",
      "Devolvió",
    ]);
    expect([textoPapel({ tipo: "pago", conFoto: false }), textoPapel({ tipo: "gasto", conFoto: true }), textoPapel({ tipo: "mov", conFoto: null })]).toEqual([
      "Sin papel",
      "Con foto",
      null,
    ]);
    expect(fraseSinFoto(0)).toBeNull();
    expect(fraseSinFoto(2)).toBe("2 papeles sin foto: súbelas si las tienes (no son obligatorias).");
    expect(fraseSinFoto(1, "revisa")).toBe("1 papel sin foto (la foto es opcional).");
  });
});

describe("el tablero de quien aprueba", () => {
  it("por fondo: la rendición que espera (lo que se debe sale de fn_deudas_fondo, actividad 7)", () => {
    const e = estadoPorFondo([
      R,
      { ...R, id: "r0", estado: "aprobada", decision: "deuda_persona", faltante: 20 },
      { ...R, id: "r-1", estado: "aprobada", decision: "asume_cayla", faltante: 15 },
      { ...R, id: "r-2", estado: "devuelta", faltante: 50 },
    ]);
    expect(e.get("f1")).toEqual({ porAprobar: expect.objectContaining({ id: "r1" }) });
  });
});
