// Cierra el modal al navegar a otra pantalla del módulo (categorías,
// colores…). Con el historial abierto encima de la lista, un clic en otra
// pantalla cambia la URL: el slot `children` se mueve, pero un slot paralelo
// sin coincidencia conserva lo último que mostró — el modal quedaría pegado
// encima de la pantalla nueva. Este comodín coincide con cualquier ruta y
// devuelve vacío, así el slot se limpia junto con la navegación. (Tiene
// prioridad sobre default.tsx.)
export default function ModalCerrado() {
  return null;
}
