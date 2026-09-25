import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AVIARIO } from "../../../scripts/datos/aviario.mjs";
import {
  ARBOL,
  COLUMNAS_MOVIL,
  PAJAROS,
  PERMISOS,
  TIPOS_UBICACION,
  aterrizajeDe,
  esGrupo,
  esGrupoMenu,
  hojasDe,
  menuPara,
  permisosDe,
  puedeVerProduccion,
  rutaActiva,
  terminalVeInicio,
  type FilaMenu,
  type FuenteMenu,
  type GrupoMenu,
  type Hoja,
  type Nodo,
  type Permiso,
  type PerfilDelMenu,
  type TipoUbicacion,
} from "./menu";
import { MODULOS_DE_HOY, permisosDeModulos, type ClaveModulo } from "./modulos";

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
type ColumnaDorada = { etiqueta: string; href: string; icono: string; insignia?: number };
type Vista = { escritorio: FilaDorada[]; movil: ColumnaDorada[] };
type PerfilDorado = {
  rol: "lider" | "integrante";
  ubicacionTipo: TipoUbicacion;
  conTraslados3: Vista;
  sinTraslados: Vista;
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
  movil.map((c) => ({ etiqueta: c.etiqueta, href: c.href, icono: c.icono, ...conInsignia(c.contador) }));

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

    it("las 4 columnas de la barra del celular son las de hoy, con y sin insignia", () => {
      expect(comoMovil(menuPara(perfilDe(p, 3)).movil)).toEqual(p.conTraslados3.movil);
      expect(comoMovil(menuPara(perfilDe(p, null)).movil)).toEqual(p.sinTraslados.movil);
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
// Los cuatro permisos de Finanzas F3–F10 (ADR-0195) abren cada uno UNA hija del mismo grupo y no se cruzan con ningún otro:
// se prueban juntos (ninguno o los cuatro) y no en sus 16 combinaciones, que multiplicaban por 16 los perfiles (688 mil
// pruebas: el proceso de la prueba se caía). Gastos sigue variando solo, como los demás.
const FINANZAS_JUNTOS: readonly Permiso[] = ["verCuentasDinero", "verReportesFinancieros", "verImpuestos", "cerrarMes"];
const PERFILES: PerfilDelMenu[] = subconjuntos(PERMISOS.filter((p) => !FINANZAS_JUNTOS.includes(p)))
  .flatMap((base) => [base, [...base, ...FINANZAS_JUNTOS]])
  .flatMap((permisos) => TIPOS_UBICACION.map((ubicacionTipo) => ({ permisos, ubicacionTipo, contadores: { trasladosPorAtender: 2 } })));
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
    for (const n of TODOS) {
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

  it("todo nodo cita uno de los 14", () => {
    for (const n of TODOS) expect(PAJAROS, `${n.id} cita «${n.pajaro}»`).toContain(n.pajaro);
  });

  it("los ids no se repiten", () => {
    const ids = TODOS.map((n) => n.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });
});

describe("los nodos futuros: en el árbol para que el aviario quede a la vista, fuera del menú", () => {
  const futuros = new Map(TODOS.filter((n) => n.estado === "futura").map((n) => [n.id, n.pajaro]));

  it("existen los que el rediseño ya nombró, cada uno con su pájaro", () => {
    expect(Object.fromEntries(futuros)).toEqual({
      "produccion.eficiencia": "10 Gallito",
      // Finanzas nació el 2026-09-24 con Gastos (ADR-0195 F2); con el Resumen (F10) ya no le queda ninguna hija futura.
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

  it("ningún perfil los ve: ni en el lateral, ni en el celular", () => {
    for (const perfil of PERFILES) {
      const menu = menuPara(perfil);
      const emitidos = [...menu.riel.flatMap(idsDe), ...menu.movil.map((c) => c.id)];
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

  it("la barra del celular tiene 4 columnas fijas", () => {
    expect(menu.movil).toHaveLength(4);
  });

  it("la ruta de cada fila (a cualquier profundidad) abre el grupo de PRIMER NIVEL que la contiene, y ningún otro se la queda", () => {
    for (const f of menu.riel) {
      if (!esGrupoMenu(f)) continue;
      for (const h of hojasDe(f)) expect(menu.grupoDe(h.href), `${h.etiqueta} (${h.href})`).toBe(f.id);
    }
  });

  it("«Recibir mercadería» vive como MÁXIMO en un grupo: Compras si ve el dinero de Compras, Inventario si no, y ninguno si lo ve parado en el Taller", () => {
    const dueños = menu.riel.filter(esGrupoMenu).filter((g) => hojasDe(g).some((h) => h.href === "/recibir")).map((g) => g.id);
    // Desde 20260923130000 el dinero de Compras es su propio permiso (`verDineroCompras`); `verDinero` quedó para el Taller.
    const veDinero = perfil.permisos.includes("verDineroCompras");
    expect(dueños.length).toBeLessThanOrEqual(1);
    // El único perfil sin grupo es el del hecho de producto que documenta la sección 3 (PR #219, Felipe 2026-09-21).
    expect(dueños.length === 0).toBe(veDinero && perfil.ubicacionTipo === "taller");
    if (dueños.length === 1) expect(dueños[0]).toBe(veDinero ? "compras" : "inventario");
    // Aterrizar en /recibir abre el módulo que la contiene, se le pinte o no (Compras está oculto en el Taller).
    expect(menu.grupoDe("/recibir")).toBe(veDinero ? "compras" : "inventario");
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

  it("`analizar` (el módulo Análisis, 20260923130000) y `verDineroCompras` NO abren nada del Taller: Abastecimiento se disuelve en «Recibir»", () => {
    const operativas = ["produccion.ordenes", "produccion.insumos", "produccion.recibirProduccion"];
    expect(hijosDeGrupo({ permisos: ["analizar"], ubicacionTipo: "taller" }, "produccion")).toEqual(operativas);
    expect(hijosDeGrupo({ permisos: ["verDineroCompras"], ubicacionTipo: "taller" }, "produccion")).toEqual(operativas);
  });

  it("`verDinero` (solo el líder) abre el Resumen —ventas de la red y dinero— y Abastecimiento como subgrupo: Proveedores, Comprobantes, Recibir y Por pagar", () => {
    expect(hijosDeGrupo({ permisos: ["verDinero"], ubicacionTipo: "taller" }, "produccion")).toEqual([
      "produccion.resumenProduccion",
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
  it("con `verDineroCompras` y los cinco módulos ve las cinco pantallas desde una tienda o un almacén, en el orden proveedor → factura → recepción → pago → notas de crédito", () => {
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

  it("HECHO DE PRODUCTO: el líder parado en el Taller no tiene «Recibir mercadería» (Compras e Inventario, /recibir) en ningún menú — la ruta sigue viva, solo sin un link desde ahí", () => {
    // Es consecuencia de dos reglas que se cruzan: «Recibir mercadería» vive en Compras para quien ve el dinero, y Compras no se
    // muestra en el Taller. Quien no ve el dinero lo tiene en Inventario, así que no le pasa. Hasta que se quitó «+ Nuevo» (todas
    // partes, pedido de Felipe) este perfil llegaba igual por ahí; sin ese atajo, /recibir queda sin ningún link para él. Si Felipe
    // decide que el líder en el Taller sí debe verlo en el lateral, se revierte a propósito (p. ej. quitando `soloSinPermiso` de
    // `inventario.recibir`) y esta prueba cambia con esa decisión; no debe ponerse en verde por accidente.
    const menu = menuPara({ permisos: LIDER, ubicacionTipo: "taller" });
    const filas = menu.riel.flatMap(hojasDe);
    expect(filas.map((f) => f.href)).not.toContain("/recibir");
    expect(filas.map((f) => f.etiqueta)).not.toContain("Recibir mercadería");
    expect(menu.movil.map((c) => c.href)).not.toContain("/recibir");
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

  it("sin `verDineroCompras` no ve Compras, esté donde esté", () => {
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
const fuente = (arbol: Nodo[], columnas: string[] = []): FuenteMenu => ({ arbol, columnas });
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

  it("una columna del celular que apunta a un grupo lleva a su puerta y suma los números de sus hijas", () => {
    const arbol: Nodo[] = [
      { id: "g", etiqueta: "Grupo", estado: "viva", icono: "inventario", raiz: "/g", pajaro: "14 Gorrión", hijos: [hoja("a", { contador: "trasladosPorAtender" }), hoja("b")] },
    ];
    const { movil } = menuPara({ ...PERFIL_BASE, contadores: { trasladosPorAtender: 3 } }, fuente(arbol, ["g", "a"]));
    expect(movil).toEqual([
      { id: "g", etiqueta: "Grupo", href: "/g", icono: "inventario", contador: 3 },
      { id: "a", etiqueta: "a", href: "/a", icono: "inicio", contador: 3 },
    ]);
  });

  it("una columna que apunta a algo que este perfil no ve se omite en vez de romper la pantalla", () => {
    const arbol: Nodo[] = [hoja("visible"), hoja("oculta", { exige: "administrar" })];
    expect(menuPara(PERFIL_BASE, fuente(arbol, ["visible", "oculta"])).movil.map((c) => c.id)).toEqual(["visible"]);
  });

  it("un módulo se abre por su puerta aunque a este perfil no se le pinte (aterrizar ahí cierra los otros grupos)", () => {
    const arbol: Nodo[] = [{ id: "g", etiqueta: "G", estado: "viva", icono: "compras", raiz: "/g", pajaro: "14 Gorrión", ubicaciones: ["taller"], hijos: [hoja("a"), hoja("b")] }];
    const menu = menuPara(PERFIL_BASE, fuente(arbol));
    expect(menu.riel).toEqual([]);
    expect(menu.grupoDe("/g/loquesea")).toBe("g");
  });

  it("rutaActiva: `/` solo coincide consigo misma y un prefijo corta en el límite de un segmento", () => {
    expect(rutaActiva("/", "/")).toBe(true);
    expect(rutaActiva("/vender", "/")).toBe(false);
    expect(rutaActiva("/vender/comprobantes", "/vender")).toBe(true);
    expect(rutaActiva("/venderx", "/vender")).toBe(false);
  });

  it("el menú de hoy declara 4 columnas móviles", () => {
    expect(COLUMNAS_MOVIL).toHaveLength(4);
  });
});

/* ====================================================================
   Las cuentas TERMINAL (ADR-0162): aparatos de cada tienda, compartidos por quien trabaja ahí. Desde 20260923040000 no
   tienen TIPO: lo que ven sale de los MÓDULOS de su rol, igual que una persona, y lo que pueden HACER dentro, de los
   permisos que dan esos módulos (`permisosDeModulos`, que espeja las capacidades de la base). Estas pruebas usan los dos
   roles sembrados para terminales («Terminal de ventas» y «Terminal administrativa») y roles a medida.
   El menú de una persona no cambia: lo prueban la fotografía de hoy y los invariantes de arriba.
   ==================================================================== */

const etiquetasDe = (riel: FilaMenu[]) => riel.map((f) => f.etiqueta);
const hijasDe = (riel: FilaMenu[], etiqueta: string) => {
  const f = riel.find((x) => x.etiqueta === etiqueta);
  return f && esGrupoMenu(f) ? f.hijos.map((h) => h.etiqueta) : [];
};
/** Una terminal con el rol sembrado de ese nombre, o con los módulos que se le pasen (un rol a medida). */
const perfilTerminal = (
  rol: "ventas" | "administrativa" | readonly ClaveModulo[],
  ubicacionTipo: TipoUbicacion = "tienda",
  extra: readonly Permiso[] = [],
): PerfilDelMenu => {
  const modulos = typeof rol === "string" ? MODULOS_DE_HOY[rol] : rol.map((clave) => ({ clave, completo: true }));
  return {
    permisos: [...permisosDeModulos("integrante", modulos), ...extra],
    ubicacionTipo,
    terminal: true,
    modulos: modulos.map((m) => m.clave),
  };
};

describe("permisos de una terminal: salen de su rol", () => {
  it("con el rol de ventas factura y gestiona la caja; con el administrativo ajusta inventario, edita el catálogo y las cuentas de proveedor", () => {
    expect([...permisosDeModulos("integrante", MODULOS_DE_HOY.ventas)].sort()).toEqual(["facturar", "gestionarCaja"]);
    expect([...permisosDeModulos("integrante", MODULOS_DE_HOY.administrativa)].sort()).toEqual([
      "ajustarInventario",
      "editarCatalogo",
      "editarCuentasProveedor",
    ]);
  });

  it("ningún rol de terminal administra, ve dinero de Compras ni analiza: eso sigue siendo del líder", () => {
    for (const t of ["ventas", "administrativa"] as const) {
      for (const p of ["administrar", "verDinero", "analizar"] as const) expect(perfilTerminal(t).permisos, `${t} · ${p}`).not.toContain(p);
    }
  });

  it("la regla fija de antes: el líder tiene todos y cualquier otra cuenta ninguno", () => {
    expect([...permisosDe("lider")].sort()).toEqual([...PERMISOS].sort());
    expect(permisosDe("integrante")).toEqual([]);
  });
});

describe("el menú de una terminal con el rol «Terminal de ventas»", () => {
  const { riel, movil } = menuPara(perfilTerminal("ventas"));

  // Apartados no: desde el ADR-0196 es un módulo propio y la siembra de la terminal de ventas no lo trae.
  it("ve solo Ventas: Punto de Venta, Caja, Historial, Posventa (Cambios y Devoluciones) y Comprobantes, en ese orden", () => {
    expect(etiquetasDe(riel)).toEqual(["Ventas"]);
    expect(hijasDe(riel, "Ventas")).toEqual(["Punto de Venta", "Caja", "Historial", "Posventa", "Comprobantes"]);
  });

  it("no tiene Inicio (ve el Punto de venta: su casa es el mostrador), ni Inventario, Catálogo, Compras ni Producción", () => {
    for (const no of ["Inicio", "Inventario", "Catálogo", "Compras", "Producción"]) expect(etiquetasDe(riel)).not.toContain(no);
  });

  it("la barra del celular queda con lo que tiene: Punto de Venta y Caja", () => {
    expect(movil.map((c) => c.etiqueta)).toEqual(["Punto de Venta", "Caja"]);
  });
});

describe("el menú de una terminal con el rol «Terminal administrativa»", () => {
  const { riel } = menuPara(perfilTerminal("administrativa"));

  it("ve Inicio, Catálogo, Compras (solo Proveedores, P3) e Inventario; en Inventario, sin Análisis (es de decisión, del líder) y con Recibir mercadería", () => {
    expect(etiquetasDe(riel)).toEqual(["Inicio", "Catálogo", "Compras", "Inventario"]);
    expect(hijasDe(riel, "Inventario")).toEqual(["Existencias", "Movimientos", "Traslados", "Conteo", "Recibir mercadería"]);
    expect(hijasDe(riel, "Catálogo")).toEqual(["Productos", "Categorías", "Atributos"]);
  });

  // ADR-0161 P3 (20260923140000): Proveedores se abre con su módulo, sin los montos. Lo demás de Compras sigue pidiendo
  // `verDineroCompras`, que esta terminal no tiene.
  it("de Compras ve solo Proveedores (su rol tiene el módulo, P3): sin `verDineroCompras`, nada con dinero", () => {
    // Un grupo con una sola pantalla se pinta como esa pantalla.
    expect(riel.find((f) => f.etiqueta === "Compras")).toMatchObject({ href: "/compras/proveedores" });
  });

  it("si algún día recibe `verDineroCompras` (su rol suma Facturas de compra, Por pagar o Notas de crédito), Compras aparece con lo que su rol ve, SIN tocar el árbol", () => {
    const conDinero = menuPara(perfilTerminal("administrativa", "tienda", ["verDineroCompras"])).riel;
    expect(hijasDe(conDinero, "Compras")).toEqual(["Proveedores", "Recibir mercadería"]);
    // ...y en Compras pierde el duplicado: «Recibir mercadería» vive en UN solo grupo (ADR-0113).
    expect(hijasDe(conDinero, "Inventario")).not.toContain("Recibir mercadería");
  });

  it("no ve Ventas ni Producción", () => {
    for (const no of ["Ventas", "Producción"]) expect(etiquetasDe(riel)).not.toContain(no);
  });
});

describe("terminales sin tipo: el rol manda", () => {
  it("dos terminales de la MISMA tienda con distinto rol ven menús distintos", () => {
    const caja = menuPara(perfilTerminal(["caja", "existencias"])).riel;
    expect(etiquetasDe(caja)).toEqual(["Inicio", "Ventas", "Inventario"]);
    // Un grupo con una sola pantalla visible conserva el nombre del módulo (regla de siempre de `menuPara`).
    expect(caja.map((f) => ("href" in f ? f.href : null))).toEqual(["/", "/caja", "/inventario"]);
    expect(etiquetasDe(menuPara(perfilTerminal("ventas")).riel)).toEqual(["Ventas"]);
  });

  it("una terminal ve Inicio solo si NO ve el Punto de venta", () => {
    expect(terminalVeInicio(["caja"])).toBe(true);
    expect(terminalVeInicio(["vender", "caja"])).toBe(false);
  });

  it("aterriza en /vender si ve el Punto de venta; si no, en su Inicio. Una persona, siempre en Inicio", () => {
    expect(aterrizajeDe({ terminal: true, modulos: ["vender", "caja"] })).toBe("/vender");
    expect(aterrizajeDe({ terminal: true, modulos: ["existencias"] })).toBe("/");
    expect(aterrizajeDe({ terminal: false, modulos: ["vender"] })).toBe("/");
    expect(aterrizajeDe({ terminal: true, modulos: null })).toBe("/");
  });
});

describe("falla cerrado: una terminal solo ve lo que su rol nombra", () => {
  // Cada pantalla viva, por su ruta, con el módulo que declara (una ruta puede vivir en dos grupos: «/recibir»).
  const hojasVivas: Hoja[] = [];
  const recorrer = (nodos: readonly Nodo[]) => {
    for (const n of nodos) {
      if (esGrupo(n)) recorrer(n.hijos);
      else if (n.estado === "viva") hojasVivas.push(n);
    }
  };
  recorrer(ARBOL);
  const modulosDeRuta = (href: string) => hojasVivas.filter((h) => h.ruta === href).map((h) => h.modulo);

  it.each(["ventas", "administrativa"] as const)(
    "con TODOS los permisos y desde cualquier ubicación, la terminal con el rol %s solo ve pantallas de sus módulos (o Inicio)",
    (rol) => {
      const modulos = MODULOS_DE_HOY[rol].map((m) => m.clave);
      for (const ubicacionTipo of TIPOS_UBICACION) {
        const { riel } = menuPara({ permisos: PERMISOS, ubicacionTipo, terminal: true, modulos });
        for (const hoja of riel.flatMap(hojasDe)) {
          if (hoja.href === "/") continue; // Inicio: no es de ningún módulo (ver `terminalVeInicio`)
          const claves = modulosDeRuta(hoja.href);
          expect(claves.some((c) => c && modulos.includes(c)), `${rol} en ${ubicacionTipo} ve «${hoja.id}» (${hoja.href}) sin tener su módulo`).toBe(true);
        }
      }
    },
  );

  it("una terminal sin módulos (su rol vacío, o la base no respondió) solo ve Inicio: nunca más de lo que tiene", () => {
    const { riel } = menuPara({ permisos: PERMISOS, ubicacionTipo: "tienda", terminal: true });
    expect(etiquetasDe(riel)).toEqual(["Inicio"]);
  });

  it("toda pantalla viva salvo Inicio declara su módulo (sin eso una terminal no podría verla)", () => {
    expect(hojasVivas.filter((h) => !h.modulo).map((h) => h.id)).toEqual(["inicio"]);
  });
});
