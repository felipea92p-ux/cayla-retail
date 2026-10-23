"use client";

import { useState } from "react";
import { Car, HandCoins, Package, Shapes, ShoppingBag, Truck, User, UtensilsCrossed } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { diaMes } from "@/lib/fechas-lima";
import type { MovimientoCompradora } from "@/lib/mi-plata-reglas";

// «Hoy» de Mi plata para compras (maqueta docs/maquetas/compras-formidable-2026-10/): lo que compró, gastó y anotó en UNA lista, en orden,
// con su ícono, su monto (− lo que sale, + en verde lo que entra) y su estado dicho por quién lo hace. Antes eran tres listas que había
// que juntar en la cabeza. Lo de días anteriores espera bajo «Ver días anteriores». El orden y el corte por día: `movimientosDeLaCompradora`.
const ICONO: Record<MovimientoCompradora["icono"], typeof Car> = {
  compra: ShoppingBag,
  plata: HandCoins,
  taxi: Car,
  cargador: User,
  comida: UtensilsCrossed,
  envio: Truck,
  bolsas: Package,
  otro: Shapes,
};

function Fila({ m, conDia }: { m: MovimientoCompradora; conDia: boolean }) {
  const Icono = ICONO[m.icono];
  return (
    <li className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 py-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-full bg-hueso text-tinta">
        <Icono className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-tinta">{m.titulo}</span>
        <span className="block truncate text-xs text-taupe">
          {conDia && m.fecha ? `${diaMes(m.fecha)} · ` : ""}
          {m.detalle}
        </span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className={`whitespace-nowrap text-sm tabular-nums ${m.entra ? "text-verde" : "text-tinta"}`}>
          {m.entra ? "+" : "−"} {m.monto}
        </span>
        <Chip tono={m.estado.pendiente ? "ambar" : "verde"} title={m.estado.detalle}>
          {m.estado.texto}
        </Chip>
      </span>
    </li>
  );
}

export function ListaDelDia({ hoy, antes }: { hoy: MovimientoCompradora[]; antes: MovimientoCompradora[] }) {
  const [abierto, setAbierto] = useState(false);
  if (hoy.length === 0 && antes.length === 0) {
    return (
      <section className="flex flex-col gap-2" data-guia="mi-plata.hoy">
        <TituloSeccion>Hoy</TituloSeccion>
        <Vacio icono={<HandCoins aria-hidden />} titulo="Todavía no anotas nada" tamano="chico">
          Cuando te den plata, tócala en «Me dieron plata»; lo que compres y gastes aparece aquí.
        </Vacio>
      </section>
    );
  }
  return (
    <section className="flex min-w-0 flex-col gap-1" data-guia="mi-plata.hoy">
      <TituloSeccion cuenta={hoy.length}>Hoy</TituloSeccion>
      {hoy.length === 0 ? (
        <Vacio icono={<HandCoins aria-hidden />} titulo="Hoy todavía no anotas nada" tamano="chico" />
      ) : (
        <ul className="divide-y divide-sand">
          {hoy.map((m) => (
            <Fila key={m.clave} m={m} conDia={false} />
          ))}
        </ul>
      )}
      {antes.length > 0 && (
        <>
          <FilasDeMas abierto={abierto} id="mi-plata-antes">
            <ul className="divide-y divide-sand border-t border-sand">
              {antes.map((m) => (
                <Fila key={m.clave} m={m} conDia />
              ))}
            </ul>
          </FilasDeMas>
          <BotonVerMas
            forma="enlace"
            abierto={abierto}
            onCambiar={setAbierto}
            controla="mi-plata-antes"
            texto="Ver días anteriores"
            className="mt-2 self-start"
            data-guia="mi-plata.antes"
          />
        </>
      )}
    </section>
  );
}
