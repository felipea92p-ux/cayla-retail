"use client";

import { useEffect, useState } from "react";
import { ARCHIVO_DE_LA_HISTORIA, enlaceParaCompartir, hrefTuLook, textoAlCompartir } from "@/lib/compartir-look";
import { HojaNativa } from "../instalar/HojaNativa";

type Imagen = { estado: "cargando" } | { estado: "lista"; archivo: File; url: string } | { estado: "sin_imagen" };

/**
 * «Compartir» de un look guardado (ADR-0434, actividad 9; lienzo v3, pantallas 8 y 9). Abre una hoja con la imagen para estados
 * (1080×1920, la arma el servidor solo para la dueña del look) y tres caminos: «Compartir» (la hoja del celular, con la imagen y el
 * enlace; sin poder mandar archivos, solo el enlace), «Descargar la imagen» y «Copiar el enlace». El enlace es la página pública del look
 * (`/tu-look`), sin cuenta y sin precios. La imagen se pide al abrir la hoja: así «Compartir» sale del toque de la persona, como pide el
 * celular, y no espera a la red.
 */
export function CompartirLook({ id, codigo }: { id: string; codigo: string }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <button type="button" className="t-btn t-btn-sec" onClick={() => setAbierta(true)}>
        Compartir
      </button>
      {abierta && <HojaDeCompartir id={id} codigo={codigo} alCerrar={() => setAbierta(false)} />}
    </>
  );
}

function HojaDeCompartir({ id, codigo, alCerrar }: { id: string; codigo: string; alCerrar: () => void }) {
  const [imagen, setImagen] = useState<Imagen>({ estado: "cargando" });
  const [copiado, setCopiado] = useState<"si" | "no" | null>(null);
  const enlace = typeof window === "undefined" ? hrefTuLook(codigo) : enlaceParaCompartir(window.location.origin, codigo);

  useEffect(() => {
    let vivo = true;
    let url: string | null = null;
    fetch(`/looks/guardado/${id}/historia`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const blob = await r.blob();
        if (!vivo) return;
        url = URL.createObjectURL(blob);
        setImagen({ estado: "lista", archivo: new File([blob], ARCHIVO_DE_LA_HISTORIA, { type: "image/png" }), url });
      })
      .catch(() => vivo && setImagen({ estado: "sin_imagen" }));
    return () => {
      vivo = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);

  const puedeCompartir = typeof navigator !== "undefined" && typeof navigator.share === "function";

  async function compartir() {
    const texto = textoAlCompartir(enlace);
    try {
      if (imagen.estado === "lista" && navigator.canShare?.({ files: [imagen.archivo] })) {
        await navigator.share({ files: [imagen.archivo], text: texto });
      } else {
        await navigator.share({ text: texto, url: enlace });
      }
      alCerrar();
    } catch {
      // La persona cerró la hoja del celular, o el celular no dejó: la hoja sigue aquí con los otros caminos.
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(enlace);
      setCopiado("si");
    } catch {
      setCopiado("no");
    }
  }

  return (
    <HojaNativa etiqueta="Comparte tu look" alCerrar={alCerrar}>
      <h2 className="t-inst-tit">
        Comparte tu <em>look</em>
      </h2>
      <p className="t-inst-txt">La imagen lleva la marca y el enlace a la tienda. Quien lo abre ve tu look sin precios y puede armar el suyo.</p>
      <div className="cl-previa" data-estado={imagen.estado}>
        {imagen.estado === "lista" ? (
          // eslint-disable-next-line @next/next/no-img-element -- es la imagen recién armada para esta persona (un blob), no una foto del catálogo
          <img src={imagen.url} alt="Tu look en una imagen para estados, con la marca y el enlace a la tienda" />
        ) : imagen.estado === "cargando" ? (
          <span role="status">Preparando tu imagen…</span>
        ) : (
          <span role="status">No pudimos preparar la imagen. Puedes copiar el enlace.</span>
        )}
      </div>
      <div className="t-inst-acc cl-acciones">
        {puedeCompartir && (
          <button type="button" className="t-btn t-btn-ancho" onClick={compartir}>
            Compartir
          </button>
        )}
        {imagen.estado === "lista" && (
          <a className={`t-btn t-btn-ancho${puedeCompartir ? " t-btn-sec" : ""}`} href={imagen.url} download={ARCHIVO_DE_LA_HISTORIA}>
            Descargar la imagen
          </a>
        )}
        <button type="button" className="t-enlace t-inst-ahora-no" onClick={copiar}>
          {copiado === "si" ? "Enlace copiado" : "Copiar el enlace"}
        </button>
        {copiado === "no" && (
          <p className="cl-enlace" role="status">
            Cópialo a mano: <span>{enlace}</span>
          </p>
        )}
      </div>
    </HojaNativa>
  );
}
