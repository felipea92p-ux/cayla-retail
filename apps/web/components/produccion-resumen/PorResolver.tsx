import Link from "next/link";
import { ArrowRight, CircleCheck, Clock, DollarSign, Package, PackageCheck, PackageMinus, Pause, TrendingUp, type LucideIcon } from "lucide-react";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { BotonEnlace } from "@/components/ui/campos";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import type { Decision, DecisionesOcultas } from "@/lib/produccion-decisiones";
import { AYUDA_POR_RESOLVER } from "@/lib/produccion-en-orden";
import type { HojaDeModelo } from "@/lib/produccion-hoja-modelo";
import type { PresentacionDeModelo } from "@/lib/produccion-presentacion";
import { FilaQueAbreLaHoja } from "./FilaQueAbreLaHoja";
import { ParesDeDatos } from "./ParesDeDatos";
import { PorQue } from "./PorQue";

// «Por resolver» (antes «Para decidir»; «Producción más clara», 2026-11-26): lo demás que pide acción hoy, del más urgente al menos. Cada asunto es una tarjeta con su ícono en una
// lente, un título corto que se entiende solo, una línea que dice de qué o de quién habla y sus datos en piezas, más el botón que lo resuelve. La cuenta de la que sale queda bajo
// «¿Por qué?». Componente de servidor: los textos llegan hechos de `lib/produccion-decisiones.ts`.

const BORDE_SEVERIDAD: Record<Decision["severidad"], string> = { 3: "border-l-ambar", 2: "border-l-ambar/45", 1: "border-l-tinta/20" };

const ICONO: Record<Decision["tipo"], LucideIcon> = {
  entrega: Clock,
  insumo: Package,
  recibir: PackageCheck,
  pago: DollarSign,
  producir: TrendingUp,
  trasladar: ArrowRight,
  sobrestock: Pause,
  minimo: PackageMinus,
};

/** El botón del asunto: lo que solo lleva a mirar otra pantalla va con la flecha de «Ver» (ADR-0358); lo que abre la hoja de un modelo, con su botón; lo demás es la acción. */
function Accion({ d, hojas, presentaciones }: { d: Decision; hojas: Record<string, HojaDeModelo>; presentaciones: Record<string, PresentacionDeModelo> }) {
  const lugar = "col-span-2 w-full @min-[30rem]:col-span-1 @min-[30rem]:w-auto @min-[30rem]:justify-self-end";
  const hoja = d.accion.modelo ? hojas[d.accion.modelo] : undefined;
  if (d.accion.modelo && hoja)
    return (
      <FilaQueAbreLaHoja hoja={hoja} presentacion={presentaciones[d.accion.modelo]} className={`btn-cayla btn-secundario inline-flex items-center justify-center ${lugar}`}>
        {d.accion.texto}
      </FilaQueAbreLaHoja>
    );
  if (d.accion.ver)
    return (
      <BotonVer href={d.accion.href} className={lugar}>
        {d.accion.texto}
      </BotonVer>
    );
  return (
    <BotonEnlace href={d.accion.href} className={lugar}>
      {d.accion.texto}
    </BotonEnlace>
  );
}

export function PorResolver({
  decisiones,
  ocultas,
  totalAsuntos,
  hojas,
  presentaciones,
  aLoAncho = false,
}: {
  /** El bloque ocupa todo el ancho de la pantalla (cuando «Qué fabricar primero» no tiene nada): los asuntos van de a dos si caben. */
  aLoAncho?: boolean;
  decisiones: Decision[];
  /** Los asuntos que no cupieron, por clase: nunca se cortan en silencio. */
  ocultas: DecisionesOcultas[];
  /** Todos los asuntos que hay (los que se ven y los que no). */
  totalAsuntos: number;
  hojas: Record<string, HojaDeModelo>;
  presentaciones: Record<string, PresentacionDeModelo>;
}) {
  return (
    <section data-guia="prod-resumen.decidir" aria-label="Por resolver" className="min-w-0 space-y-3">
      {/* Cuántos asuntos hay de verdad, en el globito (ADR-0358, ronda 9); lo que explica el bloque, en su «?». */}
      <TituloSeccion cuenta={totalAsuntos > 0 ? totalAsuntos : undefined} ayuda={AYUDA_POR_RESOLVER}>
        Por resolver
      </TituloSeccion>
      {decisiones.length === 0 ? (
        <div className="card-cayla">
          <Vacio tamano="chico" icono={<CircleCheck />}>
            <b className="font-semibold text-tinta">Nada por resolver.</b> Ningún asunto pide tu decisión ahora.
          </Vacio>
        </div>
      ) : (
        // La lista es el contenedor: cada tarjeta decide por SU ancho si el botón cabe al costado o baja a todo el ancho (la columna de dos, el celular).
        <ul className={`@container ${aLoAncho ? "grid grid-cols-1 items-start gap-2.5 min-[90rem]:grid-cols-2" : "space-y-2.5"}`}>
          {decisiones.map((d, i) => {
            const Icono = ICONO[d.tipo];
            return (
              <li
                key={d.id}
                data-guia={i === 0 ? "prod-resumen.asunto" : undefined}
                className={`card-cayla anim-entra grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-l-4 px-4 py-3.5 @min-[30rem]:grid-cols-[auto_minmax(0,1fr)_auto] ${BORDE_SEVERIDAD[d.severidad]}`}
                style={{ ["--i" as string]: Math.min(i, 8) }}
              >
                <span aria-hidden className="vd-lente grid size-11 shrink-0 place-items-center rounded-full text-tinta">
                  <Icono className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold leading-tight text-tinta">{/* unificar-fijo: el nombre de un asunto de la lista, un dato y no el título de una sección */}{d.titulo}</h3>
                  {d.de && <p className="mt-0.5 break-words text-detalle text-tenue">{d.de}</p>}
                  <ParesDeDatos pares={d.pares} className="mt-2" />
                  <PorQue texto={d.porque} />
                </div>
                <Accion d={d} hojas={hojas} presentaciones={presentaciones} />
              </li>
            );
          })}
        </ul>
      )}
      {ocultas.length > 0 && (
        <p data-guia="prod-resumen.mas" className="px-1 text-sm text-secundario">
          Y{" "}
          {ocultas.map((o, i) => (
            <span key={o.tipo}>
              {i > 0 && (i === ocultas.length - 1 ? " y " : ", ")}
              <Link href={o.href} className="btn-enlace">
                {o.cantidad} {o.texto}
              </Link>
            </span>
          ))}{" "}
          más, que no caben aquí.
        </p>
      )}
    </section>
  );
}
