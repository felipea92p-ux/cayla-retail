import { BarraApilada } from "@/components/ui/BarraApilada";
import { Chip } from "@/components/ui/Chip";
import { Encabezado, TABLA, celda, fila } from "@/components/ui/Tabla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { lecturaDeGrupo, PESO_DE_LA_INDUSTRIA, PESO_MAXIMO_DE_LA_VENTA, type FilaDelRiel, type FilaFueraDelRiel, type PropuestaMix } from "@/lib/mix-piso";
import { cifraEs, lineaDeVentas } from "@/lib/mix-piso-visual";
import { ROL_AYUDA, ROL_ETIQUETA } from "@/lib/plan-piso-grupos";
import { AvisoPorRevisar } from "@/components/plan-piso/AvisoPorRevisar";
import { Mancuerna } from "@/components/plan-piso/Mancuerna";
import { RielAEscala } from "@/components/plan-piso/RielAEscala";

// Plan del piso ▸ Propuesta (ADR-0329 + ADR-0328, actividad 12, primera entrega: solo lectura). Cuánto lugar le toca a cada grupo de
// prendas en el riel de la sede, frente a lo que cuelga hoy y a lo que dice la venta propia. Es una PROPUESTA: nada se guarda aquí
// (aprobarla y guardarla es la entrega siguiente), y el cálculo —el punto de partida de la industria, el peso de la venta propia, el
// reparto en prendas— vive en `lib/mix-piso.ts`, con su prueba.
//
// Una cifra que no se puede calcular se dice («sin ventas», «por cuadrar», «—»), nunca un 0: un 0 diría «no se vende» o «no cuelga nada»
// sin saberlo (ADR-0214: una cifra con poca muestra no es una cifra).

const PLANTILLA = "sm:grid-cols-[minmax(0,1.5fr)_7.5rem_6rem_9.5rem_8.5rem_6.5rem]";
const PLANTILLA_FUERA = "sm:grid-cols-[minmax(0,1.5fr)_7.5rem_9.5rem_9.5rem]";
const COLUMNAS = [
  { titulo: "Grupo" },
  { titulo: "Hoy", subtitulo: "prendas · % del riel", ayuda: "Lo que el sistema dice que cuelga en el piso hoy. Mientras la sede no cuadre su piso, no es confiable." },
  { titulo: "Industria", subtitulo: "% del riel", ayuda: "El punto de partida: el surtido de mujer de Topitop, Estilos y Oechsle puesto según el rol de cada grupo y el clima de la sede." },
  { titulo: "Venta propia", subtitulo: "% y rango", ayuda: "Lo que vendió la sede en los últimos días, solo con prenda confirmada. El rango dice entre cuánto y cuánto estaría la venta real el 95 % de las veces." },
  { titulo: "Propuesta", subtitulo: "prendas · %", ayuda: "La industria y la venta propia mezcladas según cuánto pesa cada una, repartidas en las prendas que caben en el riel." },
  { titulo: "Diferencia", subtitulo: "prendas", ayuda: "Propuesta menos lo que cuelga hoy: con signo más, faltan; con signo menos, sobran." },
];
const COLUMNAS_FUERA = [{ titulo: "Grupo" }, { titulo: "Cuelga hoy", subtitulo: "prendas" }, { titulo: "Venta propia", subtitulo: "% de la venta" }, { titulo: "Meta", subtitulo: "% de la venta" }];

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

function FilaGrupo({ f, cuadrado, capacidad }: { f: FilaDelRiel; cuadrado: boolean; capacidad: number | null }) {
  const sinPropuesta = f.propuestaPct === null;
  const lectura = lecturaDeGrupo(f, { cuadrado, capacidad });
  return (
    <div className={fila(PLANTILLA, "sm:items-center")}>
      <div className={celda("izq", "!whitespace-normal")}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-sm text-tinta">{f.grupo.nombre}</span>
          <span title={ROL_AYUDA[f.grupo.rol]}>
            <Chip tono="pizarra">{ROL_ETIQUETA[f.grupo.rol]}</Chip>
          </span>
        </div>
        {lectura && (
          <p className="mt-1 flex items-start gap-1.5 text-xs text-tinta/75">
            <span aria-hidden className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO_LECTURA[lectura.tono]}`} />
            <span>{lectura.texto}</span>
          </p>
        )}
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
          <span className="font-medium text-tinta">
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

function FilaFuera({ f }: { f: FilaFueraDelRiel }) {
  return (
    <div className={fila(PLANTILLA_FUERA, "sm:items-center")}>
      <div className={celda("izq", "flex flex-wrap items-center gap-x-2 gap-y-1")}>
        <span className="text-sm text-tinta">{f.grupo.nombre}</span>
        <span title={ROL_AYUDA[f.grupo.rol]}>
          <Chip tono="pizarra">{ROL_ETIQUETA[f.grupo.rol]}</Chip>
        </span>
      </div>
      <Dato etiqueta="Cuelga hoy">{n(f.colgadas)}</Dato>
      <Dato etiqueta="Venta propia">
        {f.ventaPct === null ? (
          <span className="text-taupe">sin ventas</span>
        ) : (
          <span>
            {pct(f.ventaPct)}
            <span className="ml-1.5 text-xs text-taupe">({f.ventasConfirmadas})</span>
          </span>
        )}
      </Dato>
      <Dato etiqueta="Meta">
        {f.noLoLleva ? <span className="text-taupe">no lo lleva</span> : f.meta ? `${f.meta.desde}–${f.meta.hasta} %` : "—"}
      </Dato>
    </div>
  );
}

/** El riel a escala de la propuesta: dos rieles con la misma capacidad (hoy y propuesta). Es una ayuda visual; las mismas cifras están en la tabla. */
function RielDeLaPropuesta({ p }: { p: PropuestaMix }) {
  if (p.motivoSinPropuesta || p.capacidad === null) return null;
  const grupos = p.enRiel.map((f) => ({ clave: f.grupo.clave, nombre: f.grupo.nombre, hoy: f.colgadas, propuesta: f.propuestaPrendas ?? 0 }));
  return (
    <section className="card-cayla anim-sube p-5" style={{ "--i": 2 } as React.CSSProperties} aria-label="El riel, hoy y como quedaría">
      <h2 className="font-display text-xl text-tinta">El riel, hoy y como quedaría</h2>
      <p className="mt-0.5 mb-4 max-w-2xl text-[13px] text-tinta/70">Las dos barras miden lo mismo: lo que cabe en el riel. Cada color es un grupo; pasa el cursor por uno para verlo en las dos.</p>
      <RielAEscala grupos={grupos} capacidad={p.capacidad} cuadrado={p.cuadrado} />
    </section>
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
  const hayVentas = p.ventasConfirmadasDelRiel > 0;
  const pesoPct = Math.round(p.pesoDeLaVenta * 100);
  const hayFuera = p.fueraDelRiel.length > 0;
  const sinGrupo = p.sinGrupo.colgadas > 0 || p.sinGrupo.ventasConfirmadas > 0;

  return (
    <div className="space-y-6">
      {p.motivoSinPropuesta && (
        <div className="card-cayla p-5" role="status">
          <p className="text-sm font-semibold text-tinta">No hay propuesta para esta sede.</p>
          <p className="mt-1 text-[13px] text-tinta/70">{p.motivoSinPropuesta}</p>
        </div>
      )}

      {/* Tres tarjetas, las tres con la misma forma (cifra, contexto, barra fina, una línea): qué tanto cuelga, qué tan firme es la venta y cuánto pesa en la
          propuesta. «Caben en el riel» ya no es una tarjeta: es el «de 1,800» de la primera, que es como se lee («78 de 1,800» dice lo que dos cifras sueltas no). */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* La línea y la barra van en `pie`: la pieza los pega al fondo, y como la barra es lo último, en las tres tarjetas queda a la misma altura aunque
            el texto de arriba (o la propia línea) ocupe uno o dos renglones. Las barras son decorativas: lo que dicen está escrito en la línea de arriba. */}
        <TarjetaCifra
          etiqueta="Cuelga hoy"
          valor={n(p.colgadasEnElRiel)}
          unidad={p.capacidad === null ? undefined : `de ${n(p.capacidad)}`}
          acento={!p.cuadrado}
          className="anim-sube"
          pie={
            <>
              <span className="block text-[11px]">
                {p.capacidad === null
                  ? "esta sede no tiene capacidad medida"
                  : capacidadProvisional
                    ? `caben ${n(p.capacidad)} · provisional: falta contarlas`
                    : `caben ${n(p.capacidad)} · m² × prendas por m²`}
              </span>
              {p.capacidad !== null && (
                <BarraApilada
                  decorativa
                  alto={4}
                  className="mt-1.5"
                  total={p.capacidad}
                  segmentos={[{ clave: "colgadas", nombre: "Cuelgan hoy", valor: p.colgadasEnElRiel, clase: "bg-tinta" }]}
                />
              )}
            </>
          }
        >
          {p.cuadrado ? "prendas en el riel, según el sistema" : "por cuadrar: lo real puede ser mucho más"}
        </TarjetaCifra>
        <TarjetaCifra
          etiqueta="Ventas confirmadas"
          valor={n(p.ventasConfirmadasDelRiel)}
          className="anim-sube"
          style={{ "--i": 1 } as React.CSSProperties}
          pie={
            <>
              <span className="block text-[11px]">{lineaDeVentas(p.ventasConfirmadasDelRiel, p.ventasAnotadasDelRiel)}</span>
              <BarraApilada
                decorativa
                alto={4}
                className="mt-1.5"
                segmentos={[
                  { clave: "confirmadas", nombre: "Confirmadas", valor: p.ventasConfirmadasDelRiel, clase: "bg-tinta" },
                  { clave: "sin-registrar", nombre: "Sin registrar", valor: p.ventasAnotadasDelRiel, clase: "bg-taupe/45" },
                ]}
              />
            </>
          }
        >
          en {p.dias} días
        </TarjetaCifra>
        <TarjetaCifra
          etiqueta="Peso de la venta"
          valor={`${pesoPct} %`}
          className="anim-sube"
          style={{ "--i": 2 } as React.CSSProperties}
          pie={
            <>
              <span className="block text-[11px]">industria {100 - pesoPct} % · venta propia {pesoPct} %</span>
              <BarraApilada
                decorativa
                alto={4}
                className="mt-1.5"
                segmentos={[
                  { clave: "industria", nombre: "Industria", valor: 100 - pesoPct, clase: "bg-taupe/45" },
                  { clave: "venta", nombre: "Venta propia", valor: pesoPct, clase: "bg-tinta" },
                ]}
              />
            </>
          }
        >
          {hayVentas ? "de la propuesta viene de lo que se vendió" : "todavía sin ventas confirmadas"}
        </TarjetaCifra>
      </div>

      {/* Las categorías cuyo grupo nadie confirmó: la propuesta usa el que el sistema les puso. El aviso lleva a la pestaña donde se confirman. */}
      <AvisoPorRevisar porRevisar={categoriasPorRevisar} sinGrupo={categoriasSinGrupo} esLider={esLider} />

      <RielDeLaPropuesta p={p} />
      <Mancuerna propuesta={p} />

      <section className="card-cayla overflow-hidden anim-sube" style={{ "--i": 2 } as React.CSSProperties} aria-label="Propuesta del mix en el riel">
        <div className="border-b border-sand px-5 py-4">
          <h2 className="font-display text-xl text-tinta">Lugar de cada grupo en el riel</h2>
          <p className="mt-0.5 max-w-2xl text-[13px] text-tinta/70">
            La propuesta mezcla el punto de partida de la industria con lo que vendió la sede. Aquí no se guarda nada: es para mirarla y compararla con lo que cuelga.
          </p>
        </div>
        <div className="divide-y divide-sand">
          <Encabezado columnas={COLUMNAS} plantilla={PLANTILLA} />
          {p.enRiel.map((f) => (
            <FilaGrupo key={f.grupo.clave} f={f} cuadrado={p.cuadrado} capacidad={p.capacidad} />
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
            <Dato etiqueta="Venta propia">{hayVentas ? `(${n(p.ventasConfirmadasDelRiel)})` : "—"}</Dato>
            <Dato etiqueta="Propuesta">{p.motivoSinPropuesta ? "—" : `${p.capacidad === null ? "" : `${n(p.capacidad)} · `}100 %`}</Dato>
            <Dato etiqueta="Diferencia">—</Dato>
          </div>
        </div>
        {!p.cuadrado && (
          <p className={`${TABLA.pie} border-t border-sand`} role="note">
            <Chip tono="ambar">Por cuadrar</Chip> <span className="ml-2">Esta sede todavía no cuadró su piso: «Hoy» y la diferencia salen apagados porque el sistema puede tener como guardadas prendas que ya cuelgan.</span>
          </p>
        )}
      </section>

      {hayFuera && (
        <section className="card-cayla overflow-hidden anim-sube" style={{ "--i": 3 } as React.CSSProperties} aria-label="Grupos fuera del riel">
          <div className="border-b border-sand px-5 py-4">
            <h2 className="font-display text-xl text-tinta">Fuera del riel</h2>
            <p className="mt-0.5 max-w-2xl text-[13px] text-tinta/70">
              Bisutería, cinturones, bolsos y calzado van junto a la caja, en repisa o en ganchos aparte: no ocupan percha del riel. Se miden como porcentaje de la venta, no del piso.
            </p>
          </div>
          <div className="divide-y divide-sand">
            <Encabezado columnas={COLUMNAS_FUERA} plantilla={PLANTILLA_FUERA} />
            {p.fueraDelRiel.map((f) => (
              <FilaFuera key={f.grupo.clave} f={f} />
            ))}
          </div>
        </section>
      )}

      <p className="nota-cayla">
        <strong>Cómo se calcula.</strong> La propuesta es la industria y la venta propia mezcladas: la venta pesa {pesoPct} % (tope {Math.round(PESO_MAXIMO_DE_LA_VENTA * 100)} %).
        Ese peso crece con las ventas confirmadas —{n(p.ventasConfirmadasDelRiel)} en {p.dias} días, que cuentan como {n(p.muestraEfectiva)} ventas independientes porque un cliente
        suele llevarse varias prendas— y la industria pesa como {PESO_DE_LA_INDUSTRIA}. Las ventas «sin registrar» llevan la categoría puesta a mano y no cuentan hasta
        regularizarlas. La venta nunca gobierna sola: un grupo vende más porque cuelga más, así que repetir lo que ya hay no es una razón para dejarlo igual.
        El rango de «Venta propia» dice cuánto puede moverse esa cifra solo por azar con tan pocas ventas: un grupo que no vendió nada puede estar en realidad en varios puntos más de lo que dice el cero.
      </p>
    </div>
  );
}
