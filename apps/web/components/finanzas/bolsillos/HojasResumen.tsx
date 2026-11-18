"use client";

import { ArrowRight } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { Modal } from "@/components/ui/Modal";
import { Volver } from "@/components/ui/Volver";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { BarraApilada, MuestraTramo } from "@/components/ui/BarraApilada";
import { BarrasTiempo } from "@/components/ui/BarrasTiempo";
import { Linea } from "@/components/ui/Linea";
import type { PuntoCaja } from "@/lib/caja-proxima-reglas";
import type { EquilibrioMes } from "@/lib/equilibrio-mes-reglas";
import type { SedeTelar } from "@/lib/finanzas-telar-reglas";
import { Chip } from "@/components/ui/Chip";
import { CifraAnimada } from "@/components/ui/CifraAnimada";
import { letraEstados } from "@/lib/letra-estados";
import { COLOR_LIBRE, cuentaDeLibre, type SaldoBolsillos } from "@/lib/bolsillos-reglas";
import { fechaEnPalabras } from "@/lib/caja-proxima-reglas";
import { soles } from "@/lib/flujo-caja-reglas";
import { colorDeSede, cuentaDelMes, deCadaCien, gastosDelMes, hojaVecina, rotuloDeVentas, rubrosEnBarra, ventasPorTienda, type ClaveHoja, type Renglon, type TramoHoja } from "@/lib/hojas-resumen-reglas";
import { cuandoSale, type Proximos } from "@/lib/proximos-reglas";
import type { FilaER } from "@/lib/resultados-reglas";
import type { TeDejaMes } from "@/lib/te-deja-mes-reglas";
import type { SedeConValor } from "@/lib/valor-inventario-reglas";

// Finanzas ▸ Resumen, camino «A · Bolsillos»: las hojas de detalle (Felipe 2026-11-09, «También las hojas»). Cada cifra grande abre la suya con la cuenta
// renglón por renglón; abajo, la flecha vuelve a la hoja de antes y «Siguiente» pasa a la que sigue, sin salir del Resumen. Solo se leen: la ✕ las cierra
// y cada una termina en la pantalla que lo resuelve. Las cuentas las arman `hojas-resumen-reglas`, `bolsillos-reglas` y `proximos-reglas`.

const NOMBRE: Record<ClaveHoja, string> = {
  plata: "Libre para usar",
  deja: "Lo que te deja",
  ventas: "Lo que vendiste",
  gastos: "En qué se va la plata",
  pagos: "Lo que viene",
  sunat: "Lo de SUNAT",
  inventario: "La ropa que tienes",
};

export type DatosHojas = {
  saldo: SaldoBolsillos;
  te: TeDejaMes;
  fila: FilaER | null;
  filas: readonly FilaER[];
  filasAntes: readonly FilaER[] | null;
  contra: string | null;
  proximos: Proximos;
  inventario: SedeConValor[] | null;
  hoy: string;
  /** «noviembre», «del 3 al 9 de noviembre». */
  enElPeriodo: string;
  /** «¿Ya pagaste el mes?» (para la barra de la hoja del mes); `null` fuera de un mes entero. */
  eq: EquilibrioMes | null;
  /** «Día 9 de 30», para la rayita de hoy; `null` fuera del mes en curso. */
  hoyEnElMes: { van: number; total: number } | null;
  /** Lo vendido cada día del período (con IGV, como Caja); `null` si la cuenta no ve Rendimiento. */
  ventasDia: { fecha: string; total: number }[] | null;
  /** La caja día por día de los próximos 14 días y el mínimo; `null` mirando una sede (los bancos son de CAYLA entera). */
  caja: { puntos: PuntoCaja[]; minimo: number } | null;
  sedes: readonly SedeTelar[];
};

export type DestinosHojas = Partial<Record<ClaveHoja, { href: string; texto: string }>>;

/** Lo que mira cada hoja para saber si hay con qué abrirla (ni más ni menos). */
type DatoDeHoja = {
  plata: Pick<DatosHojas, "saldo">;
  deja: Pick<DatosHojas, "fila">;
  ventas: Pick<DatosHojas, "filas">;
  gastos: Pick<DatosHojas, "fila">;
  pagos: Pick<DatosHojas, "proximos">;
  sunat: Pick<DatosHojas, "saldo">;
  inventario: Pick<DatosHojas, "inventario">;
};

/**
 * ¿La hoja `c` tiene con qué abrirse? Cada una mira SOLO su dato (Resumen por bloques, ADR-0661): así un bloque que llega antes («Lo que te deja», del mes)
 * no espera a la caja ni a la inversión para saber si ofrece su hoja.
 */
export function hayHoja<C extends ClaveHoja>(c: C, d: DatoDeHoja[C]): boolean {
  const x = d as Partial<DatosHojas>;
  switch (c) {
    case "plata":
      return x.saldo!.tipo === "cayla";
    case "deja":
      return !!x.fila;
    case "ventas":
      return x.filas!.some((f) => f.unidad === "tienda" && f.ventas > 0);
    case "gastos":
      return !!x.fila && x.fila.detalleGastos.length > 0;
    case "pagos":
      return x.proximos!.tipo === "ok" && x.proximos!.pagos.length > 0;
    case "sunat":
      return x.saldo!.tipo === "cayla" && x.saldo!.bolsillos.some((b) => b.clave === "sunat");
    default:
      return !!x.inventario && x.inventario.length > 0;
  }
}

const ORDEN_HOJAS: readonly ClaveHoja[] = ["plata", "deja", "ventas", "gastos", "pagos", "sunat", "inventario"];

/** Qué hojas hay con los datos que llegaron (una hoja sin datos no se ofrece). */
export function hojasQueHay(d: DatosHojas): ClaveHoja[] {
  return ORDEN_HOJAS.filter((c) => hayHoja(c, d));
}

function Renglones({ filas }: { filas: readonly Renglon[] }) {
  return (
    <ol className="bolsillos-cuenta">
      {filas.map((f, i) => (
        <li key={`${f.texto}-${i}`} className={f.tipo === "total" ? "es-total" : ""}>
          <span className="bolsillos-texto">
            <b>{f.texto}</b>
            {f.detalle && <small>{f.detalle}</small>}
          </span>
          <span className={`num ${f.tipo === "resta" ? "es-resta" : ""}`}>{f.tipo === "resta" ? `− ${soles(Math.abs(f.monto))}` : soles(f.monto)}</span>
        </li>
      ))}
    </ol>
  );
}

function Respuesta({ etiqueta, valor, frase }: { etiqueta: string; valor: number; frase?: ReactNode }) {
  return (
    <div className="hoja-a-respuesta">
      <p className="bolsillos-etiqueta">{etiqueta}</p>
      <p className={`hoja-a-cifra cifra-a ${valor < 0 || etiqueta === "Te faltó" ? "es-falta" : ""}`}>
        <CifraAnimada valor={Math.round(valor)} formato="soles-redondo" />
      </p>
      {frase && <p className="mes-a-nota">{frase}</p>}
    </div>
  );
}

/** La barra apilada de una hoja con su leyenda debajo: cada tramo con su muestra, su nombre y su parte del total. */
function Reparto({ tramos, total, etiqueta, enSoles = false }: { tramos: readonly TramoHoja[]; total?: number; etiqueta: string; /** La leyenda dice los soles de cada tramo (cuando la frase de al lado ya da las partes). */ enSoles?: boolean }) {
  const suma = total ?? tramos.reduce((a, t) => a + t.valor, 0);
  // Un tramo en cero no tiene nada que mostrar (ni en la barra ni en la leyenda), y una barra de un solo tramo, al 100 %, tampoco dice nada.
  tramos = tramos.filter((t) => t.valor > 0);
  if (tramos.length < 2 || suma <= 0) return null;
  return (
    <figure className="hoja-a-grafico">
      <BarraApilada alto={12} unidad="soles" formato={soles} total={total} etiqueta={etiqueta} segmentos={tramos.map((t) => ({ clave: t.clave, nombre: t.nombre, valor: t.valor, color: t.color }))} />
      <ul className="hoja-a-ley">
        {tramos.map((t) => (
          <li key={t.clave}>
            <MuestraTramo color={t.color} />
            <span>{t.nombre}</span>
            <b className="num">{enSoles ? soles(t.valor) : <>{Math.round((t.valor / suma) * 100)}&nbsp;%</>}</b>
          </li>
        ))}
      </ul>
    </figure>
  );
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const diaCorto = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES_CORTOS[Number(iso.slice(5, 7)) - 1]}`;
const milesCorto = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString("es-PE", { maximumFractionDigits: 1 })} mil` : String(Math.round(v)));

/** Lo vendido cada día, en barras: hoy en tinta con su cifra; los días sin venta se ven en cero. */
function VentaDiaria({ dias, hoy }: { dias: readonly { fecha: string; total: number }[]; hoy: string }) {
  if (dias.length < 2 || dias.every((d) => d.total <= 0)) return null;
  const mayor = dias.reduce((m, d) => (d.total > m.total ? d : m), dias[0]!);
  const destacada = dias.some((d) => d.fecha === hoy) ? hoy : mayor.fecha;
  return (
    <figure className="hoja-a-grafico">
      <figcaption className="hoja-a-titulo-graf">Lo vendido cada día</figcaption>
      <BarrasTiempo
        alto={120}
        etiqueta={`Lo vendido cada día, del ${diaCorto(dias[0]!.fecha)} al ${diaCorto(dias.at(-1)!.fecha)}`}
        destacada={destacada}
        ejes={milesCorto}
        barras={dias.map((d, i) => ({
          clave: d.fecha,
          valor: d.total,
          etiqueta: String(Number(d.fecha.slice(8, 10))),
          opcional: i % 5 !== 0 && d.fecha !== destacada,
          cifra: soles(d.total),
          tip: (
            <>
              <span className="block">{diaCorto(d.fecha)}</span>
              <b>{soles(d.total)}</b>
            </>
          ),
          aria: `${diaCorto(d.fecha)}: ${soles(d.total)}`,
        }))}
      />
      <p className="hoja-a-pie-graf">Con IGV, como lo cobra la caja. En tinta, {destacada === hoy ? "hoy" : "el mejor día"}.</p>
    </figure>
  );
}

/** La caja de los próximos 14 días, día por día, contra tu mínimo: lo que cae bajo él se tiñe y el punto más bajo dice su día. */
function CajaDiaria({ puntos, minimo }: { puntos: readonly PuntoCaja[]; minimo: number }) {
  if (puntos.length < 2) return null;
  const serie = puntos.map((p, i) => ({ x: i, y: p.saldo }));
  const bajo = puntos.reduce((m, p, i) => (p.saldo < puntos[m]!.saldo ? i : m), 0);
  const minY = Math.min(0, ...puntos.map((p) => p.saldo), minimo);
  return (
    <figure className="hoja-a-grafico">
      <figcaption className="hoja-a-titulo-graf">Tu caja, día por día</figcaption>
      <Linea
        serie={serie}
        referencia={minimo > 0 ? [{ x: 0, y: minimo }, { x: puntos.length - 1, y: minimo }] : null}
        bajoReferencia={minimo > 0}
        desde={0}
        hasta={puntos.length - 1}
        minY={minY}
        formatoY={milesCorto}
        marcasX={puntos.map((p, i) => ({ x: i, texto: i === 0 ? "hoy" : String(Number(p.fecha.slice(8, 10))), fuerte: i === 0 })).filter((_, i) => i === 0 || i % 3 === 0 || i === puntos.length - 1)}
        minimo={{ x: bajo, y: puntos[bajo]!.saldo, texto: `${diaCorto(puntos[bajo]!.fecha)} · ${soles(puntos[bajo]!.saldo)}` }}
        cifraReferencia={minimo > 0 ? { valor: soles(minimo), texto: "tu mínimo" } : null}
        leer={(x) => {
          const p = puntos[Math.round(x)];
          return p ? (
            <>
              <span className="block">{diaCorto(p.fecha)}</span>
              <b className="block">{soles(p.saldo)}</b>
              {p.sale > 0 && <span className="block">Sale {soles(p.sale)}</span>}
            </>
          ) : null;
        }}
        etiqueta={`Tu caja en los próximos ${puntos.length - 1} días: baja a ${soles(puntos[bajo]!.saldo)} el ${diaCorto(puntos[bajo]!.fecha)}`}
        alto={150}
      />
      <p className="hoja-a-pie-graf">Lo que tendrías al cerrar cada día, con lo que esperas cobrar y estos pagos{minimo > 0 ? "; la raya punteada es tu mínimo" : ""}.</p>
    </figure>
  );
}

function Cuerpo({ clave, d }: { clave: ClaveHoja; d: DatosHojas }) {
  switch (clave) {
    case "plata": {
      if (d.saldo.tipo !== "cayla") return null;
      return (
        <>
          <Respuesta etiqueta="Libre para usar" valor={d.saldo.libre} frase="Lo que hay hoy, menos todo lo que ya tiene dueño. No cuenta lo que vas a vender." />
          <Reparto
            etiqueta="Lo que tienes, repartido entre lo libre y sus bolsillos"
            tramos={[
              ...(d.saldo.libre > 0 ? [{ clave: "libre", nombre: "Libre", valor: d.saldo.libre, color: COLOR_LIBRE }] : []),
              ...d.saldo.bolsillos.map((b) => ({ clave: b.clave, nombre: b.nombre, valor: b.monto, color: b.color })),
            ]}
          />
          <Renglones filas={cuentaDeLibre(d.saldo).map((f) => ({ texto: f.texto, detalle: f.detalle, monto: f.monto, tipo: f.total ? "total" : f.monto < 0 ? "resta" : "suma" }))} />
          <p className="nota-cayla mt-4">
            Los pagos son los de los próximos 14 días que ya están registrados: planilla, impuestos, facturas de proveedor y gastos fijos. El IGV que vas juntando este mes se paga el mes que viene, pero ya no es tuyo.
          </p>
        </>
      );
    }
    case "deja": {
      if (!d.fila) return null;
      // «Te faltó» ya dice el signo: la cifra va sin el menos.
      const valor = d.te.tipo === "estimado" ? d.te.estimado : d.te.tipo === "sin_estimado" ? d.fila.resultado : Math.abs(d.fila.resultado);
      const cien = deCadaCien(d.fila);
      return (
        <>
          <Respuesta
            etiqueta={d.te.tipo === "estimado" ? "Te deja (estimado)" : d.fila.resultado >= 0 ? "Te dejó" : "Te faltó"}
            valor={valor}
            frase={d.te.tipo === "estimado" ? `Puede quedar entre ${soles(d.te.rango[0])} y ${soles(d.te.rango[1])}: el rango se angosta a medida que pasan los días.` : `Con lo registrado ${d.enElPeriodo}.`}
          />
          {cien && (
            <div className="hoja-a-grafico">
              <p className="hoja-a-titulo-graf">De cada S/&nbsp;100 vendidos</p>
              <Reparto tramos={cien.tramos} total={cien.total} etiqueta={cien.frase} enSoles />
              <p className="hoja-a-pie-graf">{cien.frase}</p>
            </div>
          )}
          {d.eq && d.eq.tipo === "ok" && (
            <div className="hoja-a-grafico">
              <p className="hoja-a-titulo-graf">¿Ya pagaste el mes?</p>
              <BarraAvance
                pct={Math.min(100, (d.eq.vendido / Math.max(d.eq.pe, 1)) * 100)}
                alto="gruesa"
                tono={d.eq.estado === "no_llega" ? "ambar" : undefined}
                marca={d.hoyEnElMes ? (d.hoyEnElMes.van / d.hoyEnElMes.total) * 100 : null}
                etiqueta="Cuánto de lo que hay que vender para pagar el mes ya está vendido"
                texto={`${soles(d.eq.vendido)} de ${soles(d.eq.pe)}, ${d.eq.rotulo}`}
              />
              <p className="hoja-a-pie-graf">
                {d.eq.titular} {d.eq.detalle}
              </p>
            </div>
          )}
          <Renglones filas={cuentaDelMes(d.fila, d.te)} />
        </>
      );
    }
    case "ventas": {
      const tiendas = ventasPorTienda(d.filas, d.filasAntes);
      const total = tiendas.reduce((a, t) => a + t.ventas, 0);
      return (
        <>
          <Respuesta etiqueta={`Vendiste, ${rotuloDeVentas(d.filas)}`} valor={total} frase={`Lo que vendió cada tienda ${d.enElPeriodo}${d.contra ? `, contra ${d.contra}` : ""}.`} />
          {tiendas.filter((t) => t.ventas > 0).length > 1 && (
            <Reparto etiqueta="Lo vendido, repartido por tienda" tramos={tiendas.map((t) => ({ clave: t.id, nombre: t.nombre, valor: t.ventas, color: colorDeSede(d.sedes.find((x) => x.clave === t.id)?.color) }))} />
          )}
          {d.ventasDia && <VentaDiaria dias={d.ventasDia} hoy={d.hoy} />}
          <ul className="hoja-a-lista">
            {tiendas.map((t) => (
              <li key={t.id}>
                <span className="bolsillos-texto">
                  <b className="hoja-a-con-muestra">
                    <MuestraTramo color={colorDeSede(d.sedes.find((x) => x.clave === t.id)?.color)} />
                    {t.nombre}
                  </b>
                </span>
                <span className="hoja-a-lado">
                  <b className="num">{soles(t.ventas)}</b>
                  {t.cambio !== null && (
                    <Chip tono={Math.round(t.cambio * 100) === 0 ? "pizarra" : t.cambio > 0 ? "verde" : "ambar"} versalitas={false}>
                      {Math.round(t.cambio * 100) === 0 ? "Igual" : `${t.cambio > 0 ? "+" : "−"}${Math.abs(Math.round(t.cambio * 100))} %`}
                    </Chip>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      );
    }
    case "gastos": {
      if (!d.fila) return null;
      const gastos = gastosDelMes(d.fila);
      const rubros = rubrosEnBarra(gastos);
      // Cada renglón lleva el color de su tramo en la barra; los que van juntos en «Otros», el de «Otros».
      const colorDe = (nombre: string) => rubros.find((t) => t.nombre === nombre)?.color ?? rubros.at(-1)?.color;
      return (
        <>
          <Respuesta etiqueta="Gastaste" valor={d.fila.gastos} frase={`Sin contar lo que costaron las prendas, ${d.enElPeriodo}.`} />
          <Reparto etiqueta="Los gastos, repartidos por rubro" tramos={rubros} />
          <ul className="hoja-a-lista">
            {gastos.map((g) => (
              <li key={g.nombre}>
                <span className="bolsillos-texto">
                  <b className="hoja-a-con-muestra">
                    <MuestraTramo color={colorDe(g.nombre)} />
                    {g.nombre}
                  </b>
                </span>
                <span className="hoja-a-lado">
                  <b className="num">{soles(g.monto)}</b>
                  <small>{g.deCada100} de cada S/&nbsp;100</small>
                </span>
              </li>
            ))}
          </ul>
        </>
      );
    }
    case "pagos": {
      if (d.proximos.tipo !== "ok") return null;
      return (
        <>
          <Respuesta etiqueta={`Pagas hasta el ${fechaEnPalabras(d.proximos.hasta)}`} valor={d.proximos.total} frase={d.proximos.justo ? d.proximos.justo.frase : undefined} />
          {d.caja && <CajaDiaria puntos={d.caja.puntos} minimo={d.caja.minimo} />}
          <ul className="hoja-a-lista">
            {d.proximos.pagos.map((p) => (
              <li key={p.clave}>
                <span className="bolsillos-texto">
                  <b>{p.titulo}</b>
                  <small className={p.atrasada ? "proximos-vencido" : ""}>
                    {cuandoSale(p, d.hoy)} · {fechaEnPalabras(p.fecha)}
                    {p.detalle ? ` · ${p.detalle}` : ""}
                  </small>
                </span>
                <b className="num">−{soles(p.monto)}</b>
              </li>
            ))}
          </ul>
        </>
      );
    }
    case "sunat": {
      if (d.saldo.tipo !== "cayla") return null;
      const sunat = d.saldo.bolsillos.find((b) => b.clave === "sunat");
      if (!sunat) return null;
      return (
        <>
          <Respuesta etiqueta="Para SUNAT" valor={sunat.monto} frase="Lo que vence en estas dos semanas y el IGV que vas juntando este mes. No es tuyo: lo cobraste para SUNAT." />
          <Reparto
            etiqueta="Lo de SUNAT: lo que vence ahora y lo que se junta para el mes que viene"
            tramos={[
              { clave: "ahora", nombre: "Vence en estas dos semanas", valor: sunat.pagos.filter((p) => p.fecha <= (d.saldo.tipo === "cayla" ? d.saldo.hasta : "")).reduce((a, p) => a + p.monto, 0), color: "var(--color-reparto-terracota)" },
              { clave: "junta", nombre: "Se junta para el mes que viene", valor: sunat.pagos.filter((p) => p.fecha > (d.saldo.tipo === "cayla" ? d.saldo.hasta : "")).reduce((a, p) => a + p.monto, 0), color: "var(--color-reparto-ocre)" },
            ].filter((t) => t.valor > 0)}
          />
          <ul className="hoja-a-lista">
            {sunat.pagos.map((p, i) => (
              <li key={`${p.titulo}-${i}`}>
                <span className="bolsillos-texto">
                  <b>{p.titulo}</b>
                  <small className={p.atrasada ? "proximos-vencido" : ""}>{p.atrasada ? "Vencido" : `Se paga el ${fechaEnPalabras(p.fecha)}`}</small>
                </span>
                <b className="num">{soles(p.monto)}</b>
              </li>
            ))}
          </ul>
          <p className="nota-cayla mt-4">La fecha es el día 15 mientras el RUC no esté cargado: SUNAT vence entre el 12 y el 22, según su último dígito.</p>
        </>
      );
    }
    case "inventario": {
      if (!d.inventario) return null;
      const total = d.inventario.reduce((a, s) => a + s.valor, 0);
      return (
        <>
          <Respuesta etiqueta="La ropa, a lo que costó" valor={total} frase="No es gasto: salió de tu caja cuando la pagaste y se vuelve costo cuando la vendes." />
          <Reparto
            etiqueta="La ropa a costo, repartida por sede"
            tramos={[...d.inventario].sort((a, b) => b.valor - a.valor).map((s) => ({ clave: s.ubicacionId, nombre: s.sede.replace(/^Tienda\s+/i, ""), valor: s.valor, color: colorDeSede(d.sedes.find((x) => x.clave === s.ubicacionId)?.color) }))}
          />
          <ul className="hoja-a-lista">
            {[...d.inventario]
              .sort((a, b) => b.valor - a.valor)
              .map((s) => (
                <li key={s.ubicacionId}>
                  <span className="bolsillos-texto">
                    <b className="hoja-a-con-muestra">
                      <MuestraTramo color={colorDeSede(d.sedes.find((x) => x.clave === s.ubicacionId)?.color)} />
                      {s.sede}
                    </b>
                    <small>{s.unidades.toLocaleString("es-PE")} prendas</small>
                  </span>
                  <b className="num">{soles(s.valor)}</b>
                </li>
              ))}
          </ul>
        </>
      );
    }
  }
}

export function HojasResumen({
  abierta,
  onAbrir,
  datos,
  destinos,
  volverA,
}: {
  abierta: ClaveHoja | null;
  onAbrir: (c: ClaveHoja | null) => void;
  datos: DatosHojas;
  destinos: DestinosHojas;
  /** El botón que abrió la primera hoja: ahí vuelve el foco al cerrar. */
  volverA?: RefObject<HTMLElement | null>;
}) {
  if (!abierta) return null;
  const hay = hojasQueHay(datos);
  if (!hay.includes(abierta)) return null;
  const antes = hojaVecina(abierta, hay, -1);
  const despues = hojaVecina(abierta, hay, 1);
  const destino = destinos[abierta];
  const posicion = hay.indexOf(abierta) + 1;
  return (
    <Modal titulo={NOMBRE[abierta]} subtitulo={`${posicion} de ${hay.length}`} onClose={() => onAbrir(null)} conCerrar tamano="ancha" alCerrarEnfocar={volverA}>
      {/* La hoja vive en un portal, fuera de la pantalla: lleva su propia letra de cifras (Inter) y las reglas del camino A. */}
      <div key={abierta} className={`hoja-a resumen-bolsillos ${letraEstados.variable}`}>
        <Cuerpo clave={abierta} d={datos} />
        {destino && (
          <div className="mt-4">
            <BotonVer href={destino.href}>{destino.texto}</BotonVer>
          </div>
        )}
      </div>
      <div className="pie-acciones hoja-a-pie">
        {antes ? <Volver onClick={() => onAbrir(antes)} a="Volver a la hoja anterior" /> : <span className="hoja-a-hueco" aria-hidden />}
        {despues && (
          <button type="button" className="btn-cayla btn-primario" onClick={() => onAbrir(despues)}>
            {NOMBRE[despues]}
            <ArrowRight aria-hidden className="h-4 w-4" />
          </button>
        )}
      </div>
    </Modal>
  );
}
