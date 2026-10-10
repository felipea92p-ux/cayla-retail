import { CircleCheck } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { BotonEnlace } from "@/components/ui/campos";
import type { ConfianzaDelStock } from "@/lib/plan-compra-reglas";

// El aviso sobre el «Hay hoy» del plan de campaña (ADR-0349 + ADR-0346): «comprar = lo que conviene tener − lo que ya hay», y si lo que
// ya hay está incompleto la compra sale inflada sin que nadie lo vea. Dice qué tiendas no están al día y lleva a Conteo (solo a quien
// ve ese módulo). Si no se pudo comprobar, lo dice: nunca «confiable» por omisión. Solo mira las tiendas, no el Taller.

export function AvisoStock({ confianza, puedeContar }: { confianza: ConfianzaDelStock; puedeContar: boolean }) {
  if (confianza.estado === "confiable") {
    return (
      <p className="flex items-center gap-2 text-sm font-medium text-verde-profundo">
        <CircleCheck aria-hidden className="h-4 w-4 shrink-0" />
        Stock confiable: las tiendas tienen el piso cuadrado y el almacén contado.
      </p>
    );
  }
  if (confianza.estado === "sin-dato") {
    return (
      <Aviso tono="atencion" titulo="No se pudo verificar el stock">
        No se pudo comprobar si el «Hay hoy» de las tiendas está completo. Antes de comprar, revisa que el piso y el almacén de cada tienda estén al día.
      </Aviso>
    );
  }
  const sinAlDia = confianza.sedes.filter((s) => !s.alDia);
  return (
    <Aviso
      tono="atencion"
      titulo="El «Hay hoy» está incompleto"
      accion={
        puedeContar ? (
          <BotonEnlace href="/inventario/conteo" peso="fantasma">
            Ir a Conteo
          </BotonEnlace>
        ) : undefined
      }
    >
      {sinAlDia.length === 1 ? `${sinAlDia[0].nombre} no tiene` : `${sinAlDia.map((s) => s.nombre).join(" y ")} no tienen`} su stock al día, así que el plan te pediría{" "}
      <b className="font-semibold">comprar de más</b>. Cuéntalo antes de decidir.
      {/* Una píldora por tienda. Es un dato, no una frase: a 375 px salta de línea dentro de su tarjeta en vez de salirse (Formidable 2026-10-10). */}
      <span className="mt-2 flex flex-wrap gap-2">
        {confianza.sedes.map((s) => (
          <Chip key={s.nombre} tono={s.alDia ? "verde" : "ambar"} className="max-w-full whitespace-normal!">
            {s.nombre} · {s.alDia ? "al día" : s.falta}
          </Chip>
        ))}
      </span>
    </Aviso>
  );
}
