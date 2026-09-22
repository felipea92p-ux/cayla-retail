import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AVIARIO } from "../../../scripts/datos/aviario.mjs";
import {
  ACCIONES_NUEVO,
  ARBOL,
  COLUMNAS_MOVIL,
  PAJAROS,
  PERMISOS,
  TIPOS_TERMINAL,
  TIPOS_UBICACION,
  esGrupo,
  esGrupoMenu,
  hojasDe,
  menuPara,
  permisosDe,
  puedeVerProduccion,
  rutaActiva,
  type Accion,
  type FilaMenu,
  type FuenteMenu,
  type GrupoMenu,
  type Hoja,
  type Nodo,
  type Permiso,
  type PerfilDelMenu,
  type TipoTerminal,
  type TipoUbicacion,
} from "./menu";

/* ====================================================================
   1. EQUIVALENCIA — el menú de hoy no cambió (paso 1 de «menú a datos»)

   `menu-hoy.golden.json` es la fotografía del menú de ANTES, capturada del AppShell.tsx real de main (commit e14ef82c, ya
   con «Notas de crédito» en Compras; Resumen, Proveedores, Comprobantes, Recibir y Por pagar en Producción; y Compras oculto
   en el Taller): se renderizó a HTML para cada perfil y de ese HTML se leyeron las filas. NO se escribió a mano a partir de `menu.ts` —hacerlo sería
   comparar el árbol contra sí mismo—, y no se regenera para que una prueba en rojo se ponga en verde: cuando un paso del
   rediseño cambia el menú A PROPÓSITO, se cambia esta fotografía a propósito, en el mismo commit y con la aprobación de
   Felipe. Un cambio de fila sin cambio de fotografía es exactamente lo que esta prueba existe para atrapar.
   ==================================================================== */

// Recursivo (D-84): una hija de un grupo dorado puede ser, a su vez, otro grupo dorado (un subgrupo).
type FilaDorada = { etiqueta: string; href: string; icono: string; insignia?: number } | { grupo: string; etiqueta: string; icono: string; insignia?: number; hijos: FilaDorada[] };
type ColumnaDorada = { etiqueta: string; href: string; icono: string; insignia?: number } | { hueco: string };
type Vista = { escritorio: FilaDorada[]; movil: ColumnaDorada[] };
type PerfilDorado = {
  rol: "lider" | "integrante";
  ubicacionTipo: TipoUbicacion;
  conTraslados3: Vista;
  sinTraslados: Vista;
  nuevo: { href: string; etiqueta: string; detalle: string }[];
  grupoActivoPorRuta: Record<string, string | null>;
};
const golden = JSON.parse(readFileSync(new URL("./menu-hoy.golden.json", import.meta.url), "utf8")) as { perfiles: Record<string, PerfilDorado> };

const conInsignia = (n: number | undefined) => (n ? { insignia: n } : {});

function comoEscritorio(riel: FilaMenu[]): FilaDorada[] {
  return riel.map((f) =>
    esGrupoMenu(f)
      ? {
          grupo: f.id,
          etiqueta: f.etiqueta,
          icono: f.icono,
          // La cabecera cerrada muestra la suma de TODAS sus hojas (un subgrupo incluido: el número sube al tope).
          ...conInsignia(hojasDe(f).reduce((acc, h) => acc + (h.contador ?? 0), 0)),
          hijos: comoEscritorio(f.hijos),
        }
      : { etiqueta: f.etiqueta, href: f.href, icono: f.icono, ...conInsignia(f.contador) },
  );
}
const comoMovil = (movil: ReturnType<typeof menuPara>["movil"]): ColumnaDorada[] =>
  movil.map((c) => (c === null ? { hueco: "nuevo" } : { etiqueta: c.etiqueta, href: c.href, icono: c.icono, ...conInsignia(c.contador) }));

const perfilDe = (p: PerfilDorado, trasladosPorAtender?: number | null): PerfilDelMenu => ({
  permisos: permisosDe(p.rol),
  ubicacionTipo: p.ubicacionTipo,
  contadores: { trasladosPorAtender },
});

describe("el menú de hoy sigue igual (línea base capturada del AppShell real)", () => {
  it("la línea base trae los cuatro perfiles pedidos y los dos del almacén", () => {
    expect(Object.keys(golden.perfiles).sort()).toEqual([
      "colaborador-almacen",
      "colaborador-taller",
      "colaborador-tienda",
      "lider-almacen",
      "lider-taller",
      "lider-tienda",
    ]);
  });

  describe.each(Object.entries(golden.perfiles))("%s", (_nombre, p) => {
    it("las filas del lateral, con 3 traslados por atender, son las de hoy: etiquetas, rutas, orden, grupos, íconos e insignias", () => {
      expect(comoEscritorio(menuPara(perfilDe(p, 3)).riel)).toEqual(p.conTraslados3.escritorio);
    });

    it("sin traslados por atender (0, null o sin dato) no hay ninguna insignia y las filas siguen siendo las de hoy", () => {
      for (const sinNumero of [0, null, undefined]) {
        expect(comoEscritorio(menuPara(perfilDe(p, sinNumero)).riel)).toEqual(p.sinTraslados.escritorio);
      }
    });

    it("las 5 columnas de la barra del celular y el hueco del «+» son los de hoy, con y sin insignia", () => {
      expect(comoMovil(menuPara(perfilDe(p, 3)).movil)).toEqual(p.conTraslados3.movil);
      expect(comoMovil(menuPara(perfilDe(p, null)).movil)).toEqual(p.sinTraslados.movil);
    });

    it("las acciones del «+ Nuevo» son las de hoy, con su explicación y en su orden", () => {
      expect(menuPara(perfilDe(p)).nuevo.map(({ href, etiqueta, detalle }) => ({ href, etiqueta, detalle }))).toEqual(p.nuevo);
    });

    it("al aterrizar en cada ruta se abre el mismo grupo que abría antes (incluidos los que este perfil no ve)", () => {
      const menu = menuPara(perfilDe(p));
      const rutas = Object.keys(p.grupoActivoPorRuta);
      expect(Object.fromEntries(rutas.map((r) => [r, menu.grupoDe(r)]))).toEqual(p.grupoActivoPorRuta);
    });
  });
});

/* ====================================================================
   2. INVARIANTES — valen para TODA combinación de permisos y de ubicación, no solo para los 4 perfiles de hoy: el día que
   nazcan Admin y Solo lectura (D-12) el árbol ya está probado contra ellos.
   ==================================================================== */

function subconjuntos(permisos: readonly Permiso[]): Permiso[][] {
  return permisos.reduce<Permiso[][]>((acc, p) => [...acc, ...acc.map((s) => [...s, p])], [[]]);
}
const PERFILES: PerfilDelMenu[] = subconjuntos(PERMISOS).flatMap((permisos) =>
  TIPOS_UBICACION.map((ubicacionTipo) => ({ permisos, ubicacionTipo, contadores: { trasladosPorAtender: 2 } })),
);
const nombreDe = (p: PerfilDelMenu) => `[${p.permisos.join(", ") || "sin permisos"}] en ${p.ubicacionTipo}`;

function recorrer(nodos: readonly Nodo[]): Nodo[] {
  return nodos.flatMap((n) => [n, ...("hijos" in n && n.hijos ? recorrer(n.hijos) : [])]);
}
const TODOS = recorrer(ARBOL);
const VIVOS = TODOS.filter((n) => n.estado === "viva");

// Un destino «vivo» es uno con `page.tsx` real bajo `app/(app)`. Contempla las que solo redirigen (`/produccion`).
const hayPagina = (ruta: string) =>
  ["tsx", "ts"].some((ext) => existsSync(fileURLToPath(new URL(`../app/(app)${ruta === "/" ? "" : ruta}/page.${ext}`, import.meta.url))));

describe("permisos", () => {
  it("el líder tiene todos los permisos y el integrante ninguno", () => {
    expect([...permisosDe("lider")].sort()).toEqual([...PERMISOS].sort());
    expect(permisosDe("integrante")).toEqual([]);
  });

  it("ningún nodo exige un permiso que no existe", () => {
    for (const n of [...TODOS, ...ACCIONES_NUEVO]) {
      for (const p of [n.exige, n.soloSinPermiso]) if (p) expect(PERMISOS, n.id).toContain(p);
    }
  });

  it("en lib/menu.ts ningún nodo pregunta por el rol: el rol solo se mira dentro de `permisosDe`", () => {
    const texto = readFileSync(new URL("./menu.ts", import.meta.url), "utf8");
    expect(texto).not.toMatch(/esLider/);
    const codigo = texto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codigo.match(/\brol\s*===/g)).toHaveLength(1);
  });
});

describe("el aviario: cada nodo cita al pájaro dueño de su dato", () => {
  it("los 14 pájaros del menú son exactamente los del aviario (scripts/datos/aviario.mjs)", () => {
    expect([...PAJAROS]).toEqual(AVIARIO.map((p: { n: string; pajaro: string }) => `${p.n} ${p.pajaro}`));
  });

  it("todo nodo y toda acción de «+ Nuevo» cita uno de los 14", () => {
    for (const n of [...TODOS, ...ACCIONES_NUEVO]) expect(PAJAROS, `${n.id} cita «${n.pajaro}»`).toContain(n.pajaro);
  });

  it("los ids no se repiten", () => {
    const ids = [...TODOS, ...ACCIONES_NUEVO].map((n) => n.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });
});

describe("los nodos futuros: en el árbol para que el aviario quede a la vista, fuera del menú", () => {
  const futuros = new Map(TODOS.filter((n) => n.estado === "futura").map((n) => [n.id, n.pajaro]));

  it("existen los que el rediseño ya nombró, cada uno con su pájaro", () => {
    expect(Object.fromEntries(futuros)).toEqual({
      "produccion.eficiencia": "10 Gallito",
      finanzas: "11 Garza",
      "finanzas.gastos": "11 Garza",
      "finanzas.resultados": "12 Urraca",
      "finanzas.balance": "12 Urraca",
      "finanzas.cierreDeMes": "12 Urraca",
      "finanzas.activos": "12 Urraca",
      clientas: "07 Colibrí",
      configuracion: "01 Ganso",
      "configuracion.accesos": "01 Ganso",
      "configuracion.empresa": "08 Cuervo",
      apartados: "05 Halcón",
      comercial: "13 Águila",
    });
  });

  // Recorre TODA la profundidad (un subgrupo puede tener, a su vez, hijos) — no solo la primera fila y sus hijas.
  const idsDe = (f: FilaMenu): string[] => [f.id, ...(esGrupoMenu(f) ? f.hijos.flatMap(idsDe) : [])];

  it("ningún perfil los ve: ni en el lateral, ni en el celular, ni en «+ Nuevo»", () => {
    for (const perfil of PERFILES) {
      const menu = menuPara(perfil);
      const emitidos = [...menu.riel.flatMap(idsDe), ...menu.movil.flatMap((c) => (c ? [c.id] : []))];
      expect(emitidos.filter((id) => futuros.has(id)), nombreDe(perfil)).toEqual([]);
    }
  });
});

describe("las rutas del menú existen", () => {
  it("toda ruta viva del árbol (pantallas y puertas de módulo) tiene su page.tsx", () => {
    const rutas = VIVOS.flatMap((n) => (n.estado === "viva" && "ruta" in n ? [n.ruta] : n.estado === "viva" && esGrupo(n) ? [n.raiz] : []));
    expect(rutas.length).toBeGreaterThan(15);
    expect(rutas.filter((r) => !hayPagina(r))).toEqual([]);
  });

  it("toda acción de «+ Nuevo» apunta a una ruta viva", () => {
    expect(ACCIONES_NUEVO.filter((a) => !hayPagina(a.ruta)).map((a) => a.ruta)).toEqual([]);
  });
});

// Los topes del menú (regla de diseño, no de código): más filas o más hijas y el lateral deja de leerse de un vistazo. Si una
// pantalla nueva no cabe, se REGRUPA (un subgrupo dentro del grupo, D-84); estos números no se suben para que la prueba pase.
const TOPE_FILAS = 8;
const TOPE_HIJAS = 6;
// Escape documentado para cuando un grupo necesite más margen que el tope general — vacío hoy: Producción lo usó desde
// #231 hasta que D-84/ADR-0155 (2026-09-21) lo regrupó (un subgrupo, «Abastecimiento», en vez de subir el tope), que es
// el remedio esperado, no una excepción a mantener. Vive el mecanismo, no la deuda.
const EXCEPCIONES_TOPE_HIJAS: Record<string, number> = {};
const topeDeHijas = (grupoId: string) => EXCEPCIONES_TOPE_HIJAS[grupoId] ?? TOPE_HIJAS;

// Todos los grupos que hay dentro de `fs`, en cualquier profundidad: un subgrupo (D-84) tiene que cumplir el mismo tope
// y la misma regla de «con una sola hija no agrupa nada» que un grupo de primer nivel — no hay un caso especial para él.
const gruposDe = (fs: readonly FilaMenu[]): GrupoMenu[] => fs.filter(esGrupoMenu).flatMap((f) => [f, ...gruposDe(f.hijos)]);

describe.each(PERFILES.map((p) => [nombreDe(p), p] as const))("forma del menú de %s", (_nombre, perfil) => {
  const menu = menuPara(perfil);
  const hrefs = menu.riel.flatMap(hojasDe).map((h) => h.href);

  it("ninguna ruta aparece dos veces en el lateral", () => {
    expect(hrefs.filter((h, i) => hrefs.indexOf(h) !== i)).toEqual([]);
  });

  it("ningún grupo tiene una sola hija (con una, se muestra como fila suelta), a cualquier profundidad", () => {
    for (const g of gruposDe(menu.riel)) expect(g.hijos.length, g.id).toBeGreaterThanOrEqual(2);
  });

  it(`caben en el tope: ${TOPE_FILAS} filas de primer nivel y ${TOPE_HIJAS} hijas por grupo, a cualquier profundidad`, () => {
    expect(menu.riel.length).toBeLessThanOrEqual(TOPE_FILAS);
    for (const g of gruposDe(menu.riel)) expect(g.hijos.length, g.id).toBeLessThanOrEqual(topeDeHijas(g.id));
  });

  it("la barra del celular tiene 5 columnas: cuatro pantallas y el hueco del «+» al centro", () => {
    expect(menu.movil).toHaveLength(5);
    expect(menu.movil.map((c) => c === null)).toEqual([false, false, true, false, false]);
  });

  it("la ruta de cada fila (a cualquier profundidad) abre el grupo de PRIMER NIVEL que la contiene, y ningún otro se la queda", () => {
    for (const f of menu.riel) {
      if (!esGrupoMenu(f)) continue;
      for (const h of hojasDe(f)) expect(menu.grupoDe(h.href), `${h.etiqueta} (${h.href})`).toBe(f.id);
    }
  });

  it("«Recibir mercadería» vive como MÁXIMO en un grupo: Compras si ve el dinero, Inventario si no, y ninguno si ve el dinero parado en el Taller", () => {
    const dueños = menu.riel.filter(esGrupoMenu).filter((g) => hojasDe(g).some((h) => h.href === "/recibir")).map((g) => g.id);
    const veDinero = perfil.permisos.includes("verDinero");
    expect(dueños.length).toBeLessThanOrEqual(1);
    // El único perfil sin grupo es el del hecho de producto que documenta la sección 3 (PR #219, Felipe 2026-09-21).
    expect(dueños.length === 0).toBe(veDinero && perfil.ubicacionTipo === "taller");
    if (dueños.length === 1) expect(dueños[0]).toBe(veDinero ? "compras" : "inventario");
    // Aterrizar en /recibir abre el módulo que la contiene, se le pinte o no (Compras está oculto en el Taller).
    expect(menu.grupoDe("/recibir")).toBe(veDinero ? "compras" : "inventario");
  });

  it("«+ Nuevo» no repite destinos", () => {
    const destinos = menu.nuevo.map((a) => a.href);
    expect(destinos.filter((d, i) => destinos.indexOf(d) !== i)).toEqual([]);
  });
});

/* ====================================================================
   3. LA REGLA DE PRODUCCIÓN Y DE COMPRAS, absorbida de `produccion-menu.ts` (ADR-0133). Sus pruebas originales
   (`produccion-menu.test.ts`) siguen corriendo sin cambios sobre la vista de compatibilidad; estas las repiten contra el
   árbol directamente.
   ==================================================================== */

const hijosDeGrupo = (perfil: PerfilDelMenu, id: string) => {
  const fila = menuPara(perfil).riel.find((f) => f.id === id);
  return fila && esGrupoMenu(fila) ? fila.hijos.map((h) => h.id) : [];
};
/** Las hijas de un SUBGRUPO (D-84): busca dentro de lo que YA se pintó para `idGrupoTop`, no en `arbol` — si a este
 *  perfil el subgrupo se le disolvió (le quedaba una sola hija visible), no lo encuentra, y eso también es correcto. */
const hijosDeSubgrupo = (perfil: PerfilDelMenu, idGrupoTop: string, idSubgrupo: string) => {
  const top = menuPara(perfil).riel.find((f) => f.id === idGrupoTop);
  const sub = top && esGrupoMenu(top) ? top.hijos.find((h) => h.id === idSubgrupo) : undefined;
  return sub && esGrupoMenu(sub) ? sub.hijos.map((h) => h.id) : [];
};
const LIDER: readonly Permiso[] = permisosDe("lider");
const INTEGRANTE: readonly Permiso[] = permisosDe("integrante");

describe("Producción se ve solo parado en un Taller (Felipe, 2026-09-20), líder incluido", () => {
  // Hasta D-84/ADR-0155 (2026-09-21) el líder contaba SIETE hijas sueltas acá (Resumen, Órdenes, Insumos, Proveedores,
  // Comprobantes, Recibir, Por pagar) — por encima del tope de 6 (deuda declarada desde #231). El regrupo bajó las
  // cuatro de dinero/abastecimiento a un subgrupo, «Abastecimiento»: las dos pruebas de abajo reemplazan a la que
  // antes verificaba las siete sueltas.
  it("en el Taller, el líder ve cuatro hijas de primer nivel: Resumen, Órdenes, Insumos y Abastecimiento; ninguna futura", () => {
    expect(hijosDeGrupo({ permisos: LIDER, ubicacionTipo: "taller" }, "produccion")).toEqual([
      "produccion.resumenProduccion",
      "produccion.ordenes",
      "produccion.insumos",
      "produccion.abastecimiento",
    ]);
  });

  it("Abastecimiento, adentro, tiene las cuatro que antes eran hijas sueltas: Proveedores, Comprobantes, Recibir y Por pagar", () => {
    expect(hijosDeSubgrupo({ permisos: LIDER, ubicacionTipo: "taller" }, "produccion", "produccion.abastecimiento")).toEqual([
      "produccion.proveedoresProduccion",
      "produccion.comprobantesProduccion",
      "produccion.recibirProduccion",
      "produccion.porPagarProduccion",
    ]);
  });

  it("en el Taller, quien trabaja ahí ve Órdenes, Insumos y Recibir, pero no el Resumen ni las pantallas con datos bancarios y montos (D-G)", () => {
    const operativas = ["produccion.ordenes", "produccion.insumos", "produccion.recibirProduccion"];
    // Sin `verDinero`, Abastecimiento se queda con una sola hija visible (Recibir) y se disuelve: sube con su propio
    // nombre (no como «Abastecimiento») — por eso el resultado es idéntico al de antes de D-84, sin el subgrupo de por medio.
    expect(hijosDeGrupo({ permisos: INTEGRANTE, ubicacionTipo: "taller" }, "produccion")).toEqual(operativas);
    // Administrar no abre nada de esto.
    expect(hijosDeGrupo({ permisos: ["administrar"], ubicacionTipo: "taller" }, "produccion")).toEqual(operativas);
  });

  it("`analizar` abre el Resumen (y solo eso); sin `verDinero`, Abastecimiento se disuelve en «Recibir», su única hija visible", () => {
    expect(hijosDeGrupo({ permisos: ["analizar"], ubicacionTipo: "taller" }, "produccion")).toEqual([
      "produccion.resumenProduccion",
      "produccion.ordenes",
      "produccion.insumos",
      "produccion.recibirProduccion",
    ]);
  });

  it("`verDinero` abre Abastecimiento como subgrupo — Proveedores, Comprobantes, Recibir y Por pagar — y no el Resumen (falta `analizar`)", () => {
    expect(hijosDeGrupo({ permisos: ["verDinero"], ubicacionTipo: "taller" }, "produccion")).toEqual([
      "produccion.ordenes",
      "produccion.insumos",
      "produccion.abastecimiento",
    ]);
    expect(hijosDeSubgrupo({ permisos: ["verDinero"], ubicacionTipo: "taller" }, "produccion", "produccion.abastecimiento")).toEqual([
      "produccion.proveedoresProduccion",
      "produccion.comprobantesProduccion",
      "produccion.recibirProduccion",
      "produccion.porPagarProduccion",
    ]);
  });

  it("desde una tienda o un almacén no lo ve nadie, ni el líder", () => {
    for (const permisos of [LIDER, INTEGRANTE]) {
      for (const ubicacionTipo of ["tienda", "almacen"] as const) {
        expect(menuPara({ permisos, ubicacionTipo }).riel.some((f) => f.id === "produccion")).toBe(false);
      }
    }
  });

  it("el menú y la puerta no pueden discrepar: Producción sale exactamente cuando la página abre", () => {
    expect(TIPOS_UBICACION.filter((t) => puedeVerProduccion({ ubicacionTipo: t }))).toEqual(["taller"]);
    for (const perfil of PERFILES) {
      expect(menuPara(perfil).riel.some((f) => f.id === "produccion"), nombreDe(perfil)).toBe(puedeVerProduccion(perfil));
    }
  });
});

describe("Compras es de las tiendas: parado en el Taller no se muestra, ni al líder (Felipe, 2026-09-21, PR #219)", () => {
  it("con `verDinero` ve las cinco pantallas desde una tienda o un almacén, en el orden proveedor → factura → recepción → pago → notas de crédito", () => {
    for (const ubicacionTipo of ["tienda", "almacen"] as const) {
      expect(hijosDeGrupo({ permisos: LIDER, ubicacionTipo }, "compras")).toEqual([
        "compras.proveedores",
        "compras.comprobantes",
        "compras.recibir",
        "compras.porPagar",
        "compras.notasCredito",
      ]);
    }
  });

  it("parado en el Taller el líder NO ve Compras: allí se trabaja Producción", () => {
    expect(menuPara({ permisos: LIDER, ubicacionTipo: "taller" }).riel.some((f) => f.id === "compras")).toBe(false);
  });

  it("HECHO DE PRODUCTO: el líder parado en el Taller no tiene «Recibir mercadería» (Compras e Inventario, /recibir) en el lateral; le queda solo en «+ Nuevo»", () => {
    // Es consecuencia de dos reglas que se cruzan: «Recibir mercadería» vive en Compras para quien ve el dinero, y Compras no se
    // muestra en el Taller. Quien no ve el dinero lo tiene en Inventario, así que no le pasa. Si Felipe decide que el líder en el
    // Taller sí debe verlo en el lateral, se revierte a propósito (p. ej. quitando `soloSinPermiso` de `inventario.recibir`) y
    // esta prueba cambia con esa decisión; no debe ponerse en verde por accidente.
    const menu = menuPara({ permisos: LIDER, ubicacionTipo: "taller" });
    const filas = menu.riel.flatMap(hojasDe);
    expect(filas.map((f) => f.href)).not.toContain("/recibir");
    expect(filas.map((f) => f.etiqueta)).not.toContain("Recibir mercadería");
    expect(menu.nuevo.map((a) => a.href)).toContain("/recibir");
    // Desde una tienda o un almacén sí lo tiene, dentro de Compras.
    for (const ubicacionTipo of ["tienda", "almacen"] as const) {
      expect(hijosDeGrupo({ permisos: LIDER, ubicacionTipo }, "compras")).toContain("compras.recibir");
    }
  });

  it("no se confunden los dos «Recibir»: en el Taller hay otro, el de tela y avíos de Producción (/produccion/recibir), y no reemplaza al de mercadería", () => {
    // `hojasDe` baja hasta las pantallas de verdad sin importar si «Recibir» vive suelta (INTEGRANTE, Abastecimiento
    // disuelto) o dentro del subgrupo Abastecimiento (LIDER, con las 4 hijas visibles).
    const enElTaller = (permisos: readonly Permiso[]) => menuPara({ permisos, ubicacionTipo: "taller" }).riel.flatMap(hojasDe);
    for (const permisos of [LIDER, INTEGRANTE]) {
      const recibir = enElTaller(permisos).filter((f) => f.href === "/produccion/recibir");
      expect(recibir).toEqual([expect.objectContaining({ id: "produccion.recibirProduccion", etiqueta: "Recibir" })]);
    }
    // Y no exige dinero: quien trabaja en el Taller sin verlo también lo tiene.
    expect(enElTaller(INTEGRANTE).map((f) => f.href)).toContain("/produccion/recibir");
    // El de mercadería es otra ruta y otro nodo, con otra etiqueta.
    expect(enElTaller(INTEGRANTE).map((f) => f.href)).toContain("/recibir");
  });

  it("«Notas de crédito» va al final y sin insignia (a propósito: el número ya es la primera cifra del módulo)", () => {
    const { riel } = menuPara({ permisos: LIDER, ubicacionTipo: "tienda", contadores: { trasladosPorAtender: 5 } });
    const compras = riel.find((f) => f.id === "compras");
    const notas = compras && esGrupoMenu(compras) ? compras.hijos.at(-1) : undefined;
    expect(notas).toMatchObject({ id: "compras.notasCredito", href: "/compras/notas-credito" });
    expect(notas && !esGrupoMenu(notas) ? notas.contador : undefined).toBeUndefined();
  });

  it("sin `verDinero` no ve Compras, esté donde esté", () => {
    for (const ubicacionTipo of TIPOS_UBICACION) {
      expect(menuPara({ permisos: INTEGRANTE, ubicacionTipo }).riel.some((f) => f.id === "compras")).toBe(false);
    }
  });

  it("en cada ubicación el líder ve UNO de los dos módulos: Producción en el Taller, Compras en las tiendas y almacenes", () => {
    for (const ubicacionTipo of TIPOS_UBICACION) {
      const ids = menuPara({ permisos: LIDER, ubicacionTipo }).riel.map((f) => f.id);
      expect(ids.filter((id) => id === "produccion" || id === "compras"), ubicacionTipo).toEqual([ubicacionTipo === "taller" ? "produccion" : "compras"]);
    }
  });

  it("Producción y Compras son módulos distintos: ninguna pantalla aparece en los dos", () => {
    // Cada lista se pide donde su módulo SÍ muestra algo (Producción en el Taller, Compras en una tienda): pedida donde sale
    // vacía, la prueba pasaría siempre aunque los dos menús se hubieran mezclado.
    const prod = hijosDeGrupo({ permisos: LIDER, ubicacionTipo: "taller" }, "produccion").map((id) => id.split(".")[1]);
    const comp = hijosDeGrupo({ permisos: LIDER, ubicacionTipo: "tienda" }, "compras").map((id) => id.split(".")[1]);
    expect(prod.length).toBeGreaterThan(0);
    expect(comp.length).toBeGreaterThan(0);
    expect(prod.filter((c) => comp.includes(c))).toEqual([]);
  });
});

/* ====================================================================
   4. LAS REGLAS SUELTAS de `menuPara`, probadas sobre árboles chicos a propósito (así la prueba no depende de cómo esté hoy
   el árbol de verdad).
   ==================================================================== */

const hoja = (id: string, extra: Partial<Hoja> = {}): Hoja => ({ id, etiqueta: id, estado: "viva", ruta: `/${id}`, icono: "inicio", pajaro: "14 Gorrión", ...extra });
const fuente = (arbol: Nodo[], columnas: (string | null)[] = [], acciones: Accion[] = []): FuenteMenu => ({ arbol, columnas, acciones });
const PERFIL_BASE: PerfilDelMenu = { permisos: [], ubicacionTipo: "tienda" };

describe("reglas de menuPara", () => {
  it("un grupo sin hijas visibles no sale; con una sola, sale como fila suelta con el nombre del grupo", () => {
    const grupo = (hijos: Hoja[]): Nodo => ({ id: "g", etiqueta: "Grupo", estado: "viva", icono: "compras", raiz: "/g", pajaro: "14 Gorrión", hijos });
    expect(menuPara(PERFIL_BASE, fuente([grupo([hoja("a", { exige: "verDinero" })])])).riel).toEqual([]);
    const suelta = menuPara(PERFIL_BASE, fuente([grupo([hoja("a"), hoja("b", { exige: "verDinero" })])])).riel;
    expect(suelta).toEqual([{ id: "g", etiqueta: "Grupo", href: "/a", icono: "inicio" }]);
    const doble = menuPara(PERFIL_BASE, fuente([grupo([hoja("a"), hoja("b")])])).riel;
    expect(doble.map((f) => esGrupoMenu(f))).toEqual([true]);
  });

  it("exige, soloSinPermiso y ubicaciones filtran; un nodo futuro nunca sale", () => {
    const arbol: Nodo[] = [
      hoja("libre"),
      hoja("soloConDinero", { exige: "verDinero" }),
      hoja("soloSinDinero", { soloSinPermiso: "verDinero" }),
      hoja("soloTaller", { ubicaciones: ["taller"] }),
      { id: "futuro", etiqueta: "Futuro", estado: "futura", pajaro: "14 Gorrión", nota: "todavía no" },
    ];
    const ids = (perfil: PerfilDelMenu) => menuPara(perfil, fuente(arbol)).riel.map((f) => f.id);
    expect(ids({ permisos: [], ubicacionTipo: "tienda" })).toEqual(["libre", "soloSinDinero"]);
    expect(ids({ permisos: ["verDinero"], ubicacionTipo: "taller" })).toEqual(["libre", "soloConDinero", "soloTaller"]);
  });

  it("las insignias salen solo con un número positivo", () => {
    const arbol: Nodo[] = [hoja("t", { contador: "trasladosPorAtender" })];
    const contador = (n: number | null | undefined) => (menuPara({ ...PERFIL_BASE, contadores: { trasladosPorAtender: n } }, fuente(arbol)).riel[0] as { contador?: number }).contador;
    expect([contador(4), contador(0), contador(-1), contador(null), contador(undefined)]).toEqual([4, undefined, undefined, undefined, undefined]);
  });

  it("una columna del celular que apunta a un grupo lleva a su puerta y suma los números de sus hijas; un hueco es null", () => {
    const arbol: Nodo[] = [
      { id: "g", etiqueta: "Grupo", estado: "viva", icono: "inventario", raiz: "/g", pajaro: "14 Gorrión", hijos: [hoja("a", { contador: "trasladosPorAtender" }), hoja("b")] },
    ];
    const { movil } = menuPara({ ...PERFIL_BASE, contadores: { trasladosPorAtender: 3 } }, fuente(arbol, ["g", null, "a"]));
    expect(movil).toEqual([
      { id: "g", etiqueta: "Grupo", href: "/g", icono: "inventario", contador: 3 },
      null,
      { id: "a", etiqueta: "a", href: "/a", icono: "inicio", contador: 3 },
    ]);
  });

  it("una columna que apunta a algo que este perfil no ve se omite en vez de romper la pantalla", () => {
    const arbol: Nodo[] = [hoja("visible"), hoja("oculta", { exige: "administrar" })];
    expect(menuPara(PERFIL_BASE, fuente(arbol, ["visible", "oculta"])).movil.map((c) => c?.id)).toEqual(["visible"]);
  });

  it("un módulo se abre por su puerta aunque a este perfil no se le pinte (aterrizar ahí cierra los otros grupos)", () => {
    const arbol: Nodo[] = [{ id: "g", etiqueta: "G", estado: "viva", icono: "compras", raiz: "/g", pajaro: "14 Gorrión", ubicaciones: ["taller"], hijos: [hoja("a"), hoja("b")] }];
    const menu = menuPara(PERFIL_BASE, fuente(arbol));
    expect(menu.riel).toEqual([]);
    expect(menu.grupoDe("/g/loquesea")).toBe("g");
  });

  it("«+ Nuevo» respeta el permiso que exige cada acción", () => {
    const acciones: Accion[] = [
      { id: "a", etiqueta: "A", detalle: "d", estado: "viva", ruta: "/a", pajaro: "14 Gorrión" },
      { id: "b", etiqueta: "B", detalle: "d", estado: "viva", ruta: "/b", pajaro: "14 Gorrión", exige: "verDinero" },
    ];
    expect(menuPara(PERFIL_BASE, fuente([], [], acciones)).nuevo.map((a) => a.id)).toEqual(["a"]);
    expect(menuPara({ ...PERFIL_BASE, permisos: ["verDinero"] }, fuente([], [], acciones)).nuevo.map((a) => a.id)).toEqual(["a", "b"]);
  });

  it("rutaActiva: `/` solo coincide consigo misma y un prefijo corta en el límite de un segmento", () => {
    expect(rutaActiva("/", "/")).toBe(true);
    expect(rutaActiva("/vender", "/")).toBe(false);
    expect(rutaActiva("/vender/facturacion", "/vender")).toBe(true);
    expect(rutaActiva("/venderx", "/vender")).toBe(false);
  });

  it("el menú de hoy declara 5 columnas móviles con el hueco del «+» en el centro", () => {
    expect(COLUMNAS_MOVIL).toHaveLength(5);
    expect(COLUMNAS_MOVIL[2]).toBeNull();
  });
});

/* ====================================================================
   Las cuentas TERMINAL (ADR-0159): dos por tienda, compartidas por quien trabaja ahí. La terminal decide QUÉ MÓDULOS hay
   (ventas o administrativa); lo que puede HACER dentro lo dice su permiso (`permisosDe`), que espeja una capacidad de la base.
   El menú de una persona (terminal `null`) no cambia: lo prueban la fotografía de hoy y los invariantes de arriba.
   ==================================================================== */

const etiquetasDe = (riel: FilaMenu[]) => riel.map((f) => f.etiqueta);
const hijasDe = (riel: FilaMenu[], etiqueta: string) => {
  const f = riel.find((x) => x.etiqueta === etiqueta);
  return f && esGrupoMenu(f) ? f.hijos.map((h) => h.etiqueta) : [];
};
const perfilTerminal = (terminal: TipoTerminal, ubicacionTipo: TipoUbicacion = "tienda", extra: readonly Permiso[] = []): PerfilDelMenu => ({
  permisos: [...permisosDe("integrante", terminal), ...extra],
  ubicacionTipo,
  terminal,
});

describe("permisos de una terminal", () => {
  it("la de ventas factura y gestiona la caja; la administrativa ajusta inventario, edita el catálogo y las cuentas de proveedor", () => {
    expect([...permisosDe("integrante", "ventas")].sort()).toEqual(["facturar", "gestionarCaja"]);
    expect([...permisosDe("integrante", "administrativa")].sort()).toEqual(["ajustarInventario", "editarCatalogo", "editarCuentasProveedor"]);
  });

  it("ninguna terminal administra, ve dinero de Compras ni analiza: eso sigue siendo del líder", () => {
    for (const t of TIPOS_TERMINAL) {
      for (const p of ["administrar", "verDinero", "analizar"] as const) expect(permisosDe("integrante", t), `${t} · ${p}`).not.toContain(p);
    }
  });

  it("ninguna terminal recibe el poder del OTRO oficio (las de ventas no ajustan stock ni editan el catálogo, y al revés)", () => {
    expect(permisosDe("integrante", "ventas")).not.toEqual(expect.arrayContaining(["ajustarInventario"]));
    expect(permisosDe("integrante", "ventas")).not.toEqual(expect.arrayContaining(["editarCatalogo"]));
    expect(permisosDe("integrante", "administrativa")).not.toEqual(expect.arrayContaining(["gestionarCaja"]));
    expect(permisosDe("integrante", "administrativa")).not.toEqual(expect.arrayContaining(["facturar"]));
  });

  it("el líder sigue teniendo todos, aunque llegara a traer un tipo de terminal", () => {
    expect([...permisosDe("lider", "ventas")].sort()).toEqual([...PERMISOS].sort());
  });

  it("una persona (sin terminal) no gana ninguno de los poderes nuevos", () => {
    expect(permisosDe("integrante")).toEqual([]);
    expect(permisosDe("integrante", null)).toEqual([]);
  });
});

describe("el menú de la terminal de VENTAS", () => {
  const { riel, movil, nuevo } = menuPara(perfilTerminal("ventas"));

  it("ve solo Ventas: Punto de Venta, Caja, Historial, Cambios, Devoluciones y Facturación, en ese orden", () => {
    expect(etiquetasDe(riel)).toEqual(["Ventas"]);
    expect(hijasDe(riel, "Ventas")).toEqual(["Punto de Venta", "Caja", "Historial", "Cambios", "Devoluciones", "Facturación"]);
  });

  it("no tiene Inicio (su casa es el Punto de Venta), ni Inventario, Catálogo, Compras, Colaboradores ni Producción", () => {
    for (const no of ["Inicio", "Inventario", "Catálogo", "Compras", "Colaboradores", "Producción"]) expect(etiquetasDe(riel)).not.toContain(no);
  });

  it("la barra del celular queda con lo que tiene: Punto de Venta, el «+» y Caja", () => {
    expect(movil.map((c) => (c === null ? "+" : c.etiqueta))).toEqual(["Punto de Venta", "+", "Caja"]);
  });

  it("«+ Nuevo» ofrece vender, cambiar y devolver; nada de inventario ni de compras", () => {
    expect(nuevo.map((a) => a.etiqueta)).toEqual(["Nueva venta", "Registrar cambio", "Registrar devolución"]);
  });
});

describe("el menú de la terminal ADMINISTRATIVA", () => {
  const { riel, nuevo } = menuPara(perfilTerminal("administrativa"));

  it("ve Inicio, Catálogo e Inventario; en Inventario, sin Análisis (es de decisión, del líder) y con Recibir mercadería", () => {
    expect(etiquetasDe(riel)).toEqual(["Inicio", "Catálogo", "Inventario"]);
    expect(hijasDe(riel, "Inventario")).toEqual(["Existencias", "Movimientos", "Traslados", "Conteo", "Recibir mercadería"]);
    expect(hijasDe(riel, "Catálogo")).toEqual(["Productos", "Categorías", "Atributos"]);
  });

  it("hoy NO ve Compras: sin `verDinero` no le queda ninguna pantalla del grupo (llega con ADR-0151, «comprador de tienda»)", () => {
    expect(etiquetasDe(riel)).not.toContain("Compras");
  });

  it("cuando ADR-0151 le dé `verDinero` como comprador de su tienda, Compras aparece SIN tocar el árbol (ya la declara para ella)", () => {
    const conDinero = menuPara(perfilTerminal("administrativa", "tienda", ["verDinero"])).riel;
    expect(etiquetasDe(conDinero)).toContain("Compras");
    // ...y en Compras pierde el duplicado: «Recibir mercadería» vive en UN solo grupo (ADR-0113).
    expect(hijasDe(conDinero, "Inventario")).not.toContain("Recibir mercadería");
  });

  it("no ve Ventas, Colaboradores ni Producción", () => {
    for (const no of ["Ventas", "Colaboradores", "Producción"]) expect(etiquetasDe(riel)).not.toContain(no);
  });

  it("«+ Nuevo» ofrece recibir y mover mercadería; no vender", () => {
    expect(nuevo.map((a) => a.etiqueta)).toEqual(["Recibir mercadería", "Mover mercadería"]);
  });
});

describe("falla cerrado: ninguna terminal ve un nodo que no la declare", () => {
  const porId = new Map<string, { nodo: Nodo; grupo?: Nodo }>();
  for (const n of ARBOL) {
    porId.set(n.id, { nodo: n });
    if ("hijos" in n && n.hijos) for (const h of n.hijos) porId.set(h.id, { nodo: h, grupo: n });
  }
  const declara = (id: string, tipo: TipoTerminal) => {
    const e = porId.get(id);
    const t = e?.nodo.terminales ?? e?.grupo?.terminales;
    return !!t?.includes(tipo);
  };

  it.each(TIPOS_TERMINAL)("con TODOS los permisos y desde cualquier ubicación, la terminal %s solo ve filas que la nombran", (tipo) => {
    for (const ubicacionTipo of TIPOS_UBICACION) {
      const { riel } = menuPara({ permisos: PERMISOS, ubicacionTipo, terminal: tipo });
      for (const fila of riel) {
        const ids = esGrupoMenu(fila) ? fila.hijos.map((h) => h.id) : [fila.id];
        for (const id of ids) expect(declara(id, tipo), `${tipo} en ${ubicacionTipo} ve «${id}» sin que el árbol la nombre`).toBe(true);
      }
    }
  });

  it.each(TIPOS_TERMINAL)("y en «+ Nuevo», la terminal %s solo ve acciones que la nombran", (tipo) => {
    const nombradas = new Set(ACCIONES_NUEVO.filter((a) => a.terminales?.includes(tipo)).map((a) => a.ruta));
    for (const a of menuPara({ permisos: PERMISOS, ubicacionTipo: "tienda", terminal: tipo }).nuevo) expect(nombradas.has(a.href), a.href).toBe(true);
  });

  it("Colaboradores y Producción no las declara ninguna terminal: no se les filtran nunca", () => {
    for (const id of ["colaboradores", "produccion"]) expect(porId.get(id)?.nodo.terminales, id).toBeUndefined();
  });
});
