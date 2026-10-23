// Gastos en el telar de Finanzas (Felipe 2026-10-23): la pregunta que responde su cabecera, sus chips y la sede que se nombra
// arriba. Lógica pura, probada en `gastos-telar-reglas.test.ts`; el total sale de `fn_gastos_panel` y no se recalcula aquí.
import { nombreCortoSede } from "./finanzas-telar-reglas";
import { textoMes, type PanelGastos, type UbicacionGastos, type Ver } from "./gastos-reglas";
import type { TonoChip } from "@/components/ui/Chip";

/** Quién gastó, dentro de una frase: «CAYLA», «la empresa», «el Taller», «Lima». */
function quien(ver: Ver, ubicaciones: readonly UbicacionGastos[]): string {
  if (ver.soloEmpresa) return "la empresa";
  if (!ver.ubicacionId) return "CAYLA";
  const nombre = nombreCortoSede(ubicaciones.find((u) => u.id === ver.ubicacionId)?.nombre ?? "la tienda");
  return /^taller$/i.test(nombre) ? "el Taller" : nombre;
}

/** «¿Cuánto gastó Lima en octubre?» */
export function preguntaDeGastos(ver: Ver, ubicaciones: readonly UbicacionGastos[], mes: string): string {
  return `¿Cuánto gastó ${quien(ver, ubicaciones)} en ${textoMes(mes).split(" ")[0]}?`;
}

/** La línea de arriba de la cabecera: la sede que se mira, como la dice el hilo elegido. */
export function sedeDeLaCabecera(ver: Ver, ubicaciones: readonly UbicacionGastos[]): string {
  if (ver.soloEmpresa) return "Empresa";
  if (!ver.ubicacionId) return "Todas las sedes";
  return nombreCortoSede(ubicaciones.find((u) => u.id === ver.ubicacionId)?.nombre ?? "Tu sede");
}

/** Bajo la cifra: cuántos gastos son y, si hay, cuántos no tienen comprobante (sin él no se recupera el IGV). */
export function chipsDeGastos(panel: Pick<PanelGastos, "n" | "sinComprobante">): { texto: string; tono: TonoChip }[] {
  const chips: { texto: string; tono: TonoChip }[] = [{ texto: `${panel.n} ${panel.n === 1 ? "gasto" : "gastos"}`, tono: "pizarra" }];
  if (panel.sinComprobante > 0) chips.push({ texto: `${panel.sinComprobante} sin comprobante`, tono: "ambar" });
  return chips;
}

// ---- El retazo: cada categoría es un pedazo de tela del tamaño de su gasto ------------------------------------------------------

type GastoParaRetazo = { categoria: string; categoriaNombre: string; ubicacionId: string | null; montoTotal: number; estado: "vigente" | "anulado" };

export type PiezaRetazo = {
  categoria: string;
  nombre: string;
  total: number;
  /** Parte de lo gastado en el mes, redondeada (la pieza dice «32 %»). */
  pct: number;
  /** Cuánto puso cada sede (`empresa` = lo que no es de ninguna), para su orillo. */
  porSede: Record<string, number>;
};

/** Las categorías del mes con lo vigente (un anulado no cuenta), de la que más gastó a la que menos. */
export function retazoDeGastos(gastos: readonly GastoParaRetazo[]): PiezaRetazo[] {
  const por = new Map<string, PiezaRetazo>();
  let total = 0;
  for (const g of gastos) {
    if (g.estado !== "vigente" || g.montoTotal <= 0) continue;
    const p = por.get(g.categoria) ?? { categoria: g.categoria, nombre: g.categoriaNombre, total: 0, pct: 0, porSede: {} };
    p.total += g.montoTotal;
    const k = g.ubicacionId ?? "empresa";
    p.porSede[k] = (p.porSede[k] ?? 0) + g.montoTotal;
    por.set(g.categoria, p);
    total += g.montoTotal;
  }
  return [...por.values()]
    .map((p) => ({ ...p, pct: total > 0 ? Math.round((p.total / total) * 100) : 0 }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es"));
}

export type Rect = { x: number; y: number; w: number; h: number };

/**
 * Acomoda las piezas en un rectángulo de `ancho × alto` con el algoritmo «squarified» (Bruls, Huizing y van Wijk, 2000): cada pieza
 * mide lo suyo y queda lo más cuadrada posible, para que su nombre quepa. Las piezas vienen de mayor a menor (como `retazoDeGastos`).
 */
export function acomodarRetazo<T extends { total: number }>(items: readonly T[], ancho: number, alto: number): (T & Rect)[] {
  const suma = items.reduce((a, b) => a + b.total, 0);
  if (suma <= 0 || ancho <= 0 || alto <= 0) return [];
  const resto = items.map((o) => ({ o, area: (o.total / suma) * ancho * alto }));
  const fuera: (T & Rect)[] = [];
  let x = 0, y = 0, w = ancho, h = alto;
  const peor = (fila: { area: number }[], lado: number) => {
    const s = fila.reduce((a, b) => a + b.area, 0);
    const mx = Math.max(...fila.map((f) => f.area));
    const mn = Math.min(...fila.map((f) => f.area));
    return Math.max((lado * lado * mx) / (s * s), (s * s) / (lado * lado * mn));
  };
  const colocar = (fila: { o: T; area: number }[]) => {
    const s = fila.reduce((a, b) => a + b.area, 0);
    if (w >= h) {
      const cw = s / h;
      let cy = y;
      for (const f of fila) {
        const fh = f.area / cw;
        fuera.push({ ...f.o, x, y: cy, w: cw, h: fh });
        cy += fh;
      }
      x += cw;
      w -= cw;
    } else {
      const ch = s / w;
      let cx = x;
      for (const f of fila) {
        const fw = f.area / ch;
        fuera.push({ ...f.o, x: cx, y, w: fw, h: ch });
        cx += fw;
      }
      y += ch;
      h -= ch;
    }
  };
  let fila: { o: T; area: number }[] = [];
  while (resto.length) {
    const lado = Math.min(w, h);
    const c = resto[0]!;
    if (!fila.length || peor([...fila, c], lado) <= peor(fila, lado)) {
      fila.push(c);
      resto.shift();
    } else {
      colocar(fila);
      fila = [];
    }
  }
  if (fila.length) colocar(fila);
  return fuera;
}

// ---- El calendario: cuándo se gastó, más oscuro es más gasto --------------------------------------------------------------------

export type DiaCalendario = { dia: number; total: number; n: number; intensidad: number; futuro: boolean };

/**
 * Los días del mes con lo vigente de cada uno. `huecos` son los días en blanco antes del 1 (la semana empieza el lunes). La intensidad
 * va de 0 a 1 con la raíz de lo gastado contra el día de más gasto: un día de alquiler no deja todos los demás en blanco. Los días
 * después de hoy son `futuro` (no se eligen).
 */
export function calendarioDelMes(gastos: readonly { fecha: string; montoTotal: number; estado: "vigente" | "anulado" }[], mes: string, hoy: string): { huecos: number; dias: DiaCalendario[] } {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const huecos = (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7;
  const totales = Array.from({ length: ultimo + 1 }, () => ({ total: 0, n: 0 }));
  for (const g of gastos) {
    if (g.estado !== "vigente" || !g.fecha.startsWith(`${mes}-`)) continue;
    const d = Number(g.fecha.slice(8, 10));
    if (d >= 1 && d <= ultimo) {
      totales[d]!.total += g.montoTotal;
      totales[d]!.n += 1;
    }
  }
  const mayor = Math.max(0, ...totales.map((t) => t.total));
  const dias = Array.from({ length: ultimo }, (_, i) => {
    const dia = i + 1;
    const t = totales[dia]!;
    const fecha = `${mes}-${String(dia).padStart(2, "0")}`;
    return { dia, total: t.total, n: t.n, intensidad: mayor > 0 ? Math.sqrt(t.total / mayor) : 0, futuro: fecha > hoy };
  });
  return { huecos, dias };
}
