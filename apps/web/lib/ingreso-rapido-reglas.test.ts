import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sePuedeConfirmar } from "./guia-campos";
import {
  CONCEPTOS_INGRESO,
  INGRESO_RAPIDO_VACIO,
  MAX_NOTA_INGRESO,
  camposDeIngresoRapido,
  conceptosIngresoVisibles,
  limpiarMontoIngreso,
  notaDeIngreso,
  validarIngreso,
  type EstadoIngresoRapido,
} from "./ingreso-rapido-reglas";

const MIGRACION = readFileSync(join(__dirname, "../../../supabase/migrations/20261010220000_caja_motivos_de_ingreso.sql"), "utf8");
const SEDES = [
  { id: "lim", nombre: "Tienda Lima" },
  { id: "aqp", nombre: "Tienda Arequipa" },
];
const con = (cambios: Partial<EstadoIngresoRapido>): EstadoIngresoRapido => ({ ...INGRESO_RAPIDO_VACIO, ...cambios });

describe("conceptos de ingreso", () => {
  it("cada motivo es uno que la base acepta (la lista de entradas de la migración)", () => {
    const lista = MIGRACION.match(/v_nuevo_i constant text := \$a\$([\s\S]*?)\$a\$/)?.[1] ?? "";
    expect(lista).not.toBe("");
    for (const c of CONCEPTOS_INGRESO) expect(lista).toContain(`'${c.motivo}'`);
  });

  it("los que piden nota en la base son justo los que piden un dato en la pantalla", () => {
    const conNota = MIGRACION.match(/v_nuevo_n constant text := \$a\$if p_motivo in \(([^)]*)\)/)?.[1] ?? "";
    const motivosConNota = [...conNota.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((m) => m !== "Depósito bancario");
    const pantalla = CONCEPTOS_INGRESO.filter((c) => c.detalle !== "ninguno").map((c) => c.motivo);
    expect(new Set(motivosConNota)).toEqual(new Set(pantalla));
  });

  it("claves y motivos no se repiten", () => {
    expect(new Set(CONCEPTOS_INGRESO.map((c) => c.clave)).size).toBe(CONCEPTOS_INGRESO.length);
    expect(new Set(CONCEPTOS_INGRESO.map((c) => c.motivo)).size).toBe(CONCEPTOS_INGRESO.length);
  });

  it("el sobrante solo lo ve el líder", () => {
    expect(conceptosIngresoVisibles(true).map((c) => c.clave)).toContain("sobrante");
    expect(conceptosIngresoVisibles(false).map((c) => c.clave)).not.toContain("sobrante");
    expect(validarIngreso(con({ concepto: "sobrante", monto: "5" }), SEDES, false).ok).toBe(false);
    expect(validarIngreso(con({ concepto: "sobrante", monto: "5" }), SEDES, true).ok).toBe(true);
  });
});

describe("la nota que se guarda", () => {
  it("lleva lo que pide el concepto y después la nota libre", () => {
    expect(notaDeIngreso(con({ concepto: "lider", quien: " Sandra " }), SEDES)).toBe("Trajo: Sandra");
    expect(notaDeIngreso(con({ concepto: "otra_sede", sedeId: "lim", nota: "para sencillo" }), SEDES)).toBe("De Tienda Lima — para sencillo");
    expect(notaDeIngreso(con({ concepto: "otro", otroTexto: "Pago de una deuda" }), SEDES)).toBe("Pago de una deuda");
    expect(notaDeIngreso(con({ concepto: "caja_fuerte" }), SEDES)).toBeNull();
    expect(notaDeIngreso(con({ concepto: "caja_fuerte", nota: "monedas de S/ 1" }), SEDES)).toBe("monedas de S/ 1");
  });

  it("no ensucia la nota con datos de otro concepto que se llenaron antes", () => {
    expect(notaDeIngreso(con({ concepto: "vuelve_retiro", quien: "Sandra", sedeId: "lim", otroTexto: "x" }), SEDES)).toBeNull();
  });

  it("no pasa del máximo", () => {
    expect(notaDeIngreso(con({ concepto: "otro", otroTexto: "a".repeat(300) }), SEDES)?.length).toBe(MAX_NOTA_INGRESO);
  });
});

describe("lo que se manda a registrar_ingreso_caja", () => {
  const MIGRACION_ORIGEN = readFileSync(join(__dirname, "../../../supabase/migrations/20261010220100_caja_ingresos_con_su_origen.sql"), "utf8");

  it("cada concepto es uno que la función conoce, con el mismo motivo", () => {
    for (const c of CONCEPTOS_INGRESO) expect(MIGRACION_ORIGEN).toContain(`when '${c.clave}' then '${c.motivo}'`);
  });

  it("las opciones de «de dónde» del líder son las que la función acepta", () => {
    expect(MIGRACION_ORIGEN).toContain("p_de_donde = 'cierre'");
    expect(MIGRACION_ORIGEN).toContain("p_de_donde = 'dueno'");
  });

  it("solo el líder lleva «de dónde» y solo otra sede lleva la sede", () => {
    const lider = validarIngreso(con({ concepto: "lider", monto: "50", deDonde: "dueno", quien: "Felipe", sedeId: "lim" }), SEDES, true);
    expect(lider.ok && lider.valor).toMatchObject({ p_concepto: "lider", p_de_donde: "dueno", p_sede_origen_id: null, p_monto: 50 });
    const sede = validarIngreso(con({ concepto: "otra_sede", monto: "80", sedeId: "lim", deDonde: "cierre" }), SEDES, true);
    expect(sede.ok && sede.valor).toMatchObject({ p_concepto: "otra_sede", p_de_donde: null, p_sede_origen_id: "lim", p_nota: "De Tienda Lima" });
  });
});

describe("el monto", () => {
  it("la coma es decimal y no pasa de dos decimales", () => {
    expect(limpiarMontoIngreso("0,50")).toBe("0.50");
    expect(limpiarMontoIngreso("S/ 100.555")).toBe("100.55");
    expect(limpiarMontoIngreso("1.2.3")).toBe("1.23");
  });
});

describe("la guía de foco dice lo mismo que validarIngreso", () => {
  const escenarios: [string, EstadoIngresoRapido][] = [
    ["vacío", INGRESO_RAPIDO_VACIO],
    ["solo monto", con({ monto: "50" })],
    ["caja fuerte sin monto", con({ concepto: "caja_fuerte" })],
    ["caja fuerte con monto", con({ concepto: "caja_fuerte", monto: "50" })],
    ["caja fuerte con monto cero", con({ concepto: "caja_fuerte", monto: "0" })],
    ["líder sin quién", con({ concepto: "lider", monto: "100", deDonde: "cierre" })],
    ["líder con quién corto", con({ concepto: "lider", monto: "100", deDonde: "cierre", quien: "Sa" })],
    ["líder sin de dónde", con({ concepto: "lider", monto: "100", quien: "Sandra" })],
    ["líder de un cierre", con({ concepto: "lider", monto: "100", deDonde: "cierre", quien: "Sandra" })],
    ["líder del dueño", con({ concepto: "lider", monto: "100", deDonde: "dueno", quien: "Felipe" })],
    ["otra sede sin sede", con({ concepto: "otra_sede", monto: "80" })],
    ["otra sede completa", con({ concepto: "otra_sede", monto: "80", sedeId: "aqp" })],
    ["vuelve de un retiro", con({ concepto: "vuelve_retiro", monto: "20.5" })],
    ["otro sin texto", con({ concepto: "otro", monto: "10" })],
    ["otro completo", con({ concepto: "otro", monto: "10", otroTexto: "Vuelto de un pedido" })],
    ["sobrante (líder)", con({ concepto: "sobrante", monto: "1.20" })],
    ["monto ilegible", con({ concepto: "caja_fuerte", monto: "." })],
  ];
  for (const [nombre, e] of escenarios) {
    it(nombre, () => {
      expect(sePuedeConfirmar(camposDeIngresoRapido(e))).toBe(validarIngreso(e, SEDES, true).ok);
    });
  }
});
