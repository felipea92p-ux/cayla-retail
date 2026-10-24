"use client";

import { useRef, useState, type ReactNode } from "react";
import { ChevronRight, Flag, HandCoins, ShoppingBag, Undo2, type LucideIcon } from "lucide-react";
import { ICONO_GASTO } from "./iconos";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { diaMes } from "@/lib/fechas-lima";
import type { EntradaHistorial, MovimientoCompradora } from "@/lib/mi-plata-reglas";

// La lista de Mis compras (maqueta docs/maquetas/compras-formidable-2026-10/): lo que compró, gastó y anotó en UNA lista, en
// orden, con su ícono, su monto (− lo que sale, + en verde lo que entra) y su estado dicho por quién lo hace. Antes eran tres listas que
// había que juntar en la cabeza. Arriba, lo de la ronda abierta («En esta ronda», 20261023183000). El orden y el corte:
// `movimientosDeLaCompradora`.
//
// «Ver rondas anteriores» (Felipe 2026-10-23, revisándolo en el celular): ahí ya no va todo suelto. Arriba solo la plata que le dieron, lo
// que devolvió al cerrar una ronda y una fila por ronda; al tocar una ronda se abre una hoja con sus compras y lo de «Gasté en otra cosa»,
// cuánto salió de su plata y cómo cerró. El agrupado: `historialDeLaCompradora`.
const ICONO: Record<MovimientoCompradora["icono"], LucideIcon> = { compra: ShoppingBag, plata: HandCoins, ...ICONO_GASTO };

/** La cara de una fila: ícono, título y detalle a la izquierda (hasta dos líneas cada uno), monto y estado a la derecha. */
function Cara({
  icono: Icono,
  titulo,
  detalle,
  entra,
  monto,
  estado,
  extra,
}: {
  icono: LucideIcon;
  titulo: string;
  detalle: string;
  entra: boolean;
  monto: string;
  /** Sin estado (una ronda): el monto solo, y el título tiene el ancho. */
  estado?: { texto: string; detalle: string; pendiente: boolean };
  extra?: ReactNode;
}) {
  return (
    <>
      <span className="grid h-9 w-9 place-items-center rounded-full bg-hueso text-tinta">
        <Icono className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0">
        {/* Hasta dos líneas, no una cortada: a 375 px el monto y el estado se llevan la derecha y «Compra a CAYLA S…» o
            «RC-000001 · 23/10 · Si…» ya no decían a quién ni qué faltaba. */}
        <span className="line-clamp-2 block text-sm font-medium text-tinta">{titulo}</span>
        <span className="line-clamp-2 block text-xs text-taupe">{detalle}</span>
      </span>
      <span className="flex flex-col items-end gap-1">
        <span className={`whitespace-nowrap text-sm tabular-nums ${entra ? "text-verde" : "text-tinta"}`}>
          {entra ? "+" : "−"} {monto}
        </span>
        {estado && (
          <Chip tono={estado.pendiente ? "ambar" : "verde"} title={estado.detalle}>
            {estado.texto}
          </Chip>
        )}
      </span>
      {extra}
    </>
  );
}

/** Una compra, un gasto o una plata. `prefijo`: lo que va antes del detalle (la ronda y el día, o solo el día dentro de una ronda). */
function Fila({ m, prefijo = [] }: { m: MovimientoCompradora; prefijo?: (string | null)[] }) {
  const antes = prefijo.filter(Boolean).map((x) => `${x} · `).join("");
  return (
    <li className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 py-2.5">
      <Cara icono={ICONO[m.icono]} titulo={m.titulo} detalle={`${antes}${m.detalle}`} entra={m.entra} monto={m.monto} estado={m.estado} />
    </li>
  );
}

/** Una ronda cerrada: la fila se toca y abre una hoja con lo que compró y gastó en ella (Felipe 2026-10-23: «que se cargue un modal»,
 *  no que se despliegue en la lista). La hoja solo se lee: se cierra con la ×. */
function FilaRonda({ e }: { e: Extract<EntradaHistorial, { tipo: "ronda" }> }) {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLButtonElement>(null);
  return (
    <li>
      <button
        ref={origen}
        type="button"
        aria-haspopup="dialog"
        onClick={() => setAbierta(true)}
        className="grid w-full grid-cols-[36px_minmax(0,1fr)_auto_16px] items-center gap-2.5 py-2.5 text-left"
      >
        <Cara
          icono={Flag}
          titulo={e.titulo}
          detalle={e.detalle}
          entra={false}
          monto={e.monto}
          // Sin estado: cada compra y gasto de la hoja dice el suyo, y a 375 px el chip partía «Ronda RC-000002» en dos líneas.
          extra={<ChevronRight className="h-4 w-4 text-taupe" aria-hidden />}
        />
      </button>
      {abierta && (
        <Modal titulo={e.titulo} subtitulo={e.detalle} onClose={() => setAbierta(false)} variante="hoja" tamano="mediana" conCerrar alCerrarEnfocar={origen}>
          <div className="space-y-4">
            {e.movimientos.length > 0 ? (
              <ul className="divide-y divide-sand">
                {e.movimientos.map((m) => (
                  <Fila key={m.clave} m={m} prefijo={[m.fecha ? diaMes(m.fecha) : null]} />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-taupe">En esta ronda no anotaste compras ni gastos.</p>
            )}
            <p className="flex items-baseline justify-between gap-3 border-t border-sand pt-3 text-sm">
              <span className="text-tinta/65">Salió de tu plata</span>
              <span className="font-serif text-2xl tabular-nums text-tinta">{e.monto}</span>
            </p>
            {e.cierre && <p className="nota-cayla text-sm">{e.cierre}</p>}
          </div>
        </Modal>
      )}
    </li>
  );
}

function FilaHistorial({ e }: { e: EntradaHistorial }) {
  if (e.tipo === "plata") return <Fila m={e.mov} prefijo={[e.mov.ronda, e.mov.fecha ? diaMes(e.mov.fecha) : null]} />;
  if (e.tipo === "ronda") return <FilaRonda e={e} />;
  return (
    <li className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 py-2.5">
      <Cara icono={e.decision === "devuelve" ? Undo2 : HandCoins} titulo={e.titulo} detalle={e.detalle} entra={e.entra} monto={e.monto} estado={e.estado} />
    </li>
  );
}

export function ListaDelDia({ actuales, historial, titulo }: { actuales: MovimientoCompradora[]; historial: EntradaHistorial[]; titulo: string }) {
  const [abierto, setAbierto] = useState(false);
  if (actuales.length === 0 && historial.length === 0) {
    return (
      <section className="flex flex-col gap-2" data-guia="mi-plata.hoy">
        <TituloSeccion>{titulo}</TituloSeccion>
        <Vacio icono={<HandCoins aria-hidden />} titulo="Todavía no anotas nada" tamano="chico">
          Cuando te den plata, tócala en «Me dieron plata»; lo que compres y gastes aparece aquí.
        </Vacio>
      </section>
    );
  }
  return (
    <section className="flex min-w-0 flex-col gap-1" data-guia="mi-plata.hoy">
      <TituloSeccion cuenta={actuales.length}>{titulo}</TituloSeccion>
      {actuales.length === 0 ? (
        <Vacio icono={<HandCoins aria-hidden />} titulo="Todavía no anotas nada aquí" tamano="chico" />
      ) : (
        <ul className="divide-y divide-sand">
          {actuales.map((m) => (
            <Fila key={m.clave} m={m} />
          ))}
        </ul>
      )}
      {historial.length > 0 && (
        <>
          <FilasDeMas abierto={abierto} id="mi-plata-antes">
            <ul className="divide-y divide-sand border-t border-sand">
              {historial.map((e) => (
                <FilaHistorial key={e.clave} e={e} />
              ))}
            </ul>
          </FilasDeMas>
          <BotonVerMas
            forma="enlace"
            abierto={abierto}
            onCambiar={setAbierto}
            controla="mi-plata-antes"
            texto="Ver rondas anteriores"
            className="mt-2 self-start"
            data-guia="mi-plata.antes"
          />
        </>
      )}
    </section>
  );
}
