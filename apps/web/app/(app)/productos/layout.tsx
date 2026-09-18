// `modal` es un slot paralelo (`@modal/`): ahí Next dibuja el historial de un
// producto como modal cuando se abre desde la lista (ruta interceptada
// `@modal/(.)[id]/historial`), sin desmontar la lista de `children`. El resto
// del tiempo el slot está vacío (`@modal/default.tsx`). Mismo patrón que
// `/compras/layout.tsx` — a diferencia de Compras, acá no hay redirect de
// líder: Productos ya es una pantalla de solo lectura para integrantes.
export default function ProductosLayout({ children, modal }: { children: React.ReactNode; modal: React.ReactNode }) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
