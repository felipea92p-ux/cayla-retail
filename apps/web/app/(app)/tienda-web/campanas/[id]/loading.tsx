import { EsperaPantalla } from "@/components/ui/Espera";

// El editor de una campaña no tiene silueta propia: lo que hace es lo mismo que el loading general de la app. Existe porque `tienda-web/loading.tsx`
// es la silueta del Resumen, y sin este archivo el editor la heredaría.
export default function LoadingEditorCampana() {
  return (
    <>
      <EsperaPantalla />
      <div className="min-h-[40vh]" aria-busy="true" />
    </>
  );
}
