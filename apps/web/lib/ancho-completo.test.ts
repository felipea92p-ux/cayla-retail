import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ARBOL, type Nodo } from "./menu";

// Candado del ANCHO de las pantallas (ADR-0462, Felipe 2026-10-20: «toda pantalla nueva ocupe todo el espacio de la pantalla»). Desde ese
// día toda pantalla va a ancho completo; el tope de 64 rem queda solo para el Inicio («/», exacto) y las rutas de `CON_TOPE_DE_ANCHO`, que
// nacieron antes de la regla: es deuda, solo baja, y una ruta nueva no puede entrar (CON_TOPE_HOY, más abajo).
//
// El Inicio de almacén (Felipe, 2026-09-30, ADR-0292) pide el ancho completo con un atributo, `data-ancho-completo`, que el `<main>` lee
// con `has-[[data-ancho-completo]]:max-w-none`: quitarle el tope a «/» estiraría el Inicio de todas las cuentas, que no fueron pensadas
// para eso (Equipo de hoy, «Te toca» de la tienda).
//
// Contrato. PROMETE: que `AppShell` conserva esa regla; que el marcador vive en el Inicio de almacén; que ninguna otra pantalla o
// componente lo escribe (una pantalla nueva que necesite ancho completo lo decide con Felipe y lo agrega acá a propósito); y que
// «/» no entró a `SIN_TOPE_DE_ANCHO`. El Observatorio (el Inicio del Admin, ADR-0322) entró así el 2026-10-03: Felipe pidió que el
// mapa llene la pantalla. La pantalla de Aventurero («Sin acceso» y las barreras de error) entró el 2026-10-15: Felipe pidió que la foto
// y el mensaje «ocupen todo el espacio»; su tarjeta se topa sola en 72rem. El Resumen de Finanzas entró el 2026-10-26 (Felipe: «usar todo el espacio de la pantalla»), como excepción de su ruta mientras el resto de Finanzas se revisa a lo ancho. NO PROMETE: que el diseño se vea bien a cada ancho (eso se mira en el navegador: 1920, 2560,
// 3840, 1280, 768 y 375 px).

const RAIZ = join(__dirname, "..");
const MARCADOR = "data-ancho-completo";
/** Las rutas que llevaban el tope el 2026-10-20, cuando se invirtió la regla. Al revisar una a lo ancho, se saca de AppShell y de aquí. */
const CON_TOPE_HOY = ["/actividad", "/buscar", "/comercial", "/configuracion", "/finanzas", "/global", "/movimientos", "/pedidos-no-atendidos", "/rendimiento", "/sin-acceso"];
const QUIEN_PIDE_ANCHO_COMPLETO = ["components/finanzas/ResumenFinanzas.tsx", "components/inicio-almacen/InicioAlmacen.tsx", "components/observatorio/Observatorio.tsx", "components/ui/Aventurero.tsx"];

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    if (nombre === "node_modules" || nombre.startsWith(".")) return [];
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(tsx?|css)$/.test(nombre) && !/\.test\.tsx?$/.test(nombre) ? [ruta] : [];
  });
}

const SHELL = () => readFileSync(join(RAIZ, "components/AppShell.tsx"), "utf8");
const conTope = () =>
  (/const CON_TOPE_DE_ANCHO = \[([^\]]*)\]/.exec(SHELL())?.[1] ?? "").split(",").map((r) => r.trim().replace(/"/g, "")).filter(Boolean);
const rutas = (nodos: readonly Nodo[]): string[] => nodos.flatMap((n) => [...("ruta" in n ? [n.ruta] : []), ...("hijos" in n && n.hijos ? rutas(n.hijos) : [])]);
const llevaTope = (ruta: string) => ruta === "/" || conTope().some((r) => ruta === r || ruta.startsWith(`${r}/`));

describe("el ancho de las pantallas (ADR-0462)", () => {
  it("AppShell le pone el tope solo al Inicio y a CON_TOPE_DE_ANCHO, y una pantalla con tope lo puede quitar con el marcador", () => {
    const shell = SHELL();
    expect(shell).toContain('pathname === "/" || CON_TOPE_DE_ANCHO.some(');
    expect(shell).toContain('conTopeDeAncho(pathname) ? "mx-auto max-w-5xl has-[[data-ancho-completo]]:max-w-none" : ""');
    expect(shell).not.toContain("SIN_TOPE_DE_ANCHO");
  });

  it("CON_TOPE_DE_ANCHO es deuda: solo baja, y una ruta nueva no entra", () => {
    const lista = conTope();
    const nuevas = lista.filter((r) => !CON_TOPE_HOY.includes(r));
    expect(nuevas, "Una pantalla nueva va a ancho completo (ADR-0462): no la agregues a CON_TOPE_DE_ANCHO; topa por su cuenta solo el párrafo o el formulario que lo necesite.").toEqual([]);
    expect(lista).not.toContain("/");
  });

  it("cada ruta con tope existe todavía (una que se borró sale de la lista)", () => {
    for (const r of conTope()) expect(statSync(join(RAIZ, "app/(app)", r.slice(1))).isDirectory(), r).toBe(true);
  });

  it("toda ruta del menú que no está en la deuda va a ancho completo", () => {
    const nuevasConTope = rutas(ARBOL).filter((r) => llevaTope(r) && r !== "/" && !CON_TOPE_HOY.some((t) => r === t || r.startsWith(`${t}/`)));
    expect(nuevasConTope).toEqual([]);
  });

  // Producción entró entera el 2026-09-22, y «Órdenes de insumos» (`/ordenes-insumos`, su ruta NO cuelga de `/produccion` a propósito:
  // ADR-0362) quedó con el tope hasta la Formidable del 2026-10-15: al pasar de Proveedores a Órdenes de insumos el título saltaba 32 px.
  // Clientes (Fichas, Avisos, Beneficios) entró el 2026-10-20 (Felipe: «no ocupan todo el espacio»); Tienda web (Resumen, Pedidos, Vitrina, Recomendaciones, Datos y plazos) el 2026-10-21. Cada grupo comparte un solo ancho.
  for (const grupo of ["produccion", "clientas", "tiendaWeb"]) {
    it(`toda pantalla del grupo «${grupo}» va sin tope: pasar de una a otra no mueve el título`, () => {
      const nodo = ARBOL.find((n) => n.id === grupo);
      expect(nodo).toBeDefined();
      for (const ruta of rutas([nodo!])) expect(llevaTope(ruta), `${ruta} quedó con el tope de ancho`).toBe(false);
    });
  }
});

describe("ancho completo del Inicio de almacén", () => {
  it("solo el Inicio de almacén, el Observatorio, Aventurero y el Resumen de Finanzas escriben el marcador", () => {
    const quienes = archivos(RAIZ)
      .filter((f) => readFileSync(f, "utf8").includes(MARCADOR))
      .map((f) => f.slice(RAIZ.length + 1).replaceAll("\\", "/"))
      // AppShell y este candado lo nombran para leerlo, no para pedirlo.
      .filter((f) => f !== "components/AppShell.tsx");
    expect(quienes.sort()).toEqual([...QUIEN_PIDE_ANCHO_COMPLETO].sort());
  });

  it("cada Inicio lo escribe como atributo de un elemento, no en un comentario", () => {
    for (const archivo of QUIEN_PIDE_ANCHO_COMPLETO) {
      const inicio = readFileSync(join(RAIZ, archivo), "utf8");
      expect(inicio).toMatch(/<span hidden data-ancho-completo \/>/);
    }
  });
});
