"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { Boton } from "@/components/ui/campos";
import { DENOMINACIONES, MAX_POR_DENOMINACION, llaveDenominacion, sumaConteo, type ConteoCajon } from "@/lib/caja-apertura-reglas";

const money = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const etiqueta = (valor: number) => (valor >= 1 ? `S/ ${valor}` : `S/ ${valor.toFixed(2)}`);

/**
 * Contar el cajón por billetes y monedas (Felipe 2026-11-03): una AYUDA opcional, escondida tras un enlace. Solo suma y le devuelve el
 * total a «Abrir caja»; el desglose no se guarda. El monto siempre se escribe en el campo de la pantalla.
 */
export function ContarCajonHoja({ inicial, onUsar, onClose }: { inicial: ConteoCajon; onUsar: (total: number, conteo: ConteoCajon) => void; onClose: () => void }) {
  const [conteo, setConteo] = useState<ConteoCajon>(inicial);
  const total = sumaConteo(conteo);
  const poner = (valor: number, n: number) => setConteo((c) => ({ ...c, [llaveDenominacion(valor)]: Math.max(0, Math.min(MAX_POR_DENOMINACION, n)) }));

  const grupo = (tipo: "billete" | "moneda") => (
    <div>
      <TituloGrupo>{tipo === "billete" ? "Billetes" : "Monedas"}</TituloGrupo>
      <ul className="mt-2 space-y-2">
        {DENOMINACIONES.filter((d) => d.tipo === tipo).map((d) => {
          const n = conteo[llaveDenominacion(d.valor)] ?? 0;
          return (
            <li key={d.valor} className="grid grid-cols-[4.5rem_minmax(0,1fr)_5.5rem] items-center gap-2.5">
              <span className="text-sm font-semibold tabular-nums text-tinta">{etiqueta(d.valor)}</span>
              <PasoCantidad
                className="w-full"
                menos={{ onClick: () => poner(d.valor, n - 1), etiqueta: `Uno menos de ${etiqueta(d.valor)}`, deshabilitado: n === 0 }}
                mas={{ onClick: () => poner(d.valor, n + 1), etiqueta: `Uno más de ${etiqueta(d.valor)}` }}
                campo={{
                  value: n || "",
                  placeholder: "0",
                  className: "min-w-0 flex-1 text-center",
                  inputMode: "numeric",
                  autoComplete: "off",
                  "aria-label": `Cuántos de ${etiqueta(d.valor)}`,
                  onChange: (e) => poner(d.valor, parseInt(e.target.value.replace(/\D/g, ""), 10) || 0),
                }}
              />
              <span className={`text-right text-sm tabular-nums ${n ? "font-semibold text-tinta" : "text-tinta/45"}`}>{n ? money(Math.round(d.valor * 100) * n / 100) : ""}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );

  return (
    <Modal titulo="Contar billetes y monedas" subtitulo="Suma el total por ti." onClose={onClose} tamano="ancha" conCerrar>
      <div className="grid gap-6 sm:grid-cols-2">
        {grupo("billete")}
        {grupo("moneda")}
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-tinta/[0.06] px-4 py-3">
        <div>
          <p className="label-cayla text-[11px] text-taupe-profundo">Total contado</p>
          <p className="font-display text-3xl leading-none tabular-nums text-tinta">{money(total)}</p>
        </div>
        <Boton peso="primario" type="button" disabled={total <= 0} onClick={() => onUsar(total, conteo)}>
          Usar este total
        </Boton>
      </div>
    </Modal>
  );
}
