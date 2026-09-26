"use client";

import { useEffect, useRef, useState } from "react";
import { Search, UserRound, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Modal } from "@/components/ui/Modal";
import { lineaDeClienta, terminoBuscable, type ClientaDelTicket } from "@/lib/clienta-ticket-reglas";

const ESPERA_MS = 300;

/**
 * La fila «Clienta» arriba del ticket (spike 2026-09-26, hallazgo 4; referentes: Shopify POS, Square y Odoo ponen al
 * cliente arriba del carrito). Opcional: vender sin clienta sigue siendo un toque. Elegida, el padre llena el DNI y el
 * nombre del comprobante (`onElegir`), y la proforma o el apartado ya saben a nombre de quién van.
 */
export function ClientaDelTicket({
  clienta,
  onElegir,
  onQuitar,
  bloqueado,
}: {
  clienta: ClientaDelTicket | null;
  onElegir: (c: ClientaDelTicket) => void;
  onQuitar: () => void;
  bloqueado: boolean;
}) {
  const [abierto, setAbierto] = useState(false);

  return (
    <div className="px-5 pt-3">
      {clienta ? (
        <div className="flex items-center gap-3 rounded-xl border border-sand bg-crema px-3 py-2">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-sand font-display text-sm text-tinta" aria-hidden>
            {iniciales(lineaDeClienta(clienta).titulo)}
          </span>
          <button type="button" onClick={() => setAbierto(true)} disabled={bloqueado} className="min-w-0 flex-1 text-left">
            <span className="block truncate text-[13.5px] font-semibold text-tinta">{lineaDeClienta(clienta).titulo}</span>
            {lineaDeClienta(clienta).detalle && <span className="block truncate text-[11.5px] text-tinta/60">{lineaDeClienta(clienta).detalle}</span>}
          </button>
          <button
            type="button"
            onClick={onQuitar}
            disabled={bloqueado}
            aria-label="Quitar la clienta de esta venta"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-tinta/55 transition-colors hover:bg-sand/50 hover:text-tinta"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          disabled={bloqueado}
          className="flex w-full items-center gap-2 rounded-xl border border-dashed border-tinta/25 px-3 py-2.5 text-left text-[13px] text-tinta/65 transition-colors hover:border-taupe hover:text-tinta"
        >
          <UserRound className="h-4 w-4 shrink-0" aria-hidden />
          Agregar clienta
          <span className="ml-auto text-[11.5px] text-tinta/50">DNI, celular o nombre · opcional</span>
        </button>
      )}

      {abierto && (
        <BuscarClientaModal
          onElegir={(c) => {
            onElegir(c);
            setAbierto(false);
          }}
          onClose={() => setAbierto(false)}
        />
      )}
    </div>
  );
}

function iniciales(texto: string) {
  return texto
    .split(/\s+/)
    .filter((p) => /^[\p{L}]/u.test(p))
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

type Estado = { tipo: "inicio" } | { tipo: "buscando" } | { tipo: "listo"; clientas: ClientaDelTicket[] } | { tipo: "error" };

function BuscarClientaModal({ onElegir, onClose }: { onElegir: (c: ClientaDelTicket) => void; onClose: () => void }) {
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "inicio" });
  const campo = useRef<HTMLInputElement>(null);
  const termino = terminoBuscable(texto);

  useEffect(() => {
    if (!termino) return;
    let vigente = true;
    // Se espera a que deje de escribir: una consulta por pausa, no por tecla. `buscar_` es lectura (sin loader global).
    const t = setTimeout(async () => {
      setEstado({ tipo: "buscando" });
      const { data, error } = await createClient().rpc("buscar_clienta", { p_termino: termino });
      if (!vigente) return;
      if (error) return setEstado({ tipo: "error" });
      setEstado({
        tipo: "listo",
        clientas: (data ?? []).map((c) => ({ id: c.id, nombre: c.nombre, dni: c.dni, celular: c.telefono_whatsapp })),
      });
    }, ESPERA_MS);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [termino]);

  const visible: Estado = termino ? estado : { tipo: "inicio" };

  return (
    <Modal titulo="Clienta de esta venta" subtitulo="Opcional. Sus datos pasan solos al comprobante." variante="hoja" ancho="max-w-md" onClose={onClose}>
      <div>
        <label className="flex h-11 items-center gap-2 rounded-lg border border-sand bg-crema px-3 focus-within:border-rojo focus-within:ring-2 focus-within:ring-rojo/20">
          <Search className="h-4 w-4 shrink-0 text-tinta/50" aria-hidden />
          <input
            ref={campo}
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="DNI, celular o nombre"
            inputMode="search"
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-sm text-tinta outline-none placeholder:text-tinta/40"
          />
        </label>

        <div className="mt-3 min-h-24" aria-live="polite">
          {visible.tipo === "inicio" && <p className="py-4 text-center text-xs text-tinta/55">Escribe al menos 3 caracteres.</p>}
          {visible.tipo === "buscando" && <p className="py-4 text-center text-xs text-tinta/55">Buscando…</p>}
          {visible.tipo === "error" && (
            <p className="py-4 text-center text-xs text-rojo-profundo">No se pudo buscar en la libreta. La venta sigue: el DNI se puede poner al cobrar.</p>
          )}
          {visible.tipo === "listo" && visible.clientas.length === 0 && (
            <p className="rounded-lg bg-hueso px-3 py-3 text-xs text-tinta/75">
              No está en la libreta de clientas. Puedes seguir sin ella: el DNI y el nombre se ponen al cobrar, en el comprobante.
            </p>
          )}
          {visible.tipo === "listo" && visible.clientas.length > 0 && (
            <ul className="divide-y divide-sand overflow-hidden rounded-lg border border-sand bg-crema">
              {visible.clientas.map((c) => {
                const l = lineaDeClienta(c);
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => onElegir(c)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-sand/40">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-tinta">{l.titulo}</span>
                        {l.detalle && <span className="block truncate text-[11.5px] text-tinta/60">{l.detalle}</span>}
                      </span>
                      <span className="label-cayla text-[10.5px] text-tinta/70">Elegir</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
