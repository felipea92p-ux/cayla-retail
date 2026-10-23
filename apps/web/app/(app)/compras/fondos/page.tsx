import { Wallet } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { getDatosFondos } from "@/lib/fondos";
import { getPlataPorConfirmar } from "@/lib/mi-plata";
import { getRevisarCompras } from "@/lib/revisar-compras";
import { BandejaRevisar } from "@/components/mi-plata/BandejaRevisar";
import { TEXTO_MOVIMIENTO_FONDO, cifrasDeFondos, topeDevolucion, type MovimientoFondo } from "@/lib/fondos-reglas";
import { soles } from "@/lib/compras-reglas";
import { diaMes } from "@/lib/fechas-lima";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Chip, type TonoChip } from "@/components/ui/Chip";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";
import { BotonEnlace } from "@/components/ui/campos";
import { AnularMovimientoFondo, DevolverFondo, EntregarFondo, PagarDeudaFondo } from "@/components/fondos/AccionesFondos";
import { RevisarRendicion } from "@/components/fondos/RevisarRendicion";
import { estadoPorFondo } from "@/lib/rendicion-reglas";
import { deudasPorPersona } from "@/lib/deuda-fondo-reglas";
import { diaYHoraLima } from "@/lib/fechas-lima";

// Rediseño (maqueta docs/maquetas/compras-formidable-2026-10/, Felipe 2026-10-23): arriba, la BANDEJA de lo que anotaron las compradoras
// (cuatro cifras que filtran, la lista y su detalle al lado: <BandejaRevisar>); lo de los fondos («Quién tiene plata», las rendiciones, las
// entregas y devoluciones) pasa abajo y deja de ocupar media página: la cabecera lleva a ello con «Quién tiene plata».
//
// Compras ▸ Revisar compras (antes «Fondos por rendir»; ADR-0480 le cambia el nombre y la pantalla en la actividad 2, y en la 7 le suma las
// compras por completar y los cierres del día; ADR-0362, fase 6 · actividad 1; decisiones 26, 29, 30, 34, 35 y 65): la plata que CAYLA le entrega a
// quien compra, y cuánto tiene cada persona en la mano. Es el control contra el fraude que pidió Felipe: al final tiene que verse cuánto
// le queda a cada una.
//
// Cabecera de Compras (`EncabezadoPagina`, como Órdenes de compra) con «+ Entregar plata». Debajo, tres cifras de toda la empresa; después,
// una fila por persona con fondo (le entregaste · devolvió · tiene en la mano) y su «Registrar devolución»; al final, cada entrega y
// devolución, con su «Anular». La columna «Gastó» (lo que pagó desde su fondo, actividad 2) aparece sola cuando alguien pagó: mientras
// sea cero en todos, es ruido. Un fondo en negativo es lo que CAYLA le debe a quien pagó de su bolsillo (decisión 32): no resta de
// «Tienen en la mano», tiene su propia cifra y su fila lo dice.
//
// Lo que la persona no puede hacer con su propio fondo (entregárselo, registrar su devolución, anularlo) no se le ofrece; la base igual
// lo impide (20261013182000).
//
// La rendición (actividad 5, 20261013235000): arriba de todo, «Rendiciones por aprobar», cada una con «Revisar» (la hoja dice si quien
// mira no puede aprobarla: es su fondo, le entregó plata en esa rendición, o es la de un líder y no es Admin). En la fila de cada persona,
// si rindió y espera, y lo que debe por un faltante (decisión 54: a la vista hasta que se salde).
//
// Saldar la deuda (actividad 7, decisión 71: solo cuando la persona devuelve la plata): en la fila de quien debe, «Registrar su pago», que
// lo registra quien recibe la plata. Lo que debe sale de `fn_deudas_fondo` (el faltante menos lo pagado); cada pago va a la lista de abajo,
// con su «Anular».

// Las tres tablas deciden su forma por el ancho de SU tarjeta (`@container` en <Tabla>, como Órdenes de compra y Clientes), no por el
// de la ventana: con el lateral abierto la tarjeta mide ~370 px menos que la ventana, y a 1024 px las columnas fijas de «Quién tiene
// plata» (672 px con «Gastó») dejaban a la persona en 0 px y cortaban «Registrar devolución» con un scroll de lado (2026-10-14). Las tres
// cambian en los mismos dos cortes, así la página se reacomoda entera de una vez:
//   · desde 60 rem de tarjeta, todas las columnas;
//   · desde 36 rem, lo que explica la cifra de la fila baja a la segunda línea de la persona (le entregaste · devolvió · gastó; debería
//     tener · dice que tiene; qué fue y de dónde) y quedan la persona, la cifra y la acción;
//   · más angosta (celular, o una ventana chica con el lateral), cada fila apila sus datos.
// «Qué» mide 10,5 rem: el chip más largo, «Pago de deuda anulado», ocupa 163 px y en 7 rem se montaba sobre «De dónde».
const PLANTILLA_FONDOS_BASE =
  "@min-[36rem]:grid-cols-[minmax(0,1fr)_8.5rem_11rem] @min-[60rem]:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_8.5rem_11rem]";
const PLANTILLA_FONDOS_GASTO =
  "@min-[36rem]:grid-cols-[minmax(0,1fr)_8.5rem_11rem] @min-[60rem]:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem_7.5rem_8.5rem_11rem]";
const PLANTILLA_MOVIMIENTOS =
  "@min-[36rem]:grid-cols-[4rem_minmax(0,1fr)_7.5rem_6.5rem] @min-[60rem]:grid-cols-[4rem_minmax(0,0.9fr)_10.5rem_minmax(0,1.1fr)_7.5rem_6.5rem]";
const PLANTILLA_RENDICIONES =
  "@min-[36rem]:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_7rem] @min-[60rem]:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_minmax(0,0.8fr)_7rem]";
// Los títulos, solo con la tabla en columnas (desde 36 rem): apilada, cada dato lleva su propio rótulo.
const TITULOS_DESDE = "hidden @min-[36rem]:grid";
// Una celda que solo es columna propia en la tabla ancha.
const SOLO_ANCHA = "hidden @min-[60rem]:block";
// Lo que en una tabla menos ancha va en la segunda línea de la primera celda (que puede partirse: con «gastó» no cabe en una sola).
const SEGUNDA_LINEA = "block whitespace-normal text-xs text-taupe @min-[60rem]:hidden";
// Una cifra que se ve en toda forma: a la derecha cuando hay columnas; apilada, a la izquierda como el resto.
const CIFRA = "min-w-0 whitespace-nowrap tabular-nums @min-[36rem]:text-right";
// La acción de la fila: al borde derecho cuando hay columnas; apilada, bajo lo demás.
const ACCION = "flex min-w-0 justify-start @min-[36rem]:justify-end";

const TONO_MOVIMIENTO: Record<MovimientoFondo["tipo"], TonoChip> = { entrega_fondo: "pizarra", devolucion_fondo: "neutro", pago_deuda_fondo: "verde" };
const plural = (n: number, uno: string, varios: string) => `${n.toLocaleString("es-PE")} ${n === 1 ? uno : varios}`;
// Un monto dentro de una frase que se parte (la segunda línea): «S/» y el número nunca quedan en líneas distintas, o se leen como dos cifras.
const montoEnFrase = (n: number) => <span className="whitespace-nowrap">{soles(n)}</span>;

export default async function FondosPage() {
  const persona = await exigirModulo("fondos");
  const [{ fondos, movimientos, opciones, rendiciones, rendicionesFalla, deudas: filasDeuda, deudasFalla, falla }, plataAnotada, revisar] = await Promise.all([
    getDatosFondos(),
    getPlataPorConfirmar(),
    getRevisarCompras(),
  ]);
  const porAprobar = rendiciones.filter((r) => r.estado === "por_aprobar");
  const estado = estadoPorFondo(rendiciones);
  const deudas = deudasPorPersona(filasDeuda);
  const debe = (personaId: string) => deudas.get(personaId)?.debe ?? 0;
  const conPagos = movimientos.some((m) => m.tipo === "pago_deuda_fondo");
  const cifras = cifrasDeFondos(fondos);
  const conGasto = cifras.gastado !== 0;
  const conDeuda = cifras.teDebe > 0;
  const plantillaFondos = conGasto ? PLANTILLA_FONDOS_GASTO : PLANTILLA_FONDOS_BASE;
  const entregar = <EntregarFondo opciones={opciones} />;
  const acciones = (
    <>
      <BotonEnlace href="#quien-tiene-plata" peso="fantasma" data-guia="fondos.ir-quien-tiene">
        Quién tiene plata
      </BotonEnlace>
      {entregar}
    </>
  );

  return (
    <div className="space-y-6">
      <EncabezadoPagina
        sede={persona.ubicacionEtiqueta}
        titulo="Revisar compras"
        subtitulo="Lo que anotaron las compradoras desde el celular. Confírmalo y pásalo a los libros."
        acciones={falla ? undefined : acciones}
      />

      {/* La bandeja (ADR-0480, actividades 2 y 7; rediseño 2026-10-23). Si una de sus dos lecturas falla (la base sin la migración, o
          caída), lo dice aparte y la bandeja muestra lo que sí se leyó: el resto de la pantalla sale igual. */}
      {!falla && (plataAnotada === null || revisar === null) && (
        <Aviso tono="atencion" titulo={plataAnotada === null ? "No se pudo leer la plata anotada" : "No se pudieron leer las compras por completar"} chico>
          Vuelve a intentarlo en un momento.
        </Aviso>
      )}
      {!falla && (
        <BandejaRevisar
          plata={plataAnotada ?? []}
          papeles={revisar?.papeles ?? []}
          gastos={revisar?.gastos ?? []}
          cierres={revisar?.cierres ?? []}
          proveedores={revisar?.proveedores ?? []}
          cuentas={opciones.cuentas}
        />
      )}

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
          {/* Lo de los fondos empieza aquí: «Quién tiene plata» de la cabecera trae la vista hasta este punto. */}
          <div className="@container scroll-mt-6 border-t border-sand pt-6" id="quien-tiene-plata" data-guia="fondos.cifras">
            <div className={`grid grid-cols-2 gap-3 ${conDeuda ? "@min-[48rem]:grid-cols-4" : "@min-[40rem]:grid-cols-3"}`}>
              <TarjetaCifra
                etiqueta="Tienen en la mano"
                valor={soles(cifras.enMano)}
                className={conDeuda ? undefined : "col-span-2 @min-[40rem]:col-span-1"}
              >
                {plural(cifras.conPlata, "persona con plata", "personas con plata")}
              </TarjetaCifra>
              {conDeuda && (
                <TarjetaCifra etiqueta="CAYLA les debe" valor={soles(cifras.teDebe)}>
                  {plural(cifras.conDeuda, "pagó de su bolsillo", "pagaron de su bolsillo")}
                </TarjetaCifra>
              )}
              <TarjetaCifra etiqueta="Entregado" valor={soles(cifras.entregado)}>
                desde el primer fondo
              </TarjetaCifra>
              <TarjetaCifra etiqueta="Devolvieron" valor={soles(cifras.devuelto)}>
                a un banco o una caja fuerte
              </TarjetaCifra>
            </div>
          </div>

          {rendicionesFalla && (
            <Aviso tono="atencion" titulo="No se pudieron leer las rendiciones" chico>
              Lo demás de esta pantalla sí está al día. Vuelve a intentarlo en un momento.
            </Aviso>
          )}
          {deudasFalla && (
            <Aviso tono="atencion" titulo="No se pudo leer lo que se debe por faltantes" chico>
              Lo demás de esta pantalla sí está al día. Vuelve a intentarlo en un momento.
            </Aviso>
          )}
          {porAprobar.length > 0 && (
            <section className="space-y-3">
              <TituloSeccion cuenta={porAprobar.length}>Rendiciones por aprobar</TituloSeccion>
              {/* `overflow-y-hidden`: la entrada de las filas (suben 8 px) no le pone a la tarjeta una barra vertical de paso. */}
              <Tabla guia="fondos.rendiciones" className="@container overflow-y-hidden">
                <Encabezado
                  visible={TITULOS_DESDE}
                  plantilla={PLANTILLA_RENDICIONES}
                  columnas={[
                    { titulo: "Persona" },
                    { titulo: "Debería tener", alinear: "der", clase: SOLO_ANCHA },
                    { titulo: "Dice que tiene", alinear: "der", clase: SOLO_ANCHA },
                    { titulo: "Cómo quedó" },
                    { titulo: "" },
                  ]}
                />
                {porAprobar.map((r) => (
                  <div key={r.id} className={fila(PLANTILLA_RENDICIONES)}>
                    <span className={celda("izq", "text-tinta")}>
                      <span className="block truncate font-medium">{r.persona}</span>
                      {/* Se parte en vez de cortarse: «papeles sin foto» es justo lo que quien aprueba tiene que ver. */}
                      <span className="block whitespace-normal text-xs text-taupe">
                        La rindió el {r.rendidaEn ? diaYHoraLima(r.rendidaEn).dia : "—"}
                        {r.sinFoto > 0 ? ` · ${plural(r.sinFoto, "papel sin foto", "papeles sin foto")}` : ""}
                      </span>
                      <span className={SEGUNDA_LINEA}>
                        Debería tener {montoEnFrase(Math.max(r.saldo, 0))} · dice que tiene {montoEnFrase(r.efectivo)}
                      </span>
                    </span>
                    <span className={celda("der", `${SOLO_ANCHA} text-tinta/80`)}>{soles(Math.max(r.saldo, 0))}</span>
                    <span className={celda("der", `${SOLO_ANCHA} text-tinta/80`)}>{soles(r.efectivo)}</span>
                    <span className="min-w-0">
                      {r.faltante > 0.005 ? <Chip tono="ambar">Faltan {soles(r.faltante)}</Chip> : <Chip tono="verde">Cuadra</Chip>}
                    </span>
                    <span className={ACCION}>
                      <RevisarRendicion rendicion={r} deuda={debe(r.personaId)} />
                    </span>
                  </div>
                ))}
              </Tabla>
            </section>
          )}

          <section className="space-y-3">
            <TituloSeccion cuenta={fondos.length}>Quién tiene plata</TituloSeccion>
            <Tabla guia="fondos.lista" className="@container overflow-y-hidden">
              <Encabezado
                visible={TITULOS_DESDE}
                plantilla={plantillaFondos}
                columnas={[
                  { titulo: "Persona" },
                  { titulo: "Entregado", alinear: "der", clase: SOLO_ANCHA },
                  { titulo: "Devolvió", alinear: "der", clase: SOLO_ANCHA },
                  ...(conGasto ? [{ titulo: "Gastó", alinear: "der" as const, clase: SOLO_ANCHA }] : []),
                  { titulo: "Tiene en la mano", alinear: "der" },
                  { titulo: "" },
                ]}
              />
              {fondos.map((f) => (
                <div key={f.cuentaId} className={fila(plantillaFondos)}>
                  <span className={celda("izq", "text-tinta")}>
                    <span className="block truncate font-medium">{f.persona}</span>
                    <span className="block truncate text-xs text-taupe">
                      {[f.sede, f.ultimoMotivo ? `«${f.ultimoMotivo}»` : null].filter(Boolean).join(" · ") || "—"}
                    </span>
                    {(estado.get(f.cuentaId)?.porAprobar || debe(f.personaId) > 0.005) && (
                      <span className="mt-1 flex flex-wrap gap-1.5">
                        {estado.get(f.cuentaId)?.porAprobar && <Chip tono="pizarra">Rindió: por aprobar</Chip>}
                        {debe(f.personaId) > 0.005 && <Chip tono="ambar">Debe {soles(debe(f.personaId))}</Chip>}
                      </span>
                    )}
                    <span className={SEGUNDA_LINEA}>
                      Entregado {montoEnFrase(f.entregado)} · devolvió {montoEnFrase(f.devuelto)}
                      {conGasto && <> · gastó {montoEnFrase(f.gastado)}</>}
                    </span>
                  </span>
                  <span className={celda("der", `${SOLO_ANCHA} text-tinta/80`)}>{soles(f.entregado)}</span>
                  <span className={celda("der", `${SOLO_ANCHA} text-tinta/80`)}>{soles(f.devuelto)}</span>
                  {conGasto && <span className={celda("der", `${SOLO_ANCHA} text-tinta/80`)}>{soles(f.gastado)}</span>}
                  <span className={`${CIFRA} font-medium text-tinta`}>
                    <span className="text-xs font-normal text-taupe @min-[36rem]:hidden">Tiene en la mano </span>
                    {soles(Math.max(f.saldo, 0))}
                    {/* Con su rendición por aprobar, lo que ella dijo tener, al lado de lo de los libros (/formidable 2026-10-14, cambio 3). */}
                    {estado.get(f.cuentaId)?.porAprobar && (
                      <span className="block whitespace-normal text-xs font-normal text-taupe">
                        dice <span className="whitespace-nowrap">{soles(estado.get(f.cuentaId)!.porAprobar!.efectivo)}</span> ·{" "}
                        <span className="whitespace-nowrap">por aprobar</span>
                      </span>
                    )}
                    {/* Pagó de su bolsillo (decisión 32): el negativo no es plata en la mano, es lo que CAYLA le debe. */}
                    {/* La celda de una cifra no parte su texto: esta línea sí, pero nunca dentro de la cifra. */}
                    {f.saldo < -0.005 && (
                      <span className="block whitespace-normal text-xs font-normal text-ambar-profundo">
                        {f.esMio ? "CAYLA te debe" : "CAYLA le debe"} <span className="whitespace-nowrap">{soles(-f.saldo)}</span>
                      </span>
                    )}
                  </span>
                  <span className={`${ACCION} flex-wrap gap-2`}>
                    {f.esMio ? (
                      <span className="text-xs text-taupe @min-[36rem]:text-right">Tu fondo: lo mueve otra persona</span>
                    ) : (
                      <>
                        {/* Con su rendición por aprobar, lo que tiene en la mano es el saldo menos su faltante (Felipe 2026-10-14). */}
                        {topeDevolucion(f.saldo, estado.get(f.cuentaId)?.porAprobar?.faltante).monto > 0.005 && (
                          <DevolverFondo fondo={f} cuentas={opciones.cuentas} porAprobar={estado.get(f.cuentaId)?.porAprobar?.faltante ?? 0} />
                        )}
                        {debe(f.personaId) > 0.005 && <PagarDeudaFondo deuda={deudas.get(f.personaId)!} cuentas={opciones.cuentas} />}
                      </>
                    )}
                  </span>
                </div>
              ))}
            </Tabla>
          </section>

          {movimientos.length > 0 && (
            <section className="space-y-3">
              {/* Cuántos hay, en el globito pegado al nombre (ADR-0358, títulos de sección, ronda 9). */}
              <TituloSeccion cuenta={movimientos.length}>
                {conPagos ? "Entregas, devoluciones y pagos de deuda" : "Entregas y devoluciones"}
              </TituloSeccion>
              <Tabla guia="fondos.movimientos" className="@container overflow-y-hidden">
                <Encabezado
                  visible={TITULOS_DESDE}
                  plantilla={PLANTILLA_MOVIMIENTOS}
                  columnas={[
                    { titulo: "Fecha" },
                    { titulo: "Persona" },
                    { titulo: "Qué", clase: SOLO_ANCHA },
                    { titulo: "De dónde o a dónde", subtitulo: "y para qué", clase: SOLO_ANCHA },
                    { titulo: "Monto", alinear: "der" },
                    { titulo: "" },
                  ]}
                />
                {movimientos.map((m) => {
                  const anulado = m.estado === "anulado";
                  // Qué fue, de dónde y su anulación: columnas propias en la tabla ancha; más angosta, bajo la persona.
                  const que = (
                    <Chip tono={anulado ? "apagado" : TONO_MOVIMIENTO[m.tipo]}>
                      {anulado ? `${TEXTO_MOVIMIENTO_FONDO[m.tipo]} ${m.tipo === "pago_deuda_fondo" ? "anulado" : "anulada"}` : TEXTO_MOVIMIENTO_FONDO[m.tipo]}
                    </Chip>
                  );
                  const cuenta = m.tipo === "entrega_fondo" ? `De ${m.cuenta}` : `A ${m.cuenta}`;
                  const anulacion = anulado
                    ? `${m.tipo === "pago_deuda_fondo" ? "Anulado" : "Anulada"}${m.anuladoPor ? ` por ${m.anuladoPor}` : ""}${m.motivoAnulacion ? `: ${m.motivoAnulacion}` : ""}`
                    : null;
                  return (
                    <div key={m.id} className={fila(PLANTILLA_MOVIMIENTOS)}>
                      <span className={celda("izq", "tabular-nums text-tinta/80")}>{diaMes(m.fecha)}</span>
                      <span className={celda("izq", "text-tinta")}>
                        <span className="block truncate">{m.persona}</span>
                        {/* El chip va en la misma línea que la cuenta y el motivo: la frase sigue a su lado y se parte después. */}
                        <span className={`${SEGUNDA_LINEA} mt-1`}>
                          {que} {cuenta}
                          {m.motivo ? ` · «${m.motivo}»` : ""}
                        </span>
                        {anulacion && <span className={SEGUNDA_LINEA}>{anulacion}</span>}
                      </span>
                      <span className={`min-w-0 ${SOLO_ANCHA}`}>{que}</span>
                      <span className={celda("izq", `${SOLO_ANCHA} text-tinta/80`)}>
                        {cuenta}
                        {m.motivo && <span className="block truncate text-xs text-taupe">«{m.motivo}»</span>}
                        {anulacion && <span className="block truncate text-xs text-taupe">{anulacion}</span>}
                      </span>
                      <span className={`${CIFRA} ${anulado ? "text-tinta/45 line-through" : "font-medium text-tinta"}`}>{soles(m.monto)}</span>
                      <span className={ACCION}>{m.puedeAnular && <AnularMovimientoFondo movimiento={m} />}</span>
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
