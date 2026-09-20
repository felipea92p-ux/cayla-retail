"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { ProveedorProduccionModal } from "@/components/ProveedorProduccionModal";
import {
  RUBROS_PRODUCCION,
  condicionDePago,
  etiquetaRubro,
  filtrarProveedores,
  resumenProveedores,
  sinDatosDePago,
  type ProveedorProduccion,
  type RubroProduccion,
} from "@/lib/proveedores-produccion-reglas";

// Proveedores de Producción (ADR-0133, F4a; D-H): quienes le venden tela, avíos y maquila al Taller. Directorio aparte del de
// Compras. Solo se muestra lo que la base ya sabe de cada uno —lotes recibidos, total comprado, última entrega—; el saldo y el
// cumplimiento del spike llegan con los comprobantes y las recepciones de Producción (F4b a F4d) y no se dibujan antes.

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function ProveedoresProduccionPanel({ proveedores }: { proveedores: ProveedorProduccion[] }) {
  const [rubro, setRubro] = useState<RubroProduccion | "todos">("todos");
  const [busqueda, setBusqueda] = useState("");
  const [verArchivados, setVerArchivados] = useState(false);
  const [editando, setEditando] = useState<ProveedorProduccion | "nuevo" | null>(null);

  const resumen = resumenProveedores(proveedores);
  const visibles = filtrarProveedores(proveedores, { rubro, busqueda, verArchivados });

  return (
    <div className="space-y-6">
      <div className="anim-entra flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <p className="label-cayla text-[11px] text-tinta/65">Producción</p>
          <h1 className="font-display mt-1 text-2xl text-tinta">Proveedores</h1>
          <p className="mt-1 max-w-xl text-sm text-tinta/65">Quién le vende tela, avíos y maquila al Taller. Es un directorio aparte del de Compras.</p>
        </div>
        <Boton peso="primario" onClick={() => setEditando("nuevo")}>
          + Nuevo proveedor
        </Boton>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <TarjetaCifra compacta punto="verde" etiqueta="Proveedores activos" className="anim-entra" style={{ ["--i" as string]: 0 }} valor={<CifraQueCuenta valor={resumen.activos} alMontar />}>
          {resumen.archivados > 0 ? `${plural(resumen.archivados, "archivado", "archivados")} aparte` : "ninguno archivado"}
        </TarjetaCifra>
        <TarjetaCifra
          compacta
          punto="verde"
          etiqueta="Comprado al Taller"
          className="anim-entra"
          style={{ ["--i" as string]: 1 }}
          vacia={resumen.totalComprado === 0}
          valor={resumen.totalComprado === 0 ? "—" : <CifraQueCuenta valor={resumen.totalComprado} formato="soles" alMontar />}
        >
          sin IGV, en lotes recibidos
        </TarjetaCifra>
        <TarjetaCifra compacta punto="verde" etiqueta="Lotes recibidos" className="anim-entra" style={{ ["--i" as string]: 2 }} valor={<CifraQueCuenta valor={resumen.lotes} alMontar />}>
          cada ingreso de insumo abre uno
        </TarjetaCifra>
      </div>

      {proveedores.length === 0 ? (
        <div className="card-cayla space-y-2 p-5 text-sm text-tinta/75">
          <p>
            Aquí van quienes le venden al Taller: la tela por metro, los avíos, la maquila. Cada lote de insumo se registra con su proveedor, y de ahí salen cuánto se
            le compra, cuándo entrega y a qué precio.
          </p>
          <p>Empieza agregando al primero.</p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Filtrar por rubro" className="flex flex-wrap gap-1.5">
              {[{ valor: "todos" as const, etiqueta: "Todos", n: resumen.activos }, ...RUBROS_PRODUCCION.map((r) => ({ valor: r.valor, etiqueta: r.etiqueta, n: resumen.porRubro[r.valor] }))].map((r) => (
                <button
                  key={r.valor}
                  type="button"
                  aria-pressed={rubro === r.valor}
                  onClick={() => setRubro(r.valor)}
                  className="rounded-full border border-tinta/15 px-3 py-1.5 text-[12.5px] text-tinta/80 outline-none transition-colors hover:border-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo/60 aria-pressed:border-tinta aria-pressed:bg-tinta aria-pressed:text-crema"
                >
                  {r.etiqueta}
                  <small className="ml-1.5 opacity-70">{r.n}</small>
                </button>
              ))}
            </div>
            <label className="card-cayla ml-auto flex min-w-56 items-center gap-2 px-3 py-1.5">
              <Search size={15} aria-hidden className="text-tinta/45" />
              <span className="sr-only">Buscar proveedor</span>
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre, RUC o contacto"
                className="w-full bg-transparent text-sm text-tinta outline-none placeholder:text-tinta/45"
              />
            </label>
            {resumen.archivados > 0 && (
              <label className="flex items-center gap-2 text-xs text-tinta/70">
                <input type="checkbox" checked={verArchivados} onChange={(e) => setVerArchivados(e.target.checked)} />
                Ver archivados
              </label>
            )}
          </div>

          {visibles.length === 0 ? (
            <p className="card-cayla p-5 text-sm text-tinta/70">Ningún proveedor coincide con lo que buscas.</p>
          ) : (
            <div className="card-cayla overflow-hidden">
              <div className="hidden grid-cols-[minmax(0,1.6fr)_7rem_5rem_6.5rem_auto] gap-4 border-b border-tinta/10 px-4 py-2.5 sm:grid">
                <span className="label-cayla text-[11px] text-tinta/65">Proveedor</span>
                <span className="label-cayla text-right text-[11px] text-tinta/65">Comprado</span>
                <span className="label-cayla text-right text-[11px] text-tinta/65">Lotes</span>
                <span className="label-cayla text-right text-[11px] text-tinta/65">Última entrega</span>
                <span className="w-24" />
              </div>
              <ul>
                {visibles.map((p, i) => (
                  <li key={p.id} className="anim-entra border-b border-tinta/10 last:border-b-0" style={{ ["--i" as string]: Math.min(i, 8) }}>
                    <button
                      type="button"
                      onClick={() => setEditando(p)}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left outline-none transition-colors hover:bg-sand/40 focus-visible:bg-sand/40 sm:grid-cols-[minmax(0,1.6fr)_7rem_5rem_6.5rem_auto]"
                    >
                      <span className="min-w-0">
                        <span className={`block truncate text-[14px] ${p.activo ? "text-tinta" : "text-tinta/55 line-through"}`}>{p.nombre}</span>
                        <span className="block text-xs text-tinta/65">
                          {etiquetaRubro(p.rubro)} · {condicionDePago(p.plazoCreditoDias)}
                          {p.contacto ? ` · ${p.contacto}` : ""}
                        </span>
                      </span>
                      <span className="text-right text-[13px] tabular-nums text-tinta">{p.totalComprado > 0 ? soles(p.totalComprado) : <span className="text-tinta/45">—</span>}</span>
                      <span className="hidden text-right text-[13px] tabular-nums text-tinta sm:block">{p.lotes > 0 ? p.lotes : <span className="text-tinta/45">—</span>}</span>
                      <span className="hidden text-right text-[13px] tabular-nums text-tinta sm:block">{p.ultimaEntrega ? diaMes(p.ultimaEntrega) : <span className="text-tinta/45">—</span>}</span>
                      <span className="col-span-2 flex flex-wrap justify-end gap-1.5 sm:col-span-1 sm:w-24">
                        {!p.activo && <Chip tono="apagado">Archivado</Chip>}
                        {p.activo && sinDatosDePago(p) && <Chip tono="ambar">Sin datos de pago</Chip>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-xs text-tinta/65">
            El saldo por pagar y el cumplimiento de cada proveedor aparecen cuando el Taller registre sus comprobantes y reciba pedidos: se calculan de eso, nunca se digitan.
          </p>
        </div>
      )}

      {editando && <ProveedorProduccionModal proveedor={editando === "nuevo" ? null : editando} onClose={() => setEditando(null)} />}
    </div>
  );
}
