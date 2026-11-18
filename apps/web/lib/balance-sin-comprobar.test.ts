import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BalancePanel } from "../components/finanzas/BalancePanel";
import type { UnidadBalance } from "./balance-reglas";

// La prueba corre sin el alias `@/` y sin el resto del sistema de piezas: lo que se vigila son los textos que el panel decide dibujar.
function caja({ titulo, bajada, acciones, children }: { titulo?: ReactNode; bajada?: ReactNode; acciones?: ReactNode; children?: ReactNode }) {
  return createElement("div", null, titulo, bajada, acciones, children);
}
vi.mock("@/lib/balance-reglas", () => import("./balance-reglas"));
vi.mock("@/lib/vale-reglas", () => import("./vale-reglas"));
vi.mock("@/components/ui/Chip", () => ({ Chip: caja }));
vi.mock("@/components/ui/Aviso", () => ({ Aviso: caja }));
vi.mock("@/components/ui/TituloSeccion", () => ({ TituloGrupo: caja }));
vi.mock("@/components/ui/VerMas", () => ({ BotonVerMas: caja, FilasDeMas: caja }));
vi.mock("@/components/ui/TarjetaCifra", () => ({ TarjetaCifra: caja }));
vi.mock("@/components/ui/BarraAvance", () => ({ BarraAvance: caja }));
vi.mock("@/components/ui/campos", () => ({ Boton: caja }));
vi.mock("@/components/ui/Vacio", () => ({ Vacio: caja }));
vi.mock("@/components/finanzas/kit", () => ({ CabeceraBloque: caja, PieTabla: caja, Superficie: caja, TituloDeTarjeta: caja }));
vi.mock("@/components/finanzas/SaldosArranqueModal", () => ({ SaldosArranqueModal: () => null }));

// Tarea 87: si `fn_conciliacion_contable` falla un momento, los chequeos llegan vacíos y eso se leía como «faltan los saldos de arranque». Los saldos ya están registrados:
// la pantalla dice el error (lo pinta la página) y no le pide a un líder que vuelva a cargar la base de todos los estados.

const TIENDA = { ubicacionId: "u", nombre: "Tienda Lima", tipo: "tienda", caja: 10, mercaderia: 20, activosFijos: 0, activosCosto: 0, activosDepreciacion: 0, facturasPorPagar: 0, invertido: 30, utilidadMes: 1, rinde: 0.1, desde: "2026-11-01" } as unknown as UnidadBalance;
const dibujar = (comprobacionFallo: boolean) => renderToStaticMarkup(createElement(BalancePanel, { esLider: true, hoy: "2026-11-08", chequeos: [], unidades: [TIENDA], saldos: [], comprobacionFallo }));

describe("el Balance cuando su comprobación no se pudo leer", () => {
  it("no pide registrar los saldos de arranque", () => {
    const html = dibujar(true);
    expect(html).not.toContain("Saldos de arranque");
    expect(html).not.toContain("Falta el punto de partida");
    expect(html).not.toContain("Registrar saldos de arranque");
  });
  it("lo que sí se leyó sigue a la vista", () => {
    const html = dibujar(true);
    expect(html).toContain("Lo que es de cada tienda");
    expect(html).toContain("Tienda Lima");
    expect(html).toContain("nota-cayla");
  });
  it("control: sin falla y sin chequeos, de verdad falta el arranque", () => {
    const html = dibujar(false);
    expect(html).toContain("Falta el punto de partida");
    expect(html).toContain("Registrar saldos de arranque");
  });
});
