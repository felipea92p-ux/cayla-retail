"use client";

import { useEffect, useMemo, useState } from "react";
import { Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Boton } from "@/components/ui/campos";
import { MiniaturaPrenda } from "@/components/ui/PrendaCelda";
import { TituloGrupo, TituloSeccion } from "@/components/ui/TituloSeccion";
import { avisar } from "@/components/ui/Avisos";
import { HojaResolver, type QueSeResuelve } from "@/components/barrido-piso/HojaResolver";
import { categoriaDe } from "@/lib/categoria-de-prenda";
import type { Firma } from "@/lib/responsable-reglas";
import {
  BUCKET_FOTOS_BARRIDO,
  RPC_POR_RESOLVER_BARRIDO,
  detalleDePrenda,
  dondeEstaNoCargada,
  leerPorResolver,
  prendasPorResolver,
  type PorResolver as Lista,
  type PrendaBarrido,
} from "@/lib/barrido-piso-reglas";

/* ====================================================================
   PorResolver · lo que los barridos confirmados de la tienda dejaron sin cerrar (ADR-0690, actividad 8)

   Se ve cuando nadie está barriendo (durante un barrido, la pantalla es del escáner). Dos grupos: las prendas que se escanearon colgadas
   y el sistema no tiene en la tienda, y lo apartado sin etiqueta. Cada fila se cierra en «Resolver». La lista llega del servidor y se
   vuelve a leer al montarse (al confirmar un barrido, lo nuevo aparece sin recargar). Sin nada pendiente, no se dibuja.
   ==================================================================== */

export function PorResolver({
  ubicacionId,
  inicial,
  prendas,
  porId,
  firma,
  listo,
}: {
  ubicacionId: string;
  inicial: Lista | null;
  prendas: PrendaBarrido[];
  porId: ReadonlyMap<string, PrendaBarrido>;
  firma: () => Firma | null;
  listo: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [lista, setLista] = useState<Lista | null>(inicial);
  const [fotos, setFotos] = useState<Record<string, string>>({});
  const [abierto, setAbierto] = useState<QueSeResuelve | null>(null);

  // Al montarse se vuelve a leer: el barrido recién confirmado deja lo suyo aquí. Sin respuesta, queda lo que trajo el servidor.
  useEffect(() => {
    let vivo = true;
    supabase.rpc(RPC_POR_RESOLVER_BARRIDO as never, { p_ubicacion_id: ubicacionId } as never).then(({ data, error }) => {
      if (vivo && !error) setLista(leerPorResolver(data));
    });
    return () => {
      vivo = false;
    };
  }, [supabase, ubicacionId]);

  // Las fotos de lo apartado: enlaces de 10 minutos (el bucket es privado).
  const claveRutas = (lista?.apartados ?? [])
    .map((a) => a.fotoRuta)
    .filter((r): r is string => Boolean(r))
    .join("|");
  useEffect(() => {
    if (!claveRutas) return;
    let vivo = true;
    supabase.storage
      .from(BUCKET_FOTOS_BARRIDO)
      .createSignedUrls(claveRutas.split("|"), 600)
      .then(({ data }) => {
        if (!vivo) return;
        const porRuta: Record<string, string> = {};
        for (const f of data ?? []) if (f.path && f.signedUrl) porRuta[f.path] = f.signedUrl;
        setFotos(porRuta);
      });
    return () => {
      vivo = false;
    };
  }, [supabase, claveRutas]);

  if (!lista) return null;
  const total = prendasPorResolver(lista);
  if (total === 0) return null;

  return (
    <section data-guia="barrido.por-resolver" className="vd-placa space-y-3 rounded-[var(--radius-tarjeta,1rem)] p-4 sm:p-5">
      {/* El globito cuenta lo mismo que los de cada grupo (las filas por resolver); las prendas de cada una van en su línea. */}
      <TituloSeccion cuenta={lista.noCargadas.length + lista.apartados.length}>Por resolver</TituloSeccion>
      <p className="texto-bajada text-taupe">Lo que el barrido no pudo cuadrar solo.</p>

      {lista.noCargadas.length > 0 && (
        <div>
          <TituloGrupo cuenta={lista.noCargadas.length}>No están en el sistema de esta tienda</TituloGrupo>
          <ul className="mt-1 divide-y divide-tinta/10">
            {lista.noCargadas.map((n) => {
              const p = porId.get(n.varianteId);
              const detalle = p ? detalleDePrenda(p) : "";
              return (
                <li key={`${n.barridoId}:${n.varianteId}`} className="flex items-center gap-3 py-2.5">
                  <MiniaturaPrenda fotoUrl={p?.fotoUrl ?? null} colorHex={p?.colorHex ?? null} tamano="md" {...categoriaDe(p)} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-tinta">
                      {p ? p.referencia : n.prenda}
                      {detalle ? <span className="text-taupe"> · {detalle}</span> : null}
                    </p>
                    <p className="texto-detalle truncate text-taupe">
                      {n.pendientes > 1 ? `${n.pendientes} colgadas · ` : ""}
                      {dondeEstaNoCargada(n)}
                    </p>
                  </div>
                  <Boton peso="fantasma" type="button" className="btn-chico shrink-0" onClick={() => setAbierto({ tipo: "no_cargada", n })}>
                    Resolver
                  </Boton>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {lista.apartados.length > 0 && (
        <div>
          <TituloGrupo cuenta={lista.apartados.length}>Aparte, por etiquetar</TituloGrupo>
          <ul className="mt-1 divide-y divide-tinta/10">
            {lista.apartados.map((a) => {
              const foto = a.fotoRuta ? (fotos[a.fotoRuta] ?? null) : null;
              return (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  {foto ? (
                    // eslint-disable-next-line @next/next/no-img-element -- un enlace firmado de 10 minutos del bucket privado, no una imagen del sitio
                    <img src={foto} alt="" className="h-11 w-11 shrink-0 rounded-md border border-tinta/10 object-cover" />
                  ) : (
                    <span className="vd-lente grid h-11 w-11 shrink-0 place-items-center rounded-md text-taupe">
                      <Tag aria-hidden className="h-4 w-4" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-tinta">
                      {a.nota ?? (a.codigo ? `Código ${a.codigo}` : a.tipo === "sin_etiqueta" ? "Sin etiqueta" : "Código que no existe")}
                    </p>
                    <p className="texto-detalle truncate text-taupe">
                      {a.pendientes === 1 ? "1 prenda" : `${a.pendientes} prendas`} · apartó {a.por.split(" ")[0]}
                    </p>
                  </div>
                  <Boton peso="fantasma" type="button" className="btn-chico shrink-0" onClick={() => setAbierto({ tipo: "apartado", a, fotoUrl: foto })}>
                    Resolver
                  </Boton>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {abierto && (
        <HojaResolver
          ubicacionId={ubicacionId}
          que={abierto}
          prendas={prendas}
          porId={porId}
          firma={firma}
          listo={listo}
          onListo={(nueva) => {
            setLista(nueva);
            avisar.exito("Resuelto");
          }}
          onClose={() => setAbierto(null)}
        />
      )}
    </section>
  );
}
