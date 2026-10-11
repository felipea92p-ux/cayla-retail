import { Chip } from "@/components/ui/Chip";
import { Encabezado, TABLA, celda, fila } from "@/components/ui/Tabla";
import { lecturaDeGrupo, type FilaDelRiel, type PropuestaMix } from "@/lib/mix-piso";
import { cifraEs } from "@/lib/mix-piso-visual";
import {
  ariaDeHoy,
  ariaDeLaPropuesta,
  armarRieles,
  bloqueLibre,
  etiquetaDeCifra,
  fraseDeEstado,
  lineaDeFicha,
  nombreCorto,
  notaDeEscala,
  panelDelPorQue,
  subtituloDeHoy,
  subtituloDeLaPropuesta,
  textoDelPorQue,
} from "@/lib/plan-piso-percha";
import { ROL_AYUDA, ROL_ETIQUETA } from "@/lib/plan-piso-grupos";
import { AvisoPorRevisar } from "@/components/plan-piso/AvisoPorRevisar";
import { estiloDeGrupo, IconoDeGrupo } from "@/components/plan-piso/IconoDeGrupo";
import { Mancuerna } from "@/components/plan-piso/Mancuerna";
import { SiluetasDelPlan } from "@/components/plan-piso/SiluetasDelPlan";
import { TarjetaDelRiel, type GrupoDelRiel } from "@/components/plan-piso/TarjetaDelRiel";

// Plan del piso ▸ Propuesta (ADR-0329 + ADR-0328, actividad 12; solo lectura). Cuánto lugar le toca a cada grupo de prendas en el riel de la sede, frente a lo que cuelga hoy
// y a lo que dice la venta propia. Es una PROPUESTA: nada se guarda aquí, y el cálculo —el punto de partida de la industria, el peso de la venta propia, el reparto en
// prendas— vive en `lib/mix-piso.ts`, con su prueba.
//
// El diseño es el de la maqueta A «La percha» (Felipe, 2026-10-11; docs/maquetas/plan-del-piso-2026-10/): una tarjeta con el estado («78 de 1,800 prendas»), el riel de
// perchas de hoy y el de cómo quedaría, el aviso de las categorías por revisar, y debajo lo que no cuelga del riel y el detalle grupo por grupo (la mancuerna y la
// tabla, con los mismos íconos y colores). Las frases y los tramos salen de `lib/plan-piso-percha.ts` (con su prueba): aquí solo se arman y se dibujan.
//
// Una cifra que no se puede calcular se dice («sin ventas», «por cuadrar», «—»), nunca un 0: un 0 diría «no se vende» o «no cuelga nada» sin saberlo (ADR-0214).
// Y mientras la sede no cuadró su piso, lo que cuelga es lo que el sistema CREE: se dice en condicional, nunca como un hecho (Formidable 2026-10-10).

const PLANTILLA = "sm:grid-cols-[minmax(0,1.5fr)_7.5rem_6rem_9.5rem_8.5rem_6.5rem]";
const COLUMNAS = [
  { titulo: "Grupo" },
  { titulo: "Hoy", subtitulo: "prendas · % del riel", ayuda: "Lo que el sistema dice que cuelga en el piso hoy. Mientras la sede no cuadre su piso, no es confiable." },
  { titulo: "Industria", subtitulo: "% del riel", ayuda: "El punto de partida: el surtido de mujer de Topitop, Estilos y Oechsle puesto según el rol de cada grupo y el clima de la sede." },
  { titulo: "Venta propia", subtitulo: "% y rango", ayuda: "Lo que vendió la sede en los últimos días, solo con prenda confirmada. El rango dice entre cuánto y cuánto estaría la venta real el 95 % de las veces." },
  { titulo: "Propuesta", subtitulo: "prendas · %", ayuda: "La industria y la venta propia mezcladas según cuánto pesa cada una, repartidas en las prendas que caben en el riel." },
  { titulo: "Diferencia", subtitulo: "prendas", ayuda: "Propuesta menos lo que cuelga hoy: con signo más, faltan; con signo menos, sobran." },
];

const n = cifraEs;
const pct = (x: number) => `${n(x)} %`;

/** Una celda con su etiqueta, que solo se ve en el celular (donde la fila se apila y el encabezado desaparece). */
function Dato({ etiqueta, children, apagado = false }: { etiqueta: string; children: React.ReactNode; apagado?: boolean }) {
  return (
    <div className={celda("der", apagado ? "text-taupe" : "")}>
      <span className="mr-2 text-xs text-taupe sm:hidden">{etiqueta}</span>
      {children}
    </div>
  );
}

/** El punto de color de la lectura: los mismos estados que `Chip` (verde = al día, ámbar = hay algo por hacer, pizarra = informativo), sin rojo. */
const PUNTO_LECTURA = { verde: "bg-verde", ambar: "bg-ambar", pizarra: "bg-pizarra" } as const;

function FilaGrupo({ f, indice, cuadrado, capacidad }: { f: FilaDelRiel; indice: number; cuadrado: boolean; capacidad: number | null }) {
  const sinPropuesta = f.propuestaPct === null;
  const lectura = lecturaDeGrupo(f, { cuadrado, capacidad });
  return (
    <div className={fila(PLANTILLA, "sm:items-center")}>
      <div className={celda("izq", "!whitespace-normal")}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 shrink-0" style={estiloDeGrupo(indice)}>
            <IconoDeGrupo clave={f.grupo.clave} className="pp-ic-fila" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-sm text-tinta">{f.grupo.nombre}</span>
              <span title={ROL_AYUDA[f.grupo.rol]}>
                <Chip tono="pizarra">{ROL_ETIQUETA[f.grupo.rol]}</Chip>
              </span>
            </div>
            {/* Sin cuadrar, la lectura es la MISMA frase en las seis filas («Por cuadrar: sin saber lo que cuelga…») y la nota al pie de la tabla ya la dice una vez: solo se repite
                por fila cuando dice algo distinto en cada una (la sede cuadrada: «Faltan 12», «Dentro de lo esperado»). */}
            {lectura && cuadrado && (
              <p className="mt-1 flex items-start gap-1.5 text-xs text-tinta/75">
                <span aria-hidden className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO_LECTURA[lectura.tono]}`} />
                <span>{lectura.texto}</span>
              </p>
            )}
          </div>
        </div>
      </div>
      <Dato etiqueta="Hoy" apagado={!cuadrado}>
        <span title={cuadrado ? undefined : "Por cuadrar: lo que cuelga de verdad puede ser muy distinto de lo que dice el sistema."}>
          {n(f.colgadas)} · {f.hoyPct === null ? "—" : pct(f.hoyPct)}
        </span>
      </Dato>
      <Dato etiqueta="Industria">{f.partidaPct === null ? "—" : pct(f.partidaPct)}</Dato>
      <Dato etiqueta="Venta propia">
        {f.ventaPct === null ? (
          <span className="text-taupe">sin ventas</span>
        ) : (
          <span>
            {pct(f.ventaPct)}
            <span className="block text-xs text-taupe">
              {f.rangoDeVenta !== null && `entre ${n(f.rangoDeVenta.desde)} y ${n(f.rangoDeVenta.hasta)} · `}
              {f.ventasConfirmadas} {f.ventasConfirmadas === 1 ? "venta" : "ventas"}
            </span>
          </span>
        )}
      </Dato>
      <Dato etiqueta="Propuesta">
        {sinPropuesta ? (
          "—"
        ) : (
          <span className="font-display text-[17px] leading-tight text-tinta">
            {f.propuestaPrendas === null ? "" : `${n(f.propuestaPrendas)} · `}
            {pct(f.propuestaPct as number)}
          </span>
        )}
      </Dato>
      <Dato etiqueta="Diferencia" apagado={!cuadrado}>
        {f.diferencia === null || !cuadrado ? (
          <span title={cuadrado ? undefined : "Por cuadrar: sin saber lo que cuelga de verdad, la diferencia no dice nada."}>—</span>
        ) : f.diferencia === 0 ? (
          "0"
        ) : (
          <span title={f.diferencia > 0 ? "Faltan" : "Sobran"}>
            {f.diferencia > 0 ? "+" : "−"}
            {n(Math.abs(f.diferencia))}
          </span>
        )}
      </Dato>
    </div>
  );
}

export function PropuestaDelMix({
  propuesta: p,
  capacidadProvisional,
  categoriasPorRevisar,
  categoriasSinGrupo = 0,
  esLider = false,
}: {
  propuesta: PropuestaMix;
  capacidadProvisional: boolean;
  /** Categorías con un grupo propuesto que nadie confirmó (la propuesta SÍ lo usa) y categorías nuevas sin grupo (NO entran al reparto): el aviso las separa. */
  categoriasPorRevisar: number;
  categoriasSinGrupo?: number;
  esLider?: boolean;
}) {
  const sinGrupo = p.sinGrupo.colgadas > 0 || p.sinGrupo.ventasConfirmadas > 0;
  const hayFuera = p.fueraDelRiel.length > 0;
  // Sin propuesta para la sede (no es una de las tres tiendas, no tiene piso de venta) no hay riel que dibujar: la nota de arriba dice por qué.
  const dibujaTarjeta = !p.motivoSinPropuesta;
  const capacidad = p.capacidad;
  const frase = capacidad === null ? null : fraseDeEstado({ colgadas: p.colgadasEnElRiel, capacidad, cuadrado: p.cuadrado });

  let riel: React.ReactNode = null;
  if (capacidad !== null && dibujaTarjeta) {
    const base = p.enRiel.map((f) => ({ clave: f.grupo.clave, nombre: f.grupo.nombre, hoy: f.colgadas, propuesta: f.propuestaPrendas ?? 0 }));
    const rieles = armarRieles(base, capacidad);
    const grupos: GrupoDelRiel[] = p.enRiel.map((f, indice) => ({
      clave: f.grupo.clave,
      nombre: f.grupo.nombre,
      corto: nombreCorto(f.grupo.nombre),
      indice,
      hoy: f.colgadas,
      propuesta: f.propuestaPrendas ?? 0,
      propuestaPct: f.propuestaPct,
    }));
    const repartidas = grupos.reduce((s, g) => s + g.propuesta, 0);
    const pesoPct = Math.round(p.pesoDeLaVenta * 100);
    const nota = notaDeEscala(rieles.unidad);
    riel = (
      <TarjetaDelRiel
        grupos={grupos}
        hoy={rieles.hoy}
        propuesta={rieles.propuesta}
        escala={rieles.escala}
        libre={bloqueLibre({ capacidad, colgadas: p.colgadasEnElRiel, cuadrado: p.cuadrado })}
        subHoy={subtituloDeHoy({ colgadas: p.colgadasEnElRiel, capacidad, cuadrado: p.cuadrado })}
        subPropuesta={subtituloDeLaPropuesta(repartidas, capacidadProvisional)}
        ariaHoy={ariaDeHoy({ colgadas: p.colgadasEnElRiel, capacidad, cuadrado: p.cuadrado })}
        ariaPropuesta={ariaDeLaPropuesta(grupos, capacidad)}
        textoPorQue={textoDelPorQue({ ventasConfirmadas: p.ventasConfirmadasDelRiel, pesoPct })}
        panel={panelDelPorQue(p, capacidadProvisional)}
        nota={nota}
      />
    );
  }

  return (
    <div className="space-y-6">
      {p.motivoSinPropuesta && (
        <div className="card-cayla p-5" role="status">
          <p className="text-sm font-semibold text-tinta">No hay propuesta para esta sede.</p>
          <p className="mt-1 text-[13px] text-tinta/70">{p.motivoSinPropuesta}</p>
        </div>
      )}

      {dibujaTarjeta && (
        <div className="pp-raiz">
          <SiluetasDelPlan />
          <section className="pp-card" aria-label="El riel de la tienda">
            <header className="pp-estado">
              <div className="pp-est-cifra">
                <span className="pp-etq">{etiquetaDeCifra(p.cuadrado)}</span>
                <div className="pp-est-n">
                  <b>{n(p.colgadasEnElRiel)}</b>
                  <span>{capacidad === null ? "prendas" : `de ${n(capacidad)} prendas`}</span>
                </div>
              </div>
              <div className="pp-est-texto">
                <div className="pp-est-chips">
                  {!p.cuadrado && <Chip tono="ambar">Por cuadrar</Chip>}
                  {capacidad !== null && capacidadProvisional && <Chip tono="pizarra">Capacidad provisional</Chip>}
                </div>
                {frase ? (
                  <p>
                    {frase.antes}
                    <b>{frase.destacado}</b>
                    {frase.despues}
                    {frase.aclaracion && (
                      <>
                        {" "}
                        <em>{frase.aclaracion}</em>
                      </>
                    )}
                  </p>
                ) : (
                  <p>
                    Esta sede todavía no tiene medida la capacidad de su riel. <em>Sin ella no se puede dibujar cómo se repartiría.</em>
                  </p>
                )}
              </div>
            </header>
            {riel}
            <AvisoPorRevisar porRevisar={categoriasPorRevisar} sinGrupo={categoriasSinGrupo} esLider={esLider} />
          </section>

          {hayFuera && (
            <section className="pp-fuera" aria-label="Fuera del riel">
              <div className="pp-fuera-cab">
                <span className="pp-etq">Fuera del riel</span>
                <span>No entran en el reparto.{p.cuadrado ? "" : " Cifras según el sistema."}</span>
              </div>
              <ul className="pp-fichas">
                {p.fueraDelRiel.map((f) => (
                  <li key={f.grupo.clave} className="pp-ficha">
                    <IconoDeGrupo clave={f.grupo.clave} />
                    <div>
                      <b>{f.grupo.nombre}</b>
                      <span>{lineaDeFicha(f)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <div className="pp-raiz">
        <SiluetasDelPlan />
        <div className="pp-fuera-cab">
          <span className="pp-etq">El detalle, grupo por grupo</span>
          <span>{dibujaTarjeta ? "De dónde sale cada cifra de arriba." : "Lo que cuelga hoy en cada grupo."}</span>
        </div>
      </div>

      <Mancuerna propuesta={p} />

      <section className="card-cayla overflow-hidden anim-sube" style={{ "--i": 2 } as React.CSSProperties} aria-label="Propuesta del mix en el riel">
        <div className="border-b border-sand px-5 py-4">
          <h2 className="font-display text-xl text-tinta">Lugar de cada grupo en el riel</h2>
          <p className="mt-0.5 max-w-2xl text-[13px] text-tinta/70">
            La propuesta mezcla el punto de partida de la industria con lo que vendió la sede. Aquí no se guarda nada: es para mirarla y compararla con lo que cuelga.
          </p>
        </div>
        {/* La tabla se desplaza dentro de su tarjeta (como `Tabla`, ADR-0169) y tiene un ancho mínimo: las columnas fijas suman 38 rem y con las separaciones (5 × 1 rem) y el
            relleno de la fila (2 × 1.25 rem) son 45.5 rem; el mínimo de 56 rem le deja 10.5 rem a «Grupo». Sin él, una tarjeta angosta (1024 px con el menú abierto: 657 px) dejaba
            a «Grupo» en 0 px y a «Diferencia» fuera de la tarjeta. Desde 1280 px cabe sin desplazarse. Bajo `sm` las filas se apilan y no hay mínimo. */}
        <div className="scroll-cayla overflow-x-auto">
          <div className="divide-y divide-sand sm:min-w-[56rem]">
            <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} />
            {p.enRiel.map((f, indice) => (
              <FilaGrupo key={f.grupo.clave} f={f} indice={indice} cuadrado={p.cuadrado} capacidad={p.capacidad} />
            ))}
            {sinGrupo && (
              <div className={fila(PLANTILLA, "sm:items-center bg-hueso/60")}>
                <div className={celda("izq", "text-sm text-tinta")}>
                  Sin grupo
                  <span className="ml-2 text-xs text-taupe">
                    {p.sinGrupo.categorias} {p.sinGrupo.categorias === 1 ? "categoría" : "categorías"}: no entra al reparto
                  </span>
                </div>
                <Dato etiqueta="Hoy" apagado>
                  {n(p.sinGrupo.colgadas)}
                </Dato>
                <Dato etiqueta="Industria">—</Dato>
                <Dato etiqueta="Venta propia">{p.sinGrupo.ventasConfirmadas > 0 ? `(${p.sinGrupo.ventasConfirmadas})` : "—"}</Dato>
                <Dato etiqueta="Propuesta">—</Dato>
                <Dato etiqueta="Diferencia">—</Dato>
              </div>
            )}
            <div className={fila(PLANTILLA, "sm:items-center font-medium")}>
              <div className={celda("izq", "text-sm text-tinta")}>Total del riel</div>
              <Dato etiqueta="Hoy" apagado={!p.cuadrado}>
                {n(p.colgadasEnElRiel)}
              </Dato>
              <Dato etiqueta="Industria">{p.motivoSinPropuesta ? "—" : "100 %"}</Dato>
              <Dato etiqueta="Venta propia">{p.ventasConfirmadasDelRiel > 0 ? `(${n(p.ventasConfirmadasDelRiel)})` : "—"}</Dato>
              <Dato etiqueta="Propuesta">{p.motivoSinPropuesta ? "—" : `${p.capacidad === null ? "" : `${n(p.capacidad)} · `}100 %`}</Dato>
              <Dato etiqueta="Diferencia">—</Dato>
            </div>
          </div>
        </div>
        {!p.cuadrado && (
          <p className={`${TABLA.pie} border-t border-sand`} role="note">
            <Chip tono="ambar">Por cuadrar</Chip> <span className="ml-2">Esta sede todavía no cuadró su piso: «Hoy» y la diferencia salen apagados porque el sistema puede tener como guardadas prendas que ya cuelgan.</span>
          </p>
        )}
      </section>
    </div>
  );
}
