"use client";

import { useState } from "react";
import { Chip } from "@/components/ui/Chip";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { resumenDeEnvios, type EnvioMio } from "@/lib/mis-envios-reglas";
import type { UltimaRondaVista } from "@/lib/mi-plata-reglas";
import { HojaDeRonda } from "./ListaDelDia";

// «Tu última ronda» (Felipe 2026-10-27: «cuando la ronda no está abierta se ve muy básico, hay que hacerlo más profesional»). Sin ronda abierta
// la columna de la derecha era un «Antes de abrir tu ronda 0» con una frase y un «Ver 2» plegado: la pantalla parecía vacía aunque la
// compradora tuviera rondas. Ahora lo primero que ve es cómo terminó la última —cuánto salió de su plata, cómo cerró y en qué van sus
// envíos—, con UN estado dicho por quién lo hace (lo que falta lo hace Compras, o ella al entregar en caja), y a un toque, la hoja con lo
// que compró y gastó. Solo se lee: abrir una ronda nueva está a la izquierda. El armado de los datos: `ultimaRondaDelHistorial`.
export function UltimaRonda({ u, envios, hoy }: { u: UltimaRondaVista; envios: EnvioMio[] | null; hoy?: string }) {
  const [abierta, setAbierta] = useState(false);
  const resumen = envios ? resumenDeEnvios(envios, hoy) : null;
  return (
    <section aria-label="Tu última ronda" data-guia="mi-plata.ultima" className="card-cayla flex min-w-0 flex-col gap-4 p-5">
      <header className="flex flex-col gap-1">
        {/* El sello comparte línea con la etiqueta, no con el título: a 375 px «Ronda RC-000004» se partía en el guion. */}
        <span className="flex items-center justify-between gap-3">
          <span className="label-cayla text-[11px] text-taupe">Tu última ronda</span>
          <Chip tono={u.estado.pendiente ? "pizarra" : "verde"} title={u.estado.detalle}>
            {u.estado.texto}
          </Chip>
        </span>
        <span className="font-serif text-[28px] leading-tight text-tinta">{u.ronda.titulo}</span>
        <span className="text-sm text-taupe">{u.ronda.detalle}</span>
      </header>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 rounded-[14px] bg-hueso px-4 py-3.5 sm:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="label-cayla text-[11px] text-taupe">Salió de tu plata</dt>
          <dd className="font-serif text-2xl leading-none tabular-nums text-tinta">{u.ronda.monto}</dd>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="label-cayla text-[11px] text-taupe">Cómo cerró</dt>
          <dd className="text-sm text-tinta">{u.comoCerro}</dd>
        </div>
        {resumen && (
          <div className="col-span-2 flex min-w-0 flex-col gap-1 sm:col-span-1">
            <dt className="label-cayla text-[11px] text-taupe">Envíos</dt>
            <dd className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-tinta">
              {resumen.texto}
              {resumen.chip && <Chip tono={resumen.chip.tono}>{resumen.chip.texto}</Chip>}
            </dd>
          </div>
        )}
      </dl>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <BotonVer chico onClick={() => setAbierta(true)} guia="mi-plata.ultima-detalle">
          Ver lo que anoté
        </BotonVer>
        {envios && envios.length > 0 && <EnlaceVer href="/compras/mi-plata/envios">Mis envíos</EnlaceVer>}
      </div>
      {abierta && <HojaDeRonda e={u.ronda} envios={envios ?? []} hoy={hoy} onClose={() => setAbierta(false)} />}
    </section>
  );
}
