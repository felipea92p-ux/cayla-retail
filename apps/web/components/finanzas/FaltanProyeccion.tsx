// La lista de lo que falta para que la proyección de caja deje de ser provisional (ADR-0433, actividad 4). La usan «Hoy tienes» del Flujo y
// «¿Me alcanza?» de Cuentas y dinero: una sola pieza, para que las dos pantallas digan lo mismo y lleven al mismo lugar.
import Link from "next/link";
import { Aviso } from "@/components/ui/Aviso";
import type { FaltaProy } from "@/lib/flujo-caja-reglas";

export function FaltanProyeccion({ provisional, faltan, className = "" }: { provisional: boolean; faltan: readonly FaltaProy[]; className?: string }) {
  if (faltan.length === 0) return null;
  return (
    <Aviso tono={provisional ? "atencion" : "info"} titulo={provisional ? "Esta cifra es provisional" : "Para afinar la proyección"} className={className}>
      <ul className="list-disc pl-5">
        {faltan.map((f) => (
          <li key={f.clave}>
            {f.texto}
            {f.href && (
              <>
                {" "}
                <Link href={f.href} className="btn-cayla btn-enlace">
                  Ir a cargarlo
                </Link>
              </>
            )}
          </li>
        ))}
      </ul>
    </Aviso>
  );
}
