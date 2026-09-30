import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MOTIVOS_PEDIDO,
  OPCIONES_RAZON,
  PREGUNTA_SE_PROBO,
  RAZONES_SE_PROBO,
  TEXTO_MOTIVO,
  TEXTO_RAZON,
  argsRegistrarPedido,
  avisoAnotado,
  datosSeProbo,
  describirMotivo,
  descripcionDePrenda,
  esMotivoPedido,
  esPedidoDeTalla,
  esRazonSeProbo,
  leerMotivo,
  leerRazon,
  prendaQuitadaDeLinea,
  textoPrendaQuitada,
} from "./se-probo-reglas";

// La base manda (ADR-0288 D-6): los valores de aquí tienen que ser los del candado y los de la función. Se leen de la
// migración (PARTE 1, las columnas; PARTE 2, la función) para que no puedan separarse sin que esta prueba lo diga.
const leerMigracion = (nombre: string) => readFileSync(new URL(`../../../supabase/migrations/${nombre}`, import.meta.url), "utf8");
const MIGRACION = [leerMigracion("20260930240000_club_paso1d_parte1_pedidos.sql"), leerMigracion("20260930240100_club_paso1d_parte2_se_probo.sql")].join("\n");
const valoresDe = (texto: string) => [...texto.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);

describe("los valores son los de la base", () => {
  it("los motivos son los del candado pedidos_no_atendidos_motivo_valido", () => {
    const candado = /pedidos_no_atendidos_motivo_valido\s+check \(motivo in \(([^)]*)\)\)/.exec(MIGRACION);
    expect(candado).not.toBeNull();
    expect(valoresDe(candado![1])).toEqual([...MOTIVOS_PEDIDO]);
  });

  it("las razones son las del candado pedidos_no_atendidos_razon_solo_si_se_probo", () => {
    const candado = /pedidos_no_atendidos_razon_solo_si_se_probo\s+check \(razon is null or \(motivo = 'se_probo_no_llevo' and razon in \(([^)]*)\)\)\)/.exec(
      MIGRACION
    );
    expect(candado).not.toBeNull();
    expect(valoresDe(candado![1])).toEqual([...RAZONES_SE_PROBO]);
  });

  it("el default de la columna y el de la función es «buscó y no había»", () => {
    expect(MIGRACION).toContain("add column if not exists motivo text not null default 'no_habia_talla'");
    expect(MIGRACION).toContain("p_motivo text default 'no_habia_talla'");
  });
});

describe("textos", () => {
  it("cada motivo y cada razón tiene su texto, sin repetirse", () => {
    for (const m of MOTIVOS_PEDIDO) expect(TEXTO_MOTIVO[m]).toBeTruthy();
    for (const r of RAZONES_SE_PROBO) expect(TEXTO_RAZON[r]).toBeTruthy();
    expect(new Set(Object.values(TEXTO_RAZON)).size).toBe(RAZONES_SE_PROBO.length);
  });

  it("las opciones de razón siguen el orden y los textos del spike (No le quedó, Precio, Color, Lo piensa)", () => {
    expect(OPCIONES_RAZON.map((o) => o.valor)).toEqual(["no_le_quedo", "precio", "color", "lo_piensa"]);
    expect(OPCIONES_RAZON.map((o) => o.texto)).toEqual(["No le quedó", "Precio", "Color", "Lo piensa"]);
    expect(PREGUNTA_SE_PROBO).toBe("¿Se la probó y no la llevó?");
  });

  it("describirMotivo: el motivo, y la razón en minúscula si la dijo", () => {
    expect(describirMotivo("no_habia_talla", null)).toBe("Buscó y no había");
    expect(describirMotivo("se_probo_no_llevo", null)).toBe("Se la probó y no la llevó");
    expect(describirMotivo("se_probo_no_llevo", "precio")).toBe("Se la probó y no la llevó · precio");
    expect(describirMotivo("se_probo_no_llevo", "lo_piensa")).toBe("Se la probó y no la llevó · lo piensa");
  });

  it("descripcionDePrenda: referencia y color, sin separadores sueltos", () => {
    expect(descripcionDePrenda("Blusa Carlita", "Blanco")).toBe("Blusa Carlita · Blanco");
    expect(descripcionDePrenda("Blusa Carlita", null)).toBe("Blusa Carlita");
    expect(descripcionDePrenda(" Blusa Carlita ", "  ")).toBe("Blusa Carlita");
  });

  it("avisoAnotado dice qué se anotó (el de «se la probó», el del spike)", () => {
    expect(avisoAnotado("no_habia_talla", "Blusa Carlita · Blanco", "M")).toEqual({
      titulo: "Anotado: no había",
      detalle: "Blusa Carlita · Blanco · talla M. Compras lo verá en Pedidos no atendidos.",
    });
    expect(avisoAnotado("se_probo_no_llevo", "Blusa Carlita", "M")).toEqual({
      titulo: "Anotado: se la probó y no la llevó",
      detalle: "Blusa Carlita · talla M. Compras y el Taller lo ven en Pedidos no atendidos.",
    });
    expect(avisoAnotado("se_probo_no_llevo", "Falda", null).detalle).toBe("Falda. Compras y el Taller lo ven en Pedidos no atendidos.");
  });
});

describe("leer lo que viene de la base", () => {
  it("un motivo conocido se respeta; ausente o desconocido es «buscó y no había» (lo de siempre)", () => {
    expect(leerMotivo("se_probo_no_llevo")).toBe("se_probo_no_llevo");
    expect(leerMotivo("no_habia_talla")).toBe("no_habia_talla");
    expect(leerMotivo(undefined)).toBe("no_habia_talla");
    expect(leerMotivo(null)).toBe("no_habia_talla");
    expect(leerMotivo("otro")).toBe("no_habia_talla");
  });

  it("la razón solo existe con «se la probó»", () => {
    expect(leerRazon("se_probo_no_llevo", "color")).toBe("color");
    expect(leerRazon("se_probo_no_llevo", null)).toBeNull();
    expect(leerRazon("se_probo_no_llevo", "inventada")).toBeNull();
    expect(leerRazon("no_habia_talla", "color")).toBeNull();
  });

  it("los guardas de tipo", () => {
    expect(esMotivoPedido("se_probo_no_llevo")).toBe(true);
    expect(esMotivoPedido("")).toBe(false);
    expect(esRazonSeProbo("lo_piensa")).toBe(true);
    expect(esRazonSeProbo(3)).toBe(false);
  });

  it("solo «buscó y no había» cuenta como pedido que alguien espera (Llegó tu talla, Inicio, Análisis)", () => {
    expect(esPedidoDeTalla("no_habia_talla")).toBe(true);
    expect(esPedidoDeTalla("se_probo_no_llevo")).toBe(false);
  });
});

describe("argsRegistrarPedido", () => {
  const U = "11111111-1111-4111-8111-111111111111";

  it("«buscó y no había» como hoy: descripción y talla, sin razón", () => {
    expect(argsRegistrarPedido({ ubicacionId: U, motivo: "no_habia_talla", descripcion: "Blusa Carlita · Blanco", talla: "M" })).toEqual({
      p_ubicacion_id: U,
      p_motivo: "no_habia_talla",
      p_descripcion_libre: "Blusa Carlita · Blanco",
      p_talla: "M",
    });
  });

  it("«se la probó» con razón y clienta", () => {
    expect(
      argsRegistrarPedido({
        ubicacionId: U,
        motivo: "se_probo_no_llevo",
        razon: "no_le_quedo",
        productoId: "p1",
        descripcion: "Blusa Carlita · Blanco",
        talla: "S",
        clientaId: "c1",
      })
    ).toEqual({
      p_ubicacion_id: U,
      p_motivo: "se_probo_no_llevo",
      p_razon: "no_le_quedo",
      p_producto_id: "p1",
      p_descripcion_libre: "Blusa Carlita · Blanco",
      p_talla: "S",
      p_clienta_id: "c1",
    });
  });

  it("«se la probó» sin razón (es opcional) y sin clienta (sigue siendo demanda para Compras)", () => {
    const args = argsRegistrarPedido({ ubicacionId: U, motivo: "se_probo_no_llevo", razon: null, descripcion: "Falda plisada" });
    expect(args).toEqual({ p_ubicacion_id: U, p_motivo: "se_probo_no_llevo", p_descripcion_libre: "Falda plisada" });
  });

  it("lo vacío no se manda: la RPC espera null, nunca ''", () => {
    const args = argsRegistrarPedido({ ubicacionId: U, motivo: "no_habia_talla", productoId: "p1", descripcion: "  ", talla: "", clientaId: null });
    expect(args).toEqual({ p_ubicacion_id: U, p_motivo: "no_habia_talla", p_producto_id: "p1" });
  });

  it("sin producto ni descripción no hay nada que anotar (la base lo rechaza igual)", () => {
    expect(argsRegistrarPedido({ ubicacionId: U, motivo: "se_probo_no_llevo", razon: "precio", descripcion: " " })).toBeNull();
  });

  it("una razón con «buscó y no había» no se puede armar: el tipo no la deja", () => {
    // @ts-expect-error — `razon` solo existe con `se_probo_no_llevo` (MotivoConRazon).
    const args = argsRegistrarPedido({ ubicacionId: U, motivo: "no_habia_talla", razon: "precio", descripcion: "Falda" });
    // Y si alguien la forzara, no viaja: la base la rechazaría con `pedido_razon_sin_se_probo`.
    expect(args).toEqual({ p_ubicacion_id: U, p_motivo: "no_habia_talla", p_descripcion_libre: "Falda" });
  });
});

describe("«¿Se la probó y no la llevó?» al quitar una prenda del ticket", () => {
  const U = "11111111-1111-4111-8111-111111111111";

  it("la prenda quitada: nombre, color y talla del catálogo de la caja", () => {
    expect(prendaQuitadaDeLinea({ referencia: "Blusa Carlita" }, { color: "Blanco", talla: "M" })).toEqual({
      referencia: "Blusa Carlita",
      color: "Blanco",
      talla: "M",
    });
  });

  it("sin detalle de la variante, o con talla vacía, va sin color ni talla", () => {
    expect(prendaQuitadaDeLinea({ referencia: "Blusa Carlita" })).toEqual({ referencia: "Blusa Carlita", color: null, talla: null });
    expect(prendaQuitadaDeLinea({ referencia: "Blusa Carlita" }, { color: " ", talla: "" })).toEqual({ referencia: "Blusa Carlita", color: null, talla: null });
  });

  it("una «Prenda sin registrar» va con su descripción, sin color ni talla (no tiene variante en el catálogo)", () => {
    expect(prendaQuitadaDeLinea({ referencia: "Casaca jean sin etiqueta", prendaLibre: { descripcion: "Casaca jean sin etiqueta" } }, { color: "Azul", talla: "S" })).toEqual({
      referencia: "Casaca jean sin etiqueta",
      color: null,
      talla: null,
    });
  });

  it("sin nombre no hay nada que preguntar", () => {
    expect(prendaQuitadaDeLinea({ referencia: "  " }, { color: "Blanco", talla: "M" })).toBeNull();
  });

  it("el texto de la pregunta es el del spike, con la talla entre paréntesis si se sabe", () => {
    expect(textoPrendaQuitada({ referencia: "Blusa Carlita", color: "Blanco", talla: "M" })).toBe("Quitaste «Blusa Carlita» (M). Anótalo para Compras: es opcional.");
    expect(textoPrendaQuitada({ referencia: "Casaca jean", color: null, talla: null })).toBe("Quitaste «Casaca jean». Anótalo para Compras: es opcional.");
  });

  it("tocar una razón anota «se la probó y no la llevó» con la prenda (nombre · color), la talla y la clienta", () => {
    const datos = datosSeProbo({ referencia: "Blusa Carlita", color: "Blanco", talla: "M" }, "precio", U, "c1");
    expect(datos).toEqual({ ubicacionId: U, motivo: "se_probo_no_llevo", razon: "precio", descripcion: "Blusa Carlita · Blanco", talla: "M", clientaId: "c1" });
    expect(argsRegistrarPedido(datos)).toEqual({
      p_ubicacion_id: U,
      p_motivo: "se_probo_no_llevo",
      p_razon: "precio",
      p_descripcion_libre: "Blusa Carlita · Blanco",
      p_talla: "M",
      p_clienta_id: "c1",
    });
  });

  it("sin clienta también se anota (sigue siendo demanda para Compras)", () => {
    const args = argsRegistrarPedido(datosSeProbo({ referencia: "Falda", color: null, talla: "S" }, "no_le_quedo", U, null));
    expect(args).toEqual({ p_ubicacion_id: U, p_motivo: "se_probo_no_llevo", p_razon: "no_le_quedo", p_descripcion_libre: "Falda", p_talla: "S" });
  });

  it("cada una de las cuatro razones viaja tal cual", () => {
    for (const { valor } of OPCIONES_RAZON) {
      expect(argsRegistrarPedido(datosSeProbo({ referencia: "Falda", color: null, talla: null }, valor, U, null))?.p_razon).toBe(valor);
    }
  });
});
