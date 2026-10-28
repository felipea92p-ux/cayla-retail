"use client";

import { useMemo, useState } from "react";
import { ChevronDown, PackageCheck } from "lucide-react";
import { Buscador } from "@/components/ui/Buscador";
import { Chip } from "@/components/ui/Chip";
import { Pestanas } from "@/components/ui/Pestanas";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import {
  FILTROS_ENVIOS,
  coincideEnvio,
  diasDeLaRonda,
  enviosDeLaRonda,
  resumenDeEnvios,
  rondasConEnvios,
  type EnvioMio,
  type FiltroEnvios,
} from "@/lib/mis-envios-reglas";
import { desdeRonda, type PorMandar } from "@/lib/mi-plata-reglas";
import { FilaEnvio } from "./FilaEnvio";
import { TablaEnvios, type GrupoDeEnvios } from "./TablaEnvios";
import { MandarATienda } from "./MandarATienda";

// Mis compras ▸ Mis envíos (ADR-0480, maqueta docs/maquetas/mis-compras-envios-2026-10/, Felipe 2026-10-26): los envíos que mandó la
// compradora, con su código. Dos vistas: «Esta ronda» (los de la ronda abierta, y la franja de lo que falta mandar) y «Rondas anteriores»
// (una tarjeta por ronda cerrada, plegada, con cómo quedó). Buscar un código, una tienda o una ronda mira TODAS las rondas: así se
// encuentra un código viejo sin saber en cuál salió. Los filtros (todos · sin recibir · recibidos) valen en las dos vistas. Solo se lee.

type Alcance = "esta" | "anteriores";

export function MisEnvios({
  envios,
  rondaAbierta,
  porMandar,
  hoy,
}: {
  envios: EnvioMio[];
  rondaAbierta: { id: string; texto: string; abiertaEn: string } | null;
  porMandar: PorMandar[];
  hoy: string;
}) {
  const deEsta = useMemo(() => enviosDeLaRonda(envios, rondaAbierta?.id ?? null), [envios, rondaAbierta]);
  const rondas = useMemo(() => rondasConEnvios(envios, rondaAbierta?.id ?? null), [envios, rondaAbierta]);
  const [alcance, setAlcance] = useState<Alcance>(rondaAbierta ? "esta" : "anteriores");
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<FiltroEnvios>("todos");
  // La ronda anterior más reciente viene abierta; las demás, plegadas.
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>(() => (rondas[0] ? { [rondas[0].rondaId ?? "sin-ronda"]: true } : {}));
  const buscando = q.trim() !== "";
  const anteriores = envios.length - deEsta.length;

  const encontrados = useMemo(() => (buscando ? envios.filter((e) => coincideEnvio(e, filtro, q)) : []), [buscando, envios, filtro, q]);
  const deEstaVisibles = deEsta.filter((e) => coincideEnvio(e, filtro, ""));
  // En PC, las rondas anteriores son una sola tabla con una franja por ronda (lo que no pasa el filtro no entra).
  const gruposAnteriores: GrupoDeEnvios[] = rondas
    .map((r) => {
      const resumen = resumenDeEnvios(r.envios, hoy);
      const dias = diasDeLaRonda(r.abiertaEn, r.cerradaEn);
      return {
        clave: r.rondaId ?? "sin-ronda",
        titulo: r.rondaId ? `Ronda ${r.texto}` : r.texto,
        detalle: [dias, r.rondaId ? "cerrada" : null, resumen.texto].filter(Boolean).join(" · "),
        chip: resumen.chip,
        envios: r.envios.filter((e) => coincideEnvio(e, filtro, "")),
      };
    })
    .filter((g) => g.envios.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <Pestanas
          guia="mis-envios.alcance"
          idIndicador="mis-envios"
          etiquetaAccesible="Qué envíos ver"
          activa={alcance}
          onCambio={(c) => setAlcance(c as Alcance)}
          items={[
            { clave: "esta", etiqueta: "Esta ronda", conteo: deEsta.length, guia: "mis-envios.tab-esta" },
            { clave: "anteriores", etiqueta: "Rondas anteriores", conteo: anteriores, guia: "mis-envios.tab-anteriores" },
          ]}
        />
        <Buscador
          guia="mis-envios.buscador"
          valor={q}
          onCambio={setQ}
          atajo
          placeholder="Busca un código, una tienda o una ronda"
          etiqueta="Buscar un envío"
          className="xl:w-[26rem]"
        />
      </div>
      <div role="group" aria-label="Filtrar por cómo van" className="flex flex-wrap gap-2" data-guia="mis-envios.filtros">
        {FILTROS_ENVIOS.map((f) => (
          <button key={f.clave} type="button" aria-pressed={filtro === f.clave} onClick={() => setFiltro(f.clave)} className="pildora-cayla">
            {f.nombre}
          </button>
        ))}
      </div>

      {buscando ? (
        <section className="flex flex-col gap-1">
          <TituloSeccion cuenta={encontrados.length} dato="de todas las rondas">
            Resultados
          </TituloSeccion>
          {encontrados.length > 0 ? (
            <>
              <ul className="divide-y divide-sand lg:hidden">
                {encontrados.map((e) => (
                  <FilaEnvio key={e.id} e={e} hoy={hoy} conRonda />
                ))}
              </ul>
              <TablaEnvios grupos={[{ clave: "resultados", envios: encontrados }]} hoy={hoy} conRonda />
            </>
          ) : (
            <Vacio icono={<PackageCheck aria-hidden />} titulo="No hay un envío así" tamano="chico">
              Revisa el código o quita el filtro.
            </Vacio>
          )}
        </section>
      ) : alcance === "esta" ? (
        <section className="flex flex-col gap-3" data-guia="mis-envios.esta">
          {/* La pestaña ya dice «Esta ronda»: el título dice cuál es y desde cuándo. */}
          <TituloSeccion dato={rondaAbierta ? ["abierta", desdeRonda(rondaAbierta.abiertaEn, hoy)].filter(Boolean).join(" · ") : undefined}>
            {rondaAbierta ? `Ronda ${rondaAbierta.texto}` : "Sin ronda abierta"}
          </TituloSeccion>
          {!rondaAbierta ? (
            <Vacio icono={<PackageCheck aria-hidden />} titulo="No tienes una ronda abierta" tamano="chico">
              Tus envíos anteriores están en «Rondas anteriores».
            </Vacio>
          ) : deEstaVisibles.length > 0 ? (
            <>
              <ul className="divide-y divide-sand lg:hidden">
                {deEstaVisibles.map((e) => (
                  <FilaEnvio key={e.id} e={e} hoy={hoy} />
                ))}
              </ul>
              <TablaEnvios grupos={[{ clave: "esta", envios: deEstaVisibles }]} hoy={hoy} />
            </>
          ) : (
            <Vacio icono={<PackageCheck aria-hidden />} titulo="Nada por aquí" tamano="chico">
              {filtro === "todos" ? "Todavía no mandaste nada en esta ronda." : "Nada con ese filtro."}
            </Vacio>
          )}
          {/* Lo que falta mandar sigue a la mano: al salir, aparece aquí con su código. */}
          <MandarATienda porMandar={porMandar} />
        </section>
      ) : (
        <section className="flex flex-col gap-3" data-guia="mis-envios.anteriores">
          {rondas.length === 0 ? (
            <div>
              <Vacio icono={<PackageCheck aria-hidden />} titulo="Todavía no hay rondas anteriores" tamano="chico">
                Cuando cierres una ronda, sus envíos quedan aquí con su código.
              </Vacio>
            </div>
          ) : (
            <>
            {/* Un filtro que no deja ningún envío: ni tabla con solo su encabezado (PC) ni rondas vacías (celular); lo dice el vacío. */}
            {gruposAnteriores.length === 0 ? (
              <Vacio icono={<PackageCheck aria-hidden />} titulo="Nada por aquí" tamano="chico">
                Nada con ese filtro.
              </Vacio>
            ) : (
              <TablaEnvios grupos={gruposAnteriores} hoy={hoy} />
            )}
            {gruposAnteriores.length > 0 && (
            <div className="grid items-start gap-3 lg:hidden">
            {rondas.map((r) => {
              const clave = r.rondaId ?? "sin-ronda";
              const lista = r.envios.filter((e) => coincideEnvio(e, filtro, ""));
              if (lista.length === 0 && filtro !== "todos") return null;
              const resumen = resumenDeEnvios(r.envios, hoy);
              const abierta = abiertas[clave] === true;
              const dias = diasDeLaRonda(r.abiertaEn, r.cerradaEn);
              return (
                <div key={clave} className="card-cayla overflow-hidden">
                  <button
                    type="button"
                    aria-expanded={abierta}
                    aria-controls={`envios-${clave}`}
                    onClick={() => setAbiertas((a) => ({ ...a, [clave]: !abierta }))}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3.5 py-3 text-left"
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-tinta">{r.rondaId ? `Ronda ${r.texto}` : r.texto}</span>
                      <span className="block text-xs text-taupe">{[dias, r.rondaId ? "cerrada" : null].filter(Boolean).join(" · ")}</span>
                      <span className="block text-xs text-taupe">{resumen.texto}</span>
                    </span>
                    <span className="flex flex-col items-end gap-1.5">
                      {resumen.chip && <Chip tono={resumen.chip.tono}>{resumen.chip.texto}</Chip>}
                      <ChevronDown aria-hidden className={`h-3.5 w-3.5 text-taupe transition-transform duration-200 ${abierta ? "rotate-180" : ""}`} />
                    </span>
                  </button>
                  {abierta && (
                    <ul id={`envios-${clave}`} className="divide-y divide-sand border-t border-sand px-3.5">
                      {lista.length > 0 ? lista.map((e) => <FilaEnvio key={e.id} e={e} hoy={hoy} />) : (
                        <li>
                          <Vacio icono={<PackageCheck aria-hidden />} titulo="Nada por aquí" tamano="chico" alinear="izquierda">
                            Nada con ese filtro.
                          </Vacio>
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
            </div>
            )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
