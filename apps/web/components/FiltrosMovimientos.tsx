"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CampoSelectNativo, CampoTexto } from "@/components/ui/campos";
import { CampoFecha } from "@/components/ui/CampoFecha";
import { CATEGORIAS, ETIQUETA_CATEGORIA, PROCESOS_FILTRO, etiquetaProceso, fechaCorta } from "@/lib/movimientos-reglas";

// Filtros de Movimientos. Viven en la URL (?q=…&cat=…&proc=…), igual que en
// Compras: la página es un Server Component que filtra en Postgres, el
// enlace se puede compartir («mirá lo que pasó con esta blusa»), y "atrás"
// vuelve al filtro anterior. Cambiar un filtro borra el cursor de paginado.
//
// El recorte por defecto de 30 días NO está en la URL, pero SÍ se muestra
// como chip: nadie debería preguntarse por qué no ve la venta de hace dos
// meses. Su × pone `rango=todo`, que apaga el recorte de forma explícita.
type Opcion = { id: string; nombre: string };

export function FiltrosMovimientos({
  sububicaciones,
  colaboradores,
  rangoPorDefecto,
  desdePorDefecto,
}: {
  /** Las de la ubicación que se mira; vacío = sin filtro de sububicación (Taller). */
  sububicaciones: Opcion[];
  /** Solo una Líder filtra por persona (la lista sale de `fn_colaboradores`,
   *  que es líder-only). Null = el control no se muestra. */
  colaboradores: Opcion[] | null;
  rangoPorDefecto: boolean;
  /** El «desde» que la página aplicó cuando rige el recorte por defecto. */
  desdePorDefecto: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [busqueda, setBusqueda] = useState(params.get("q") ?? "");
  const primera = useRef(true);

  function aplicar(cambios: Record<string, string>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(cambios)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    p.delete("cursor");
    p.delete("mov");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  // La búsqueda se manda sola al dejar de tipear (350 ms): sin botón, pero
  // sin una consulta por tecla.
  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== busqueda.trim()) aplicar({ q: busqueda.trim() });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busqueda]);

  // Un chip por filtro aplicado, con qué borrar al tocar la ×.
  const chips: { texto: string; quitar: Record<string, string> }[] = [];
  const q = params.get("q");
  if (q) chips.push({ texto: `«${q}»`, quitar: { q: "" } });
  const cat = CATEGORIAS.find((c) => c === params.get("cat"));
  if (cat) chips.push({ texto: ETIQUETA_CATEGORIA[cat], quitar: { cat: "" } });
  const proc = params.get("proc");
  if (proc) chips.push({ texto: etiquetaProceso(proc), quitar: { proc: "" } });
  const sub = params.get("sub");
  if (sub) chips.push({ texto: sububicaciones.find((s) => s.id === sub)?.nombre ?? "Sububicación", quitar: { sub: "" } });
  const usuario = params.get("usuario");
  if (usuario) chips.push({ texto: colaboradores?.find((c) => c.id === usuario)?.nombre ?? "Persona", quitar: { usuario: "" } });
  const desde = params.get("desde");
  const hasta = params.get("hasta");
  if (desde || hasta) {
    chips.push({
      texto: desde && hasta ? `${fechaCorta(desde)} – ${fechaCorta(hasta)}` : desde ? `Desde ${fechaCorta(desde)}` : `Hasta ${fechaCorta(hasta ?? "")}`,
      quitar: { desde: "", hasta: "" },
    });
  } else if (rangoPorDefecto) {
    chips.push({ texto: "Últimos 30 días", quitar: { rango: "todo" } });
  }
  // «Limpiar todo» vuelve a la pantalla tal cual se abre (con el recorte de 30
  // días): solo se ofrece si hay algo aplicado a mano.
  const hayAlgoAMano = chips.some((c) => !("rango" in c.quitar)) || params.get("rango") === "todo";

  return (
    <div className="card-cayla p-4">
      <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
        <CampoTexto
          etiqueta="Buscar"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Prenda, SKU o código de barras"
          autoComplete="off"
          type="search"
        />
        <CampoSelectNativo etiqueta="Tipo" value={cat ?? ""} onChange={(e) => aplicar({ cat: e.target.value })}>
          <option value="">Todos</option>
          {CATEGORIAS.map((c) => (
            <option key={c} value={c}>{ETIQUETA_CATEGORIA[c]}</option>
          ))}
        </CampoSelectNativo>
        <CampoSelectNativo etiqueta="Proceso" value={proc ?? ""} onChange={(e) => aplicar({ proc: e.target.value })}>
          <option value="">Todos</option>
          {PROCESOS_FILTRO.map((p) => (
            <option key={p.valor} value={p.valor}>{p.etiqueta}</option>
          ))}
        </CampoSelectNativo>
        {sububicaciones.length > 0 && (
          <CampoSelectNativo etiqueta="Sububicación" value={sub ?? ""} onChange={(e) => aplicar({ sub: e.target.value })}>
            <option value="">Todas</option>
            {sububicaciones.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </CampoSelectNativo>
        )}
        {colaboradores && (
          <CampoSelectNativo etiqueta="Persona" value={usuario ?? ""} onChange={(e) => aplicar({ usuario: e.target.value })}>
            <option value="">Todas</option>
            {colaboradores.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </CampoSelectNativo>
        )}
        {/* Con el recorte por defecto vigente, «Desde» muestra la fecha que
            rige aunque no esté en la URL — el control dice la verdad. Tocarlo
            la vuelve explícita. */}
        <CampoFecha etiqueta="Desde" valor={desde ?? (rangoPorDefecto ? desdePorDefecto : "")} onValor={(v) => aplicar({ desde: v, rango: "" })} />
        <CampoFecha etiqueta="Hasta" valor={hasta ?? ""} onValor={(v) => aplicar({ hasta: v, rango: "" })} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <button
            key={c.texto}
            type="button"
            onClick={() => {
              if ("q" in c.quitar) setBusqueda("");
              aplicar(c.quitar);
            }}
            className="label-cayla inline-flex items-center gap-1.5 rounded-full border border-tinta/15 bg-tinta/[0.04] px-2.5 py-1 text-[10px] text-tinta/75 transition-colors hover:border-rojo hover:text-rojo"
            aria-label={`Quitar filtro ${c.texto}`}
          >
            {c.texto}
            <span aria-hidden className="text-sm leading-none">×</span>
          </button>
        ))}
        {params.get("rango") === "todo" && !desde && !hasta && (
          <span className="label-cayla px-1 text-[10px] text-tinta/55">Todo el historial</span>
        )}
        {hayAlgoAMano && (
          <button
            type="button"
            onClick={() => {
              setBusqueda("");
              const ubicacion = params.get("ubicacion");
              router.push(ubicacion ? `${pathname}?ubicacion=${ubicacion}` : pathname);
            }}
            className="label-cayla px-1 text-[10px] text-tinta/55 hover:text-rojo"
          >
            Limpiar todo
          </button>
        )}
      </div>
    </div>
  );
}
