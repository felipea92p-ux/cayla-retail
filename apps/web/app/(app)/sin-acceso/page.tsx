import Link from "next/link";
import { MODULOS, esClaveModulo } from "@/lib/modulos";

// «Sin acceso» (ADR-0161 B2): a dónde cae quien llega por URL directa a un módulo que su rol no ve (`exigirModulo`).
// Dice qué módulo es y a quién pedírselo; no dice por qué ni muestra nada del módulo. El candado real sigue en la base.
export default async function SinAccesoPage({ searchParams }: { searchParams: Promise<{ modulo?: string }> }) {
  const { modulo } = await searchParams;
  const nombre = modulo && esClaveModulo(modulo) ? MODULOS.find((m) => m.clave === modulo)?.nombre : null;

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="card-cayla anim-entrada max-w-md p-8 text-center">
        <p className="label-cayla text-[11px] text-taupe-profundo">Sin acceso</p>
        <h1 className="font-display mt-2 text-2xl text-tinta">{nombre ? `Tu rol no ve «${nombre}»` : "Tu rol no ve este módulo"}</h1>
        <p className="mt-3 text-sm text-tinta/75">
          Lo que ve cada cuenta lo decide su rol. Si necesitas entrar aquí, pídele a un líder de equipo que lo active en
          Colaboradores, en la pestaña Roles y accesos.
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/" className="label-cayla alza-cayla rounded-md bg-tinta px-5 py-2.5 text-[11px] text-crema hover:bg-rojo">
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
