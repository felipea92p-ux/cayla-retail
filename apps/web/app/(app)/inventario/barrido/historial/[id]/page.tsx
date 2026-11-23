import { notFound } from "next/navigation";
import { Volver } from "@/components/ui/Volver";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Aviso } from "@/components/ui/Aviso";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { Chip } from "@/components/ui/Chip";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { VerLecturasDelBarrido } from "@/components/barrido-piso/VerLecturasDelBarrido";
import { exigirModulo } from "@/lib/persona-actual";
import { getCatalogoConteo } from "@/lib/conteos";
import { getDetalleBarrido } from "@/lib/barrido-piso";
import { estadoDelHistorial, fechaDelBarrido, porResolverDeLaFila, textoDeTramo } from "@/lib/barrido-piso-reglas";

// Un barrido del historial (ADR-0690, actividad 9): quién escaneó y entre qué horas, lo que movió al confirmarse y lo que no estaba en la
// tienda. «Ver cada lectura» abre la hoja de lo escaneado para solo leer. Lo de otra sede no se ve (la base lo rechaza: 404).

export default async function DetalleBarridoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const persona = await exigirModulo("existencias");
  const [b, prendas] = await Promise.all([getDetalleBarrido(id), getCatalogoConteo(persona.ubicacionId)]);
  if (!b) notFound();
  const estado = estadoDelHistorial(b.estado);
  const porResolver = porResolverDeLaFila(b);
  const alPiso = b.movidas.filter((m) => m.sentido === "al_piso");
  const alAlmacen = b.movidas.filter((m) => m.sentido === "al_almacen");

  return (
    <div className="space-y-6 pb-24">
      <EncabezadoPagina
        sede={b.sede || persona.ubicacionEtiqueta}
        titulo={`Barrido del ${fechaDelBarrido(b.abiertoEn)}`}
        detalle={b.cerradoPor ? `${b.estado === "confirmado" ? "Lo confirmó" : "Lo descartó"} ${b.cerradoPor}` : undefined}
        volver={<Volver href="/inventario/barrido/historial" a="Historial de barridos" />}
        pie={<Chip tono={estado.tono}>{estado.texto}</Chip>}
        acciones={<VerLecturasDelBarrido barridoId={b.id} prendas={prendas} />}
      />

      {b.estado === "abierto" && (
        <Aviso tono="info" titulo="Este barrido sigue en curso" accion={<BotonVer href="/inventario/barrido" chico>Ir al barrido</BotonVer>}>
          Lo que se ve aquí es lo escaneado hasta ahora.
        </Aviso>
      )}

      <div data-guia="barrido-detalle.cifras" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TarjetaCifra etiqueta="Escaneadas" valor={b.unidades.toLocaleString("es-PE")} unidad={b.unidades === 1 ? "prenda" : "prendas"}>
          {b.quitadas > 0 ? `${b.quitadas.toLocaleString("es-PE")} ${b.quitadas === 1 ? "lectura quitada" : "lecturas quitadas"}` : "Ninguna quitada"}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Pasaron al piso" valor={b.alPiso === null ? "—" : b.alPiso.toLocaleString("es-PE")}>
          {b.estado === "confirmado" ? "Estaban en el almacén" : "No se confirmó"}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Volvieron al almacén" valor={b.alAlmacen === null ? "—" : b.alAlmacen.toLocaleString("es-PE")}>
          {b.estado === "confirmado" ? "Nadie las escaneó colgadas" : "No se confirmó"}
        </TarjetaCifra>
        <TarjetaCifra etiqueta="Por resolver" valor={porResolver === null ? "—" : porResolver.toLocaleString("es-PE")}>
          {porResolver === null ? "No se confirmó" : b.aparte > 0 ? `${b.aparte.toLocaleString("es-PE")} aparte, sin etiqueta` : "Lo que no estaba en la tienda"}
        </TarjetaCifra>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <section data-guia="barrido-detalle.personas" className="vd-placa space-y-2 rounded-[var(--radius-tarjeta,1rem)] p-4 sm:p-5">
          <TituloSeccion cuenta={b.porPersona.length}>Quiénes escanearon</TituloSeccion>
          {b.porPersona.length === 0 ? (
            <p className="texto-detalle text-taupe">Nadie escaneó en este barrido.</p>
          ) : (
            <ul className="divide-y divide-tinta/10">
              {b.porPersona.map((p) => (
                <li key={p.personaId} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] text-tinta">{p.nombre}</p>
                    <p className="texto-detalle text-taupe">
                      {textoDeTramo(p.desde, p.hasta)}
                      {p.quitadas > 0 ? ` · ${p.quitadas.toLocaleString("es-PE")} quitadas` : ""}
                    </p>
                  </div>
                  <span className="font-display text-lg tabular-nums text-tinta">{p.unidades.toLocaleString("es-PE")}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section data-guia="barrido-detalle.movidas" className="vd-placa space-y-3 rounded-[var(--radius-tarjeta,1rem)] p-4 sm:p-5">
          <TituloSeccion cuenta={b.movidas.length}>Lo que se movió</TituloSeccion>
          {b.estado !== "confirmado" ? (
            <p className="texto-detalle text-taupe">{b.estado === "abierto" ? "Todavía nada: se mueve al confirmar." : "Nada: el barrido se descartó."}</p>
          ) : b.movidas.length === 0 ? (
            <p className="texto-detalle text-taupe">El piso ya estaba al día: no hubo que mover nada.</p>
          ) : (
            <>
              <ListaMovidas titulo="Pasaron al piso" filas={alPiso} />
              <ListaMovidas titulo="Volvieron al almacén" filas={alAlmacen} />
            </>
          )}
          {b.noCargado.length > 0 && <ListaMovidas titulo="No estaban en la tienda (no se movieron)" filas={b.noCargado} />}
        </section>
      </div>
    </div>
  );
}

function ListaMovidas({ titulo, filas }: { titulo: string; filas: { varianteId: string; prenda: string; cantidad: number }[] }) {
  if (filas.length === 0) return null;
  return (
    <div>
      <p className="label-cayla text-[11px] text-taupe">{titulo}</p>
      <ul className="mt-1 divide-y divide-tinta/10">
        {filas.map((m) => (
          <li key={m.varianteId} className="flex items-center gap-3 py-2">
            <span className="min-w-0 flex-1 truncate text-[15px] text-tinta">{m.prenda}</span>
            <span className="tabular-nums text-[15px] text-tinta">{m.cantidad.toLocaleString("es-PE")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
