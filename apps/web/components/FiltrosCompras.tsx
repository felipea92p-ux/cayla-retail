"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlarmClock, Banknote, Building2, CalendarRange, HandCoins, PackageCheck, Receipt } from "lucide-react";
import { Popover } from "radix-ui";
import { CampoTexto, Hilo } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { BotonFiltros, DesplegablePildora, ItemDesplegable, PanelPildoras, TODOS } from "@/components/ui/FiltrosPildora";
import {
  ETIQUETA_ESTADO_PAGO,
  ETIQUETA_ESTADO_RECEPCION,
  ETIQUETA_TIPO_DOCUMENTO,
  fechaCorta,
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
export type FiltroVisible = "proveedor" | "pago" | "recepcion" | "condicion" | "tipo" | "fechas" | "vencidas";

type Proveedor = { id: string; nombre: string };

// Qué parámetro(s) de la URL usa cada filtro. `fechas` usa dos.
const PARAMS: Record<FiltroVisible, string[]> = {
  proveedor: ["prov"],
  pago: ["pago"],
  recepcion: ["recep"],
  condicion: ["cond"],
  tipo: ["tipo"],
  fechas: ["desde", "hasta"],
  vencidas: ["vencidas"],
};

// `accionesAntes` / `accionesDespues` (ADR-0104): controles propios de cada pantalla que
// van en la misma fila del buscador —«Orden: Emisión | Vencimiento» en Comprobantes,
// «Por urgencia | Por proveedor» en Por pagar—, antes o después del botón «Filtros».
// Cada uno lleva el mismo espaciador de etiqueta que el botón para quedar a la altura
// del campo, no de toda la columna.
export function FiltrosCompras({
  proveedores,
  visibles,
  accionesAntes,
  accionesDespues,
}: {
  proveedores: Proveedor[];
  visibles: FiltroVisible[];
  accionesAntes?: ReactNode;
  accionesDespues?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busqueda, setBusqueda] = useState(params.get("q") ?? "");
  const [panelAbierto, setPanelAbierto] = useState(false);
  const primera = useRef(true);

  function ver(f: FiltroVisible) {
    return visibles.includes(f);
  }

  function aplicar(cambios: Record<string, string>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("cursor");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  // La búsqueda se manda sola al dejar de tipear (350 ms): sin botón, pero
  // sin una consulta por tecla.
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== busqueda.trim()) aplicar({ q: busqueda.trim() });
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

  const activo = (f: FiltroVisible) => PARAMS[f].some((k) => params.get(k));
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
  if (vencidas) chips.push({ texto: "Solo vencidas", quitar: { vencidas: "" } });
  if (desde || hasta) {
    chips.push({
      texto: desde && hasta ? `Emitida ${fechaCorta(desde)} – ${fechaCorta(hasta)}` : desde ? `Emitida desde ${fechaCorta(desde)}` : `Emitida hasta ${fechaCorta(hasta)}`,
      quitar: { desde: "", hasta: "" },
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <CampoTexto
            etiqueta="Buscar"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Número de documento o proveedor"
            autoComplete="off"
            type="search"
          />
        </div>
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
                <span aria-hidden className="label-cayla block text-[11px] text-transparent">
                  {" "}
                </span>
                {control}
              </div>
            ),
        )}
      </div>

      {panelAbierto && (
        <PanelPildoras>
          {ver("proveedor") && (
            <DesplegablePildora icono={Building2} etiqueta="Proveedor" valor={prov ?? TODOS} onValor={(v) => aplicar({ prov: v === TODOS ? "" : v })}>
              <ItemDesplegable value={TODOS}>Todos</ItemDesplegable>
              {proveedores.map((p) => (
                <ItemDesplegable key={p.id} value={p.id}>
                  {p.nombre}
                </ItemDesplegable>
              ))}
            </DesplegablePildora>
          )}

          {ver("pago") && (
            <DesplegablePildora icono={Banknote} etiqueta="Pago" valor={pago ?? TODOS} onValor={(v) => aplicar({ pago: v === TODOS ? "" : v })}>
              <ItemDesplegable value={TODOS}>Todos</ItemDesplegable>
              {(["pendiente", "parcial", "pagada", "anulada"] as const).map((v) => (
                <ItemDesplegable key={v} value={v}>
                  {ETIQUETA_ESTADO_PAGO[v]}
                </ItemDesplegable>
              ))}
            </DesplegablePildora>
          )}

          {ver("recepcion") && (
            <DesplegablePildora icono={PackageCheck} etiqueta="Recepción" valor={recep ?? TODOS} onValor={(v) => aplicar({ recep: v === TODOS ? "" : v })}>
              <ItemDesplegable value={TODOS}>Todas</ItemDesplegable>
              {(["sin_recibir", "parcial", "recibida"] as const).map((v) => (
                <ItemDesplegable key={v} value={v}>
                  {ETIQUETA_ESTADO_RECEPCION[v]}
                </ItemDesplegable>
              ))}
            </DesplegablePildora>
          )}

          {ver("condicion") && (
            <DesplegablePildora icono={HandCoins} etiqueta="Condición" valor={cond ?? TODOS} onValor={(v) => aplicar({ cond: v === TODOS ? "" : v })}>
              <ItemDesplegable value={TODOS}>Todas</ItemDesplegable>
              <ItemDesplegable value="contado">Al contado</ItemDesplegable>
              <ItemDesplegable value="credito">Al crédito</ItemDesplegable>
            </DesplegablePildora>
          )}

          {ver("tipo") && (
            <DesplegablePildora icono={Receipt} etiqueta="Tipo de documento" valor={tipo ?? TODOS} onValor={(v) => aplicar({ tipo: v === TODOS ? "" : v })}>
              <ItemDesplegable value={TODOS}>Todos</ItemDesplegable>
              {(["factura", "boleta", "nota_venta"] as const).map((v) => (
                <ItemDesplegable key={v} value={v}>
                  {ETIQUETA_TIPO_DOCUMENTO[v]}
                </ItemDesplegable>
              ))}
            </DesplegablePildora>
          )}

          {ver("vencidas") && (
            <DesplegablePildora icono={AlarmClock} etiqueta="Vencimiento" valor={vencidas ? "1" : TODOS} onValor={(v) => aplicar({ vencidas: v === TODOS ? "" : v })}>
              <ItemDesplegable value={TODOS}>Todas</ItemDesplegable>
              <ItemDesplegable value="1">Solo vencidas</ItemDesplegable>
            </DesplegablePildora>
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
              className="label-cayla inline-flex items-center gap-1.5 rounded-full border border-tinta/15 bg-tinta/[0.04] px-2.5 py-1 text-[10px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
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
          className={`label-cayla group relative flex h-9 shrink-0 items-center gap-1.5 px-3 text-[11px] outline-none transition-colors ${
            activa ? "text-tinta" : "text-tinta/60 hover:text-tinta"
          }`}
        >
          <CalendarRange aria-hidden className={`h-3.5 w-3.5 shrink-0 transition-colors ${activa ? "text-tinta/70" : "text-tinta/40 group-hover:text-tinta/60"}`} />
          {texto}
          <Hilo activo={abierto} />
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
