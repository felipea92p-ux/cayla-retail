import { Wallet } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { getDatosFondos } from "@/lib/fondos";
import { TEXTO_MOVIMIENTO_FONDO, cifrasDeFondos, type MovimientoFondo } from "@/lib/fondos-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";
import { AnularMovimientoFondo, DevolverFondo, EntregarFondo } from "@/components/fondos/AccionesFondos";

// Compras ▸ Fondos por rendir (ADR-0362, fase 6 · actividad 1; decisiones 26, 29, 30, 34, 35 y 65): la plata que CAYLA le entrega a
// quien compra, y cuánto tiene cada persona en la mano. Es el control contra el fraude que pidió Felipe: al final tiene que verse cuánto
// le queda a cada una.
//
// Cabecera de Compras (`EncabezadoPagina`, como Órdenes de compra) con «+ Entregar plata». Debajo, tres cifras de toda la empresa; después,
// una fila por persona con fondo (le entregaste · devolvió · tiene en la mano) y su «Registrar devolución»; al final, cada entrega y
// devolución, con su «Anular». La columna «Gastó» (lo que falta para cuadrar) aparece sola el día que alguien pague desde su fondo
// (actividad 2): mientras sea cero en todos, es ruido.
//
// Lo que la persona no puede hacer con su propio fondo (entregárselo, registrar su devolución, anularlo) no se le ofrece; la base igual
// lo impide (20261013182000).

const PLANTILLA_FONDOS_BASE = "sm:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_8.5rem_11rem]";
const PLANTILLA_FONDOS_GASTO = "sm:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_7.5rem_8.5rem_11rem]";
const PLANTILLA_MOVIMIENTOS = "sm:grid-cols-[4rem_minmax(0,0.9fr)_7rem_minmax(0,1.1fr)_7.5rem_6.5rem]";
// En celular cada fila se apila: lo que en escritorio es columna aparte va en la segunda línea de la primera celda.
const SOLO_ESCRITORIO = "hidden sm:block";
const SEGUNDA_LINEA = "block text-xs text-taupe sm:hidden";

const TONO_MOVIMIENTO: Record<MovimientoFondo["tipo"], TonoChip> = { entrega_fondo: "pizarra", devolucion_fondo: "neutro" };
const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? uno : varios}`;

export default async function FondosPage() {
  const persona = await exigirModulo("fondos");
  const { fondos, movimientos, opciones, falla } = await getDatosFondos();
  const cifras = cifrasDeFondos(fondos);
  const conGasto = cifras.gastado !== 0;
  const plantillaFondos = conGasto ? PLANTILLA_FONDOS_GASTO : PLANTILLA_FONDOS_BASE;
  const entregar = <EntregarFondo opciones={opciones} />;

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Fondos por rendir"
        subtitulo="La plata que le entregas a quien compra, y cuánto tiene cada persona en la mano."
        acciones={falla ? undefined : entregar}
      />

      {falla ? (
        <Aviso tono="error" titulo="No se pudieron leer los fondos">
          {falla}
        </Aviso>
      ) : fondos.length === 0 ? (
        <div className="card-cayla" data-guia="fondos.vacio">
          <Vacio icono={<Wallet />} titulo="Nadie tiene un fondo todavía" acciones={entregar}>
            Entrégale plata a quien va a comprar: aquí vas a ver cuánto le diste, cuánto devolvió y cuánto tiene en la mano.
          </Vacio>
        </div>
      ) : (
        <>
          <div className="@container" data-guia="fondos.cifras">
            <div className="grid grid-cols-2 gap-3 @min-[40rem]:grid-cols-3">
              <TarjetaCifra etiqueta="Tienen en la mano" valor={soles(cifras.enMano)} className="col-span-2 @min-[40rem]:col-span-1">
                {plural(cifras.conPlata, "persona con plata", "personas con plata")}
              </TarjetaCifra>
              <TarjetaCifra etiqueta="Les entregaste" valor={soles(cifras.entregado)}>
                desde el primer fondo
              </TarjetaCifra>
              <TarjetaCifra etiqueta="Devolvieron" valor={soles(cifras.devuelto)}>
                a un banco o una caja fuerte
              </TarjetaCifra>
            </div>
          </div>

          <section className="space-y-3">
            <TituloSeccion dato={plural(fondos.length, "persona", "personas")}>Quién tiene plata</TituloSeccion>
            <Tabla guia="fondos.lista">
              <Encabezado
                plantilla={plantillaFondos}
                columnas={[
                  { titulo: "Persona" },
                  { titulo: "Le entregaste", alinear: "der" },
                  { titulo: "Devolvió", alinear: "der" },
                  ...(conGasto ? [{ titulo: "Gastó", alinear: "der" as const }] : []),
                  { titulo: "Tiene en la mano", alinear: "der" },
                  { titulo: "" },
                ]}
              />
              {fondos.map((f) => (
                <div key={f.cuentaId} className={fila(plantillaFondos)}>
                  <span className={celda("izq", "text-tinta")}>
                    <span className="font-medium">{f.persona}</span>
                    <span className="block truncate text-xs text-taupe">
                      {[f.sede, f.ultimoMotivo ? `«${f.ultimoMotivo}»` : null].filter(Boolean).join(" · ") || "—"}
                    </span>
                    <span className={SEGUNDA_LINEA}>
                      Le entregaste {soles(f.entregado)} · devolvió {soles(f.devuelto)}
                      {conGasto ? ` · gastó ${soles(f.gastado)}` : ""}
                    </span>
                  </span>
                  <span className={celda("der", `${SOLO_ESCRITORIO} text-tinta/80`)}>{soles(f.entregado)}</span>
                  <span className={celda("der", `${SOLO_ESCRITORIO} text-tinta/80`)}>{soles(f.devuelto)}</span>
                  {conGasto && <span className={celda("der", `${SOLO_ESCRITORIO} text-tinta/80`)}>{soles(f.gastado)}</span>}
                  <span className={celda("der", "font-medium text-tinta")}>
                    <span className="text-xs font-normal text-taupe sm:hidden">Tiene en la mano </span>
                    {soles(f.saldo)}
                  </span>
                  <span className="flex min-w-0 justify-start sm:justify-end">
                    {f.esMio ? (
                      <span className="text-xs text-taupe">Tu fondo: lo mueve otra persona</span>
                    ) : f.saldo > 0 ? (
                      <DevolverFondo fondo={f} cuentas={opciones.cuentas} />
                    ) : null}
                  </span>
                </div>
              ))}
            </Tabla>
          </section>

          {movimientos.length > 0 && (
            <section className="space-y-3">
              <TituloSeccion dato={plural(movimientos.length, "movimiento", "movimientos")}>Entregas y devoluciones</TituloSeccion>
              <Tabla guia="fondos.movimientos">
                <Encabezado
                  plantilla={PLANTILLA_MOVIMIENTOS}
                  columnas={[
                    { titulo: "Fecha" },
                    { titulo: "Persona" },
                    { titulo: "Qué" },
                    { titulo: "De dónde o a dónde", subtitulo: "y para qué" },
                    { titulo: "Monto", alinear: "der" },
                    { titulo: "" },
                  ]}
                />
                {movimientos.map((m) => {
                  const anulado = m.estado === "anulado";
                  return (
                    <div key={m.id} className={fila(PLANTILLA_MOVIMIENTOS)}>
                      <span className={celda("izq", "tabular-nums text-tinta/80")}>{diaMes(m.fecha)}</span>
                      <span className={celda("izq", "text-tinta")}>{m.persona}</span>
                      <span className="min-w-0">
                        <Chip tono={anulado ? "apagado" : TONO_MOVIMIENTO[m.tipo]}>{anulado ? `${TEXTO_MOVIMIENTO_FONDO[m.tipo]} anulada` : TEXTO_MOVIMIENTO_FONDO[m.tipo]}</Chip>
                      </span>
                      <span className={celda("izq", "text-tinta/80")}>
                        {m.tipo === "entrega_fondo" ? `De ${m.cuenta}` : `A ${m.cuenta}`}
                        {m.motivo && <span className="block truncate text-xs text-taupe">«{m.motivo}»</span>}
                        {anulado && (
                          <span className="block truncate text-xs text-taupe">
                            Anulada{m.anuladoPor ? ` por ${m.anuladoPor}` : ""}
                            {m.motivoAnulacion ? `: ${m.motivoAnulacion}` : ""}
                          </span>
                        )}
                      </span>
                      <span className={celda("der", anulado ? "text-tinta/45 line-through" : "font-medium text-tinta")}>{soles(m.monto)}</span>
                      <span className="flex min-w-0 justify-start sm:justify-end">{m.puedeAnular && <AnularMovimientoFondo movimiento={m} />}</span>
                    </div>
                  );
                })}
              </Tabla>
            </section>
          )}

          <p className="nota-cayla">
            El fondo no es un gasto: la plata sigue siendo de CAYLA mientras la persona la tiene. Lo que devuelva lo registra quien recibe la
            plata, no quien la devuelve.
          </p>
        </>
      )}
    </div>
  );
}
