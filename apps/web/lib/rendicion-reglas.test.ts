import { describe, expect, it } from "vitest";
import { faltanDe, sePuedeConfirmar } from "./guia-campos";
import {
  camposAprobar,
  camposRendir,
  cuentaRendicion,
  estadoPorFondo,
  etiquetaItem,
  detalleAprobada,
  fraseAprobar,
  fraseCuenta,
  fraseFaltanteSinExplicar,
  fraseFaltanteTuRendicion,
  fraseRendir,
  fraseSinFoto,
  lecturaLista,
  leerItemsRendicion,
  leerMiFondoRendicion,
  leerMiRendicionAbierta,
  leerRendiciones,
  pieListaRevisar,
  resumenItems,
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
      // El pago de un papel del Taller desde el fondo (ADR-0362, fase 7 parte 2): un pago a proveedor, sin foto que pedir.
      { clave: "pagoprod:t", origen: "pago", monto: "-164.02", detalle: "Pago del Taller a Telas Peña · F001-220", tipo: "pagoprod", con_foto: null, fotos: 0 },
    ]);
    expect(items.map((i) => [i.clave, i.tipo, i.monto, i.conFoto])).toEqual([
      ["pago:a", "pago", -300, false],
      ["mov:b", "mov", 500, null],
      ["z:1", "otro", 0, null],
      ["pagoprod:t", "pago", -164.02, null],
    ]);
    expect([etiquetaItem(items[3]!), textoPapel(items[3]!), resumenItems(items.filter((i) => i.tipo === "pago"))]).toEqual([
      "Pago a proveedor",
      null,
      "2 pagos a proveedores",
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
    expect(fraseCuenta(cuentaRendicion(-280, "0"))).toBe("Cuadra. CAYLA te debe S/\u00a0280.00: se te devuelve con una entrega.");
  });
  it("lo que dice bajo el campo", () => {
    expect(fraseCuenta(cuentaRendicion(120, "120"))).toBe("Cuadra.");
    expect(fraseCuenta(cuentaRendicion(120, "100"))).toBe("Te faltan S/\u00a020.00. Escribe qué pasó: si no, quedan como deuda tuya cuando la aprueben.");
    // Con una deuda de antes, dice en qué queda (/formidable 2026-10-14, cambio 3: «¿los S/ 20 se suman a lo que ya debo?»).
    expect(fraseCuenta(cuentaRendicion(120, "100"), 25)).toBe(
      "Te faltan S/\u00a020.00. Escribe qué pasó: si no, tu deuda pasa de S/\u00a025.00 a S/\u00a045.00 cuando la aprueben.",
    );
    expect(fraseCuenta(cuentaRendicion(120, "150"))).toMatch(/^Tienes S\/\u00a030\.00 más de lo que dice tu fondo/);
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
    expect(fraseRendir(cuentaRendicion(120, "100"))).toBe("Rendir: tengo S/\u00a0100.00");
    expect(fraseRendir(cuentaRendicion(120, ""))).toBe("Rendir mi fondo");
    expect(fraseAprobar(R, "asume_cayla")).toBe("Aprobar: CAYLA asume S/\u00a020.00");
    expect(fraseAprobar(R, "deuda_persona")).toBe("Aprobar: queda debiendo S/\u00a020.00");
    expect(fraseAprobar({ ...R, explicacion: null }, "")).toBe("Aprobar: queda debiendo S/\u00a020.00");
    // Con una deuda de antes, el botón dice en cuánto queda (/formidable 2026-10-14, cambio 3).
    expect(fraseAprobar({ ...R, explicacion: null }, "", 25)).toBe("Aprobar: su deuda sube a S/\u00a045.00");
    expect(fraseAprobar(R, "asume_cayla", 25)).toBe("Aprobar: CAYLA asume S/\u00a020.00");
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

// /formidable 2026-10-14, cambio 2: una lectura que falla no es una lista vacía, y «Aprobar» espera a que se vea lo que rindió.
describe("la lista de lo rendido dentro de una hoja", () => {
  it("cargando, leída o sin poder leerse; el pie dice qué esperar", () => {
    expect(lecturaLista(null, false)).toBe("cargando");
    expect(lecturaLista([], false)).toBe("lista");
    expect(lecturaLista(null, true)).toBe("falla");
    expect(lecturaLista([], true)).toBe("falla");
    expect(pieListaRevisar("cargando")).toBe("Espera a que cargue lo que rindió.");
    expect(pieListaRevisar("falla")).toBe("Para aprobar, primero tiene que verse lo que rindió: vuelve a intentar.");
    expect(pieListaRevisar("lista")).toBeNull();
  });
});

// /formidable 2026-10-14, cambio 3: la cuenta de cada persona, en una sola frase.
describe("la cuenta de la persona, dicha entera", () => {
  it("el faltante sin explicar dice en cuánto queda su deuda", () => {
    expect(fraseFaltanteSinExplicar(5, 25)).toBe("No escribió qué pasó: si se aprueba así, su deuda pasa de S/\u00a025.00 a S/\u00a030.00.");
    expect(fraseFaltanteSinExplicar(5)).toBe("No escribió qué pasó: si se aprueba así, queda debiendo S/\u00a05.00.");
  });

  it("el aviso al aprobar dice cómo quedó", () => {
    expect(detalleAprobada(5, "asume_cayla", "Micaela", 25)).toBe("CAYLA asume S/\u00a05.00.");
    expect(detalleAprobada(5, "deuda_persona", "Micaela", 25)).toBe("La deuda de Micaela queda en S/\u00a030.00.");
    expect(detalleAprobada(5, "deuda_persona", "Micaela")).toBe("Micaela queda debiendo S/\u00a05.00.");
  });

  it("«Ver tu rendición» dice lo cierto: con explicación decide quien revisa; sin ella es deuda; sin leerla, las dos cosas", () => {
    expect(fraseFaltanteTuRendicion("Pagué la propina del cargador", 5, 25)).toBe(
      "Escribiste: «Pagué la propina del cargador». Quien la revisa decide si lo asume CAYLA o queda como deuda tuya.",
    );
    expect(fraseFaltanteTuRendicion(null, 5, 25)).toBe("No escribiste qué pasó: cuando la aprueben, tu deuda pasa de S/\u00a025.00 a S/\u00a030.00.");
    expect(fraseFaltanteTuRendicion(null, 5)).toBe("No escribiste qué pasó: cuando la aprueben, queda como deuda tuya.");
    expect(fraseFaltanteTuRendicion(undefined, 5, 25)).toBe(
      "Si al rendir escribiste qué pasó, quien la revisa decide si lo asume CAYLA; si no, queda como deuda tuya.",
    );
  });

  it("lo que hay en una rendición se cuenta con nombres, no en «filas»", () => {
    const i = (tipo: "mov" | "pago" | "gasto" | "otro", monto: number) => ({ tipo, monto });
    expect(resumenItems([i("gasto", -20), i("mov", 100)])).toBe("1 gasto y 1 entrega");
    expect(resumenItems([i("pago", -300), i("gasto", -20), i("gasto", -10), i("mov", 500), i("mov", -120)])).toBe(
      "1 pago a proveedor, 2 gastos, 1 entrega y 1 devolución",
    );
    expect(resumenItems([i("gasto", -20)])).toBe("1 gasto");
    expect(resumenItems([])).toBe("nada");
  });

  it("la rendición abierta de quien pregunta: su explicación, o nada si no hay", () => {
    expect(leerMiRendicionAbierta({ id: "r1", en: "2026-10-14T21:21:04Z", faltante: 5, explicacion: "Un taxi" })).toEqual({ id: "r1", explicacion: "Un taxi" });
    expect(leerMiRendicionAbierta({ id: "r1", explicacion: null })).toEqual({ id: "r1", explicacion: null });
    expect(leerMiRendicionAbierta(null)).toBeNull();
    expect(leerMiRendicionAbierta([{ id: "r1" }])).toBeNull();
    expect(leerMiRendicionAbierta({ explicacion: "sin id" })).toBeNull();
  });
});
