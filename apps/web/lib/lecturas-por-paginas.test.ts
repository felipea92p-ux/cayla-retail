import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FILAS_POR_PAGINA, IDS_POR_TANDA, leerPorTandasDeIds } from "./resultado";
import { leerRpcPorPaginas, ORDEN_FN_EXISTENCIAS } from "./rpc-por-paginas";
import { leerPreciosPropiosDeSede } from "./precios-propios-de-sede";
import { ORDEN_REGISTRO_COMPRAS, ORDEN_REGISTRO_VENTAS } from "./impuestos-reglas";
import { ORDEN_DIARIO } from "./resultados-reglas";

// Las lecturas que pasan de 1.000 filas o de unos cientos de ids (PostgREST corta en silencio, 2026-10-23): ver `rpc-por-paginas.ts`,
// `precios-propios-de-sede.ts` y `leerPorTandasDeIds`.

/** Un `supabase.rpc(...)` que sirve N filas como PostgREST: corta cada respuesta en FILAS_POR_PAGINA, sin error, y anota el orden que se le pide. */
function clienteConFilas(filas: number) {
  const tabla = Array.from({ length: filas }, (_, i) => ({ variante_id: `v${String(i).padStart(5, "0")}`, precio: 50 + (i % 7) }));
  const pedidos: { nombre: string; args: object; orden: string[] }[] = [];
  const rpc = vi.fn<(nombre: string, args: object) => unknown>((nombre, args) => {
    const pedido = { nombre, args, orden: [] as string[] };
    pedidos.push(pedido);
    const constructor = {
      order: (columna: string) => {
        pedido.orden.push(columna);
        return constructor;
      },
      range: async (desde: number, hasta: number) => ({ data: tabla.slice(desde, Math.min(hasta + 1, desde + FILAS_POR_PAGINA)), error: null }),
    };
    return constructor;
  });
  return { rpc, pedidos };
}

describe("leerRpcPorPaginas", () => {
  it("trae todas las filas de una RPC que pasa de 1.000 (un mes de diario: ~5.400 líneas)", async () => {
    const cliente = clienteConFilas(5400);
    const { data, error } = await leerRpcPorPaginas(cliente as never, "fn_diario", { p_desde: "2026-10-01", p_hasta: "2026-10-31" }, ORDEN_DIARIO, { enParalelo: 1 });
    expect(error).toBeNull();
    expect(data).toHaveLength(5400);
    expect(new Set(data!.map((f) => f.variante_id)).size).toBe(5400);
  });

  it("pide cada página con el orden completo y los mismos argumentos", async () => {
    const cliente = clienteConFilas(1090);
    await leerRpcPorPaginas(cliente as never, "fn_impuestos_registro_ventas", { p_mes: "2026-10-01" }, ORDEN_REGISTRO_VENTAS, { enParalelo: 1 });
    expect(cliente.pedidos).toHaveLength(2);
    for (const pedido of cliente.pedidos) {
      expect(pedido.nombre).toBe("fn_impuestos_registro_ventas");
      expect(pedido.args).toEqual({ p_mes: "2026-10-01" });
      expect(pedido.orden).toEqual([...ORDEN_REGISTRO_VENTAS]);
    }
  });

  it("una página con error corta la lectura: media lista nunca se entrega como lista entera", async () => {
    const constructor = { order: () => constructor, range: async () => ({ data: null, error: { message: "se cayó", code: "XX000" } }) };
    const rpc = vi.fn(() => constructor);
    const { data, error } = await leerRpcPorPaginas({ rpc } as never, "fn_diario", {}, ORDEN_DIARIO);
    expect(data).toBeNull();
    expect(error?.message).toBe("se cayó");
  });

  it("los órdenes de los registros del contador y del diario desempatan por lo que identifica cada fila", () => {
    expect(ORDEN_REGISTRO_VENTAS.slice(0, 4)).toEqual(["fecha", "tipo", "serie", "numero"]);
    expect(ORDEN_REGISTRO_COMPRAS).toEqual(expect.arrayContaining(["fecha", "tipo", "serie", "numero", "proveedor_ruc"]));
    expect(ORDEN_DIARIO).toEqual(expect.arrayContaining(["fecha", "asiento", "cuenta", "debe", "haber", "origen_id"]));
    expect(ORDEN_FN_EXISTENCIAS).toEqual(["variante_id", "ubicacion_id"]);
  });
});

describe("leerPreciosPropiosDeSede", () => {
  it("trae todos los precios propios de la tienda aunque pasen de 1.000", async () => {
    const cliente = clienteConFilas(1245);
    const { data, error } = await leerPreciosPropiosDeSede(cliente as never, "lim");
    expect(error).toBeNull();
    expect(data).toHaveLength(1245);
    expect(cliente.pedidos[0]).toMatchObject({ nombre: "fn_precios_en_sede", args: { p_ubicacion_id: "lim" }, orden: ["variante_id"] });
  });

  it("si cabe en una página no vuelve a pedir (la caja lo sondea cada 10 s)", async () => {
    const cliente = clienteConFilas(245);
    await leerPreciosPropiosDeSede(cliente as never, "lim");
    expect(cliente.rpc).toHaveBeenCalledTimes(1);
  });
});

describe("leerPorTandasDeIds", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`);

  it("parte 1.161 ids (las prendas de TRU con stock) en tandas de 100 y junta todas las filas", async () => {
    const consulta = vi.fn(async (tanda: string[]) => ({ data: tanda.map((id) => ({ id })), error: null }));
    const { data, error } = await leerPorTandasDeIds(ids(1161), consulta);
    expect(error).toBeNull();
    expect(data).toHaveLength(1161);
    expect(consulta).toHaveBeenCalledTimes(12);
    for (const [tanda] of consulta.mock.calls) expect(tanda.length).toBeLessThanOrEqual(IDS_POR_TANDA);
  });

  it("no repite un id pedido dos veces y respeta un tamaño distinto", async () => {
    const consulta = vi.fn(async (tanda: string[]) => ({ data: tanda, error: null }));
    const { data } = await leerPorTandasDeIds(["a", "b", "a", "c", "b"], consulta, 2);
    expect(data).toEqual(["a", "b", "c"]);
    expect(consulta).toHaveBeenCalledTimes(2);
  });

  it("sin ids no consulta nada y devuelve una lista vacía", async () => {
    const consulta = vi.fn(async (tanda: string[]) => ({ data: tanda, error: null }));
    await expect(leerPorTandasDeIds([], consulta)).resolves.toEqual({ data: [], error: null });
    expect(consulta).not.toHaveBeenCalled();
  });

  it("una tanda con error corta la lectura: media lista nunca se entrega como lista entera", async () => {
    const consulta = vi.fn(async (tanda: string[]) => (tanda[0] === "id-100" ? { data: null, error: { message: "URI demasiado larga" } } : { data: tanda, error: null }));
    const { data, error } = await leerPorTandasDeIds(ids(250), consulta);
    expect(data).toBeNull();
    expect(error?.message).toBe("URI demasiado larga");
  });
});

describe("nadie lee de un solo golpe lo que pasa de 1.000 filas", () => {
  // Estas RPC devuelven una fila por prenda, comprobante o línea de diario: una llamada suelta se corta en 1.000. Se leen con
  // `leerRpcPorPaginas` (o su lector propio). `fn_existencias` con `p_producto_ids` (Buscar) está acotada por esos productos.
  const RAIZ = join(__dirname, "..");
  const POR_PAGINAS = ["fn_precios_en_sede", "fn_impuestos_registro_ventas", "fn_impuestos_registro_compras", "fn_diario", "fn_existencias", "fn_gastos_lista"];
  const ACOTADAS = new Set([join("app", "(app)", "buscar", "page.tsx")]);

  function archivos(dir: string): string[] {
    return readdirSync(dir).flatMap((nombre) => {
      if (nombre === "node_modules" || nombre === ".next") return [];
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) return archivos(ruta);
      return /\.(ts|tsx)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) ? [ruta] : [];
    });
  }

  it.each(POR_PAGINAS)("ningún archivo llama .rpc(\"%s\") suelto", (nombre) => {
    const suelta = new RegExp(`\\.rpc\\(\\s*["']${nombre}["']`);
    const sueltas = [...archivos(join(RAIZ, "app")), ...archivos(join(RAIZ, "components")), ...archivos(join(RAIZ, "lib"))]
      .filter((ruta) => !ACOTADAS.has(relative(RAIZ, ruta)) && !ruta.endsWith(join("lib", "rpc-por-paginas.ts")) && !ruta.endsWith(join("lib", "precios-propios-de-sede.ts")))
      .filter((ruta) => suelta.test(readFileSync(ruta, "utf8")))
      .map((ruta) => relative(RAIZ, ruta));
    expect(sueltas).toEqual([]);
  });
});
