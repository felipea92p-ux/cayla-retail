"use client";

import { useRouter } from "next/navigation";
import { Truck } from "lucide-react";
import { DesplegablePildora, TODOS } from "@/components/ui/FiltrosPildora";
import { SIN_EN_URL, type ReposicionProveedor } from "@/lib/marcas";

/** «A quién pedirle» (ADR-0109) como desplegable (2026-09-23): con 26 proveedores, los botones sueltos
 *  llenaban media pantalla. Elegir uno lleva a sus productos por reponer, igual que los botones de antes. */
export function AQuienPedirle({ reposicion, proveedorId }: { reposicion: ReposicionProveedor[]; proveedorId?: string }) {
  const router = useRouter();
  const valor = reposicion.some((r) => r.proveedorId === proveedorId) ? proveedorId! : TODOS;
  const total = reposicion.reduce((s, r) => s + r.productos, 0);
  // «Sin proveedor» (ADR-0283) es una fila más de la lista, pero no un proveedor: no suma al «N proveedores».
  const proveedoresReales = reposicion.filter((r) => r.proveedorId !== SIN_EN_URL).length;
  return (
    <div className="card-cayla flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <p className="label-cayla text-[11px] text-tinta/65">A quién pedirle</p>
      <div className="rounded-lg bg-sand/50 p-0.5">
        <DesplegablePildora
          icono={Truck}
          // La píldora ya dice su nombre (FiltrosPildora): «A quién pedirle» está escrito al lado, aquí va qué se elige.
          etiqueta="Proveedor"
          valor={valor}
          onValor={(v) => router.push(v === TODOS ? "/productos?stock=reponer" : `/productos?stock=reponer&proveedor=${v}`)}
          opciones={[
            { valor: TODOS, texto: `Todos · ${proveedoresReales} ${proveedoresReales === 1 ? "proveedor" : "proveedores"}` },
            ...reposicion.map((r) => ({
              valor: r.proveedorId,
              texto: `${r.proveedor} · ${r.productos} ${r.productos === 1 ? "producto" : "productos"}`,
            })),
          ]}
        />
      </div>
      <p className="text-xs text-tinta/55">
        {total} {total === 1 ? "producto" : "productos"} para pedir
      </p>
    </div>
  );
}
