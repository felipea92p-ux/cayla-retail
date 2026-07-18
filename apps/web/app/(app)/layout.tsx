import Image from "next/image";
import Link from "next/link";
import { requirePersonaActual } from "@/lib/persona";
import { LogoutButton } from "@/components/LogoutButton";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const persona = await requirePersonaActual();

  return (
    <div className="min-h-screen bg-crema">
      {/* Separador header 1px Rojo CAYLA (brandbook · hoja membretada) */}
      <header className="border-b border-rojo/70 bg-crema">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/cayla-isotipo.png" alt="CAYLA" width={30} height={30} priority className="h-[30px] w-auto" />
            <span className="label-cayla text-[15px] text-tinta" style={{ letterSpacing: "0.28em" }}>
              CAYLA
            </span>
            <span className="ml-1 border-l border-tinta/15 pl-2.5 label-cayla text-[10px] text-taupe">
              {persona.sedeCodigo}
            </span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-tinta/70 sm:inline">
              {persona.nombre}
              <span className="ml-1.5 text-tinta/35">· {persona.rol === "lider" ? "Líder" : "Integrante"}</span>
            </span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 sm:py-10">{children}</main>
    </div>
  );
}
