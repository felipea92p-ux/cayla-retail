"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { borrarCopiasSinConexion } from "@/components/SinConexion";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        // «local»: cierra solo este equipo. El valor por defecto («global») revoca la sesión de la cuenta en TODOS
        // los equipos, y las cuentas de caja se comparten entre la tienda y otros dispositivos.
        // Las copias de pantallas para usar sin internet (ADR-0207) tienen datos de esta cuenta: se van con ella. Lo que
        // espera en las colas sin conexión NO se borra: es trabajo de la tienda que todavía no subió.
        await borrarCopiasSinConexion();
        await createClient().auth.signOut({ scope: "local" });
        router.push("/login");
        router.refresh();
      }}
      className="label-cayla text-[11px] text-tinta/70 transition-colors hover:text-rojo"
    >
      Salir
    </button>
  );
}
