"use client";

import { useRef, useState, type RefObject } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowRight, Truck } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton } from "@/components/ui/campos";
import { PasoCantidad } from "@/components/ui/PasoCantidad";
import { Vacio } from "@/components/ui/Vacio";
import { avisar } from "@/components/ui/Avisos";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { esFalloDeRed, traducirError } from "@/lib/error-escritura";
import { mandarATienda } from "@/lib/mi-plata-acciones";
import { detalleEnvio, resumenPrendas, siglaTienda, textoFaltaMandar, type PorMandar } from "@/lib/mi-plata-reglas";

// Compras simple (ADR-0480, actividad 5): «Mandar a la tienda». Lo que la compradora compró para cada tienda y todavía no salió, en una
// tarjeta por tienda: sus prendas, «¿Cuántos paquetes (fardos)?» y «Mandar a …», que se toca al entregar el fardo al transporte. La base
// arma el envío con todo lo pendiente de esa tienda (`mandar_compras_a_tienda`): el mismo envío que Recibir ya entiende, y la tienda ve
// que le llega.
//
// Cada tienda tiene su marca de envío, que nace al abrir la hoja y se queda hasta que sale: si la conexión se corta y se vuelve a tocar, la
// base devuelve el envío que ya salió en vez de armar otro. Solo con la cuenta de una persona (firma ella, sin combo).

export function MandarATienda({ porMandar, abrirAlCargar = false }: { porMandar: PorMandar[]; abrirAlCargar?: boolean }) {
  const [abierta, setAbierta] = useState(abrirAlCargar && porMandar.length > 0);
  const origen = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const ruta = usePathname();
  const falta = textoFaltaMandar(porMandar);
  if (!falta && !abierta) return null;
  return (
    <>
      {falta && (
        <button
          type="button"
          data-guia="mi-plata.mandar"
          /* unificar-fijo: la franja punteada de la maqueta abre «Mandar a la tienda», es un botón y no un aviso */ className="mov-boton flex w-full items-center gap-3 rounded-2xl border border-dashed border-ambar/60 bg-ambar/[0.07] px-3.5 py-3 text-left"
          onClick={(e) => {
            origen.current = e.currentTarget;
            setAbierta(true);
          }}
        >
          <Truck className="h-5 w-5 shrink-0 text-ambar" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-tinta">{falta.titulo}</span>
            <span className="block text-xs text-tinta/65">{falta.detalle}</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-taupe" aria-hidden />
        </button>
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

type Rechazo = { tienda: string; titulo: string; texto: string; tono: "error" | "atencion" };

function MandarModal({ porMandar, onClose, volverA }: { porMandar: PorMandar[]; onClose: () => void; volverA: RefObject<HTMLElement | null> }) {
  const router = useRouter();
  const [fardos, setFardos] = useState<Record<string, number>>({});
  // La marca de cada tienda nace en su primer toque y se queda hasta que sale (un reintento manda la misma).
  const marcas = useRef<Record<string, string>>({});
  const [mandando, setMandando] = useState<string | null>(null);
  const [rechazo, setRechazo] = useState<Rechazo | null>(null);

  async function mandar(t: PorMandar) {
    if (mandando) return;
    setRechazo(null);
    setMandando(t.tiendaId);
    const token = (marcas.current[t.tiendaId] ??= crypto.randomUUID());
    const { error } = await mandarATienda({ p_destino_id: t.tiendaId, p_bultos: fardos[t.tiendaId] ?? 1, p_token: token }, firmaOmitida("compra_mandar"));
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
    avisar.exito(`Listo: ${t.tienda} ya sabe que le llega tu paquete`, { detalle: "Cuando llegue, la tienda lo cuenta en Recibir." });
    if (porMandar.length <= 1) onClose();
    router.refresh();
  }

  return (
    <Modal
      titulo="Mandar a la tienda"
      subtitulo="Toca «Mandar» cuando entregues el paquete (el fardo) al transporte. La tienda ya sabe que le llega."
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
