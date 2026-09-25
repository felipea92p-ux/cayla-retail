import type { ReactNode } from "react";
import { exigirModulo, accionesDeCompraDe } from "@/lib/persona-actual";
import { hoyLima } from "@/lib/fechas-lima";
import { leerVer } from "@/lib/gastos-reglas";
import { filaAPagar, puedePagar } from "@/lib/por-pagar-consolidado-reglas";
import { getPorPagarConsolidado, getUnidadesPorPagar } from "@/lib/por-pagar-consolidado";
import { getCompra } from "@/lib/compras";
import { porPagarConMiParte } from "@/lib/compras-mi-parte";
import { getProveedores } from "@/lib/proveedores";
import { getComprobantesProduccion } from "@/lib/comprobantes-produccion";
import { PorPagarConsolidado } from "@/components/finanzas/PorPagarConsolidado";
import { PagoTallerDesdeUrl } from "@/components/finanzas/PorPagarAcciones";
import { PagoDesdeUrl } from "@/components/CompraDetallePanel";

// Finanzas ▸ Cuentas y dinero ▸ Por pagar (ADR-0195 F4). La puerta es el módulo Cuentas y dinero (el candado real está en la
// base, `fn_por_pagar_consolidado`: el líder, todo; con el módulo, su tienda). `?ver=` (solo el líder) elige qué mirar: la
// sede donde trabaja por defecto, «todas», una unidad o «empresa». `?pagar=<id>` abre el pago de esa fila con el modal de
// su libro —el de Compras o el de Producción—, sin lógica de pago nueva; solo si la cuenta puede pagarla.
export default async function PorPagarFinanzasPage({ searchParams }: { searchParams: Promise<{ ver?: string; pagar?: string }> }) {
  const persona = await exigirModulo("cuentas_dinero");
  const sp = await searchParams;
  const hoy = hoyLima();
  const esLider = persona.rol === "lider";
  const pagaCompras = accionesDeCompraDe(persona).pagar;

  const unidades = await getUnidadesPorPagar(persona);
  const ver = leerVer(sp.ver, unidades, esLider, persona.ubicacionId);
  const { datos: filas, falla } = await getPorPagarConsolidado(ver);

  // El pago que pide la URL, si la fila está en la lista, todavía se debe y esta cuenta la puede pagar.
  const aPagar = filaAPagar(sp.pagar, filas);
  const pagable = aPagar && puedePagar(aPagar, { esLider, pagaCompras }) ? aPagar : null;
  let modal: ReactNode = null;
  if (pagable?.origen === "compras") {
    // Igual que Compras ▸ Por pagar: quien no es líder paga desde sus tiendas y ve SU parte (ADR-0184/0187).
    const misTiendas = esLider ? undefined : persona.tiendasCompra;
    const [compra, proveedores] = await Promise.all([getCompra(pagable.id).then(async (c) => (c && misTiendas ? ((await porPagarConMiParte([c]))[0] ?? null) : c)), getProveedores()]);
    const p = proveedores.find((x) => x.id === compra?.proveedorId);
    if (compra && compra.estado === "vigente" && compra.saldo > 0) {
      modal = (
        <PagoDesdeUrl
          compra={compra}
          saldoFavor={p?.saldo_favor ?? 0}
          misTiendas={misTiendas}
          datos={
            p
              ? {
                  proveedorId: p.id,
                  banco: p.banco,
                  cuentaBancaria: p.cuenta_bancaria,
                  cci: p.cci,
                  celularBilletera: p.celular_billetera,
                  billeteras: p.billeteras,
                  titular: p.titular_cuenta,
                  plazoCreditoDias: p.plazo_credito_dias,
                  formaPagoPreferida: p.forma_pago_preferida,
                  saldoFavor: p.saldo_favor ?? 0,
                }
              : undefined
          }
        />
      );
    }
  } else if (pagable?.origen === "produccion") {
    const comprobante = (await getComprobantesProduccion()).find((c) => c.id === pagable.id && c.estado === "vigente" && c.saldo > 0);
    if (comprobante) modal = <PagoTallerDesdeUrl comprobante={comprobante} hoy={hoy} />;
  }

  return (
    <>
      <PorPagarConsolidado filas={filas} ver={ver} unidades={unidades} esLider={esLider} pagaCompras={pagaCompras} hoy={hoy} falla={falla} />
      {modal}
    </>
  );
}
