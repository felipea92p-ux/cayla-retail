"use client";

import { ChevronRight, PlayCircle } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { GUIAS } from "@/lib/guias/registro";
import { guiaDeRuta, rutaCoincide } from "@/lib/guias/reglas";
import { esGrupoMenu, hojasDe, type FilaMenu } from "@/lib/menu";
import { abrirGuiaAqui } from "./MotorGuias";

// «Demo» de Mi perfil (ADR-0362, Felipe 2026-10-07): elegir qué módulo o submódulo volver a ver. Muestra SOLO lo que tu rol
// ve (las filas del lateral que ya resolvió `menuPara`), agrupado como en el menú. Lo que aún no tiene guía se ve, apagado,
// con «Pronto»: así se nota qué falta del despliegue sin prometer algo que no existe.

type Grupo = { id: string; titulo: string; hojas: { id: string; etiqueta: string; href: string; tieneGuia: boolean }[] };

function agrupar(filas: readonly FilaMenu[]): Grupo[] {
  const sueltas: Grupo = { id: "general", titulo: "General", hojas: [] };
  const grupos: Grupo[] = [];
  const hoja = (h: { id: string; etiqueta: string; href: string }) => ({ ...h, tieneGuia: !!guiaDeRuta(h.href, GUIAS) });
  for (const f of filas) {
    if (esGrupoMenu(f)) grupos.push({ id: f.id, titulo: f.etiqueta, hojas: hojasDe(f).map(hoja) });
    else sueltas.hojas.push(hoja(f));
  }
  return [...(sueltas.hojas.length ? [sueltas] : []), ...grupos].filter((g) => g.hojas.length > 0);
}

export function ElegirDemoModal({ filas, onClose }: { filas: readonly FilaMenu[]; onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const grupos = agrupar(filas);
  const conGuia = grupos.reduce((n, g) => n + g.hojas.filter((h) => h.tieneGuia).length, 0);

  return (
    <Modal
      titulo="Demo del sistema"
      subtitulo={`Elige qué quieres ver y te lo mostramos paso a paso, en la pantalla de verdad. No se guarda nada. ${conGuia === 1 ? "Hay 1 demo lista" : `Hay ${conGuia} demos listas`}; las demás vienen pronto.`}
      variante="hoja"
      ancho="max-w-lg"
      onClose={onClose}
    >
      {(cerrar) => (
        <div className="mt-2 space-y-5">
          {grupos.map((g) => (
            <section key={g.id} aria-labelledby={`demo-${g.id}`}>
              <h3 id={`demo-${g.id}`} className="label-cayla mb-2 text-[11px] text-taupe-profundo">
                {g.titulo}
              </h3>
              <ul className="overflow-hidden rounded-xl border border-sand bg-papel">
                {g.hojas.map((h, i) => (
                  <li key={h.id} className={i > 0 ? "border-t border-sand" : ""}>
                    {h.tieneGuia ? (
                      <button
                        type="button"
                        onClick={() => {
                          cerrar();
                          if (rutaCoincide(h.href, pathname)) setTimeout(abrirGuiaAqui, 260);
                          else router.push(`${h.href}?demo=1`);
                        }}
                        className="group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-sand/35"
                      >
                        <PlayCircle className="h-[18px] w-[18px] shrink-0 text-tinta/70" aria-hidden />
                        <span className="flex-1 text-sm text-tinta">{h.etiqueta}</span>
                        <ChevronRight className="h-4 w-4 text-tinta/40 transition-transform duration-200 ease-cayla group-hover:translate-x-0.5" aria-hidden />
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3" aria-disabled>
                        <PlayCircle className="h-[18px] w-[18px] shrink-0 text-tinta/25" aria-hidden />
                        <span className="flex-1 text-sm text-tinta/45">{h.etiqueta}</span>
                        <span className="text-[11px] text-tinta/45">Pronto</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}
