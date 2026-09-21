import { requirePersonaActualV2 } from "@/lib/persona-actual";
import { getFacturasParaNota, getTableroNotasCredito } from "@/lib/notas-credito";
import { hoyLima } from "@/lib/fechas-lima";
import { NotasCreditoPanel } from "@/components/NotasCreditoPanel";

// Notas de crédito de compra (/compras/notas-credito, 2026-09-19; spike aprobado en
// docs/maquetas/notas-credito-spike-2026-09/).
//
// Por qué es un módulo propio y no una parte de Recepción: hasta hoy el formulario de la nota vivía
// DENTRO de la guía de recepción —una pantalla que usa un colaborador de sede para contar— y en el
// detalle del comprobante. Dinero de Compras en dos puertas, y en una que no es de dinero. Acá el
// reclamo tiene su lugar: se ve qué falta reclamar, hace cuánto, a quién llamar, y a dónde fue el
// dinero de cada nota que sí llegó. Recepción vuelve a ser contar y decidir.
//
// Solo líder (ADR-0126): el `redirect` del layout de Compras cubre la URL directa, y el candado real
// lo vuelven a exigir `notas_credito_tablero()` y las RPC de escritura con
// `fn_puede_ver_dinero_de_compras()`. Si alguna de las dos lecturas nuevas no estuviera en la base, la
// pantalla se dibuja igual y lo dice (principio 9) en vez de reventar o de mostrar ceros.
//
// La pantalla es de SERVIDOR para leer, y una sola pieza cliente para operar: todo el tablero llega en
// una llamada y son decenas de filas, así que filtrar, agrupar y buscar se resuelven sin ir al
// servidor — que es lo que permite que las filas se deslicen en vez de redibujarse.
export default async function NotasCreditoPage() {
  await requirePersonaActualV2();
  const [tablero, facturas] = await Promise.all([getTableroNotasCredito(), getFacturasParaNota()]);

  return (
    <NotasCreditoPanel
      filas={tablero.filas}
      saldoPorProveedor={tablero.saldoPorProveedor}
      movimientos={tablero.movimientos}
      proveedores={tablero.proveedores}
      facturas={facturas.facturas}
      fallaFacturas={facturas.falla}
      falla={tablero.falla}
      hoy={hoyLima()}
    />
  );
}
