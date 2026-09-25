"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { CabeceraPantalla } from "@/components/ui/CabeceraPantalla";
import { TarjetaCifra } from "@/components/ui/TarjetaCifra";
import { CabeceraBloque, Superficie } from "@/components/finanzas/kit";
import { GraficoSemanas } from "@/components/finanzas/GraficoSemanas";
import { VerPorPagar } from "@/components/finanzas/PorPagarAcciones";
import { ResumenDecidir } from "@/components/finanzas/ResumenDecidir";
import { soles } from "@/lib/flujo-caja-reglas";
import { mesNombre } from "@/lib/resultados-reglas";
import {
  avisosParaDecidir,
  bajadaResumen,
  barrasSemanas,
  caminoEquilibrio,
  cifrasResumen,
  claveVer,
  coberturaTiendas,
  frasesSalud,
  miniPresupuesto,
  motivoAusencia,
  notaUnidad,
  noRevisado,
  tituloResumen,
  type Acceso,
  type ResumenFinanzas,
} from "@/lib/resumen-finanzas-reglas";

// Finanzas ▸ Resumen (ADR-0195 F10), dibujado como el spike aprobado (docs/maquetas/finanzas-2026-09/, `vista-resumen.js`):
// cabecera con «Ver» → la salud en frases → cinco cifras → «Para decidir hoy» a la izquierda y, a la derecha, los dos gráficos
// de CAYLA entera (¿cada tienda cubre sus costos? y el saldo de las próximas 6 semanas) o, mirando una tienda, el camino a
// su punto de equilibrio y su presupuesto. No calcula plata: todo viene de `fn_resumen_finanzas`, que llama a cada fase, y
// de `lib/resumen-finanzas-reglas.ts`, que decide qué se dice primero. Es cliente porque los gráficos reciben cómo escribir
// cada valor (una función); recibe datos planos del servidor y no guarda estado propio.

const entra = (i: number) => ({ className: "anim-entra", style: { ["--i" as string]: i } as CSSProperties });
const mayuscula = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

export function ResumenFinanzasPanel({ resumen, falla, acceso }: { resumen: ResumenFinanzas | null; falla: string | null; acceso: Acceso }) {
  if (!resumen) {
    return (
      <div className="space-y-6">
        <CabeceraPantalla sobretitulo="Finanzas · Resumen" titulo="Resumen" bajada="Cómo está el negocio y qué conviene decidir hoy." accionesAbajo />
        <p className="card-cayla border-dashed px-5 py-4 text-sm text-tinta/75">{falla ?? "No se pudo leer el resumen."}</p>
      </div>
    );
  }
  const r = resumen;
  const frases = frasesSalud(r);
  const cifras = cifrasResumen(r);
  const avisos = avisosParaDecidir(r, acceso);
  const faltan = noRevisado(r);
  const ver = { clave: claveVer(r.ver), ubicacionId: r.ver.ubicacionId, soloEmpresa: r.ver.soloEmpresa };
  const unidades = r.lider ? r.unidades.map((u) => ({ id: u.id, nombre: u.nombre })) : [{ id: r.ver.ubicacionId ?? "", nombre: r.ver.nombre }];

  return (
    <div className="space-y-6">
      <CabeceraPantalla
        sobretitulo="Finanzas · Resumen"
        titulo={tituloResumen(r)}
        bajada={bajadaResumen(r)}
        accionesAbajo
        acciones={<VerPorPagar ver={ver} unidades={unidades} esLider={r.lider} />}
      />

      {frases.length > 0 && (
        <section className="fin-salud" aria-label="Cómo está">
          {frases.map((f, i) => (
            <div key={f.clave} className="fin-frase anim-entra" style={{ ["--i" as string]: i + 1 } as CSSProperties} data-tono={f.tono} title={`Sale de ${f.origen}`}>
              <b>{f.n}</b>
              <div className="min-w-0">
                <p className="fin-frase-t">{f.t}</p>
                <p className="fin-frase-d">{f.d}</p>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="fin-cifras fin-cinco" aria-label="Los números del mes">
        {cifras.map((c, i) => (
          <TarjetaCifra key={c.clave} compacta etiqueta={c.etiqueta} valor={c.valor} tono={c.rojo ? "text-rojo" : undefined} {...entra(i + 4)}>
            <span title={`Sale de ${c.origen}`}>{c.detalle}</span>
          </TarjetaCifra>
        ))}
      </section>

      <section className="fin-dos-col fin-dos-col-izq">
        <div {...entra(9)}>
          <Superficie pad>
            <CabeceraBloque titulo="Para decidir hoy" bajada="Primero lo que más cuesta si se deja pasar. Cada aviso dice cuánto está en juego." />
            <ResumenDecidir avisos={avisos} parcial={faltan.length > 0} />
            {faltan.length > 0 && (
              <ul className="fin-no-revisado">
                {faltan.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            )}
          </Superficie>
        </div>

        <div className="fin-columna">
          {r.ver.todas ? (
            <>
              <Cobertura r={r} />
              <Semanas r={r} />
            </>
          ) : r.ver.tipo === "tienda" ? (
            <>
              <Camino r={r} />
              <MiniPresupuesto r={r} acceso={acceso} />
            </>
          ) : (
            notaUnidad(r) && (
              <div className="nota-cayla anim-entra" style={{ ["--i" as string]: 10 } as CSSProperties}>
                {notaUnidad(r)}
              </div>
            )
          )}
        </div>
      </section>
    </div>
  );
}

function Cobertura({ r }: { r: ResumenFinanzas }) {
  const { barras, sinDatos } = coberturaTiendas(r);
  const mes = mesNombre(r.mesAnterior);
  return (
    <div {...entra(10)}>
      <Superficie pad>
        <CabeceraBloque titulo="¿Cada tienda cubre sus costos?" bajada={`${mayuscula(mes)}: lo que vendió contra lo que necesitaba vender (100 %).`} />
        {r.resultadosAnterior.estado !== "ok" ? (
          <p className="fin-nota-bloque">{motivoAusencia(r.resultadosAnterior) ?? "El estado de resultados no se pudo leer."}</p>
        ) : barras.length ? (
          <GraficoSemanas
            etiqueta={`Lo que vendió cada tienda en ${mes} contra su punto de equilibrio`}
            barras={barras}
            alto={190}
            ancho={560}
            umbral={100}
            umbralTexto="100 % = cubre sus costos justos"
            etiquetaValor={(v) => `${v} %`}
          />
        ) : (
          <p className="fin-nota-bloque">Todavía no hay un mes completo con ventas para calcularlo.</p>
        )}
        {barras.length > 0 && sinDatos.length > 0 && (
          <p className="fin-nota-bloque">
            Sin ventas en {mes}: {sinDatos.join(", ")}.
          </p>
        )}
      </Superficie>
    </div>
  );
}

function Semanas({ r }: { r: ResumenFinanzas }) {
  return (
    <div {...entra(11)}>
      <Superficie pad>
        <CabeceraBloque titulo="Saldo de las próximas 6 semanas" bajada="Lo que hay hoy + lo que entra − lo que vence." />
        {r.flujo.estado === "ok" ? (
          <GraficoSemanas
            etiqueta={`Lo que queda cada semana, contra tu mínimo de caja de ${soles(r.flujo.datos.minimoCaja)}`}
            barras={barrasSemanas(r.flujo.datos)}
            alto={200}
            ancho={560}
            umbral={r.flujo.datos.minimoCaja}
            umbralTexto={`tu mínimo de caja: ${soles(r.flujo.datos.minimoCaja)} (se cambia en Configuración)`}
            etiquetaValor={soles}
          />
        ) : (
          <p className="fin-nota-bloque">{motivoAusencia(r.flujo, "el líder") ?? "El flujo de caja no se pudo leer."}</p>
        )}
      </Superficie>
    </div>
  );
}

function Camino({ r }: { r: ResumenFinanzas }) {
  const c = caminoEquilibrio(r);
  return (
    <div {...entra(10)}>
      <Superficie pad>
        <CabeceraBloque
          titulo="Camino al punto de equilibrio"
          bajada={`${mayuscula(mesNombre(r.mes))} al día ${Number(r.hoy.slice(8, 10))} contra lo que necesita vender en el mes (según ${mesNombre(r.mesAnterior)}).`}
        />
        {c ? (
          <>
            <div className="fin-umbral-barra fin-alto" role="img" aria-label={`Vendido ${soles(c.vendido)} de ${soles(c.pe)}`}>
              <i style={{ width: `${c.ancho}%` }} />
            </div>
            <div className="fin-marcas">
              <span>Vendido {soles(c.vendido)}</span>
              <span>Necesita {soles(c.pe)}</span>
            </div>
            <p className="fin-nota-bloque">{c.texto}</p>
          </>
        ) : (
          <p className="fin-nota-bloque">
            {r.resultadosAnterior.estado !== "ok"
              ? (motivoAusencia(r.resultadosAnterior) ?? "")
              : `Sin ventas con margen en ${mesNombre(r.mesAnterior)} para calcular cuánto necesita vender.`}
          </p>
        )}
      </Superficie>
    </div>
  );
}

function MiniPresupuesto({ r, acceso }: { r: ResumenFinanzas; acceso: Acceso }) {
  const filas = miniPresupuesto(r);
  const href = `/finanzas/reportes/presupuesto${r.lider && r.ver.ubicacionId ? `?ver=${r.ver.ubicacionId}` : ""}`;
  return (
    <div {...entra(11)}>
      <Superficie pad>
        <CabeceraBloque titulo="Presupuesto del mes" bajada="Gastado a la fecha contra su tope; el % es la proyección al cierre.">
          {(acceso.lider || acceso.modulos.includes("reportes_financieros")) && (
            <Link href={href} className="btn-cayla btn-sutil btn-chico shrink-0">
              Ver todo
            </Link>
          )}
        </CabeceraBloque>
        {r.presupuesto.estado !== "ok" ? (
          <p className="fin-nota-bloque">{motivoAusencia(r.presupuesto) ?? ""}</p>
        ) : filas.length ? (
          <ul className="fin-lista-mov">
            {filas.map((f) => (
              <li key={f.nombre}>
                <span>{f.nombre}</span>
                <span>
                  {soles(f.real)} de {soles(f.tope)} ·{" "}
                  <b className="fin-pct" data-tono={f.tono}>
                    {f.pct}
                  </b>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="fin-nota-bloque">Este mes no tiene topes. Se ponen en Configuración ▸ Presupuesto.</p>
        )}
      </Superficie>
    </div>
  );
}
