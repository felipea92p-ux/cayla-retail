import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import type { FilaTela } from "@/lib/produccion-decisiones";
import { AYUDA_TELA, insigniaDeTela, paresDeTela, pedidosDeTela } from "@/lib/produccion-en-orden";
import { ParesDeDatos } from "./ParesDeDatos";
import { PorQue } from "./PorQue";

/**
 * «¿Alcanza la tela?»: lo que despliega el recuadro de telas de «Lo demás está en orden». Cada tela con su insignia (si alcanza para lo que piden las órdenes abiertas) y sus datos en
 * piezas —«Hay», «Se necesitan», «En camino»—, sin frases con punto medio. De qué pedidos viene queda a un toque, y cómo se hace la cuenta, en el «?» del título. Componente de
 * servidor: sin «Pedir» desde el 2026-11-25 (ADR-0702); la tela se compra y se recibe en Insumos ▸ «Llegó una compra».
 */
export function TelasDelTaller({ telas }: { telas: readonly FilaTela[] }) {
  return (
    <div data-guia="prod-resumen.tela-detalle" className="space-y-2.5">
      <TituloSeccion nivel={3} cuenta={telas.length} ayuda={AYUDA_TELA}>
        ¿Alcanza la tela?
      </TituloSeccion>
      <ul className="card-cayla @container overflow-hidden">
        {telas.map((t) => {
          const insignia = insigniaDeTela(t);
          return (
            <li key={t.insumoId} className="grid grid-cols-1 items-center gap-x-8 gap-y-2 border-b border-sand px-4 py-3.5 last:border-b-0 @min-[40rem]:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="min-w-0 break-words text-sm font-medium text-tinta">{t.nombre}</span>
                  <Chip tono={insignia.tono}>{insignia.texto}</Chip>
                </div>
                <PorQue texto={pedidosDeTela(t)} pregunta="Ver los pedidos" />
              </div>
              <ParesDeDatos pares={paresDeTela(t)} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
