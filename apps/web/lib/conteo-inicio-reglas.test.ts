import { describe, expect, it } from "vitest";
import { conteoResumenDesdeFila, type ConteoResumen, type FilaResumenConteo } from "./conteo-reglas";
import {
  TODA_LA_UBICACION,
  alcanceDeRespuesta,
  armarAlcance,
  arranqueDeRespuesta,
  avisoDeArranque,
  categoriasPorVariantes,
  sufijoVariantes,
  textoUltimoConteo,
  variantesDelConteo,
  type FilaAlcance,
} from "./conteo-inicio-reglas";

const NOMBRES = new Map<string, string>();

function conteo(p: Partial<FilaResumenConteo> & { id: string; numero: number }): ConteoResumen {
  return conteoResumenDesdeFila(
    {
      estado: "cerrado",
      created_at: "2026-09-28T14:00:00Z",
      cerrado_en: "2026-09-28T16:00:00Z",
      sububicacion_id: "piso",
      sububicacion_nombre: "Piso de venta",
      sububicacion_tipo: "piso_venta",
      alcance: "todo",
      alcance_categoria_nombre: null,
      abierto_por: null,
      cerrado_por: null,
      lineas: 10,
      lineas_con_diferencia: 0,
      sistema: 10,
      contado: 10,
      diferencia: 0,
      pendientes: 0,
      parcial: false,
      ...p,
    },
    NOMBRES
  );
}

describe("textoUltimoConteo", () => {
  it("dice el número y el día (en Lima) del último conteo terminado de ese lugar", () => {
    const c = [conteo({ id: "a", numero: 12, cerrado_en: "2026-09-29T03:30:00Z" })];
    // 03:30 UTC es las 22:30 del 28/09 en Lima: el día es el de allá.
    expect(textoUltimoConteo(c, "piso")).toBe("Último conteo: 12 · 28/09");
  });

  it("no mezcla el piso con el almacén", () => {
    const c = [conteo({ id: "a", numero: 12, sububicacion_id: "almacen" })];
    expect(textoUltimoConteo(c, "piso")).toBe("Nunca se contó");
    expect(textoUltimoConteo(c, "almacen")).toMatch(/^Último conteo: 12/);
  });

  it("un cancelado, uno cerrado sin verificar nada y uno en curso no cuentan como «último»", () => {
    const c = [
      conteo({ id: "en-curso", numero: 15, estado: "abierto", cerrado_en: null, lineas: 3, pendientes: 20 }),
      conteo({ id: "anulado", numero: 14, estado: "anulado", cerrado_en: null }),
      conteo({ id: "legado-vacio", numero: 13, lineas: 0, sistema: 0, contado: 0 }),
      conteo({ id: "bueno", numero: 11 }),
    ];
    expect(textoUltimoConteo(c, "piso")).toMatch(/^Último conteo: 11/);
  });

  it("un conteo parcial sí cuenta: verificó una parte", () => {
    const c = [conteo({ id: "p", numero: 9, pendientes: 5, parcial: true })];
    expect(textoUltimoConteo(c, "piso")).toMatch(/^Último conteo: 9/);
  });

  it("sin historial dice «Nunca se contó»; con el historial lleno no afirma tanto", () => {
    expect(textoUltimoConteo([], "piso")).toBe("Nunca se contó");
    const lleno = Array.from({ length: 3 }, (_, i) => conteo({ id: `x${i}`, numero: i + 1, sububicacion_id: "almacen" }));
    expect(textoUltimoConteo(lleno, "piso", 3)).toBe("Sin conteo reciente");
    expect(textoUltimoConteo(lleno, "piso", 20)).toBe("Nunca se contó");
  });
});

// Las filas que devuelve `fn_conteo_alcance` para la escena de `scripts/pruebas/conteo_rediseno.mjs` (la de la prueba de paridad con la foto):
// piso = 3 variantes (2 de camisas, 1 de casacas), almacén = 2 (1 de camisas, 1 de vestidos) y un producto sin categoría en el almacén.
const FILAS: FilaAlcance[] = [
  { sububicacion_id: "piso", categoria_id: "camisas", variantes: 2 },
  { sububicacion_id: "piso", categoria_id: "casacas", variantes: 1 },
  { sububicacion_id: "alm", categoria_id: "camisas", variantes: 1 },
  { sububicacion_id: "alm", categoria_id: "vestidos", variantes: 1 },
  { sububicacion_id: "alm", categoria_id: null, variantes: 1 },
];

describe("armarAlcance / variantesDelConteo", () => {
  const alcance = armarAlcance(FILAS);

  it("«Todo» de un lugar suma todas sus categorías, y el producto sin categoría cuenta en el total", () => {
    expect(variantesDelConteo(alcance, "piso", null)).toBe(3);
    expect(variantesDelConteo(alcance, "alm", null)).toBe(3);
  });

  it("una categoría cuenta solo sus variantes en ESE lugar (piso y almacén no se mezclan)", () => {
    expect(variantesDelConteo(alcance, "piso", "camisas")).toBe(2);
    expect(variantesDelConteo(alcance, "alm", "camisas")).toBe(1);
    expect(variantesDelConteo(alcance, "piso", "vestidos")).toBe(0);
  });

  it("un lugar sin nada registrado da 0, no «no se sabe»", () => {
    expect(variantesDelConteo(alcance, "cuarentena", null)).toBe(0);
    expect(variantesDelConteo(alcance, "cuarentena", "camisas")).toBe(0);
  });

  it("sin la cifra (la función no está en la base o falló) o sin lugar elegido, no se sabe: null, nunca 0", () => {
    expect(variantesDelConteo(null, "piso", null)).toBeNull();
    expect(variantesDelConteo(alcance, null, null)).toBeNull();
    expect(variantesDelConteo(armarAlcance([]), "piso", null)).toBe(0);
  });

  it("una sede que no separa piso y almacén (Taller) cuenta con la fila de «toda la ubicación» (sububicación NULL)", () => {
    const taller = armarAlcance([
      { sububicacion_id: null, categoria_id: "polos", variantes: 4 },
      { sububicacion_id: null, categoria_id: "pantalones", variantes: 2 },
    ]);
    expect(variantesDelConteo(taller, TODA_LA_UBICACION, null)).toBe(6);
    expect(variantesDelConteo(taller, TODA_LA_UBICACION, "polos")).toBe(4);
  });

  it("filas repetidas de una misma categoría se suman en vez de pisarse", () => {
    const a = armarAlcance([
      { sububicacion_id: "piso", categoria_id: "camisas", variantes: 2 },
      { sububicacion_id: "piso", categoria_id: "camisas", variantes: 3 },
    ]);
    expect(variantesDelConteo(a, "piso", "camisas")).toBe(5);
    expect(variantesDelConteo(a, "piso", null)).toBe(5);
  });
});

describe("alcanceDeRespuesta — la cifra es un dato de apoyo", () => {
  it("con la función en la base, arma las cifras y no hay fallo", () => {
    const { alcance, fallo } = alcanceDeRespuesta({ data: FILAS, error: null });
    expect(fallo).toBeNull();
    expect(variantesDelConteo(alcance, "piso", null)).toBe(3);
  });

  it("sin la función en la base (la web salió antes que el SQL): null y el porqué, sin reventar; la tarjeta sale sin cifras", () => {
    const { alcance, fallo } = alcanceDeRespuesta({ data: null, error: { message: "Could not find the function retail.fn_conteo_alcance(p_ubicacion_id) in the schema cache" } });
    expect(alcance).toBeNull();
    expect(fallo).toContain("cuántas variantes trae cada conteo");
    expect(variantesDelConteo(alcance, "piso", null)).toBeNull();
  });

  it("una sede sin nada de stock da un mapa vacío (hay cifras: todas en cero), no null (no se pudieron leer)", () => {
    const { alcance, fallo } = alcanceDeRespuesta({ data: [], error: null });
    expect(fallo).toBeNull();
    expect(alcance).toEqual({});
    expect(variantesDelConteo(alcance, "piso", null)).toBe(0);
  });
});

describe("categoriasPorVariantes", () => {
  const categorias = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const cifras: Record<string, number> = { a: 0, b: 5, c: 0, d: 5 };

  it("las que tienen prendas van primero; con el mismo número, el orden de siempre (por nombre)", () => {
    expect(categoriasPorVariantes(categorias, (id) => cifras[id]).map((c) => c.id)).toEqual(["b", "d", "a", "c"]);
  });

  it("sin cifras no hay nada que ordenar, y no toca la lista original", () => {
    const resultado = categoriasPorVariantes(categorias, null);
    expect(resultado.map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
    expect(resultado).not.toBe(categorias);
    categoriasPorVariantes(categorias, (id) => cifras[id]);
    expect(categorias.map((c) => c.id)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("sufijoVariantes", () => {
  it("arrastra las prendas de «Contar esta prenda» a la ruta del conteo", () => {
    expect(sufijoVariantes([])).toBe("");
    expect(sufijoVariantes(["a"])).toBe("?variantes=a");
    expect(sufijoVariantes(["a", "b"])).toBe("?variantes=a,b");
  });
});

// ADR-0328 (actividad 15): el conteo de arranque. Quién lo es lo decide `cerrar_conteo` (scripts/pruebas/conteo_firma_arranque.mjs);
// esto solo lo anuncia al abrir.
describe("arranqueDeRespuesta", () => {
  it("por lugar: el id de la sububicación, o «toda la ubicación» si la sede no separa piso y almacén", () => {
    const { arranque, fallo } = arranqueDeRespuesta({
      data: [
        { sububicacion_id: "piso", arranque_pendiente: true },
        { sububicacion_id: "alm", arranque_pendiente: false },
      ],
      error: null,
    });
    expect(fallo).toBeNull();
    expect(arranque).toEqual({ piso: true, alm: false });
    expect(arranqueDeRespuesta({ data: [{ sububicacion_id: null, arranque_pendiente: true }], error: null }).arranque).toEqual({ [TODA_LA_UBICACION]: true });
  });

  it("si la función no está en la base o falla, no se dice nada (null), y abrir sigue igual", () => {
    const r = arranqueDeRespuesta({ data: null, error: { message: "function retail.fn_conteo_arranque(uuid) does not exist" } });
    expect(r.arranque).toBeNull();
    expect(r.fallo).toMatch(/conteo de arranque/);
  });
});

describe("avisoDeArranque", () => {
  const arranque = { piso: true, alm: false };
  const base = { arranque, lugarClave: "piso", queCuento: "todo" as const, lugarConArticulo: "el piso de venta" };

  it("contando TODO un lugar que nunca se contó completo: será el de arranque, y dice qué significa y cuándo vale", () => {
    const a = avisoDeArranque(base);
    expect(a?.tipo).toBe("arranque");
    expect(a?.titulo).toBe("Conteo de arranque");
    expect(a?.texto).toMatch(/^Es el primer conteo completo del piso de venta\./);
    expect(avisoDeArranque({ ...base, arranque: { toda: true }, lugarClave: TODA_LA_UBICACION, lugarConArticulo: "esta ubicación" })?.texto).toMatch(/^Es el primer conteo completo de esta ubicación\./);
    expect(a?.texto).toMatch(/no cuentan como pérdida ni bajan la exactitud/);
    expect(a?.texto).toMatch(/Vale si cuentas todo y lo cierras sin pendientes\.$/);
  });

  it("contando una categoría o unas prendas: avisa que así NO es el de arranque y sus diferencias sí son pérdida", () => {
    const cat = avisoDeArranque({ ...base, queCuento: "categoria" });
    expect(cat?.tipo).toBe("no_es_arranque");
    expect(cat?.texto).toBe("El piso de venta nunca se contó completo. Contando solo una categoría, las diferencias sí cuentan como pérdida; si eliges «Todo», será el conteo de arranque.");
    expect(avisoDeArranque({ ...base, queCuento: "prendas" })?.texto).toMatch(/Contando solo unas prendas/);
  });

  it("nada si el lugar ya tuvo su arranque, si falta elegir el lugar o si no se pudo leer", () => {
    expect(avisoDeArranque({ ...base, lugarClave: "alm" })).toBeNull();
    expect(avisoDeArranque({ ...base, lugarClave: "otro" })).toBeNull();
    expect(avisoDeArranque({ ...base, lugarClave: null })).toBeNull();
    expect(avisoDeArranque({ ...base, arranque: null })).toBeNull();
  });
});
