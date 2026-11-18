import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FORMA_COPIA_CATALOGO, leerPorCursor, TOPE_COPIA_BYTES, VARIANTES_POR_PARTE } from "./catalogo-copia-reglas";
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
  it("una parte de variantes con todo lo largo que puede traer una prenda pesan menos de la mitad del tope de 2 MB", () => {
    // Medido en producción el 2026-11-09: ~770 bytes por variante (3.676 variantes = ~2,8 MB en una sola entrada, que no se guardaba).
    // Aquí, una variante más pesada que cualquiera real: URL de foto de 200 letras, nombres largos y tres códigos de barras.
    const larga: Omit<VarianteCatalogo, "marca" | "marcaId"> = {
      varianteId: id(1), sku: "SKU-0000000001", codigo: "BLU-EMMA-ROJ-M-000001", talla: "XXL", color: "Rojo cereza intenso", colorHex: "#aa1122", // tema-fijo: dato de prueba, no un color de pantalla
      colorCodigo: "ROJ", colorTipo: "estampado", tallaId: id(2), categoriaId: id(3), fotoUrl: `https://ejemplo.supabase.co/storage/v1/object/public/${"x".repeat(140)}.webp`,
      fotoPrincipal: `https://ejemplo.supabase.co/storage/v1/object/public/${"y".repeat(140)}.webp`,
      precio: 1299.9, activo: true, productoId: id(4), referencia: "Blusa Emma manga globo con lazo y botones forrados", categoria: "Blusas y camisas",
      categoriaPrefijo: "BLU", categoriaFamilia: "ropa", empresaId: id(5), codigosBarras: ["7750000000001", "7750000000002", "7750000000003"],
    };
    const pagina = JSON.stringify(Array.from({ length: VARIANTES_POR_PARTE }, () => larga));
    expect(new TextEncoder().encode(pagina).length).toBeLessThan(TOPE_COPIA_BYTES / 2);
  });
});

// La forma de la copia (2026-11-13, `cambiar-de-modulo#3`). La llave de la copia ya no lleva el commit: lleva esta huella. Si cambia el código
// que arma una página y la huella no se pone al día, una publicación nueva leería una copia armada con la forma vieja (un campo que falta en
// Vender o en Existencias, sin error a la vista). Se borran los comentarios y se juntan los espacios: cambiar una explicación no cambia la forma.
const fuente = (archivo: string) => readFileSync(new URL(archivo, import.meta.url), "utf8");
const tramo = (texto: string, desde: string, hasta: string) => {
  const i = texto.indexOf(desde);
  if (i < 0) throw new Error(`No se encontró «${desde}»: si se renombró, ajusta esta prueba y la lista de FORMA_COPIA_CATALOGO.`);
  const j = texto.indexOf(hasta, i + desde.length);
  if (j < 0) throw new Error(`No se encontró el final de «${desde}» («${hasta}»).`);
  return texto.slice(i, j + hasta.length);
};
const sinComentarios = (codigo: string) =>
  codigo
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((linea) => linea.replace(/(^|\s)\/\/.*$/, "$1"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

describe("la forma de la copia del catálogo", () => {
  it("FORMA_COPIA_CATALOGO es la huella del código que arma cada página", () => {
    const catalogo = fuente("./catalogo-v2.ts");
    const piezas = [
      tramo(catalogo, "async function paginaDeVariantes(", "\n}\n"),
      tramo(catalogo, 'guardar(["marcas"]', "}).catch(() => null)"),
      tramo(fuente("./producto-fotos-reglas.ts"), "export function fotoDeVariante(", "\n}\n"),
      tramo(fuente("./inventario-reglas.ts"), "export function fotoPrincipal(", "\n}\n"),
      // El tamaño de cada parte también: con otro tamaño, una parte guardada de 800 filas parecería la última y el catálogo quedaría cortado.
      tramo(fuente("./catalogo-copia-reglas.ts"), "export const VARIANTES_POR_PARTE", ";"),
    ];
    const huella = createHash("sha256").update(piezas.map(sinComentarios).join("\n")).digest("hex").slice(0, 16);
    expect(
      FORMA_COPIA_CATALOGO,
      `Cambió cómo se arma la copia del catálogo. Pon FORMA_COPIA_CATALOGO = "${huella}" en lib/catalogo-copia-reglas.ts: la llave cambia sola y nadie lee una copia vieja.`,
    ).toBe(huella);
  });
});
