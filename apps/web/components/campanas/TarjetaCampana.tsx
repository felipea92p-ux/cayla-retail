import Link from "next/link";
import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { datosDeCampana, diasEntre, estadoDeCampana, porQueNoSale, type Campana } from "@/lib/campanas-reglas";
import { PortadaMini } from "./PortadaMini";

/** La insignia de cada estado (`<Chip>`): la que está en la web, viva; lo que viene, en ámbar; lo que pasó, apagado. */
function ChipDeEstado({ c, enPortada, hoy }: { c: Campana; enPortada: boolean; hoy: string }) {
  const e = estadoDeCampana(c, hoy);
  if (e === "vigente") return enPortada ? <Chip tono="verde" vivo>En la web ahora</Chip> : <Chip tono="pizarra">Vigente</Chip>;
  if (e === "proxima") {
    const n = diasEntre(hoy, c.desde!);
    return <Chip tono="ambar">{n === 1 ? "Mañana" : `En ${n} días`}</Chip>;
  }
  if (e === "por_aprobar") return <Chip tono="ambar">Por aprobar</Chip>;
  if (e === "sin_fechas") return <Chip tono="neutro">Sin fechas</Chip>;
  if (e === "termino") return <Chip tono="neutro">Terminó</Chip>;
  return (
    <Chip tono="apagado" tachado={false}>
      Desactivada
    </Chip>
  );
}

/** Una campaña de la lista: su portada en chico, en qué está, cómo se llama y lo que trae (fechas, descuento, prendas). Toda la tarjeta
 *  lleva a la campaña por dentro (sus Datos y sus Prendas). */
export function TarjetaCampana({ c, enPortada, hoy, i }: { c: Campana; enPortada: Campana | null; hoy: string; i: number }) {
  const apagada = ["termino", "desactivada"].includes(estadoDeCampana(c, hoy));
  const razon = porQueNoSale(c, enPortada, hoy);
  return (
    <Link href={`/tienda-web/campanas/${c.id}`} className="tw-campana tw-entra" data-apagada={apagada ? "" : undefined} style={{ ["--i" as string]: i }}>
      <PortadaMini nombre={c.nombre} hasta={c.hasta} />
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div>
          <ChipDeEstado c={c} enPortada={enPortada?.id === c.id} hoy={hoy} />
        </div>
        <TituloSeccion nivel={3}>{c.nombre}</TituloSeccion>
        <p className="text-[13px] text-tinta/70">{datosDeCampana(c).join(" · ")}</p>
        {razon && <p className="text-[13px] text-ambar-profundo">{razon}</p>}
      </div>
    </Link>
  );
}
