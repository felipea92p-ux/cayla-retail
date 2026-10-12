import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  claveDeLaRecepcion,
  envioContado,
  llegadaContada,
  mensajeDeSalida,
  unidadesDelEnvio,
  unidadesDeLaLlegada,
} from "./recibir-cambio-de-sede";

// Cambiar de sede con el selector de la cabecera hace `router.refresh()`: la ruta no cambia y React conserva el estado de
// todo componente cliente cuya `key` no cambió. Recibir montaba la recepción contra factura y «Llegó mercadería» sin la sede
// en la key: lo contado en Lima quedaba en la pantalla de Trujillo, y `recibir_envio` salía con la sede VIEJA (el líder no
// tiene el candado de destino) mientras `recibir_lote` salía con la NUEVA. Felipe, 2026-10-11: el conteo queda guardado en su
// sede y la sede nueva arranca vacía.

const PAGINA_RECIBIR = join(__dirname, "..", "app", "(app)", "recibir", "page.tsx");
const RECEPCION_ENVIO = join(__dirname, "..", "components", "RecepcionEnvio.tsx");
const LLEGO_MERCADERIA = join(__dirname, "..", "components", "LlegoMercaderia.tsx");

describe("Recibir: el conteo es de su sede", () => {
  const pagina = readFileSync(PAGINA_RECIBIR, "utf8");

  it("la recepción contra factura se monta con la sede en la key, dentro del guardián del cambio de sede", () => {
    expect(pagina).toMatch(/<RecepcionEnvio\s+key=\{claveDeLaRecepcion\(ubicacionMirada\)\}/);
    const guardian = pagina.lastIndexOf("<TrabajoPorSede", pagina.indexOf("<RecepcionEnvio"));
    expect(guardian).toBeGreaterThan(-1);
    // El guardián va POR ENCIMA del «no hay nada pendiente»: si la sede nueva no tiene facturas, la recepción no se dibuja y,
    // con el guardián adentro, el conteo guardado de la otra sede se perdería con él.
    expect(pagina.slice(guardian, pagina.indexOf("<RecepcionEnvio"))).toContain("compras.length === 0");
  });

  it("«Llegó mercadería» se monta con la sede en la key, dentro del guardián del cambio de sede", () => {
    expect(pagina).toMatch(/<LlegoMercaderia\s+key=\{claveDeLaRecepcion\(persona\.ubicacionId\)\}/);
    const guardian = pagina.lastIndexOf("<TrabajoPorSede", pagina.indexOf("<LlegoMercaderia"));
    expect(guardian).toBeGreaterThan(-1);
    expect(pagina.slice(guardian, pagina.indexOf("<LlegoMercaderia"))).not.toContain("</TrabajoPorSede>");
  });

  it("cada vista tiene su propio guardián: lo guardado en una no aparece en la otra", () => {
    expect(pagina).toMatch(/<TrabajoPorSede\s+key="llegada"\s+ubicacionId=\{persona\.ubicacionId\}/);
    expect(pagina).toMatch(/<TrabajoPorSede\s+key="factura"\s+ubicacionId=\{ubicacionMirada\}/);
  });

  it("los dos componentes leen lo guardado de su sede y reportan lo que cuentan", () => {
    for (const archivo of [RECEPCION_ENVIO, LLEGO_MERCADERIA]) {
      const fuente = readFileSync(archivo, "utf8");
      expect(fuente).toMatch(/\{ inicial: guardado, reportar: reportarConteo, otras: guardadosEnOtras \} = useTrabajoPorSede</);
      expect(fuente).toMatch(/reportarConteo\(\s*!ok && contado/);
    }
  });

  it("«¿Salir sin guardar?» compara contra el formulario VACÍO, no contra el de al abrir (un conteo recuperado también se protege)", () => {
    const envio = readFileSync(RECEPCION_ENVIO, "utf8");
    expect(envio).not.toMatch(/useState\(fotoConteo\)/);
    expect(envio).toMatch(/const contado = envioContado\(/);
    const llegada = readFileSync(LLEGO_MERCADERIA, "utf8");
    expect(llegada).toMatch(/const contado = llegadaContada\(/);
    // Lo guardado en otra sede también se pierde al salir de Recibir: también pregunta.
    for (const fuente of [envio, llegada]) {
      expect(fuente).toMatch(/useSalidaSinGuardar\(\s*!ok && \(contado \|\| guardadosEnOtras\.length > 0\)/);
    }
  });
});

describe("la key de la recepción", () => {
  it("otra sede, otra key", () => {
    expect(claveDeLaRecepcion("lima")).not.toBe(claveDeLaRecepcion("trujillo"));
    expect(claveDeLaRecepcion("lima")).toBe(claveDeLaRecepcion("lima"));
  });
});

describe("qué se guarda al cambiar de sede", () => {
  const vacio = { reparto: {}, extras: [], decisiones: {}, numeroGuia: "", nota: "" };

  it("una recepción sin nada contado ni escrito no se guarda (marcar facturas se rehace en un toque)", () => {
    expect(envioContado(vacio)).toBe(false);
  });

  it("basta una cantidad, una prenda fuera de comprobante, una decisión, la guía o la nota", () => {
    expect(envioContado({ ...vacio, reparto: { l1: { v1: 2 } } })).toBe(true);
    expect(envioContado({ ...vacio, reparto: { l1: { v1: 0 } } })).toBe(true); // «no llegó nada» también es contar (D1)
    expect(
      envioContado({ ...vacio, extras: [{ productoId: "p", varianteId: "", cantidad: 1, costoUnitario: "", proveedorId: "x", esRegalo: false }] }),
    ).toBe(true);
    expect(envioContado({ ...vacio, decisiones: { l1: "espero" } })).toBe(true);
    expect(envioContado({ ...vacio, numeroGuia: "T001-000123" })).toBe(true);
    expect(envioContado({ ...vacio, nota: "Caja abierta al llegar" })).toBe(true);
  });

  it("«Llegó mercadería»: lo escaneado o la guía; elegir el proveedor solo, no", () => {
    expect(llegadaContada({ lineas: [], numeroGuia: "" })).toBe(false);
    expect(llegadaContada({ lineas: [], numeroGuia: "   " })).toBe(false);
    expect(llegadaContada({ lineas: [{ varianteId: "v1", cantidad: 1, costo: "" }], numeroGuia: "" })).toBe(true);
    expect(llegadaContada({ lineas: [], numeroGuia: "EG01-123" })).toBe(true);
  });

  it("las unidades que se avisan: lo contado más lo que llegó fuera de comprobante", () => {
    expect(unidadesDelEnvio({ reparto: { l1: { v1: 2, v2: 3 }, l2: { v3: 1 } }, extras: [{ cantidad: 4 }, { cantidad: 0 }] })).toBe(10);
    expect(unidadesDeLaLlegada([{ cantidad: 2 }, { cantidad: 5 }])).toBe(7);
  });
});

describe("el aviso al salir de Recibir", () => {
  const PROPIO = "Hay un conteo a medias en este envío y todavía no se recibió. Si sales ahora, se pierde lo contado.";
  const LIMA = { sede: "lima", etiqueta: "Tienda Lima", unidades: 12 };

  it("sin nada guardado en otra sede, el de siempre", () => {
    expect(mensajeDeSalida(PROPIO, [])).toBe(PROPIO);
  });

  it("con la sede de ahora vacía y un conteo guardado en otra, habla solo de ese", () => {
    const m = mensajeDeSalida(null, [LIMA]);
    expect(m).not.toContain("este envío");
    expect(m).toContain("Tienda Lima (12 unidades)");
    expect(m).toMatch(/Si sales de Recibir, se pierde/);
  });

  it("con las dos cosas, el de siempre y además el guardado", () => {
    const m = mensajeDeSalida(PROPIO, [LIMA]);
    expect(m.startsWith(PROPIO)).toBe(true);
    expect(m).toContain("También se pierde lo que dejaste contado en Tienda Lima (12 unidades).");
  });

  it("varias sedes, una frase", () => {
    const m = mensajeDeSalida(null, [
      { sede: "lima", etiqueta: "Tienda Lima", unidades: 1 },
      { sede: "trujillo", etiqueta: "Tienda Trujillo", unidades: 3 },
    ]);
    expect(m).toContain("Tienda Lima (1 unidad) y Tienda Trujillo (3 unidades)");
  });
});
