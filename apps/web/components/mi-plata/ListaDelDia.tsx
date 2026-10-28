"use client";

import { useRef, useState, type ReactNode, type RefObject } from "react";
import { ChevronRight, Flag, HandCoins, Undo2, type LucideIcon } from "lucide-react";
import { ICONO_MOVIMIENTO } from "./iconos";
import { DetalleDeFila } from "./DetalleDeFila";
import { TablaDeLaRonda } from "./TablaDeLaRonda";
import { soles } from "@/lib/compras-reglas";
import { Chip } from "@/components/ui/Chip";
import { Modal } from "@/components/ui/Modal";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { diaMes } from "@/lib/fechas-lima";
import { enviosDeLaFila, resumenDeEnvios, type EnvioMio, type RondaConEnvios } from "@/lib/mis-envios-reglas";
import { FilaEnvio } from "./FilaEnvio";
import { horaDeMovimiento, totalesDeLaLista, type EntradaHistorial, type MovimientoCompradora } from "@/lib/mi-plata-reglas";

// La lista de Mis compras (maqueta docs/maquetas/mis-compras-rediseno-2026-10/, Felipe 2026-10-24): lo que compró, gastó y anotó en UNA
// lista, en orden, con su ícono, la hora a la que lo anotó, su monto (− lo que sale, + en verde lo que entra) y su estado dicho por quién
// lo hace (en pizarra, informativo: lo que falta lo hace Compras, no ella). Al tocar una fila, una hoja dice qué hará Compras con eso.
// Arriba, lo de la ronda abierta («En esta ronda», 20261023183000). El orden y el corte: `movimientosDeLaCompradora`.
//
// «Ver rondas anteriores» (Felipe 2026-10-23, revisándolo en el celular): ahí ya no va todo suelto. Arriba solo la plata que le dieron, lo
// que devolvió al cerrar una ronda y una fila por ronda; al tocar una ronda se abre una hoja con sus compras y lo de «Gasté en otra cosa»,
// cuánto salió de su plata y cómo cerró. El agrupado: `historialDeLaCompradora`.

/** La cara de una fila: ícono, título y detalle a la izquierda (hasta dos líneas cada uno), monto y estado a la derecha. */
function Cara({
  hora,
  chips,
  icono: Icono,
  titulo,
  detalle,
  entra,
  monto,
  estado,
  extra,
}: {
  /** La hora a la que anotó algo: bajo el monto (en «En esta ronda»). */
  hora?: string | null;
  /** Los estados de la fila (lo del envío y quién lo revisa), en su propia línea bajo el texto, en vez del chip suelto a la derecha. */
  chips?: ReactNode;
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
        {hora && <span className="text-xs tabular-nums text-taupe">{hora}</span>}
        {estado && !chips && (
          <Chip tono={estado.pendiente ? "pizarra" : "verde"} title={estado.detalle}>
            {estado.texto}
          </Chip>
        )}
      </span>
      {chips && <span className="col-span-2 col-start-2 flex flex-wrap gap-1.5">{chips}</span>}
      {extra}
    </>
  );
}

/** Una compra, un gasto o una plata. `prefijo`: lo que va antes del detalle (la ronda y el día). `conDetalle`: se toca y abre su hoja (no dentro
 *  de la hoja de una ronda: una hoja sobre otra). `enLista` («En esta ronda»): la hora va bajo el monto y los estados en su línea, como chips
 *  (ámbar «Falta mandar a LIM», verde «Enviada · ENV-…», y quién lo revisa), con el detalle sin repetir lo del envío. */
function Fila({ m, prefijo = [], conDetalle = false, enLista = false }: { m: MovimientoCompradora; prefijo?: (string | null)[]; conDetalle?: boolean; enLista?: boolean }) {
  const [abierta, setAbierta] = useState(false);
  const origen = useRef<HTMLButtonElement>(null);
  const antes = prefijo.filter(Boolean).map((x) => `${x} · `).join("");
  const chips = enLista ? (
    <>
      {m.envio && <Chip tono={m.envio.tono}>{m.envio.texto}</Chip>}
      <Chip tono={m.estado.pendiente ? "pizarra" : "verde"} title={m.estado.detalle}>
        {m.estado.texto}
      </Chip>
    </>
  ) : undefined;
  const cara = (
    <Cara
      icono={ICONO_MOVIMIENTO[m.icono]}
      titulo={m.titulo}
      detalle={enLista ? m.resumen : `${antes}${m.detalle}`}
      hora={enLista ? horaDeMovimiento(m) : null}
      chips={chips}
      entra={m.entra}
      monto={m.monto}
      estado={enLista ? undefined : m.estado}
    />
  );
  if (!conDetalle) return <li className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 py-2.5">{cara}</li>;
  return (
    <li>
      <button ref={origen} type="button" aria-haspopup="dialog" onClick={() => setAbierta(true)} className="grid w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-2.5 gap-y-1.5 py-2.5 text-left">
        {cara}
      </button>
      {abierta && <DetalleDeFila m={m} onClose={() => setAbierta(false)} volverA={origen} />}
    </li>
  );
}

type EntradaRonda = Extract<EntradaHistorial, { tipo: "ronda" }>;

/** La hoja de una ronda cerrada: lo que compró y gastó en ella, lo que salió de su plata, cómo cerró y sus envíos con su código. La abren la
 *  fila del historial y la tarjeta de «Tu última ronda». Solo se lee: se cierra con la ×. */
export function HojaDeRonda({ e, envios, hoy, onClose, volverA }: { e: EntradaRonda; envios: EnvioMio[]; hoy?: string; onClose: () => void; volverA?: RefObject<HTMLButtonElement | null> }) {
  return (
    <Modal titulo={e.titulo} subtitulo={e.detalle} onClose={onClose} variante="hoja" tamano="mediana" conCerrar alCerrarEnfocar={volverA}>
      <div className="space-y-4">
        {e.movimientos.length > 0 ? (
          <ul className="divide-y divide-sand">
            {e.movimientos.map((m) => (
              <Fila key={m.clave} m={m} prefijo={[m.fecha ? diaMes(m.fecha) : null]} />
            ))}
          </ul>
        ) : (
          <Vacio icono={<Flag aria-hidden />} titulo="Nada anotado" tamano="chico">
            En esta ronda no anotaste compras ni gastos.
          </Vacio>
        )}
        <p className="flex items-baseline justify-between gap-3 border-t border-sand pt-3 text-sm">
          <span className="text-tinta/65">Salió de tu plata</span>
          <span className="font-serif text-2xl tabular-nums text-tinta">{e.monto}</span>
        </p>
        {e.cierre && <p className="nota-cayla text-sm">{e.cierre}</p>}
        {/* Los envíos de esa ronda con su código (Felipe 2026-10-26): un código de hace dos semanas está a dos toques del inicio. */}
        {envios.length > 0 && <EnviosDeUnaRonda envios={envios} hoy={hoy} />}
      </div>
    </Modal>
  );
}

/** Una ronda cerrada: la fila se toca y abre su hoja (Felipe 2026-10-23: «que se cargue un modal», no que se despliegue en la lista). */
function FilaRonda({ e, envios, hoy }: { e: EntradaRonda; envios: EnvioMio[]; hoy?: string }) {
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
      {abierta && <HojaDeRonda e={e} envios={envios} hoy={hoy} onClose={() => setAbierta(false)} volverA={origen} />}
    </li>
  );
}

/** «Envíos de esta ronda» dentro de la hoja de una ronda cerrada: cada uno con su código y en qué quedó. No se abren aquí (una hoja sobre
 *  otra): su detalle, con copiar y compartir, está en Mis envíos. */
function EnviosDeUnaRonda({ envios, hoy }: { envios: EnvioMio[]; hoy?: string }) {
  const resumen = resumenDeEnvios(envios, hoy);
  return (
    <div className="space-y-1">
      <TituloSeccion nivel={3} cuenta={envios.length} accion={resumen.chip ? <Chip tono={resumen.chip.tono}>{resumen.chip.texto}</Chip> : undefined}>
        Envíos de esta ronda
      </TituloSeccion>
      <ul className="divide-y divide-sand">
        {envios.map((x) => (
          <FilaEnvio key={x.id} e={x} hoy={hoy} soloLeer />
        ))}
      </ul>
      <EnlaceVer href="/compras/mi-plata/envios">Abrirlos en Mis envíos</EnlaceVer>
    </div>
  );
}

function FilaHistorial({ e, envios, hoy }: { e: EntradaHistorial; envios: EnvioMio[]; hoy?: string }) {
  if (e.tipo === "plata") return <Fila m={e.mov} prefijo={[e.mov.ronda, e.mov.fecha ? diaMes(e.mov.fecha) : null]} conDetalle />;
  if (e.tipo === "ronda") return <FilaRonda e={e} envios={envios} hoy={hoy} />;
  return (
    <li className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 py-2.5">
      <Cara icono={e.decision === "devuelve" ? Undo2 : HandCoins} titulo={e.titulo} detalle={e.detalle} entra={e.entra} monto={e.monto} estado={e.estado} />
    </li>
  );
}

/** El total de la lista: cuánta plata entró y cuánta salió. En PC va dentro del pie de la tabla (`TablaDeLaRonda`); en celular, aquí. */
function PieDeLaLista({ actuales, className = "" }: { actuales: MovimientoCompradora[]; className?: string }) {
  const { entro, salio } = totalesDeLaLista(actuales);
  return (
    <p className={`flex flex-wrap justify-between gap-x-3 gap-y-0.5 border-t border-sand pt-2.5 text-xs text-taupe ${className}`}>
      <span>
        Entró <b className="font-semibold tabular-nums text-tinta">{soles(entro)}</b> · salió <b className="font-semibold tabular-nums text-tinta">{soles(salio)}</b>
      </span>
    </p>
  );
}

/** «En esta ronda»: lo de la ronda abierta, lo más nuevo arriba. `desde`: «desde hoy 08:30», a la derecha del título. */
export function ListaDelDia({
  actuales,
  titulo,
  desde,
  ocultarSiVacia = false,
}: {
  actuales: MovimientoCompradora[];
  titulo: string;
  desde?: string | null;
  /** Sin ronda abierta, «Antes de abrir tu ronda 0» no dice nada: no se dibuja hasta que haya algo anotado (Felipe 2026-10-27). */
  ocultarSiVacia?: boolean;
}) {
  if (ocultarSiVacia && actuales.length === 0) return null;
  return (
    <section className="flex min-w-0 flex-col gap-1" data-guia="mi-plata.hoy">
      <TituloSeccion cuenta={actuales.length} dato={desde ?? undefined}>
        {titulo}
      </TituloSeccion>
      {actuales.length === 0 ? (
        <Vacio icono={<HandCoins aria-hidden />} titulo="Todavía no anotas nada" tamano="chico">
          Cuando te den plata, tócala en «Me dieron plata»; lo que compres y gastes aparece aquí.
        </Vacio>
      ) : (
        <>
          {/* PC (desde `lg`): la tabla con sus columnas y el total al pie. Celular y tablet: la lista, con la hora bajo el monto y los estados
              en su línea; el total, debajo (maqueta docs/maquetas/mis-compras-pc-mesa-2026-10/, Felipe 2026-10-28). */}
          <TablaDeLaRonda actuales={actuales} />
          <ul className="divide-y divide-sand lg:hidden">
            {actuales.map((m) => (
              <Fila key={m.clave} m={m} conDetalle enLista />
            ))}
          </ul>
          <PieDeLaLista actuales={actuales} className="lg:hidden" />
        </>
      )}
    </section>
  );
}

/** «Rondas anteriores». Por defecto, plegadas: el título y «Ver N» (cuántas filas hay); al abrir, cada ronda cerrada y la plata anotada de
 *  antes. Con `visibles` (sin ronda abierta, cuando son LO que hay en la pantalla), las primeras filas se ven de una vez y «Ver N más» guarda
 *  el resto. */
export function RondasAnteriores({ historial, envios, hoy, visibles }: { historial: EntradaHistorial[]; envios: RondaConEnvios[] | null; hoy?: string; visibles?: number }) {
  const [abierto, setAbierto] = useState(false);
  if (historial.length === 0) return null;
  const fila = (e: EntradaHistorial) => <FilaHistorial key={e.clave} e={e} envios={e.tipo === "ronda" ? (enviosDeLaFila(envios, e.clave) ?? []) : []} hoy={hoy} />;
  if (visibles === undefined) {
    return (
      <section className="flex min-w-0 flex-col gap-1" data-guia="mi-plata.antes">
        <TituloSeccion
          accion={<BotonVerMas forma="enlace" abierto={abierto} onCambiar={setAbierto} controla="mi-plata-antes" texto={`Ver ${historial.length}`} />}
        >
          Rondas anteriores
        </TituloSeccion>
        <FilasDeMas abierto={abierto} id="mi-plata-antes">
          <ul className="divide-y divide-sand border-t border-sand">{historial.map(fila)}</ul>
        </FilasDeMas>
      </section>
    );
  }
  const guardadas = historial.slice(visibles);
  return (
    <section className="flex min-w-0 flex-col gap-1" data-guia="mi-plata.antes">
      <TituloSeccion cuenta={historial.length}>Rondas anteriores</TituloSeccion>
      <ul className="divide-y divide-sand border-t border-sand">{historial.slice(0, visibles).map(fila)}</ul>
      {guardadas.length > 0 && (
        <>
          <FilasDeMas abierto={abierto} id="mi-plata-antes">
            <ul className="divide-y divide-sand">{guardadas.map(fila)}</ul>
          </FilasDeMas>
          <BotonVerMas abierto={abierto} onCambiar={setAbierto} controla="mi-plata-antes" texto={`Ver ${guardadas.length} más`} />
        </>
      )}
    </section>
  );
}
