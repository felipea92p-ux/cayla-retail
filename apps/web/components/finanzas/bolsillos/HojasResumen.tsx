"use client";

import { ArrowRight } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { Modal } from "@/components/ui/Modal";
import { Volver } from "@/components/ui/Volver";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { Chip } from "@/components/ui/Chip";
import { cuentaDeLibre, type SaldoBolsillos } from "@/lib/bolsillos-reglas";
import { fechaEnPalabras } from "@/lib/caja-proxima-reglas";
import { soles } from "@/lib/flujo-caja-reglas";
import { cuentaDelMes, gastosDelMes, hojaVecina, ventasPorTienda, type ClaveHoja, type Renglon } from "@/lib/hojas-resumen-reglas";
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
};

export type DestinosHojas = Partial<Record<ClaveHoja, { href: string; texto: string }>>;

/** Qué hojas hay con los datos que llegaron (una hoja sin datos no se ofrece). */
export function hojasQueHay(d: DatosHojas): ClaveHoja[] {
  const hay: ClaveHoja[] = [];
  if (d.saldo.tipo === "cayla") hay.push("plata");
  if (d.fila) hay.push("deja");
  if (d.filas.some((f) => f.unidad === "tienda" && f.ventas > 0)) hay.push("ventas");
  if (d.fila && d.fila.detalleGastos.length) hay.push("gastos");
  if (d.proximos.tipo === "ok" && d.proximos.pagos.length) hay.push("pagos");
  if (d.saldo.tipo === "cayla" && d.saldo.bolsillos.some((b) => b.clave === "sunat")) hay.push("sunat");
  if (d.inventario && d.inventario.length) hay.push("inventario");
  return hay;
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
      <p className={`hoja-a-cifra num ${valor < 0 || etiqueta === "Te faltó" ? "es-falta" : ""}`}>{soles(valor)}</p>
      {frase && <p className="mes-a-nota">{frase}</p>}
    </div>
  );
}

function Cuerpo({ clave, d }: { clave: ClaveHoja; d: DatosHojas }) {
  switch (clave) {
    case "plata": {
      if (d.saldo.tipo !== "cayla") return null;
      return (
        <>
          <Respuesta etiqueta="Libre para usar" valor={d.saldo.libre} frase="Lo que hay hoy, menos todo lo que ya tiene dueño. No cuenta lo que vas a vender." />
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
      return (
        <>
          <Respuesta
            etiqueta={d.te.tipo === "estimado" ? "Te deja (estimado)" : d.fila.resultado >= 0 ? "Te dejó" : "Te faltó"}
            valor={valor}
            frase={d.te.tipo === "estimado" ? `Puede quedar entre ${soles(d.te.rango[0])} y ${soles(d.te.rango[1])}: el rango se angosta a medida que pasan los días.` : `Con lo registrado ${d.enElPeriodo}.`}
          />
          <Renglones filas={cuentaDelMes(d.fila, d.te)} />
        </>
      );
    }
    case "ventas": {
      const tiendas = ventasPorTienda(d.filas, d.filasAntes);
      const total = tiendas.reduce((a, t) => a + t.ventas, 0);
      const mayor = Math.max(1, ...tiendas.map((t) => t.ventas));
      return (
        <>
          <Respuesta etiqueta="Vendiste, sin IGV" valor={total} frase={`Lo que vendió cada tienda ${d.enElPeriodo}${d.contra ? `, contra ${d.contra}` : ""}.`} />
          <ul className="hoja-a-lista">
            {tiendas.map((t) => (
              <li key={t.id}>
                <span className="bolsillos-texto">
                  <b>{t.nombre}</b>
                  <BarraAvance pct={(t.ventas / mayor) * 100} alto="fina" tono="tinta" decorativa />
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
      const mayor = Math.max(1, ...gastos.map((g) => g.monto));
      return (
        <>
          <Respuesta etiqueta="Gastaste" valor={d.fila.gastos} frase={`Sin contar lo que costaron las prendas, ${d.enElPeriodo}.`} />
          <ul className="hoja-a-lista">
            {gastos.map((g) => (
              <li key={g.nombre}>
                <span className="bolsillos-texto">
                  <b>{g.nombre}</b>
                  <BarraAvance pct={(Math.max(0, g.monto) / mayor) * 100} alto="fina" tono="tinta" decorativa />
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
      const mayor = Math.max(1, ...d.inventario.map((s) => s.valor));
      return (
        <>
          <Respuesta etiqueta="La ropa, a lo que costó" valor={total} frase="No es gasto: salió de tu caja cuando la pagaste y se vuelve costo cuando la vendes." />
          <ul className="hoja-a-lista">
            {[...d.inventario]
              .sort((a, b) => b.valor - a.valor)
              .map((s) => (
                <li key={s.ubicacionId}>
                  <span className="bolsillos-texto">
                    <b>{s.sede}</b>
                    <small>{s.unidades.toLocaleString("es-PE")} prendas</small>
                    <BarraAvance pct={(s.valor / mayor) * 100} alto="fina" tono="tinta" decorativa />
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
    <Modal titulo={NOMBRE[abierta]} subtitulo={`${posicion} de ${hay.length}`} onClose={() => onAbrir(null)} conCerrar tamano="mediana" alCerrarEnfocar={volverA}>
      <div key={abierta} className="hoja-a">
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
