import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PARAMETROS_RPC_SUBIR_PARA_ENVIAR,
  RPC_SUBIR_PARA_ENVIAR,
  agruparPorDestino,
  avisoNoEstaCompleta,
  destinosParaEnviar,
  enviableHoy,
  etiquetaParaEnviar,
  faltaDestino,
  motivoYaNoValido,
  noEstaCompleta,
  paraEnviarDeFila,
  urlArmarEnvio,
  type PrendaParaEnviar,
} from "./para-enviar-reglas";

const prenda = (p: Partial<PrendaParaEnviar> & Pick<PrendaParaEnviar, "id">): PrendaParaEnviar => ({
  destinoId: "lim",
  destino: "Tienda Lima",
  varianteId: `v-${p.id}`,
  producto: "Blusa Carlita",
  color: "Blanco",
  talla: "M",
  sku: null,
  cantidad: 2,
  falta: 2,
  enAlmacen: 2,
  nota: null,
  creadoEn: "2026-10-05T10:00:00Z",
  creadoPorNombre: null,
  ...p,
});

describe("paraEnviarDeFila", () => {
  it("lee la fila de fn_para_enviar", () => {
    expect(
      paraEnviarDeFila({
        id: "a", destino_id: "lim", destino: "Tienda Lima", variante_id: "v1", producto: "Blusa Carlita", color: "Blanco", talla: "M", sku: "B-1",
        cantidad: 3, falta: 2, en_almacen: 1, nota: "Se vende más allá", created_at: "2026-10-05T10:00:00Z", creado_por_nombre: "Micaela",
      }),
    ).toEqual({
      id: "a", destinoId: "lim", destino: "Tienda Lima", varianteId: "v1", producto: "Blusa Carlita", color: "Blanco", talla: "M", sku: "B-1",
      cantidad: 3, falta: 2, enAlmacen: 1, nota: "Se vende más allá", creadoEn: "2026-10-05T10:00:00Z", creadoPorNombre: "Micaela",
    });
  });
  it("cantidades rotas o negativas se leen 0 (nunca se arma una caja con −1)", () => {
    const p = paraEnviarDeFila({ id: "a", falta: -2, en_almacen: "x", cantidad: null });
    expect([p.falta, p.enAlmacen, p.cantidad]).toEqual([0, 0, 0]);
  });
  it("etiqueta", () => {
    expect(etiquetaParaEnviar({ producto: "Polo", color: null, talla: "S" })).toBe("Polo · S");
  });
});

describe("agruparPorDestino", () => {
  it("por sede (alfabético), lo más antiguo primero; lo que ya salió no aparece", () => {
    const g = agruparPorDestino([
      prenda({ id: "b", creadoEn: "2026-10-05T12:00:00Z" }),
      prenda({ id: "a", creadoEn: "2026-10-04T12:00:00Z" }),
      prenda({ id: "x", destinoId: "aqp", destino: "Tienda Arequipa", falta: 1, enAlmacen: 0 }),
      prenda({ id: "salio", falta: 0 }),
    ]);
    expect(g.map((x) => x.destino)).toEqual(["Tienda Arequipa", "Tienda Lima"]);
    expect(g[1].prendas.map((p) => p.id)).toEqual(["a", "b"]);
    expect(g[1]).toMatchObject({ total: 4, enviables: 4 });
    expect(g[0]).toMatchObject({ total: 1, enviables: 0 });
  });
  it("sin nada que enviar, ninguna sede", () => {
    expect(agruparPorDestino([])).toEqual([]);
  });
});

describe("lo que se puede enviar hoy", () => {
  it("lo que falta, topado a lo que hay en el almacén", () => {
    expect(enviableHoy({ falta: 3, enAlmacen: 1 })).toBe(1);
    expect(enviableHoy({ falta: 1, enAlmacen: 5 })).toBe(1);
  });
  it("si en el almacén hay menos de lo que falta, la lista lo avisa", () => {
    expect(noEstaCompleta({ falta: 2, enAlmacen: 1 })).toBe(true);
    expect(noEstaCompleta({ falta: 2, enAlmacen: 2 })).toBe(false);
  });
  it("el aviso no afirma que se vendió: también pudo apartarse para un pedido (revisión adversarial)", () => {
    expect(avisoNoEstaCompleta({ falta: 1, enAlmacen: 0 })).toBe("Ya no está libre en tu almacén: ¿se vendió, se movió o se apartó para un pedido?");
    expect(avisoNoEstaCompleta({ falta: 3, enAlmacen: 1 })).toBe("En tu almacén hay 1 libre: revisa si se vendió o se apartó alguna.");
    expect(avisoNoEstaCompleta({ falta: 3, enAlmacen: 2 })).toBe("En tu almacén hay 2 libres: revisa si se vendió o se apartó alguna.");
  });
});

describe("urlArmarEnvio — Nuevo traslado ya cargado", () => {
  it("destino y prendas con lo enviable hoy; la misma prenda subida dos veces va en una línea", () => {
    const url = urlArmarEnvio({ destinoId: "lim", prendas: [prenda({ id: "a", varianteId: "v1" }), prenda({ id: "b", varianteId: "v1", falta: 1, enAlmacen: 3 }), prenda({ id: "c", varianteId: "v2", falta: 2, enAlmacen: 1 })] });
    expect(url).toBe(`/inventario/traslados/nuevo?destino=lim&lineas=${encodeURIComponent("v1:3,v2:1")}`);
  });
  it("si no hay nada en el almacén, no hay caja que armar", () => {
    expect(urlArmarEnvio({ destinoId: "lim", prendas: [prenda({ id: "a", enAlmacen: 0 })] })).toBeNull();
  });
});

describe("Ya no la envío y la ventana Subir prenda", () => {
  it("el motivo es obligatorio y corto", () => {
    expect(motivoYaNoValido("  ")).toBe(false);
    expect(motivoYaNoValido("Se vendió aquí")).toBe(true);
    expect(motivoYaNoValido("x".repeat(201))).toBe(false);
  });
  it("destinos: las otras sedes activas, por nombre", () => {
    expect(
      destinosParaEnviar(
        [
          { id: "tru", nombre: "Tienda Trujillo", activo: true },
          { id: "lim", nombre: "Tienda Lima", activo: true },
          { id: "tal", nombre: "Taller", activo: true },
          { id: "vieja", nombre: "Tienda Cerrada", activo: false },
        ],
        "tru",
      ),
    ).toEqual([
      { id: "tal", nombre: "Taller" },
      { id: "lim", nombre: "Tienda Lima" },
    ]);
  });
  it("falta el destino solo si se eligió enviar", () => {
    expect(faltaDestino(false, "")).toBe(false);
    expect(faltaDestino(true, "")).toBe(true);
    expect(faltaDestino(true, "lim")).toBe(false);
  });
  it("la RPC y sus parámetros son los de la migración", () => {
    const sql = readFileSync(new URL("../../../supabase/migrations/20261005100200_pedidos_que_no_se_pierden_parte3_para_enviar.sql", import.meta.url), "utf8");
    expect(sql).toContain(`create or replace function retail.${RPC_SUBIR_PARA_ENVIAR}(`);
    for (const p of PARAMETROS_RPC_SUBIR_PARA_ENVIAR) expect(sql).toMatch(new RegExp(`\\b${p} (uuid|jsonb|text)`));
  });
});
