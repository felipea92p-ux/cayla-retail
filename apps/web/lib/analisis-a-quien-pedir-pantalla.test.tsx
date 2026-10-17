import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PrendaAnalisis, ProveedoresAnalisis } from "./analisis-tipos";

// La tarjeta «A quién pedir» (A8) como sale del servidor: qué dibuja y, sobre todo, cuándo NO dibuja nada. Vitest no resuelve el alias `@/`:
// las piezas puras se entregan por ruta relativa (lo que corre es el código verdadero); el contexto de la pantalla y las piezas de dibujo
// que no importan aquí (el mosaico de la prenda, el «?») van de mentira.
const pantalla = vi.hoisted(() => ({ valor: null as unknown }));
vi.mock("@/components/analisis/contexto", () => ({ useAnalisis: () => pantalla.valor }));
vi.mock("@/components/analisis/piezas", () => ({
  Ayuda: () => <button type="button">?</button>,
  nombreLargo: (p: { nombre: string }) => p.nombre,
  TilePrenda: () => <i />,
  TipRico: () => null,
}));
// Para dibujar la pestaña «Se está acabando» entera: el carril y las piezas de adorno van de mentira; la tarjeta, las reglas y la fila son las de verdad.
vi.mock("@/components/analisis/AQuienPedir", async () => await import("../components/analisis/AQuienPedir"));
vi.mock("@/components/analisis/Carril", () => ({
  Carril: ({ herramienta, grupos, accion, pildoras }: { herramienta: ReactNode; grupos: { prendas: unknown[] }[]; accion: (p: unknown) => ReactNode; pildoras: (p: unknown) => ReactNode }) => (
    <div data-carril="">
      {herramienta}
      {grupos.flatMap((g) => g.prendas).map((p, i) => (
        <div key={i} data-fila="">
          {pildoras(p)}
          {accion(p)}
        </div>
      ))}
    </div>
  ),
}));
vi.mock("@/components/analisis/iconos", () => ({ Icono: () => <i /> }));
vi.mock("@/components/ui/Vacio", () => ({ Vacio: () => null }));
vi.mock("@/components/ui/Aviso", () => ({ Aviso: () => null }));
vi.mock("@/lib/analisis-acciones", async () => await import("./analisis-acciones"));
vi.mock("@/lib/analisis-pedir", async () => await import("./analisis-pedir"));
vi.mock("@/components/ui/VerMas", async () => await import("../components/ui/VerMas"));
vi.mock("@/lib/analisis-reglas", async () => await import("./analisis-reglas"));
vi.mock("@/lib/analisis-acaba", async () => await import("./analisis-acaba"));
vi.mock("@/lib/analisis-a-quien-pedir", async () => await import("./analisis-a-quien-pedir"));

import { AQuienPedir } from "../components/analisis/AQuienPedir";
import { PestanaAcaba } from "../components/analisis/PestanaAcaba";
import { modeloDe } from "./analisis-modelo";

// Datos inventados para la prueba (no son de producción).
function modelo(productoId: string, dias: number) {
  const p: PrendaAnalisis = {
    varianteId: `v-${productoId}`, productoId, nombre: `Modelo ${productoId}`, color: "Lila", colorHex: null, talla: "M", categoria: "Blusas",
    categoriaPrefijo: "BLU", categoriaFamilia: null, fotoUrl: null, precio: 50, costo: 20, origen: null, proveedorId: null, piso: dias,
    almacen: 0, vendidas30: 30, diasDeVentas: 30, semanas: [0, 0, 0, 0, 0, 0, 0, 0], diasSinVender: null, salioAlPiso: null, llego: null,
    llegaron30: 0, vendidasDeLasQueLlegaron30: 0, otras: [], llega: [],
  };
  return modeloDe([p], "2026-10-16");
}

function conProveedores(proveedores: ProveedoresAnalisis | null) {
  pantalla.valor = { datos: { proveedores }, abrirFicha: () => {} };
}

const SEIS: ProveedoresAnalisis = {
  nombres: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`pr${i}`, { nombre: `Proveedor ${i}`, activo: true }])),
  delCatalogo: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`m${i}`, `pr${i}`])),
};

describe("la tarjeta «A quién pedir»", () => {
  it("un proveedor por fila, el más urgente primero, «Sin proveedor» al final y «Ver N más» tras los 4 primeros", () => {
    conProveedores(SEIS);
    // m0..m5 con proveedor (3, 1, 5, 9, 2, 7 días) y uno sin catálogo y agotado: va al final aunque sea lo más urgente.
    const modelos = [modelo("m0", 3), modelo("m1", 1), modelo("m2", 5), modelo("m3", 9), modelo("m4", 2), modelo("m5", 7), modelo("suelto", 0)];
    const html = renderToStaticMarkup(<AQuienPedir modelos={modelos} />);
    const nombres = [...html.matchAll(/<div class="qp-quien"><b>([^<]+)<\/b>/g)].map((m) => m[1]);
    expect(nombres).toEqual(["Proveedor 1", "Proveedor 4", "Proveedor 0", "Proveedor 2", "Proveedor 5", "Proveedor 3", "Sin proveedor"]);
    expect(html).toContain("6 proveedores · 7 modelos");
    expect(html).toContain("proveedor del catálogo");
    expect(html).toContain("falta elegirlo en el catálogo");
    expect(html).toContain("Ver 3 más");
    expect(html).toContain('data-guia="analisis.a-quien-pedir"');
    // Las filas de más existen pero cerradas: no se alcanzan con el teclado.
    expect(html).toMatch(/<div id="[^"]+" class="filas-de-mas ?" inert="">/);
  });

  it("con 4 proveedores o menos no hay «Ver más»", () => {
    conProveedores(SEIS);
    const html = renderToStaticMarkup(<AQuienPedir modelos={[modelo("m0", 3), modelo("m1", 1)]} />);
    expect(html).not.toContain("Ver ");
    expect(html).not.toContain("filas-de-mas");
  });

  it("sin leer los proveedores, o sin nada que pedir, no dibuja nada: nunca «Sin proveedor» por un error", () => {
    conProveedores(null);
    expect(renderToStaticMarkup(<AQuienPedir modelos={[modelo("m0", 3)]} />)).toBe("");
    conProveedores(SEIS);
    expect(renderToStaticMarkup(<AQuienPedir modelos={[]} />)).toBe("");
  });
});

// La pestaña «Se está acabando» entera: la tarjeta no depende del filtro del carril. Los botones del filtro viven DEBAJO de ella; si desapareciera
// al elegir «Por llegar», el carril subiría y los botones se irían de debajo del mouse (ADR-0185, «la página no se encoge bajo el mouse»).
describe("«A quién pedir» dentro de la pestaña «Se está acabando»", () => {
  const HOY = "2026-10-16";
  // Dos modelos que se acaban: uno que llega a tiempo y otro al que no le viene nada.
  const viene = (() => {
    const m = modelo("m0", 3);
    return { ...m, llega: [{ de: "compra" as const, cantidad: 6, fecha: "2026-10-20" }] };
  })();
  const sinNada = modelo("m1", 2);

  function pestana(filtro: "todos" | "comprar" | "llega", proveedores: ProveedoresAnalisis | null = SEIS) {
    pantalla.valor = {
      datos: { prendas: [viene, sinNada], fallas: [], preparacion: [], hoy: HOY, proveedores },
      acceso: { compras: false, produccion: false, pedir: false },
      prendas: [viene, sinNada],
      liquidarDesde: 60,
      filtroAcaba: filtro,
      setFiltroAcaba: () => {},
      diasDeVentas: 30,
      abrirFicha: () => {},
      sedeDe: () => undefined,
    };
    return renderToStaticMarkup(<PestanaAcaba />);
  }
  const tarjeta = (html: string) => html.match(/<section class="tarjeta carril entra"[\s\S]*?<\/section>/)?.[0] ?? null;

  it("sale igual con «Todos», con «Comprar» y con «Por llegar», y solo con lo que todavía no viene en camino", () => {
    const todos = tarjeta(pestana("todos"));
    expect(todos).not.toBeNull();
    expect(todos).toContain("Proveedor 1");
    expect(todos).not.toContain("Proveedor 0");
    expect(tarjeta(pestana("comprar"))).toBe(todos);
    expect(tarjeta(pestana("llega"))).toBe(todos);
  });

  it("si todo viene en camino no hay nada que pedir: no se dibuja, con cualquier filtro", () => {
    for (const f of ["todos", "comprar", "llega"] as const) {
      pantalla.valor = {
        datos: { prendas: [viene], fallas: [], preparacion: [], hoy: HOY, proveedores: SEIS },
        acceso: { compras: false, produccion: false, pedir: false },
        prendas: [viene], liquidarDesde: 60, filtroAcaba: f, setFiltroAcaba: () => {}, diasDeVentas: 30, abrirFicha: () => {}, sedeDe: () => undefined,
      };
      expect(tarjeta(renderToStaticMarkup(<PestanaAcaba />))).toBeNull();
    }
  });

  it("sin leer los proveedores no hay tarjeta ni «Pídelo a …», con ningún filtro", () => {
    for (const f of ["todos", "comprar", "llega"] as const) {
      const html = pestana(f, null);
      expect(tarjeta(html)).toBeNull();
      expect(html).not.toContain("Pídelo a");
    }
  });

  it("la fila dice a la vista que el nombre es del catálogo (un tooltip no se alcanza con el dedo ni con el teclado)", () => {
    const html = pestana("todos");
    expect(html).toContain('<span class="pidelo-q">Pídelo a Proveedor 1</span><span class="pidelo-f">proveedor del catálogo</span>');
  });

  it("con el proveedor de una compra real la fila no dice «del catálogo»", () => {
    const deCompra = { ...sinNada, origen: "terceros" as const, proveedorId: "pr3" };
    pantalla.valor = {
      datos: { prendas: [deCompra], fallas: [], preparacion: [], hoy: HOY, proveedores: SEIS },
      acceso: { compras: false, produccion: false, pedir: false },
      prendas: [deCompra], liquidarDesde: 60, filtroAcaba: "todos", setFiltroAcaba: () => {}, diasDeVentas: 30, abrirFicha: () => {}, sedeDe: () => undefined,
    };
    const html = renderToStaticMarkup(<PestanaAcaba />);
    expect(html).toContain('<span class="pidelo-q">Pídelo a Proveedor 3</span>');
    expect(html).not.toContain("pidelo-f");
  });

  it("el chip de cada modelo de la tarjeta dice también cuántos días le quedan a quien lo lee con un lector de pantalla", () => {
    const html = pestana("todos");
    expect(html).toContain('aria-label="Modelo m1, 2 días: ver su ficha"');
  });
});
