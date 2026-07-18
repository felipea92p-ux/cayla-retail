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
      className="label-cayla text-[10px] text-tinta/50 transition-colors hover:text-rojo"
    >
      Salir
    </button>
  );
}
