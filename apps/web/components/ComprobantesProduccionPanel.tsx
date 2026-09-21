"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { SegmentoDeslizante } from "@/components/ui/SegmentoDeslizante";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { ComprobanteProduccionDetalle } from "@/components/ComprobanteProduccionDetalle";
import { ComprobanteProduccionForm } from "@/components/ComprobanteProduccionForm";
import { estadoVisible, etiquetaTipo, filtrarComprobantes, resumenComprobantes, type ComprobanteProduccion, type FiltroEstado } from "@/lib/comprobantes-produccion-reglas";
import type { InsumoParaComprobante } from "@/lib/comprobantes-produccion";
import type { ProveedorProduccion } from "@/lib/proveedores-produccion-reglas";

// Comprobantes de Producción (ADR-0133, F4b; D-H): la factura de quien le vende tela, avíos o maquila al Taller, con su saldo. Solo líder.
// «Por pagar», «Vencido» y el saldo de cada fila se DERIVAN de los pagos: nunca se digitan. El rojo de la pantalla lo lleva la cifra de
// «Vencido» (máximo 2 por pantalla); las filas vencidas van en ámbar con sus días.

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function ComprobantesProduccionPanel({
  comprobantes,
  proveedores,
  todosLosProveedores,
  insumos,
  hoy,
  tallerId,
}: {
  comprobantes: ComprobanteProduccion[];
  proveedores: ProveedorProduccion[];
  todosLosProveedores: ProveedorProduccion[];
  insumos: InsumoParaComprobante[];
  hoy: string;
  tallerId: string | null;
}) {
  const [estado, setEstado] = useState<FiltroEstado>("todos");
  const [proveedorId, setProveedorId] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [nuevo, setNuevo] = useState(false);
  const [abierto, setAbierto] = useState<string | null>(null);

  const resumen = resumenComprobantes(comprobantes, hoy);
  const visibles = filtrarComprobantes(comprobantes, { estado, proveedorId: proveedorId || null, busqueda });
  const detalle = comprobantes.find((c) => c.id === abierto) ?? null;
  const conteo = (f: FiltroEstado) => filtrarComprobantes(comprobantes, { estado: f, proveedorId: null, busqueda: "" }).length;

  return (
    <div className="space-y-6">
      <div className="anim-entra flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Producción</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Comprobantes</h1>
          <p className="mt-1 max-w-xl text-sm text-tinta/65">La factura de quien le vende al Taller: qué se compró, a qué precio y cuánto falta pagar. Es un libro aparte del de Compras.</p>
        </div>
        <Boton peso="primario" onClick={() => setNuevo(true)}>
          + Nuevo comprobante
        </Boton>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <TarjetaCifra
          compacta
          punto={resumen.porPagar > 0 ? "ambar" : "verde"}
          etiqueta="Por pagar"
          className="anim-entra"
          style={{ ["--i" as string]: 0 }}
          vacia={resumen.porPagar === 0}
          valor={resumen.porPagar === 0 ? "—" : <CifraQueCuenta valor={resumen.porPagar} formato="soles" alMontar />}
        >
          {resumen.conSaldo > 0 ? plural(resumen.conSaldo, "comprobante con saldo", "comprobantes con saldo") : "nada pendiente"}
        </TarjetaCifra>
        <TarjetaCifra
          compacta
          punto={resumen.nVencidos > 0 ? "rojo" : "verde"}
          etiqueta="Vencido"
          className="anim-entra"
          style={{ ["--i" as string]: 1 }}
          vacia={resumen.nVencidos === 0}
          valor={resumen.nVencidos === 0 ? "—" : <CifraQueCuenta valor={resumen.vencido} formato="soles" alMontar />}
          detalleTono={resumen.nVencidos > 0 ? "text-rojo-profundo" : "text-verde-profundo"}
        >
          {resumen.nVencidos > 0 ? `${plural(resumen.nVencidos, "comprobante ya venció", "comprobantes ya vencieron")}` : "nada vencido"}
        </TarjetaCifra>
        <TarjetaCifra
          compacta
          punto="verde"
          etiqueta="Comprado este mes"
          className="anim-entra"
          style={{ ["--i" as string]: 2 }}
          vacia={resumen.nDelMes === 0}
          valor={resumen.nDelMes === 0 ? "—" : <CifraQueCuenta valor={resumen.delMes} formato="soles" alMontar />}
        >
          {resumen.nDelMes > 0 ? `${plural(resumen.nDelMes, "comprobante", "comprobantes")}, IGV incluido` : "sin comprobantes este mes"}
        </TarjetaCifra>
      </div>

      {comprobantes.length === 0 ? (
        <div className="card-cayla space-y-2 p-5 text-sm text-tinta/75">
          <p>
            Aquí se registra la factura de cada proveedor del Taller: la tela por metro, los avíos, la maquila. De ella salen cuánto se le debe, cuándo vence y a qué precio
            subió la tela.
          </p>
          {todosLosProveedores.length === 0 ? <p>Primero agrega al proveedor en Proveedores; después registra su comprobante.</p> : <p>Registra el primero con «Nuevo comprobante».</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SegmentoDeslizante
              etiqueta="Filtrar por estado"
              valor={estado}
              onCambio={(c) => setEstado(c as FiltroEstado)}
              opciones={[
                { clave: "todos", etiqueta: "Todos", conteo: comprobantes.length },
                { clave: "por_pagar", etiqueta: "Por pagar", conteo: conteo("por_pagar") },
                { clave: "vencidos", etiqueta: "Vencidos", conteo: conteo("vencidos") },
                { clave: "pagados", etiqueta: "Pagados", conteo: conteo("pagados") },
                { clave: "anulados", etiqueta: "Anulados", conteo: conteo("anulados") },
              ]}
            />
            <select
              aria-label="Filtrar por proveedor"
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              className="card-cayla h-9 px-3 text-sm text-tinta outline-none focus:border-rojo"
            >
              <option value="">Todos los proveedores</option>
              {todosLosProveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <label className="card-cayla ml-auto flex min-w-52 items-center gap-2 px-3 py-1.5">
              <Search size={15} aria-hidden className="text-tinta/45" />
              <span className="sr-only">Buscar comprobante</span>
              <input type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Proveedor o F001-123" className="w-full bg-transparent text-sm text-tinta outline-none placeholder:text-tinta/45" />
            </label>
          </div>

          {visibles.length === 0 ? (
            <p className="card-cayla p-5 text-sm text-tinta/70">Ningún comprobante coincide con lo que buscas.</p>
          ) : (
            <div className="card-cayla overflow-hidden">
              <div className="hidden grid-cols-[4rem_minmax(0,1.6fr)_7rem_7rem_11rem] gap-4 border-b border-tinta/10 px-4 py-2.5 sm:grid">
                <span className="label-cayla text-[11px] text-tinta/65">Fecha</span>
                <span className="label-cayla text-[11px] text-tinta/65">Proveedor</span>
                <span className="label-cayla text-right text-[11px] text-tinta/65">Total</span>
                <span className="label-cayla text-right text-[11px] text-tinta/65">Saldo</span>
                <span className="label-cayla text-[11px] text-tinta/65">Estado</span>
              </div>
              <ul>
                {visibles.map((c, i) => {
                  const est = estadoVisible(c, hoy);
                  return (
                    <li key={c.id} className="anim-entra border-b border-tinta/10 last:border-b-0" style={{ ["--i" as string]: Math.min(i, 8) }}>
                      <button
                        type="button"
                        onClick={() => setAbierto(c.id)}
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left outline-none transition-colors hover:bg-sand/40 focus-visible:bg-sand/40 sm:grid-cols-[4rem_minmax(0,1.6fr)_7rem_7rem_11rem]"
                      >
                        <span className="hidden text-[13px] tabular-nums text-tinta/75 sm:block">{diaMes(c.fechaEmision)}</span>
                        <span className="min-w-0">
                          <span className={`block truncate text-[14px] ${c.estado === "anulada" ? "text-tinta/55 line-through" : "text-tinta"}`}>{c.proveedor}</span>
                          <span className="block text-xs text-tinta/65">
                            {etiquetaTipo(c.tipo, true)} {c.serie}-{c.numero} · {plural(c.lineas, "línea", "líneas")}
                            <span className="sm:hidden"> · {diaMes(c.fechaEmision)}</span>
                          </span>
                        </span>
                        <span className="text-right text-[13px] tabular-nums text-tinta">{soles(c.total)}</span>
                        <span className="hidden text-right text-[13px] tabular-nums text-tinta sm:block">{c.saldo > 0 ? soles(c.saldo) : <span className="text-tinta/45">—</span>}</span>
                        <span className="col-span-2 sm:col-span-1">
                          <Chip tono={est.tono}>{est.texto}</Chip>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <p className="text-xs text-tinta/65">Un comprobante dice qué se compró, no qué llegó: la mercadería se recibe en Recibir, donde cada línea abre su lote. El pago posterior de un crédito se registra en Por pagar.</p>
        </div>
      )}

      {nuevo && <ComprobanteProduccionForm proveedores={proveedores} insumos={insumos} hoy={hoy} proveedorInicialId={proveedorId || null} onClose={() => setNuevo(false)} />}
      {detalle && <ComprobanteProduccionDetalle comprobante={detalle} hoy={hoy} tallerId={tallerId} onClose={() => setAbierto(null)} />}
    </div>
  );
}
