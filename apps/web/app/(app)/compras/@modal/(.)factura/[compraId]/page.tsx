import { exigirPermiso } from "@/lib/persona-actual";
import { CompraDetalle, DatosComprobante, TituloComprobante, cargarDetalleCompra } from "@/components/CompraDetalle";
import { ModalRuta } from "@/components/ui/ModalRuta";
import { CompraAcciones } from "@/components/CompraDetallePanel";

// Detalle de la factura como modal, encima de la lista desde la que se abrió.
//
// Es una "ruta interceptada" de Next: cuando se navega a `/compras/factura/<id>`
// DESDE otra pantalla de Compras (clic en una fila), Next no cambia la
// pantalla de fondo — dibuja esta página en el slot `modal` del layout y
// deja la lista donde estaba. La URL sí cambia a `/compras/factura/<id>`, así que
// copiarla, compartirla o recargar muestra la página completa
// (`../../../factura/[compraId]/page.tsx`): el mismo cuerpo, sin modal.
//
// Por qué modal y no otra pantalla: revisar una factura es una consulta de
// segundos en medio de una lista — ir y volver perdía el scroll, los filtros
// visibles y el contexto de "en cuál estaba".
export default async function CompraDetalleModal({
  params,
  searchParams,
}: {
  params: Promise<{ compraId: string }>;
  searchParams: Promise<{ adjuntos_fallidos?: string; desde?: string }>;
}) {
  // ADR-0161 P3: el layout de /compras también deja entrar a quien solo tiene Proveedores; un comprobante es dinero.
  await exigirPermiso("verDineroCompras");
  const { compraId } = await params;
  const { adjuntos_fallidos, desde } = await searchParams;
  const adjuntosFallidos = adjuntos_fallidos ? adjuntos_fallidos.split("|").filter(Boolean) : [];
  // Viniendo del formulario de nueva factura, "atrás" volvería al formulario
  // recién enviado: se cierra hacia la lista.
  const alCerrar = desde === "nueva" ? "/compras" : undefined;
  const detalle = await cargarDetalleCompra(compraId);

  if (!detalle) {
    return (
      <ModalRuta titulo="Factura no encontrada" ancho="max-w-sm" alCerrar={alCerrar}>
        <p className="text-sm text-tinta/75">No existe una factura con ese enlace, o ya no tienes acceso a ella.</p>
      </ModalRuta>
    );
  }

  const { compra } = detalle;
  const anulada = compra.estado === "anulada";

  // Composición del prototipo aprobado (docs/maquetas/comprobantes-animaciones-2026-09): el título es «FACTURA ·
  // F001-000482» chico y el NOMBRE DEL PROVEEDOR grande; la bajada, la línea gris «RUC · Emitido · Vence · Destino».
  // Se cierra con la X de arriba a la derecha, Esc o clic afuera (`cierre="equis"`: no hay «Cerrar» en el pie), y el
  // pie lleva solo las acciones —«Registrar pago» a la derecha, como botón principal—.
  return (
    <ModalRuta
      titulo={<TituloComprobante compra={compra} />}
      subtitulo={<DatosComprobante compra={compra} destino={detalle.destino} />}
      ancho="max-w-2xl"
      cierre="equis"
      alCerrar={alCerrar}
      acciones={anulada ? undefined : <CompraAcciones compra={compra} tieneRecepciones={detalle.recepciones.length > 0} datosPago={detalle.datosPago} permite={detalle.acciones} />}
    >
      <CompraDetalle detalle={detalle} adjuntosFallidos={adjuntosFallidos} acciones={false} />
    </ModalRuta>
  );
}
