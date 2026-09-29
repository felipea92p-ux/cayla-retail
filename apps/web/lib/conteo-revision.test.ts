import { describe, expect, it } from "vitest";
import { estadoDeLinea, type LineaConteo } from "./conteo-reglas";
import {
  diferenciasEnOrden,
  existenciaTrasElAjuste,
  mensajeDeCierre,
  pendientesPorPercha,
  textoAjusteNegativo,
  textoConfirmaPrimero,
  textoQuedarianEnNegativo,
  unirLineasConPrendas,
  type FilaConteoVista,
} from "./conteo-revision";

// Lo que se revisa y lo que se cierra tienen que ser LA MISMA lista, en el mismo orden, y el mensaje de un cierre que
// falla no puede mentir sobre si las existencias se movieron.

function linea(p: Partial<LineaConteo> & { varianteId: string; debeHaber: number; contada: number | null }): LineaConteo {
  const base = { foto: p.debeHaber, anterior: null, verificadoEn: null, confirmadaEn: null, actual: null, ajusteMovimientoId: null, ...p };
  const estado = estadoDeLinea(base);
  if (estado === null) throw new Error("la línea de prueba está ignorada");
  return { ...base, diferencia: base.contada === null ? null : base.contada - base.debeHaber, estado };
}

const prenda = (varianteId: string, productoId: string, referencia: string, color: string | null, talla: string | null) => ({
  varianteId,
  productoId,
  referencia,
  color,
  colorHex: null,
  fotoUrl: null,
  talla,
  sku: `SKU-${varianteId}`,
});

const PRENDAS = [
  prenda("a-m", "p1", "Blusa Emma", "Beige", "M"),
  prenda("a-s", "p1", "Blusa Emma", "Beige", "S"),
  prenda("a-l", "p1", "Blusa Emma", "Beige", "L"),
  prenda("b-m", "p2", "Casaca Luci", "Negro", "M"),
  prenda("c-m", "p3", "Blusa Emma", "Beige", "M"), // otro modelo que se llama igual
];

describe("unirLineasConPrendas", () => {
  it("cruza cada línea con su prenda por varianteId", () => {
    const filas = unirLineasConPrendas([linea({ varianteId: "a-m", debeHaber: 11, contada: 9 })], PRENDAS);
    expect(filas[0]).toMatchObject({ referencia: "Blusa Emma", color: "Beige", talla: "M", productoId: "p1", contada: 9 });
  });

  it("una variante que el catálogo ya no conoce NO desaparece: cuenta y se dibuja con un nombre honesto", () => {
    const filas = unirLineasConPrendas([linea({ varianteId: "zzz", debeHaber: 3, contada: 3 })], PRENDAS);
    expect(filas).toHaveLength(1);
    expect(filas[0].referencia).toBe("Prenda sin ficha en el catálogo");
    expect(filas[0].talla).toBeNull();
    expect(filas[0].productoId).toBe("zzz");
  });
});

describe("diferenciasEnOrden", () => {
  const filas: FilaConteoVista[] = unirLineasConPrendas(
    [
      linea({ varianteId: "b-m", debeHaber: 4, contada: 4 }), // correcta: no entra
      linea({ varianteId: "a-l", debeHaber: 5, contada: 6 }), // sobra 1
      linea({ varianteId: "a-s", debeHaber: 2, contada: 0, confirmadaEn: "2026-09-29T10:00:00Z" }), // falta 2, confirmada
      linea({ varianteId: "a-m", debeHaber: 11, contada: 9 }), // faltan 2
      linea({ varianteId: "c-m", debeHaber: 1, contada: null, foto: 1 }), // pendiente: no entra
      linea({ varianteId: "b-m2", debeHaber: 3, contada: null, anterior: 5, foto: 3 }), // en reconteo: no entra
    ],
    [...PRENDAS, prenda("b-m2", "p2", "Casaca Luci", "Negro", "L")]
  );

  it("trae solo las verificadas con diferencia, confirmadas o no", () => {
    expect(diferenciasEnOrden(filas).map((f) => f.varianteId).sort()).toEqual(["a-l", "a-m", "a-s"]);
  });

  it("en el orden del rack: S, M, L, sin depender de cómo llegaron", () => {
    expect(diferenciasEnOrden(filas).map((f) => f.talla)).toEqual(["S", "M", "L"]);
    expect(diferenciasEnOrden([...filas].reverse()).map((f) => f.talla)).toEqual(["S", "M", "L"]);
  });

  it("dos modelos con el mismo nombre no mezclan sus tallas", () => {
    const dos = unirLineasConPrendas(
      [linea({ varianteId: "c-m", debeHaber: 1, contada: 2 }), linea({ varianteId: "a-s", debeHaber: 1, contada: 2 }), linea({ varianteId: "a-m", debeHaber: 1, contada: 2 })],
      PRENDAS
    );
    // p1 (S, M) va junto, y p3 (M) aparte: nunca S, M(p3), M(p1)
    const ids = diferenciasEnOrden(dos).map((f) => f.varianteId);
    expect(ids.slice(0, 2).sort()).toEqual(["a-m", "a-s"]);
    expect(ids[2]).toBe("c-m");
  });
});

describe("pendientesPorPercha", () => {
  it("junta las pendientes y las que están en reconteo por modelo y color, con sus tallas en orden", () => {
    const filas = unirLineasConPrendas(
      [
        linea({ varianteId: "a-l", debeHaber: 2, contada: null }),
        linea({ varianteId: "a-s", debeHaber: 2, contada: null, anterior: 4, foto: 2 }),
        linea({ varianteId: "a-m", debeHaber: 2, contada: 2 }), // verificada: no entra
        linea({ varianteId: "b-m", debeHaber: 2, contada: null }),
      ],
      PRENDAS
    );
    const grupos = pendientesPorPercha(filas);
    expect(grupos.map((g) => `${g.referencia}·${g.color}`)).toEqual(["Blusa Emma·Beige", "Casaca Luci·Negro"]);
    expect(grupos[0].tallas.map((t) => [t.talla, t.estado])).toEqual([
      ["S", "en_reconteo"],
      ["L", "pendiente"],
    ]);
  });

  it("sin pendientes no hay percha que mostrar", () => {
    expect(pendientesPorPercha(unirLineasConPrendas([linea({ varianteId: "a-m", debeHaber: 1, contada: 1 })], PRENDAS))).toEqual([]);
  });
});

describe("existenciaTrasElAjuste", () => {
  it("suma el ajuste a lo que hay HOY, no a lo que había al verificar", () => {
    // debía haber 11, contó 9 (−2), pero desde entonces salió 1: hoy hay 10 → quedará en 8
    expect(existenciaTrasElAjuste({ actual: 10, diferencia: -2 })).toBe(8);
  });

  it("un resultado negativo delata que el cierre entero se rechazaría", () => {
    // faltaban 3, pero ya salieron 2 por venta: hoy hay 1 y el ajuste de −3 dejaría −2
    expect(existenciaTrasElAjuste({ actual: 1, diferencia: -3 })).toBe(-2);
  });

  it("no inventa nada sin datos o sin ajuste", () => {
    expect(existenciaTrasElAjuste({ actual: null, diferencia: -2 })).toBeNull();
    expect(existenciaTrasElAjuste({ actual: 5, diferencia: null })).toBeNull();
    expect(existenciaTrasElAjuste({ actual: 5, diferencia: 0 })).toBeNull();
  });
});

describe("textoConfirmaPrimero", () => {
  it("dice qué falta y para qué, en singular y plural", () => {
    expect(textoConfirmaPrimero(1, "continuar")).toBe("Confirma o vuelve a contar 1 diferencia para continuar.");
    expect(textoConfirmaPrimero(3, "cerrar como conteo parcial")).toBe("Confirma o vuelve a contar 3 diferencias para cerrar como conteo parcial.");
  });
});

describe("mensajeDeCierre", () => {
  it("un rechazo de la base dice primero que no se movió nada, y luego la causa en castellano", () => {
    const m = mensajeDeCierre({ message: "El ajuste dejaría stock negativo: hay 1 y el ajuste es -3", code: "P0001" });
    expect(m.incierto).toBe(false);
    expect(m.texto.startsWith("El conteo no se cerró y no cambió ninguna existencia.")).toBe(true);
    expect(m.texto).toContain("El ajuste dejaría stock negativo: hay 1 y el ajuste es -3");
  });

  it("los apartados para clientas se explican tal cual los dice la base", () => {
    const causa = "El ajuste dejaría 2 prendas de BLU-0001 en stock pero hay 3 apartadas para clientas — libera o resuelve esos apartados primero";
    expect(mensajeDeCierre({ message: causa, code: "P0001" }).texto).toContain(causa);
  });

  it("con la conexión cortada NO afirma que no cambió nada: la base pudo guardar y no llegar la respuesta", () => {
    const m = mensajeDeCierre({ message: "TypeError: Failed to fetch" });
    expect(m.incierto).toBe(true);
    expect(m.texto).not.toContain("no cambió ninguna existencia");
    expect(m.texto).toContain("no podemos confirmar si llegó a guardarse");
  });

  it("un error sin código de Postgres (un 502 del camino) también es incierto", () => {
    expect(mensajeDeCierre({ message: "Bad Gateway" }).incierto).toBe(true);
  });
});

describe("avisos de existencia negativa", () => {
  it("dice qué hay hoy y en cuánto quedaría, con el menos tipográfico", () => {
    expect(textoAjusteNegativo({ actual: 1, quedaria: -2 })).toBe("Hoy hay 1 por movimientos posteriores: el ajuste la dejaría en −2 y así el conteo no se puede cerrar.");
  });

  it("el aviso de la lista concuerda en singular y plural", () => {
    expect(textoQuedarianEnNegativo(1)).toContain("1 variante quedaría");
    expect(textoQuedarianEnNegativo(3)).toContain("3 variantes quedarían");
    expect(textoQuedarianEnNegativo(3)).toContain("cuéntalas");
  });
});
