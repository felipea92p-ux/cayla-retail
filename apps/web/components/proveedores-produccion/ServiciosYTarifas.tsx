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
// La forma de la tabla la decide el ancho de su TARJETA (`@container` en la `Tabla`), no el de la ventana (Formidable de Producción, H4): con el lateral abierto la tarjeta mide ventana − 352,
// y las seis columnas fijas con sus huecos y su relleno suman 848 px. Desde 1056 px de tarjeta el nombre del servicio recibe 208 px o más y van las siete columnas; por debajo, cada fila se apila:
// el nombre y su botón arriba, los datos debajo en una línea que baja sola. Lo vigila `lib/servicios-tarifas-ancho.test.ts` (si cambias una columna, cambia el corte).
const PLANTILLA = "grid-cols-[minmax(0,1fr)_auto] @min-[1056px]:grid-cols-[minmax(0,1.6fr)_5rem_8.5rem_8rem_8.5rem_8rem_6.5rem]";
// El botón de cada fila: angosto, sube junto al nombre aunque en el código vaya al final; ancho, vuelve a la última columna.
const BOTON_DE_LA_FILA = "col-start-2 row-start-1 @min-[1056px]:col-start-auto @min-[1056px]:row-start-auto";

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
        <Tabla guia="prod-tarifas.lista" className="@container">
          <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} visible="hidden @min-[1056px]:grid" />
          {filas.flatMap((s) =>
            s.tarifas.length === 0
              ? [
                  <div key={s.proveedorId} role="row" className={fila(PLANTILLA, "text-[13px]")}>
                    <span className={celda("izq", "text-tinta")} title={s.nombre}>{s.nombre}</span>
                    <span className="col-span-full @min-[1056px]:col-span-5">
                      <Chip tono="ambar">Sin tarifa</Chip>
                    </span>
                    <span className={celda("der", BOTON_DE_LA_FILA)}>
                      <Boton peso="discreto" onClick={() => onNueva(s.proveedorId)}>
                        Cargar tarifa
                      </Boton>
                    </span>
                  </div>,
                ]
              : s.tarifas.map((t, i) => (
                  <div key={`${t.proveedorId}-${t.fase}`} role="row" className={fila(PLANTILLA, "text-[13px]")}>
                    {/* Ancho: el nombre va solo en la primera fase del servicio (las demás lo traen para el lector). Apilada, cada fila lleva su nombre: ya no hay una columna que lo sostenga. */}
                    <span className={celda("izq", "text-tinta")} title={s.nombre}>
                      <span className={i === 0 ? undefined : "@min-[1056px]:sr-only"}>{s.nombre}</span>
                      {!s.activo && <span className={`ml-2 align-middle ${i === 0 ? "" : "@min-[1056px]:hidden"}`}><Chip tono="apagado">Archivado</Chip></span>}
                    </span>
                    {/* Ancho: `contents`, y cada dato es una columna de la fila. Apilada: una línea de datos bajo el nombre, que baja sola si no cabe. */}
                    <div className="col-span-full flex flex-wrap gap-x-5 gap-y-0.5 @min-[1056px]:contents">
                      <span className={celda("izq", "text-tinta")}>{nombreDeFase(t.fase)}</span>
                      <span className={celda("der", "text-tinta")}>{textoTarifa(t)}</span>
                      <span className={celda("izq", "text-tinta/75")}>{textoMinimo(t)}</span>
                      <span className={celda("izq", "text-tinta/75")}>{textoFijo(t) ?? <span className="text-tinta/70">Sin fijo</span>}</span>
                      <span className={celda("izq", "text-tinta/75")} title={t.versiones > 1 ? `${t.versiones - 1} ${t.versiones - 1 === 1 ? "tarifa anterior guardada" : "tarifas anteriores guardadas"}` : undefined}>
                        <span className="@min-[1056px]:hidden">Rige {textoVigencia(t, hoy).toLocaleLowerCase("es")}</span>
                        <span className="hidden @min-[1056px]:inline">{textoVigencia(t, hoy)}</span>
                      </span>
                    </div>
                    <span className={celda("der", BOTON_DE_LA_FILA)}>
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
