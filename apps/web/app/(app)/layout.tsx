import { requirePersonaActual } from "@/lib/persona";
import { getSedes } from "@/lib/sedes";
import { etiquetaSede } from "@/lib/etiqueta-sede";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const persona = await requirePersonaActual();

  // Tiendas + taller para el selector de sede del Líder (una Encargada no cambia de sede).
  //
  // Viaja la ETIQUETA, no el código: desde la unificación con Dynamic el código dejó
  // de ser legible para una persona — el Taller es `LIM` y la tienda de Lima es `003`,
  // así que el selector ofrecía "LIM" y "003" y había que saberse el mapa de memoria
  // para elegir bien. Se ordena por la etiqueta (y no por código) para que la lista se
  // lea en el mismo orden en que se ve.
  let sedesOperativas: { id: string; etiqueta: string }[] = [];
  if (persona.rol === "lider") {
    const sedes = await getSedes();
    sedesOperativas = sedes
      .filter((s) => s.tipo !== "almacen")
      .map((s) => ({ id: s.id, etiqueta: etiquetaSede(s) }))
      .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es"));
  }

  return (
    <AppShell
      persona={{
        nombre: persona.nombre,
        rol: persona.rol,
        sedeEtiqueta: persona.sedeEtiqueta,
        sedeId: persona.sedeId,
        sedeTipo: persona.sedeTipo,
      }}
      sedesOperativas={sedesOperativas}
    >
      {children}
    </AppShell>
  );
}
