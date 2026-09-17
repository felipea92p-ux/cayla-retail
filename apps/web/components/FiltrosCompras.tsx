"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CampoSelectNativo, CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { ETIQUETA_ESTADO_PAGO, ETIQUETA_ESTADO_RECEPCION, fechaCorta, type EstadoPago, type EstadoRecepcion } from "@/lib/compras-reglas";

// Filtros de las tablas de Compras. Viven en la URL (?q=…&pago=…): así la
// página es un Server Component que filtra en Postgres, el enlace se puede
// compartir, y "atrás" del navegador vuelve al filtro anterior. Cambiar un
// filtro borra el cursor de paginación — una página 3 de otro filtro no
// significa nada.
//
// 2026-09-14: se partieron en dos niveles. Siete controles en dos filas
// empujaban la tabla —lo que se vino a ver— debajo del pliegue, y la
// mayoría de los días solo se usa la búsqueda y el proveedor. Los
// `principales` van siempre a la vista; el resto se abre con "Más filtros"
// (y se abre solo si alguno de ellos ya está aplicado, para que un filtro
// activo nunca quede escondido). Lo aplicado se repite como chips con ×,
// que es como se lee "por qué veo estas 3 facturas y no las 40".
export type FiltroVisible = "busqueda" | "proveedor" | "pago" | "recepcion" | "condicion" | "fechas" | "vencidas";

type Proveedor = { id: string; nombre: string };

// Qué parámetro(s) de la URL usa cada filtro. `fechas` usa dos.
const PARAMS: Record<FiltroVisible, string[]> = {
  busqueda: ["q"],
  proveedor: ["prov"],
  pago: ["pago"],
  recepcion: ["recep"],
  condicion: ["cond"],
  fechas: ["desde", "hasta"],
  vencidas: ["vencidas"],
};

export function FiltrosCompras({
  proveedores,
  visibles,
  principales = ["busqueda", "proveedor"],
}: {
  proveedores: Proveedor[];
  visibles: FiltroVisible[];
  /** Los que van siempre a la vista; el resto de `visibles` queda bajo "Más filtros". */
  principales?: FiltroVisible[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busqueda, setBusqueda] = useState(params.get("q") ?? "");
  const primera = useRef(true);

  const secundarios = visibles.filter((f) => !principales.includes(f));
  const activo = (f: FiltroVisible) => PARAMS[f].some((k) => params.get(k));
  const haySecundarioActivo = secundarios.some(activo);
  const [expandidoAMano, setExpandidoAMano] = useState(false);
  // Si hay un filtro secundario aplicado (llegó por URL desde una tarjeta, o
  // por el botón "atrás"), el panel está abierto sí o sí: nunca se filtra
  // "a ciegas". Se deriva, no se sincroniza con un efecto.
  const expandido = expandidoAMano || haySecundarioActivo;

  function ver(f: FiltroVisible) {
    return visibles.includes(f) && (principales.includes(f) || expandido);
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

  // Los chips: un texto legible por cada filtro aplicado, con qué borrar al
  // tocar la ×. La búsqueda se lee desde la URL (no del estado local) para
  // que el chip aparezca cuando la consulta ya se hizo, no mientras se tipea.
  const chips: { texto: string; quitar: Record<string, string> }[] = [];
  const q = params.get("q");
  if (q) chips.push({ texto: `«${q}»`, quitar: { q: "" } });
  const prov = params.get("prov");
  if (prov) chips.push({ texto: proveedores.find((p) => p.id === prov)?.nombre ?? "Proveedor", quitar: { prov: "" } });
  const pago = params.get("pago") as EstadoPago | null;
  if (pago && ETIQUETA_ESTADO_PAGO[pago]) chips.push({ texto: `Pago: ${ETIQUETA_ESTADO_PAGO[pago]}`, quitar: { pago: "" } });
  const recep = params.get("recep") as EstadoRecepcion | null;
  if (recep && ETIQUETA_ESTADO_RECEPCION[recep]) chips.push({ texto: `Recepción: ${ETIQUETA_ESTADO_RECEPCION[recep]}`, quitar: { recep: "" } });
  const cond = params.get("cond");
  if (cond) chips.push({ texto: cond === "contado" ? "Al contado" : "Al crédito", quitar: { cond: "" } });
  if (params.get("vencidas")) chips.push({ texto: "Solo vencidas", quitar: { vencidas: "" } });
  const desde = params.get("desde");
  const hasta = params.get("hasta");
  if (desde || hasta) {
    chips.push({
      texto: desde && hasta ? `Emitida ${fechaCorta(desde)} – ${fechaCorta(hasta)}` : desde ? `Emitida desde ${fechaCorta(desde)}` : `Emitida hasta ${fechaCorta(hasta)}`,
      quitar: { desde: "", hasta: "" },
    });
  }

  return (
    <div className="card-cayla p-4">
      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
        {ver("busqueda") && (
          <CampoTexto
            etiqueta="Buscar"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Número de documento o proveedor"
            autoComplete="off"
            type="search"
          />
        )}
        {ver("proveedor") && (
          <CampoSelectNativo etiqueta="Proveedor" value={params.get("prov") ?? ""} onChange={(e) => aplicar({ prov: e.target.value })}>
            <option value="">Todos</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>{p.nombre}</option>
            ))}
          </CampoSelectNativo>
        )}
        {ver("pago") && (
          <CampoSelectNativo etiqueta="Pago" value={params.get("pago") ?? ""} onChange={(e) => aplicar({ pago: e.target.value })}>
            <option value="">Todos</option>
            {(["pendiente", "parcial", "pagada", "anulada"] as const).map((v) => (
              <option key={v} value={v}>{ETIQUETA_ESTADO_PAGO[v]}</option>
            ))}
          </CampoSelectNativo>
        )}
        {ver("recepcion") && (
          <CampoSelectNativo etiqueta="Recepción" value={params.get("recep") ?? ""} onChange={(e) => aplicar({ recep: e.target.value })}>
            <option value="">Todas</option>
            {(["sin_recibir", "parcial", "recibida"] as const).map((v) => (
              <option key={v} value={v}>{ETIQUETA_ESTADO_RECEPCION[v]}</option>
            ))}
          </CampoSelectNativo>
        )}
        {ver("vencidas") && (
          <CampoSelectNativo etiqueta="Vencimiento" value={params.get("vencidas") ?? ""} onChange={(e) => aplicar({ vencidas: e.target.value })}>
            <option value="">Todas</option>
            <option value="1">Solo vencidas</option>
          </CampoSelectNativo>
        )}
        {ver("condicion") && (
          <CampoSelectNativo etiqueta="Condición" value={params.get("cond") ?? ""} onChange={(e) => aplicar({ cond: e.target.value })}>
            <option value="">Todas</option>
            <option value="contado">Al contado</option>
            <option value="credito">Al crédito</option>
          </CampoSelectNativo>
        )}
        {ver("fechas") && (
          <>
            <CampoFecha etiqueta="Emitida desde" valor={params.get("desde") ?? ""} onValor={(v) => aplicar({ desde: v })} />
            <CampoFecha etiqueta="Emitida hasta" valor={params.get("hasta") ?? ""} onValor={(v) => aplicar({ hasta: v })} />
          </>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
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
            <span aria-hidden className="text-sm leading-none">×</span>
          </button>
        ))}
        {chips.length > 0 && (
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
        )}
        {secundarios.length > 0 && (
          <button
            type="button"
            onClick={() => setExpandidoAMano(!expandido)}
            aria-expanded={expandido}
            className="label-cayla ml-auto text-[11px] text-tinta/65 hover:text-rojo"
          >
            {expandido ? "Menos filtros ↑" : "Más filtros ↓"}
          </button>
        )}
      </div>
    </div>
  );
}
