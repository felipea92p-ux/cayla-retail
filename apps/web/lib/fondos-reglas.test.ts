import { describe, expect, it } from "vitest";
import { faltanDe, sePuedeConfirmar } from "./guia-campos";
import {
  accionTuFondo,
  camposDevolver,
  camposEntregar,
  caraTuFondo,
  cifrasDeFondos,
  conMiFondo,
  cuentaDeMiFondo,
  fraseDevolver,
  fraseEntregar,
  hrefTuFondo,
  leerFondos,
  leerMiFondo,
  leerMovimientosFondos,
  leerOpcionesFondos,
  leerResumenMiFondo,
  mostrarTuFondo,
  opcionesDeCuentas,
  opcionesDePersonas,
  problemaDeMonto,
  problemaDeMotivo,
  problemaDePersona,
  subtituloDevolver,
  topeDevolucion,
  type OpcionesFondos,
  type ResumenMiFondo,
} from "./fondos-reglas";

/** El monto en una frase va con un espacio que no se parte (`solesSinCorte`): así se escribe lo esperado sin ese carácter invisible. */
const nb = (s: string) => s.replaceAll("S/ ", "S/\u00a0");

// Fondos por rendir (ADR-0362, fase 6 · actividad 1). Lo que falta en cada hoja tiene que ser lo MISMO que rechaza la base
// (20261013182000, `scripts/pruebas/fondos.mjs`): estos casos son los suyos, del lado de la pantalla.

const OPCIONES: OpcionesFondos = {
  yo: "p-felipe",
  personas: [
    { id: "p-felipe", nombre: "Felipe Alvarez", sede: null },
    { id: "p-micaela", nombre: "Micaela Vendedora", sede: "Tienda Trujillo" },
  ],
  cuentas: [
    { id: "c-fuerte", nombre: "Caja fuerte · Tienda Trujillo", tipo: "caja_fuerte", sede: "Tienda Trujillo" },
    { id: "c-bcp", nombre: "BCP", tipo: "banco", sede: null },
    { id: "c-lider", nombre: "Efectivo entregado al líder", tipo: "por_rendir", sede: null },
  ],
};
const PERSONA = { esPersona: true, listo: true, motivo: null };

describe("leer lo que manda la base", () => {
  it("convierte las filas de fn_fondos y descarta las que no se pueden mostrar", () => {
    const f = leerFondos([
      { cuenta_id: "c1", persona_id: "p1", persona_nombre: "Micaela Vendedora", sede_nombre: "Tienda Trujillo", saldo: "380.00",
        entregado: 500, devuelto: "120.00", gastado: 0, primera_entrega: "2026-10-12", ultima_entrega: "2026-10-13", ultimo_motivo: "Gamarra", es_mio: false },
      { cuenta_id: null, persona_id: "p2" },
      "basura",
    ]);
    expect(f).toEqual([
      { cuentaId: "c1", personaId: "p1", persona: "Micaela Vendedora", sede: "Tienda Trujillo", saldo: 380, entregado: 500, devuelto: 120,
        gastado: 0, primeraEntrega: "2026-10-12", ultimaEntrega: "2026-10-13", ultimoMotivo: "Gamarra", esMio: false },
    ]);
    expect(leerFondos(null)).toEqual([]);
  });

  it("los movimientos: un tipo desconocido no se adivina, y uno anulado nunca se ofrece para anular", () => {
    const m = leerMovimientosFondos([
      { id: "m1", tipo: "entrega_fondo", fecha: "2026-10-13", persona_id: "p1", persona_nombre: "Micaela", cuenta_id: "c1", cuenta_nombre: "BCP",
        monto: "500.00", motivo: "Gamarra", estado: "vigente", puede_anular: true, creado_en: "2026-10-13T15:00:00Z" },
      { id: "m2", tipo: "devolucion_fondo", fecha: "2026-10-13", monto: 20, estado: "anulado", motivo_anulacion: "Error", puede_anular: true },
      { id: "m3", tipo: "deposito", fecha: "2026-10-13", monto: 10 },
    ]);
    expect(m.map((x) => [x.id, x.tipo, x.monto, x.estado, x.puedeAnular])).toEqual([
      ["m1", "entrega_fondo", 500, "vigente", true],
      ["m2", "devolucion_fondo", 20, "anulado", false],
    ]);
  });

  it("las opciones: descarta cuentas que no sirven para un fondo", () => {
    const o = leerOpcionesFondos({ yo: "p1", personas: [{ id: "p1", nombre: "Ana" }, { nombre: "sin id" }], cuentas: [{ id: "c1", nombre: "BCP", tipo: "banco" }, { id: "c2", tipo: "cajon" }] });
    expect(o).toEqual({ yo: "p1", personas: [{ id: "p1", nombre: "Ana", sede: null }], cuentas: [{ id: "c1", nombre: "BCP", tipo: "banco", sede: null }] });
    expect(leerOpcionesFondos(undefined)).toEqual({ yo: null, personas: [], cuentas: [] });
  });
});

describe("las cifras de arriba", () => {
  it("suman lo de todos; un fondo en negativo no resta de lo que tienen en la mano: es lo que CAYLA le debe (actividad 2)", () => {
    const base = { cuentaId: "c", sede: null, primeraEntrega: null, ultimaEntrega: null, ultimoMotivo: null, esMio: false };
    expect(
      cifrasDeFondos([
        { ...base, personaId: "a", persona: "A", saldo: 380, entregado: 500, devuelto: 120, gastado: 0 },
        { ...base, personaId: "b", persona: "B", saldo: 0, entregado: 100, devuelto: 100, gastado: 0 },
        { ...base, personaId: "c", persona: "C", saldo: -10.1, entregado: 50, devuelto: 0, gastado: 60.1 },
      ]),
    ).toEqual({ enMano: 380, conPlata: 1, teDebe: 10.1, conDeuda: 1, entregado: 650, devuelto: 220, gastado: 60.1 });
  });
});

describe("«Mi fondo» en los pagos de Compras (actividad 2)", () => {
  it("lee la fila de fn_mi_fondo; sin fila, sin cuenta o con basura, no hay fondo", () => {
    expect(leerMiFondo([{ cuenta_id: "f1", nombre: "Fondo · Ana", saldo: "380.00" }])).toEqual({ cuentaId: "f1", nombre: "Fondo · Ana", saldo: 380 });
    expect(leerMiFondo([{ cuenta_id: "f1", saldo: "-120.5" }])).toEqual({ cuentaId: "f1", nombre: "Mi fondo", saldo: -120.5 });
    expect(leerMiFondo([])).toBeNull();
    expect(leerMiFondo([{ nombre: "sin cuenta" }])).toBeNull();
    expect(leerMiFondo(null)).toBeNull();
  });

  it("es una cuenta más del combo, primero; con plata se propone para el efectivo, sin plata no", () => {
    const conPlata = cuentaDeMiFondo({ cuentaId: "f1", nombre: "Fondo · Ana", saldo: 380 });
    expect(conPlata).toEqual({ id: "f1", nombre: "Mi fondo", tipo: "fondo", ubicacionId: null, ubicacionNombre: null, cajaAbierta: false, propuestaPara: ["efectivo"], saldo: 380 });
    expect(cuentaDeMiFondo({ cuentaId: "f1", nombre: "x", saldo: 0 }).propuestaPara).toEqual([]);
    expect(cuentaDeMiFondo({ cuentaId: "f1", nombre: "x", saldo: -50 }).propuestaPara).toEqual([]);
    const banco = { id: "b1", nombre: "BCP", tipo: "banco" as const, ubicacionId: null, ubicacionNombre: null, cajaAbierta: false, propuestaPara: [] };
    expect(conMiFondo([banco], { cuentaId: "f1", nombre: "x", saldo: 10 }).map((c) => c.id)).toEqual(["f1", "b1"]);
    expect(conMiFondo([banco], null)).toEqual([banco]);
  });
});

describe("«Tu fondo» (actividad 4): la tarjeta de Órdenes de compra y del Inicio", () => {
  const fecha = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const BASE: ResumenMiFondo = {
    cuentaId: "f1",
    saldo: 500,
    entregado: 500,
    devuelto: 0,
    pagado: 0,
    gastos: 0,
    otros: 0,
    desde: "2026-10-13",
    paraQue: "Compras Gamarra",
    ultimaEntrega: "2026-10-13",
    rendicion: null,
  };
  const cara = (r: Partial<ResumenMiFondo>) => caraTuFondo({ ...BASE, ...r }, fecha);

  it("lee la fila de fn_mi_fondo_resumen (los números llegan como texto); sin fila o sin cuenta, nada", () => {
    expect(
      leerResumenMiFondo([
        { cuenta_id: "f1", saldo: "-194.40", entregado: "300.00", devuelto: "0", pagado: "414.40", gastos: "80.00", otros: "0", desde: "2026-10-13", para_que: "Gamarra", ultima_entrega: "2026-10-13" },
      ]),
    ).toEqual({ cuentaId: "f1", saldo: -194.4, entregado: 300, devuelto: 0, pagado: 414.4, gastos: 80, otros: 0, desde: "2026-10-13", paraQue: "Gamarra", ultimaEntrega: "2026-10-13", rendicion: null });
    expect(leerResumenMiFondo([{ cuenta_id: "f1" }])).toEqual({ cuentaId: "f1", saldo: 0, entregado: 0, devuelto: 0, pagado: 0, gastos: 0, otros: 0, desde: null, paraQue: null, ultimaEntrega: null, rendicion: null });
    expect(leerResumenMiFondo([])).toBeNull();
    expect(leerResumenMiFondo([{ saldo: 10 }])).toBeNull();
    expect(leerResumenMiFondo("basura")).toBeNull();
  });

  it("sale con un fondo que tiene o tuvo plata; sin fondo, o con su única entrega anulada, no", () => {
    expect(mostrarTuFondo(BASE)).toBe(true);
    expect(mostrarTuFondo({ ...BASE, saldo: 0 })).toBe(true); // lo gastó todo: igual le dice cuánto
    expect(mostrarTuFondo({ ...BASE, saldo: -20, entregado: 0 })).toBe(true);
    expect(mostrarTuFondo({ ...BASE, saldo: 0, entregado: 0 })).toBe(false);
    expect(mostrarTuFondo(null)).toBe(false);
  });

  it("con todo en la mano: lo que le entregaron y que aún no gasta", () => {
    expect(cara({})).toEqual({
      valor: "S/ 500.00",
      unidad: "te queda",
      debe: false,
      contexto: "Te entregaron S/ 500.00; aún no gastas nada",
      pie: "Desde el 13/10 · para «Compras Gamarra»",
      aviso: null,
      puedeRendir: false,
      rendicionAbierta: false,
    });
  });

  it("después de pagar y anotar gastos: «te queda» y cuánto gastó de lo entregado (proveedores y viaje juntos)", () => {
    const c = cara({ saldo: 200, pagado: 220, gastos: 80 });
    expect([c.valor, c.unidad, c.contexto]).toEqual(["S/ 200.00", "te queda", "Gastaste S/ 300.00 de S/ 500.00"]);
    expect(cara({ saldo: 100, devuelto: 100, pagado: 300 }).contexto).toBe("Gastaste S/ 300.00 y devolviste S/ 100.00 de S/ 500.00");
    expect(cara({ saldo: 0, devuelto: 500 }).contexto).toBe("Devolviste S/ 500.00 de S/ 500.00");
    expect(cara({ saldo: 0, pagado: 500 })).toMatchObject({ valor: "S/ 0.00", unidad: "te queda", contexto: "Gastaste S/ 500.00 de S/ 500.00" });
  });

  it("si pagó de su bolsillo, el número es lo que CAYLA le debe (nunca negativo), en ámbar, y el contexto lo dice", () => {
    const c = cara({ saldo: -194.4, entregado: 300, pagado: 414.4, gastos: 80 });
    expect(c).toMatchObject({ valor: "S/ 194.40", unidad: null, debe: true });
    expect(c.contexto).toBe("CAYLA te debe: gastaste S/ 494.40 de S/ 300.00");
  });

  it("el pie dice desde cuándo y para qué, con lo que haya", () => {
    expect(cara({ paraQue: null }).pie).toBe("Desde el 13/10");
    expect(cara({ desde: null }).pie).toBe("Para «Compras Gamarra»");
    expect(cara({ paraQue: null, desde: null }).pie).toBeNull();
  });

  it("con la rendición (actividad 5): cuenta lo que se trajo de la anterior, ofrece «Rendir», dice la que espera y la deuda", () => {
    const R = { arrastre: 0, items: 0, sinFoto: 0, abierta: null, deuda: 0 };
    // Rendida y aprobada con S/ 120 en la mano; el ciclo nuevo aún sin nada.
    expect(cara({ saldo: 120, entregado: 0, rendicion: { ...R, arrastre: 120 } })).toMatchObject({
      contexto: "Te quedaron S/ 120.00 de tu rendición; aún no gastas nada",
      puedeRendir: false,
    });
    // Con S/ 120 de antes, le entregan 300 y paga 100: gastó 100 de 420.
    expect(cara({ saldo: 320, entregado: 300, rendicion: { ...R, arrastre: 120, items: 2 } })).toMatchObject({
      contexto: "Gastaste S/ 100.00 de S/ 420.00",
      puedeRendir: true,
    });
    // CAYLA le debía 280 de la rendición anterior y no hay nada nuevo: lo dice, en ámbar.
    expect(cara({ saldo: -280, entregado: 0, rendicion: { ...R, arrastre: -280 } })).toMatchObject({
      valor: "S/ 280.00",
      debe: true,
      contexto: "CAYLA te debe: viene de tu rendición: se te devuelve con una entrega",
    });
    // Una rendición por aprobar: el pie lo dice y no se ofrece otra.
    const abierta = cara({ saldo: 120, rendicion: { ...R, items: 1, abierta: { id: "r1", en: "2026-10-13T22:00:00Z", faltante: 0 } } });
    expect([abierta.pie, abierta.puedeRendir, abierta.rendicionAbierta]).toEqual(["Rendiste el 13/10: espera aprobación", false, true]);
    // Recién rendida, sin nada nuevo: no dice «te quedaron» (quien revisa todavía puede cambiarlo).
    expect(cara({ saldo: 350, entregado: 0, rendicion: { ...R, arrastre: 350, abierta: { id: "r1", en: "2026-10-13T22:00:00Z", faltante: 10 } } }).contexto).toBe(
      "Desde que rendiste, aún no gastas nada",
    );
    // Una deuda por faltante: a la vista.
    expect(cara({ saldo: 100, entregado: 0, rendicion: { ...R, arrastre: 100, deuda: 20 } }).aviso).toBe("Debes S/ 20.00 de un faltante de tu rendición");
  });

  // /formidable 2026-10-14: la misma acción en Órdenes de compra y en el Inicio (sin el módulo, el Inicio era el único lugar del fondo).
  it("la acción de la tarjeta: «Rendir» con algo nuevo, «Ver tu rendición» mientras espera y nada si no hay qué rendir", () => {
    const R = { arrastre: 0, items: 0, sinFoto: 0, abierta: null, deuda: 0 };
    expect(accionTuFondo(cara({ saldo: 320, entregado: 300, rendicion: { ...R, arrastre: 120, items: 2 } }))).toBe("Rendir");
    expect(accionTuFondo(cara({ saldo: 120, rendicion: { ...R, items: 1, abierta: { id: "r1", en: "2026-10-13T22:00:00Z", faltante: 0 } } }))).toBe(
      "Ver tu rendición",
    );
    expect(accionTuFondo(cara({ saldo: 120, entregado: 0, rendicion: { ...R, arrastre: 120 } }))).toBeNull();
    // Sin la lectura de la rendición (la base todavía no la tiene), sin acción: la tarjeta sale igual.
    expect(accionTuFondo(cara({ saldo: 200, entregado: 200, rendicion: null }))).toBeNull();
  });

  it("sale también con una rendición por aprobar o una deuda; rendida y en cero sin nada nuevo, no", () => {
    const R = { arrastre: 0, items: 0, sinFoto: 0, abierta: null, deuda: 0 };
    expect(mostrarTuFondo({ ...BASE, saldo: 0, entregado: 0, rendicion: R })).toBe(false);
    expect(mostrarTuFondo({ ...BASE, saldo: 0, entregado: 0, rendicion: { ...R, deuda: 20 } })).toBe(true);
    expect(mostrarTuFondo({ ...BASE, saldo: 0, entregado: 0, rendicion: { ...R, abierta: { id: "r", en: "2026-10-13", faltante: 0 } } })).toBe(true);
  });

  it("lleva a Órdenes de compra si la ve; si no, a Por pagar; si no ve ninguna, no lleva", () => {
    expect(hrefTuFondo(() => true)).toBe("/compras/ordenes");
    expect(hrefTuFondo((m) => m === "por_pagar")).toBe("/compras/por-pagar");
    expect(hrefTuFondo(() => false)).toBeUndefined();
  });
});

describe("las opciones de los combos", () => {
  it("quien entra se ve pero no se elige; los demás llevan su sede", () => {
    expect(opcionesDePersonas(OPCIONES)).toEqual([
      { valor: "p-felipe", texto: "Felipe Alvarez (tú: que te la entregue otra persona)", deshabilitada: true },
      { valor: "p-micaela", texto: "Micaela Vendedora · Tienda Trujillo" },
    ]);
  });

  it("las cuentas van agrupadas: bancos, cajas fuertes y lo del líder, en ese orden", () => {
    expect(opcionesDeCuentas(OPCIONES.cuentas).map((o) => [o.grupo, o.valor])).toEqual([
      ["Bancos", "c-bcp"],
      ["Cajas fuertes", "c-fuerte"],
      ["Del líder", "c-lider"],
    ]);
  });
});

describe("lo que falta (las mismas reglas que la base)", () => {
  it("la persona: elegida, no uno mismo, activa", () => {
    expect(problemaDePersona("", OPCIONES)).toBe("Elige a quién le entregas la plata.");
    expect(problemaDePersona("p-felipe", OPCIONES)).toMatch(/No puedes entregarte plata a ti/);
    expect(problemaDePersona("p-otra", OPCIONES)).toMatch(/ya no está activa/);
    expect(problemaDePersona("p-micaela", OPCIONES)).toBeNull();
  });

  it("el monto: escrito, mayor que cero y, al devolver, no más de lo que tiene", () => {
    expect(problemaDeMonto("")).toBe("Escribe cuánto.");
    expect(problemaDeMonto("0")).toBe("El monto tiene que ser mayor que cero.");
    expect(problemaDeMonto("-5")).toBe("El monto tiene que ser mayor que cero.");
    expect(problemaDeMonto("1,500.50")).toBeNull();
    expect(problemaDeMonto("400", 380)).toBe("Tiene S/ 380.00 en su fondo: no puede devolver más.");
    expect(problemaDeMonto("380", 380)).toBeNull();
  });

  it("el para qué: obligatorio y de hasta 200 letras", () => {
    expect(problemaDeMotivo("   ")).toMatch(/Di para qué es la plata/);
    expect(problemaDeMotivo("x".repeat(201))).toMatch(/muy largo/);
    expect(problemaDeMotivo("Compras Gamarra")).toBeNull();
  });

  it("entregar: con todo lleno se confirma; lo que falta sale en el orden de la hoja", () => {
    const vacio = camposEntregar({ personaId: "", cuentaId: "", monto: "", motivo: "" }, OPCIONES, PERSONA);
    expect(faltanDe(vacio).map((c) => c.id)).toEqual(["persona", "cuenta", "monto", "motivo"]);
    expect(sePuedeConfirmar(vacio)).toBe(false);
    const lleno = camposEntregar({ personaId: "p-micaela", cuentaId: "c-bcp", monto: "500", motivo: "Gamarra" }, OPCIONES, PERSONA);
    expect(sePuedeConfirmar(lleno)).toBe(true);
    // Desde una terminal, además, quién entrega (el combo «Responsable»).
    const terminal = camposEntregar({ personaId: "p-micaela", cuentaId: "c-bcp", monto: "500", motivo: "Gamarra" }, OPCIONES, {
      esPersona: false,
      listo: false,
      motivo: null,
    });
    expect(faltanDe(terminal).map((c) => c.id)).toEqual(["responsable"]);
  });

  it("devolver: la nota es opcional y nunca bloquea; el monto no pasa de lo que tiene", () => {
    const campos = camposDevolver({ cuentaId: "c-bcp", monto: "100", nota: "" }, 380, OPCIONES.cuentas, PERSONA);
    expect(sePuedeConfirmar(campos)).toBe(true);
    expect(faltanDe(camposDevolver({ cuentaId: "c-bcp", monto: "500", nota: "" }, 380, OPCIONES.cuentas, PERSONA)).map((c) => c.id)).toEqual([
      "monto",
    ]);
  });

  // /formidable 2026-10-14 (E2), lo mismo que exige `devolver_fondo` desde 20261014212000 (`scripts/pruebas/fondos_entradas.mjs`).
  it("devolver con su rendición por aprobar: el tope es lo que tiene en la mano (el saldo menos su faltante), no lo de los libros", () => {
    const tope = topeDevolucion(380, 5);
    expect(tope).toEqual({ monto: 375, porRendicion: true, libros: 380, faltante: 5 });
    // Decisión 83: las dos cifras en la hoja (la tabla dice S/ 380.00, los libros), y lo que falta para pasar de una a otra.
    expect(subtituloDevolver(tope)).toBe(nb("Los libros dicen S/ 380.00, pero a su rendición por aprobar le faltan S/ 5.00: puede devolver hasta S/ 375.00."));
    expect(problemaDeMonto("380", tope)).toBe(nb("Puede devolver hasta S/ 375.00: a su rendición por aprobar le faltan S/ 5.00."));
    expect(problemaDeMonto("375", tope)).toBeNull();
    expect(problemaDeMonto("375,00", tope)).toBeNull();
    const campos = camposDevolver({ cuentaId: "c-fuerte", monto: "380", nota: "" }, tope, OPCIONES.cuentas, PERSONA);
    expect(faltanDe(campos).map((c) => c.id)).toEqual(["monto"]);
  });

  it("sin rendición por aprobar (o sin faltante), el tope es el saldo de siempre; nunca es negativo", () => {
    expect(topeDevolucion(380)).toEqual({ monto: 380, porRendicion: false, libros: 380, faltante: 0 });
    expect(topeDevolucion(380, 0)).toEqual({ monto: 380, porRendicion: false, libros: 380, faltante: 0 });
    expect(subtituloDevolver(topeDevolucion(380))).toBe("Tiene S/ 380.00 en su fondo.");
    expect(topeDevolucion(5, 5)).toEqual({ monto: 0, porRendicion: true, libros: 5, faltante: 5 });
    expect(topeDevolucion(3, 5)).toEqual({ monto: 0, porRendicion: true, libros: 3, faltante: 5 });
  });

  it("si después de rendir le entregaron más, la hoja sigue diciendo la verdad: los libros, lo que falta y el tope", () => {
    // Rindió con S/ 375 en la mano (le faltaban S/ 5) y después le entregaron S/ 100: los libros dicen S/ 480 y puede devolver S/ 475.
    expect(subtituloDevolver(topeDevolucion(480, 5))).toBe(
      nb("Los libros dicen S/ 480.00, pero a su rendición por aprobar le faltan S/ 5.00: puede devolver hasta S/ 475.00."),
    );
  });
});

describe("lo que dicen los botones", () => {
  it("dicen cuánto y a quién, con lo que ya se sabe", () => {
    expect(fraseEntregar(500, "Micaela Vendedora")).toBe("Entregar S/ 500.00 a Micaela");
    expect(fraseEntregar(null, "Micaela Vendedora")).toBe("Entregar a Micaela");
    expect(fraseEntregar(null, null)).toBe("Entregar plata");
    expect(fraseDevolver(120)).toBe("Registrar S/ 120.00 devueltos");
    expect(fraseDevolver(null)).toBe("Registrar lo devuelto");
  });
});
