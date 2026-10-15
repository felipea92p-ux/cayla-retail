"use client";

import { useState, type CSSProperties } from "react";
import { Check, House, ListChecks, Truck } from "lucide-react";
import { AnotarAvanceModal } from "@/components/orden-pagina/AnotarAvanceModal";
import { CambiarQuienModal } from "@/components/orden-pagina/CambiarQuienModal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import type { OpcionesNuevaOrden } from "@/lib/produccion";
import type { Tolerado } from "@/lib/resultado";
import {
  accionesDeFase,
  avisoMinimoDeFase,
  cuandoTerminoLaFase,
  faltaTerminar,
  puedeCambiarQuien,
  quienDeFase,
  textoDeFase,
  type OrdenPagina,
} from "@/lib/orden-pagina-reglas";

// La ruta de fases de la orden (ADR-0400, decisiones 1–3 y 7; vista D de la lámina): las fases en fila, cosidas por un hilo — hecha ✓ · actual encendida · pendiente —, cada una con
// quién la hace (el Taller o un servicio de afuera), cuántas van, lo que prometió y su acción: «Terminé N» en el Taller; «Salida» y «Vuelta» en un servicio. «Cambiar quién» aparece
// solo mientras la fase no empezó. Nada se calcula aquí: el estado de cada fase viene derivado de la base (`fn_fases_de_orden`) y los textos de `lib/orden-pagina-reglas.ts`.
// «Salida» y «Vuelta» ya tienen su función en la base (20261014155000) pero sus hojas son de la actividad 4: aquí quedan a la vista, apagadas, con su razón.

type Hoja = { tipo: "terminar" | "quien"; faseId: string };

export function RutaDeFases({ datos, opciones, hoy }: { datos: OrdenPagina; opciones: Tolerado<OpcionesNuevaOrden> | null; hoy: string }) {
  const [hoja, setHoja] = useState<Hoja | null>(null);
  const { fases, orden, lineaDeTiempo } = datos;
  const hechas = fases.filter((f) => f.estado === "hecha").length;
  // La guía interactiva (ADR-0389) ancla «Terminé» en la fase actual y «Cambiar quién» en la primera que lo permite: una sola pieza por ancla.
  const idDeLaQueCambia = fases.find((f) => puedeCambiarQuien(f, datos))?.id ?? null;
  const faseDeLaHoja = hoja ? (fases.find((f) => f.id === hoja.faseId) ?? null) : null;
  const dato = fases.every((f) => f.estado === "hecha")
    ? "las fases terminaron"
    : `${hechas} de ${fases.length} ${hechas === 1 ? "hecha" : "hechas"}${fases.some((f) => f.quien === "servicio" && f.afuera > 0) ? " · hay prendas afuera" : ""}`;

  // Una orden abierta antes de que existieran las fases (solo en una base que ya tenía órdenes) no trae ninguna: se dice, no se dibuja una ruta vacía.
  if (fases.length === 0) {
    return (
      <section aria-label="Fases de la orden" className="space-y-3">
        <TituloSeccion>Fases</TituloSeccion>
        <div className="card-cayla" data-guia="prod-orden.fases">
          <Vacio tamano="chico" icono={<ListChecks />}>
            Esta orden se abrió antes de que existieran las fases. Se sigue desde la lista de Órdenes.
          </Vacio>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Fases de la orden" className="space-y-3">
      <TituloSeccion dato={dato}>Fases</TituloSeccion>
      <ol className="op-ruta m-0 list-none p-0" data-n={fases.length} data-guia="prod-orden.fases">
        {fases.map((fase, i) => {
          const previa = i > 0 ? fases[i - 1] : null;
          const t = textoDeFase(fase, { previa, terminoEl: fase.estado === "hecha" ? cuandoTerminoLaFase(fase.clave, lineaDeTiempo) : null, totalPlan: orden.cantidadPlan });
          const acciones = accionesDeFase(fase, datos);
          const aviso = avisoMinimoDeFase(fase, orden.cantidadPlan);
          const cambiar = puedeCambiarQuien(fase, datos);
          const servicio = fase.quien === "servicio";
          const estadoTexto = fase.estado === "hecha" ? "hecha" : fase.actual ? "en curso" : "pendiente";
          return (
            <li
              key={fase.id}
              data-estado={fase.estado}
              data-actual={fase.actual ? "true" : "false"}
              data-guia={fase.actual ? "prod-orden.fase-actual" : undefined}
              aria-label={`${fase.nombre}, ${estadoTexto}`}
              className="op-fase anim-sube"
              style={{ "--i": i } as CSSProperties}
            >
              <div className="op-fase-cab">
                <span className="op-glifo" aria-hidden>
                  {fase.estado === "hecha" && <Check />}
                </span>
                <span className="op-fase-nombre">
                  {fase.nombre}
                  {fase.posicion && <span className="font-normal normal-case tracking-normal"> · sobre {fase.posicion}</span>}
                </span>
                <span className="op-fase-quien" title={quienDeFase(fase)}>
                  {servicio ? <Truck aria-hidden /> : <House aria-hidden />}
                  <span>{servicio ? `Afuera · ${quienDeFase(fase)}` : "En el Taller"}</span>
                </span>
              </div>
              <p className="op-fase-cifra">
                {t.cifra}
                <small>{t.de}</small>
              </p>
              <p className="op-fase-detalle">{t.detalle}</p>
              {servicio && fase.tarifaPrenda !== null && fase.estado !== "hecha" && (
                <p className="op-fase-detalle">
                  S/ {fase.tarifaPrenda.toFixed(2)} por prenda{fase.fijoOrden > 0 ? ` + S/ ${fase.fijoOrden.toFixed(2)} fijo` : ""}
                </p>
              )}
              {aviso && (
                <Aviso tono="atencion" chico className="op-fase-aviso">
                  {aviso}
                </Aviso>
              )}
              {(acciones.length > 0 || cambiar) && (
                <div className="op-fase-acciones">
                  {acciones.includes("terminar") && (
                    <Boton type="button" peso={fase.actual ? "primario" : "fantasma"} aria-haspopup="dialog" data-guia={fase.actual ? "prod-orden.terminar" : undefined} onClick={() => setHoja({ tipo: "terminar", faseId: fase.id })}>
                      Terminé {faltaTerminar(fase, fases)}
                    </Boton>
                  )}
                  {acciones.includes("salida") && (
                    <Boton type="button" peso="fantasma" disabled>
                      Salida
                    </Boton>
                  )}
                  {acciones.includes("vuelta") && (
                    <Boton type="button" peso="fantasma" disabled>
                      Vuelta
                    </Boton>
                  )}
                  {cambiar && (
                    <button type="button" aria-haspopup="dialog" data-guia={fase.id === idDeLaQueCambia ? "prod-orden.cambiar-quien" : undefined} onClick={() => setHoja({ tipo: "quien", faseId: fase.id })} className="btn-cayla btn-enlace text-[12.5px]">
                      Cambiar quién
                    </button>
                  )}
                  {(acciones.includes("salida") || acciones.includes("vuelta")) && <p className="w-full text-xs text-taupe-profundo">Salida y Vuelta llegan en el siguiente paso.</p>}
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {hoja?.tipo === "terminar" && faseDeLaHoja && <AnotarAvanceModal datos={datos} fase={faseDeLaHoja} onClose={() => setHoja(null)} />}
      {hoja?.tipo === "quien" && faseDeLaHoja && <CambiarQuienModal datos={datos} fase={faseDeLaHoja} opciones={opciones} hoy={hoy} onClose={() => setHoja(null)} />}
    </section>
  );
}
