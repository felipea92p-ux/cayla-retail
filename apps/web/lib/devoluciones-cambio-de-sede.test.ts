import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { avisosDeLaDevolucion, claveDeDevoluciones } from "./devoluciones-cambio-de-sede";

// La devolución armada en Lima seguía en la pantalla de Trujillo tras cambiar de sede con el selector, y `crear_devolucion` salía con
// Trujillo (reproducido el 2026-10-11). Felipe, 2026-10-11: queda guardada en su sede, como en Cambios.

const PAGINA = join(__dirname, "..", "app", "(app)", "devoluciones", "page.tsx");
const PANEL = join(__dirname, "..", "components", "DevolucionesPanel.tsx");
const FLUJO = join(__dirname, "..", "components", "DevolucionesFlujo.tsx");

describe("Devoluciones: la devolución a medio armar es de su sede", () => {
  it("la página monta el panel con la sede en la key, dentro del guardián del cambio de sede", () => {
    expect(readFileSync(PAGINA, "utf8")).toMatch(
      /<TrabajoPorSede\s+key="devoluciones"\s+ubicacionId=\{persona\.ubicacionId\}>\s*<DevolucionesPanel\s+key=\{claveDeDevoluciones\(persona\.ubicacionId\)\}/,
    );
  });

  it("el panel retoma la venta guardada, no reabre desde cero la del enlace tras un cambio de sede y, sin flujo, no guarda nada", () => {
    const panel = readFileSync(PANEL, "utf8");
    expect(panel).toMatch(/\{ inicial: guardado, reportar: reportarDevolucion, vieneDeOtraSede \} = useTrabajoPorSede<DevolucionArmada>\(ubicacionId\)/);
    expect(panel).toContain("if (guardado) return { venta: guardado.venta, lineaId: guardado.lineaInicialId };");
    expect(panel).toContain("if (vieneDeOtraSede) return null;");
    expect(panel).toMatch(/if \(!flujo\) reportarDevolucion\(null\)/);
  });

  it("el flujo arranca desde lo guardado y lo reporta mientras no termina", () => {
    const flujo = readFileSync(FLUJO, "utf8");
    expect(flujo).toMatch(/\{ inicial: guardado, reportar: reportarDevolucion \} = useTrabajoPorSede<DevolucionArmada>\(ubicacionId\)/);
    expect(flujo).toMatch(/reportarDevolucion\(\s*paso !== "exito"/);
  });
});

describe("la devolución guardada", () => {
  it("otra sede, otra key", () => {
    expect(claveDeDevoluciones("lima")).not.toBe(claveDeDevoluciones("trujillo"));
  });

  it("se nombra por el cliente, si no por su comprobante, en femenino", () => {
    const a = avisosDeLaDevolucion({ etiqueta: "Tienda Lima", clienta: "Ana Prueba · DNI 45879632", comprobante: "Boleta B001-000010" });
    expect(a.avisoAlGuardar.texto).toBe("La devolución de Ana Prueba quedó guardada en Tienda Lima");
    expect(a.avisoAlVolver).toBe("Volvió la devolución de Ana Prueba");
    expect(avisosDeLaDevolucion({ etiqueta: "Tienda Lima", clienta: null, comprobante: "Boleta B001-000010" }).avisoAlGuardar.texto).toBe(
      "La devolución de la Boleta B001-000010 quedó guardada en Tienda Lima",
    );
    expect(avisosDeLaDevolucion({ etiqueta: "Tienda Lima", clienta: null, comprobante: null }).avisoAlVolver).toBe("Volvió la devolución a medio armar");
  });
});
