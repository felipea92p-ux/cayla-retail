// Slot `modal` del layout de Órdenes de insumos cuando ninguna ruta lo reclama (la lista): no dibuja nada. Sin este archivo Next da 404
// en la carga completa de la lista, porque el slot paralelo existe pero no tendría con qué llenarse (como en Compras).
export default function ModalVacio() {
  return null;
}
