"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useSyncExternalStore } from "react";
import { Icono } from "./Icono";

/**
 * La franja «Ver lo que hay en» mientras llega una página (2026-10-17, Felipe: «cuando cambia de vista es muy abrupto»): antes eran
 * píldoras grises que, al llegar, se volvían «Todas · Lima · Trujillo»; ahora son las tiendas de la última franja que se vio
 * (`RecordarTiendas`, dentro de `FiltroTienda`), con la de la dirección marcada (los enlaces llevan la tienda elegida, `?sede=`). Sin
 * ninguna vista (recién abierta la pestaña), las píldoras grises de siempre: es lo que manda el servidor, así que hidrata igual.
 */
type TiendaVista = { nombre: string; clave: string | null };
let ultimas: TiendaVista[] | null = null;
const sinAvisos = () => () => {};
const lasUltimas = () => ultimas;
const ninguna = () => null;

/** La pone `FiltroTienda`: guarda sus tiendas para la próxima espera. No dibuja nada. */
export function RecordarTiendas({ tiendas }: { tiendas: TiendaVista[] }) {
  useEffect(() => {
    ultimas = tiendas;
  }, [tiendas]);
  return null;
}

/** La franja del esqueleto: la última vista, con la tienda de la dirección marcada; o las píldoras grises. */
export function TiendasDeEspera() {
  const vistas = useSyncExternalStore(sinAvisos, lasUltimas, ninguna);
  if (!vistas) return <Grises />;
  return (
    <Suspense fallback={<Franja tiendas={vistas} elegida={undefined} />}>
      <ConLaElegida tiendas={vistas} />
    </Suspense>
  );
}

function ConLaElegida({ tiendas }: { tiendas: TiendaVista[] }) {
  const sede = useSearchParams().get("sede");
  return <Franja tiendas={tiendas} elegida={sede && tiendas.some((t) => t.clave === sede) ? sede : null} />;
}

function Franja({ tiendas, elegida }: { tiendas: TiendaVista[]; elegida: string | null | undefined }) {
  return (
    <div className="t-ubic t-filtro-tienda" aria-hidden="true">
      <Icono nombre="tienda" />
      <span className="t-filtro-txt">Ver lo que hay en</span>
      <span className="t-pildoras-tienda">
        {tiendas.map((t) => (
          <span key={t.clave ?? ""} className="t-pildora-mini" aria-current={elegida !== undefined && t.clave === elegida ? "true" : undefined}>
            {t.nombre}
          </span>
        ))}
      </span>
    </div>
  );
}

function Grises() {
  return (
    <div className="t-ubic t-esqueleto-ubic" aria-hidden="true">
      <Icono nombre="tienda" />
      <span className="t-pildoras-tienda">
        {[56, 72, 50, 64].map((ancho) => (
          <i key={ancho} className="t-pildora-mini" style={{ width: ancho }} />
        ))}
      </span>
    </div>
  );
}
