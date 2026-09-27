import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ARBOL, type Nodo } from "./menu";

// Toda pantalla interna tiene cómo volver (Felipe, 2026-09-26). Una pantalla interna es la que NO está en el lateral:
// se llega a ella desde otra (Registrar factura desde Facturas de proveedor). Sin una vuelta, la única salida es el
// «atrás» del navegador, que en la tablet de la tienda nadie encuentra. La vuelta es `components/ui/Volver.tsx`.
//
// Esta prueba recorre TODAS las `page.tsx` de `app/(app)` y le exige a cada una que no esté en el menú una vuelta: un
// `<Volver` (o una «←» ya existente) en la página o en un componente que ella importa. Una pantalla nueva sin vuelta hace
// fallar el CI; si de verdad no la necesita, entra a EXCEPCIONES con su porqué.

const APP = fileURLToPath(new URL("../app/(app)", import.meta.url));
const COMPONENTES = fileURLToPath(new URL("../components", import.meta.url));

/** Rutas que no son pantallas internas o que ya tienen otra salida visible. */
const EXCEPCIONES: Record<string, string> = {
  "/sin-acceso": "es el destino de un candado, no una pantalla a la que se entra",
  "/movimientos": "solo redirige a /inventario/movimientos",
  "/finanzas": "solo redirige a Resumen o Gastos",
  "/buscar": "la abre la lupa de la cabecera, desde cualquier pantalla: no cuelga de un submódulo",
  "/produccion/cotizaciones-maquila": "no se llega desde ninguna pantalla todavía (URL directa, D-82)",
  // Raíces propias fuera del lateral: se abren desde la cabecera o el perfil, estando en cualquier pantalla.
  "/actividad": "la abre el botón de actividad de la cabecera",
  "/colaboradores": "la abre el perfil (abajo del lateral)",
  "/configuracion": "la abre el perfil (abajo del lateral)",
  "/clientas": "módulo sin fila en el lateral todavía (URL directa)",
  "/comercial": "módulo sin fila en el lateral todavía (URL directa, ADR-0110)",
  // Pestañas: la fila de pestañas de su pantalla siempre está a la vista y es la navegación.
  "/finanzas/dinero/conciliacion": "pestaña de Cuentas y dinero",
  "/finanzas/dinero/efectivo": "pestaña de Cuentas y dinero",
  "/finanzas/dinero/por-pagar": "pestaña de Cuentas y dinero",
  "/finanzas/reportes/balance": "pestaña de Reportes",
  "/finanzas/reportes/campanas": "pestaña de Reportes",
  "/finanzas/reportes/escenarios": "pestaña de Reportes",
  "/finanzas/reportes/flujo": "pestaña de Reportes",
  "/finanzas/reportes/presupuesto": "pestaña de Reportes",
  "/vender/comprobantes/emitidos": "pestaña de Comprobantes",
  "/vender/comprobantes/por-reintentar": "pestaña de Comprobantes",
  "/vender/comprobantes/proformas": "pestaña de Comprobantes",
  "/vender/comprobantes/series": "pestaña de Comprobantes",
  "/produccion/eficiencia": "pestaña del Resumen de Producción",
};

function rutasDelMenu(nodos: readonly Nodo[], salida = new Set<string>()): Set<string> {
  for (const n of nodos) {
    if (n.estado !== "viva") continue;
    if ("ruta" in n) salida.add(n.ruta);
    if ("hijos" in n && n.hijos) rutasDelMenu(n.hijos, salida);
  }
  return salida;
}

function paginas(dir: string, salida: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      if (nombre.startsWith("@")) continue; // ranuras de modal: tienen su X
      paginas(ruta, salida);
    } else if (nombre === "page.tsx") salida.push(ruta);
  }
  return salida;
}

function rutaDe(archivo: string): string {
  const segmentos = relative(APP, archivo).split("/").slice(0, -1).filter((s) => !/^\(.*\)$/.test(s));
  return "/" + segmentos.join("/");
}

const TIENE_VUELTA = /<Volver\b|←/;

function tieneVuelta(archivo: string): boolean {
  const texto = readFileSync(archivo, "utf8");
  if (TIENE_VUELTA.test(texto)) return true;
  // La vuelta puede vivir en el componente que la página dibuja (Etiquetas de precio, el detalle de un conteo).
  for (const [, nombre] of texto.matchAll(/from "@\/components\/([\w/]+)"/g)) {
    const comp = join(COMPONENTES, `${nombre}.tsx`);
    if (existsSync(comp) && TIENE_VUELTA.test(readFileSync(comp, "utf8"))) return true;
  }
  return false;
}

describe("toda pantalla interna tiene cómo volver", () => {
  const delMenu = rutasDelMenu(ARBOL);
  const internas = paginas(APP)
    .map((archivo) => ({ archivo, ruta: rutaDe(archivo) }))
    .filter(({ ruta }) => !delMenu.has(ruta) && !(ruta in EXCEPCIONES));

  it("encuentra las pantallas internas (si esto da 0, la prueba dejó de mirar)", () => {
    expect(internas.length).toBeGreaterThan(10);
  });

  it.each(internas.map((p) => [p.ruta, p.archivo]))("%s tiene una vuelta", (_ruta, archivo) => {
    expect(tieneVuelta(archivo)).toBe(true);
  });

  it("cada excepción sigue existiendo (una excepción de una pantalla borrada es ruido)", () => {
    const todas = new Set(paginas(APP).map(rutaDe));
    for (const ruta of Object.keys(EXCEPCIONES)) expect(todas.has(ruta), ruta).toBe(true);
  });
});
