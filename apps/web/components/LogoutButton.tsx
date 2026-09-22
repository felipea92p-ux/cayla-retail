"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        // «local»: cierra solo este equipo. El valor por defecto («global») revoca la sesión de la cuenta en TODOS
        // los equipos, y las cuentas de caja se comparten entre la tienda y otros dispositivos.
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
