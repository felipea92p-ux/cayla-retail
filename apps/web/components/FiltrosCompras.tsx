"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlarmClock, Banknote, Building2, CalendarRange, HandCoins, PackageCheck, Receipt, Store } from "lucide-react";
import { Popover } from "radix-ui";
import { Buscador } from "@/components/ui/Buscador";
import { Hilo } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { useBusquedaEnUrl } from "@/components/ui/BusquedaEnUrl";
import { BotonFiltros, DesplegablePildora, PanelPildoras, TODOS } from "@/components/ui/FiltrosPildora";
import {
  destinoDesdeParam,
  ETIQUETA_ESTADO_PAGO,
  ETIQUETA_ESTADO_RECEPCION,
  ETIQUETA_TIPO_DOCUMENTO,
  fechaCorta,
  textoChipDestino,
  type EstadoPago,
  type EstadoRecepcion,
  type TipoDocumentoCompra,
} from "@/lib/compras-reglas";

// Filtros de las tablas de Compras. Viven en la URL (?q=…&pago=…): así la
// página es un Server Component que filtra en Postgres, el enlace se puede
// compartir, y "atrás" del navegador vuelve al filtro anterior. Cambiar un
// filtro borra el cursor de paginación — una página 3 de otro filtro no
// significa nada.
//
// 2026-09-18: mismo diseño que `FiltrosProductos.tsx` (compacto) — Buscar
// siempre a la vista + un botón "Filtros · N" que despliega el panel de
// píldoras (`DesplegablePildora`, ver `ui/FiltrosPildora.tsx`). Reemplaza
// la versión anterior (card con `<select>` nativos y un "Más filtros ↓"
// de dos niveles): los chips debajo ya decían qué estaba aplicado aunque
// el panel estuviera cerrado, así que la distinción principales/
// secundarios no hacía falta — un filtro nunca queda escondido, solo el
// control para CAMBIARLO. Los filtros en sí siguen siendo los de Compras
// (proveedor/pago/recepción/condición/fechas/vencidas), no los de
// Productos — lo que se comparte es el molde, no el vocabulario.
const ID_BUSCADOR = "buscador-compras";

export type FiltroVisible = "proveedor" | "pago" | "recepcion" | "condicion" | "tipo" | "fechas" | "vencidas" | "destino";

type Proveedor = { id: string; nombre: string };
type Tienda = { id: string; nombre: string };

// Qué parámetro(s) de la URL usa cada filtro. `fechas` usa dos.
const PARAMS: Record<FiltroVisible, string[]> = {
  proveedor: ["prov"],
  pago: ["pago"],
  recepcion: ["recep"],
  condicion: ["cond"],
  tipo: ["tipo"],
  fechas: ["desde", "hasta"],
  vencidas: ["vencidas"],
  destino: ["dest"],
};

// `accionesAntes` / `accionesDespues` (ADR-0111): controles propios de cada pantalla que
// van en la misma fila del buscador —«Orden: Emisión | Vencimiento» en Comprobantes,
// «Por urgencia | Por proveedor» en Por pagar—, antes o después del botón «Filtros».
// Cada uno lleva el mismo espaciador de etiqueta que el botón para quedar a la altura
// del campo, no de toda la columna.
export function FiltrosCompras({
  proveedores,
  tiendas = [],
  visibles,
  accionesAntes,
  accionesDespues,
  atajoBuscar = false,
  estiloSpike = false,
}: {
  proveedores: Proveedor[];
  /** Las tiendas que se ofrecen en «Destino» (ADR-0139): las mismas que Registrar ofrece al repartir. Vacío = el filtro no aparece. */
  tiendas?: Tienda[];
  visibles: FiltroVisible[];
  accionesAntes?: ReactNode;
  accionesDespues?: ReactNode;
  /** «/» enfoca el buscador desde cualquier parte de la pantalla (Por pagar, 2026-09-19); el campo lo anuncia con una tecla. */
  atajoBuscar?: boolean;
  /** El buscador del spike de Por pagar (2026-09-19): lupa, sin etiqueta encima, «/» a la vista y una ✕ para borrar; los botones quedan a su altura. Implica `atajoBuscar`. */
  estiloSpike?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busqueda, setBusqueda] = useState(params.get("q") ?? "");
  const [panelAbierto, setPanelAbierto] = useState(false);
  const primera = useRef(true);
  const { buscando, buscar } = useBusquedaEnUrl();

  function ver(f: FiltroVisible) {
    return visibles.includes(f);
  }

  /** `tipeado`: viene del buscador (se escribió): navega sin el loader, con «Buscando…». */
  function aplicar(cambios: Record<string, string>, { tipeado = false } = {}) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("cursor");
    const qs = p.toString();
    const href = qs ? `${pathname}?${qs}` : pathname;
    if (tipeado) buscar(href);
    else router.push(href);
  }

  // La búsqueda se manda sola al dejar de tipear (350 ms): sin botón, pero
  // sin una consulta por tecla.
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== busqueda.trim()) aplicar({ q: busqueda.trim() }, { tipeado: true });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda]);

  const prov = params.get("prov");
  const pago = params.get("pago") as EstadoPago | null;
  const recep = params.get("recep") as EstadoRecepcion | null;
  const cond = params.get("cond");
  const tipo = params.get("tipo") as TipoDocumentoCompra | null;
  const vencidas = params.get("vencidas");
  const desde = params.get("desde");
  const hasta = params.get("hasta");
  // Un `dest` que no es el id de una tienda no filtra (la página lo descarta): tampoco cuenta ni pinta etiqueta.
  const dest = destinoDesdeParam(params.get("dest"));

  const activo = (f: FiltroVisible) => (f === "destino" ? !!dest : PARAMS[f].some((k) => params.get(k)));
  const activos = visibles.filter(activo).length;

  // Los chips: un texto legible por cada filtro aplicado, con qué borrar al
  // tocar la ×. La búsqueda se lee desde la URL (no del estado local) para
  // que el chip aparezca cuando la consulta ya se hizo, no mientras se tipea.
  const chips: { texto: string; quitar: Record<string, string> }[] = [];
  const q = params.get("q");
  if (q) chips.push({ texto: `«${q}»`, quitar: { q: "" } });
  if (prov) chips.push({ texto: proveedores.find((p) => p.id === prov)?.nombre ?? "Proveedor", quitar: { prov: "" } });
  if (pago && ETIQUETA_ESTADO_PAGO[pago]) chips.push({ texto: `Pago: ${ETIQUETA_ESTADO_PAGO[pago]}`, quitar: { pago: "" } });
  if (recep && ETIQUETA_ESTADO_RECEPCION[recep]) chips.push({ texto: `Recepción: ${ETIQUETA_ESTADO_RECEPCION[recep]}`, quitar: { recep: "" } });
  if (cond) chips.push({ texto: cond === "contado" ? "Al contado" : "Al crédito", quitar: { cond: "" } });
  if (tipo && ETIQUETA_TIPO_DOCUMENTO[tipo]) chips.push({ texto: ETIQUETA_TIPO_DOCUMENTO[tipo], quitar: { tipo: "" } });
  if (dest) chips.push({ texto: textoChipDestino(dest, tiendas), quitar: { dest: "" } });
  if (vencidas) chips.push({ texto: "Solo vencidas", quitar: { vencidas: "" } });
  if (desde || hasta) {
    chips.push({
      texto: desde && hasta ? `Emitida ${fechaCorta(desde)} – ${fechaCorta(hasta)}` : desde ? `Emitida desde ${fechaCorta(desde)}` : `Emitida hasta ${fechaCorta(hasta)}`,
      quitar: { desde: "", hasta: "" },
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {/* El buscador único (ADR-0358, ronda 5): busca mientras se escribe; «Buscando…» solo si la base tarda. */}
        <Buscador
          id={ID_BUSCADOR}
          valor={busqueda}
          onCambio={setBusqueda}
          buscando={buscando}
          atajo={atajoBuscar || estiloSpike}
          placeholder="Proveedor o número de documento"
          etiqueta="Buscar por proveedor o número de documento"
          className="min-w-[15rem] flex-1"
        />
        {/* Mismo ritmo vertical que `Campo` (etiqueta + mt-1.5 + control) para
            que el botón quede a la altura del input, no de toda la columna. */}
        {[
          accionesAntes,
          <BotonFiltros key="filtros" abierto={panelAbierto} activos={activos} onClick={() => setPanelAbierto((v) => !v)} />,
          accionesDespues,
        ].map(
          (control, i) =>
            control && (
              <div key={i} className="shrink-0">
                {control}
              </div>
            ),
        )}
      </div>

      {panelAbierto && (
        <PanelPildoras>
          {ver("proveedor") && (
            <DesplegablePildora
              icono={Building2}
              etiqueta="Proveedor"
              valor={prov ?? TODOS}
              onValor={(v) => aplicar({ prov: v === TODOS ? "" : v })}
              opciones={[{ valor: TODOS, texto: "Todos" }, ...proveedores.map((p) => ({ valor: p.id, texto: p.nombre }))]}
            />
          )}

          {ver("pago") && (
            <DesplegablePildora
              icono={Banknote}
              etiqueta="Pago"
              valor={pago ?? TODOS}
              onValor={(v) => aplicar({ pago: v === TODOS ? "" : v })}
              opciones={[
                { valor: TODOS, texto: "Todos" },
                ...(["pendiente", "parcial", "pagada", "anulada"] as const).map((v) => ({ valor: v, texto: ETIQUETA_ESTADO_PAGO[v] })),
              ]}
            />
          )}

          {ver("recepcion") && (
            <DesplegablePildora
              icono={PackageCheck}
              etiqueta="Recepción"
              valor={recep ?? TODOS}
              onValor={(v) => aplicar({ recep: v === TODOS ? "" : v })}
              opciones={[
                { valor: TODOS, texto: "Todas" },
                ...(["sin_recibir", "parcial", "recibida"] as const).map((v) => ({ valor: v, texto: ETIQUETA_ESTADO_RECEPCION[v] })),
              ]}
            />
          )}

          {ver("condicion") && (
            <DesplegablePildora
              icono={HandCoins}
              etiqueta="Condición"
              valor={cond ?? TODOS}
              onValor={(v) => aplicar({ cond: v === TODOS ? "" : v })}
              opciones={[
                { valor: TODOS, texto: "Todas" },
                { valor: "contado", texto: "Al contado" },
                { valor: "credito", texto: "Al crédito" },
              ]}
            />
          )}

          {ver("tipo") && (
            <DesplegablePildora
              icono={Receipt}
              etiqueta="Tipo de documento"
              valor={tipo ?? TODOS}
              onValor={(v) => aplicar({ tipo: v === TODOS ? "" : v })}
              opciones={[
                { valor: TODOS, texto: "Todos" },
                ...(["factura", "boleta", "nota_venta"] as const).map((v) => ({ valor: v, texto: ETIQUETA_TIPO_DOCUMENTO[v] })),
              ]}
            />
          )}

          {ver("destino") && tiendas.length > 0 && (
            <DesplegablePildora
              icono={Store}
              etiqueta="Destino"
              valor={dest ?? TODOS}
              onValor={(v) => aplicar({ dest: v === TODOS ? "" : v })}
              opciones={[{ valor: TODOS, texto: "Todas las tiendas" }, ...tiendas.map((u) => ({ valor: u.id, texto: u.nombre }))]}
            />
          )}

          {ver("vencidas") && (
            <DesplegablePildora
              icono={AlarmClock}
              etiqueta="Vencimiento"
              valor={vencidas ? "1" : TODOS}
              onValor={(v) => aplicar({ vencidas: v === TODOS ? "" : v })}
              opciones={[
                { valor: TODOS, texto: "Todas" },
                { valor: "1", texto: "Solo vencidas" },
              ]}
            />
          )}

          {ver("fechas") && <PildoraFechas desde={desde ?? ""} hasta={hasta ?? ""} onCambiar={(d, h) => aplicar({ desde: d, hasta: h })} />}
        </PanelPildoras>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={c.texto}
              type="button"
              onClick={() => {
                if ("q" in c.quitar) setBusqueda("");
                aplicar(c.quitar);
              }}
              className="label-cayla anim-entrada inline-flex items-center gap-1.5 rounded-full border border-tinta/15 bg-tinta/[0.04] px-2.5 py-1 text-[10px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
              aria-label={`Quitar filtro ${c.texto}`}
            >
              {c.texto}
              <span aria-hidden className="text-sm leading-none">
                ×
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setBusqueda("");
              router.push(pathname);
            }}
            className="label-cayla px-1 text-[10px] text-tinta/55 hover:text-rojo"
          >
            Limpiar todo
          </button>
        </div>
      )}
    </div>
  );
}

/** Rango de fechas como píldora con popover (en vez de Select — acá no se
 *  elige UNA opción de una lista, se llenan dos campos). Mismo hueco visual
 *  que `DesplegablePildora`: ícono + texto + hilo vivo, la diferencia es
 *  qué se abre debajo. */
function PildoraFechas({ desde, hasta, onCambiar }: { desde: string; hasta: string; onCambiar: (desde: string, hasta: string) => void }) {
  const [abierto, setAbierto] = useState(false);
  const activa = Boolean(desde || hasta);
  const texto = activa ? `${desde ? fechaCorta(desde) : "…"} – ${hasta ? fechaCorta(hasta) : "…"}` : "Emisión";
  return (
    <Popover.Root open={abierto} onOpenChange={setAbierto}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={`label-cayla group relative flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-[11px] outline-none transition-colors ${
            activa ? "text-tinta" : "text-tinta/60 hover:text-tinta"
          }`}
        >
          <CalendarRange aria-hidden className={`h-3.5 w-3.5 shrink-0 transition-colors ${activa ? "text-tinta/70" : "text-tinta/40 group-hover:text-tinta/60"}`} />
          {texto}
          <Hilo activo={abierto} reposo={false} />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content sideOffset={6} align="start" className="anim-revelar z-50 w-64 space-y-3 rounded-lg border border-sand bg-papel p-3 shadow-md">
          <CampoFecha etiqueta="Emitida desde" valor={desde} onValor={(v) => onCambiar(v, hasta)} />
          <CampoFecha etiqueta="Emitida hasta" valor={hasta} onValor={(v) => onCambiar(desde, v)} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
