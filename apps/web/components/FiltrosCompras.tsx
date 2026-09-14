"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CampoSelectNativo, CampoTexto, Boton } from "@/components/ui/campos";
import { ETIQUETA_ESTADO_PAGO, ETIQUETA_ESTADO_RECEPCION } from "@/lib/compras-reglas";

// Filtros de las tablas de Compras. Viven en la URL (?q=…&pago=…): así la
// página es un Server Component que filtra en Postgres, el enlace se puede
// compartir, y "atrás" del navegador vuelve al filtro anterior. Cambiar un
// filtro borra el cursor de paginación — una página 3 de otro filtro no
// significa nada.
export type FiltroVisible = "busqueda" | "proveedor" | "pago" | "recepcion" | "condicion" | "fechas" | "vencidas";

type Proveedor = { id: string; nombre: string };

export function FiltrosCompras({ proveedores, visibles }: { proveedores: Proveedor[]; visibles: FiltroVisible[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busqueda, setBusqueda] = useState(params.get("q") ?? "");
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

  const hayFiltros = ["q", "prov", "pago", "recep", "cond", "desde", "hasta", "vencidas"].some((k) => params.has(k));

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
        {ver("condicion") && (
          <CampoSelectNativo etiqueta="Condición" value={params.get("cond") ?? ""} onChange={(e) => aplicar({ cond: e.target.value })}>
            <option value="">Todas</option>
            <option value="contado">Al contado</option>
            <option value="credito">Al crédito</option>
          </CampoSelectNativo>
        )}
        {ver("vencidas") && (
          <CampoSelectNativo etiqueta="Vencimiento" value={params.get("vencidas") ?? ""} onChange={(e) => aplicar({ vencidas: e.target.value })}>
            <option value="">Todas</option>
            <option value="1">Solo vencidas</option>
          </CampoSelectNativo>
        )}
        {ver("fechas") && (
          <>
            <CampoTexto etiqueta="Emitida desde" type="date" value={params.get("desde") ?? ""} onChange={(e) => aplicar({ desde: e.target.value })} />
            <CampoTexto etiqueta="Emitida hasta" type="date" value={params.get("hasta") ?? ""} onChange={(e) => aplicar({ hasta: e.target.value })} />
          </>
        )}
      </div>
      {hayFiltros && (
        <div className="mt-1 flex justify-end">
          <Boton
            peso="discreto"
            className="px-3 py-2"
            onClick={() => {
              setBusqueda("");
              router.push(pathname);
            }}
          >
            Limpiar filtros
          </Boton>
        </div>
      )}
    </div>
  );
}
