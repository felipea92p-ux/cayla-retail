"use client";

import { useRef, useState } from "react";
import { soloDigitos } from "@cayla-retail/shared";
import { Modal } from "@/components/ui/Modal";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { Casilla } from "@/components/ui/Casilla";
import { PreguntaParecido } from "@/components/ui/PreguntaParecido";
import { avisar } from "@/components/ui/Avisos";
import { ConsultaDocumento } from "@/components/ConsultaDocumento";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { registrarProveedorDeOrden } from "@/lib/ordenes-compra-acciones";
import { firmaOmitida } from "@/lib/responsable-omitido";
import { proveedorConRuc, proveedoresParecidos } from "@/lib/proveedores-reglas";
import type { ControlResponsable } from "@/lib/useResponsable";
import {
  argsRegistrarProveedor,
  avisoDelRegistro,
  borradorDesdeLoTipeado,
  camposDeProveedorNuevo,
  mensajeDeRegistroProveedor,
  nombreTrasCambiarRuc,
  TOPE_NOMBRE_PROVEEDOR,
  type ProveedorRegistrado,
} from "@/lib/proveedor-de-orden-reglas";

// «Registrar proveedor» desde Nueva orden de compra (Felipe 2026-10-21; informe `docs/pantallas/compras-ordenes-nueva.md`, tarea #7). La
// compradora, en Gamarra, se encuentra con un proveedor que nunca registraron y no puede pedirle nada: aquí lo registra con LO BÁSICO,
// nombre y RUC (o «No tiene RUC»), y el WhatsApp si lo tiene. Lo demás (banco, cuenta, CCI) lo completa después quien administra
// proveedores; mientras tanto la ficha sale en Proveedores como «Sin datos de pago».
//
// El RUC es el mismo `<ConsultaDocumento>` de Vender y de Compras ▸ Proveedores (una sola copia de la lógica del padrón): al escribir
// el RUC trae la razón social, y si SUNAT y el servicio de pago no responden el nombre se escribe a mano y se registra igual (principio 9:
// un proveedor no se queda sin registrar por una API ajena). Antes de registrar se pregunta «¿no será uno que ya tienes?»
// (`proveedoresParecidos`: «SAC» y «S.A.C.» no cuentan): no existe fusionar proveedores, y un duplicado parte Por pagar y «Nos debe»
// en dos fichas. Lo que se guarda lo decide la función `registrar_proveedor_de_orden`, que además no duplica si dos personas lo
// registran a la vez ni si se aprieta dos veces: devuelve el que ya estaba, y la pantalla lo dice.
//
// Se firma como las demás acciones de la orden (decisión 39): con la cuenta de una persona, `proveedor_de_orden` (firma ella, sin combo);
// desde una terminal, el combo «Responsable» que ya está en el formulario de la orden (la base no deja registrar sin una persona). Un
// cambio de la revisión independiente del 2026-10-21: la primera versión dejaba a una terminal registrar sin persona.

export type ProveedorDeLista = { id: string; nombre: string; ruc: string | null };

export function RegistrarProveedorOrden({
  proveedores,
  tipeado,
  esPersona,
  responsable,
  onRegistrado,
  onClose,
}: {
  /** Los proveedores que ya hay (para preguntar «¿no será…?» y no repetir un RUC). */
  proveedores: readonly ProveedorDeLista[];
  /** Lo que se había escrito en el buscador de proveedor: abre la hoja con el nombre (o el RUC, si eran 11 dígitos) ya puesto. */
  tipeado: string;
  /** La cuenta es la de una persona (firma ella) y no la de una terminal (elige quién en el combo «Responsable» de la orden). */
  esPersona: boolean;
  responsable: ControlResponsable;
  /** El proveedor, nuevo o el que ya estaba, y el WhatsApp que se escribió (`null` si ninguno, o si ya estaba): quien llama lo suma a su lista
   *  (si hace falta) y lo elige. */
  onRegistrado: (proveedor: ProveedorRegistrado, telefono: string | null) => void;
  onClose: () => void;
}) {
  const [b, setB] = useState(() => borradorDesdeLoTipeado(tipeado));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Los parecidos que la persona ya contestó con «No, es otro»: no se vuelve a preguntar por ellos.
  const [descartados, setDescartados] = useState<ReadonlySet<string>>(new Set());
  // El candado contra dos clics en el mismo instante (como Guardar de la orden): una ref que se pone en el mismo tick.
  const enVuelo = useRef(false);

  const repetido = b.sinRuc ? null : proveedorConRuc(soloDigitos(b.ruc), [...proveedores], null);
  const pregunta = repetido ? { igual: null, parecidos: [] } : proveedoresParecidos({ nombre: b.nombre, ruc: b.sinRuc ? "" : b.ruc }, proveedores);
  const porResponder = pregunta.parecidos.filter(({ proveedor }) => !descartados.has(proveedor.id));
  const preguntaPendiente = Boolean(pregunta.igual) || porResponder.length > 0;

  const campos = camposDeProveedorNuevo(b, { rucYaRegistrado: Boolean(repetido), preguntaPendiente });
  const guia = useGuiaCampos(campos);

  // Una terminal tiene que haber elegido quién hace la orden antes de registrar (la base no deja registrar sin una persona).
  const faltaResponsable = !esPersona && !responsable.listo;

  /** Elegir uno que ya estaba: no hace falta llamar a la base. Si se escribió un RUC que esa ficha no tiene, se dice (no se descarta en silencio). */
  function usar(p: ProveedorDeLista) {
    const ya = { id: p.id, nombre: p.nombre, ruc: p.ruc, yaExistia: true };
    const aviso = avisoDelRegistro(ya, b);
    avisar.exito(aviso.titulo, { detalle: aviso.detalle });
    onRegistrado(ya, null);
  }

  async function registrar(e: React.FormEvent) {
    e.preventDefault();
    if (guardando || enVuelo.current) return;
    if (faltaResponsable) {
      setError(mensajeDeRegistroProveedor({ message: "", hint: "responsable_requerido" }));
      return;
    }
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    enVuelo.current = true;
    setGuardando(true);
    setError(null);
    try {
      const args = argsRegistrarProveedor(b);
      const firma = esPersona ? firmaOmitida("proveedor_de_orden") : responsable.firma();
      const { proveedor, error: falla } = await registrarProveedorDeOrden(args, firma);
      if (!esPersona) responsable.despues(falla);
      if (falla || !proveedor) {
        setError(mensajeDeRegistroProveedor(falla));
        return;
      }
      const aviso = avisoDelRegistro(proveedor, b);
      avisar.exito(aviso.titulo, { detalle: aviso.detalle });
      onRegistrado(proveedor, proveedor.yaExistia ? null : args.p_celular);
    } finally {
      enVuelo.current = false;
      setGuardando(false);
    }
  }

  return (
    <Modal
      titulo="Registrar proveedor"
      subtitulo="Lo básico: nombre y RUC. Quien administra proveedores completa después sus datos de pago."
      onClose={onClose}
      tamano="angosta"
      bloqueado={guardando}
    >
      {(cerrar) => (
        <form onSubmit={registrar} noValidate className="space-y-5">
          {b.sinRuc ? (
            <CampoGuiado id="nombre" guia={guia} titulo="Nombre" ayuda="con qué se le conoce">
              <CampoTexto
                id="rp-nombre"
                caja
                etiqueta="Nombre del proveedor"
                maxLength={TOPE_NOMBRE_PROVEEDOR}
                value={b.nombre}
                onChange={(e) => setB((x) => ({ ...x, nombre: e.target.value }))}
                autoFocus
              />
            </CampoGuiado>
          ) : (
            <CampoGuiado id="ruc" guia={guia} titulo="RUC" ayuda="la razón social se trae sola">
              <ConsultaDocumento
                tipo="ruc"
                obligatorio
                disparo="automatico"
                contador
                numero={b.ruc}
                // Al corregir un RUC completo, el nombre de la empresa de antes se vacía (`nombreTrasCambiarRuc`).
                onNumero={(ruc) => setB((x) => ({ ...x, ruc, nombre: nombreTrasCambiarRuc(x.ruc, ruc, x.nombre) }))}
                nombre={b.nombre}
                onNombre={(nombre) => setB((x) => ({ ...x, nombre }))}
                conocido={repetido ? { nombre: repetido.nombre, origen: "tus proveedores" } : null}
                problemaExterno={repetido ? <>Ya está registrado: <b className="font-semibold">{repetido.nombre}</b>.</> : undefined}
              />
            </CampoGuiado>
          )}

          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-tinta">
            <Casilla marcada={b.sinRuc} onCambio={() => setB((x) => ({ ...x, sinRuc: !x.sinRuc }))} etiqueta="No tiene RUC" />
            No tiene RUC
          </label>

          {repetido && (
            <PreguntaParecido
              titulo={`«${repetido.nombre}» ya tiene ese RUC`}
              bajada="Un RUC no se repite: elígelo y la orden sigue con él."
              opciones={[{ id: repetido.id, nombre: repetido.nombre }]}
              si={(o) => ({ texto: `Usar ${o.nombre}`, onClick: () => usar(repetido) })}
              deshabilitado={guardando}
            />
          )}
          {pregunta.igual && (
            <PreguntaParecido
              titulo={`«${pregunta.igual.nombre}» ya está registrado`}
              bajada="Con el mismo nombre no se registra otro: elígelo y la orden sigue con él."
              opciones={[{ id: pregunta.igual.id, nombre: pregunta.igual.nombre }]}
              si={() => ({ texto: `Usar ${pregunta.igual!.nombre}`, onClick: () => usar(pregunta.igual!) })}
              deshabilitado={guardando}
            />
          )}
          {porResponder.length > 0 && (
            <PreguntaParecido
              titulo="¿No será un proveedor que ya tienes?"
              bajada="Si es el mismo, elígelo: sus facturas y lo que se le debe tienen que quedar en una sola ficha."
              opciones={porResponder.map(({ proveedor }) => ({ id: proveedor.id, nombre: proveedor.nombre, detalle: proveedor.ruc ? `RUC ${proveedor.ruc}` : "sin RUC" }))}
              si={(o) => ({ texto: `Sí, es ${o.nombre}`, onClick: () => usar(porResponder.find((x) => x.proveedor.id === o.id)!.proveedor) })}
              no={{
                texto: `No, «${b.nombre.trim()}» es otro proveedor`,
                onClick: () => setDescartados((d) => new Set([...d, ...porResponder.map((x) => x.proveedor.id)])),
              }}
              deshabilitado={guardando}
            />
          )}

          <CampoGuiado id="celular" guia={guia} titulo="WhatsApp" ayuda="opcional: por donde se le hace el pedido">
            <CampoTexto
              id="rp-celular"
              caja
              etiqueta="WhatsApp del proveedor"
              inputMode="tel"
              maxLength={20}
              // sugerir-fijo: el formato de un celular peruano no depende de lo elegido antes
              placeholder="987 654 321"
              value={b.celular}
              onChange={(e) => setB((x) => ({ ...x, celular: e.target.value }))}
            />
          </CampoGuiado>

          {faltaResponsable && <Aviso tono="info">Antes elige quién hace la orden: está al final del formulario.</Aviso>}
          {error && <Aviso tono="error">{error}</Aviso>}

          <PieGuia guia={guia} listo="Todo listo para registrar." />
          <div className="pie-acciones">
            <Boton type="button" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} textoCargando="Registrando…" disabled={faltaResponsable} title={faltaResponsable ? (responsable.motivo ?? undefined) : (guia.frase ?? undefined)} className={guia.claseConfirmar}>
              Registrar proveedor
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
