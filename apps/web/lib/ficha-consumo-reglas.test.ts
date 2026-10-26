import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ORDENES_PARA_QUE_MANDE_LO_MEDIDO,
  RPC_GUARDAR_FICHA,
  RPC_LEER_FICHA,
  borradorDeFicha,
  escalon,
  hayCambiosEnLaFicha,
  leerFicha,
  paraRpc,
  problemasDeFicha,
  separarFichaPorTalla,
  unirFichaEnUnaCifra,
  type BorradorFicha,
  type FichaLeida,
} from "./ficha-consumo-reglas";
import type { InsumoDelTaller } from "./orden-tela-reglas";

// Contrato. PROMETE: que la hoja «Ficha de consumo» dice «falta…» con las mismas reglas que `guardar_ficha_consumo` (migración 20261026153000) y arma lo que la función lee; que el escalón
// dice «medido» solo cuando manda lo medido. NO PROMETE que la base acepte: ella valida otra vez. Su prueba contra Postgres es `scripts/pruebas/produccion_ficha_consumo.mjs`.

const RAIZ = join(__dirname, "..", "..", "..");
const SQL = readFileSync(join(RAIZ, "supabase/migrations/20261026153000_produccion_ficha_de_consumo.sql"), "utf8");

const insumo = (id: string, o: Partial<InsumoDelTaller> = {}): InsumoDelTaller => ({ id, nombre: id, tipo: "avio", unidad: "unidad", tejidoId: null, colorCodigo: null, saldo: 100, mermaPct: 0, archivado: false, ...o });
const BOTON = insumo("boton");
const HILO = insumo("hilo", { unidad: "cono" });
const VIEJO = insumo("viejo", { archivado: true });
const LINO = insumo("lino", { tipo: "tela", unidad: "metro" });
const INSUMOS = [BOTON, HILO, VIEJO, LINO];

const crudo = (parche: Record<string, unknown> = {}) => ({
  producto_id: "p-1",
  referencia: "Chaleco de Prueba",
  puede_editar: true,
  tallas: ["S", "M"],
  colores: [{ codigo: "BLA", nombre: "Blanco" }, { codigo: "BEI", nombre: "Beige" }],
  tela: { por_prenda: 1.18, por_talla: { S: 1.15, M: 1.2 }, declarada_en: "2026-10-26T10:00:00Z" },
  avios: [
    { insumo_id: "boton", nombre: "Botón nácar", unidad: "unidad", color_codigo: null, cantidad_por_prenda: 5 },
    { insumo_id: "hilo", nombre: "Hilo beige", unidad: "cono", color_codigo: "BEI", cantidad_por_prenda: 0.03 },
  ],
  medido: { manda: "declarado", por_prenda: null, ordenes: 0 },
  ordenes_cerradas: [],
  ...parche,
});
const ficha = (parche: Record<string, unknown> = {}): FichaLeida => {
  const f = leerFicha(crudo(parche));
  if (!f) throw new Error("la ficha de prueba no se leyó");
  return f;
};
const sinFicha = () => ficha({ tela: null, avios: [] });

describe("leerFicha", () => {
  it("lee lo que devuelve fn_ficha_consumo: tallas, colores, tela por talla, avíos y lo medido", () => {
    const f = ficha();
    expect(f).toMatchObject({ productoId: "p-1", referencia: "Chaleco de Prueba", puedeEditar: true, tallas: ["S", "M"] });
    expect(f.colores).toEqual([{ codigo: "BLA", nombre: "Blanco" }, { codigo: "BEI", nombre: "Beige" }]);
    expect(f.tela).toEqual({ porPrenda: 1.18, porTalla: { S: 1.15, M: 1.2 }, declaradaEn: "2026-10-26T10:00:00Z" });
    expect(f.avios).toEqual([
      { insumoId: "boton", nombre: "Botón nácar", unidad: "unidad", colorCodigo: null, cantidadPorPrenda: 5 },
      { insumoId: "hilo", nombre: "Hilo beige", unidad: "cono", colorCodigo: "BEI", cantidadPorPrenda: 0.03 },
    ]);
    expect(f.medido).toEqual({ manda: "declarado", porPrenda: null, ordenes: 0 });
  });
  it("las tallas salen de la más chica a la más grande, aunque la base las entregue por nombre (M antes que S)", () => {
    expect(ficha({ tallas: ["M", "S", "XL", "L"] }).tallas).toEqual(["S", "M", "L", "XL"]);
  });
  it("lo que no se puede leer no rompe: sin ficha, sin modelo o con basura queda en null o vacío", () => {
    expect(leerFicha(null)).toBeNull();
    expect(leerFicha("x")).toBeNull();
    expect(leerFicha({})).toBeNull();
    expect(ficha({ tela: null }).tela).toBeNull();
    expect(ficha({ tela: { por_prenda: "x" } }).tela).toBeNull();
    expect(ficha({ tela: { por_prenda: 1.2, por_talla: null } }).tela?.porTalla).toBeNull();
    expect(ficha({ tela: { por_prenda: 1.2, por_talla: { S: "x" } } }).tela?.porTalla).toBeNull();
    expect(ficha({ avios: [{ insumo_id: "boton", cantidad_por_prenda: "x" }, "x", null] }).avios).toEqual([]);
    expect(ficha({ puede_editar: "si" }).puedeEditar).toBe(false);
    expect(ficha({ medido: null }).medido).toBeNull();
  });
});

describe("el escalón de donde sale el número", () => {
  it("sin ficha → estimado (una cifra) → Audaces (por talla) → medido (cuando la base dice que manda)", () => {
    expect(escalon(sinFicha())).toBe("sin-ficha");
    expect(escalon(ficha({ tela: { por_prenda: 1.2, por_talla: null, declarada_en: "" } }))).toBe("estimado");
    expect(escalon(ficha())).toBe("audaces");
    expect(escalon(ficha({ medido: { manda: "medido", por_prenda: 1.25, ordenes: 3 } }))).toBe("medido");
  });
  it("manda lo medido con 3 órdenes: es el mismo número que dice la base", () => {
    expect(ORDENES_PARA_QUE_MANDE_LO_MEDIDO).toBe(3);
    expect(SQL.length).toBeGreaterThan(0);
    const medidoSql = readFileSync(join(RAIZ, "supabase/migrations/20261026150000_produccion_lo_medido_no_pisa_lo_declarado.sql"), "utf8");
    expect(medidoSql).toContain(`when m.n >= ${ORDENES_PARA_QUE_MANDE_LO_MEDIDO} then 'medido'`);
  });
});

describe("el borrador", () => {
  it("parte de lo guardado: por talla con tres decimales, avíos con su clave; una cifra única se copia a cada talla para poder separarla", () => {
    const b = borradorDeFicha(ficha());
    expect(b).toMatchObject({ modo: "talla", una: "1.180", porTalla: { S: "1.150", M: "1.200" } });
    expect(b.avios).toEqual([
      { clave: "a0", insumoId: "boton", colorCodigo: null, cantidad: "5.000" },
      { clave: "a1", insumoId: "hilo", colorCodigo: "BEI", cantidad: "0.030" },
    ]);
    const una = borradorDeFicha(ficha({ tela: { por_prenda: 1.2, por_talla: null, declarada_en: "" } }));
    expect(una).toMatchObject({ modo: "una", una: "1.200", porTalla: { S: "1.200", M: "1.200" } });
    expect(borradorDeFicha(sinFicha())).toMatchObject({ modo: "una", una: "", porTalla: { S: "", M: "" }, avios: [] });
  });
  it("con una sola talla no hay «por talla», aunque la ficha traiga cifras por talla", () => {
    expect(borradorDeFicha(ficha({ tallas: ["M"] })).modo).toBe("una");
  });
  it("separar parte de la cifra única; volver a una cifra deja el promedio; con una talla no cambia nada", () => {
    const f = ficha({ tela: { por_prenda: 1.2, por_talla: null, declarada_en: "" } });
    const separado = separarFichaPorTalla(borradorDeFicha(f), f);
    expect(separado).toMatchObject({ modo: "talla", porTalla: { S: "1.200", M: "1.200" } });
    const distinto: BorradorFicha = { ...separado, porTalla: { S: "1.0", M: "1.5" } };
    expect(unirFichaEnUnaCifra(distinto, f)).toMatchObject({ modo: "una", una: "1.250" });
    expect(unirFichaEnUnaCifra({ ...separado, una: "9", porTalla: { S: "x", M: "1.5" } }, f).una).toBe("9");
    const b1 = borradorDeFicha(ficha({ tallas: ["M"] }));
    expect(separarFichaPorTalla(b1, ficha({ tallas: ["M"] }))).toBe(b1);
  });
});

describe("problemasDeFicha — lo que la base rechazaría", () => {
  const f = ficha();
  const b = (parche: Partial<BorradorFicha> = {}): BorradorFicha => ({ ...borradorDeFicha(f), ...parche });
  it("lo guardado tal cual no tiene faltas", () => {
    expect(problemasDeFicha(borradorDeFicha(f), f, INSUMOS)).toEqual([]);
  });
  it("por talla: dice qué talla falta o está mal, con su motivo", () => {
    const p = problemasDeFicha(b({ porTalla: { S: "1.0", M: "" } }), f, INSUMOS);
    expect(p.map((x) => `${x.campo}:${x.talla}`)).toEqual(["tela:M"]);
    expect(p[0].texto).toMatch(/talla M/);
    expect(problemasDeFicha(b({ porTalla: { S: "1,5", M: "x" } }), f, INSUMOS).map((x) => x.talla)).toEqual(["S", "M"]);
    expect(problemasDeFicha(b({ porTalla: { S: "0", M: "10000" } }), f, INSUMOS).map((x) => x.talla)).toEqual(["S", "M"]);
  });
  it("una sola cifra: vacía, coma, texto, cero o pasada del tope; en blanco solo vale si el modelo todavía no tiene ficha", () => {
    for (const una of ["", "1,2", "x", "0", "-1", "10000"]) expect(problemasDeFicha(b({ modo: "una", una }), f, INSUMOS).map((x) => x.campo), una).toEqual(["tela"]);
    const nueva = sinFicha();
    expect(problemasDeFicha(borradorDeFicha(nueva), nueva, INSUMOS)).toEqual([]);
    expect(problemasDeFicha({ ...borradorDeFicha(nueva), una: "abc" }, nueva, INSUMOS).map((x) => x.campo)).toEqual(["tela"]);
  });
  it("los avíos: sin elegir, archivado, que no es avío, color que el modelo no tiene, cantidad mala y repetido", () => {
    const fila = (insumoId: string | null, colorCodigo: string | null, cantidad: string, clave: string) => ({ clave, insumoId, colorCodigo, cantidad });
    expect(problemasDeFicha(b({ avios: [fila(null, null, "1", "x")] }), f, INSUMOS).map((x) => x.fila)).toEqual(["x"]);
    expect(problemasDeFicha(b({ avios: [fila("viejo", null, "1", "x")] }), f, INSUMOS)[0].texto).toMatch(/archivado/);
    expect(problemasDeFicha(b({ avios: [fila("lino", null, "1", "x")] }), f, INSUMOS)[0].texto).toMatch(/es una tela/);
    expect(problemasDeFicha(b({ avios: [fila("hilo", "ZZZ", "1", "x")] }), f, INSUMOS)[0].texto).toMatch(/no tiene ese color/);
    expect(problemasDeFicha(b({ avios: [fila("boton", null, "0", "x")] }), f, INSUMOS).length).toBe(1);
    expect(problemasDeFicha(b({ avios: [fila("boton", null, "4", "x"), fila("boton", null, "5", "y")] }), f, INSUMOS).map((x) => x.fila)).toEqual(["y"]);
    // El mismo avío en dos colores distintos, o para toda la orden y para un color, está bien.
    expect(problemasDeFicha(b({ avios: [fila("hilo", "BLA", "1", "x"), fila("hilo", "BEI", "1", "y"), fila("hilo", null, "1", "z")] }), f, INSUMOS)).toEqual([]);
  });
  it("sin avíos está bien: el modelo se queda sin ellos", () => {
    expect(problemasDeFicha(b({ avios: [] }), f, INSUMOS)).toEqual([]);
  });
});

describe("paraRpc y hayCambios", () => {
  const f = ficha();
  it("por talla viaja `por_talla` con todas las tallas; una cifra, `por_prenda`; en blanco y sin ficha previa, la tela no viaja", () => {
    expect(paraRpc(borradorDeFicha(f), f).p_tela).toEqual({ por_talla: { S: "1.150", M: "1.200" } });
    expect(paraRpc({ ...borradorDeFicha(f), modo: "una", una: " 1.2 " }, f).p_tela).toEqual({ por_prenda: "1.2" });
    const nueva = sinFicha();
    expect(paraRpc(borradorDeFicha(nueva), nueva).p_tela).toBeNull();
    expect(paraRpc({ ...borradorDeFicha(nueva), una: "1.2" }, nueva).p_tela).toEqual({ por_prenda: "1.2" });
  });
  it("los avíos viajan completos, sin las filas sin elegir, con el color y la cantidad como texto", () => {
    const b = { ...borradorDeFicha(f), avios: [...borradorDeFicha(f).avios, { clave: "n", insumoId: null, colorCodigo: null, cantidad: "9" }] };
    expect(paraRpc(b, f).p_avios).toEqual([
      { insumo_id: "boton", color_codigo: null, consumo_por_prenda: "5.000" },
      { insumo_id: "hilo", color_codigo: "BEI", consumo_por_prenda: "0.030" },
    ]);
  });
  it("las llaves que viajan son las que `guardar_ficha_consumo` lee, y los nombres de las dos funciones son los de la migración", () => {
    expect(SQL).toContain(`function retail.${RPC_GUARDAR_FICHA}(`);
    expect(SQL).toContain(`function retail.${RPC_LEER_FICHA}(`);
    const [avio] = paraRpc(borradorDeFicha(f), f).p_avios;
    for (const llave of Object.keys(avio)) expect(SQL.includes(`'${llave}'`) || llave === "consumo_por_prenda", llave).toBe(true);
    for (const llave of ["por_talla", "por_prenda"]) expect(SQL).toContain(`'${llave}'`);
  });
  it("hayCambios ignora el formato («1.2» = «1.200») y las filas sin elegir; cuenta una talla, un avío o una cantidad", () => {
    const b0 = borradorDeFicha(f);
    expect(hayCambiosEnLaFicha(b0, f)).toBe(false);
    expect(hayCambiosEnLaFicha({ ...b0, porTalla: { S: "1.15", M: "1.2" } }, f)).toBe(false);
    expect(hayCambiosEnLaFicha({ ...b0, avios: [...b0.avios, { clave: "n", insumoId: null, colorCodigo: null, cantidad: "" }] }, f)).toBe(false);
    expect(hayCambiosEnLaFicha({ ...b0, porTalla: { S: "1.15", M: "1.3" } }, f)).toBe(true);
    expect(hayCambiosEnLaFicha({ ...b0, avios: [b0.avios[0]] }, f)).toBe(true);
    expect(hayCambiosEnLaFicha({ ...b0, avios: [{ ...b0.avios[0], cantidad: "6" }, b0.avios[1]] }, f)).toBe(true);
    expect(hayCambiosEnLaFicha({ ...b0, modo: "una", una: "1.18" }, f)).toBe(true);
  });
});

describe("paridad con la migración 20261026153000", () => {
  // Solo las dos funciones nuevas: los reemplazos de abajo traen, entre comillas, el texto viejo que quitan (con sus motivos de antes).
  const funciones = SQL.slice(0, SQL.indexOf("-- Reemplaza `p_viejo`"));
  const hintsSql = [...new Set([...funciones.matchAll(/hint = '([a-z_]+)'/g)].map((m) => m[1]))].sort();
  it("los motivos que dice la base son los que la hoja evita o conoce", () => {
    expect(hintsSql).toEqual(["consumo_invalido", "ficha_invalida", "modelo_inexistente", "no_es_avio", "responsable_requerido", "talla_ajena"]);
  });
  it("el tope de la cifra y la lectura «mayor que cero» son los de la función", () => {
    expect(SQL).toContain("v_valor <= 0 or v_valor > 9999");
    expect(SQL).toContain("v_prenda <= 0 or v_prenda > 9999");
  });
});
