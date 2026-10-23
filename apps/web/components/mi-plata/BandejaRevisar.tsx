"use client";

import { useState, type ReactNode } from "react";
import { CheckCheck } from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Vacio } from "@/components/ui/Vacio";
import { soles } from "@/lib/compras-reglas";
import type { CuentaOpcion } from "@/lib/fondos-reglas";
import type { PlataPorConfirmarConFoto } from "@/lib/mi-plata";
import type { GastoConFoto, PapelConFoto } from "@/lib/revisar-compras";
import {
  CIFRA_BANDEJA,
  TIPOS_BANDEJA,
  bandejaInicial,
  elegidoDeBandeja,
  filaCierre,
  filaGasto,
  filaPapel,
  filaPlata,
  siguienteDeBandeja,
  type CierrePorRecibir,
  type FilaBandeja,
  type ProveedorOpcion,
  type TipoBandeja,
} from "@/lib/revisar-compras-reglas";
import { DetalleCierre } from "./CierresPorRecibir";
import { DetalleGasto, MiniFotoGasto } from "./GastosPorRevisar";
import { DetallePapel, MiniFotoPapel } from "./PapelesPorCompletar";
import { DetallePlata, MiniVoucher } from "./PlataPorConfirmar";

// «Revisar compras» como bandeja (rediseño, maqueta docs/maquetas/compras-formidable-2026-10/, Felipe 2026-10-23). Arriba, cuatro cifras
// que FILTRAN: la plata por confirmar, las compras por completar, los gastos por revisar y los cierres del día (antes eran cuatro secciones
// una debajo de otra, en una página larga). Debajo, la lista de lo que espera a la izquierda (360 px: la foto, qué es, de quién y cuándo,
// cuánto y su estado) y el detalle al lado, sin abrir otra hoja: se pasa de uno a otro sin perder el lugar. Al guardar, lo hecho se va de
// la lista y queda el siguiente. En el celular, la lista arriba y el detalle debajo. Qué se guarda sigue siendo lo de cada detalle.

type Datos = {
  plata: PlataPorConfirmarConFoto[];
  papeles: PapelConFoto[];
  gastos: GastoConFoto[];
  cierres: CierrePorRecibir[];
  proveedores: ProveedorOpcion[];
  cuentas: CuentaOpcion[];
};

export function BandejaRevisar(d: Datos) {
  const cuantos: Record<TipoBandeja, number> = { plata: d.plata.length, papel: d.papeles.length, gasto: d.gastos.length, cierre: d.cierres.length };
  const [tipo, setTipo] = useState<TipoBandeja>(() => bandejaInicial(cuantos));
  const [elegido, setElegido] = useState<string | null>(null);

  // Cada lista con su fila de la bandeja, su miniatura y su detalle.
  const filas: Record<TipoBandeja, { fila: FilaBandeja; mini: ReactNode }[]> = {
    plata: d.plata.map((f) => ({ fila: filaPlata(f), mini: <MiniVoucher fila={f} /> })),
    papel: d.papeles.map((p) => ({ fila: filaPapel(p), mini: <MiniFotoPapel papel={p} /> })),
    gasto: d.gastos.map((g) => ({ fila: filaGasto(g), mini: <MiniFotoGasto gasto={g} /> })),
    cierre: d.cierres.map((c) => ({ fila: filaCierre(c), mini: null })),
  };
  const lista = filas[tipo];
  const actual = elegidoDeBandeja(lista.map((x) => x.fila), elegido);
  const totalPlata = d.plata.reduce((s, f) => s + f.monto, 0);
  const compradoras = new Set(d.plata.map((f) => f.personaId)).size;

  // Al guardar, lo hecho se va de la lista (la pantalla se rehace): queda elegido el que seguía.
  const alTerminar = () => actual && setElegido(siguienteDeBandeja(lista.map((x) => x.fila), actual.id));

  const detalle = () => {
    if (!actual) return null;
    if (tipo === "plata") {
      const f = d.plata.find((x) => x.id === actual.id);
      return f && <DetallePlata key={f.id} fila={f} cuentas={d.cuentas} alTerminar={alTerminar} />;
    }
    if (tipo === "papel") {
      const p = d.papeles.find((x) => x.id === actual.id);
      return p && <DetallePapel key={p.id} papel={p} proveedores={d.proveedores} alTerminar={alTerminar} alSaltar={lista.length > 1 ? alTerminar : undefined} />;
    }
    if (tipo === "gasto") {
      const g = d.gastos.find((x) => x.id === actual.id);
      return g && <DetalleGasto key={g.id} gasto={g} alTerminar={alTerminar} />;
    }
    const c = d.cierres.find((x) => x.id === actual.id);
    return c && <DetalleCierre key={c.id} cierre={c} cuentas={d.cuentas} alTerminar={alTerminar} />;
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-guia="fondos.cifras-revisar">
        {TIPOS_BANDEJA.map((t) => (
          <TarjetaCifra
            key={t}
            etiqueta={CIFRA_BANDEJA[t].nombre}
            valor={String(cuantos[t])}
            onClick={() => {
              setTipo(t);
              setElegido(null);
            }}
            activa={tipo === t}
            punto={cuantos[t] > 0 ? "ambar" : undefined}
            guia={`fondos.cifra-${t}`}
          >
            {t === "plata" && cuantos.plata > 0
              ? `${soles(totalPlata)} de ${compradoras === 1 ? "1 compradora" : `${compradoras} compradoras`}`
              : CIFRA_BANDEJA[t].detalle}
          </TarjetaCifra>
        ))}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[22.5rem_minmax(0,1fr)]">
        <ul className="card-cayla flex flex-col overflow-hidden" aria-label={CIFRA_BANDEJA[tipo].nombre} data-guia="fondos.bandeja">
          {lista.length === 0 ? (
            <li className="p-5">
              <Vacio icono={<CheckCheck aria-hidden />} titulo="Nada por revisar aquí" tamano="chico">
                Elige otra cifra de arriba.
              </Vacio>
            </li>
          ) : (
            lista.map(({ fila, mini }) => {
              const marcado = actual?.id === fila.id;
              return (
                <li key={fila.id} className="border-b border-sand last:border-b-0">
                  <button
                    type="button"
                    aria-current={marcado || undefined}
                    onClick={() => setElegido(fila.id)}
                    className={`relative grid w-full items-center gap-3 px-3.5 py-3 text-left transition-colors ${mini ? "grid-cols-[54px_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"} ${
                      marcado ? "bg-crema" : "hover:bg-hueso/60"
                    }`}
                  >
                    {/* El hilo rojo de canto marca el que está abierto, como la fila que se abre en una tabla. */}
                    {marcado && <span aria-hidden className="absolute inset-y-2.5 left-0 w-[3px] rounded-full bg-rojo" />}
                    {mini}
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-tinta">{fila.titulo}</span>
                      <span className="block truncate text-xs text-taupe">
                        {fila.quien}
                        {fila.cuando ? ` · ${fila.cuando}` : ""}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <span className="whitespace-nowrap text-sm tabular-nums text-tinta">{soles(fila.monto)}</span>
                      <Chip tono={fila.chip.tono}>{fila.chip.texto}</Chip>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
        {actual ? (
          detalle()
        ) : (
          <div className="card-cayla p-5">
            <Vacio icono={<CheckCheck aria-hidden />} titulo="Todo al día" tamano="chico">
              {cuantos.plata + cuantos.papel + cuantos.gasto + cuantos.cierre > 0 ? "Elige otra cifra de arriba." : "Cuando una compradora anote algo, aparece aquí."}
            </Vacio>
          </div>
        )}
      </div>
    </div>
  );
}
