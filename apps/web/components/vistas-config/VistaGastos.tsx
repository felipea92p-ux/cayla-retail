"use client";

import { useMemo, useRef, useState, type CSSProperties } from "react";
import { CalendarClock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Aviso } from "@/components/ui/Aviso";
import { avisar } from "@/components/ui/Avisos";
import { BarraAvance } from "@/components/ui/BarraAvance";
import { LapizEditar } from "@/components/ui/BotonEditar";
import { Boton } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { BotonVerMas, FilasDeMas } from "@/components/ui/VerMas";
import { Vacio } from "@/components/ui/Vacio";
import { ComboResponsable } from "@/components/ComboResponsable";
import { Casilla, useGuardarCasilla, type Guardar } from "@/components/ConfiguracionCasilla";
import { GastoFijoModal } from "@/components/GastosFijosYActivos";
import type { ProveedorGasto } from "@/components/RegistrarGastoModal";
import { TopesDeGasto } from "@/components/vistas-config/TopesDeGasto";
import { useLuzDelMouse } from "@/components/vitrinas-sedes/useLuzDelMouse";
import { contratoPorVencer, TEXTO_FORMA_DE_PAGO, textoContratoPorVencer, type ResumenFicha } from "@/lib/gasto-fijo-ficha-reglas";
import { nombreCortoSede } from "@/lib/finanzas-telar-reglas";
import { avanceDelMes, claveUnidad, colorDeFijo, diaDelFijo, diasDelMes, pagosEnLaLinea, unidadesDeFijos } from "@/lib/gastos-config-reglas";
import { solesRedondo, textoColumnaCuando, textoDiasAntes, type CategoriaGasto, type GastoFijoMes, type UbicacionGastos } from "@/lib/gastos-reglas";
import type { ConfigPpto } from "@/lib/presupuesto-reglas";
import { etiquetaReparto, textoPct, validarPct, type FilaReparto } from "@/lib/reparto-claure-reglas";

// Configuración ▸ Gastos (Felipe 2026-11-05, docs/maquetas/configuracion-cuatro-vistas-2026-11/): junta Gastos fijos, Presupuesto y Reparto CLAURE. ¿Qué sale cada mes? Primero se ve cuándo
// se paga (la línea del mes), después cuánto puede salir (los topes) y de quién es (el reparto, solo del líder). Mismas funciones de siempre. Un fijo es un recordatorio: cada mes
// aparece en Finanzas ▸ Gastos ▸ Fijos del mes para registrarlo con lo que llegó de verdad; se archiva, no se borra.

const conVar = (x: Record<string, string | number>) => x as CSSProperties;
const TODAS = "todas";

function SePagaA({ f, r, hoy, conFicha }: { f: GastoFijoMes; r: ResumenFicha | undefined; hoy: string; conFicha: boolean }) {
  const vence = r?.contratoVence && hoy ? contratoPorVencer(r.contratoVence, hoy) : null;
  const pago = f.diasAntes ? `se paga ${textoDiasAntes(f.diasAntes)}` : null;
  const momento = f.momento === "dia" ? null : textoColumnaCuando(f.momento, f.diaDelMes);
  const quien = !conFicha
    ? f.proveedorNombre
    : r?.beneficiario
      ? [r.beneficiario, r.formaDePago ? TEXTO_FORMA_DE_PAGO[r.formaDePago] : null].filter(Boolean).join(" · ")
      : null;
  const unidad = f.ubicacionId ? nombreCortoSede(f.ubicacionNombre) : "Empresa";
  return (
    <>
      <span className="vs-rotulo">{[unidad, quien ?? f.categoriaNombre, momento, pago].filter(Boolean).join(" · ")}</span>
      {conFicha && !r?.beneficiario && <span className="vs-rotulo cv-falta-txt">Falta a quién se le paga</span>}
      {vence && (
        <Chip tono={vence.vencido || vence.dias <= 30 ? "ambar" : "neutro"} versalitas={false}>
          {textoContratoPorVencer(vence)}
        </Chip>
      )}
    </>
  );
}

function Fijos({ fijos, categorias, ubicaciones, proveedores, fichas, fichaDisponible, hoy }: { fijos: GastoFijoMes[]; categorias: CategoriaGasto[]; ubicaciones: UbicacionGastos[]; proveedores: ProveedorGasto[]; fichas: Record<string, ResumenFicha>; fichaDisponible: boolean; hoy: string }) {
  const [editar, setEditar] = useState<{ fijo?: GastoFijoMes } | null>(null);
  const [filtro, setFiltro] = useState(TODAS);
  const unidades = useMemo(() => unidadesDeFijos(fijos), [fijos]);
  const total = fijos.reduce((t, f) => t + f.monto, 0);
  const lista = useMemo(() => [...fijos].filter((f) => filtro === TODAS || claveUnidad(f) === filtro).sort((a, b) => diaDelFijo(a) - diaDelFijo(b)), [fijos, filtro]);
  const pagos = useMemo(() => pagosEnLaLinea(fijos, diasDelMes(hoy)), [fijos, hoy]);

  return (
    <section className="vs-liquido cv-bloque" data-luz data-guia="config.fijos" style={conVar({ "--e": 0 })}>
      <TituloSeccion
        ayuda="Lo que se paga todos los meses. El sistema lo propone cada mes en Finanzas ▸ Gastos ▸ Fijos del mes para registrarlo con lo que llegó de verdad; los variables (luz, agua) piden el monto del recibo. Uno que ya no se paga se archiva: sus gastos pasados se quedan."
        cuenta={fijos.length || undefined}
        dato={fijos.length ? `${solesRedondo(total)} al mes` : undefined}
        accion={
          <Boton type="button" peso="primario" onClick={() => setEditar({})}>
            + Agregar fijo
          </Boton>
        }
      >
        Lo que se paga cada mes
      </TituloSeccion>
      {fijos.length === 0 ? (
        <Vacio tamano="chico" icono={<CalendarClock />}>
          Todavía no hay gastos fijos. El alquiler, la luz o el contador: agrégalos una vez.
        </Vacio>
      ) : (
        <>
          <div className="cv-linea-mes" aria-hidden>
            <i className="pista" />
            <i className="pasado" style={conVar({ "--w": `${avanceDelMes(hoy) * 100}%` })} />
            {pagos.map((p, k) => (
              <span key={p.id} className="cv-pago" data-color={colorDeFijo(p)} style={conVar({ "--x": `${p.x * 100}%`, "--a": p.piso, "--k": k })} title={`${p.descripcion}: ${solesRedondo(p.monto)}`}>
                <span>{p.dia}</span>
              </span>
            ))}
            <div className="dias">
              <span>Día 1</span>
              <span>10</span>
              <span>20</span>
              <span>{diasDelMes(hoy)}</span>
            </div>
          </div>
          {unidades.length > 1 && (
            <div className="cv-par flex-wrap">
              {[{ clave: TODAS, nombre: "Todas" }, ...unidades].map((u) => (
                <button key={u.clave} type="button" className="pildora-cayla" aria-pressed={filtro === u.clave} onClick={() => setFiltro(u.clave)}>
                  {u.nombre}
                </button>
              ))}
            </div>
          )}
          <div className="cv-tarjetas">
            {lista.map((f, i) => (
              <div key={f.id} className="vs-dato cv-fijo" data-color={colorDeFijo(f)} style={conVar({ "--i": i })}>
                <span className="cv-dia-fijo" aria-hidden>
                  <b>{diaDelFijo(f)}</b>
                </span>
                <span className="vs-textos">
                  <span className="cv-nombre">{f.descripcion}</span>
                  <SePagaA f={f} r={fichas[f.id]} hoy={hoy} conFicha={fichaDisponible} />
                </span>
                <span className="cv-saldo">
                  {f.montoVariable ? "~" : ""}
                  {solesRedondo(f.monto)}
                </span>
                <LapizEditar que={f.descripcion} onClick={() => setEditar({ fijo: f })} />
              </div>
            ))}
          </div>
        </>
      )}
      {editar && <GastoFijoModal fijo={editar.fijo} categorias={categorias} ubicaciones={ubicaciones} proveedores={proveedores} esLider conDiasAntes={fijos.some((f) => f.diasAntes !== null)} ubicacionInicial={ubicaciones[0]?.id ?? "empresa"} onCerrar={() => setEditar(null)} />}
    </section>
  );
}

function Reparto({ filas, guardar }: { filas: FilaReparto[]; guardar: Guardar }) {
  // A la vista, lo que hoy se reparte; lo demás es todo de CAYLA y se pliega. Se decide al entrar: una fila que se pone en 0 no se esconde mientras se está mirando.
  const [conParte] = useState(() => new Set(filas.filter((f) => f.pct > 0).map((f) => f.categoria)));
  const [abierto, setAbierto] = useState(false);
  const aLaVista = filas.filter((f) => conParte.has(f.categoria));
  const plegadas = filas.filter((f) => !conParte.has(f.categoria));
  async function guardarParte(f: FilaReparto, nuevo: string) {
    const v = validarPct(nuevo);
    if (!v.ok) {
      avisar.error(v.error);
      return false;
    }
    if (v.valor === f.pct) return true;
    return guardar(() => createClient().rpc("guardar_reparto_claure" as never, { p_categoria: f.categoria, p_pct: v.valor } as never), "guardar el reparto de gastos", `${f.nombre}: ${etiquetaReparto(v.valor)}.`);
  }
  const fila = (f: FilaReparto, i: number) => (
    <div key={f.categoria} className="cv-fila cv-parte" title={f.ejemplos || undefined} style={conVar({ "--i": i })}>
      <span className="cv-parte-tx">
        <span className="cv-nombre">{f.nombre}</span>
        <BarraAvance pct={f.pct} tono="tinta" decorativa />
        <span className="vs-rotulo">{etiquetaReparto(f.pct)}</span>
      </span>
      <Casilla valor={textoPct(f.pct)} etiqueta={`Parte de CLAURE en ${f.nombre}, en porcentaje`} ancho="w-16" alGuardar={(n) => guardarParte(f, n)} />
      <span className="cv-unidad">%</span>
    </div>
  );
  return (
    <section className="vs-liquido cv-bloque" data-luz data-guia="config.claure-reparto" style={conVar({ "--e": 2 })}>
      <TituloSeccion ayuda="Solo del líder. Qué parte de cada gasto de Tienda Lima es de CLAURE, la empresa de Claudia: 0 es todo de CAYLA, 100 es todo de CLAURE. Esa parte baja lo que se le debe. Un porcentaje nuevo vale también para los gastos de antes.">
        Reparto con CLAURE
      </TituloSeccion>
      <div className="cv-tarjetas">
        {aLaVista.map((f, i) => fila(f, i))}
      </div>
      {plegadas.length > 0 && (
        <>
          <FilasDeMas abierto={abierto} id="cv-reparto">
            <div className="cv-tarjetas">{plegadas.map((f, i) => fila(f, i))}</div>
          </FilasDeMas>
          <BotonVerMas abierto={abierto} onCambiar={setAbierto} texto={`Ver ${plegadas.length} que son todo de CAYLA`} controla="cv-reparto" className="cv-ver-mas" />
        </>
      )}
    </section>
  );
}

export function VistaGastos({
  fijos,
  categorias,
  ubicaciones,
  proveedores,
  fichas,
  fichaDisponible,
  presupuesto,
  reparto,
  esLider,
  hoy,
}: {
  fijos: GastoFijoMes[];
  categorias: CategoriaGasto[];
  ubicaciones: UbicacionGastos[];
  proveedores: ProveedorGasto[];
  /** Lo que se sabe de cada fijo para pagarlo (ADR-0452), por id. */
  fichas: Record<string, ResumenFicha>;
  /** La base ya tiene la ficha. */
  fichaDisponible: boolean;
  presupuesto: ConfigPpto | null;
  /** `null`: no se pudo leer. Solo importa para el líder. */
  reparto: FilaReparto[] | null;
  esLider: boolean;
  hoy: string;
}) {
  const raiz = useRef<HTMLDivElement>(null);
  useLuzDelMouse(raiz);
  const { responsable, guardando, guardar } = useGuardarCasilla();
  return (
    <div className="vs-raiz" ref={raiz}>
      <div className="vs-firma" data-guia="config.guardado">
        <ComboResponsable control={responsable} deshabilitado={guardando} />
      </div>
      <Fijos fijos={fijos} categorias={categorias} ubicaciones={ubicaciones} proveedores={proveedores} fichas={fichas} fichaDisponible={fichaDisponible} hoy={hoy} />
      {presupuesto && <TopesDeGasto datos={presupuesto} hoy={hoy} guardar={guardar} guardando={guardando} responsable={<ComboResponsable control={responsable} deshabilitado={guardando} />} />}
      {esLider &&
        (reparto ? (
          <Reparto filas={reparto} guardar={guardar} />
        ) : (
          <Aviso tono="error" titulo="No se pudo leer el reparto con CLAURE">
            Recarga la página; si sigue, avísale al líder.
          </Aviso>
        ))}
    </div>
  );
}
