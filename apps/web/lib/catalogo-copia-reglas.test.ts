import { describe, expect, it } from "vitest";
import { leerPorCursor, TOPE_COPIA_BYTES } from "./catalogo-copia-reglas";
import { FILAS_POR_PAGINA } from "./resultado";
import type { VarianteCatalogo } from "./catalogo-v2";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
/** Una base de mentira con `n` filas en orden de id: devuelve las que siguen a `despuesDe`, de a `tamano`, y anota cada pedido. */
const base = (n: number, tamano: number) => {
  const filas = Array.from({ length: n }, (_, i) => ({ id: id(i + 1) }));
  const pedidos: (string | null)[] = [];
  const leer = async (despuesDe: string | null) => {
    pedidos.push(despuesDe);
    return filas.filter((f) => despuesDe === null || f.id > despuesDe).slice(0, tamano);
  };
  return { filas, pedidos, leer };
};

describe("leerPorCursor", () => {
  it("trae todas las filas, en orden, pidiendo cada página después del último id de la anterior", async () => {
    const b = base(2500, 1000);
    const leidas = await leerPorCursor(b.leer, (f) => f.id, 1000);
    expect(leidas).toEqual(b.filas);
    expect(b.pedidos).toEqual([null, id(1000), id(2000)]);
  });

  it("si la última página viene justo llena, pide una más y para con la vacía", async () => {
    const b = base(2000, 1000);
    expect(await leerPorCursor(b.leer, (f) => f.id, 1000)).toHaveLength(2000);
    expect(b.pedidos).toEqual([null, id(1000), id(2000)]);
  });

  it("una lista vacía o más corta que una página se lee de una vez", async () => {
    expect(await leerPorCursor(base(0, 1000).leer, (f) => f.id, 1000)).toEqual([]);
    const b = base(3, 1000);
    expect(await leerPorCursor(b.leer, (f) => f.id, 1000)).toHaveLength(3);
    expect(b.pedidos).toEqual([null]);
  });

  it("si una página no avanza (la base no respetó el orden), se detiene con un error en vez de dar vueltas", async () => {
    const siempreLaMisma = async () => [{ id: id(5) }, { id: id(6) }];
    await expect(leerPorCursor(siempreLaMisma, (f) => f.id, 2)).rejects.toThrow(/no avanzó/);
  });

  it("un error de una página llega a quien lee: no se arma un catálogo a medias", async () => {
    const falla = async (despuesDe: string | null) => {
      if (despuesDe) throw new Error("se cayó la base");
      return Array.from({ length: 2 }, (_, i) => ({ id: id(i + 1) }));
    };
    await expect(leerPorCursor(falla, (f) => f.id, 2)).rejects.toThrow("se cayó la base");
  });
});

describe("cada página guardada cabe en la caché de Vercel", () => {
  it("1.000 variantes con todo lo largo que puede traer una prenda pesan menos de la mitad del tope de 2 MB", () => {
    // Medido en producción el 2026-11-09: ~770 bytes por variante (3.676 variantes = ~2,8 MB en una sola entrada, que no se guardaba).
    // Aquí, una variante más pesada que cualquiera real: URL de foto de 200 letras, nombres largos y tres códigos de barras.
    const larga: Omit<VarianteCatalogo, "marca" | "marcaId"> = {
      varianteId: id(1), sku: "SKU-0000000001", codigo: "BLU-EMMA-ROJ-M-000001", talla: "XXL", color: "Rojo cereza intenso", colorHex: "#aa1122", // tema-fijo: dato de prueba, no un color de pantalla
      colorCodigo: "ROJ", tallaId: id(2), categoriaId: id(3), fotoUrl: `https://ejemplo.supabase.co/storage/v1/object/public/${"x".repeat(140)}.webp`,
      precio: 1299.9, activo: true, productoId: id(4), referencia: "Blusa Emma manga globo con lazo y botones forrados", categoria: "Blusas y camisas",
      categoriaPrefijo: "BLU", categoriaFamilia: "ropa", empresaId: id(5), codigosBarras: ["7750000000001", "7750000000002", "7750000000003"],
    };
    const pagina = JSON.stringify(Array.from({ length: FILAS_POR_PAGINA }, () => larga));
    expect(new TextEncoder().encode(pagina).length).toBeLessThan(TOPE_COPIA_BYTES / 2);
  });
});
