"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Sparkles } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { Boton } from "@/components/ui/campos";
import { BotonFoto } from "@/components/alta-producto/FotosAlta";
import { avisar } from "@/components/ui/Avisos";
import { objecionFotoProducto } from "@/lib/producto-fotos";

// La hoja de ángulos de «Catálogo con IA» (ficha: docs/milimetro/catalogo-con-ia.md). La foto de frente ya viene elegida; la espalda y un detalle
// de la tela son opcionales y le muestran a la IA lo que el gancho tapa. Si la prenda ya tiene molde (otro color con foto de IA), lo dice:
// este color saldrá con la misma forma. «Preparar foto» cierra la hoja al instante: la foto se prepara en su cuadro (`useCatalogoIA`).
// Textos según «Poco texto a la vista» (CLAUDE.md): un nombre y una línea corta por casilla; el tiempo y el costo, junto al botón que los gasta.

export type PedidoCatalogo = { color: string | null; frente: File; espalda: File | null; detalle: File | null };
type Angulo = "frente" | "espalda" | "detalle";

const CASILLAS: { angulo: Angulo; titulo: string; linea: string; opcional: boolean }[] = [
  { angulo: "frente", titulo: "De frente", linea: "Entera, como siempre.", opcional: false },
  { angulo: "espalda", titulo: "Espalda", linea: "Escote y caída.", opcional: true },
  { angulo: "detalle", titulo: "Detalle de la tela", linea: "De cerca, con buena luz.", opcional: true },
];

export function HojaCatalogoIA({
  nombreColor,
  inicial,
  molde,
  onPreparar,
  onClose,
}: {
  nombreColor: string;
  inicial: PedidoCatalogo;
  /** El molde de la prenda, si ya hay uno de otro color (`url` vacía mientras ese color todavía se prepara). */
  molde: { url: string | null; nombreColor: string } | null;
  onPreparar: (p: PedidoCatalogo) => void;
  onClose: () => void;
}) {
  const [pedido, setPedido] = useState<PedidoCatalogo>(inicial);
  // La hoja tarda en irse (su animación de salida): un doble clic en «Preparar foto» la prepararía dos veces, con doble gasto y doble foto.
  const enviado = useRef(false);
  // Las vistas locales (blob:) se crean y se liberan en el mismo efecto: creadas en el render, el doble montaje de desarrollo las liberaba
  // antes de dibujarlas.
  const [vistas, setVistas] = useState<Record<Angulo, string | null>>({ frente: null, espalda: null, detalle: null });
  useEffect(() => {
    const nuevas = {
      frente: URL.createObjectURL(pedido.frente),
      espalda: pedido.espalda ? URL.createObjectURL(pedido.espalda) : null,
      detalle: pedido.detalle ? URL.createObjectURL(pedido.detalle) : null,
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- las URL locales viven lo que vive el archivo elegido
    setVistas(nuevas);
    return () => Object.values(nuevas).forEach((u) => u && URL.revokeObjectURL(u));
  }, [pedido]);

  function poner(angulo: Angulo, archivos: File[]) {
    const f = archivos[0];
    if (!f) return;
    const objecion = objecionFotoProducto(f);
    if (objecion) {
      avisar.error("Esa foto no se puede usar", { detalle: objecion });
      return;
    }
    setPedido((p) => ({ ...p, [angulo]: f }));
  }

  // Lo medido el 2026-11-13: 0,051 USD solo el frente; con molde o más fotos, ~0,06.
  const costo = molde || pedido.espalda || pedido.detalle ? "0,06" : "0,05";

  return (
    <Modal titulo={`Foto de catálogo · ${nombreColor}`} subtitulo="Más ángulos, más parecida a la real." tamano="ancha" onClose={onClose}>
      {(cerrar) => (
        <div className="space-y-5">
          {molde && (
            <div className="flex w-fit items-center gap-3 rounded-2xl border border-sand bg-hueso p-2 pr-4">
              {molde.url ? (
                <span className="relative block aspect-[4/5] w-11 shrink-0 overflow-hidden rounded-lg border border-dashed border-borde-control">
                  {/* eslint-disable-next-line @next/next/no-img-element -- el molde puede ser una vista local (blob:) del alta */}
                  <img src={molde.url} alt="" className="absolute inset-0 h-full w-full object-contain" />
                </span>
              ) : (
                <Sparkles aria-hidden className="h-5 w-5 text-taupe" />
              )}
              <span className="text-sm">
                <b className="block font-semibold text-tinta">Misma forma que {molde.nombreColor}</b>
                <span className="text-taupe">Solo cambia el color.</span>
              </span>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3.5">
            {CASILLAS.map((c) => {
              const vista = vistas[c.angulo];
              return (
                <div key={c.angulo} className="flex flex-col gap-2">
                  <span className="campo-etiqueta">
                    {c.titulo}
                    {c.opcional && <span className="font-normal normal-case tracking-normal text-taupe"> · opcional</span>}
                  </span>
                  <BotonFoto
                    onArchivos={(a) => poner(c.angulo, a)}
                    disabled={false}
                    etiqueta={vista ? `Cambiar la foto: ${c.titulo.toLowerCase()}` : `Agregar la foto: ${c.titulo.toLowerCase()}`}
                    className={`relative grid aspect-[4/5] w-full place-content-center justify-items-center gap-2 overflow-hidden rounded-xl text-center text-sm text-taupe transition-colors ${
                      vista ? "border border-sand" : "border-[1.5px] border-dashed border-borde-control hover:border-tinta hover:text-tinta"
                    }`}
                  >
                    {vista ? (
                      // eslint-disable-next-line @next/next/no-img-element -- vista local (blob:), no pasa por el optimizador
                      <img src={vista} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <>
                        <Camera aria-hidden className="h-5 w-5" />
                        Agregar
                      </>
                    )}
                  </BotonFoto>
                  <span className="text-sm text-taupe">{c.linea}</span>
                </div>
              );
            })}
          </div>

          <PieAcciones>
            <span className="mr-auto self-center text-sm text-taupe">~25 s · {costo} USD</span>
            <Boton type="button" peso="fantasma" onClick={cerrar}>
              Cancelar
            </Boton>
            <Boton
              type="button"
              peso="primario"
              onClick={() => {
                if (enviado.current) return;
                enviado.current = true;
                onPreparar(pedido);
              }}
            >
              <span className="inline-flex items-center gap-2">
                <Sparkles aria-hidden className="h-4 w-4" />
                Preparar foto
              </span>
            </Boton>
          </PieAcciones>
        </div>
      )}
    </Modal>
  );
}
