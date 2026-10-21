// Los lectores de monto de Finanzas entienden la coma decimal (auditoría de Finanzas 2026-10-16, G07; ADR-0419 act. b lo daba por hecho).
//
// EL PROBLEMA. Cuatro lectores hacían `.replace(/,/g, "")`: «648,50» se guardaba como S/ 64 850 (gastos, depósitos, saldo inicial, topes de
// presupuesto, fondos de tienda) y el de Por pagar (`.replace(",", ".")` + `Number`) leía «1,299» como 1.30 y aceptaba «1e3» y «0x10». Ninguna
// pantalla avisaba: solo frenaba el tope de S/ 1 000 000. Hoy todos delegan en `leerMontoPlata` (la regla de ADR-0419), cada uno con su contrato.
//
// Esta prueba tiene dos mitades: la tabla compartida (los cuatro leen lo mismo) y un candado de archivo (ningún lector de plata de Finanzas
// vuelve a borrar comas).

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { leerMontoArranque } from "./balance-reglas";
import { parsearMonto as parsearMontoConfiguracion } from "./configuracion-reglas";
import { parsearMonto as parsearMontoGasto } from "./gastos-reglas";
import { parseMonto as parseMontoPorPagar } from "./por-pagar-reglas";

/** Cada lector, devuelto como «el número leído, o null si no se entiende». */
const LECTORES: Record<string, (t: string) => number | null> = {
  "Registrar gasto, depósitos y saldo de cuenta (gastos-reglas)": (t) => {
    const r = parsearMontoGasto(t);
    return r.ok ? r.valor : null;
  },
  "Configuración de tienda y topes de presupuesto (configuracion-reglas)": (t) => {
    const r = parsearMontoConfiguracion(t);
    return r.ok ? r.valor : null;
  },
  "Saldos de arranque (balance-reglas)": (t) => leerMontoArranque(t),
  "Pagos y saldos a favor de Por pagar (por-pagar-reglas)": (t) => {
    const n = parseMontoPorPagar(t);
    return Number.isNaN(n) ? null : n;
  },
};

/** [lo escrito, lo que se lee]. `null` = no se entiende y la hoja lo pide de nuevo: nunca se adivina. */
const TABLA: [string, number | null][] = [
  ["648,50", 648.5], // el caso del informe: antes 64 850
  ["S/ 648,50", 648.5],
  ["1299,50", 1299.5],
  ["150,5", 150.5],
  ["300,5", 300.5],
  ["0,80", 0.8],
  ["1,299", 1299], // miles, como se ve en pantalla
  ["1,250", 1250],
  ["1.299,50", 1299.5],
  ["1,299.50", 1299.5],
  ["1.234.567,89", 1234567.89],
  ["300.5", 300.5],
  ["S/ 2,5", 2.5],
  ["12.500", null], // ¿doce mil quinientos o doce con cincuenta? No se adivina
  ["12.345", null],
  ["1e3", null],
  ["0x10", null],
  ["1,2,3", null],
  ["abc", null],
];

describe("los lectores de monto de Finanzas leen igual", () => {
  for (const [nombre, leer] of Object.entries(LECTORES)) {
    describe(nombre, () => {
      for (const [escrito, esperado] of TABLA) {
        it(`«${escrito}» → ${esperado === null ? "no se entiende" : esperado}`, () => {
          expect(leer(escrito)).toBe(esperado);
        });
      }
    });
  }
});

describe("ningún lector de plata de Finanzas vuelve a borrar comas", () => {
  const RAIZ = process.cwd();
  const ALCANCE = /(finanz|gasto|dinero|cuenta|balance|presupuesto|por-pagar|configuracion|fondo|ingreso-rapido|impuesto|flujo|saldo|salida|nota-proveedor|notas-credito|deuda|campan)/;
  // `.replace(/…,…/g, "")`: una expresión que contiene una coma y la reemplaza por nada (con las barras escapadas dentro de la expresión).
  // Una expresión anclada al inicio (`/^(Al|Hoy,) /`) corta un texto, no limpia un monto: no cuenta.
  const BORRA_COMA = /\.replace\(\s*\/(?!\^)(?:\\.|[^/\\\n])*,(?:\\.|[^/\\\n])*\/[a-z]*\s*,\s*(?:""|''|``)\s*\)/;

  function archivos(dir: string): string[] {
    return readdirSync(join(RAIZ, dir), { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? archivos(join(dir, e.name)) : [join(dir, e.name)],
    );
  }

  const candidatos = [...archivos("lib"), ...archivos("components")].filter(
    (f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) && ALCANCE.test(f),
  );

  it("el alcance encuentra los archivos de Finanzas (si no, la prueba no vigila nada)", () => {
    expect(candidatos.length).toBeGreaterThan(40);
    expect(candidatos).toContain(join("lib", "gastos-reglas.ts"));
    expect(candidatos).toContain(join("lib", "por-pagar-reglas.ts"));
    expect(candidatos).toContain(join("components", "finanzas", "CuentasDinero.tsx"));
  });

  it("ninguno hace .replace(/,/g, \"\") sobre lo que escribe una persona", () => {
    const culpables: string[] = [];
    for (const f of candidatos) {
      readFileSync(join(RAIZ, f), "utf8")
        .split("\n")
        .forEach((linea, i) => {
          if (BORRA_COMA.test(linea) && !/coma-fija:\s*.{10,}/.test(linea)) culpables.push(`${f}:${i + 1}  ${linea.trim()}`);
        });
    }
    // Un lector que de verdad deba borrar comas (no lo hay hoy) lo dice en su línea con `// coma-fija: <motivo de 10 caracteres o más>`.
    expect(culpables).toEqual([]);
  });
});
