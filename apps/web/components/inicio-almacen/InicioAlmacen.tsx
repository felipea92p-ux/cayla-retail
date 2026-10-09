import type { ReactNode } from "react";
import type { DatosInicioAlmacen } from "@/lib/inicio-almacen";
import type { AvisosVisibles } from "@/lib/inicio-avisos";
import { avanceDelDia, hrefColgarEnTandas, sigueAhora, TITULO_NUEVOS } from "@/lib/inicio-almacen-reglas";
import { AccesosAlmacen, EnCaminoAlmacen, PorColgarAlmacen, PulsoAlmacen, type AccesoAlmacen } from "./BloquesLaterales";
import { CabinaAlmacen } from "./CabinaAlmacen";
import { DockAlmacen } from "./DockAlmacen";
import { EfectosInicio } from "./EfectosInicio";
import { NuevoEnOtrasSedes } from "./NuevoEnOtrasSedes";
import { TeTocaAlmacen } from "./TeTocaAlmacen";

/**
 * El Inicio de una cuenta de Almacén (Felipe, 2026-09-30, ADR-0292; maqueta docs/maquetas/inicio-almacen-2026-09/, dirección A).
 * Orden único en todos los tamaños: la cabina («Nuevo producto», lo último registrado y «Sigue ahora») → «Te toca» → «Nuevo
 * en otras sedes»; y, a la derecha desde ~940 px, el pulso, lo que viene en camino, lo que está por colgar y los accesos.
 * Cada bloque falla por separado y dice que falló.
 *
 * Usa TODO el ancho de la pantalla (Felipe, 2026-09-30: «a cualquier resolución o zoom»): el marcador `data-ancho-completo` le quita el
 * tope de 64 rem al <main> solo a esta cuenta, y las reglas por contenedor del CSS (≥1100 y ≥1500 px) hacen crecer título, tarjetas y columnas.
 *
 * El botón fijo de celular (`DockAlmacen`) va FUERA de `.ia`: un contenedor de consulta es el bloque contenedor de lo que
 * lleva `position: fixed`, y el botón se quedaría pegado al final del bloque en vez del de la pantalla.
 */
export function InicioAlmacen({
  datos,
  visibles,
  ajustar,
  accesos,
  veRecibir,
  puedeEditarCatalogo,
}: {
  datos: DatosInicioAlmacen;
  visibles: AvisosVisibles;
  ajustar: ReactNode;
  accesos: AccesoAlmacen[];
  veRecibir: boolean;
  puedeEditarCatalogo: boolean;
}) {
  const { ahora, despues } = sigueAhora(visibles.activos);
  const avance = avanceDelDia(visibles);
  const hrefColgar = hrefColgarEnTandas(datos.existencias);
  return (
    <>
      <EfectosInicio atajoNuevo="/productos/nuevo" />
      <div className="ia">
        {/* Pide todo el ancho del <main> (`AppShell`: `has-[[data-ancho-completo]]`): a cualquier resolución o zoom el Inicio llena la pantalla. */}
        <span hidden data-ancho-completo />
        <CabinaAlmacen
          nuevos={datos.nuevos}
          tituloLista={TITULO_NUEVOS.lista}
          ahora={ahora}
          despues={despues}
          alDia={visibles.alDia}
          avance={avance}
          hayColaSinLeer={visibles.activos.some((a) => a.nivel === "sinleer")}
          hrefColgar={hrefColgar}
        />
        <div className="ia-gA">
          <div className="ia-cL">
            <TeTocaAlmacen visibles={visibles} ajustar={ajustar} />
            <NuevoEnOtrasSedes items={datos.nuevos} titulo={TITULO_NUEVOS} puedeEditar={puedeEditarCatalogo} />
          </div>
          <div className="ia-cR">
            {(datos.existencias !== undefined || datos.hoy !== undefined) && <PulsoAlmacen existencias={datos.existencias} hoy={datos.hoy} fotos={datos.fotos} />}
            {datos.enCamino !== undefined && <EnCaminoAlmacen viajes={datos.enCamino} />}
            <PorColgarAlmacen existencias={datos.existencias} />
            <AccesosAlmacen accesos={accesos} />
          </div>
        </div>
      </div>
      <DockAlmacen veRecibir={veRecibir} hrefColgar={hrefColgar} />
    </>
  );
}
