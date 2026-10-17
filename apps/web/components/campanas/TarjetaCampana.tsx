import Link from "next/link";
import { DISENO_DE_SIEMPRE } from "@cayla-retail/portada";
import { Chip } from "@/components/ui/Chip";
import { BotonEnlace } from "@/components/ui/campos";
import { BotonEditar } from "@/components/ui/BotonEditar";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { datosDeCampana, diasEntre, disenoDeLaLista, estadoDeCampana, porQueNoSale, type Campana, type CampanaDeLista } from "@/lib/campanas-reglas";
import { Lienzo } from "./Lienzo";
import { PortadaDeCampana } from "./PortadaDeCampana";

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

/**
 * Una campaña de la lista (maqueta, pantalla 1): su portada en chico —la que ve el cliente hoy, con la MISMA pieza de la tienda—, en qué
 * está, si su diseño es el de siempre o tiene un borrador sin publicar, cómo se llama y lo que trae. Dos caminos: el diseño (la pestaña
 * con que abre la campaña; también al tocar la portada) y sus Datos y prendas.
 */
export function TarjetaCampana({ c, enPortada, hoy, i, ahora }: { c: CampanaDeLista; enPortada: Campana | null; hoy: string; i: number; ahora: number }) {
  const estado = estadoDeCampana(c, hoy);
  const apagada = estado === "termino" || estado === "desactivada";
  const razon = porQueNoSale(c, enPortada, hoy);
  const diseno = disenoDeLaLista(c);
  const href = `/tienda-web/campanas/${c.id}`;
  return (
    <article className="tw-campana tw-entra" data-apagada={apagada ? "" : undefined} style={{ ["--i" as string]: i }}>
      {/* La portada lleva al mismo lugar que el botón del diseño: para el teclado y el lector basta el botón. */}
      <Link href={href} className="tw-campana-mini" tabIndex={-1} aria-hidden>
        <Lienzo ancho={1280} alto={720}>
          <PortadaDeCampana campana={c} diseno={c.diseno ?? DISENO_DE_SIEMPRE} tema="claro" piezas={c.piezas} ahora={ahora} />
        </Lienzo>
      </Link>
      <div className="flex flex-1 flex-col gap-1.5 p-4">
        <div className="flex flex-wrap gap-1.5">
          <ChipDeEstado c={c} enPortada={enPortada?.id === c.id} hoy={hoy} />
          {diseno === "de-siempre" ? (
            <Chip tono="neutro" title="Sale con el rojo de siempre: todavía no tiene un diseño propio publicado">
              Diseño de siempre
            </Chip>
          ) : diseno === "borrador" ? (
            <Chip tono="ambar" title="Hay cambios en su diseño que el cliente todavía no ve">
              Borrador
            </Chip>
          ) : null}
        </div>
        <TituloSeccion nivel={3}>{c.nombre}</TituloSeccion>
        <p className="text-[13px] text-tinta/70">{datosDeCampana(c).join(" · ")}</p>
        {razon && <p className="text-[13px] text-ambar-profundo">{razon}</p>}
        <div className="mt-auto flex flex-wrap gap-2 pt-2">
          {apagada ? (
            <BotonEnlace href={href} className="btn-chico">
              Ver diseño
            </BotonEnlace>
          ) : c.diseno ? (
            <BotonEditar href={href} chico>
              Editar diseño
            </BotonEditar>
          ) : (
            <BotonEnlace href={href} peso="primario" className="btn-chico">
              Darle su diseño
            </BotonEnlace>
          )}
          <BotonEnlace href={`${href}?pestana=datos`} className="btn-chico">
            Datos y prendas
          </BotonEnlace>
        </div>
      </div>
    </article>
  );
}
