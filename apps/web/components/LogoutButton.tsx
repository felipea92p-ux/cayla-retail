"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await createClient().auth.signOut();
        // El service worker del conteo (ADR-0034) guarda el ÚLTIMO documento de
        // `/inventario/conteo` que se cargó con internet, y ese documento trae el catálogo y
        // la sede de quien lo cargó. En un equipo compartido —que es lo normal en tienda—,
        // sin esto la siguiente persona podría ver sin red la pantalla de la anterior.
        // Va antes de navegar y no espera respuesta: si el worker no existe o el mensaje se
        // pierde, salir no se puede quedar trabado por eso. La red de seguridad es el
        // `activate` del propio worker, que borra toda caché que no sea de su versión.
        navigator.serviceWorker?.controller?.postMessage("cayla:limpiar");
        router.push("/login");
        router.refresh();
      }}
      className="label-cayla text-[11px] text-tinta/70 transition-colors hover:text-rojo"
    >
      Salir
    </button>
  );
}
