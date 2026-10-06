import { PantallaNoEncontrada } from "@/components/PantallaNoEncontrada";

// El `notFound()` de una pantalla (un producto, un conteo, una compra o un traslado que ya no están) se dibuja DENTRO del lateral:
// la persona no pierde el menú ni la sede donde estaba (ADR-0336).
export default function NoEncontradaEnLaApp() {
  return <PantallaNoEncontrada />;
}
