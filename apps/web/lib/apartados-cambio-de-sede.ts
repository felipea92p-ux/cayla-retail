// El apartado a medio armar es de SU sede (Felipe, 2026-10-11). Puro: sin React ni `window`; lo usan `ApartadosPanel` (la key) y
// `ApartarVista` (qué se guarda y cómo se dice), y lo prueba `apartados-cambio-de-sede.test.ts`.
//
// El problema: el selector de sede de la cabecera cambia de sede con `router.refresh()`. La ruta no cambia y React conserva el estado
// de todo componente cliente cuya `key` siga igual. Apartar se montaba con la misma key en todas las sedes («apartar»): lo armado en
// Lima (prendas, datos del cliente, adelanto) se confirmaba desde la pantalla de Trujillo, y `separar_prendas` salía con Trujillo,
// al precio propio de Trujillo y con el efectivo para su caja.
//
// La decisión: la sede nueva arranca con Apartar vacío y lo armado queda guardado en su sede (`components/ui/TrabajoPorSede.tsx`),
// como el ticket de Vender y el conteo de Recibir: el cliente sigue en el mostrador de Lima, y volver a escanear y a escribir sus
// datos es lo que se quiere evitar. Un apartado que viene de un pedido de otra tienda NO se guarda: su pedido sigue en la lista de su
// sede y se aparta desde ahí; guardado suelto perdería el vínculo y se cobraría como un apartado común (como la proforma en Vender).

/** La key de Apartar: la sede primero, después el apartado con que arranca (suelto o el de un pedido). Otra sede, otro montaje. */
export function claveDelApartado(ubicacionId: string, pedidoId: string | null = null): string {
  return `${ubicacionId}:${pedidoId ?? "apartar"}`;
}

/** Lo que se mira para decidir si hay algo armado (los campos del formulario que la persona escribe, más lo escaneado). */
export type ApartadoEscrito = {
  lineas: readonly { cantidad: number }[];
  nombres: string;
  apellidos: string;
  celular: string;
  dni: string;
  ruc: string;
  razonSocial: string;
  pagos: readonly { monto: number }[];
  nota: string;
  /** Lo escrito en «Buscar al cliente por DNI». */
  buscado: string;
};

/** ¿Hay algo armado que valga la pena guardar? Una prenda, cualquier dato escrito o un monto de adelanto. Lo que viene de fábrica
 *  (boleta, devolución por Yape) no cuenta. */
export function apartadoArmado(a: ApartadoEscrito): boolean {
  const escrito = [a.nombres, a.apellidos, a.celular, a.dni, a.ruc, a.razonSocial, a.nota, a.buscado].some((t) => t.trim() !== "");
  return a.lineas.length > 0 || escrito || a.pagos.some((p) => p.monto > 0);
}

/** Los avisos del guardián: al irse de la sede con el apartado armado y al volver a encontrarlo. */
export function avisosDelApartado({
  etiqueta,
  nombres,
  apellidos,
  prendas,
}: {
  etiqueta: string;
  nombres: string;
  apellidos: string;
  prendas: number;
}): { avisoAlGuardar: { texto: string; detalle: string }; avisoAlVolver: string } {
  const cliente = `${nombres} ${apellidos}`.trim();
  const cual = cliente ? `El apartado de ${cliente}` : "El apartado a medio armar";
  const cuantas = prendas === 0 ? "sin prendas todavía" : `${prendas} ${prendas === 1 ? "prenda" : "prendas"}`;
  return {
    avisoAlGuardar: {
      texto: `${cual} (${cuantas}) quedó guardado en ${etiqueta}`,
      detalle: `Vuelve a ${etiqueta} con el selector de arriba y sigue donde lo dejaste: las prendas, los datos del cliente y el adelanto.`,
    },
    avisoAlVolver: `Volvió ${cual.charAt(0).toLowerCase()}${cual.slice(1)}`,
  };
}
