"use client";

import { CircleDollarSign, Scissors } from "lucide-react";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { CifraQueCuenta } from "@/components/ui/CifraQueCuenta";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { Encabezado, Tabla, celda, fila, type Columna } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { Vacio } from "@/components/ui/Vacio";
import { nombreDeFase, serviciosParaTarifar, tarifasPorServicio, textoFijo, textoMinimo, textoTarifa, textoVigencia, type TarifaDeServicio } from "@/lib/tarifas-servicios-reglas";
import type { ProveedorProduccion } from "@/lib/proveedores-produccion-reglas";

// «Servicios y tarifas» (ADR-0400, actividad 8c): la lista de precios de los servicios de afuera, por fase. Lo que se carga aquí es lo que «Nueva orden» y «Cambiar quién» SUGIEREN al elegir un servicio
// para una fase; cada orden se queda con la tarifa que tenía al abrirse. Solo líder (la pantalla de Proveedores ya lo es). Es una vista de la misma pantalla: la hoja de la tarifa la abre el panel.

const COLUMNAS: Columna[] = [
  { titulo: "Servicio" },
  { titulo: "Fase" },
  { titulo: "Cobra", alinear: "der" },
  { titulo: "Desde" },
  { titulo: "Fijo" },
  { titulo: "Rige" },
  { titulo: "", alinear: "der" },
];
const PLANTILLA = "sm:grid-cols-[minmax(0,1.6fr)_5rem_8.5rem_8rem_8.5rem_8rem_6.5rem]";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function ServiciosYTarifas({
  tarifas,
  proveedores,
  hoy,
  onNueva,
  onCambiar,
  onAgregarServicio,
}: {
  /** `null`: la base no la pudo leer (distinto de «no hay tarifas»). */
  tarifas: TarifaDeServicio[] | null;
  proveedores: ProveedorProduccion[];
  hoy: string;
  /** Abre la hoja para cargar una tarifa; con un servicio, ya viene elegido. */
  onNueva: (proveedorId?: string) => void;
  onCambiar: (t: TarifaDeServicio) => void;
  onAgregarServicio: () => void;
}) {
  if (tarifas === null) {
    return (
      <Aviso tono="atencion" titulo="No pudimos leer la lista de precios" guia="prod-tarifas.lista">
        Recarga la pantalla. Los proveedores siguen disponibles en la otra pestaña.
      </Aviso>
    );
  }

  const servicios = serviciosParaTarifar(proveedores);
  const filas = tarifasPorServicio(tarifas, servicios);
  const conTarifa = filas.filter((f) => f.tarifas.length > 0 && f.activo).length;
  const sinTarifa = filas.filter((f) => f.tarifas.length === 0).length;

  return (
    <div className="space-y-6">
      <div data-guia="prod-tarifas.cifras" className="grid gap-3 sm:grid-cols-3">
        <TarjetaCifra punto="verde" etiqueta="Servicios con tarifa" className="anim-entra" style={{ ["--i" as string]: 0 }} valor={<CifraQueCuenta valor={conTarifa} alMontar />}>
          {servicios.length === 0 ? "ninguno cargado todavía" : `de ${plural(servicios.length, "servicio", "servicios")} de afuera`}
        </TarjetaCifra>
        <TarjetaCifra
          punto={sinTarifa > 0 ? "ambar" : "verde"}
          etiqueta="Sin tarifa"
          className="anim-entra"
          style={{ ["--i" as string]: 1 }}
          valor={<CifraQueCuenta valor={sinTarifa} alMontar />}
        >
          {sinTarifa > 0 ? "al elegirlos, la orden no sugiere precio" : "todos tienen precio"}
        </TarjetaCifra>
        <TarjetaCifra punto="verde" etiqueta="Tarifas vigentes" className="anim-entra" style={{ ["--i" as string]: 2 }} valor={<CifraQueCuenta valor={tarifas.length} alMontar />}>
          una por servicio y fase
        </TarjetaCifra>
      </div>

      {filas.length === 0 ? (
        <div className="card-cayla">
          <Vacio
            guia="prod-tarifas.lista"
            icono={<Scissors />}
            titulo="Todavía no hay servicios de afuera"
            acciones={
              <Boton peso="primario" onClick={onAgregarServicio}>
                Agregar un servicio
              </Boton>
            }
          >
            Para ponerle precio a quien corta, cose, borda o lava fuera del Taller, primero agrégalo en Proveedores como «Servicio de afuera».
          </Vacio>
        </div>
      ) : (
        <Tabla guia="prod-tarifas.lista">
          <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} />
          {filas.flatMap((s) =>
            s.tarifas.length === 0
              ? [
                  <div key={s.proveedorId} role="row" className={fila(PLANTILLA, "text-[13px]")}>
                    <span className={celda("izq", "text-tinta")} title={s.nombre}>{s.nombre}</span>
                    <span className="sm:col-span-5">
                      <Chip tono="ambar">Sin tarifa</Chip>
                    </span>
                    <span className={celda("der")}>
                      <Boton peso="discreto" onClick={() => onNueva(s.proveedorId)}>
                        Cargar tarifa
                      </Boton>
                    </span>
                  </div>,
                ]
              : s.tarifas.map((t, i) => (
                  <div key={`${t.proveedorId}-${t.fase}`} role="row" className={fila(PLANTILLA, "text-[13px]")}>
                    <span className={celda("izq", i === 0 ? "text-tinta" : "text-tinta/45")} title={s.nombre}>
                      {i === 0 ? s.nombre : <span className="sr-only">{s.nombre}</span>}
                      {i === 0 && !s.activo && <span className="ml-2 align-middle"><Chip tono="apagado">Archivado</Chip></span>}
                    </span>
                    <span className={celda("izq", "text-tinta")}>{nombreDeFase(t.fase)}</span>
                    <span className={celda("der", "text-tinta")}>{textoTarifa(t)}</span>
                    <span className={celda("izq", "text-tinta/75")}>{textoMinimo(t)}</span>
                    <span className={celda("izq", "text-tinta/75")}>{textoFijo(t) ?? <span className="text-tinta/45">Sin fijo</span>}</span>
                    <span className={celda("izq", "text-tinta/75")} title={t.versiones > 1 ? `${t.versiones - 1} ${t.versiones - 1 === 1 ? "tarifa anterior guardada" : "tarifas anteriores guardadas"}` : undefined}>
                      {textoVigencia(t, hoy)}
                    </span>
                    <span className={celda("der")}>
                      <Boton peso="discreto" onClick={() => onCambiar(t)}>
                        Cambiar
                      </Boton>
                    </span>
                  </div>
                )),
          )}
        </Tabla>
      )}

      <aside className="nota-cayla space-y-2">
        <p>
          Esta es la tarifa que se <b>sugiere</b> al elegir un servicio para una fase. Cada orden se queda con la tarifa que tenía al abrirse: cambiar una aquí no mueve las órdenes ya abiertas, y la anterior queda guardada.
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <CircleDollarSign aria-hidden className="h-4 w-4 text-taupe" />
          <span>¿Quieres saber cuánto costaría hacerlo afuera, contra lo que le cuesta al Taller?</span>
          <EnlaceVer href="/produccion/cotizaciones-maquila" guia="prod-tarifas.cotizaciones">
            Cotizaciones de maquila
          </EnlaceVer>
        </p>
      </aside>
    </div>
  );
}
