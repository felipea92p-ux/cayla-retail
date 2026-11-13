import { describe, expect, it } from "vitest";
import { armarFilasStock, detalleDesdeCatalogo, detallesDesdeCatalogo } from "./stock-de-sede-reglas";
import { fotoDeLaFila } from "./color-estampado-reglas";
import { fotoDeVariante, type FotoCruda } from "./producto-fotos-reglas";
import { fotoPrincipal } from "./inventario-reglas";
import type { VarianteCatalogo } from "./catalogo-v2";

const variante = (cambios: Partial<VarianteCatalogo> = {}): VarianteCatalogo => ({
  varianteId: "v1", sku: "", codigo: "BLU-EMMA-ROJ-M", talla: "M", color: "Rojo", colorHex: "#aa1122", // tema-fijo: dato de prueba, no un color de pantalla
  colorTipo: null, colorCodigo: "ROJ", fotoUrl: null, fotoPrincipal: null, precio: 89.9, activo: true, productoId: "p1",
  referencia: "Blusa Emma", categoria: "Blusas", categoriaPrefijo: "BLU", categoriaFamilia: "ropa", codigosBarras: ["7750000000001"],
  ...cambios,
});

const foto = (url: string, color_codigo: string | null, orden: number, es_principal = false): FotoCruda => ({ url, color_codigo, orden, es_principal });

describe("detalleDesdeCatalogo: la misma foto que la lectura con todo embebido", () => {
  // Cada combinación que la fila de stock resolvía con `fotoDeLaFila(color, fotos)`: la copia guarda `fotoDeVariante` y `fotoPrincipal`
  // (como `paginaDeVariantes`) y de ahí tiene que salir lo mismo.
  const juegos: Record<string, FotoCruda[]> = {
    "sin fotos": [],
    "solo una general": [foto("general.webp", null, 1)],
    "la de su color y una principal de otro": [foto("roj.webp", "ROJ", 2), foto("azu.webp", "AZU", 1, true)],
    "solo de otro color": [foto("azu.webp", "AZU", 1)],
    "general y la de su color, sin principal": [foto("general.webp", null, 3), foto("roj.webp", "ROJ", 2)],
  };
  const colores = [
    { nombre: "estampado con su código", color: { codigo: "ROJ", tipo: "estampado" } },
    { nombre: "color liso", color: { codigo: "ROJ", tipo: "solido" } },
    { nombre: "sin tipo", color: { codigo: "ROJ", tipo: null } },
    { nombre: "sin color", color: null },
  ];
  for (const [nombreFotos, fotos] of Object.entries(juegos)) {
    for (const { nombre, color } of colores) {
      it(`${nombreFotos} · ${nombre}`, () => {
        const v = variante({
          colorTipo: color?.tipo ?? null,
          colorCodigo: color?.codigo ?? null,
          fotoUrl: fotoDeVariante(fotos, color?.codigo ?? null),
          fotoPrincipal: fotoPrincipal(fotos),
        });
        const detalle = detalleDesdeCatalogo(v, undefined);
        expect(detalle.fotoUrl).toBe(fotoDeLaFila(color, fotos));
        expect(detalle.colorEstampado).toBe(color?.tipo === "estampado");
      });
    }
  }
});

describe("detalleDesdeCatalogo: el resto de la fila", () => {
  it("el código es el de la etiqueta y, sin él, el sku legado", () => {
    expect(detalleDesdeCatalogo(variante(), undefined).sku).toBe("BLU-EMMA-ROJ-M");
    expect(detalleDesdeCatalogo(variante({ codigo: null, sku: "LEG-001" }), undefined).sku).toBe("LEG-001");
    expect(detalleDesdeCatalogo(variante({ codigo: null, sku: "" }), undefined).sku).toBe("");
  });

  it("el precio propio de la sede gana y lo dice; sin él, el de catálogo y sin la marca", () => {
    expect(detalleDesdeCatalogo(variante(), 79.9)).toMatchObject({ precio: 79.9, precioDeSede: true });
    const general = detalleDesdeCatalogo(variante(), undefined);
    expect(general.precio).toBe(89.9);
    expect("precioDeSede" in general).toBe(false);
  });

  it("sin producto, la referencia queda vacía como en la fila de stock (no «(sin referencia)»)", () => {
    expect(detalleDesdeCatalogo(variante({ productoId: "", referencia: "(sin referencia)" }), undefined).referencia).toBe("");
  });
});

describe("detallesDesdeCatalogo", () => {
  it("una prenda por variante, en el orden de las filas, y las que no están en la copia aparte (nunca se saltan)", () => {
    const filas = [{ variante_id: "v2" }, { variante_id: "v1" }, { variante_id: "v2" }, { variante_id: "v9" }, { variante_id: "v9" }];
    const { detalles, faltan } = detallesDesdeCatalogo(filas, [variante({ varianteId: "v1" }), variante({ varianteId: "v2" })], { v2: 50 });
    expect([...detalles.keys()]).toEqual(["v2", "v1"]);
    expect(detalles.get("v2")?.precio).toBe(50);
    expect(faltan).toEqual(["v9"]);
  });
});

describe("armarFilasStock", () => {
  const sub = (tipo: string | null) => (tipo ? { tipo } : null);
  const fila = (variante_id: string, cantidad: number, tipo: string | null, cantidad_apartada = 0) => ({ variante_id, cantidad, cantidad_apartada, sububicacion: sub(tipo) });

  it("una tienda suma piso y almacén, deja el dañado aparte y muestra también lo que llegó a 0", () => {
    const detalles = new Map([
      ["v1", detalleDesdeCatalogo(variante({ varianteId: "v1", referencia: "Blusa Emma" }), undefined)],
      ["v2", detalleDesdeCatalogo(variante({ varianteId: "v2", referencia: "Abrigo Lía", codigo: "ABR-LIA" }), undefined)],
    ]);
    const filas = armarFilasStock(
      [fila("v1", 2, "piso_venta", 1), fila("v1", 3, "almacen_tienda"), fila("v1", 1, "cuarentena"), fila("v2", 0, "piso_venta")],
      detalles,
    );
    expect(filas.map((f) => f.varianteId)).toEqual(["v2", "v1"]); // por referencia
    expect(filas[1]).toMatchObject({ total: 5, piso: 2, almacen: 3, danado: 1, apartado: 1, disponible: 4 });
    expect(filas[0]).toMatchObject({ total: 0 });
  });

  it("el Taller (sin piso ni almacén) solo muestra lo que tiene", () => {
    const detalles = new Map([
      ["v1", detalleDesdeCatalogo(variante({ varianteId: "v1" }), undefined)],
      ["v2", detalleDesdeCatalogo(variante({ varianteId: "v2" }), undefined)],
    ]);
    const filas = armarFilasStock([fila("v1", 4, null), fila("v2", 0, null)], detalles);
    expect(filas.map((f) => f.varianteId)).toEqual(["v1"]);
    expect(filas[0]).toMatchObject({ total: 4, piso: null, almacen: null });
  });
});
