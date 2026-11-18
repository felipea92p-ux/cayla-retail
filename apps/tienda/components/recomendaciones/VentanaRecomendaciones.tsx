"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { abrirVentanaRecomendaciones, type VentanaRecomendaciones as Datos } from "@/app/acciones/recomendaciones";
import "@/app/estilos/club.css";
import "@/app/estilos/recomendaciones.css";
import { Icono } from "../Icono";
import { FormularioRecomendacion } from "./FormularioRecomendacion";
import { MisRecomendaciones } from "./MisRecomendaciones";

type Pestana = "escribir" | "mias";

/**
 * La ventana de Recomendaciones (maqueta «A · Esquina»): el mismo formulario y la misma lista de respuestas de la página, dentro de una
 * hoja que flota. Al abrirse pregunta a la base (sesión, cupo y respuestas nuevas); sin sesión manda a «Entrar»; si la base no contesta, lo
 * dice y deja reintentar. Una vez abierta se queda montada (cerrada, oculta) para no perder lo que se estaba escribiendo. En el celular sube
 * desde el borde con un velo; Escape la cierra.
 */
export function VentanaRecomendaciones({ abierta, alCerrar }: { abierta: boolean; alCerrar: () => void }) {
  const router = useRouter();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [pestana, setPestana] = useState<Pestana>("escribir");
  const cerrar = useRef<HTMLButtonElement>(null);

  const [intento, setIntento] = useState(0);

  // Cada vez que se abre (o se pide reintentar) se lee de nuevo: cupo del día y respuestas que llegaron mientras tanto. El formulario ya
  // armado no se toca.
  useEffect(() => {
    if (!abierta) return;
    let vigente = true;
    abrirVentanaRecomendaciones()
      .then((d) => vigente && setDatos(d))
      .catch(() => vigente && setDatos({ estado: "sin_respuesta" }));
    return () => {
      vigente = false;
    };
  }, [abierta, intento]);

  useEffect(() => {
    if (abierta) cerrar.current?.focus();
  }, [abierta]);

  useEffect(() => {
    if (datos?.estado === "sin_sesion" && abierta) {
      alCerrar();
      router.push("/entrar");
    }
  }, [datos, abierta, alCerrar, router]);

  useEffect(() => {
    if (!abierta) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") alCerrar();
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [abierta, alCerrar]);

  const respondidas =
    datos?.estado === "ok" && datos.lectura.estado === "ok" ? datos.lectura.mias.recomendaciones.filter((r) => r.estado === "respondida").length : 0;

  return (
    <>
      <div className="rv-velo" hidden={!abierta} onClick={alCerrar} aria-hidden />
      <section className="rv-ventana" role="dialog" aria-label="Recomendaciones" hidden={!abierta}>
        <div className="rv-asa" aria-hidden />
        <header className="rv-cab">
          <h2 className="rv-titulo">
            Cuéntanos cómo <em>mejorar.</em>
          </h2>
          <button ref={cerrar} type="button" className="rv-x" onClick={alCerrar} aria-label="Cerrar">
            <Icono nombre="cerrar" />
          </button>
        </header>

        {datos?.estado === "ok" && (
          <div className="rv-pestanas" role="tablist">
            <button type="button" role="tab" aria-selected={pestana === "escribir"} onClick={() => setPestana("escribir")}>
              Escribir
            </button>
            <button type="button" role="tab" aria-selected={pestana === "mias"} onClick={() => setPestana("mias")}>
              Mis respuestas{respondidas > 0 && <span className="rv-cuantas">{respondidas}</span>}
            </button>
          </div>
        )}

        <div className="rv-cuerpo">
          {!datos || datos.estado === "sin_sesion" ? (
            <p className="w-texto-sec" role="status">
              Un momento…
            </p>
          ) : datos.estado === "ok" ? (
            <>
              <div hidden={pestana !== "escribir"}>
                <p className="w-texto-sec rv-bajada">Una idea, algo que te gustaría encontrar o algo que podamos hacer mejor. Lo lee el equipo de CAYLA.</p>
                <FormularioRecomendacion sedes={datos.sedes} nombre={datos.nombre} nombreCorto={datos.nombreCorto} tope={datos.tope} quedanHoy={datos.quedanHoy} />
              </div>
              <div hidden={pestana !== "mias"}>
                <MisRecomendaciones lectura={datos.lectura} />
              </div>
            </>
          ) : (
            <div role="status" className="rv-falla">
              <p className="w-texto-sec">
                {datos.estado === "sin_cuenta"
                  ? "Para escribirnos necesitas completar tu cuenta."
                  : "No pudimos cargar tus recomendaciones ahora. Vuelve a intentarlo en unos minutos."}
              </p>
              {datos.estado === "sin_cuenta" ? (
                <a className="t-btn t-btn-sec t-btn-chico" href="/cuenta">
                  Ir a mi cuenta
                </a>
              ) : (
                <button type="button" className="t-btn t-btn-sec t-btn-chico" onClick={() => setIntento((n) => n + 1)}>
                  Volver a intentar
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
