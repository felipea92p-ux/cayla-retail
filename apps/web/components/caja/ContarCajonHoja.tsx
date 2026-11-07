"use client";

import { useState } from "react";
import { useCantidadEscrita } from "@/components/alta-producto/useCantidadEscrita";
import { Aviso } from "@/components/ui/Aviso";
import { CLASE_MONTO_ILEGIBLE } from "@/components/ui/CampoMonto";
import { Modal } from "@/components/ui/Modal";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { Boton } from "@/components/ui/campos";
import { DENOMINACIONES, MAX_POR_DENOMINACION, llaveDenominacion, sumaConteo, type ConteoCajon } from "@/lib/caja-apertura-reglas";
import { REGLA_BILLETES } from "@/lib/caja-cierre-reglas";

const money = (n: number) => "S/ " + n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const etiqueta = (valor: number) => (valor >= 1 ? `S/ ${valor}` : `S/ ${valor.toFixed(2)}`);

/**
 * Contar el cajón por billetes y monedas (Felipe 2026-11-03): una AYUDA opcional, escondida tras un enlace. Solo suma y le devuelve el
 * total a «Abrir caja»; el desglose no se guarda. El monto siempre se escribe en el campo de la pantalla.
 */
export function ContarCajonHoja({ inicial, onUsar, onClose }: { inicial: ConteoCajon; onUsar: (total: number, conteo: ConteoCajon) => void; onClose: () => void }) {
  const [conteo, setConteo] = useState<ConteoCajon>(inicial);
  // Lo que se teclea en cada caja: a la suma solo le llega una cantidad de verdad («2,5» no es 25, ni «-5» es 5).
  const escrita = useCantidadEscrita(REGLA_BILLETES);
  const total = sumaConteo(conteo);
  const poner = (valor: number, n: number) => setConteo((c) => ({ ...c, [llaveDenominacion(valor)]: Math.max(0, Math.min(MAX_POR_DENOMINACION, n)) }));

  const grupo = (tipo: "billete" | "moneda") => (
    <div>
      <TituloGrupo>{tipo === "billete" ? "Billetes" : "Monedas"}</TituloGrupo>
      <ul className="mt-2 space-y-2">
        {DENOMINACIONES.filter((d) => d.tipo === tipo).map((d) => {
          const clave = llaveDenominacion(d.valor);
          const n = conteo[clave] ?? 0;
          return (
            <li key={d.valor} className="grid grid-cols-[4.5rem_minmax(0,1fr)_5.5rem] items-center gap-2.5">
              <span className="text-sm font-semibold tabular-nums text-tinta">{etiqueta(d.valor)}</span>
              <PasoCantidad
                className="w-full"
                tono={escrita.invalida(clave) ? "error" : undefined}
                menos={{
                  onClick: () => {
                    escrita.olvidar();
                    poner(d.valor, n - 1);
                  },
                  etiqueta: `Uno menos de ${etiqueta(d.valor)}`,
                  deshabilitado: n === 0,
                }}
                mas={{
                  onClick: () => {
                    escrita.olvidar();
                    poner(d.valor, n + 1);
                  },
                  etiqueta: `Uno más de ${etiqueta(d.valor)}`,
                }}
                campo={{
                  ...escrita.campo(clave, n ? String(n) : "", (v) => poner(d.valor, Number(v) || 0), MAX_POR_DENOMINACION),
                  placeholder: "0",
                  className: `min-w-0 flex-1 text-center ${CLASE_MONTO_ILEGIBLE}`,
                  "aria-label": `Cuántos de ${etiqueta(d.valor)}`,
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
      {escrita.problema && (
        <Aviso tono="error" chico className="mt-4">
          {escrita.problema}
        </Aviso>
      )}
      <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-tinta/[0.06] px-4 py-3">
        <div>
          <p className="label-cayla text-[11px] text-taupe-profundo">Total contado</p>
          <p className="font-display text-3xl leading-none tabular-nums text-tinta">{money(total)}</p>
        </div>
        <Boton
          peso="primario"
          type="button"
          disabled={total <= 0}
          onClick={() => {
            // Lo tecleado en una caja no valió: antes de usar este total, se lee por qué.
            if (escrita.frenar()) return;
            onUsar(total, conteo);
          }}
        >
          Usar este total
        </Boton>
      </div>
    </Modal>
  );
}
