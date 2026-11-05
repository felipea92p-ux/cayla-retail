"use client";

import { Check, Landmark, Vault } from "lucide-react";
import { CampoSelect } from "@/components/ui/campos";
import { opcionesDeCuentas, type CuentaOpcion } from "@/lib/fondos-reglas";

// «¿De qué cuenta salió?» / «¿Dónde entra?» de Revisar compras (diseño «A · Bandeja serena», Felipe 2026-10-23): las cuentas se eligen de
// un toque, como fichas con su ícono (el banco o la caja fuerte), en vez de abrir una lista. Con más de cuatro, las fichas ya no se leen
// de un vistazo: vuelve el combo de siempre, con su buscador. Lo eligen la confirmación de la plata, la ronda cerrada y la entrega.
const MAX_FICHAS = 4;

export function FichasCuenta({
  etiqueta,
  cuentas,
  valor,
  onValor,
  deshabilitado = false,
  guia,
}: {
  etiqueta: string;
  cuentas: readonly CuentaOpcion[];
  valor: string;
  onValor: (id: string) => void;
  deshabilitado?: boolean;
  guia?: string;
}) {
  if (cuentas.length === 0 || cuentas.length > MAX_FICHAS) {
    return (
      <CampoSelect
        etiqueta={etiqueta}
        caja
        valor={valor}
        onValor={onValor}
        opciones={opcionesDeCuentas(cuentas)}
        marcador={cuentas.length === 0 ? "No hay un banco ni una caja fuerte activos" : "Elige el banco o la caja fuerte"}
        deshabilitado={deshabilitado || cuentas.length === 0}
      />
    );
  }
  return (
    <div role="group" aria-label={etiqueta} data-guia={guia} className={`grid gap-2 ${cuentas.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {cuentas.map((c) => {
        const elegida = c.id === valor;
        const Icono = c.tipo === "banco" ? Landmark : Vault;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={elegida}
            disabled={deshabilitado}
            onClick={() => onValor(c.id)}
            className={`card-cayla mov-boton relative flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-[14px] px-2 py-3 text-center ${
              elegida ? "border-tinta" : ""
            }`}
          >
            {elegida && (
              <span aria-hidden className="absolute right-2 top-2 grid h-[18px] w-[18px] place-items-center rounded-full bg-tinta text-crema">
                <Check className="h-3 w-3" />
              </span>
            )}
            <Icono className={`h-5 w-5 ${elegida ? "text-tinta" : "text-taupe"}`} aria-hidden />
            <span className="text-sm font-medium leading-tight text-tinta">{c.nombre}</span>
          </button>
        );
      })}
    </div>
  );
}
