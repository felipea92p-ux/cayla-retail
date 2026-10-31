"use client";

import { Boton } from "@/components/ui/campos";
import { LapizEditar } from "@/components/ui/BotonEditar";
import { Chip } from "@/components/ui/Chip";
import { Encabezado, Tabla, celda, fila, type Columna } from "@/components/ui/Tabla";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import type { FaseDelCatalogo } from "@/lib/orden-fases-reglas";

// «Procesos del Taller» (ADR-0570, actividad 5): el catálogo de pasos que puede llevar una orden, dentro de «Servicios y tarifas» (Felipe: «el líder los da de alta en Servicios y tarifas»).
// Cada proceso con su lugar en la ruta, quién lo hace de costumbre, en cuántas órdenes está y si se ofrece. La hoja la abre el panel (`ProcesoModal`).

const COLUMNAS: Columna[] = [{ titulo: "Proceso" }, { titulo: "De costumbre" }, { titulo: "En órdenes", alinear: "der" }, { titulo: "Estado" }, { titulo: "", alinear: "der" }];
const PLANTILLA = "grid-cols-[minmax(0,1fr)_auto] @min-[760px]:grid-cols-[minmax(0,1.6fr)_9rem_6rem_8rem_3rem]";
const BOTON_DE_LA_FILA = "col-start-2 row-start-1 @min-[760px]:col-start-auto @min-[760px]:row-start-auto";

export function ProcesosDelTaller({ procesos, onNuevo, onCambiar }: { procesos: ReadonlyArray<FaseDelCatalogo>; onNuevo: () => void; onCambiar: (p: FaseDelCatalogo) => void }) {
  const apagados = procesos.filter((p) => !p.activo).length;
  return (
    <section aria-label="Procesos del Taller" className="space-y-3" data-guia="prod-tarifas.procesos">
      <TituloSeccion
        cuenta={procesos.length}
        dato={apagados > 0 ? `${apagados} ${apagados === 1 ? "apagado" : "apagados"}` : undefined}
        accion={
          <Boton peso="fantasma" aria-haspopup="dialog" data-guia="prod-tarifas.nuevo-proceso" onClick={onNuevo}>
            + Nuevo proceso
          </Boton>
        }
      >
        Procesos del Taller
      </TituloSeccion>
      <p className="op-sub text-sm text-tinta/75">Los pasos que puede llevar una orden, en el orden de la ruta. Uno nuevo se ofrece en «Nueva orden» y en «+ Agregar un paso»; apagado, deja de ofrecerse.</p>
      <Tabla className="@container">
        <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} visible="hidden @min-[760px]:grid" />
        {procesos.map((p) => (
          <div key={p.clave} role="row" className={fila(PLANTILLA, "text-sm")}>
            <span className={celda("izq", p.activo ? "text-tinta" : "text-tinta/70")} title={p.ayuda || undefined}>
              {p.nombre}
              {p.ayuda && <span className="block truncate text-sm text-tinta/70">{p.ayuda}</span>}
            </span>
            <div className="col-span-full flex flex-wrap gap-x-5 gap-y-0.5 @min-[760px]:contents">
              <span className={celda("izq", "text-tinta/75")}>{p.quienSugerido === "servicio" ? "Afuera" : "En el Taller"}</span>
              <span className={celda("der", "text-tinta/75")}>{p.usos ?? "—"}</span>
              <span className={celda("izq")}>
                {p.siempre ? <Chip tono="pizarra">Va siempre</Chip> : p.activo ? <Chip tono="verde">Se ofrece</Chip> : <Chip tono="apagado">Apagado</Chip>}
              </span>
            </div>
            <span className={celda("der", BOTON_DE_LA_FILA)}>
              <LapizEditar que={p.nombre} onClick={() => onCambiar(p)} />
            </span>
          </div>
        ))}
      </Tabla>
    </section>
  );
}
