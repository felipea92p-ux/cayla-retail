import { describe, expect, it } from "vitest";
import { faltanDe, sePuedeConfirmar } from "./guia-campos";
import {
  camposDevolver,
  camposEntregar,
  cifrasDeFondos,
  fraseDevolver,
  fraseEntregar,
  leerFondos,
  leerMovimientosFondos,
  leerOpcionesFondos,
  opcionesDeCuentas,
  opcionesDePersonas,
  problemaDeMonto,
  problemaDeMotivo,
  problemaDePersona,
  type OpcionesFondos,
} from "./fondos-reglas";

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
  it("suman lo de todos y cuentan a quien tiene plata en la mano (o a quien CAYLA le debe)", () => {
    const base = { cuentaId: "c", sede: null, primeraEntrega: null, ultimaEntrega: null, ultimoMotivo: null, esMio: false };
    expect(
      cifrasDeFondos([
        { ...base, personaId: "a", persona: "A", saldo: 380, entregado: 500, devuelto: 120, gastado: 0 },
        { ...base, personaId: "b", persona: "B", saldo: 0, entregado: 100, devuelto: 100, gastado: 0 },
        { ...base, personaId: "c", persona: "C", saldo: -10.1, entregado: 50, devuelto: 0, gastado: 60.1 },
      ]),
    ).toEqual({ enMano: 369.9, conPlata: 2, entregado: 650, devuelto: 220, gastado: 60.1 });
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
