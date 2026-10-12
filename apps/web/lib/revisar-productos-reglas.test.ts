import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  HINTS_REVISION,
  bloqueoDeRechazo,
  leerPorRevisar,
  mensajeDeRevision,
  textoOrigen,
  textoPrecio,
  textoPropuesta,
  textoVariantes,
  textosRevision,
  yaSeRevisoOtraVez,
  type FilaPorRevisar,
} from "./revisar-productos-reglas";

const fila = (extra: Partial<FilaPorRevisar> = {}): FilaPorRevisar => ({
  producto_id: "p1",
  referencia: "Blusa Emma",
  codigo: "CMS-0001",
  categoria: "Camisas y Blusas",
  categoria_prefijo: "CMS",
  categoria_familia: "indumentaria",
  color_hex: "#2D2C2F",
  marca: null,
  creado_en: "2026-10-09T15:21:18.403Z",
  propuesto_por_nombre: "Micaela Pérez",
  sede: "Tienda Trujillo",
  sede_tipo: "tienda",
  terminal: null,
  variantes: 6,
  tallas: ["L", "S", "M"],
  colores: ["Negro", "Beige"],
  precio_min: 79.9,
  precio_max: 79.9,
  stock: 0,
  ordenes_abiertas: 0,
  total: 3,
  ...extra,
});

describe("leerPorRevisar", () => {
  it("ordena las tallas por su curva y los colores por nombre, y lleva el total de todas", () => {
    const { productos, total } = leerPorRevisar([fila()]);
    expect(productos[0].tallas).toEqual(["S", "M", "L"]);
    expect(productos[0].colores).toEqual(["Beige", "Negro"]);
    expect(total).toBe(3);
  });
  it("tallas numéricas (28, 30, 32) se ordenan como números, no como texto", () => {
    expect(leerPorRevisar([fila({ tallas: ["32", "28", "30"] })]).productos[0].tallas).toEqual(["28", "30", "32"]);
  });
  it("lo que PostgREST manda como texto se lee como número", () => {
    const { productos } = leerPorRevisar([fila({ precio_min: "59.90" as unknown as number, stock: "12" as unknown as number, total: "7" as unknown as number })]);
    expect(productos[0].precioMin).toBe(59.9);
    expect(productos[0].stock).toBe(12);
  });
  it("lleva lo que la miniatura sin foto necesita (prefijo, familia y color de la prenda)", () => {
    const p = leerPorRevisar([fila()]).productos[0];
    expect(p).toMatchObject({ categoriaPrefijo: "CMS", categoriaFamilia: "indumentaria", colorHex: "#2D2C2F" });
  });
  it("sin filas: lista vacía y total 0 (no se cae)", () => {
    expect(leerPorRevisar([])).toEqual({ productos: [], total: 0 });
  });
  it("una prenda sin precio ni quien la propuso se lee con vacíos, no con ceros inventados", () => {
    const p = leerPorRevisar([fila({ precio_min: null, precio_max: null, propuesto_por_nombre: null, sede: null })]).productos[0];
    expect(p.precioMin).toBeNull();
    expect(p.propuestoPor).toBeNull();
    expect(p.sede).toBeNull();
  });
});

describe("textos de la fila", () => {
  it("precio: uno, un rango o sin precio (una muestra)", () => {
    expect(textoPrecio(79.9, 79.9)).toBe("S/ 79.90");
    expect(textoPrecio(59.9, 79.9)).toBe("S/ 59.90 a S/ 79.90");
    expect(textoPrecio(null, null)).toBe("Sin precio");
    expect(textoPrecio(0, 0)).toBe("Sin precio");
  });
  it("variantes: no dice «colores» si la prenda no tiene color, y respeta el singular", () => {
    expect(textoVariantes({ variantes: 6, tallas: ["S", "M"], colores: ["Beige"] })).toBe("6 variantes · tallas S, M · color Beige");
    expect(textoVariantes({ variantes: 1, tallas: ["M"], colores: [] })).toBe("1 variante · talla M");
    expect(textoVariantes({ variantes: 1, tallas: [], colores: [] })).toBe("1 variante");
  });
  it("origen: sede, sede y terminal, o que no se anotó", () => {
    expect(textoOrigen({ sede: "Taller", terminal: null })).toBe("Taller");
    expect(textoOrigen({ sede: "Tienda Lima", terminal: "Almacén" })).toBe("Tienda Lima · Almacén");
    expect(textoOrigen({ sede: null, terminal: null })).toBe("No se anotó desde dónde");
  });
  it("quién y cuándo: hoy, ayer o la fecha; y si nadie la firmó, lo dice", () => {
    const ahora = new Date("2026-10-10T15:00:00.000Z");
    expect(textoPropuesta({ propuestoPor: "Micaela Pérez", creadoEn: "2026-10-10T13:00:00.000Z" }, ahora)).toBe("Propuesta por Micaela Pérez · hoy");
    expect(textoPropuesta({ propuestoPor: "Micaela Pérez", creadoEn: "2026-10-09T15:21:00.000Z" }, ahora)).toBe("Propuesta por Micaela Pérez · ayer");
    expect(textoPropuesta({ propuestoPor: "Micaela Pérez", creadoEn: "2026-10-03T15:00:00.000Z" }, ahora)).toMatch(/^Propuesta por Micaela Pérez · el 3 de octubre$/);
    expect(textoPropuesta({ propuestoPor: null, creadoEn: "2026-10-10T13:00:00.000Z" }, ahora)).toBe("Propuesta hoy, sin responsable anotado");
  });
});

describe("bloqueoDeRechazo", () => {
  it("una prenda sin nada colgado se puede rechazar", () => {
    expect(bloqueoDeRechazo({ ordenesAbiertas: 0, stock: 0 })).toBeNull();
  });
  it("una orden en proceso lo bloquea, en singular y en plural, y dice qué hacer", () => {
    expect(bloqueoDeRechazo({ ordenesAbiertas: 1, stock: 0 })).toMatchObject({ motivo: "ordenes", texto: "Tiene una orden de producción en proceso" });
    expect(bloqueoDeRechazo({ ordenesAbiertas: 2, stock: 0 })?.texto).toBe("Tiene 2 órdenes de producción en proceso");
    expect(bloqueoDeRechazo({ ordenesAbiertas: 2, stock: 0 })?.queHacer).toMatch(/Anula esas órdenes en Producción/);
  });
  it("el stock lo bloquea y lleva a Existencias", () => {
    expect(bloqueoDeRechazo({ ordenesAbiertas: 0, stock: 1 })?.texto).toBe("Tiene una prenda en stock");
    expect(bloqueoDeRechazo({ ordenesAbiertas: 0, stock: 118 })?.texto).toBe("Tiene 118 prendas en stock");
    expect(bloqueoDeRechazo({ ordenesAbiertas: 0, stock: 118 })?.queHacer).toMatch(/Existencias/);
  });
  it("con las dos cosas, primero la orden (es lo que hay que resolver antes)", () => {
    expect(bloqueoDeRechazo({ ordenesAbiertas: 1, stock: 50 })?.motivo).toBe("ordenes");
  });

  // El candado real es de la base: la web solo lo adelanta. Si la migración deja de mirar las órdenes en proceso o el stock, o la web
  // deja de decirlo, esta prueba lo nota (ADR-0371).
  it("coincide con lo que la base niega: las mismas dos condiciones, con sus mismos hints", () => {
    const sql = readFileSync(join(__dirname, "..", "..", "..", "supabase", "migrations", "20261010170000_revisar_productos_pendientes.sql"), "utf8");
    expect(sql).toMatch(/estado = 'en_proceso'/);
    expect(sql).toMatch(/hint = 'con_ordenes_abiertas'/);
    expect(sql).toMatch(/hint = 'con_stock'/);
    for (const hint of ["con_ordenes_abiertas", "con_stock", "ya_revisada", "no_existe", "sin_permiso", "datos_incompletos"]) {
      expect(sql).toContain(`hint = '${hint}'`);
      expect(HINTS_REVISION.has(hint)).toBe(true);
    }
    // Y no hay un hint nuevo en la base que la web no sepa leer.
    const delSql = [...sql.matchAll(/using (?:errcode = '42501', )?hint = '([a-z_]+)'/g)].map((m) => m[1]);
    for (const h of delSql) expect(HINTS_REVISION.has(h)).toBe(true);
  });
});

describe("textosRevision", () => {
  it("aprobar es corto y tranquilo; rechazar dice que es permanente y que existe Descontinuar", () => {
    const a = textosRevision("aprobar", "Blusa Emma");
    expect(a.titulo).toBe("Aprobar «Blusa Emma»");
    expect(a.exito).toBe("«Blusa Emma» quedó aprobada.");
    const r = textosRevision("rechazar", "Blusa Emma");
    expect(r.titulo).toBe("Rechazar «Blusa Emma»");
    expect(r.nota).toMatch(/permanente/);
    expect(r.nota).toMatch(/descontínuala en su ficha/);
    expect(r.nota).toMatch(/No se borra nada/);
    expect(r.boton).toBe("Rechazar la prenda");
  });
});

describe("mensajeDeRevision", () => {
  it("las reglas de la base se muestran tal cual, ya vienen en castellano de tienda", () => {
    const msg = "No se puede rechazar «Blusa Emma»: tiene una orden de producción en proceso en el Taller.";
    expect(mensajeDeRevision({ message: msg, hint: "con_ordenes_abiertas", code: "P0001" }, "rechazar la prenda")).toBe(msg);
    expect(mensajeDeRevision({ message: "Solo quien edita el catálogo puede aprobar…", hint: "sin_permiso", code: "42501" }, "aprobar la prenda")).toBe("Solo quien edita el catálogo puede aprobar…");
  });
  it("lo demás pasa por el traductor de siempre (red caída: no se guardó nada)", () => {
    expect(mensajeDeRevision({ message: "Failed to fetch" }, "aprobar la prenda")).toMatch(/No se pudo aprobar la prenda: la conexión falló/);
  });
  it("«ya se revisó» pide refrescar la lista; lo demás no", () => {
    expect(yaSeRevisoOtraVez({ message: "x", hint: "ya_revisada" })).toBe(true);
    expect(yaSeRevisoOtraVez({ message: "x", hint: "con_stock" })).toBe(false);
    expect(yaSeRevisoOtraVez(null)).toBe(false);
  });
});
