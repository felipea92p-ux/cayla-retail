import { requirePersonaActual } from "@/lib/persona";
import { getSedes } from "@/lib/sedes";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const persona = await requirePersonaActual();

  // Tiendas + taller para el selector de sede del Líder (una Encargada no cambia de sede).
  let sedesOperativas: { id: string; codigo: string }[] = [];
  if (persona.rol === "lider") {
    const sedes = await getSedes();
    sedesOperativas = sedes.filter((s) => s.tipo !== "almacen").map((s) => ({ id: s.id, codigo: s.codigo }));
  }

  return (
    <AppShell
      persona={{ nombre: persona.nombre, rol: persona.rol, sedeCodigo: persona.sedeCodigo, sedeId: persona.sedeId }}
      sedesOperativas={sedesOperativas}
    >
      {children}
    </AppShell>
  );
}
