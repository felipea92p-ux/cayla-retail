import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { claveCelda } from "./alta-producto";
import {
  BORRADOR_VACIO,
  COSTO_MAXIMO,
  MAX_NOMBRE_MODELO,
  MAX_NOTA_ORDEN_BASE,
  PRECIO_MAXIMO,
  PRECIO_MINIMO,
  aCentimos,
  armarVocabulario,
  camposDeGuiaOrden,
  cantidadDeCelda,
  celdasDelBorrador,
  leerDinero,
  leerErrorModeloNuevo,
  lineasRpc,
  nombreDelModelo,
  ordenarColoresElegidos,
  ordenarTallas,
  paramsRpcModeloNuevo,
  precioDelBorrador,
  problemaDeCostos,
  problemaDePrecio,
  problemasDelModelo,
  resumenCantidades,
  tallasHabituales,
  tieneCaracterDeControl,
  type BorradorModelo,
  type CategoriaDeModelo,
  type ColorDeModelo,
  type FilaCategoria,
  type FilaColor,
} from "./modelo-nuevo-reglas";
import { estadosDe, faltanDe, sePuedeConfirmar } from "./guia-campos";

// Contrato. PROMETE: que la pantalla de «Modelo nuevo» dice «falta…» con las mismas reglas que la base va a aplicar (la prueba al azar comprueba que, si no falta
// nada, lo que se manda cumple lo que `abrir_produccion_con_modelo_nuevo` exige); que las celdas y las cantidades se arman con lo del alta de producto; que los
// NOMBRES de los parámetros coinciden con la firma de la migración y con los tipos generados; y que los avisos de nombre repetido y de «función ausente» se leen.
// NO PROMETE que la base acepte: ella valida otra vez (vocabulario activo, nombre único, permisos) y su prueba contra Postgres es
// `scripts/pruebas/abrir_produccion_con_modelo_nuevo.mjs`.

const RAIZ = join(__dirname, "..", "..", "..");

const T = (id: string, valor: string, habitual = false) => ({ id, valor, habitual });
const BLUSAS: CategoriaDeModelo = {
  id: "cat-blusas",
  nombre: "Blusas",
  prefijo: "BLU",
  familia: "indumentaria",
  tallas: [T("t-xl", "XL"), T("t-m", "M", true), T("t-std", "Estándar"), T("t-s", "S", true), T("t-l", "L", true), T("t-xs", "XS")],
};
const SIN_TALLAS: CategoriaDeModelo = { id: "cat-sin", nombre: "Sin tallas", prefijo: null, familia: null, tallas: [] };
const COLORES: ColorDeModelo[] = [
  { codigo: "NEG", nombre: "Negro", hex: "#111111", familiaColor: "neutros" },
  { codigo: "CRU", nombre: "Crudo", hex: null, familiaColor: "neutros" },
  { codigo: "PRO", nombre: "Palo Rosa", hex: null, familiaColor: "rosas" },
];

const borrador = (o: Partial<BorradorModelo> = {}): BorradorModelo => ({
  ...BORRADOR_VACIO,
  nombre: "Short Sastre",
  categoria: BLUSAS,
  tallaIds: ["t-s", "t-m"],
  colorCodigos: ["NEG"],
  precio: "40",
  ...o,
});
const celdas = (b: BorradorModelo) => celdasDelBorrador(b, COLORES);
const conCantidades = (b: BorradorModelo, n: string): BorradorModelo => ({ ...b, cantidades: Object.fromEntries(celdas(b).map((c) => [c.clave, n])) });

describe("tallas", () => {
  it("la curva habitual de la categoría sale en el orden S · M · L, no en el de la lista", () => {
    expect(tallasHabituales(BLUSAS)).toEqual(["t-s", "t-m", "t-l"]);
    expect(tallasHabituales(null)).toEqual([]);
  });
  it("ordenarTallas deja solo las de la categoría y en orden canónico (una talla ajena no existe acá)", () => {
    expect(ordenarTallas(BLUSAS, ["t-xl", "t-s", "t-ajena", "t-m"])).toEqual(["t-s", "t-m", "t-xl"]);
    expect(ordenarTallas(null, ["t-s"])).toEqual([]);
  });
});

describe("colores y celdas", () => {
  it("los colores salen en el orden del vocabulario, no en el de los clics", () => {
    expect(ordenarColoresElegidos(COLORES, ["PRO", "NEG", "inventado"])).toEqual(["NEG", "PRO"]);
  });
  it("una celda por talla × color elegidos (3 tallas × 2 colores = 6)", () => {
    const b = borrador({ tallaIds: ["t-l", "t-s", "t-m"], colorCodigos: ["PRO", "NEG"] });
    const c = celdas(b);
    expect(c).toHaveLength(6);
    expect(new Set(c.map((x) => x.clave)).size).toBe(6);
  });
  it("sin colores elegidos las celdas son solo de talla (color nulo): la base lo lee como «Sin color»", () => {
    const c = celdas(borrador({ colorCodigos: [] }));
    expect(c).toHaveLength(2);
    expect(c.every((x) => x.color === null)).toBe(true);
  });
});

describe("cantidades", () => {
  it("vacío vale 0; solo enteros de 0 a 9999; lo demás no es una cantidad", () => {
    const b = borrador();
    const [a] = celdas(b);
    expect(cantidadDeCelda(b, a.clave)).toBe(0);
    for (const [texto, esperado] of [["12", 12], ["0", 0], ["9999", 9999], ["10000", null], ["1.5", null], ["-3", null], ["abc", null], [" 7 ", 7]] as const) {
      expect(cantidadDeCelda({ ...b, cantidades: { [a.clave]: texto } }, a.clave), texto).toBe(esperado);
    }
  });
  it("resumenCantidades suma lo válido y cuenta lo inválido (una celda rara no suma)", () => {
    const b = borrador();
    const c = celdas(b);
    const r = resumenCantidades({ ...b, cantidades: { [c[0].clave]: "10", [c[1].clave]: "x" } }, c);
    expect(r).toEqual({ total: 10, invalidas: 1 });
  });
  it("lineasRpc manda solo las celdas con prendas, con el id de la talla y el código del color", () => {
    const b = borrador({ tallaIds: ["t-s", "t-m"], colorCodigos: ["NEG", "CRU"] });
    const c = celdas(b);
    const lineas = lineasRpc({ ...b, cantidades: { [c[0].clave]: "5", [c[1].clave]: "0", [c[2].clave]: "", [c[3].clave]: "8" } }, c);
    expect(lineas).toHaveLength(2);
    expect(lineas.map((l) => l.cantidad)).toEqual([5, 8]);
    expect(lineas[0]).toEqual({ talla_id: "t-s", color_codigo: "NEG", cantidad: 5 });
  });
});

describe("precio y nombre", () => {
  it("el precio vacío es 0 y uno que no es número es NaN (la pantalla lo cuenta como falta)", () => {
    expect(precioDelBorrador(borrador({ precio: "" }))).toBe(0);
    expect(precioDelBorrador(borrador({ precio: " 39.9 " }))).toBeCloseTo(39.9);
    expect(Number.isNaN(precioDelBorrador(borrador({ precio: "abc" })))).toBe(true);
  });
  it("el nombre queda como lo guarda la base: «  short  SASTRE » → «Short Sastre»", () => {
    expect(nombreDelModelo(borrador({ nombre: "  short  SASTRE " }))).toBe("Short Sastre");
  });
});

describe("problemasDelModelo — lo que falta, en el orden de la pantalla", () => {
  const campos = (b: BorradorModelo) => problemasDelModelo(b, celdas(b)).map((p) => p.campo);

  it("un borrador vacío dice qué falta primero: nombre, categoría, precio y cantidades (la talla espera a la categoría)", () => {
    expect(campos(BORRADOR_VACIO)).toEqual(["nombre", "categoria", "precio", "cantidades"]);
  });
  it("todo en orden = nada falta", () => {
    expect(campos(conCantidades(borrador(), "10"))).toEqual([]);
  });
  it("un nombre sin ni una letra o número se rechaza antes de llegar a la base", () => {
    expect(campos(conCantidades(borrador({ nombre: "✨ ..." }), "5"))).toEqual(["nombre"]);
  });
  it("una categoría sin tallas habilitadas no deja avanzar (y dice a quién pedirlo)", () => {
    const b = borrador({ categoria: SIN_TALLAS, tallaIds: [] });
    const p = problemasDelModelo(b, celdas(b)).find((x) => x.campo === "tallas");
    expect(p?.texto).toMatch(/líder/);
  });
  it("sin ninguna talla elegida falta la talla; una talla de otra categoría no cuenta", () => {
    expect(campos(conCantidades(borrador({ tallaIds: [] }), "5"))).toContain("tallas");
    expect(campos(conCantidades(borrador({ tallaIds: ["t-ajena"] }), "5"))).toContain("tallas");
  });
  it("una PRODUCCIÓN pide precio; una MUESTRA no (puede ir en 0 y se completa al aprobarla)", () => {
    expect(campos(conCantidades(borrador({ precio: "" }), "5"))).toEqual(["precio"]);
    expect(campos(conCantidades(borrador({ precio: "0" }), "5"))).toEqual(["precio"]);
    expect(campos(conCantidades(borrador({ precio: "", esMuestra: true }), "5"))).toEqual([]);
  });
  it("un precio negativo o que no es número falla aun en una muestra", () => {
    expect(campos(conCantidades(borrador({ precio: "-1", esMuestra: true }), "5"))).toEqual(["precio"]);
    expect(campos(conCantidades(borrador({ precio: "abc", esMuestra: true }), "5"))).toEqual(["precio"]);
  });
  it("cantidades: todas en cero = falta; una con texto raro = dice que son enteros", () => {
    expect(campos(borrador())).toEqual(["cantidades"]);
    const b = borrador();
    const [a] = celdas(b);
    const p = problemasDelModelo({ ...b, cantidades: { [a.clave]: "1.5" } }, celdas(b));
    expect(p.map((x) => x.campo)).toEqual(["cantidades"]);
    expect(p[0].texto).toMatch(/enteros/);
  });
  it("los colores son opcionales: ninguno elegido no es una falta", () => {
    expect(campos(conCantidades(borrador({ colorCodigos: [] }), "5"))).toEqual([]);
  });
});

describe("dinero y nombre: lo que la base rechaza se dice antes (/chaos 2026-10-10)", () => {
  it("un monto se lee ESTRICTO: solo dígitos y un punto; «12,50», «S/ 50», «1e9» y «0x10» no son un monto", () => {
    expect(leerDinero("")).toEqual({ tipo: "vacio" });
    expect(leerDinero("  ")).toEqual({ tipo: "vacio" });
    for (const t of ["0", "12", "12.5", "12.50", ".5", "5.", " 39.9 ", "99999999.99"]) expect(leerDinero(t).tipo, t).toBe("ok");
    for (const t of ["-1", "-0.01", "- 5"]) expect(leerDinero(t).tipo, t).toBe("negativo");
    for (const t of ["12,50", "1,299.50", "1.299,50", "0,5"]) expect(leerDinero(t).tipo, t).toBe("coma");
    for (const t of ["S/ 50", "50 soles", "1e9", "0x10", "abc", "NaN", "Infinity", "0.1+0.2", "1 2", "٣"]) expect(leerDinero(t).tipo, t).toBe("invalido");
  });
  it("a céntimos como la base: la mitad sube, aun con el ruido binario (12.345 → 12.35, 1.005 → 1.01, 0.001 → 0)", () => {
    expect(aCentimos(12.345)).toBe(12.35);
    expect(aCentimos(1.005)).toBe(1.01);
    expect(aCentimos(0.001)).toBe(0);
    expect(aCentimos(0.005)).toBe(0.01);
    expect(aCentimos(99999.99)).toBe(99999.99);
  });
  it("el precio: producción pide al menos S/ 0.01 (antes 0.001 pasaba y se guardaba como 0,00); una muestra puede ir sin precio", () => {
    const pp = (precio: string, esMuestra = false) => problemaDePrecio(borrador({ precio, esMuestra }));
    expect(pp("40")).toBeNull();
    expect(pp("0.01")).toBeNull();
    expect(pp("0.001")).toBe("El precio mínimo es S/ 0.01.");
    expect(pp("0")).toBe("Pon el precio a tienda. Una muestra sí puede ir sin precio.");
    expect(pp("")).toBe("Pon el precio a tienda. Una muestra sí puede ir sin precio.");
    expect(pp("0.001", true)).toBeNull();
    expect(pp("", true)).toBeNull();
    expect(pp("99999.99")).toBeNull();
    expect(pp("100000")).toBe("El precio no puede pasar de S/ 99,999.99.");
    expect(pp("1e9")).toBe("El precio tiene que ser un número, por ejemplo 12.50.");
    expect(pp("-1", true)).toBe("El precio no puede ser negativo.");
  });
  it("el precio con coma se EXPLICA con un ejemplo (no se acepta, no se adivina: leer dinero distinto es decisión de Felipe)", () => {
    expect(problemaDePrecio(borrador({ precio: "12,50" }))).toBe("Escribe el precio con punto, por ejemplo 12.50.");
    expect(problemaDePrecio(borrador({ precio: "12,50", esMuestra: true }))).toBe("Escribe el precio con punto, por ejemplo 12.50.");
    expect(Number.isNaN(precioDelBorrador(borrador({ precio: "12,50" })))).toBe(true);
  });
  it("los costos: vacío vale 0; coma, «S/», texto, negativo o enorme se DICEN (antes viajaban como null y se guardaban como 0)", () => {
    const c = (tela = "", avios = "", maquila = "") => problemaDeCostos({ tela, avios, maquila });
    expect(c()).toBeNull();
    expect(c("700", "140.5", "0")).toBeNull();
    expect(c("999999.99")).toBeNull();
    expect(c("12,50")).toBe("Escribe el costo de la tela con punto, por ejemplo 12.50.");
    expect(c("", "S/ 50")).toBe("El costo de los avíos tiene que ser un número, por ejemplo 12.50.");
    expect(c("", "", "-0.01")).toBe("El costo de la maquila no puede ser negativo.");
    expect(c("1000000")).toBe("El costo de la tela no puede pasar de S/ 999,999.99.");
    expect(c("1e9")).toBe("El costo de la tela tiene que ser un número, por ejemplo 12.50.");
    expect(c("12,50", "S/ 5")).toBe("Escribe el costo de la tela con punto, por ejemplo 12.50.");
  });
  it("un costo mal escrito es una falta del campo «costos» (bloquea el botón) y se ve junto a los demás problemas", () => {
    const b = conCantidades(borrador(), "5");
    expect(problemasDelModelo(b, celdas(b), { tela: "", avios: "", maquila: "" })).toEqual([]);
    expect(problemasDelModelo(b, celdas(b), { tela: "12,50", avios: "", maquila: "" }).map((x) => x.campo)).toEqual(["costos"]);
    expect(problemasDelModelo(b, celdas(b)).map((x) => x.campo)).toEqual([]);
  });
  it("el nombre: hasta 80 letras; más, o con un carácter que la base no guarda (NUL), se dice antes de enviar", () => {
    const largo = (n: number) => "Modelo ".repeat(20).slice(0, n);
    const campos = (nombre: string) => problemasDelModelo(conCantidades(borrador({ nombre }), "5"), celdas(conCantidades(borrador({ nombre }), "5"))).map((x) => x.campo);
    expect(nombreDelModelo(borrador({ nombre: largo(80) })).length).toBeLessThanOrEqual(MAX_NOMBRE_MODELO);
    expect(campos(largo(80))).toEqual([]);
    expect(campos(largo(81))).toEqual(["nombre"]);
    expect(problemasDelModelo(conCantidades(borrador({ nombre: largo(300) }), "5"), celdas(conCantidades(borrador({ nombre: largo(300) }), "5")))[0].texto).toBe("El nombre es muy largo: máximo 80 letras.");
    expect(campos("a\u0000b")).toEqual(["nombre"]);
    expect(tieneCaracterDeControl("a\u0000b")).toBe(true);
    expect(tieneCaracterDeControl("línea uno\nlínea dos\tOK")).toBe(false);
    expect(tieneCaracterDeControl("Blusa 👗 Ñandú “comillas” — M")).toBe(false);
  });
  it("los topes de la pantalla son LOS MISMOS que los de la función de la base (si alguien cambia uno, esta prueba lo dice)", () => {
    const sql = readFileSync(join(RAIZ, "supabase/migrations/20261009120000_abrir_produccion_con_modelo_nuevo.sql"), "utf8");
    const numero = (re: RegExp) => Number(re.exec(sql)?.[1]);
    expect(numero(/char_length\(v_ref\) > (\d+)/)).toBe(MAX_NOMBRE_MODELO);
    expect(numero(/char_length\(btrim\(coalesce\(p_nota, ''\)\)\) > (\d+)/)).toBe(MAX_NOTA_ORDEN_BASE);
    expect(numero(/v_precio > ([\d.]+)/)).toBe(PRECIO_MAXIMO);
    expect(numero(/v_precio < (0\.\d+)/)).toBe(PRECIO_MINIMO);
    expect(numero(/v_costo > ([\d.]+)/)).toBe(COSTO_MAXIMO);
    for (const hint of ["nombre_largo", "nota_larga", "precio_invalido", "precio_obligatorio", "costo_invalido", "talla_obligatoria"]) expect(sql, hint).toContain(`hint = '${hint}'`);
  });
});

describe("la pantalla no promete lo que la base rechaza (al azar, con semilla fija)", () => {
  // PRNG determinista (mulberry32): una corrida exacta se repite.
  const prng = (semilla: number) => () => {
    semilla |= 0;
    semilla = (semilla + 0x6d2b79f5) | 0;
    let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const elegir = <X,>(r: () => number, xs: X[]) => xs[Math.floor(r() * xs.length)];
  /** Los valores buenos pesan 3 a 1 frente a los hostiles: si no, casi ningún borrador llega a «todo en orden» y la prueba no probaría nada. */
  const casiSiempreBueno = <X,>(buenos: X[], hostiles: X[]) => [...buenos, ...buenos, ...buenos, ...hostiles];

  it("si no falta nada, lo que se manda cumple lo que exige la función (celdas únicas, tallas de la categoría, enteros 1–9999, precio si es producción)", () => {
    const r = prng(361);
    const textos = ["", "0", "5", "12", "9999", "10000", "1.5", "abc", "-2", " 7 "];
    let sinProblemas = 0;
    for (let i = 0; i < 2000; i++) {
      const categoria = elegir(r, [BLUSAS, SIN_TALLAS, null]);
      const b: BorradorModelo = {
        nombre: elegir(r, casiSiempreBueno(["Short Sastre", "  blusa  CAMILA ", "Ñandú 2"], ["", "...", "Modelo ".repeat(13), "a\u0000b"])),
        categoria,
        tallaIds: [...(categoria?.tallas ?? []), { id: "t-ajena" }].filter(() => r() < 0.5).map((t) => t.id),
        colorCodigos: COLORES.filter(() => r() < 0.5).map((c) => c.codigo),
        precio: elegir(r, casiSiempreBueno(["40", "39.9", "99999.99", "12.345"], ["", "0", "-1", "abc", "0.001", "12,50", "100000", "1e9"])),
        esMuestra: r() < 0.5,
        cantidades: {},
      };
      const c = celdas(b);
      b.cantidades = Object.fromEntries(c.map((x) => [x.clave, elegir(r, textos)]));
      const costos = {
        tela: elegir(r, casiSiempreBueno(["", "700"], ["12,50", "S/ 5", "-1", "1000000"])),
        avios: elegir(r, casiSiempreBueno(["", "140.5"], ["abc"])),
        maquila: elegir(r, casiSiempreBueno(["", "0", "0.001"], ["1e9"])),
      };
      if (problemasDelModelo(b, c, costos).length > 0) continue;
      sinProblemas += 1;

      const lineas = lineasRpc(b, c);
      expect(lineas.length).toBeGreaterThan(0);
      for (const l of lineas) {
        expect(Number.isInteger(l.cantidad) && l.cantidad >= 1 && l.cantidad <= 9999).toBe(true);
        if (l.talla_id !== null) expect(b.categoria?.tallas.some((t) => t.id === l.talla_id)).toBe(true);
      }
      expect(new Set(lineas.map((l) => claveCelda(l.talla_id, l.color_codigo))).size).toBe(lineas.length);
      const precio = precioDelBorrador(b);
      expect(Number.isNaN(precio) || precio < 0).toBe(false);
      expect(aCentimos(precio)).toBeLessThanOrEqual(PRECIO_MAXIMO);
      if (!b.esMuestra) expect(aCentimos(precio)).toBeGreaterThanOrEqual(PRECIO_MINIMO);
      expect(b.nombre.trim()).not.toBe("");
      expect(nombreDelModelo(b).length).toBeLessThanOrEqual(MAX_NOMBRE_MODELO);
      expect(tieneCaracterDeControl(b.nombre)).toBe(false);
      const params = paramsRpcModeloNuevo({ ubicacionId: "u", borrador: b, celdas: c, costos, fechaEntrega: "", nota: "", confirmoDistinto: false, token: "t" });
      for (const costo of [params.p_costo_tela, params.p_costo_avios, params.p_costo_maquila]) {
        expect(Number.isFinite(costo) && costo >= 0 && aCentimos(costo) <= COSTO_MAXIMO).toBe(true);
      }
    }
    // Que el azar de verdad llegue a «todo en orden» (si no, la prueba no probaría nada).
    expect(sinProblemas).toBeGreaterThan(20);
  });
});

describe("paramsRpcModeloNuevo — los nombres coinciden con la base", () => {
  const b = conCantidades(borrador(), "5");
  const params = paramsRpcModeloNuevo({
    ubicacionId: "taller-1",
    borrador: b,
    celdas: celdas(b),
    costos: { tela: "700", avios: "140", maquila: "" },
    fechaEntrega: "2026-11-01",
    nota: "  urgente ",
    confirmoDistinto: false,
    token: "tok-1",
  });

  it("lleva los valores en su sitio", () => {
    expect(params).toMatchObject({
      p_ubicacion_id: "taller-1",
      p_referencia: "Short Sastre",
      p_categoria_id: "cat-blusas",
      p_precio: 40,
      p_costo_tela: 700,
      p_costo_avios: 140,
      p_costo_maquila: 0,
      p_es_muestra: false,
      p_fecha_entrega: "2026-11-01",
      p_nota: "urgente",
      p_confirmo_distinto: false,
      p_token: "tok-1",
    });
    expect(params.p_variantes).toHaveLength(2);
  });
  it("una fecha y una nota vacías no viajan (la base usa su valor de fábrica)", () => {
    const sin = paramsRpcModeloNuevo({ ubicacionId: "u", borrador: b, celdas: celdas(b), costos: { tela: "", avios: "", maquila: "" }, fechaEntrega: "", nota: "  ", confirmoDistinto: false, token: "t" });
    expect(sin.p_fecha_entrega).toBeUndefined();
    expect(sin.p_nota).toBeUndefined();
  });
  it("los parámetros son exactamente los de la firma de la migración", () => {
    const sql = readFileSync(join(RAIZ, "supabase/migrations/20261009120000_abrir_produccion_con_modelo_nuevo.sql"), "utf8");
    const firma = sql.slice(sql.indexOf("create or replace function retail.abrir_produccion_con_modelo_nuevo("), sql.indexOf("returns uuid"));
    const enSql = [...firma.matchAll(/^\s*(p_\w+)/gm)].map((m) => m[1]).sort();
    expect(Object.keys(params).sort()).toEqual(enSql);
  });
  it("y los de los tipos generados (si la base cambia de firma, el compilador y esta prueba avisan juntos)", () => {
    const tipos = readFileSync(join(RAIZ, "packages/database/src/types.ts"), "utf8");
    const desde = tipos.indexOf("abrir_produccion_con_modelo_nuevo: {");
    const bloque = tipos.slice(desde, tipos.indexOf("Returns:", desde));
    const enTipos = [...bloque.matchAll(/^\s*(p_\w+)\??:/gm)].map((m) => m[1]).sort();
    expect(Object.keys(params).sort()).toEqual(enTipos);
  });
  it("la migración usa los hint que la pantalla lee (nombre repetido): si alguien los renombra, aquí se nota", () => {
    const sql = readFileSync(join(RAIZ, "supabase/migrations/20261009120000_abrir_produccion_con_modelo_nuevo.sql"), "utf8");
    expect(sql).toContain("hint = 'nombre_duplicado'");
    expect(sql).toContain("hint = 'nombre_casi_igual'");
  });
});

describe("leerErrorModeloNuevo", () => {
  it("un nombre repetido trae el id del modelo que ya existe", () => {
    const e = leerErrorModeloNuevo({ message: 'Ya existe un modelo llamado "Short Sastre".', hint: "nombre_duplicado", details: "abc-1" });
    expect(e).toEqual({ tipo: "nombre_duplicado", existenteId: "abc-1", mensaje: 'Ya existe un modelo llamado "Short Sastre".' });
  });
  it("un nombre casi igual pide confirmación y también trae el id", () => {
    const e = leerErrorModeloNuevo({ message: "casi igual", hint: "nombre_casi_igual", details: "abc-2" });
    expect(e.tipo).toBe("nombre_casi_igual");
    expect(e.tipo === "nombre_casi_igual" && e.existenteId).toBe("abc-2");
  });
  it("«la función no existe» (la web se publicó antes que la migración) se distingue de un error cualquiera", () => {
    expect(leerErrorModeloNuevo({ message: "Could not find the function retail.abrir_produccion_con_modelo_nuevo(…) in the schema cache", code: "PGRST202" })).toEqual({ tipo: "funcion_ausente" });
    expect(leerErrorModeloNuevo({ message: 'function retail.abrir_produccion_con_modelo_nuevo(uuid) does not exist', code: "42883" })).toEqual({ tipo: "funcion_ausente" });
  });
  it("cualquier otro error (o ninguno) es «otro»", () => {
    expect(leerErrorModeloNuevo({ message: "Una producción necesita el precio a tienda", hint: "precio_obligatorio", code: "P0001" })).toEqual({ tipo: "otro" });
    expect(leerErrorModeloNuevo(null)).toEqual({ tipo: "otro" });
  });
});

describe("armarVocabulario", () => {
  const fila = (o: Partial<FilaCategoria> & { id: string; nombre: string }): FilaCategoria => ({ prefijo: null, familia: "indumentaria", categoria_padre_id: null, categoria_tallas: [], ...o });
  const talla = (id: string, valor: string, activo = true) => ({ id, valor, activo });
  const familias = [{ codigo: "indumentaria", nombre: "Indumentaria" }, { codigo: "calzado", nombre: "Calzado" }];

  it("solo las hojas del árbol: una categoría que es padre de otra no se ofrece", () => {
    const v = armarVocabulario([fila({ id: "padre", nombre: "Tops" }), fila({ id: "hija", nombre: "Blusas", categoria_padre_id: "padre" })], [], familias);
    expect(v.categorias.map((c) => c.id)).toEqual(["hija"]);
  });
  it("solo tallas activas, sin repetir y en orden canónico; lee el embebido como objeto o como lista", () => {
    const v = armarVocabulario(
      [fila({ id: "c", nombre: "Blusas", categoria_tallas: [
        { habitual: false, talla: talla("l", "L") },
        { habitual: true, talla: [talla("s", "S")] },
        { habitual: false, talla: talla("old", "XXS", false) },
        { habitual: true, talla: talla("s", "S") },
        { habitual: false, talla: null },
      ] })],
      [],
      familias,
    );
    expect(v.categorias[0].tallas).toEqual([{ id: "s", valor: "S", habitual: true }, { id: "l", valor: "L", habitual: false }]);
  });
  it("las categorías salen agrupadas por el nombre de su familia y luego por nombre", () => {
    const v = armarVocabulario(
      [fila({ id: "z", nombre: "Zapatillas", familia: "calzado" }), fila({ id: "b", nombre: "Blusas" }), fila({ id: "a", nombre: "Abrigos" })],
      [],
      familias,
    );
    expect(v.categorias.map((c) => c.nombre)).toEqual(["Zapatillas", "Abrigos", "Blusas"]); // Calzado < Indumentaria
  });
  it("una familia sin nombre conocido no tumba nada", () => {
    const v = armarVocabulario([fila({ id: "x", nombre: "Raro", familia: "nueva" }), fila({ id: "y", nombre: "Otro", familia: null })], [], familias);
    expect(v.categorias).toHaveLength(2);
  });
  it("los colores se arman con la forma que entiende el selector del alta (familia, tipo, sinónimos) y las familias pasan tal cual", () => {
    const filas: FilaColor[] = [
      { codigo: "NEG", nombre: "Negro", hex: "#111111", familia_color: "neutros", tipo: "liso", sinonimos: ["black"], pantone_tcx: "19-4005" },
      { codigo: "CRU", nombre: "Crudo", hex: null, familia_color: null, tipo: null, sinonimos: null, pantone_tcx: null },
    ];
    const v = armarVocabulario([], filas, familias);
    expect(v.colores[0]).toEqual({ codigo: "NEG", nombre: "Negro", hex: "#111111", familiaColor: "neutros", tipo: "liso", sinonimos: ["black"], pantoneTcx: "19-4005" });
    expect(v.colores[1]).toMatchObject({ codigo: "CRU", familiaColor: "", sinonimos: [], pantoneTcx: null });
    expect(v.familias).toEqual(familias);
  });
});


describe("camposDeGuiaOrden — la guía de foco dice lo mismo que la validación", () => {
  const guia = (b: BorradorModelo, extra: { esNuevo?: boolean; hayModelo?: boolean; totalExistente?: number } = {}) =>
    camposDeGuiaOrden({ esNuevo: true, hayModelo: true, borrador: b, celdas: celdas(b), totalExistente: 0, ...extra });

  it("con un modelo que ya existe solo hay dos cosas por decidir: cuál y cuántas", () => {
    const campos = guia(BORRADOR_VACIO, { esNuevo: false, hayModelo: false });
    expect(faltanDe(campos).map((c) => c.id)).toEqual(["modelo", "cantidades"]);
    // …y un costo mal escrito también frena a un modelo que ya existe (antes «12,50» se guardaba como 0).
    const conCosto = camposDeGuiaOrden({ esNuevo: false, hayModelo: true, borrador: BORRADOR_VACIO, celdas: [], totalExistente: 12, costos: { tela: "12,50", avios: "", maquila: "" } });
    expect(faltanDe(conCosto).map((c) => c.id)).toEqual(["costos"]);
    expect(sePuedeConfirmar(conCosto)).toBe(false);
    expect(sePuedeConfirmar(guia(BORRADOR_VACIO, { esNuevo: false, hayModelo: true, totalExistente: 12 }))).toBe(true);
    expect(sePuedeConfirmar(guia(BORRADOR_VACIO, { esNuevo: false, hayModelo: true, totalExistente: 0 }))).toBe(false);
  });
  it("un modelo nuevo vacío: sigue el nombre, y falta nombre, categoría, precio y cantidades (las tallas esperan a la categoría)", () => {
    const campos = guia(BORRADOR_VACIO);
    expect(faltanDe(campos).map((c) => c.id)).toEqual(["nombre", "categoria", "precio", "cantidades"]);
    expect(estadosDe(campos)["nombre"]).toBe("ahora");
    expect(estadosDe(campos)["tallas"]).toBe("opcional");
  });
  it("una muestra sin precio no lo pide: el precio es opcional (y se ve como opcional)", () => {
    const b = conCantidades(borrador({ precio: "", esMuestra: true }), "5");
    expect(sePuedeConfirmar(guia(b))).toBe(true);
    expect(estadosDe(guia(b))["precio"]).toBe("opcional");
  });
  it("con todo en orden no queda nada por hacer", () => {
    const campos = guia(conCantidades(borrador(), "10"));
    expect(faltanDe(campos)).toEqual([]);
    expect(sePuedeConfirmar(campos)).toBe(true);
  });

  it("COINCIDE con problemasDelModelo en 3000 borradores al azar: se puede confirmar solo si no hay problemas, y lo que falta es exactamente lo que la validación marca", () => {
    const prng = (semilla: number) => () => {
      semilla |= 0;
      semilla = (semilla + 0x6d2b79f5) | 0;
      let t = Math.imul(semilla ^ (semilla >>> 15), 1 | semilla);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const r = prng(284);
    const elegir = <X,>(xs: X[]) => xs[Math.floor(r() * xs.length)];
    let completos = 0;
    for (let i = 0; i < 3000; i++) {
      const categoria = elegir([BLUSAS, BLUSAS, BLUSAS, SIN_TALLAS, null]);
      const b: BorradorModelo = {
        nombre: elegir(["Short Sastre", "Short Sastre", "Ñandú 2", "", "...", "Modelo ".repeat(13)]),
        categoria,
        tallaIds: [...(categoria?.tallas ?? []), { id: "t-ajena" }].filter(() => r() < 0.5).map((t) => t.id),
        colorCodigos: COLORES.filter(() => r() < 0.5).map((c) => c.codigo),
        precio: elegir(["40", "40", "40", "39.9", "", "0", "-1", "abc", "0.001", "12,50", "100000"]),
        esMuestra: r() < 0.5,
        cantidades: {},
      };
      const c = celdas(b);
      b.cantidades = Object.fromEntries(c.map((x) => [x.clave, elegir(["5", "5", "5", "", "0", "1.5", "abc"])]));
      const costos = { tela: elegir(["", "", "700", "12,50"]), avios: elegir(["", "", "140", "S/ 5"]), maquila: elegir(["", "", "0", "-1"]) };
      const problemas = problemasDelModelo(b, c, costos);
      const campos = camposDeGuiaOrden({ esNuevo: true, hayModelo: true, borrador: b, celdas: c, totalExistente: 0, costos });
      expect(sePuedeConfirmar(campos), JSON.stringify(b)).toBe(problemas.length === 0);
      expect(faltanDe(campos).map((x) => x.id), JSON.stringify(b)).toEqual(problemas.map((p) => p.campo));
      if (problemas.length === 0) completos += 1;
    }
    // Que el azar de verdad llegue a «todo en orden» (si no, la coincidencia solo se probaría en los casos con faltas).
    expect(completos).toBeGreaterThan(15);
  });
});

describe("«Modelo nuevo»: lo obligatorio primero, el color después y cerrado (/formidable 2026-10-10, cambio 1)", () => {
  const leer = (ruta: string) => readFileSync(join(__dirname, "..", ruta), "utf8");
  it("el precio va ANTES de los colores (la guía ya lo pide antes: nombre, categoría, tallas, precio, cantidades) y la carta de 89 círculos arranca cerrada", () => {
    const campos = leer("components/ModeloNuevoCampos.tsx");
    expect(campos.indexOf('<CampoGuiado id="precio"')).toBeGreaterThan(-1);
    expect(campos.indexOf('<CampoGuiado id="precio"')).toBeLessThan(campos.indexOf("<ElegirColores"));
    expect(campos).toMatch(/<ElegirColores[^>]*cartaAbierta=\{false\}/);
  });
  it("Nuevo producto y los demás siguen con la carta abierta de entrada (ADR-0312/0314): el valor por defecto de `cartaAbierta` es true", () => {
    const elegir = leer("components/alta-producto/ElegirColores.tsx");
    expect(elegir).toMatch(/cartaAbierta = true/);
    expect(elegir).toMatch(/useState\(cartaAbierta\)/);
  });
  it("el orden de la guía de foco es el de la pantalla (los colores no son un paso: son opcionales)", () => {
    const b = conCantidades(borrador({ nombre: "", precio: "" }), "");
    const ids = camposDeGuiaOrden({ esNuevo: true, hayModelo: true, borrador: b, celdas: celdas(b), totalExistente: 0 }).map((c) => c.id);
    expect(ids).toEqual(["nombre", "categoria", "tallas", "precio", "cantidades", "costos"]);
  });
});

describe("el formulario de Nueva orden", () => {
  it("ningún <Boton> de adentro envía el formulario sin querer: todos llevan type=\"button\" (sin él, «Usar ese modelo» volvía a crear la orden)", () => {
    const fuente = readFileSync(join(__dirname, "..", "components", "NuevaOrdenProduccionForm.tsx"), "utf8");
    const aperturas = [...fuente.matchAll(/<Boton\b[^>]*>/g)].map((m) => m[0]);
    expect(aperturas.length).toBeGreaterThan(0);
    for (const a of aperturas) expect(a, a).toContain('type="button"');
  });
});

