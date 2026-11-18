"use client";

// Finanzas ▸ Cuentas y dinero ▸ Cuadrar con el banco: «Lo que te deben las máquinas» (ADR-0629, Fase B). La puente de una máquina no tiene
// extracto, así que ya no está en la lista de bancos: aquí se ve, por máquina, lo que cobró y todavía no llegó, y qué días ya se pasaron de
// lo que tarda en depositar. Lo que llegó se cuadra en el banco que lo recibe. Solo lee: el botón abre el depósito de siempre.

import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { useAbrirMovimiento } from "@/components/finanzas/CuentasDinero";
import { soles } from "@/lib/compras-reglas";
import type { DeudaDeMaquina } from "@/lib/cuadrar-reglas";

export function DeudaDeMaquinas({ maquinas }: { maquinas: readonly DeudaDeMaquina[] }) {
  const abrirMovimiento = useAbrirMovimiento();
  if (maquinas.length === 0) return null;
  const total = maquinas.reduce((s, m) => s + m.total, 0);
  return (
    <section className="card-cayla din-maq anim-sube" data-guia="fin-conciliacion.maquinas" aria-label="Lo que te deben las máquinas">
      <header className="din-cuad-lista-cab">
        <TituloSeccion dato={soles(total)}>Lo que te deben las máquinas</TituloSeccion>
        <p className="din-cuad-tenue">Lo que cobraron con tarjeta o QR y todavía no llegó. Lo que llega se cuadra en el banco que lo recibe.</p>
      </header>
      <ul className="din-maq-lista">
        {maquinas.map((m) => (
          <li key={m.cuentaId} className="din-maq-it">
            <div className="din-maq-cab">
              <b className="truncate text-sm font-semibold text-tinta">{m.nombre}</b>
              <span className="din-cuad-it-der">
                <b className="din-cuad-num">{soles(m.total)}</b>
                <Chip tono={m.estado.tono} versalitas={false}>
                  {m.estado.texto}
                </Chip>
              </span>
            </div>
            {m.atrasados.length > 0 && (
              <ul className="din-maq-dias" aria-label={`Días atrasados de ${m.nombre}`}>
                {m.atrasados.map((d) => (
                  <li key={d.clave}>
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-tinta">{d.titulo}</span>
                      {d.nota && <small className="din-cuad-tenue block">{d.nota}</small>}
                    </span>
                    <b className="din-cuad-num">{soles(d.monto)}</b>
                  </li>
                ))}
              </ul>
            )}
            {m.enCamino && <p className="din-cuad-tenue">{m.enCamino}</p>}
            {m.atrasados.length > 0 && (
              <span>
                <button type="button" className="btn-cayla btn-secundario btn-chico" aria-haspopup="dialog" onClick={() => abrirMovimiento("abono_tarjeta", m.cuentaId)}>
                  Registrar el depósito
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
