"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar, ChevronDown, Search } from "lucide-react";
import { Popover, Select } from "radix-ui";
import { Hilo } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { ItemDesplegable, TODOS } from "@/components/ui/FiltrosPildora";
import {
  PERIODOS_RECIBIDAS,
  ajustarRango,
  hayFiltrosRecibidas,
  hrefConCambios,
  periodoDeRango,
  rangoDePeriodo,
  textoFechas,
  textoProveedor,
  type FiltrosRecibidas as Filtros,
  type PeriodoRecibidas,
  type ResultadoRecibidas,
} from "@/lib/recibidas-filtros-reglas";

// Filtros de «Recibidas recientemente» tal como los dibuja la maqueta 06: el buscador y, en la
// misma línea, dos pastillas —«Proveedor: Todos ⌄» y «Fechas»— sin el botón «Filtros» ni su
// panel. Reemplaza a `FiltrosCompras` SOLO en esta pestaña (Comprobantes y Por pagar siguen con
// el suyo): esas pantallas filtran por seis cosas y necesitan el panel; esta filtra por dos y
// la maqueta las pone a la vista.
//
// Los filtros viven en la URL (?q=&prov=&desde=&hasta=), como en el resto de Compras: la página
// es un Server Component que filtra en Postgres (`listar_recepciones_compras`), el enlace se
// comparte y «atrás» vuelve al filtro anterior. Este componente no filtra nada: lee lo que el
// servidor ya limpió (`filtros`, de `filtrosRecibidasDesdeParams`) y arma la URL siguiente. Cada
// pastilla abre su propia lista al tocarla (la maqueta es estática y no dibuja el estado abierto).
//
// Lo que cuenta la pastilla «Fechas» es el día en que LLEGÓ la guía, no el de emisión.
//
// Celular: el buscador ocupa su propia línea y las pastillas bajan debajo, apiladas si no caben —
// nunca hay scroll horizontal; el nombre de un proveedor largo se recorta con «…».

const PILDORA =
  "label-cayla inline-flex h-9 min-w-0 max-w-full items-center gap-1.5 rounded-lg border px-3 text-[11px] transition-colors " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rojo/60";
const PILDORA_REPOSO = "border-tinta/15 text-tinta/75 hover:border-tinta/30 hover:text-tinta";
// Activa (hay un filtro aplicado) o abierta: mismo estado que el botón «Filtros» de `FiltrosPildora`.
const PILDORA_ACTIVA = "border-tinta/30 bg-tinta/[0.04] text-tinta";

const claseDeLaPastilla = (activa: boolean) => `${PILDORA} ${activa ? PILDORA_ACTIVA : PILDORA_REPOSO}`;

export function FiltrosRecibidas({
  proveedores,
  filtros,
  hoy,
  resultado,
}: {
  proveedores: { id: string; nombre: string }[];
  /** Lo que el servidor ya filtró (limpio, ver `filtrosRecibidasDesdeParams`). */
  filtros: Filtros;
  /** aaaa-mm-dd de hoy en Lima, resuelto en el servidor con `hoyLima()`. */
  hoy: string;
  /** `?res=` ya limpio: lo filtra `RecepcionesCompraLista` en el navegador; acá solo se elige. */
  resultado: ResultadoRecibidas;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busqueda, setBusqueda] = useState(filtros.busqueda ?? "");
  const [enfocado, setEnfocado] = useState(false);
  const temporizador = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function aplicar(cambios: Record<string, string>) {
    router.push(hrefConCambios(pathname, params.toString(), cambios));
  }

  // El temporizador de la búsqueda llama a la versión más reciente de `aplicar`: si mientras se
  // tipea cambia otro filtro, la URL siguiente parte de la URL de ahora, no de la de la primera tecla.
  const aplicarActual = useRef(aplicar);
  useEffect(() => {
    aplicarActual.current = aplicar;
  });
  useEffect(() => () => clearTimeout(temporizador.current), []);

  // La búsqueda se manda sola al dejar de tipear (350 ms) — sin botón, pero sin una consulta por
  // tecla — o al instante con Enter.
  function alTipear(texto: string) {
    setBusqueda(texto);
    clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => aplicarActual.current({ q: texto.trim() }), 350);
  }

  function limpiarTodo() {
    clearTimeout(temporizador.current);
    setBusqueda("");
    aplicar({ q: "", prov: "", desde: "", hasta: "", res: "" });
  }

  const hayActivos = hayFiltrosRecibidas(filtros) || busqueda.trim() !== "" || resultado !== "todas";
  const periodoActivo = periodoDeRango(filtros.desde, filtros.hasta, hoy);

  return (
    <div role="search" aria-label="Filtrar las recepciones" className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5">
      <div className="relative flex w-full min-w-0 items-center gap-2.5 px-0.5 text-tinta/45 sm:w-auto sm:min-w-[16rem] sm:flex-1">
        <Search aria-hidden strokeWidth={1.6} className="h-4 w-4 shrink-0" />
        <input
          type="search"
          value={busqueda}
          onChange={(e) => alTipear(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            clearTimeout(temporizador.current);
            aplicar({ q: busqueda.trim() });
          }}
          onFocus={() => setEnfocado(true)}
          onBlur={() => setEnfocado(false)}
          placeholder="Documento, proveedor o guía"
          aria-label="Buscar por documento, proveedor o guía"
          autoComplete="off"
          className="h-9 min-w-0 flex-1 bg-transparent text-sm text-tinta outline-none placeholder:text-tinta/45"
        />
        <Hilo activo={enfocado} />
      </div>

      <PastillaProveedor proveedores={proveedores} proveedorId={filtros.proveedorId} onElegir={(id) => aplicar({ prov: id })} />
      <PastillaFechas desde={filtros.desde ?? ""} hasta={filtros.hasta ?? ""} hoy={hoy} onCambiar={(desde, hasta) => aplicar({ desde, hasta })} />

      {/* Los dos segmentados del spike: el periodo de un toque (tocar el activo lo quita) y cómo llegó lo recibido. */}
      <SegmentoDeslizante
        etiqueta="Periodo de llegada"
        valor={periodoActivo ?? ""}
        onCambio={(clave) => {
          if (clave === periodoActivo) return aplicar({ desde: "", hasta: "" });
          const r = rangoDePeriodo(clave as PeriodoRecibidas, hoy);
          aplicar({ desde: r.desde, hasta: r.hasta });
        }}
        opciones={[
          { clave: "este-mes", etiqueta: "Este mes" },
          { clave: "30-dias", etiqueta: "30 días" },
          { clave: "90-dias", etiqueta: "90 días" },
        ]}
      />
      <SegmentoDeslizante
        etiqueta="Filtrar por resultado"
        valor={resultado}
        onCambio={(v) => aplicar({ res: v === "todas" ? "" : v })}
        opciones={[
          { clave: "todas", etiqueta: "Todas" },
          { clave: "completas", etiqueta: "Completas" },
          { clave: "faltante", etiqueta: "Con faltante" },
        ]}
      />

      {hayActivos && (
        <button type="button" onClick={limpiarTodo} className="label-cayla px-1 text-[10px] text-tinta/55 transition-colors hover:text-rojo">
          Limpiar
        </button>
      )}
    </div>
  );
}

/** «Proveedor: Todos ⌄» — una lista para elegir uno (Radix Select: teclado, y tipear salta al nombre). */
function PastillaProveedor({
  proveedores,
  proveedorId,
  onElegir,
}: {
  proveedores: { id: string; nombre: string }[];
  proveedorId: string | undefined;
  onElegir: (id: string) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  return (
    <Select.Root value={proveedorId ?? TODOS} onValueChange={(v) => onElegir(v === TODOS ? "" : v)} onOpenChange={setAbierta}>
      <Select.Trigger className={claseDeLaPastilla(abierta || Boolean(proveedorId))}>
        <span className="min-w-0 truncate">
          <Select.Value>{textoProveedor(proveedorId, proveedores)}</Select.Value>
        </span>
        <ChevronDown aria-hidden strokeWidth={1.6} className="h-[13px] w-[13px] shrink-0" />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          align="start"
          collisionPadding={16}
          className="anim-revelar z-50 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-sand bg-papel shadow-md"
        >
          <Select.Viewport className="scroll-cayla max-h-72 overflow-y-auto p-1">
            <ItemDesplegable value={TODOS}>Todos</ItemDesplegable>
            {proveedores.map((p) => (
              <ItemDesplegable key={p.id} value={p.id}>
                {p.nombre}
              </ItemDesplegable>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

/** «Fechas» — períodos de un toque (este mes, últimos 90 días…) y, debajo, un rango a mano. */
function PastillaFechas({ desde, hasta, hoy, onCambiar }: { desde: string; hasta: string; hoy: string; onCambiar: (desde: string, hasta: string) => void }) {
  const [abierta, setAbierta] = useState(false);
  const activa = Boolean(desde || hasta);
  const periodo = periodoDeRango(desde || undefined, hasta || undefined, hoy);

  function cambiarExtremo(cual: "desde" | "hasta", valor: string) {
    const r = ajustarRango(cual === "desde" ? valor : desde, cual === "hasta" ? valor : hasta, cual);
    onCambiar(r.desde, r.hasta);
  }

  return (
    <Popover.Root open={abierta} onOpenChange={setAbierta}>
      <Popover.Trigger asChild>
        <button type="button" className={claseDeLaPastilla(abierta || activa)}>
          <Calendar aria-hidden strokeWidth={1.6} className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 truncate">{textoFechas(desde || undefined, hasta || undefined, hoy)}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          collisionPadding={16}
          className="anim-revelar z-50 w-[19rem] max-w-[calc(100vw-2rem)] rounded-lg border border-sand bg-papel shadow-md"
        >
          <div className="p-1">
            {PERIODOS_RECIBIDAS.map((p) => (
              <button
                key={p.clave}
                type="button"
                aria-pressed={periodo === p.clave}
                onClick={() => {
                  const r = rangoDePeriodo(p.clave, hoy);
                  onCambiar(r.desde, r.hasta);
                  setAbierta(false);
                }}
                className={`flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-tinta outline-none transition-colors hover:bg-rojo/8 focus-visible:bg-rojo/8 ${
                  periodo === p.clave ? "font-semibold" : ""
                }`}
              >
                {p.etiqueta}
              </button>
            ))}
          </div>
          <div className="space-y-2 border-t border-sand p-3">
            <p className="label-cayla text-[10px] text-tinta/55">Otro período · día de llegada</p>
            <CampoFecha etiqueta="Desde" valor={desde} onValor={(v) => cambiarExtremo("desde", v)} />
            <CampoFecha etiqueta="Hasta" valor={hasta} onValor={(v) => cambiarExtremo("hasta", v)} />
            {activa && (
              <button
                type="button"
                onClick={() => {
                  onCambiar("", "");
                  setAbierta(false);
                }}
                className="label-cayla text-[11px] text-tinta/65 transition-colors hover:text-rojo"
              >
                Quitar fechas
              </button>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
