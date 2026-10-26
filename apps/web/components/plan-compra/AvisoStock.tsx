import { CircleCheck } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { Boton } from "@/components/ui/campos";
import type { ConfianzaDelStock } from "@/lib/plan-compra-reglas";
import { BotonVer } from "@/components/ui/BotonDescargar";

// El aviso sobre el «Hay hoy» del plan de campaña (ADR-0349 + ADR-0346): «comprar = lo que conviene tener − lo que ya hay», y si lo que
// ya hay está incompleto la compra sale inflada sin que nadie lo vea. Dice qué tiendas no están al día y lleva a Conteo (solo a quien
// ve ese módulo). Si no se pudo comprobar, lo dice: nunca «confiable» por omisión. Solo mira las tiendas, no el Taller.

export function AvisoStock({ confianza, puedeContar, frasePlazo = null }: { confianza: ConfianzaDelStock; puedeContar: boolean; /** Hasta cuándo contarlo (`fraseDelConteoAntesDelPlazo`); sin ella, la frase de siempre. */ frasePlazo?: string | null }) {
  if (confianza.estado === "confiable") {
    return (
      <p data-guia="plan.stock" className="flex items-center gap-2 text-sm font-medium text-verde-profundo">
        <CircleCheck aria-hidden className="h-4 w-4 shrink-0" />
        Stock confiable: las tiendas tienen el piso cuadrado y el almacén contado.
      </p>
    );
  }
  if (confianza.estado === "sin-dato") {
    return (
      <Aviso guia="plan.stock" tono="atencion" titulo="No se pudo verificar el stock">
        No se pudo comprobar si el «Hay hoy» de las tiendas está completo. Antes de comprar, revisa que el piso y el almacén de cada tienda estén al día.
      </Aviso>
    );
  }
  const sinAlDia = confianza.sedes.filter((s) => !s.alDia);
  return (
    <Aviso
      guia="plan.stock"
      tono="atencion"
      titulo="El «Hay hoy» está incompleto"
      accion={
        puedeContar ? (
          <BotonVer href="/inventario/conteo">Ir a Conteo</BotonVer>
        ) : undefined
      }
    >
      {sinAlDia.length === 1 ? `${sinAlDia[0].nombre} no tiene` : `${sinAlDia.map((s) => s.nombre).join(" y ")} no tienen`} su stock al día, así que el plan te pediría{" "}
      <b className="font-semibold">comprar de más</b>. {frasePlazo ?? "Cuéntalo antes de decidir."}
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

/** «Lima y Trujillo» / «Lima, Arequipa y Trujillo». */
const enLista = (nombres: readonly string[]) => (nombres.length <= 1 ? (nombres[0] ?? "") : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`);

/**
 * El mismo aviso en UNA línea, sobre la tabla (prompt maestro 2026-10-13). Desde que el resumen vive en un cajón (Felipe 2026-10-12), lo
 * único que decía que el «Hay hoy» no es confiable era un número rojo sobre un ícono sin texto: la prueba ciega solo lo encontró tocándolo.
 * El detalle (qué falta en cada tienda, «Ir a Conteo») sigue en el cajón; esta línea lo abre.
 */
export function AvisoStockEnLinea({ confianza, onVer, frasePlazo = null }: { confianza: ConfianzaDelStock; onVer: () => void; frasePlazo?: string | null }) {
  if (confianza.estado === "confiable") return null;
  const sinAlDia = confianza.sedes.filter((s) => !s.alDia).map((s) => s.nombre);
  return (
    <Aviso
      tono="atencion"
      chico
      guia="plan.stock-linea"
      accion={
        <Boton peso="discreto" onClick={onVer}>
          Ver qué falta
        </Boton>
      }
    >
      {confianza.estado === "sin-dato" || sinAlDia.length === 0
        ? "No se pudo comprobar si el stock de las tiendas está al día: «Hay hoy» puede no ser exacto"
        : `${enLista(sinAlDia)} ${sinAlDia.length === 1 ? "no tiene" : "no tienen"} el stock al día: «Hay hoy» puede no ser exacto${frasePlazo ? `. ${frasePlazo}` : ""}`}
    </Aviso>
  );
}
