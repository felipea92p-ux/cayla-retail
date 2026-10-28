import { RecordatorioEtiquetasProvider } from "@/components/ficha-producto/RecordatorioEtiquetas";

// `modal` es un slot paralelo (`@modal/`): ahí Next dibuja el historial de un
// producto como modal cuando se abre desde la lista (ruta interceptada
// `@modal/(.)[id]/historial`), sin desmontar la lista de `children`. El resto
// del tiempo el slot está vacío (`@modal/default.tsx`). Mismo patrón que
// `/compras/layout.tsx` — a diferencia de Compras, acá no hay redirect de
// líder: Productos ya es una pantalla de solo lectura para integrantes.
//
// `RecordatorioEtiquetasProvider` (2026-10-02): este layout se queda montado mientras se navega DENTRO de Productos
// (la lista, una ficha, Nuevo producto…) y se desmonta al salir a otro módulo — es justo el ciclo de vida que pedía
// Felipe para el aviso de «Imprimir etiquetas»: bastante visible y que no desaparezca hasta cambiar de módulo.
export default function ProductosLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    <RecordatorioEtiquetasProvider>
      {children}
      {modal}
    </RecordatorioEtiquetasProvider>
  );
}
