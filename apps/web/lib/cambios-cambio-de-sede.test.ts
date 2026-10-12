import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { avisosDelCambio, claveDeCambios } from "./cambios-cambio-de-sede";

// Cambiar de sede con el selector de la cabecera hace `router.refresh()`: la ruta no cambia y React conserva el estado de todo
// componente cliente cuya `key` no cambió. El cambio armado en Lima (venta, prenda nueva, motivo) seguía en la pantalla de Trujillo y
// `registrar_cambio` salía con Trujillo: la prenda que vuelve entraba a su piso y la nueva salía de él (reproducido el 2026-10-11; la
// confirmación sí decía «Se registra en: Tienda Trujillo»). Felipe, 2026-10-11: queda guardado en su sede.

const PAGINA = join(__dirname, "..", "app", "(app)", "cambios", "page.tsx");
const PANEL = join(__dirname, "..", "components", "CambiosPanel.tsx");
const FLUJO = join(__dirname, "..", "components", "CambiosFlujo.tsx");

describe("Cambios: el cambio a medio armar es de su sede", () => {
  it("la página monta el panel con la sede en la key, dentro del guardián del cambio de sede", () => {
    expect(readFileSync(PAGINA, "utf8")).toMatch(
      /<TrabajoPorSede\s+key="cambios"\s+ubicacionId=\{persona\.ubicacionId\}>\s*<CambiosPanel\s+key=\{claveDeCambios\(persona\.ubicacionId\)\}/,
    );
  });

  it("el panel retoma la venta guardada y, si llegó por un cambio de sede, no reabre la del enlace (`?item=`) desde cero", () => {
    const panel = readFileSync(PANEL, "utf8");
    expect(panel).toMatch(/\{ inicial: guardado, reportar: reportarCambio, vieneDeOtraSede \} = useTrabajoPorSede<CambioArmado>\(ubicacionId\)/);
    expect(panel).toContain("if (guardado) return { venta: guardado.venta, lineaId: guardado.lineaInicialId };");
    expect(panel).toContain("if (vieneDeOtraSede) return null;");
  });

  it("sin cambio abierto, el panel dice que no hay nada armado (un cambio cancelado no se guarda al cambiar de sede)", () => {
    expect(readFileSync(PANEL, "utf8")).toMatch(/if \(!flujo\) reportarCambio\(null\)/);
  });

  it("el flujo arranca desde lo guardado y lo reporta mientras no termina", () => {
    const flujo = readFileSync(FLUJO, "utf8");
    expect(flujo).toMatch(/\{ inicial: guardado, reportar: reportarCambio \} = useTrabajoPorSede<CambioArmado>\(ubicacionId\)/);
    expect(flujo).toMatch(/reportarCambio\(\s*paso !== "exito"/);
  });
});

describe("la key de Cambios", () => {
  it("otra sede, otra key", () => {
    expect(claveDeCambios("lima")).not.toBe(claveDeCambios("trujillo"));
    expect(claveDeCambios("lima")).toBe(claveDeCambios("lima"));
  });
});

describe("los avisos del cambio guardado", () => {
  it("con el nombre del cliente (sin su documento)", () => {
    const a = avisosDelCambio({ etiqueta: "Tienda Lima", clienta: "Ana Prueba · DNI 45879632", comprobante: "Boleta B001-000010" });
    expect(a.avisoAlGuardar.texto).toBe("El cambio de Ana Prueba quedó guardado en Tienda Lima");
    expect(a.avisoAlGuardar.detalle).toContain("Vuelve a Tienda Lima");
    expect(a.avisoAlVolver).toBe("Volvió el cambio de Ana Prueba");
  });

  it("sin cliente, por su comprobante; sin los dos, a medio armar", () => {
    expect(avisosDelCambio({ etiqueta: "Tienda Lima", clienta: null, comprobante: "Boleta B001-000010" }).avisoAlGuardar.texto).toBe(
      "El cambio de la Boleta B001-000010 quedó guardado en Tienda Lima",
    );
    const sinNada = avisosDelCambio({ etiqueta: "Tienda Lima", clienta: "  ", comprobante: null });
    expect(sinNada.avisoAlGuardar.texto).toBe("El cambio a medio armar quedó guardado en Tienda Lima");
    expect(sinNada.avisoAlVolver).toBe("Volvió el cambio a medio armar");
  });
});
