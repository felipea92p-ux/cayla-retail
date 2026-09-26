"use client";

import { useState } from "react";
import { diaMes } from "@/lib/fechas-lima";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { RecibirComprobanteModal } from "@/components/RecibirComprobanteModal";
import { etiquetaTipo } from "@/lib/comprobantes-produccion-reglas";
import { cantidadTexto } from "@/lib/insumos-reglas";
import { agruparPorComprobante, resumenRecepcion, type ComprobantePorRecibir, type LineaPorRecibir } from "@/lib/recibir-produccion-reglas";

// Recibir insumos (ADR-0133, F4d). Los comprobantes de los proveedores con lo que todavía no llegó, del que lleva más tiempo esperando al
// más nuevo. Solo CANTIDADES: quien recibe en el Taller no ve dinero. Cada línea que llega abre un lote (con el costo de la línea, que la
// base pone sola); lo que no va a llegar se cierra con su motivo. Un mismo comprobante puede recibirse en varias entregas.

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function RecibirProduccionPanel({ lineas, tallerId }: { lineas: LineaPorRecibir[]; tallerId: string }) {
  const [recibiendo, setRecibiendo] = useState<ComprobantePorRecibir | null>(null);
  const grupos = agruparPorComprobante(lineas);
  const abiertos = grupos.filter((g) => g.estado !== "completa");
  const completos = grupos.filter((g) => g.estado === "completa");
  const resumen = resumenRecepcion(grupos);

  return (
    <div className="space-y-6">
      <div className="anim-entra">
        <p className="label-cayla text-[11px] text-tinta/65">Producción</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Recibir</h1>
        <p className="mt-1 max-w-xl text-sm text-tinta/65">
          La tela y los avíos que llegan al Taller, contra el comprobante del proveedor. Cada línea que llega abre un lote; lo que no llegue se cierra con su motivo.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <TarjetaCifra
          compacta
          punto={resumen.porRecibir > 0 ? "ambar" : "verde"}
          etiqueta="Por recibir"
          className="anim-entra"
          style={{ ["--i" as string]: 0 }}
          valor={<CifraQueCuenta valor={resumen.porRecibir} alMontar />}
        >
          {resumen.porRecibir > 0 ? plural(resumen.porRecibir, "comprobante espera mercadería", "comprobantes esperan mercadería") : "nada pendiente"}
        </TarjetaCifra>
        <TarjetaCifra compacta punto="verde" etiqueta="Líneas pendientes" className="anim-entra" style={{ ["--i" as string]: 1 }} valor={<CifraQueCuenta valor={resumen.lineasPendientes} alMontar />}>
          insumos que aún no llegan
        </TarjetaCifra>
        <TarjetaCifra compacta punto="verde" etiqueta="A medio recibir" className="anim-entra" style={{ ["--i" as string]: 2 }} valor={<CifraQueCuenta valor={resumen.parciales} alMontar />}>
          {resumen.parciales > 0 ? "llegaron en parte" : "ninguno a medias"}
        </TarjetaCifra>
      </div>

      {grupos.length === 0 ? (
        <div className="card-cayla space-y-1.5 p-5 text-sm text-tinta/75">
          <p>No hay comprobantes con insumos para recibir. Cuando el líder registre la factura de un proveedor de tela o avíos, aparecerá aquí.</p>
        </div>
      ) : abiertos.length === 0 ? (
        <div className="card-cayla p-5 text-sm text-tinta/75">Todo lo facturado ya llegó o se cerró. No hay nada por recibir.</div>
      ) : (
        <ul className="space-y-3">
          {abiertos.map((g, i) => (
            <li key={g.comprobanteId} className="card-cayla anim-entra p-4" style={{ ["--i" as string]: Math.min(i, 8) }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] text-tinta">{g.proveedor}</p>
                  <p className="text-xs text-tinta/65">
                    {etiquetaTipo(g.tipo, true)} {g.documento} · emitido {diaMes(g.fechaEmision)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {g.estado === "parcial" && <Chip tono="ambar">Llegó en parte</Chip>}
                  <Boton peso="primario" onClick={() => setRecibiendo(g)}>
                    Recibir
                  </Boton>
                </div>
              </div>
              <ul className="mt-3">
                {g.pendientes.map((l) => (
                  <li key={l.itemId} className="flex items-baseline justify-between gap-3 border-t border-tinta/10 py-2 text-[13px]">
                    <span className="min-w-0 truncate text-tinta">{l.insumo}</span>
                    <span className="whitespace-nowrap tabular-nums text-tinta/80">
                      faltan <b className="font-semibold text-tinta">{cantidadTexto(l.pendiente, l.unidad)}</b>
                      {(l.recibido > 0 || l.cerrado > 0) && <small className="ml-1.5 text-xs text-tinta/60">de {cantidadTexto(l.facturado, l.unidad)}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {completos.length > 0 && (
        <details className="card-cayla p-4">
          <summary className="cursor-pointer text-sm text-tinta/80">Ya recibidos ({completos.length})</summary>
          <ul className="mt-2">
            {completos.map((g) => (
              <li key={g.comprobanteId} className="flex items-baseline justify-between gap-3 border-t border-tinta/10 py-2 text-[13px]">
                <span className="min-w-0 truncate text-tinta">{g.proveedor}</span>
                <span className="whitespace-nowrap text-xs tabular-nums text-tinta/65">
                  {etiquetaTipo(g.tipo, true)} {g.documento} · {diaMes(g.fechaEmision)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {recibiendo && <RecibirComprobanteModal comprobante={recibiendo} tallerId={tallerId} onClose={() => setRecibiendo(null)} />}
    </div>
  );
}
