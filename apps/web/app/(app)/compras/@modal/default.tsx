// Slot `modal` del layout de Compras cuando ninguna ruta lo reclama (la
// lista, Por pagar, Recibir…): no dibuja nada. Sin este archivo Next da 404
// en la carga completa de cualquier pantalla del módulo, porque el slot
// paralelo existe pero no tendría con qué llenarse.
export default function ModalVacio() {
  return null;
}
