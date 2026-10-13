// Cierra la ventana de una orden al navegar a otra pantalla del módulo (Nueva orden, Editar). Con la orden abierta encima de la lista,
// un clic que cambia la URL mueve el slot `children`, pero un slot paralelo sin coincidencia conserva lo último que mostró: la ventana
// quedaría pegada encima de la pantalla nueva. Este comodín coincide con cualquier ruta y devuelve vacío, así el slot se limpia junto
// con la navegación (como en Compras). Tiene prioridad sobre default.tsx.
export default function ModalCerrado() {
  return null;
}
