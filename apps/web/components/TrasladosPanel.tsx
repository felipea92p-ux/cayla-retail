"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TrasladosAtencion } from "@/components/TrasladosAtencion";
import { TrasladosFiltros } from "@/components/TrasladosFiltros";
import { TrasladosLista } from "@/components/TrasladosLista";
import { TrasladosResumen } from "@/components/TrasladosResumen";
import {
  coincideBusqueda,
  coincideDireccion,
  coincideFiltro,
  masUrgente,
  ordenarTraslados,
  otraSedeDe,
  resumirTraslados,
  situacionTraslado,
  type ContextoTraslados,
  type FiltroDireccion,
  type FiltroTraslado,
} from "@/lib/traslados-reglas";
import type { TrasladoResumen } from "@/lib/traslados";

// Lo que la pantalla de Traslados dibuja debajo del título: la franja de
// atención, los cuatro indicadores, los filtros y la tabla. Es el único
// componente con estado; los demás pintan lo que reciben.
//
// Todo se calcula acá, en memoria, sobre lo que la página trajo, y con UN solo
// «ahora» (`ahoraIso`, fijado por el servidor): el HTML del servidor y el del
// navegador dicen lo mismo, y los números de las tarjetas, los chips, la franja
// y el contador del menú salen de la misma regla (`traslados-reglas.ts`).
const POR_PAGINA = 20;

export function TrasladosPanel({
  traslados,
  miUbicacionId,
  puedeCerrarDiferencia,
  ahoraIso,
  horaCarga,
  cerradosAcotados,
}: {
  traslados: TrasladoResumen[];
  miUbicacionId: string;
  puedeCerrarDiferencia: boolean;
  ahoraIso: string;
  horaCarga: string;
  cerradosAcotados: boolean;
}) {
  const router = useRouter();
  const [refrescando, iniciarRefresco] = useTransition();
  const [filtro, setFiltro] = useState<FiltroTraslado>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [masAbierto, setMasAbierto] = useState(false);
  const [direccion, setDireccion] = useState<FiltroDireccion>("todas");
  const [sede, setSede] = useState("");
  const [limite, setLimite] = useState(POR_PAGINA);

  const ctx = useMemo<ContextoTraslados>(() => ({ miUbicacionId, puedeCerrarDiferencia, ahoraIso }), [miUbicacionId, puedeCerrarDiferencia, ahoraIso]);
  const filas = useMemo(() => ordenarTraslados(traslados, ctx).map((t) => ({ t, s: situacionTraslado(t, ctx) })), [traslados, ctx]);
  const resumen = useMemo(() => resumirTraslados(traslados, ctx), [traslados, ctx]);
  const urgente = useMemo(() => masUrgente(traslados, ctx), [traslados, ctx]);
  const sedes = useMemo(() => {
    const porId = new Map<string, string>();
    for (const t of traslados) {
      const o = otraSedeDe(t, miUbicacionId);
      porId.set(o.id, o.nombre);
    }
    return Array.from(porId, ([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [traslados, miUbicacionId]);

  // Si el filtro elegido se queda sin traslados (recién confirmaste el último) o la sede elegida ya no
  // aparece, se vuelve a «Todos» en vez de dejar una lista vacía y un chip apagado.
  const filtroEfectivo: FiltroTraslado = filtro !== "todos" && resumen.porFiltro[filtro] === 0 ? "todos" : filtro;
  const sedeEfectiva = sedes.some((s) => s.id === sede) ? sede : "";
  const masActivos = (direccion !== "todas" ? 1 : 0) + (sedeEfectiva ? 1 : 0);
  const hayFiltros = filtroEfectivo !== "todos" || busqueda.trim() !== "" || masActivos > 0;

  const filtradas = filas.filter(
    ({ t, s }) =>
      coincideFiltro(s, filtroEfectivo) &&
      coincideDireccion(t, miUbicacionId, direccion) &&
      (!sedeEfectiva || otraSedeDe(t, miUbicacionId).id === sedeEfectiva) &&
      coincideBusqueda(t, busqueda)
  );
  const visibles = filtradas.slice(0, limite);

  // La pantalla es una foto del momento de carga, pero «ya debió llegar» depende del reloj: un traslado
  // pasa a pedir acción sin que nada cambie en la base. Por eso se vuelve a pedir sola cada minuto mientras
  // la pestaña está a la vista, y al volver a ella si hace más de 30 s. `router.refresh()` conserva el estado
  // de esta pantalla (filtros, búsqueda, página) y también actualiza el número del menú.
  const ultimoRefresco = useRef(0);
  useEffect(() => {
    ultimoRefresco.current = Date.now();
    const refrescar = () => {
      ultimoRefresco.current = Date.now();
      router.refresh();
    };
    const cada = setInterval(() => {
      if (document.visibilityState === "visible") refrescar();
    }, 60_000);
    const alVolver = () => {
      if (document.visibilityState === "visible" && Date.now() - ultimoRefresco.current > 30_000) refrescar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(cada);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [router]);

  // Cualquier cambio de filtro vuelve a la primera página.
  function alFiltrar<T>(poner: (v: T) => void) {
    return (v: T) => {
      poner(v);
      setLimite(POR_PAGINA);
    };
  }
  function limpiarTodo() {
    setFiltro("todos");
    setBusqueda("");
    setDireccion("todas");
    setSede("");
    setLimite(POR_PAGINA);
  }
  // «Mostrar más» deja el foco en el primer traslado nuevo: en la última página el botón desaparece y el
  // foco se perdería; en las demás, las filas nuevas quedarían detrás del botón en el orden de Tab.
  function mostrarMas() {
    const primeroNuevo = filtradas[visibles.length]?.t.id;
    setLimite((l) => l + POR_PAGINA);
    if (primeroNuevo) setTimeout(() => document.getElementById(`traslado-${primeroNuevo}`)?.focus(), 0);
  }
  function limpiarMas() {
    setDireccion("todas");
    setSede("");
    setLimite(POR_PAGINA);
  }

  if (traslados.length === 0) {
    return (
      <div className="card-cayla space-y-3 p-6 text-sm text-taupe">
        <p>Todavía no hay traslados desde ni hacia esta sede.</p>
        <Link href="/inventario/mover" className="btn-cayla btn-primario">
          Crear el primero →
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Región en vivo PERMANENTE: la de la tabla se desmonta cuando no hay resultados, justo cuando hay que
          avisar que no hay resultados. */}
      <p className="sr-only" aria-live="polite">
        {filtradas.length === 0 ? "Ningún traslado coincide con lo que buscas." : `Mostrando ${visibles.length} de ${filtradas.length} traslados.`}
      </p>
      <TrasladosAtencion resumen={resumen} masUrgente={urgente ? { id: urgente.id, numero: urgente.numero } : null} />
      <TrasladosResumen resumen={resumen} filtro={filtroEfectivo} onFiltro={alFiltrar(setFiltro)} />
      {/* Guía oficial (2026-09-22, ADR-0167): buscador, píldoras y tabla en UNA tarjeta. */}
      <div className="card-cayla overflow-hidden">
      <div className="p-4 sm:p-5">
      <TrasladosFiltros
        filtro={filtroEfectivo}
        onFiltro={alFiltrar(setFiltro)}
        conteos={resumen.porFiltro}
        busqueda={busqueda}
        onBusqueda={alFiltrar(setBusqueda)}
        masAbierto={masAbierto}
        onToggleMas={() => setMasAbierto((v) => !v)}
        direccion={direccion}
        onDireccion={alFiltrar(setDireccion)}
        sede={sedeEfectiva}
        onSede={alFiltrar(setSede)}
        sedes={sedes}
        masActivos={masActivos}
        onLimpiarMas={limpiarMas}
      />
      </div>
      {/* La tabla va a sangre, sin el relleno de la tarjeta: sus 6 columnas necesitan el ancho completo. */}
      <div className="border-t border-sand">
      <TrasladosLista
        filas={visibles}
        totalFiltrados={filtradas.length}
        totalTraslados={traslados.length}
        miUbicacionId={miUbicacionId}
        ahoraIso={ahoraIso}
        horaCarga={horaCarga}
        hayFiltros={hayFiltros}
        cerradosAcotados={cerradosAcotados}
        onLimpiar={limpiarTodo}
        onMostrarMas={mostrarMas}
        siguientePagina={Math.min(POR_PAGINA, filtradas.length - visibles.length)}
        onRefrescar={() => iniciarRefresco(() => router.refresh())}
        refrescando={refrescando}
      />
      </div>
      </div>
    </div>
  );
}
