"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { MouseEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Check, Truck } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { BotonVer } from "@/components/ui/BotonDescargar";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { Vacio } from "@/components/ui/Vacio";
import { avisar } from "@/components/ui/Avisos";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { mandarATienda } from "@/lib/mi-plata-acciones";
import { resumenDelEnvioSalido, type EnvioSalido } from "@/lib/mis-envios-reglas";
import { AccionesDelCodigo, CodigoDeEnvio } from "./CodigoDeEnvio";
import { EVENTO_MANDAR, detalleEnvio, resumenPrendas, siglaTienda, textoFaltaMandar, type PorMandar } from "@/lib/mi-plata-reglas";

// Compras simple (ADR-0480, actividad 5): «Mandar a la tienda». Lo que la compradora compró para cada tienda y todavía no salió, en una
// tarjeta por tienda: sus prendas, «¿Cuántos paquetes (fardos)?» y «Mandar a …», que se toca al entregar el fardo al transporte. La base
// arma el envío con todo lo pendiente de esa tienda (`mandar_compras_a_tienda`): el mismo envío que Recibir ya entiende, y la tienda ve
// que le llega.
//
// Apenas sale un envío, la hoja muestra su código grande (ENV-000118) con «Copiar» y «Compartir por WhatsApp»: es lo que la compradora le
// avisa a la tienda para que lo busque en Recibir (maqueta docs/maquetas/mis-compras-envios-2026-10/). Sigue «Mandar a la siguiente tienda»
// si queda otra, o «Ver mis envíos».
//
// Cada tienda tiene su marca de envío, que nace al abrir la hoja y se queda hasta que sale: si la conexión se corta y se vuelve a tocar, la
// base devuelve el envío que ya salió en vez de armar otro. Solo con la cuenta de una persona (firma ella, sin combo).

// La pantalla que la usa la deja siempre montada (aunque no falte mandar nada): al salir el último envío, la hoja sigue abierta mostrando su código.
export function MandarATienda({ porMandar, abrirAlCargar = false, className }: { porMandar: PorMandar[]; abrirAlCargar?: boolean; className?: string }) {
  const [abierta, setAbierta] = useState(abrirAlCargar && porMandar.length > 0);
  const origen = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const ruta = usePathname();
  const falta = textoFaltaMandar(porMandar);
  // «Cerrar mi ronda» pide mandar antes: abre esta hoja desde otra celda de la pantalla.
  useEffect(() => {
    const abrir = () => {
      origen.current = null;
      setAbierta(true);
    };
    window.addEventListener(EVENTO_MANDAR, abrir);
    return () => window.removeEventListener(EVENTO_MANDAR, abrir);
  }, []);
  if (!falta && !abierta) return null;
  return (
    <>
      {falta && (
        <div className={className}>
          <FranjaFaltaMandar
            falta={falta}
            guia="mi-plata.mandar"
            onClick={(e) => {
              origen.current = e.currentTarget;
              setAbierta(true);
            }}
          />
        </div>
      )}
      {abierta && (
        <MandarModal
          porMandar={porMandar}
          volverA={origen}
          onClose={() => {
            setAbierta(false);
            // Si se abrió desde «Listo, tu compra quedó guardada» (?mandar=1), al cerrar se quita de la dirección.
            if (abrirAlCargar) router.replace(ruta, { scroll: false });
          }}
        />
      )}
    </>
  );
}

/** La franja ámbar de lo que falta mandar: la de Mis compras y, con «Antes, …», la de «Cerrar mi ronda». Es un botón que abre «Mandar a la tienda». */
export function FranjaFaltaMandar({
  falta,
  onClick,
  guia,
  antes = false,
}: {
  falta: { titulo: string; detalle: string };
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  guia?: string;
  antes?: boolean;
}) {
  return (
    <button
      type="button"
      data-guia={guia}
      /* unificar-fijo: la franja ámbar de la maqueta abre «Mandar a la tienda», es un botón y no un aviso */ className="mov-boton flex w-full items-center gap-3 rounded-2xl bg-ambar/[0.12] px-3.5 py-3 text-left text-ambar"
      onClick={onClick}
    >
      <Truck className="h-5 w-5 shrink-0 text-ambar" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-tinta">{antes ? `Antes, manda: ${falta.titulo.replace(/^Falta mandar /, "")}` : falta.titulo}</span>
        <span className="block text-xs">{falta.detalle}</span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold">
        Mandar
        <ArrowRight className="h-4 w-4" aria-hidden />
      </span>
    </button>
  );
}

type Rechazo = { tienda: string; titulo: string; texto: string; tono: "error" | "atencion" };

function MandarModal({ porMandar, onClose, volverA }: { porMandar: PorMandar[]; onClose: () => void; volverA: RefObject<HTMLElement | null> }) {
  const router = useRouter();
  const [fardos, setFardos] = useState<Record<string, number>>({});
  // La marca de cada tienda nace en su primer toque y se queda hasta que sale (un reintento manda la misma).
  const marcas = useRef<Record<string, string>>({});
  const [mandando, setMandando] = useState<string | null>(null);
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);
  // El envío que acaba de salir y la tienda a la que fue: mientras haya uno, la hoja muestra su código en vez de la lista de tiendas.
  const [salio, setSalio] = useState<{ envio: EnvioSalido; tiendaId: string } | null>(null);

  async function mandar(t: PorMandar) {
    if (mandando) return;
    setRechazo(null);
    setMandando(t.tiendaId);
    const token = (marcas.current[t.tiendaId] ??= crypto.randomUUID());
    const { error, envio } = await mandarATienda({ p_destino_id: t.tiendaId, p_bultos: fardos[t.tiendaId] ?? 1, p_token: token }, firmaOmitida("compra_mandar"));
    setMandando(null);
    if (error) {
      return setRechazo(
        esFalloDeRed(error)
          ? { tienda: t.tiendaId, titulo: "Se cortó la conexión", texto: "No sabemos si salió. Vuelve a tocar el botón: si ya salió, no se repite.", tono: "atencion" }
          : { tienda: t.tiendaId, titulo: "No salió", texto: traducirError(error, "mandar a la tienda"), tono: "error" },
      );
    }
    // Ya salió: si más tarde se compra otra cosa para esta tienda, ese será otro envío, con otra marca.
    delete marcas.current[t.tiendaId];
    router.refresh();
    // Con su código a la vista no hace falta el aviso; sin él (la base no lo devolvió), el aviso de siempre.
    if (envio) return setSalio({ envio, tiendaId: t.tiendaId });
    avisar.exito(`Listo: ${t.tienda} ya sabe que le llega tu paquete`, { detalle: "Cuando llegue, la tienda lo cuenta en Recibir." });
    if (porMandar.length <= 1) onClose();
  }

  if (salio) {
    const quedan = porMandar.filter((t) => t.tiendaId !== salio.tiendaId);
    return (
      <Modal
        titulo={`Salió el envío a ${salio.envio.destino.replace(/^Tienda /, "")}`}
        onClose={onClose}
        variante="hoja"
        alCerrarEnfocar={volverA}
        conCerrar
      >
        <div className="space-y-4">
          <div className="flex justify-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-verde/15 text-verde" aria-hidden>
              <Check className="h-6 w-6" />
            </span>
          </div>
          <CodigoDeEnvio numero={salio.envio.numero} linea={resumenDelEnvioSalido(salio.envio)} />
          <p className="text-center text-sm text-taupe">
            Avísale a la tienda este código: lo busca en <b className="font-semibold text-tinta">Recibir</b> y lo cuenta.
          </p>
          <AccionesDelCodigo envio={salio.envio} />
          {quedan.length > 0 ? (
            <Boton peso="discreto" className="w-full" onClick={() => setSalio(null)}>
              Mandar a la siguiente tienda ({quedan.length})
            </Boton>
          ) : (
            <BotonVer href="/compras/mi-plata/envios" alNavegar={onClose}>
              Ver mis envíos
            </BotonVer>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      titulo="Mandar a la tienda"
      subtitulo="Toca «Mandar» cuando entregues el paquete (el fardo) al transporte. Te damos el código para avisar a la tienda."
      onClose={onClose}
      variante="hoja"
      alCerrarEnfocar={volverA}
      bloqueado={mandando !== null}
      conCerrar
    >
      {porMandar.length === 0 ? (
        <Vacio icono={<Truck aria-hidden />} titulo="Ya mandaste todo" tamano="chico">
          Cuando anotes otra compra, aparece aquí para mandarla.
        </Vacio>
      ) : (
        <ul className="flex flex-col gap-3">
          {porMandar.map((t) => {
            const n = fardos[t.tiendaId] ?? 1;
            return (
              <li key={t.tiendaId} className="card-cayla flex flex-col gap-3 p-4">
                <div className="flex items-center gap-3">
                  <span className="compra-iniciales text-lg" aria-hidden>
                    {siglaTienda(t.tienda)}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-tinta">{t.tienda}</span>
                    <span className="block text-xs text-taupe">{detalleEnvio(t)}</span>
                  </span>
                </div>
                <p className="text-sm text-tinta/75">{resumenPrendas(t.prendas)}</p>
                <div className="flex items-center justify-between gap-3 border-t border-sand pt-3">
                  <span className="min-w-0">
                    <span className="block text-sm text-tinta">¿Cuántos paquetes (fardos)?</span>
                    <span className="block text-xs text-taupe">Si todo va junto, es 1</span>
                  </span>
                  <PasoCantidad
                    data-guia={t === porMandar[0] ? "mi-plata.fardos" : undefined}
                    menos={{ onClick: () => setFardos((f) => ({ ...f, [t.tiendaId]: Math.max(1, n - 1) })), deshabilitado: n <= 1 || mandando !== null, etiqueta: "Un paquete menos" }}
                    mas={{ onClick: () => setFardos((f) => ({ ...f, [t.tiendaId]: Math.min(99, n + 1) })), deshabilitado: n >= 99 || mandando !== null, etiqueta: "Un paquete más" }}
                  >
                    {n}
                  </PasoCantidad>
                </div>
                {rechazo?.tienda === t.tiendaId && (
                  <Aviso tono={rechazo.tono} titulo={rechazo.titulo} chico>
                    {rechazo.texto}
                  </Aviso>
                )}
                <Boton
                  peso="primario"
                  data-guia={t === porMandar[0] ? "mi-plata.mandar-uno" : undefined}
                  cargando={mandando === t.tiendaId}
                  textoCargando="Mandando…"
                  disabled={mandando !== null && mandando !== t.tiendaId}
                  onClick={() => void mandar(t)}
                >
                  <span className="inline-flex items-center gap-2">
                    <Truck className="h-4 w-4" aria-hidden />
                    Mandar a {t.tienda}
                  </span>
                </Boton>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
