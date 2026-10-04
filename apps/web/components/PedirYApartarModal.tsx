"use client";

import { useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { Modal, botonCancelar, botonPrimario, campoEtiqueta, campoTexto } from "@/components/ui/Modal";
import { avisar } from "@/components/ui/Avisos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import type { ControlResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import {
  celularValido,
  faltaParaPedir,
  huellaDelPedido,
  partirNombre,
  soloDigitos,
  type CandidatoPedir,
} from "@/lib/pedidos-con-cliente-reglas";

// «Pedir y apartar para este cliente» (ADR-0328 act. 17; Felipe 2026-10-04): desde Vender, la asesora pide la prenda que
// aquí no hay a la tienda que la tiene, para el cliente que la espera. Allá queda APARTADA al instante (nadie más la vende),
// viaja en el próximo envío y, al llegar, queda guardada aquí; Vender avisa para escribirle al cliente. La base hace todo eso
// en `pedir_prenda_para_apartar` (una transacción: pedido + reserva allá, o nada).
//
// Guía de foco (ADR-0284): cada campo dice si está hecho, cuál sigue y qué falta. «Falta» = lo que apaga el botón y la base
// rechazaría: la talla y la tienda (si hay más de una), nombres, apellidos, un celular de 9 dígitos que empieza en 9, y quién
// atiende. La nota es opcional.

/** El cliente que ya está en pantalla: el de la ficha (un solo `nombre`, se parte con `partirNombre`) o, si ya viene
 *  separado (el formulario de Apartados), `nombres` y `apellidos` tal cual. */
export type ClienteDelTicket = { nombre: string | null; celular: string | null; nombres?: string; apellidos?: string } | null;

export function PedirYApartarModal({
  ubicacion,
  referencia,
  color,
  candidatos,
  cliente,
  responsable,
  alCerrarEnfocar,
  onClose,
}: {
  /** La sede que pide (la de la caja). */
  ubicacion: { ubicacionId: string; etiqueta: string };
  referencia: string;
  color: string | null;
  /** Las tallas que se pueden pedir y qué tiendas las tienen (`candidatosParaPedir`). */
  candidatos: CandidatoPedir[];
  /** El cliente del ticket, si ya se eligió: sus datos arrancan cargados (se pueden corregir). */
  cliente: ClienteDelTicket;
  /** El combo «Responsable» de la caja: quien atiende es quien pide (lo mismo que firma la venta). */
  responsable: ControlResponsable;
  alCerrarEnfocar?: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const router = useRouter();
  const inicial = cliente?.nombres !== undefined ? { nombres: cliente.nombres, apellidos: cliente.apellidos ?? "" } : partirNombre(cliente?.nombre);
  const [varianteId, setVarianteId] = useState(candidatos.length === 1 ? candidatos[0].varianteId : "");
  const candidato = candidatos.find((c) => c.varianteId === varianteId) ?? null;
  const [tiendaElegida, setTiendaElegida] = useState("");
  // Con una sola tienda que la tiene, va esa; si no, la persona elige (la que más tiene va primero).
  const tiendaId = candidato ? (candidato.tiendas.length === 1 ? candidato.tiendas[0].id : candidato.tiendas.some((t) => t.id === tiendaElegida) ? tiendaElegida : "") : "";
  const tienda = candidato?.tiendas.find((t) => t.id === tiendaId) ?? null;
  const [nombres, setNombres] = useState(inicial.nombres);
  const [apellidos, setApellidos] = useState(inicial.apellidos);
  const [celular, setCelular] = useState(cliente?.celular ?? "");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  // La marca (ADR-0190) va atada al CONTENIDO: reintentar lo mismo no pide dos veces; cambiar algo es otro pedido.
  const intento = useRef<{ huella: string; token: string } | null>(null);
  const tokenDe = (huella: string) => {
    if (!intento.current || intento.current.huella !== huella) intento.current = { huella, token: crypto.randomUUID() };
    return intento.current.token;
  };

  const datos = { varianteId, tiendaId, nombres, apellidos, celular };
  const falta = faltaParaPedir(datos);
  const guia = useGuiaCampos([
    ...(candidatos.length > 1 ? [{ id: "talla", nombre: "Talla", requerido: true, hecho: !falta.talla, pendiente: "Elige la talla que pidió." }] : []),
    ...(candidato && candidato.tiendas.length > 1 ? [{ id: "tienda", nombre: "Tienda", requerido: true, hecho: !falta.tienda, pendiente: "Elige a qué tienda se la pides." }] : []),
    { id: "nombres", nombre: "Nombres", requerido: true, hecho: !falta.nombres, pendiente: "Anota sus nombres." },
    { id: "apellidos", nombre: "Apellidos", requerido: true, hecho: !falta.apellidos, pendiente: "Anota sus apellidos." },
    { id: "celular", nombre: "Celular", requerido: true, hecho: !falta.celular, pendiente: "Su celular: 9 dígitos, empieza en 9." },
    { id: "nota", nombre: "Nota", requerido: false, hecho: nota.trim() !== "", pendiente: "" },
    { id: "responsable", nombre: "Quién atiende", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién atiende." },
  ]);

  async function pedir(cerrar: () => void) {
    if (Object.values(falta).some(Boolean) || !responsable.listo || !tienda || !candidato) return;
    setEnviando(true);
    const { error } = await firmar(
      createClient().rpc("pedir_prenda_para_apartar", {
        p_ubicacion_id: ubicacion.ubicacionId,
        p_origen_id: tienda.id,
        p_variante_id: candidato.varianteId,
        p_cantidad: 1,
        p_clienta_nombres: nombres.trim(),
        p_clienta_apellidos: apellidos.trim(),
        p_clienta_celular: soloDigitos(celular),
        p_nota: nota.trim() || undefined,
        p_token: tokenDe(huellaDelPedido({ ...datos, nota })),
      }),
      responsable.firma(),
    );
    setEnviando(false);
    if (error) {
      // Solo ante un rechazo: con éxito, `despues` soltaría a quien atiende la venta en curso.
      responsable.despues(error);
      return avisar.error(traducirError(error, "pedir la prenda", { confirmarAntesDeRepetir: true }));
    }
    avisar.exito(`Apartada en ${tienda.corto} para ${nombres.trim()}`, {
      detalle: "Viaja en el próximo envío. Cuando llegue, Vender te avisa para escribirle.",
    });
    router.refresh();
    cerrar();
  }

  const nombreTienda = tienda?.corto ?? "la otra tienda";
  return (
    <Modal
      titulo="Pedir y apartar para el cliente"
      subtitulo={[referencia, color].filter(Boolean).join(" · ")}
      onClose={onClose}
      ancho="max-w-md"
      bloqueado={enviando}
      alCerrarEnfocar={alCerrarEnfocar}
    >
      {(cerrar) => (
        <div className="space-y-4">
          {candidatos.length > 1 && (
            <CampoGuiado id="talla" guia={guia} titulo="¿Qué talla pidió?" retiene="fila">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Talla que pidió">
                {candidatos.map((c) => (
                  <button key={c.varianteId} type="button" className="pildora-cayla" aria-pressed={varianteId === c.varianteId} disabled={enviando} onClick={() => setVarianteId(c.varianteId)}>
                    {c.talla}
                  </button>
                ))}
              </div>
            </CampoGuiado>
          )}

          {candidato && candidato.tiendas.length > 1 ? (
            <CampoGuiado id="tienda" guia={guia} titulo="¿A qué tienda se la pides?" retiene="fila">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Tienda a la que se la pides">
                {candidato.tiendas.map((t) => (
                  <button key={t.id} type="button" className="pildora-cayla" aria-pressed={tiendaId === t.id} disabled={enviando} onClick={() => setTiendaElegida(t.id)}>
                    {t.corto} · {t.cantidad}
                  </button>
                ))}
              </div>
            </CampoGuiado>
          ) : candidato ? (
            <p className="rounded-xl border border-sand px-3.5 py-2.5 text-sm text-tinta">
              Talla <b className="font-semibold">{candidato.talla}</b> · la tiene <b className="font-semibold">{candidato.tiendas[0].corto}</b> ({candidato.tiendas[0].cantidad})
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <CampoGuiado id="nombres" guia={guia}>
              <label className="block">
                <span className={campoEtiqueta}>{guia.etiqueta("nombres", "Nombres")}</span>
                <input value={nombres} onChange={(e) => setNombres(e.target.value)} className={campoTexto} autoComplete="off" disabled={enviando} />
              </label>
            </CampoGuiado>
            <CampoGuiado id="apellidos" guia={guia}>
              <label className="block">
                <span className={campoEtiqueta}>{guia.etiqueta("apellidos", "Apellidos")}</span>
                <input value={apellidos} onChange={(e) => setApellidos(e.target.value)} className={campoTexto} autoComplete="off" disabled={enviando} />
              </label>
            </CampoGuiado>
          </div>
          <CampoGuiado id="celular" guia={guia}>
            <label className="block">
              <span className={campoEtiqueta}>{guia.etiqueta("celular", "Celular · WhatsApp")}</span>
              <input
                value={celular}
                onChange={(e) => setCelular(e.target.value)}
                inputMode="numeric"
                placeholder="9 dígitos" /* sugerir-fijo: el formato del celular peruano no depende de nada elegido antes */
                className={`${campoTexto} font-mono`}
                disabled={enviando}
              />
              {celular.trim() !== "" && !celularValido(celular) && <span className="mt-0.5 block text-xs text-tinta/70">9 dígitos y empieza en 9.</span>}
            </label>
          </CampoGuiado>
          <CampoGuiado id="nota" guia={guia}>
            <label className="block">
              <span className={campoEtiqueta}>{guia.etiqueta("nota", `Nota para ${nombreTienda} (opcional)`)}</span>
              <input value={nota} onChange={(e) => setNota(e.target.value)} maxLength={200} className={campoTexto} disabled={enviando} />
            </label>
          </CampoGuiado>

          <ol className="list-decimal space-y-1 rounded-xl bg-hueso px-8 py-3 text-xs text-tinta/75">
            <li>{nombreTienda} la aparta ahora: nadie más la vende.</li>
            <li>Viaja en el próximo envío a {ubicacion.etiqueta}.</li>
            <li>Al llegar queda guardada para el cliente y Vender te avisa para escribirle.</li>
          </ol>

          <CampoGuiado id="responsable" guia={guia}>
            <ComboResponsable control={responsable} deshabilitado={enviando} />
          </CampoGuiado>

          <PieGuia guia={guia} listo="Todo listo para pedir." />
          <div className="pie-hoja-fijo flex gap-2 pt-1">
            <button type="button" onClick={cerrar} className={botonCancelar} disabled={enviando}>
              Mejor no
            </button>
            <button
              type="button"
              disabled={enviando || !guia.puedeConfirmar}
              title={responsable.motivo ?? guia.frase ?? undefined}
              onClick={() => pedir(cerrar)}
              className={`${botonPrimario} ${guia.claseConfirmar}`}
            >
              {enviando ? "Pidiendo…" : `Pedir y apartar en ${nombreTienda}`}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
