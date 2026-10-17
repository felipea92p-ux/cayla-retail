import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PartePedido, PrendaAnalisis, ProveedoresAnalisis } from "./analisis-tipos";

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
    pista,
  }: {
    herramienta: ReactNode;
    grupos: { titulo: string; prendas: unknown[]; lote?: ReactNode }[];
    accion: (p: unknown) => ReactNode;
    pildoras: (p: unknown) => ReactNode;
    pista?: (p: unknown) => ReactNode;
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
          {pista?.(p)}
          {pildoras(p)}
          {accion(p)}
        </div>
      ))}
    </div>
  ),
}));
vi.mock("@/components/analisis/iconos", () => ({ Icono: () => <i /> }));
vi.mock("@/components/ui/Vacio", () => ({ Vacio: () => null }));
// El botón «Pedir a X» (A9): un enlace con su clase; el real arrastra combos y posicionamiento que aquí no importan.
vi.mock("@/components/ui/campos", () => ({
  BotonEnlace: ({ href, className, children, ...resto }: { href: string; className?: string; children: ReactNode }) => (
    <a href={href} className={className} {...resto}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/ui/Aviso", () => ({ Aviso: () => null }));
vi.mock("@/components/ui/Chip", async () => await import("../components/ui/Chip"));
vi.mock("@/components/ui/EnlaceVer", async () => await import("../components/ui/EnlaceVer"));
vi.mock("@/components/ui/SegmentoDeslizante", async () => await import("../components/ui/SegmentoDeslizante"));
vi.mock("@/lib/analisis-acciones", async () => await import("./analisis-acciones"));
vi.mock("@/lib/analisis-pedir", async () => await import("./analisis-pedir"));
vi.mock("@/components/ui/VerMas", async () => await import("../components/ui/VerMas"));
vi.mock("@/lib/analisis-reglas", async () => await import("./analisis-reglas"));
vi.mock("@/lib/analisis-acaba", async () => await import("./analisis-acaba"));
vi.mock("@/lib/analisis-ficha", async () => await import("./analisis-ficha"));
vi.mock("@/lib/analisis-a-quien-pedir", async () => await import("./analisis-a-quien-pedir"));
vi.mock("@/lib/analisis-pedido-en-camino-reglas", async () => await import("./analisis-pedido-en-camino-reglas"));

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

const ACCESO = { compras: false, ordenes: false, produccion: false, pedir: false, catalogo: true };
// La tienda que se analiza: a ella llega la orden que abre «Comprar» (`?destino=`).
const SEDE = { id: "tru", codigo: "TRU", nombre: "Tienda TRU", ciudad: "Trujillo" };

function conProveedores(proveedores: ProveedoresAnalisis | null, acceso: Record<string, boolean> = ACCESO) {
  pantalla.valor = { datos: { proveedores, sede: SEDE }, abrirFicha: () => {}, acceso };
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

  // «Pedir a X» (A9, decisión D8): una orden de compra nueva con ese proveedor y SUS modelos, sin cantidades.
  describe("«Pedir a X»", () => {
    const CON_ORDENES = { ...ACCESO, ordenes: true };
    const sinEscape = (html: string) => html.replace(/&amp;/g, "&");

    it("cada proveedor trae su botón, con sus modelos y la tienda; «Sin proveedor» no (a nadie se le pide)", () => {
      conProveedores(
        { nombres: { ...SEIS.nombres, sa: { nombre: "Textil Andino S.A.C.", activo: true } }, delCatalogo: { ...SEIS.delCatalogo, a1: "sa", a2: "sa" } },
        CON_ORDENES,
      );
      const html = sinEscape(limpio(renderToStaticMarkup(<AQuienPedir modelos={[modelo("a1", 2), modelo("a2", 4), modelo("m1", 3), modelo("suelto", 0)]} />)));
      // Un solo botón por proveedor, con todos sus modelos y sin repetir; el nombre sin su sufijo legal y completo en el aria-label.
      expect(html).toContain('href="/compras/ordenes/nueva?prov=sa&destino=tru&modelos=a1,a2&desde=analisis"');
      expect(html).toContain("Pedir a Textil Andino</a>");
      expect(html).toContain('aria-label="Pedir a Textil Andino S.A.C.: abre una orden de compra con 2 modelos, sin cantidades"');
      expect(html).toContain('href="/compras/ordenes/nueva?prov=pr1&destino=tru&modelos=m1&desde=analisis"');
      expect(html.match(/Pedir a /g)).toHaveLength(2 + 2); // dos botones, cada uno con su texto y su aria-label
      expect(html).not.toContain("Pedir a Sin proveedor");
      // No dice cuántas pedir (decisión 7).
      expect(html).not.toMatch(/cantidad=|unidades=/);
    });

    it("sin el módulo Órdenes de compra no hay botón (con Facturas sola abriría «Registrar factura» bajo un «Pedir»)", () => {
      conProveedores(SEIS, { ...CON_ORDENES, ordenes: false, compras: true });
      expect(renderToStaticMarkup(<AQuienPedir modelos={[modelo("m1", 3)]} />)).not.toContain("Pedir a");
    });

    it("el proveedor archivado no se recomienda: sus modelos van a «Sin proveedor» y no traen «Pedir a …»", () => {
      conProveedores({ nombres: { viejo: { nombre: "Tejidos Wari", activo: false } }, delCatalogo: { mv: "viejo" } }, CON_ORDENES);
      const html = renderToStaticMarkup(<AQuienPedir modelos={[modelo("mv", 10)]} />);
      expect(html).not.toContain("Pedir a");
    });
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

  function pestana(filtro: "todos" | "comprar" | "llega", proveedores: ProveedoresAnalisis | null = SEIS, modoInicial?: "dias" | "proveedor", prendas = [viene, sinNada], acceso = ACCESO, pedido: PartePedido[] | null = null) {
    pantalla.valor = {
      datos: { prendas, fallas: [], preparacion: [], hoy: HOY, proveedores, pedido, sede: SEDE },
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

  // Lo ya pedido (A4): una orden se pide por tipo y marca, así que se dice en la fila de «Comprar» de ese TIPO; nunca cambia dónde cae la prenda.
  describe("lo ya pedido en la fila de «Comprar»", () => {
    const orden = (parcial: Partial<PartePedido> = {}): PartePedido => ({ de: "orden", categoria: "Blusas", prefijo: "BLU", marca: "Marca Uno", cantidad: 40, fecha: "2026-11-12", numeros: [12], ...parcial });
    const notas = (html: string) => [...html.matchAll(/<span class="pidelo-q">(Ya pedido[^<]*|Pedido atrasado[^<]*|El proveedor debe[^<]*)<\/span>/g)].map((m) => m[1]);

    it("dice «Ya pedido: 40 Blusas» y cuándo llegan, solo en la fila que sigue en «Comprar»; la que ya viene no lo lleva", () => {
      const html = pestana("todos", SEIS, "dias", [viene, sinNada], ACCESO, [orden()]);
      expect(notas(html)).toEqual(["Ya pedido: 40 Blusas"]);
      expect(html).toContain('<span class="pidelo-f">llegan el 12 nov.</span>');
      expect(html).toContain("Hay una orden abierta de Blusas (de Marca Uno · OC-000012).");
    });

    it("NO cambia en qué grupo cae la prenda: el filtro «Comprar» sigue teniendo la misma fila y la de «Por llegar» la misma", () => {
      const sin = pestana("comprar", SEIS, "dias", [viene, sinNada], ACCESO, null);
      const con = pestana("comprar", SEIS, "dias", [viene, sinNada], ACCESO, [orden()]);
      expect(sin).toContain("<h4>Cómprala <i>1</i></h4>");
      expect(con).toContain("<h4>Cómprala <i>1</i></h4>");
      expect(pestana("llega", SEIS, "dias", [viene, sinNada], ACCESO, [orden()])).toContain("<h4>Ya viene <i>1</i></h4>");
    });

    it("lo que no suma también se dice, sin prometer que llega: sin fecha, atrasado y lo que el proveedor debe", () => {
      expect(notas(pestana("comprar", SEIS, "dias", [sinNada], ACCESO, [orden({ fecha: null })]))).toEqual(["Ya pedido: 40 Blusas"]);
      expect(pestana("comprar", SEIS, "dias", [sinNada], ACCESO, [orden({ fecha: null })])).toContain("sin fecha de entrega");
      expect(notas(pestana("comprar", SEIS, "dias", [sinNada], ACCESO, [orden({ fecha: "2026-10-10" })]))).toEqual(["Pedido atrasado: 40 Blusas"]);
      expect(notas(pestana("comprar", SEIS, "dias", [sinNada], ACCESO, [orden({ de: "reposicion", fecha: null })]))).toEqual(["El proveedor debe 40 Blusas"]);
    });

    it("no dice nada si no hay nada pedido de su tipo, si es de otro tipo, si es solo de la red, o si no se pudo leer (null)", () => {
      for (const pedido of [null, [], [orden({ categoria: "Polos" })], [orden({ de: "taller", marca: null }), orden({ de: "por_repartir" })]]) {
        expect(notas(pestana("comprar", SEIS, "dias", [sinNada], ACCESO, pedido))).toEqual([]);
      }
    });
  });

  // El ritmo con su base (A5) y lo que cuesta esperar (A15): la fila dice con qué venta se calculó el número, y una sola venta no grita en rojo (D6).
  describe("la base del número en la fila (A5 y A15)", () => {
    const una = modelo("u1", 1, { vendidas30: 1, diasDeVentas: 9, nombre: "Blusa Una" });
    const dos = modelo("d1", 4, { vendidas30: 2, diasDeVentas: 7, nombre: "Blusa Dos" });
    const unaAgotada = modelo("u0", 0, { vendidas30: 1, diasDeVentas: 9, nombre: "Blusa Agotada", ultimaVenta: "2026-10-13" });
    const nota = (html: string) => [...html.matchAll(/<span class="pista-nota"[^>]*>(.*?)<\/span>/g)].map((m) => m[1]!.replace(/<\/?b>/g, ""));

    it("cada fila dice «Vendió N en D días» y, con stock, lo peor que puede pasar (el rango, de detalle)", () => {
      const html = pestana("todos", SEIS, "dias", [dos, una]);
      // La de 9 días va antes que la de 14.
      expect(nota(html)).toEqual(["Vendió 1 en 9 días · puede acabarse en 2 días, o durar hasta 85 días", "Vendió 2 en 7 días · puede acabarse en 5 días, o durar hasta 53 días"]);
      expect(html).toContain("<b>puede acabarse en 5 días</b>");
      // El detalle a un toque: el rango entero, sin jerga.
      expect(html).toContain('data-tip="Según lo vendido hasta hoy, te puede durar entre 5 y 53 días."');
      expect(html).not.toMatch(/poisson|80 ?%|intervalo/i);
    });

    it("una sola venta: el chip «Una sola venta» en ámbar, la barra sin rojo y la fila sigue en «Comprar»", () => {
      const html = pestana("comprar", SEIS, "dias", [una, dos]);
      expect(html.match(/Una sola venta/g)).toHaveLength(1);
      expect(html).toContain("bg-ambar/15 text-ambar");
      expect(html).toContain('data-tip="Solo se registró una venta de esta prenda: con tan poco no se sabe el ritmo. Te puede durar entre 2 y 85 días."');
      // La barra de «Una sola venta» (9 días) es ámbar por defecto; la de 14 días de 2 ventas también: ninguna es roja.
      expect(html).not.toContain("--color-rojo-profundo");
      expect(html).toContain("<h4>Cómpralas <i>2</i></h4>");
    });

    it("una sola venta con pocos días no se pinta de rojo, pero la de varias ventas sí (no se cambia el rojo de los demás: eso es A13)", () => {
      const urgenteUna = modelo("u3", 1, { vendidas30: 1, diasDeVentas: 1 });
      const urgenteDos = modelo("d3", 1, { vendidas30: 2, diasDeVentas: 1 });
      expect(pestana("todos", SEIS, "dias", [urgenteUna])).not.toContain("--color-rojo-profundo");
      expect(pestana("todos", SEIS, "dias", [urgenteDos])).toContain("--n:0.07142857142857142;--c:var(--color-rojo-profundo)");
    });

    it("una sola venta agotada va suave (ámbar), dice cuándo fue la última venta y cuánto dejas de ganar por día, sin chip rojo", () => {
      const html = pestana("todos", SEIS, "dias", [unaAgotada]);
      expect(html).toContain('<span class="pista suave">');
      expect(nota(html)).toEqual(["Vendió 1 en 9 días · última venta hace 3 días"]);
      // 1 venta en 9 días a S/ 50 con costo S/ 20: (50 / 1,18 − 20) = S/ 22,37 ÷ 9 = S/ 2,49 por día (~S/ 2).
      expect(html).toContain("Dejas de ganar ~S/\u00a02 por día");
      expect(html).toContain("Una sola venta");
    });

    it("una agotada de varias ventas: «Dejas de ganar» sin el chip, y la pista sigue sin la marca suave", () => {
      const agotada = modelo("a0", 0, { vendidas30: 5, diasDeVentas: 10, ultimaVenta: "2026-10-16" });
      const html = pestana("todos", SEIS, "dias", [agotada]);
      // 5 ventas en 10 días × S/ 22,37 = S/ 11,19 por día (~S/ 11).
      expect(html).toContain("Dejas de ganar ~S/\u00a011 por día");
      expect(html).not.toContain("Una sola venta");
      expect(html).not.toContain("pista suave");
      expect(nota(html)).toEqual(["Vendió 5 en 10 días · última venta hoy"]);
    });

    it("sin costo no inventa la cifra: la fila agotada no dice «Dejas de ganar»", () => {
      const sinCosto = modelo("c0", 0, { vendidas30: 5, diasDeVentas: 10, costo: null });
      expect(pestana("todos", SEIS, "dias", [sinCosto])).not.toContain("Dejas de ganar");
    });

    it("lo que se acaba pero todavía tiene stock no dice «Dejas de ganar» (todavía lo vendes)", () => {
      expect(pestana("todos", SEIS, "dias", [dos])).not.toContain("Dejas de ganar");
    });
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
      datos: { prendas: [viene], fallas: [], preparacion: [], hoy: HOY, proveedores: SEIS, sede: SEDE },
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

  // «Comprar» abre una ORDEN DE COMPRA con el proveedor que la fila dice en «Pídelo a …» (A9, decisión D8).
  describe("«Comprar» y «Comprar todas» abren una orden de compra", () => {
    const CON_ORDENES = { ...ACCESO, ordenes: true };
    const sinEscape = (html: string) => html.replace(/&amp;/g, "&");
    const dos = (a: string, b: string) => [modelo(a, 2), modelo(b, 3)];

    it("«Comprar» de una fila: la orden con el proveedor de la fila (el mismo de «Pídelo a …»), la tienda y el modelo", () => {
      const html = sinEscape(pestana("comprar", SEIS, "dias", [sinNada], CON_ORDENES));
      expect(html).toContain("Pídelo a Proveedor 1");
      expect(html).toContain('href="/compras/ordenes/nueva?prov=pr1&destino=tru&modelos=m1&desde=analisis"');
    });

    it("«Comprar todas»: mismo proveedor, UNA orden con todos los modelos; proveedores distintos, no se abren N órdenes", () => {
      const mismo: ProveedoresAnalisis = { nombres: { pr: { nombre: "Proveedor", activo: true } }, delCatalogo: { a: "pr", b: "pr" } };
      const unica = sinEscape(pestana("comprar", mismo, "dias", dos("a", "b"), CON_ORDENES));
      expect(unica).toContain('href="/compras/ordenes/nueva?prov=pr&destino=tru&modelos=a,b&desde=analisis">Comprar todas</a>');
      // Con una sola orden posible no hay nada que mandar a «Por proveedor».
      expect(unica).not.toContain("Pídelas por proveedor");
      const varios = pestana("comprar", SEIS, "dias", dos("m0", "m1"), CON_ORDENES);
      expect(varios).not.toContain("Comprar todas");
    });

    // El botón que desaparecía sin decir por qué: con varios proveedores no hay UNA orden, y quien compra no sabía dónde se pide a cada uno.
    it("con proveedores distintos, en el lugar de «Comprar todas» sale «Pídelas por proveedor»: un botón (no un enlace) que abre «Por proveedor»", () => {
      for (const f of ["todos", "comprar"] as const) {
        const html = pestana(f, SEIS, "dias", dos("m0", "m1"), CON_ORDENES);
        expect(html).toContain('<button type="button" class="btn-cayla btn-secundario btn-s" title="Son de varios proveedores: ábrelas por proveedor y pide a cada uno">Pídelas por proveedor</button>');
        expect(html).not.toContain("Comprar todas");
      }
      // Es un cambio de forma, no navega ni guarda: ningún enlace junta los dos modelos en una orden (cada fila abre la suya).
      expect(sinEscape(pestana("comprar", SEIS, "dias", dos("m0", "m1"), CON_ORDENES))).not.toContain("modelos=m0,m1");
    });

    it("«Pídelas por proveedor» solo sale donde «Por proveedor» sirve: con Órdenes, con más de un modelo por pedir, con proveedores leídos y fuera de «Ya vienen»", () => {
      const con = (filtro: "todos" | "comprar" | "llega", prov: ProveedoresAnalisis | null, prendas: ReturnType<typeof modelo>[], acceso: typeof ACCESO = CON_ORDENES) =>
        pestana(filtro, prov, "dias", prendas, acceso).includes("Pídelas por proveedor");
      expect(con("comprar", SEIS, dos("m0", "m1"))).toBe(true);
      // Sin Órdenes, «Pedir a X» no existe: no hay a dónde mandarlo (con Facturas sola, tampoco).
      expect(con("comprar", SEIS, dos("m0", "m1"), ACCESO)).toBe(false);
      expect(con("comprar", SEIS, dos("m0", "m1"), { ...ACCESO, compras: true })).toBe(false);
      // Un solo modelo por pedir: «Comprar» de su fila basta.
      expect(con("comprar", SEIS, [modelo("m0", 2)])).toBe(false);
      // Sin proveedores leídos «Por proveedor» no se puede elegir.
      expect(con("comprar", null, dos("m0", "m1"))).toBe(false);
      // Sobre lo que ya viene en camino no se ofrece nada para pedir.
      expect(con("llega", SEIS, dos("m0", "m1"))).toBe(false);
      // Lo que ya viene no cuenta: de dos modelos, uno viene y uno falta, hay uno por pedir.
      expect(con("todos", SEIS, [viene, sinNada])).toBe(false);
    });

    it("la cuenta que ve Facturas y no Órdenes cae en «Registrar factura», como hoy", () => {
      const html = sinEscape(pestana("comprar", SEIS, "dias", [{ ...sinNada, origen: "terceros" as const, proveedorId: "pr1" }], { ...ACCESO, compras: true }));
      expect(html).toContain('href="/compras/nueva?prov=pr1"');
      expect(html).not.toContain("/compras/ordenes/nueva");
    });

    it("sin Órdenes ni Facturas no hay «Comprar»", () => {
      const html = pestana("comprar", SEIS, "dias", [sinNada], ACCESO);
      expect(html).not.toContain(">Comprar<");
      expect(html).not.toContain("Comprar todas");
    });
  });

  it("sin leer los proveedores no hay «Pídelo a …», con ningún filtro", () => {
    for (const f of ["todos", "comprar", "llega"] as const) expect(pestana(f, null)).not.toContain("Pídelo a");
  });
});
