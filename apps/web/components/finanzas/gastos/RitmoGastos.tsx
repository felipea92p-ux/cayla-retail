"use client";

import { useState } from "react";
import { CalendarClock, CalendarX } from "lucide-react";
import { MuestraTramo } from "@/components/ui/BarraApilada";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { EnlaceVer } from "@/components/ui/EnlaceVer";
import { Linea, montoCorto } from "@/components/ui/Linea";
import { Vacio } from "@/components/ui/Vacio";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { COLOR } from "@/components/finanzas/gastos/HilosGastos";
import { delDia, marcasDelRitmo, nombreDelDia, pieDelRitmo, type GastoDelDia, type RitmoDelMes } from "@/lib/gastos-ritmo-reglas";
import { solesRedondo, textoMes, type GastoFila } from "@/lib/gastos-reglas";
import type { SedeTelar } from "@/lib/finanzas-telar-reglas";

const conMayuscula = (s: string) => `${s[0]!.toUpperCase()}${s.slice(1)}`;
const unidades = (n: number) => `${n} ${n === 1 ? "gasto" : "gastos"}`;
/** Cuántos gastos del día se ven al abrirlo; los demás, con «Ver N más» (como el desglose de «En qué se va»). */
const A_LA_VISTA = 6;

/**
 * «Cuándo» en Gastos (Felipe 2026-10-30, la C2 de `docs/maquetas/gastos-cuando-2026-10/`, reemplaza al calendario de ADR-0493): el ritmo
 * del mes con `<Linea>`. Lo gastado sumado día a día contra el mes anterior a la misma altura, hacia dónde va si sigue así (con los fijos
 * que faltan, en puntos huecos) y los saltos grandes con su nombre, en una franja sobre el gráfico. Al pasar el mouse se lee cada día; al
 * tocarlo (o con ← → y Enter) se abre debajo lo que se gastó ese día, gasto por gasto, como el desglose de «En qué se va».
 */
export function RitmoGastos({
  ritmo,
  gastos,
  mes,
  nombreMesAnterior,
  sedes,
  onAbrirGasto,
  onVerEnLaTabla,
}: {
  ritmo: RitmoDelMes;
  /** Los gastos del mes (los mismos de la lista de abajo), para el día elegido. */
  gastos: readonly GastoFila[];
  mes: string;
  /** «septiembre». */
  nombreMesAnterior: string;
  /** Los hilos de sede del telar: el nombre y el color de cada una. */
  sedes: readonly SedeTelar[];
  onAbrirGasto: (id: string) => void;
  /** «Ver en la tabla»: la lista de abajo queda con ese día. */
  onVerEnLaTabla: (dia: number) => void;
}) {
  const [dia, setDia] = useState<number | null>(null);
  // El que se dibuja abierto, también mientras se cierra (sin él, el día desaparecería antes de plegarse).
  const [dibujado, setDibujado] = useState<number | null>(null);
  const [mas, setMas] = useState(false);
  const elegir = (d: number) => {
    const x = Math.round(d);
    if (dia === x) return setDia(null);
    setDia(x);
    setDibujado(x);
    setMas(false);
  };
  const nombreMes = textoMes(mes).split(" ")[0]!;
  const sede = (clave: string) => sedes.find((s) => s.clave === clave);
  const sumaEn = (d: number) => ritmo.serie.find((p) => p.x === d)?.y ?? null;
  const proyEn = (d: number) => ritmo.proyeccion?.find((p) => p.x === d)?.y ?? null;
  const refEn = (d: number) => ritmo.referencia?.find((p) => p.x === d)?.y ?? null;
  const pie = pieDelRitmo(ritmo, mes, nombreMesAnterior);

  // El globito de un día: lo gastado ese día, lo que se llevaba, el mes anterior a esa altura; después de hoy, lo que viene.
  const leer = (x: number) => {
    const d = Math.round(x);
    const delD = d <= ritmo.hasta ? delDia(ritmo, gastos, mes, d) : null;
    const viene = ritmo.vienen.find((v) => v.dia === d);
    const llevaba = sumaEn(d);
    const proy = proyEn(d);
    const ref = refEn(d);
    return (
      <div className="ritmo-globo">
        <b>{conMayuscula(nombreDelDia(mes, d))}</b>
        {delD && <span>{delD.gastos.length ? `${solesRedondo(delD.total)} en ${unidades(delD.gastos.length)}` : "Sin gastos"}</span>}
        {llevaba !== null && <span>Llevabas {solesRedondo(llevaba)}</span>}
        {llevaba === null && proy !== null && <span>Si sigue así, ≈ {solesRedondo(proy)}</span>}
        {viene && <span>Viene: {viene.fijos.map((f) => f.descripcion).join(", ")} ({solesRedondo(viene.monto)})</span>}
        {ref !== null && (
          <span>
            {conMayuscula(nombreMesAnterior)} a esa altura: {solesRedondo(ref)}
          </span>
        )}
      </div>
    );
  };

  // Un mes sin un solo gasto (ni un fijo por venir) no dibuja una línea en cero con su «S/ 0»: dice que está vacío, como «En qué se va».
  if (ritmo.aHoy <= 0 && ritmo.vienen.length === 0)
    return (
      <div data-guia="fin-gastos.ritmo">
        <Vacio tamano="chico" icono={<CalendarX />}>
          Sin gastos en {nombreMes} todavía.
        </Vacio>
      </div>
    );

  const elDia = dibujado !== null ? delDia(ritmo, gastos, mes, dibujado) : null;
  const futuro = dibujado !== null && dibujado > ritmo.hasta;
  const mayor = elDia?.gastos[0]?.monto ?? 0;
  const filaDeGasto = (g: GastoDelDia) => {
    const s = sede(g.clave);
    return (
      <button key={g.id} type="button" className="fila-cayla ritmo-gasto" onClick={() => onAbrirGasto(g.id)}>
        <span className="hilo-gasto-que">
          <b>{g.descripcion}</b>
          <small>{[g.categoriaNombre, g.proveedorNombre].filter(Boolean).join(" · ")}</small>
        </span>
        <span className="hilo-gasto-sede">
          {s && <MuestraTramo color={COLOR[s.color]} />}
          {s?.nombre ?? "Otra sede"}
        </span>
        <span className="hilo-gasto-barra">
          <BarraAvance pct={mayor > 0 ? (g.monto / mayor) * 100 : 0} alto="fina" tono="tinta" decorativa />
        </span>
        <span className="hilo-gasto-monto">{solesRedondo(g.monto)}</span>
      </button>
    );
  };

  return (
    <div className="ritmo-gastos" data-guia="fin-gastos.ritmo">
      <div className="ritmo-leyenda" aria-hidden>
        <span>
          <i className="ritmo-muestra" />
          {nombreMes}
        </span>
        {ritmo.referencia && (
          <span>
            <i className="ritmo-muestra" data-tipo="ref" />
            {nombreMesAnterior}
          </span>
        )}
        {ritmo.proyeccion && (
          <span>
            <i className="ritmo-muestra" data-tipo="proy" />
            si sigue así
          </span>
        )}
        {ritmo.vienen.length > 0 && (
          <span>
            <i className="ritmo-muestra" data-tipo="viene" />
            fijo por confirmar
          </span>
        )}
      </div>
      <Linea
        serie={ritmo.serie}
        referencia={ritmo.referencia}
        proyeccion={ritmo.proyeccion}
        desde={1}
        hasta={ritmo.dias}
        marcasX={marcasDelRitmo(ritmo)}
        ahora={ritmo.enCurso && ritmo.hasta < ritmo.dias ? { x: ritmo.hasta, texto: "" } : null}
        notas={ritmo.saltos.map((s, i) => ({
          ...(i === 0 ? { guia: "fin-gastos.ritmo-nota" } : {}),
          x: s.dia,
          texto: s.largo,
          corto: s.corto,
          detalle: solesRedondo(s.monto),
          etiqueta: `${s.largo}: ${solesRedondo(s.monto)}. Ver lo que se gastó ese día`,
          onElegir: () => elegir(s.dia),
        }))}
        vienen={ritmo.vienen.map((v) => ({
          x: v.dia,
          y: v.y,
          etiqueta: `El ${v.dia} viene ${v.fijos.map((f) => f.descripcion).join(", ")}: ${solesRedondo(v.monto)}`,
        }))}
        cifra={ritmo.serie.length ? solesRedondo(ritmo.aHoy) : null}
        cifraReferencia={ritmo.cierreAnterior !== null ? { valor: montoCorto(ritmo.cierreAnterior), texto: nombreMesAnterior } : null}
        cifraProyeccion={ritmo.cierreProyectado !== null ? { valor: `≈ ${montoCorto(ritmo.cierreProyectado)}`, texto: "si sigue así" } : null}
        leer={leer}
        onElegir={elegir}
        elegido={dia}
        alto={240}
        etiqueta={`Lo gastado en ${nombreMes}, sumado día a día${ritmo.referencia ? `, contra ${nombreMesAnterior}` : ""}. Con las flechas se recorre cada día; Enter muestra lo que se gastó ese día.`}
        vacio={`Sin gastos en ${nombreMes} todavía`}
      />
      {pie && <p className="ritmo-pie">{pie}</p>}

      <div className="ritmo-cajon" data-abierto={dia !== null || undefined} inert={dia === null}>
        <div>
          {dibujado !== null && elDia && (
            <div className="ritmo-dia" data-guia="fin-gastos.ritmo-dia" aria-live="polite">
              <div className="ritmo-dia-cabeza">
                <h4>{conMayuscula(nombreDelDia(mes, dibujado))}</h4>
                <small>
                  {futuro
                    ? elDia.vienen.length
                      ? `viene ${solesRedondo(elDia.vienen.reduce((a, f) => a + f.monto, 0))}`
                      : "todavía no llega"
                    : elDia.gastos.length
                      ? `${solesRedondo(elDia.total)} en ${unidades(elDia.gastos.length)}`
                      : "sin gastos"}
                </small>
              </div>
              <div className="ritmo-gastos-dia">
                {elDia.gastos.slice(0, A_LA_VISTA).map(filaDeGasto)}
                {elDia.gastos.length > A_LA_VISTA && (
                  <FilasDeMas abierto={mas}>
                    <div className="ritmo-gastos-dia">{elDia.gastos.slice(A_LA_VISTA).map(filaDeGasto)}</div>
                  </FilasDeMas>
                )}
                {elDia.vienen.map((f) => (
                  <div key={f.id} className="ritmo-gasto" data-viene>
                    <span className="hilo-gasto-que">
                      <b>Viene: {f.descripcion}</b>
                      <small>{f.categoriaNombre} · fijo por confirmar</small>
                    </span>
                    <span className="hilo-gasto-sede">
                      {sede(f.ubicacionId ?? "empresa") && <MuestraTramo color={COLOR[sede(f.ubicacionId ?? "empresa")!.color]} />}
                      {sede(f.ubicacionId ?? "empresa")?.nombre ?? "Otra sede"}
                    </span>
                    <span className="hilo-gasto-barra" />
                    <span className="hilo-gasto-monto">{solesRedondo(f.monto)}</span>
                  </div>
                ))}
              </div>
              {elDia.gastos.length === 0 && elDia.vienen.length === 0 && (
                <Vacio tamano="chico" icono={futuro ? <CalendarClock /> : <CalendarX />}>
                  {futuro ? "Ese día todavía no llega." : "Ese día no hubo gastos."}
                </Vacio>
              )}
              {elDia.gastos.length > 0 && (
                <div className="ritmo-pie-dia">
                  {elDia.gastos.length > A_LA_VISTA ? <BotonVerMas abierto={mas} onCambiar={setMas} texto={`Ver ${elDia.gastos.length - A_LA_VISTA} más`} forma="enlace" /> : <span />}
                  <EnlaceVer onClick={() => onVerEnLaTabla(dibujado)}>{elDia.gastos.length === 1 ? "Ver este gasto en la tabla" : `Ver los ${elDia.gastos.length} en la tabla`}</EnlaceVer>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
