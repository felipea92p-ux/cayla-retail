"use client";

import { useState } from "react";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import type { CausaRoja } from "@/lib/orden-pagina-reglas";

// «Esta orden pide atención» con su «¿Por qué?» a un toque (ADR-0400, «Pantallas» punto 1; ley 6 de Formidable: lo difícil a un toque, nunca solo con el mouse). Las causas las calcula
// `rojoDeLaOrden` (entrega pasada, tela que no alcanza, días sin que nadie anote nada) con un dato cada una; aquí solo se muestran. Sin causas no dibuja nada: una orden al día no
// lleva insignia.

export function PideAtencion({ causas }: { causas: CausaRoja[] }) {
  const [abierto, setAbierto] = useState(false);
  if (causas.length === 0) return null;
  const [primera, ...otras] = causas;
  return (
    <div data-guia="prod-orden.atencion" className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Chip tono="rojo" versalitas={false} vivo>
          Pide atención · {primera.titulo.toLocaleLowerCase("es")}
          {otras.length > 0 && ` y ${otras.length} más`}
        </Chip>
        <button type="button" onClick={() => setAbierto((a) => !a)} aria-expanded={abierto} className="btn-cayla btn-enlace text-[12.5px]">
          {abierto ? "Ocultar" : "¿Por qué?"}
        </button>
      </div>
      {abierto && (
        <Aviso tono="atencion" chico>
          <ul className="space-y-1">
            {causas.map((c) => (
              <li key={c.clave}>
                <b className="font-medium">{c.titulo}.</b> {c.porque}
              </li>
            ))}
          </ul>
        </Aviso>
      )}
    </div>
  );
}
