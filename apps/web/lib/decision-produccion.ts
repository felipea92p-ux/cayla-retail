import { getUbicaciones } from "@/lib/ubicaciones";
import { getFilasRecientesDeSede } from "@/lib/resumen-inventario";
import { loteMasAntiguoConSaldo } from "@/lib/insumos-reglas";
import { demandaDeLaRed, enProduccionPorVariante, rendimientoMedido, type DemandaVariante, type Rendimiento } from "@/lib/produccion-decision-reglas";
import type { InsumoVista, ConsumoDeOrden } from "@/lib/insumos";
import type { LineaPorRecibir } from "@/lib/recibir-produccion-reglas";
import type { ModeloProducible, OrdenProduccion } from "@/lib/produccion";
import type { Tolerado } from "@/lib/resultado";

// Nueva orden con decisión (ADR-0133, F5): lo que se calcula en el servidor para que el formulario aconseje ANTES de abrir la orden. Solo para el
// líder (ventas y stock de toda la red, costos de insumos). Es información SECUNDARIA: si falla, «Nueva orden» sigue funcionando como siempre y avisa.
// Sin esquema nuevo: lee lo que ya existe —el ritmo y el stock de cada sede (`fn_resumen_variantes`, las mismas reglas de Inventario), el consumo real
// de las órdenes cerradas, el saldo de Insumos y lo facturado que aún no llegó.

export type SaldoInsumoDecision = { insumoId: string; nombre: string; unidad: InsumoVista["unidad"]; saldo: number; porLlegar: number; costoUnitario: number | null };

export type DecisionProduccion = {
  /** Una fila por variante de los modelos producibles con datos en la red. */
  demanda: DemandaVariante[];
  /** Lo que ya se está fabricando por variante (órdenes de producción abiertas). */
  enProduccion: Record<string, number>;
  /** Rendimiento medido por modelo (solo modelos con órdenes cerradas y consumo registrado). */
  rendimientoPorModelo: Record<string, Rendimiento[]>;
  /** Saldo, lo que viene y el costo del lote que se usaría, por insumo. */
  insumos: SaldoInsumoDecision[];
};

export async function getDecisionProduccion(args: {
  modelos: ModeloProducible[];
  ordenes: OrdenProduccion[];
  insumos: InsumoVista[];
  consumosPorOrden: Record<string, ConsumoDeOrden[]>;
  lineasPorRecibir: LineaPorRecibir[];
}): Promise<Tolerado<DecisionProduccion>> {
  try {
    const sedes = await getUbicaciones();
    const conFilas = await Promise.all(sedes.map(async (u) => ({ tipo: u.tipo, filas: await getFilasRecientesDeSede(u.id) })));
    const variantesDeModelos = new Set(args.modelos.flatMap((m) => m.variantes.map((v) => v.varianteId)));
    const demanda = [...demandaDeLaRed(conFilas).values()].filter((d) => variantesDeModelos.has(d.varianteId));

    const rendimientoPorModelo: Record<string, Rendimiento[]> = {};
    for (const m of args.modelos) {
      const r = rendimientoMedido(m.productoId, args.ordenes, args.consumosPorOrden);
      if (r.length > 0) rendimientoPorModelo[m.productoId] = r;
    }

    const porLlegar = new Map<string, number>();
    for (const l of args.lineasPorRecibir) porLlegar.set(l.insumoId, (porLlegar.get(l.insumoId) ?? 0) + Math.max(0, l.pendiente));

    return {
      datos: {
        demanda,
        enProduccion: Object.fromEntries(enProduccionPorVariante(args.ordenes)),
        rendimientoPorModelo,
        insumos: args.insumos.map((i) => {
          const lote = loteMasAntiguoConSaldo(i.lotes) ?? i.lotes[i.lotes.length - 1] ?? null;
          return { insumoId: i.id, nombre: i.nombre, unidad: i.unidad, saldo: i.saldo, porLlegar: porLlegar.get(i.id) ?? 0, costoUnitario: lote?.costoUnitario ?? null };
        }),
      },
      fallo: null,
    };
  } catch {
    return { datos: null, fallo: "No se pudo calcular la sugerencia de la red. Puedes abrir la orden igual, con tus cantidades." };
  }
}
