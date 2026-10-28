"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Check, Inbox } from "lucide-react";
import { Cajon } from "@/components/ui/Cajon";
import { Globito } from "@/components/ui/Globito";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { Vacio } from "@/components/ui/Vacio";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import { rutaActiva } from "@/lib/menu";
import { sedeDeLaUrl, SEDE_TODAS } from "@/lib/finanzas-telar-reglas";
import { agruparPendientes, type PendienteTelar } from "@/lib/finanzas-te-toca-reglas";

/**
 * «Te toca» de la mesa de mando (El telar): un botón con cuántas cosas te tocan en Finanzas para la sede elegida, y el cajón que las
 * junta por submódulo —primero las del submódulo donde estás— con el botón que lleva a resolver cada una. Pregunta a
 * `/api/finanzas/te-toca` al abrir la pantalla y al cambiar de sede, sin loader; si no responde, el botón queda sin número.
 */
export function TeToca({ submodulos }: { submodulos: { clave: string; etiqueta: string; ruta: string }[] }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const sede = sedeDeLaUrl({ sede: sp.get("sede"), ver: sp.get("ver") });
  const [lista, setLista] = useState<PendienteTelar[] | null>(null);
  const [incompleto, setIncompleto] = useState(false);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    let vivo = true;
    const q = sede === SEDE_TODAS ? "" : `?sede=${encodeURIComponent(sede)}`;
    fetch(`/api/finanzas/te-toca${q}`, { headers: { "x-espera": "no" }, cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { pendientes: PendienteTelar[]; incompleto: boolean } | null) => {
        if (!vivo) return;
        setLista(d?.pendientes ?? null);
        setIncompleto(!d || d.incompleto);
      })
      .catch(() => vivo && setLista(null));
    return () => {
      vivo = false;
    };
  }, [sede, pathname]);

  const actual = submodulos.find((s) => rutaActiva(pathname, s.ruta))?.clave ?? "";
  const grupos = agruparPendientes(lista ?? [], submodulos, actual);
  const n = lista?.length ?? 0;

  return (
    <>
      <button type="button" className="te-toca-telar" onClick={() => setAbierto(true)} aria-haspopup="dialog" data-guia="telar.te-toca">
        <Inbox aria-hidden className="h-4 w-4" />
        <span className="te-toca-telar-texto">Te toca</span>
        {lista !== null && <Globito n={n} pide etiqueta={n === 1 ? "cosa por hacer" : "cosas por hacer"} />}
      </button>
      {abierto && (
        <Cajon onCerrar={() => setAbierto(false)} titulo="Te toca" sobre="Finanzas" frase="Lo que conviene hacer hoy en Finanzas, para la sede que elegiste arriba.">
          {(cerrar) =>
            grupos.length ? (
              <div className="space-y-6">
                {grupos.map((g) => (
                  <section key={g.submodulo} className="space-y-2">
                    <TituloGrupo cuenta={g.pendientes.length}>{g.etiqueta}</TituloGrupo>
                    <ul className="space-y-2">
                      {g.pendientes.map((p) => (
                        <li key={p.id} className="te-toca-item" data-estado={p.estado}>
                          <div className="min-w-0">
                            <p className="text-[14px] font-medium text-tinta">{p.titulo}</p>
                            <p className="text-[13px] text-tinta/70">{p.detalle}</p>
                          </div>
                          <BotonVer href={p.href} alNavegar={cerrar} chico>
                            {p.verbo}
                          </BotonVer>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                {incompleto && <p className="nota-cayla text-[13px]">Una parte de Finanzas no respondió: puede que falte algo en la lista.</p>}
              </div>
            ) : (
              <Vacio
                icono={<Check />}
                titulo={lista === null ? "No pudimos revisar tus pendientes" : "Todo al día"}
              >
                {lista === null ? "Vuelve a abrir en un rato." : "Nada te toca en Finanzas para esta sede."}
              </Vacio>
            )
          }
        </Cajon>
      )}
    </>
  );
}
