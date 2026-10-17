import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PrendaAnalisis, ProveedoresAnalisis } from "./analisis-tipos";

// «A quién pedir» (A8, F1) como sale del servidor: es el modo «Por proveedor» de la pestaña «Se está acabando» (otra forma de ver la misma lista, no una
// tarjeta encima del carril). Qué dibuja y, sobre todo, cuándo NO dibuja nada. Vitest no resuelve el alias `@/`: las piezas puras se entregan por ruta
// relativa (lo que corre es el código verdadero); el contexto de la pantalla y las piezas de dibujo que no importan aquí (el mosaico de la prenda, el «?»)
// van de mentira.
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
  Carril: ({
    herramienta,
    grupos,
    accion,
    pildoras,
  }: {
    herramienta: ReactNode;
    grupos: { titulo: string; prendas: unknown[]; lote?: ReactNode }[];
    accion: (p: unknown) => ReactNode;
    pildoras: (p: unknown) => ReactNode;
  }) => (
    <div data-carril="">
      {herramienta}
      {grupos.map((g, k) => (
        <h4 key={k}>
          {g.titulo} <i>{g.prendas.length}</i>
          {g.lote}
        </h4>
      ))}
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
vi.mock("@/components/ui/Chip", async () => await import("../components/ui/Chip"));
vi.mock("@/components/ui/EnlaceVer", async () => await import("../components/ui/EnlaceVer"));
vi.mock("@/components/ui/SegmentoDeslizante", async () => await import("../components/ui/SegmentoDeslizante"));
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
function modelo(productoId: string, dias: number, parcial: Partial<PrendaAnalisis> = {}) {
  const p: PrendaAnalisis = {
    varianteId: `v-${productoId}`, productoId, nombre: `Modelo ${productoId}`, color: "Lila", colorHex: null, talla: "M", categoria: "Blusas",
    categoriaPrefijo: "BLU", categoriaFamilia: null, fotoUrl: null, precio: 50, costo: 20, origen: null, proveedorId: null, piso: dias,
    almacen: 0, vendidas30: 30, diasDeVentas: 30, semanas: [0, 0, 0, 0, 0, 0, 0, 0], diasSinVender: null, salioAlPiso: null, llego: null,
    llegaron30: 0, vendidasDeLasQueLlegaron30: 0, otras: [], llega: [], ...parcial,
  };
  return modeloDe([p], "2026-10-16");
}

const ACCESO = { compras: false, produccion: false, pedir: false, catalogo: true };

function conProveedores(proveedores: ProveedoresAnalisis | null, acceso: Record<string, boolean> = ACCESO) {
  pantalla.valor = { datos: { proveedores }, abrirFicha: () => {}, acceso };
}

const SEIS: ProveedoresAnalisis = {
  nombres: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`pr${i}`, { nombre: `Proveedor ${i}`, activo: true }])),
  delCatalogo: Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`m${i}`, `pr${i}`])),
};

/** El HTML sin los comentarios que React deja entre un texto y su vecino. */
const limpio = (html: string) => html.replace(/<!-- -->/g, "");
const nombresDeFilas = (html: string) => [...html.matchAll(/<div class="qp-quien"><b>([^<]+)<\/b>/g)].map((m) => m[1]);

describe("la tarjeta «A quién pedir» (el modo «Por proveedor»)", () => {
  it("un proveedor por fila, el más urgente primero, «Ver N más» tras los 4 primeros y «Sin proveedor» al final", () => {
    conProveedores(SEIS);
    // m0..m5 con proveedor (3, 1, 5, 9, 2, 7 días) y uno sin catálogo y agotado: va al final aunque sea lo más urgente.
    const modelos = [modelo("m0", 3), modelo("m1", 1), modelo("m2", 5), modelo("m3", 9), modelo("m4", 2), modelo("m5", 7), modelo("suelto", 0)];
    const html = renderToStaticMarkup(<AQuienPedir modelos={modelos} />);
    expect(nombresDeFilas(html)).toEqual(["Proveedor 1", "Proveedor 4", "Proveedor 0", "Proveedor 2", "Proveedor 5", "Proveedor 3", "Sin proveedor"]);
    // Dice de qué habla: lo que aún no viene (no toda la lista de abajo).
    expect(html).toContain("Lo que aún no viene: 6 modelos de 6 proveedores y 1 sin proveedor");
    expect(html).toContain("anotado en su ficha");
    expect(html).toContain("falta elegirlo en el catálogo");
    expect(html).toContain("Ver 2 más");
    expect(html).toContain('data-guia="analisis.a-quien-pedir"');
    // Las filas de más existen pero cerradas: no se alcanzan con el teclado.
    expect(html).toMatch(/<div id="[^"]+" class="filas-de-mas ?" inert="">/);
  });

  it("«Sin proveedor» con un agotado NUNCA queda plegado: está fuera de «Ver más», al final, aunque el resto esté cerrado", () => {
    conProveedores(SEIS);
    const modelos = [modelo("m0", 3), modelo("m1", 1), modelo("m2", 5), modelo("m3", 9), modelo("m4", 2), modelo("m5", 7), modelo("suelto", 0)];
    const html = limpio(renderToStaticMarkup(<AQuienPedir modelos={modelos} />));
    // Lo plegado termina donde empieza la fila «Sin proveedor» (que queda FUERA de él): si estuviera adentro, este corte no existiría.
    const plegado = html.match(/class="filas-de-mas ?" inert="">([\s\S]*?)<\/div><\/div><div class="qp-fila sin"/)?.[1];
    expect(plegado).toBeDefined();
    expect(plegado).toContain("Proveedor 5");
    expect(plegado).not.toContain("Sin proveedor");
    // Y está después de lo plegado, antes del botón «Ver 2 más».
    expect(html.indexOf("Sin proveedor")).toBeGreaterThan(html.indexOf("Proveedor 3"));
    expect(html.indexOf("Sin proveedor")).toBeLessThan(html.indexOf("Ver 2 más"));
  });

  it("«Sin proveedor» no cuenta para el tope de 4: con 4 proveedores y uno sin proveedor no hay «Ver más»", () => {
    conProveedores(SEIS);
    const html = renderToStaticMarkup(<AQuienPedir modelos={[modelo("m0", 3), modelo("m1", 1), modelo("m2", 5), modelo("m3", 9), modelo("suelto", 0)]} />);
    expect(nombresDeFilas(html)).toEqual(["Proveedor 1", "Proveedor 0", "Proveedor 2", "Proveedor 3", "Sin proveedor"]);
    expect(html).not.toContain("Ver ");
    expect(html).not.toContain("filas-de-mas");
  });

  it("con 4 proveedores o menos no hay «Ver más»", () => {
    conProveedores(SEIS);
    const html = renderToStaticMarkup(<AQuienPedir modelos={[modelo("m0", 3), modelo("m1", 1)]} />);
    expect(html).not.toContain("Ver ");
    expect(html).not.toContain("filas-de-mas");
  });

  it("«Sin proveedor» lleva a elegirlo: un modelo, a su ficha en Catálogo; varios, a la lista de Productos; sin permiso, a ninguna parte", () => {
    conProveedores(SEIS);
    const uno = limpio(renderToStaticMarkup(<AQuienPedir modelos={[modelo("m0", 3), modelo("suelto", 0)]} />));
    expect(uno).toContain('href="/productos/suelto/editar"');
    expect(uno).toContain("Elegir proveedor");
    // Solo «Sin proveedor» la lleva: el proveedor de verdad no (ahí hay a quién pedirle).
    expect(uno.match(/Elegir proveedor/g)).toHaveLength(1);
    const varios = limpio(renderToStaticMarkup(<AQuienPedir modelos={[modelo("m0", 3), modelo("suelto", 0), modelo("otro", 4)]} />));
    expect(varios).toContain('href="/productos"');
    expect(varios).not.toContain("/editar");
    conProveedores(SEIS, { ...ACCESO, catalogo: false });
    const sinPermiso = limpio(renderToStaticMarkup(<AQuienPedir modelos={[modelo("m0", 3), modelo("suelto", 0)]} />));
    expect(sinPermiso).not.toContain("Elegir proveedor");
    expect(sinPermiso).not.toContain("/productos");
    // La fila sigue diciendo qué falta.
    expect(sinPermiso).toContain("falta elegirlo en el catálogo");
  });

  it("un proveedor ARCHIVADO no se recomienda: sus modelos van a «Sin proveedor» con su motivo y un chip «Archivado»; nunca un grupo con su nombre", () => {
    conProveedores({ nombres: { ...SEIS.nombres, viejo: { nombre: "Tejidos Wari", activo: false } }, delCatalogo: { ...SEIS.delCatalogo, mv: "viejo" } });
    const html = limpio(renderToStaticMarkup(<AQuienPedir modelos={[modelo("m0", 3), modelo("mv", 10)]} />));
    expect(nombresDeFilas(html)).toEqual(["Proveedor 0", "Sin proveedor"]);
    expect(html).toContain("su proveedor está archivado: elige otro");
    expect(html).toContain("Tejidos Wari");
    expect(html).toContain("Archivado");
    // No hay una fila «Tejidos Wari (archivado)» al nivel de los proveedores activos.
    expect(html).not.toContain("(archivado)");
    expect(html).not.toContain("Pídelo a");
  });

  it("dibuja la herramienta que le pasan (el segmento «Por días / Por proveedor») en su cabecera", () => {
    conProveedores(SEIS);
    const html = renderToStaticMarkup(<AQuienPedir modelos={[modelo("m0", 3)]} herramienta={<b data-herramienta="">segmento</b>} />);
    expect(html).toContain('<b data-herramienta="">segmento</b>');
  });

  it("sin leer los proveedores, o sin nada que pedir, no dibuja nada: nunca «Sin proveedor» por un error", () => {
    conProveedores(null);
    expect(renderToStaticMarkup(<AQuienPedir modelos={[modelo("m0", 3)]} />)).toBe("");
    conProveedores(SEIS);
    expect(renderToStaticMarkup(<AQuienPedir modelos={[]} />)).toBe("");
  });

  it("el chip de cada modelo dice también cuántos días le quedan a quien lo lee con un lector de pantalla", () => {
    conProveedores(SEIS);
    const html = renderToStaticMarkup(<AQuienPedir modelos={[modelo("m1", 2)]} />);
    expect(html).toContain('aria-label="Modelo m1, 2 días: ver su ficha"');
  });
});

// La pestaña «Se está acabando» entera. El segmento «Por días / Por proveedor» vive en la cabecera de las dos formas; por días, el carril lleva su título
// según el filtro; por proveedor, «A quién pedir» muestra lo que todavía no viene (la misma regla de «Comprar»).
describe("«A quién pedir» dentro de la pestaña «Se está acabando»", () => {
  const HOY = "2026-10-16";
  // Dos modelos que se acaban: uno que llega a tiempo (en 4 días) y otro al que no le viene nada.
  const viene = (() => {
    const m = modelo("m0", 3);
    return { ...m, llega: [{ de: "compra" as const, cantidad: 6, fecha: "2026-10-20" }] };
  })();
  const sinNada = modelo("m1", 2);

  function pestana(filtro: "todos" | "comprar" | "llega", proveedores: ProveedoresAnalisis | null = SEIS, modoInicial?: "dias" | "proveedor", prendas = [viene, sinNada], acceso = ACCESO) {
    pantalla.valor = {
      datos: { prendas, fallas: [], preparacion: [], hoy: HOY, proveedores },
      acceso: { ...acceso, pedir: false },
      prendas,
      liquidarDesde: 60,
      filtroAcaba: filtro,
      setFiltroAcaba: () => {},
      diasDeVentas: 30,
      abrirFicha: () => {},
      sedeDe: () => undefined,
    };
    return limpio(renderToStaticMarkup(<PestanaAcaba modoInicial={modoInicial} />));
  }
  const tarjeta = (html: string) => html.match(/<section class="tarjeta carril entra"[\s\S]*?<\/section>/)?.[0] ?? null;

  it("abre «Por días»: el carril, con su segmento, y NO una tarjeta encima (empujaba el carril 381 px y a 1024 lo dejaba fuera de la pantalla)", () => {
    const html = pestana("todos");
    expect(html).toContain("data-carril");
    expect(tarjeta(html)).toBeNull();
    expect(html).toContain('role="radiogroup" aria-label="Cómo ver lo que se acaba"');
    expect(html).toContain("Por días");
    expect(html).toContain("Por proveedor");
    expect(html).toMatch(/<button[^>]*role="radio" aria-checked="true"[^>]*data-guia="analisis.acaba-modo-dias"/);
    // Los filtros y el segmento comparten la cabecera; el segmento va a la derecha de todo (no se mueve al cambiar de forma).
    expect(html.indexOf("filtro-a")).toBeLessThan(html.indexOf("segmento-cayla"));
  });

  it("el título del carril sale del FILTRO y su número es el del filtro: Todos «Se están acabando», Comprar «Cómpralas», Por llegar «Ya vienen»", () => {
    expect(pestana("todos")).toContain("<h4>Se están acabando <i>2</i></h4>");
    expect(pestana("comprar")).toContain("<h4>Cómprala <i>1</i></h4>");
    expect(pestana("llega")).toContain("<h4>Ya viene <i>1</i></h4>");
    // Con varios, en plural: tres que se acaban y viene un par.
    const tres = [viene, sinNada, modelo("m2", 4)];
    expect(pestana("comprar", SEIS, "dias", tres)).toContain("<h4>Cómpralas <i>2</i></h4>");
    expect(pestana("todos", SEIS, "dias", tres)).toContain("<h4>Se están acabando <i>3</i></h4>");
  });

  it("«Por proveedor» muestra la tarjeta con lo que todavía no viene en camino, con el mismo segmento (en «Por proveedor»)", () => {
    const html = pestana("todos", SEIS, "proveedor");
    const t = tarjeta(html);
    expect(t).not.toBeNull();
    expect(t).toContain("Proveedor 1");
    expect(t).not.toContain("Proveedor 0");
    expect(t).toContain("Lo que aún no viene: 1 modelo de 1 proveedor");
    expect(html).not.toContain("data-carril");
    expect(t).toMatch(/<button[^>]*role="radio" aria-checked="true"[^>]*data-guia="analisis.acaba-modo-proveedor"/);
    // Sin los filtros: no tienen qué filtrar (la lista de «Por proveedor» es la de «Comprar»).
    expect(t).not.toContain("filtro-a");
  });

  it("«Por proveedor» no cambia con el filtro del carril: la lista es la de «Comprar»", () => {
    const todos = tarjeta(pestana("todos", SEIS, "proveedor"));
    expect(tarjeta(pestana("comprar", SEIS, "proveedor"))).toBe(todos);
    expect(tarjeta(pestana("llega", SEIS, "proveedor"))).toBe(todos);
  });

  it("si todo viene en camino, no hay nada que pedir: «Por proveedor» no se puede elegir (con su razón) y aunque se pida abre «Por días»", () => {
    for (const f of ["todos", "comprar", "llega"] as const) {
      const html = pestana(f, SEIS, "proveedor", [viene]);
      expect(tarjeta(html)).toBeNull();
      expect(html).toContain("data-carril");
      expect(html).toMatch(/role="radio" aria-checked="false" tabindex="-1" disabled="" title="Todo lo que se acaba ya viene en camino: no hay nada que pedir"[^>]*data-guia="analisis.acaba-modo-proveedor"|data-guia="analisis.acaba-modo-proveedor"[^>]*disabled=""/);
    }
  });

  it("sin leer los proveedores no hay tarjeta ni «Pídelo a …» con ningún filtro, y «Por proveedor» dice por qué no se puede elegir", () => {
    for (const f of ["todos", "comprar", "llega"] as const) {
      const html = pestana(f, null, "proveedor");
      expect(tarjeta(html)).toBeNull();
      expect(html).not.toContain("Pídelo a");
      expect(html).not.toContain("Viene de");
      expect(html).toContain("No se pudo leer a qué proveedor se le pide");
    }
  });

  it("la fila dice a la vista de dónde se sabe el nombre, siempre (un tooltip no se alcanza con el dedo ni con el teclado), sin el sufijo legal", () => {
    const html = pestana("todos");
    expect(html).toContain('<span class="pidelo-q">Pídelo a Proveedor 1</span><span class="pidelo-f">anotado en su ficha</span>');
    // El nombre completo, en el tooltip y en el aria-label.
    expect(html).toMatch(/role="group" aria-label="Pídelo a Proveedor 1" data-tip="Pídelo a Proveedor 1\. /);
  });

  it("un nombre con sufijo legal se muestra sin él y completo en su aria-label y su tooltip", () => {
    const conSufijo: ProveedoresAnalisis = { nombres: { x: { nombre: "Textiles Andinos del Perú S.A.C.", activo: true } }, delCatalogo: { m1: "x" } };
    const html = pestana("todos", conSufijo);
    expect(html).toContain('<span class="pidelo-q">Pídelo a Textiles Andinos del Perú</span>');
    expect(html).toContain('aria-label="Pídelo a Textiles Andinos del Perú S.A.C."');
    // Sin un punto doble tras el «S.A.C.» del nombre.
    expect(html).toContain('data-tip="Pídelo a Textiles Andinos del Perú S.A.C. Está anotado en la ficha del modelo');
    expect(html).not.toContain("S.A.C..");
  });

  it("con el proveedor de una compra real la fila dice «le compraste la última vez»", () => {
    const deCompra = { ...sinNada, origen: "terceros" as const, proveedorId: "pr3" };
    const html = pestana("todos", SEIS, "dias", [deCompra]);
    expect(html).toContain('<span class="pidelo-q">Pídelo a Proveedor 3</span><span class="pidelo-f">le compraste la última vez</span>');
    expect(html).not.toContain("anotado en su ficha");
  });

  it("lo que YA viene en camino a tiempo no dice «Pídelo a …» (empujaba a pedirlo dos veces): dice «Viene de …», más tenue, si se sabe de quién; con «Por llegar» también", () => {
    // m0 viene (compra, 6, en 4 días) y su última compra fue a Proveedor 0: de él se sabe.
    const deCompra = { ...viene, origen: "terceros" as const, proveedorId: "pr0" };
    for (const f of ["todos", "llega"] as const) {
      const html = pestana(f, SEIS, "dias", [deCompra, sinNada]);
      expect(html).toContain('<span class="pidelo viene"');
      expect(html).toContain('<span class="pidelo-q">Viene de Proveedor 0</span>');
      expect(html).not.toContain("Pídelo a Proveedor 0");
    }
    // Lo que no viene sigue diciendo a quién pedirlo.
    expect(pestana("todos")).toContain("Pídelo a Proveedor 1");
  });

  it("el proveedor solo ANOTADO en la ficha no se nombra como de quien viene lo que está en camino (la llegada no trae el de su orden)", () => {
    // m0 viene y su proveedor del catálogo es Proveedor 0, pero nadie le compró: no se dice «Viene de Proveedor 0» ni «Pídelo a Proveedor 0».
    for (const f of ["todos", "llega"] as const) {
      const html = pestana(f);
      expect(html).not.toContain("Viene de");
      expect(html).not.toContain("Pídelo a Proveedor 0");
      expect(html).not.toContain('<span class="pidelo viene"');
    }
  });

  it("«Comprar todas» en «Todos» mira solo lo que falta pedir: lo que ya viene en camino no decide adónde lleva", () => {
    const acc = { ...ACCESO, compras: true, produccion: true };
    // Uno que ya viene y se compra a terceros (iría a Compras) y uno que falta y lo hace el Taller (iría a Producción).
    const yaViene = { ...viene, origen: "terceros" as const };
    const falta = { ...sinNada, origen: "taller" as const };
    // Si contara lo que ya viene serían dos destinos y el botón no saldría; sale, y lleva a producir lo que falta.
    const todos = pestana("todos", SEIS, "dias", [yaViene, falta], acc);
    expect(todos).toContain("Comprar todas");
    expect(todos).toContain('<a class="btn-cayla btn-secundario btn-s" href="/produccion/ordenes?nueva=m1">Comprar todas</a>');
    expect(pestana("comprar", SEIS, "dias", [yaViene, falta], acc)).toContain("Comprar todas");
    // Sobre lo que ya viene no se ofrece, con ningún filtro; ni cuando todo lo que se acaba ya viene.
    expect(pestana("llega", SEIS, "dias", [yaViene, falta], acc)).not.toContain("Comprar todas");
    expect(pestana("todos", SEIS, "dias", [yaViene], acc)).not.toContain("Comprar todas");
  });

  it("si no se sabe de quién viene, no dice nada (ni «Pídelo a …» ni un nombre inventado)", () => {
    const sinPr: ProveedoresAnalisis = { nombres: {}, delCatalogo: {} };
    const html = pestana("llega", sinPr);
    expect(html).not.toContain("Viene de");
    expect(html).not.toContain("Pídelo a");
    // Un modelo que viene del Taller sí lo dice, aunque no tenga proveedor.
    const delTaller = { ...viene, llega: [{ de: "taller" as const, cantidad: 6, fecha: null }] };
    expect(pestana("llega", sinPr, "dias", [delTaller])).toContain("Viene del Taller");
  });

  it("sin proveedor, o con uno archivado, la fila no dice «Pídelo a …» sino qué falta", () => {
    const archivado: ProveedoresAnalisis = { nombres: { v: { nombre: "Tejidos Wari", activo: false } }, delCatalogo: { m1: "v" } };
    const a = pestana("comprar", archivado);
    expect(a).not.toContain("Pídelo a");
    expect(a).toContain("Sin proveedor activo");
    expect(a).toContain("su proveedor está archivado: elige otro");
    const nada = pestana("comprar", { nombres: {}, delCatalogo: {} });
    expect(nada).toContain('<span class="pidelo-q">Sin proveedor</span><span class="pidelo-f">falta elegirlo en el catálogo</span>');
  });

  it("la píldora «Por llegar» dice cuándo llega: «en 4 días», «sin fecha»", () => {
    expect(pestana("llega")).toContain('Por llegar <b>6</b><span class="cuando">· en 4 días</span>');
    const sinFecha = { ...viene, llega: [{ de: "compra" as const, cantidad: 20, fecha: null }] };
    expect(pestana("llega", SEIS, "dias", [sinFecha])).toContain('Por llegar <b>20</b><span class="cuando">· sin fecha</span>');
  });

  it("en «Por llegar» no se ofrece «Comprar todas»; el botón de cada fila sigue siendo el secundario (nunca el negro principal)", () => {
    pantalla.valor = {
      datos: { prendas: [viene], fallas: [], preparacion: [], hoy: HOY, proveedores: SEIS },
      acceso: { ...ACCESO, pedir: false, compras: true },
      prendas: [viene],
      liquidarDesde: 60,
      filtroAcaba: "llega",
      setFiltroAcaba: () => {},
      diasDeVentas: 30,
      abrirFicha: () => {},
      sedeDe: () => undefined,
    };
    const html = renderToStaticMarkup(<PestanaAcaba />);
    expect(html).not.toContain("Comprar todas");
    expect(html).toContain("btn-cayla btn-secundario btn-s");
    expect(html).not.toContain("btn-primario");
  });

  it("sin leer los proveedores no hay «Pídelo a …», con ningún filtro", () => {
    for (const f of ["todos", "comprar", "llega"] as const) expect(pestana(f, null)).not.toContain("Pídelo a");
  });
});
