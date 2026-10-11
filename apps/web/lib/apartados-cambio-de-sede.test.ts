import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { apartadoArmado, avisosDelApartado, claveDelApartado } from "./apartados-cambio-de-sede";

// Cambiar de sede con el selector de la cabecera hace `router.refresh()`: la ruta no cambia y React conserva el estado de todo
// componente cliente cuya `key` no cambió. Apartar se montaba con `key={pedido?.id ?? "apartar"}`, igual en todas las sedes: el
// apartado armado en Lima (prendas, datos del cliente, adelanto) se confirmaba desde Trujillo, y `separar_prendas` salía con
// Trujillo, a su precio y con el efectivo para su caja (reproducido el 2026-10-11). Felipe, 2026-10-11: queda guardado en su sede.

const PAGINA = join(__dirname, "..", "app", "(app)", "vender", "apartados", "page.tsx");
const PANEL = join(__dirname, "..", "components", "apartados", "ApartadosPanel.tsx");
const APARTAR = join(__dirname, "..", "components", "apartados", "ApartarVista.tsx");

describe("Apartados: el apartado a medio armar es de su sede", () => {
  it("la página monta el panel dentro del guardián del cambio de sede", () => {
    const pagina = readFileSync(PAGINA, "utf8");
    expect(pagina).toMatch(/<TrabajoPorSede\s+key="apartados"\s+ubicacionId=\{persona\.ubicacionId\}>\s*<ApartadosPanel/);
  });

  it("Apartar se monta con la sede en la key", () => {
    expect(readFileSync(PANEL, "utf8")).toMatch(/key=\{claveDelApartado\(props\.ubicacionId, pedidoParaApartar\?\.id\)\}/);
  });

  it("al cambiar de sede, el panel suelta lo elegido para entregar y el pedido por apartar (son de la sede anterior)", () => {
    const panel = readFileSync(PANEL, "utf8");
    const inicio = panel.indexOf("if (props.ubicacionId !== sedePrevia)");
    expect(inicio).toBeGreaterThan(-1);
    const bloque = panel.slice(inicio, panel.indexOf("\n  }\n", inicio));
    expect(bloque).toContain("setElegido(null)");
    expect(bloque).toContain("setPedidoParaApartar(null)");
  });

  it("Apartar lee lo guardado de su sede y reporta lo armado, salvo un pedido de otra tienda", () => {
    const apartar = readFileSync(APARTAR, "utf8");
    expect(apartar).toMatch(/\{ inicial: guardadoDeLaSede, reportar: reportarApartado \} = useTrabajoPorSede<ApartadoArmado>\(ubicacionId\)/);
    // Un apartado de un pedido ni lee lo guardado ni se guarda: su pedido sigue en la lista de su sede.
    expect(apartar).toContain("const guardado = pedido ? undefined : guardadoDeLaSede;");
    expect(apartar).toMatch(/reportarApartado\(\s*!pedido && armado/);
  });
});

describe("la key de Apartar", () => {
  it("otra sede, otra key, aunque sea el mismo pedido", () => {
    expect(claveDelApartado("lima")).not.toBe(claveDelApartado("trujillo"));
    expect(claveDelApartado("lima", "p1")).not.toBe(claveDelApartado("trujillo", "p1"));
  });
  it("en la misma sede sigue separando el apartado suelto de cada pedido, como antes", () => {
    const claves = [claveDelApartado("lima"), claveDelApartado("lima", "p1"), claveDelApartado("lima", "p2")];
    expect(new Set(claves).size).toBe(3);
    expect(claveDelApartado("lima", null)).toBe(claveDelApartado("lima"));
  });
});

describe("cuándo hay un apartado armado", () => {
  const vacio = { lineas: [], nombres: "", apellidos: "", celular: "", dni: "", ruc: "", razonSocial: "", pagos: [], nota: "", buscado: "" };

  it("nada escaneado ni escrito: nada que guardar", () => {
    expect(apartadoArmado(vacio)).toBe(false);
    expect(apartadoArmado({ ...vacio, nombres: "   " })).toBe(false);
    expect(apartadoArmado({ ...vacio, pagos: [{ monto: 0 }] })).toBe(false);
  });

  it("basta una prenda, un dato del cliente, un monto de adelanto, la nota o un DNI buscado", () => {
    expect(apartadoArmado({ ...vacio, lineas: [{ cantidad: 1 }] })).toBe(true);
    for (const campo of ["nombres", "apellidos", "celular", "dni", "ruc", "razonSocial", "nota", "buscado"] as const) {
      expect(apartadoArmado({ ...vacio, [campo]: "x" })).toBe(true);
    }
    expect(apartadoArmado({ ...vacio, pagos: [{ monto: 50 }] })).toBe(true);
  });
});

describe("los avisos del apartado guardado", () => {
  it("con nombre del cliente y prendas", () => {
    const a = avisosDelApartado({ etiqueta: "Tienda Lima", nombres: "Ana", apellidos: "Prueba", prendas: 3 });
    expect(a.avisoAlGuardar.texto).toBe("El apartado de Ana Prueba (3 prendas) quedó guardado en Tienda Lima");
    expect(a.avisoAlGuardar.detalle).toContain("Vuelve a Tienda Lima");
    expect(a.avisoAlVolver).toBe("Volvió el apartado de Ana Prueba");
  });

  it("sin nombre todavía, y con una sola prenda o ninguna", () => {
    expect(avisosDelApartado({ etiqueta: "Tienda Lima", nombres: "", apellidos: "", prendas: 1 }).avisoAlGuardar.texto).toBe(
      "El apartado a medio armar (1 prenda) quedó guardado en Tienda Lima",
    );
    expect(avisosDelApartado({ etiqueta: "Tienda Lima", nombres: "Ana", apellidos: "", prendas: 0 }).avisoAlGuardar.texto).toBe(
      "El apartado de Ana (sin prendas todavía) quedó guardado en Tienda Lima",
    );
    expect(avisosDelApartado({ etiqueta: "Tienda Lima", nombres: "", apellidos: "", prendas: 2 }).avisoAlVolver).toBe("Volvió el apartado a medio armar");
  });
});
