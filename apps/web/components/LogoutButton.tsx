"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await createClient().auth.signOut();
        router.push("/login");
        router.refresh();
      }}
      className="label-cayla text-[11px] text-tinta/70 transition-colors hover:text-rojo"
    >
      Salir
    </button>
  );
}
