"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import type { Proveedor } from "@/lib/proveedores";
import { soles } from "@/lib/compras-reglas";
import { hoyLima } from "@/lib/fechas-lima";
import { estadoDeProveedor, haceCuanto, inicialesMeses, siguientePaso, sinDatosDePago } from "@/lib/proveedores-reglas";
import { BarrasMensuales } from "@/components/ui/BarrasMensuales";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { PasoSugerido } from "@/components/ui/PasoSugerido";

/** Debe coincidir con `.anim-cajon-salida` en globals.css. */
const MS_SALIDA = 240;

// Vista rápida de un proveedor (ADR-0128, spike 2026-09-19): al tocar una fila se abre un cajón desde el
// borde derecho en vez de saltar a la ficha. El problema que resuelve: comparar cinco proveedores
// obligaba a ir a la ficha y volver a la lista cinco veces, perdiendo el orden, el filtro y la búsqueda.
// Acá la lista queda detrás, intacta, y con ↑ ↓ se pasa de un proveedor al siguiente sin cerrar.
//
// Es solo de líder (lo financiero solo llega a un líder; a un colaborador no se le ofrece). La ficha
// completa sigue siendo la pantalla de referencia: esto es el vistazo, no la reemplaza.
//
// Cierre en dos tiempos, igual que `Modal`: primero se anima la salida y recién ahí se le avisa al padre.
export function ProveedorVistaRapida({
  proveedor: p,
  marcas,
  serie,
  posicion,
  cambiando,
  onCerrar,
  onNavegar,
  onCambiarEstado,
}: {
  proveedor: Proveedor;
  /** Marcas con que se conoce al proveedor (ADR-0140). Vacío si no tiene o no se pudieron leer. */
  marcas: readonly string[];
  /** Doce montos mensuales; `null` si la función de series no está disponible (se omite la sección). */
  serie: number[] | null;
  posicion: { indice: number; total: number };
  cambiando: boolean;
  onCerrar: () => void;
  onNavegar: (delta: 1 | -1) => void;
  onCambiarEstado: () => void;
}) {
  const [cerrando, setCerrando] = useState(false);
  const pedirCierre = useCallback(() => setCerrando(true), []);
  useEffect(() => {
    if (!cerrando) return;
    const reducido = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const t = setTimeout(onCerrar, reducido ? 0 : MS_SALIDA);
    return () => clearTimeout(t);
  }, [cerrando, onCerrar]);

  const paso = siguientePaso(estadoDeProveedor(p));
  const sinCompras90 = p.dias_desde_ultima_compra != null && p.dias_desde_ultima_compra > 90;

  return (
    <Dialog.Root open onOpenChange={(abierto) => !abierto && pedirCierre()}>
      <Dialog.Portal>
        <Dialog.Overlay className={`fixed inset-0 z-50 bg-tinta/25 backdrop-blur-[2px] ${cerrando ? "anim-velo-salida" : "anim-velo"}`} />
        <Dialog.Content
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); onNavegar(1); }
            if (e.key === "ArrowUp") { e.preventDefault(); onNavegar(-1); }
          }}
          className={`fixed inset-y-0 right-0 z-50 flex w-full max-w-[28.5rem] flex-col border-l border-sand bg-papel outline-none ${cerrando ? "anim-cajon-salida" : "anim-cajon"}`}
        >
          {/* `key`: al pasar de un proveedor a otro el contenido se re-asienta, el cajón no se cierra ni se vuelve a abrir. */}
          <div key={p.id} className="anim-asentar flex min-h-0 flex-1 flex-col">
            <div className="flex items-start gap-3.5 border-b border-tinta/10 px-6 pb-4 pt-5">
              <span aria-hidden className="font-display grid h-14 w-14 shrink-0 place-items-center rounded-full bg-sand text-2xl text-tinta">
                {p.nombre.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <Dialog.Title asChild>
                  <h2 className="font-display text-[23px] leading-tight text-tinta">{p.nombre}</h2>
                </Dialog.Title>
                <Dialog.Description className="mt-0.5 text-[13px] text-tinta/65">
                  {p.ruc ?? "Sin RUC"} · {p.contacto ?? "Sin contacto"}
                </Dialog.Description>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {p.rubros.map((r) => (
                    <Chip key={r} className="normal-case tracking-normal font-medium text-xs">
                      {r}
                    </Chip>
                  ))}
                  {marcas.map((m) => (
                    <Chip key={m} className="normal-case tracking-normal font-medium text-xs">
                      {m}
                    </Chip>
                  ))}
                  {p.plazo_credito_dias != null && <Chip className="normal-case tracking-normal font-medium text-xs">Crédito a {p.plazo_credito_dias} días</Chip>}
                  {p.activo && sinDatosDePago(p) && <Chip tono="ambar" className="normal-case tracking-normal font-medium text-xs">Sin datos de pago</Chip>}
                  {!p.activo && <Chip tono="rojo" className="normal-case tracking-normal font-medium text-xs">Desactivado</Chip>}
                </div>
              </div>
              <button type="button" onClick={pedirCierre} aria-label="Cerrar" className="-mr-1 rounded-full p-1.5 text-tinta/55 transition-colors hover:bg-tinta/[0.04] hover:text-rojo">
                <X aria-hidden className="h-4 w-4" />
              </button>
            </div>

            <div className="scroll-cayla min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-5">
              <PasoSugerido paso={paso} proveedorId={p.id} animar />

              <dl className="mt-5 grid grid-cols-3 divide-x divide-sand overflow-hidden rounded-xl border border-sand">
                <div className="px-3.5 py-3">
                  <dt className="label-cayla text-[10px] text-tinta/65">Facturado 12 m</dt>
                  <dd className="font-display mt-0.5 text-[21px] leading-tight tabular-nums text-tinta">{soles(p.facturado_12m ?? 0).replace(/\.00$/, "")}</dd>
                </div>
                <div className="px-3.5 py-3">
                  <dt className="label-cayla text-[10px] text-tinta/65">Saldo</dt>
                  <dd className={`font-display mt-0.5 text-[21px] leading-tight tabular-nums ${(p.saldo_vencido ?? 0) > 0 ? "text-rojo" : "text-tinta"}`}>{soles(p.saldo ?? 0).replace(/\.00$/, "")}</dd>
                </div>
                <div className="px-3.5 py-3">
                  <dt className="label-cayla text-[10px] text-tinta/65">Última compra</dt>
                  <dd className={`font-display mt-1 text-lg leading-tight ${sinCompras90 && p.activo ? "text-ambar-profundo" : "text-tinta"}`}>{haceCuanto(p.dias_desde_ultima_compra)}</dd>
                </div>
              </dl>

              {serie && serie.some((v) => v > 0) && (
                <section className="mt-6">
                  <h3 className="label-cayla mb-2.5 text-[11px] text-tinta/65">Facturado por mes</h3>
                  <BarrasMensuales serie={serie} iniciales={inicialesMeses(hoyLima())} />
                </section>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5 border-t border-tinta/10 px-6 py-4">
              {p.activo && (
                <Link
                  href={`/compras/nueva?prov=${p.id}`}
                  className="label-cayla rounded-md border border-tinta/25 px-3 py-2 text-[11px] text-tinta/80 transition-colors hover:border-rojo hover:text-rojo"
                >
                  + Comprobante
                </Link>
              )}
              <Boton type="button" peso="discreto" cargando={cambiando} onClick={onCambiarEstado} className="px-3 py-2">
                {p.activo ? "Desactivar" : "Reactivar"}
              </Boton>
              <span className="ml-auto flex items-center gap-1.5 text-xs tabular-nums text-tinta/55">
                {posicion.indice + 1} de {posicion.total}
                <button type="button" onClick={() => onNavegar(-1)} aria-label="Proveedor anterior" className="rounded-md border border-tinta/15 p-1.5 transition-colors hover:border-rojo hover:text-rojo">
                  <ChevronUp aria-hidden className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => onNavegar(1)} aria-label="Proveedor siguiente" className="rounded-md border border-tinta/15 p-1.5 transition-colors hover:border-rojo hover:text-rojo">
                  <ChevronDown aria-hidden className="h-3.5 w-3.5" />
                </button>
              </span>
              <Link
                href={`/compras/proveedores/${p.id}`}
                className="label-cayla basis-full rounded-md bg-tinta px-4 py-3 text-center text-[11px] text-crema transition-colors hover:bg-rojo"
              >
                Abrir ficha completa →
              </Link>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
