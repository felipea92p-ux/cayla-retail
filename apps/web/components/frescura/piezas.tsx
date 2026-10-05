import { Info, MoveRight, Package, ScanSearch, CircleHelp, Truck, ArrowDownToLine, ClipboardCheck, PackageCheck, Tag, type LucideIcon } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { trozosRicos, type EstadoVista, type TextoRico } from "@/lib/frescura-pantalla";
import type { NivelConfianza, Sugerencia } from "@/lib/frescura-reglas";

// Piezas chicas de Frescura del piso (ADR-0208, paso 4) que usan la fila, la hoja de detalle y «Las N tiendas». Todo
// color sale de los tokens (ADR-0169) y de los tonos de `Chip`: la Crítica es el tono `tinta`, nunca rojo (colores A).

/** El estado de una prenda: el chip y, debajo, «aproximado» si se juzgó con pocas ventas; la apartada dice en qué iba. */
export function EstadoChip({ estado, apilado = true }: { estado: EstadoVista; apilado?: boolean }) {
  return (
    <span className={apilado ? "flex flex-col items-start gap-0.5" : "inline-flex flex-wrap items-center gap-x-2 gap-y-0.5"}>
      <Chip tono={estado.tono} tachado={false} className="!whitespace-normal !rounded-[11px]">
        {estado.icono && <Info aria-hidden className="h-3 w-3 shrink-0" />}
        {estado.texto}
      </Chip>
      {estado.debajo.map((d) => (
        <span key={d} className="text-[11px] leading-snug text-taupe">
          {d}
        </span>
      ))}
      {estado.previo && <span className="text-[11.5px] leading-snug text-taupe">{estado.previo}</span>}
    </span>
  );
}

/** Cuánto creerle a una cifra: «Pocos datos» (ámbar), «Aceptable» (neutro); sólida no lleva nada. */
export function NivelChip({ nivel }: { nivel: NivelConfianza | null }) {
  if (nivel === "pocos_datos")
    return (
      <Chip tono="ambar" className="!px-2 !text-[11.5px] !leading-[18px]">
        Pocos datos
      </Chip>
    );
  if (nivel === "aceptable")
    return (
      <Chip tono="neutro" className="!px-2 !text-[11.5px] !leading-[18px]">
        Aceptable
      </Chip>
    );
  return null;
}

/** Un texto con `**negritas**`: las partes marcadas van en tinta y peso 600. */
export function TextoConNegritas({ texto }: { texto: TextoRico }) {
  return (
    <>
      {trozosRicos(texto).map((t, i) =>
        t.negrita ? (
          <b key={i} className="font-semibold text-tinta">
            {t.texto}
          </b>
        ) : (
          <span key={i}>{t.texto}</span>
        ),
      )}
    </>
  );
}

/** El ícono de cada sugerencia (el mismo en la fila y en la hoja). */
export const ICONO_SUGERENCIA: Record<Sugerencia | "contar", LucideIcon> = {
  revisar_ventas: ScanSearch,
  cambiar_lugar: MoveRight,
  trasladar: Truck,
  retirar: ArrowDownToLine,
  sigue_vendiendo: CircleHelp,
  guardar_hasta_su_estacion: Package,
  dejar_hasta_agotar: PackageCheck,
  rebaja_chica: Tag,
  contar: ClipboardCheck,
};
