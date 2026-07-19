import { requirePersonaActual } from "@/lib/persona";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const persona = await requirePersonaActual();

  // Tiendas + taller para el selector de sede del Líder (una Encargada no cambia de sede).
  let sedesOperativas: { id: string; codigo: string }[] = [];
  if (persona.rol === "lider") {
    const supabase = await createClient();
    const { data } = await supabase
      .from("sedes")
      .select("id, codigo, tipo")
      .neq("tipo", "almacen")
      .order("codigo");
    sedesOperativas = (data ?? []).map((s) => ({ id: s.id, codigo: s.codigo }));
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
