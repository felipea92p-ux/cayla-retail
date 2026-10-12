import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RUTA_ORDENES,
  hrefAltaDesdeProduccion,
  hrefOrdenDesdeAlta,
  textoAbrirOrden,
  tipoDeParametro,
  vieneDeProduccion,
  type TipoOrden,
} from "./modelo-nuevo-orden-reglas";

// Contrato. PROMETE: que el camino Nueva orden → Nuevo producto → Nueva orden conserva el tipo elegido y el modelo recién creado,
// que un parámetro roto cae a lo de siempre sin lanzar, y que las rutas a las que apuntan los enlaces existen. NO PROMETE que el
// modelo esté en el catálogo al volver (eso lo decide la base al guardar el alta) ni que la persona pueda abrir Producción desde
// donde esté parada (la página de Órdenes lo vuelve a decidir).

const RAIZ = join(__dirname, "..");
const TIPOS: TipoOrden[] = ["produccion", "muestra"];

describe("tipoDeParametro", () => {
  it("solo «muestra», exacto, es una muestra", () => {
    expect(tipoDeParametro("muestra")).toBe("muestra");
  });
  it("todo lo demás es una producción, sin lanzar", () => {
    for (const crudo of ["produccion", "", "MUESTRA", "Muestra", "muestra ", "otra", undefined, null]) {
      expect(tipoDeParametro(crudo as string | undefined | null), String(crudo)).toBe("produccion");
    }
  });
  it("un parámetro repetido (?tipo=a&tipo=b) toma el primero", () => {
    expect(tipoDeParametro(["muestra", "produccion"])).toBe("muestra");
    expect(tipoDeParametro(["produccion", "muestra"])).toBe("produccion");
    expect(tipoDeParametro([])).toBe("produccion");
  });
});

describe("vieneDeProduccion", () => {
  it("solo el valor exacto cuenta", () => {
    expect(vieneDeProduccion("produccion")).toBe(true);
    expect(vieneDeProduccion(["produccion"])).toBe(true);
  });
  it("sin el parámetro o con otro valor, el alta es la de siempre", () => {
    for (const crudo of [undefined, null, "", "Produccion", "produccion ", "compras", []]) {
      expect(vieneDeProduccion(crudo as string | string[] | undefined | null), JSON.stringify(crudo)).toBe(false);
    }
  });
});

describe("el viaje de ida: Nueva orden → Nuevo producto", () => {
  it("marca el origen y conserva el tipo", () => {
    expect(hrefAltaDesdeProduccion("produccion")).toBe("/productos/nuevo?desde=produccion&tipo=produccion");
    expect(hrefAltaDesdeProduccion("muestra")).toBe("/productos/nuevo?desde=produccion&tipo=muestra");
  });
  it("lo que se manda es lo que la pantalla de destino entiende (ida y lectura son inversas)", () => {
    for (const tipo of TIPOS) {
      const q = new URL(hrefAltaDesdeProduccion(tipo), "http://x").searchParams;
      expect(vieneDeProduccion(q.get("desde"))).toBe(true);
      expect(tipoDeParametro(q.get("tipo"))).toBe(tipo);
    }
  });
});

describe("el viaje de vuelta: Nuevo producto → Nueva orden", () => {
  it("abre Órdenes con el modelo elegido y el tipo", () => {
    expect(hrefOrdenDesdeAlta("abc-123", "produccion")).toBe("/produccion/ordenes?nueva=abc-123&tipo=produccion");
    expect(hrefOrdenDesdeAlta("abc-123", "muestra")).toBe("/produccion/ordenes?nueva=abc-123&tipo=muestra");
  });
  it("codifica el id igual que los otros enlaces a «nueva orden» (Análisis, Resumen), sin romper la URL", () => {
    expect(hrefOrdenDesdeAlta("p 1", "produccion")).toBe("/produccion/ordenes?nueva=p%201&tipo=produccion");
    for (const id of ["a&b=c", "x#y", "ñandú/1", "1?2"]) {
      const q = new URL(hrefOrdenDesdeAlta(id, "muestra"), "http://x").searchParams;
      expect(q.get("nueva"), id).toBe(id);
      expect(tipoDeParametro(q.get("tipo")), id).toBe("muestra");
    }
  });
  it("ida y vuelta conservan el tipo de punta a punta", () => {
    for (const tipo of TIPOS) {
      const ida = new URL(hrefAltaDesdeProduccion(tipo), "http://x").searchParams;
      const vuelta = new URL(hrefOrdenDesdeAlta("id", tipoDeParametro(ida.get("tipo"))), "http://x").searchParams;
      expect(tipoDeParametro(vuelta.get("tipo"))).toBe(tipo);
    }
  });
});

describe("textoAbrirOrden", () => {
  it("dice lo que va a pasar, distinto para cada tipo, y nunca queda vacío", () => {
    const [a, b] = TIPOS.map((t) => textoAbrirOrden(t));
    for (const t of [a, b]) {
      expect(t.boton.length).toBeGreaterThan(0);
      expect(t.titulo.length).toBeGreaterThan(0);
    }
    expect(a.boton).not.toBe(b.boton);
    expect(b.boton).toMatch(/muestra/i);
    expect(a.boton).toMatch(/producción/i);
  });
});

describe("las rutas existen", () => {
  it("Órdenes y Nuevo producto son páginas de verdad (si alguien las renombra, esta prueba avisa)", () => {
    expect(RUTA_ORDENES).toBe("/produccion/ordenes");
    expect(existsSync(join(RAIZ, "app/(app)/produccion/ordenes/page.tsx"))).toBe(true);
    expect(existsSync(join(RAIZ, "app/(app)/productos/nuevo/page.tsx"))).toBe(true);
  });
  it("Órdenes lee `nueva` y `tipo` de la URL: el retorno tiene a dónde llegar", () => {
    const pagina = readFileSync(join(RAIZ, "app/(app)/produccion/ordenes/page.tsx"), "utf8");
    expect(pagina).toMatch(/nueva\?: string/);
    expect(pagina).toMatch(/tipoDeParametro/);
  });
  it("Nuevo producto lee `desde` y `tipo`: la ida tiene quien la entienda", () => {
    const pagina = readFileSync(join(RAIZ, "app/(app)/productos/nuevo/page.tsx"), "utf8");
    expect(pagina).toMatch(/vieneDeProduccion/);
  });
});
