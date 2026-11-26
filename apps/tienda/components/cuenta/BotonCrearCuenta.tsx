"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { hrefConVolver, PARAMETRO_VOLVER, rutaParaVolver } from "@/lib/entrada";

/** «Crear mi cuenta», desde «Entrar»: lleva la página que la persona quería ver (`?volver=`), como lo hacía el formulario. */
export function BotonCrearCuenta() {
  const [volver, setVolver] = useState<string | null>(null);
  useEffect(() => {
    // La dirección solo la sabe el navegador (esta página se guarda en caché): leerla al iniciar el estado rompería la hidratación.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- el destino vive en la dirección, que solo existe en el navegador
    setVolver(rutaParaVolver(new URLSearchParams(window.location.search).get(PARAMETRO_VOLVER)));
  }, []);
  return (
    <Link className="t-btn t-btn-sec t-btn-ancho" href={hrefConVolver("/crear-cuenta", volver)}>
      Crear mi cuenta
    </Link>
  );
}
