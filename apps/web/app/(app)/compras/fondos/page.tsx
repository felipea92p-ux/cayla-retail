import { ArrowDownLeft, ArrowUpRight, HandCoins, Wallet, type LucideIcon } from "lucide-react";
import { exigirModulo } from "@/lib/persona-actual";
import { getDatosFondos } from "@/lib/fondos";
import { getPlataPorConfirmar } from "@/lib/mi-plata";
import { getRevisarCompras } from "@/lib/revisar-compras";
import { porRecibirDe } from "@/lib/revisar-compras-reglas";
import { BandejaRevisar } from "@/components/mi-plata/BandejaRevisar";
import {
  TEXTO_MOVIMIENTO_FONDO,
  VUELVE_A_CAYLA,
  cifrasDeFondos,
  movimientosPorDia,
  topeDevolucion,
  tramosDelFondo,
  type MovimientoFondo,
} from "@/lib/fondos-reglas";
import { diaCorto } from "@/lib/orden-pagina-reglas";
import { soles } from "@/lib/compras-reglas";
import { EncabezadoPagina } from "@/components/ui/EncabezadoPagina";
import { Tabla, Encabezado, fila, celda } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { TituloGrupo, TituloSeccion } from "@/components/ui/TituloSeccion";
import { Chip } from "@/components/ui/Chip";
import { AvatarPersona } from "@/components/ui/AvatarPersona";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { Vacio } from "@/components/ui/Vacio";
import { Aviso } from "@/components/ui/Aviso";
import { HojaDeFondos } from "@/components/fondos/HojaDeFondos";
import { AnularMovimientoFondo, DevolverFondo, EntregarFondo, PagarDeudaFondo } from "@/components/fondos/AccionesFondos";
import { RevisarRendicion } from "@/components/fondos/RevisarRendicion";
import { estadoPorFondo } from "@/lib/rendicion-reglas";
import { deudasPorPersona } from "@/lib/deuda-fondo-reglas";
import { diaYHoraLima } from "@/lib/fechas-lima";

// Rediseño (maqueta docs/maquetas/compras-formidable-2026-10/, Felipe 2026-10-23): la pantalla es la BANDEJA de lo que anotaron las
// compradoras (cuatro cifras que filtran, la lista y su detalle al lado: <BandejaRevisar>) y, si las hay, las rendiciones por aprobar: lo que
// espera a Compras. «Quién tiene plata» (las cifras de toda la empresa y la fila de cada persona) y «Entregas y devoluciones» se abren en
// una hoja desde su botón de la cabecera (`HojaDeFondos`; Felipe, el mismo día: «para no cargar mucho la pantalla principal»).
//
// Compras ▸ Revisar compras (antes «Fondos por rendir»; ADR-0480 le cambia el nombre y la pantalla en la actividad 2, y en la 7 le suma las
// compras por completar y los cierres del día; ADR-0362, fase 6 · actividad 1; decisiones 26, 29, 30, 34, 35 y 65): la plata que CAYLA le entrega a
// quien compra, y cuánto tiene cada persona en la mano. Es el control contra el fraude que pidió Felipe: al final tiene que verse cuánto
// le queda a cada una.
//
// Cabecera de Compras (`EncabezadoPagina`, como Órdenes de compra) con «+ Entregar plata». En la hoja «Quién tiene plata», las cifras de
// toda la empresa y una fila por persona con fondo (su barra: gastó · devolvió · tiene, sobre lo que le entregaron) y su «Registrar
// devolución»; en «Entregas y devoluciones», cada movimiento por día, con su «Anular». Un fondo en negativo es lo que CAYLA le debe a quien
// pagó de su bolsillo (decisión 32): no resta de «En la mano», tiene su propia cifra y su fila lo dice.
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

// La tabla de las rendiciones decide su forma por el ancho de SU tarjeta (`@container` en <Tabla>, como Órdenes de compra y Clientes), no
// por el de la ventana: con el lateral abierto la tarjeta mide ~370 px menos que la ventana (2026-10-14). Cambia en dos cortes:
//   · desde 60 rem de tarjeta, todas las columnas;
//   · desde 36 rem, lo que explica la cifra baja a la segunda línea de la persona (debería tener · dice que tiene) y quedan la persona,
//     cómo quedó y la acción;
//   · más angosta (celular, o una ventana chica con el lateral), cada fila apila sus datos.
// Las dos hojas de fondos ya no son tablas (diseño A, 2026-10-23): sus listas deciden su forma por el ancho de la hoja, también con @container.
const PLANTILLA_RENDICIONES =
  "@min-[36rem]:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_7rem] @min-[60rem]:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_minmax(0,0.8fr)_7rem]";
// Los títulos, solo con la tabla en columnas (desde 36 rem): apilada, cada dato lleva su propio rótulo.
const TITULOS_DESDE = "hidden @min-[36rem]:grid";
// Una celda que solo es columna propia en la tabla ancha.
const SOLO_ANCHA = "hidden @min-[60rem]:block";
// Lo que en una tabla menos ancha va en la segunda línea de la primera celda (que puede partirse).
const SEGUNDA_LINEA = "block whitespace-normal text-xs text-taupe @min-[60rem]:hidden";
// La acción de la fila: al borde derecho cuando hay columnas; apilada, bajo lo demás.
const ACCION = "flex min-w-0 justify-start @min-[36rem]:justify-end";

// Los tres tramos de la barra de cada persona en «Quién tiene plata», con el color de su leyenda (diseño A, 2026-10-23).
const TRAMOS_FONDO = [
  { clave: "gasto", nombre: "Gastó", clase: "bg-pizarra" },
  { clave: "devolvio", nombre: "Devolvió", clase: "bg-taupe" },
  { clave: "tiene", nombre: "Tiene", clase: "bg-tinta" },
] as const;
// El ícono de cada movimiento en «Entregas y devoluciones»: la plata que sale, la que vuelve y la que paga una deuda.
const ICONO_MOVIMIENTO: Record<MovimientoFondo["tipo"], LucideIcon> = {
  entrega_fondo: ArrowUpRight,
  devolucion_fondo: ArrowDownLeft,
  pago_deuda_fondo: HandCoins,
};
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
  const conDeuda = cifras.teDebe > 0;
  // Lo que tiene en la mano cada persona con fondo: la ficha de «¿A quién?» lo dice al entregar.
  const tienePorPersona = Object.fromEntries(fondos.map((f) => [f.personaId, Math.max(f.saldo, 0)]));
  const entregar = <EntregarFondo opciones={opciones} tiene={tienePorPersona} />;
  const tituloMovimientos = conPagos ? "Entregas, devoluciones y pagos de deuda" : "Entregas y devoluciones";

  // Lo que se abre desde la cabecera (`HojaDeFondos`), con el diseño «A · Bandeja serena» que eligió Felipe mirando capturas el 2026-10-23
  // («sin tanto texto»). Sin fondos, el vacío con «Entregar plata». Con fondos, «Quién tiene plata»: las cifras de toda la empresa —la
  // primera, lo que tienen en la mano, destacada— y una fila por persona en vez de la tabla: su cara, lo que le entregaron, una barra
  // fina sobre eso (gastó · devolvió · tiene) y, a la derecha, lo que tiene en la mano y su acción. Lo que la tabla decía en columnas o
  // en letra chica va en chips bajo el nombre: rindió y espera (con lo que dice tener), lo que debe por un faltante, lo que CAYLA le debe.
  // La lista decide su forma por el ancho de la hoja (@container): angosta, la acción baja a su propia fila.
  const quienTiene =
    fondos.length === 0 ? (
      <div className="card-cayla" data-guia="fondos.vacio">
        <Vacio icono={<Wallet />} titulo="Nadie tiene un fondo todavía" acciones={entregar}>
          Aquí vas a ver cuánto tiene cada persona en la mano.
        </Vacio>
      </div>
    ) : (
      <>
        <div className="@container" data-guia="fondos.cifras">
          <div className={`grid grid-cols-2 gap-3 ${conDeuda ? "@min-[40rem]:grid-cols-4" : "@min-[36rem]:grid-cols-3"}`}>
            {/* La destacada: el fondo arena es su marca (no filtra: es la cifra que importa, como en la captura). */}
            <TarjetaCifra
              etiqueta="En la mano"
              valor={soles(cifras.enMano)}
              className={`bg-sand/40 ${conDeuda ? "" : "col-span-2 @min-[36rem]:col-span-1"}`}
            >
              {cifras.conPlata === 0 ? "Nadie tiene plata" : cifras.conPlata === 1 ? "Una persona" : `Entre ${cifras.conPlata} personas`}
            </TarjetaCifra>
            {conDeuda && (
              <TarjetaCifra etiqueta="CAYLA les debe" valor={soles(cifras.teDebe)}>
                {plural(cifras.conDeuda, "pagó de su bolsillo", "pagaron de su bolsillo")}
              </TarjetaCifra>
            )}
            <TarjetaCifra etiqueta="Entregado" valor={soles(cifras.entregado)} />
            <TarjetaCifra etiqueta="Devolvieron" valor={soles(cifras.devuelto)} />
          </div>
        </div>
        <section className="space-y-1">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <TituloGrupo cuenta={fondos.length} className="min-w-0 flex-1">
              Por persona
            </TituloGrupo>
            {/* La leyenda de las barras; cada barra dice lo suyo al lector (su `etiqueta`), así que esta solo se ve. */}
            <span aria-hidden className="flex items-center gap-3 text-xs text-taupe">
              {TRAMOS_FONDO.map((t) => (
                <span key={t.clave} className="inline-flex items-center gap-1.5">
                  <MuestraTramo clase={t.clase} />
                  {t.nombre}
                </span>
              ))}
            </span>
          </div>
          <ul data-guia="fondos.lista" className="@container divide-y divide-sand">
            {fondos.map((f) => {
              const t = tramosDelFondo(f);
              const rinde = estado.get(f.cuentaId)?.porAprobar;
              const suDeuda = debe(f.personaId);
              const leDeben = f.saldo < -0.005;
              // Cerró su ronda y devuelve lo que le sobró: Compras todavía no lo recibe (20261023210000). Lo que le debemos ya lo dice `leDeben`.
              const porRecibir = porRecibirDe(revisar?.cierres ?? [], f.personaId);
              const devuelve = porRecibir?.decision === "devuelve" ? porRecibir.monto : 0;
              return (
                <li
                  key={f.cuentaId}
                  className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 py-4 @min-[36rem]:grid-cols-[2.5rem_minmax(0,1fr)_9rem_12.5rem]"
                >
                  <AvatarPersona personaId={f.personaId} nombre={f.persona} tamano={40} />
                  <div className="min-w-0 space-y-1.5">
                    <p className="flex items-baseline justify-between gap-3">
                      <span className="truncate font-medium text-tinta" title={f.sede ?? undefined}>
                        {f.persona}
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-xs text-taupe">de {soles(f.entregado)}</span>
                    </p>
                    <BarraApilada
                      alto={4}
                      sinEntrada
                      formato={soles}
                      unidad="entregados"
                      total={t.total}
                      etiqueta={`${f.persona}: gastó ${soles(t.gasto)}, devolvió ${soles(t.devolvio)} y tiene ${soles(t.tiene)} de ${soles(f.entregado)} entregados`}
                      segmentos={TRAMOS_FONDO.map((x) => ({ clave: x.clave, nombre: x.nombre, clase: x.clase, valor: t[x.clave] }))}
                    />
                    {(rinde || suDeuda > 0.005 || leDeben || devuelve > 0) && (
                      <p className="flex flex-wrap gap-1.5 pt-0.5">
                        {/* Con su rendición por aprobar, lo que ella dijo tener, al lado de lo de los libros (/formidable 2026-10-14, cambio 3). */}
                        {rinde && (
                          <Chip tono="pizarra" title="Su rendición espera aprobación">
                            Rindió: dice {soles(rinde.efectivo)}
                          </Chip>
                        )}
                        {suDeuda > 0.005 && <Chip tono="ambar">Debe {soles(suDeuda)}</Chip>}
                        {devuelve > 0 && (
                          <Chip tono="ambar" title="Cerró su ronda: recíbelo en la bandeja, en Rondas">
                            {soles(devuelve)} por recibir
                          </Chip>
                        )}
                        {/* Pagó de su bolsillo (decisión 32): el negativo no es plata en la mano, es lo que CAYLA le debe. */}
                        {leDeben && (
                          <Chip tono="ambar">
                            {f.esMio ? "CAYLA te debe" : "CAYLA le debe"} {soles(-f.saldo)}
                          </Chip>
                        )}
                      </p>
                    )}
                  </div>
                  <p className="text-right">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.13em] text-taupe">Tiene</span>
                    <span className={`font-display block whitespace-nowrap text-[26px] leading-tight tabular-nums ${t.tiene > 0.005 ? "text-tinta" : "text-taupe"}`}>
                      {soles(t.tiene)}
                    </span>
                  </p>
                  <div className="col-span-full flex flex-wrap justify-end gap-2 @min-[36rem]:col-span-1">
                    {f.esMio ? (
                      <span className="text-right text-xs text-taupe">Tu fondo: lo mueve otra persona</span>
                    ) : (
                      <>
                        {/* Con su rendición por aprobar, lo que tiene en la mano es el saldo menos su faltante (Felipe 2026-10-14). */}
                        {topeDevolucion(f.saldo, rinde?.faltante).monto > 0.005 && (
                          <DevolverFondo fondo={f} cuentas={opciones.cuentas} porAprobar={rinde?.faltante ?? 0} />
                        )}
                        {suDeuda > 0.005 && <PagarDeudaFondo deuda={deudas.get(f.personaId)!} cuentas={opciones.cuentas} />}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </>
    );
  // «Entregas y devoluciones» (diseño A, 2026-10-23): en vez de la tabla, la lista agrupada por día. Cada movimiento con su ícono (la
  // flecha que sale es una entrega; la que entra, en verde, una devolución; las monedas, el pago de una deuda), la persona, de dónde salió
  // o a dónde volvió, y el monto en serif (lo que vuelve a CAYLA, con «+» y en verde). Lo anulado queda tachado con su chip «Anulada» y,
  // en la línea de abajo, quién y por qué.
  const entregasYDevoluciones = (
    <div data-guia="fondos.movimientos" className="@container space-y-4">
      {movimientosPorDia(movimientos).map((g, i) => (
        <section key={g.dia}>
          <TituloGrupo retraso={120 + Math.min(i, 6) * 60}>{diaCorto(g.dia)}</TituloGrupo>
          <ul className="divide-y divide-sand/60">
            {g.movimientos.map((m) => {
              const anulado = m.estado === "anulado";
              const vuelve = VUELVE_A_CAYLA[m.tipo];
              const Icono = ICONO_MOVIMIENTO[m.tipo];
              const genero = m.tipo === "pago_deuda_fondo" ? "o" : "a";
              const linea = [
                m.tipo === "pago_deuda_fondo" ? "Pagó su deuda" : null,
                `${m.tipo === "entrega_fondo" ? "De" : "A"} ${m.cuenta}`,
                m.motivo,
                anulado ? `Anulad${genero}${m.anuladoPor ? ` por ${m.anuladoPor}` : ""}${m.motivoAnulacion ? `: ${m.motivoAnulacion}` : ""}` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li
                  key={m.id}
                  className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-3.5 gap-y-2 py-3 @min-[32rem]:grid-cols-[2.25rem_minmax(0,1fr)_auto_7rem]"
                >
                  <span
                    aria-hidden
                    className={`grid h-9 w-9 place-items-center rounded-full ${
                      anulado ? "border border-dashed border-taupe/40 text-taupe" : vuelve ? "bg-verde/10 text-verde" : "bg-sand/60 text-tinta"
                    }`}
                  >
                    <Icono className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className={`truncate font-medium ${anulado ? "text-taupe line-through" : "text-tinta"}`}>
                      {m.persona}
                      <span className="sr-only"> · {TEXTO_MOVIMIENTO_FONDO[m.tipo]}</span>
                    </p>
                    <p className="truncate text-xs text-taupe" title={linea}>
                      {linea}
                    </p>
                  </div>
                  <p
                    className={`font-display whitespace-nowrap text-right text-xl leading-tight tabular-nums ${
                      anulado ? "text-taupe line-through" : vuelve ? "text-verde" : "text-tinta"
                    }`}
                  >
                    {vuelve ? "+ " : ""}
                    {soles(m.monto)}
                  </p>
                  <div className="col-span-full flex justify-end @min-[32rem]:col-span-1">
                    {anulado ? (
                      <Chip tono="apagado" tachado={false}>
                        Anulad{genero}
                      </Chip>
                    ) : (
                      m.puedeAnular && <AnularMovimientoFondo movimiento={m} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
  const acciones = (
    <>
      <HojaDeFondos
        texto="Quién tiene plata"
        titulo="Quién tiene plata"
        subtitulo="Lo que cada persona lleva encima."
        guia="fondos.quien-tiene"
      >
        {quienTiene}
      </HojaDeFondos>
      {movimientos.length > 0 && (
        <HojaDeFondos
          texto="Entregas y devoluciones"
          titulo={tituloMovimientos}
          subtitulo="Toda la plata que salió y volvió."
          guia="fondos.entregas"
        >
          {entregasYDevoluciones}
        </HojaDeFondos>
      )}
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
          rondasAbiertas={revisar?.rondasAbiertas ?? []}
        />
      )}

      {falla ? (
        <Aviso tono="error" titulo="No se pudieron leer los fondos">
          {falla}
        </Aviso>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
