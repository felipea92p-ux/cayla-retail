"use client";

import { useState } from "react";
import { PackageCheck } from "lucide-react";
import { AvisoCostoAtipico } from "@/components/AvisoCostoAtipico";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { enterNoGuarda } from "@/components/ui/enterNoGuarda";
import { Aviso } from "@/components/ui/Aviso";
import { Boton, BotonEnlace, CampoMonto, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { hayQueElegirDueno } from "@/lib/dueno-reglas";
import { useEmpresasDeSede } from "@/lib/useEmpresasDeSede";
import { DuenoDeLoQueEntra } from "./DuenoDeLoQueEntra";
import { corregirSalida, llevarAlStock } from "@/lib/recepcion-conteo-acciones";
import { mensajeAlGuardar, costoComoTexto, leerCostoCierre, type LineaParaContar } from "@/lib/recepcion-conteo-reglas";
import { atipicosPorLinea, leerCostoAtipicoRecepcion, type CostoAtipicoRecepcion } from "@/lib/recepcion-envio-reglas";
import { argsLlevarAlStock, urlBajarDeLaTanda, urlEtiquetasDeLaTanda, type ResultadoDeSalida, type SalidaDelEnvio } from "@/lib/recepcion-salida-reglas";
import type { ControlResponsable } from "@/lib/useResponsable";

// «Llevar al stock ahora» (ADR-0393, act. 2026-11-03; Felipe: «debe quedar absolutamente perfecto»): un modelo sale a la venta sin cerrar el envío. Sale lo repartido;
// lo demás se sigue contando. Es dinero y stock: una hoja pregunta lo justo (costo, quién) antes de escribir. El token nace con la hoja: un doble clic o un reintento
// no meten dos veces. La base manda (`llevar_al_stock_ahora`), y un costo fuera de lo normal pide confirmar.

export function LlevarAlStock({
  despachoId,
  unidades,
  nombre,
  sede,
  sedeId,
  linea,
  productoId,
  variantes,
  sinAviso,
  veDinero,
  responsable,
  esperandoGuardar,
  onHecho,
}: {
  despachoId: string;
  unidades: number;
  nombre: string;
  sede: string;
  sedeId: string | null;
  /** La línea del envío donde está contada esta prenda. */
  linea: LineaParaContar;
  productoId: string;
  variantes: readonly { varianteId: string; cantidad: number; danadas: number; solucion: string | null }[];
  sinAviso: boolean;
  veDinero: boolean;
  responsable: ControlResponsable;
  /** Lo último que se escribió todavía viaja a la base: se espera, o la base respondería que el conteo cambió. */
  esperandoGuardar: boolean;
  onHecho: (r: ResultadoDeSalida) => void;
}) {
  const [abierta, setAbierta] = useState(false);
  const [token, setToken] = useState(() => crypto.randomUUID());
  const costoInicial = linea.conteo?.costosPrendas[productoId] ?? linea.conteo?.costoUnitario ?? linea.linea?.costoUnitario ?? null;
  const textoInicial = costoInicial == null ? "" : costoComoTexto(costoInicial);
  const [costo, setCosto] = useState(textoInicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [atipicos, setAtipicos] = useState<CostoAtipicoRecepcion[] | null>(null);

  // Sin aviso y sin ver el dinero, entra sin costo: llega con la factura. Lo demás lleva su caja.
  const editaCosto = !(sinAviso && !linea.linea && !veDinero);
  const lectura = leerCostoCierre(costo);
  const faltaCosto = !sinAviso && !linea.linea && costo.trim() === "";
  const campos = [
    ...(editaCosto
      ? [{ id: "salida-costo", nombre: "Costo", requerido: faltaCosto || lectura.problema !== null, hecho: costo.trim() !== "" && lectura.problema === null, pendiente: lectura.problema ?? "Escribe el costo." }]
      : []),
    ...(responsable.listo ? [] : [{ id: "salida-responsable", nombre: "Quién lo lleva", requerido: true, hecho: false, pendiente: responsable.motivo ?? "Elige quién lo lleva." }]),
  ];
  // En una sede con dos empresas, lo que entra lleva su dueño (ADR-0542), como al cerrar. La base no lo deja entrar sin él.
  const empresasDeLaSede = useEmpresasDeSede(sedeId);
  const preguntaDueno = hayQueElegirDueno(empresasDeLaSede);
  const [duenoId, setDuenoId] = useState("");
  const guia = useGuiaCampos([
    ...campos,
    ...(preguntaDueno ? [{ id: "salida-dueno", nombre: "De quién es", requerido: true, hecho: duenoId !== "", pendiente: "Di si lo que entra al stock es de CAYLA o de CLAURE." }] : []),
  ]);

  async function llevar(confirma: boolean) {
    if (guardando) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    if (!linea.conteo) return;
    setGuardando(true);
    setError(null);
    const cambio = editaCosto && costo.trim() !== textoInicial.trim();
    const { resultado, error: falla } = await llevarAlStock(
      argsLlevarAlStock({
        despachoId,
        despachoItemId: linea.linea?.id ?? null,
        extraPosicion: linea.conteo.extraPosicion,
        versionConteo: linea.conteo.version,
        productoId,
        variantes,
        costo: cambio ? lectura.valor : null,
        confirma,
        token,
      }),
      responsable.firma(),
      preguntaDueno ? duenoId : null,
    );
    responsable.despues(falla);
    setGuardando(false);
    if (falla) {
      const atip = leerCostoAtipicoRecepcion(falla);
      if (atip && atip.length > 0) {
        setAtipicos(atip);
        return;
      }
      // Lo que rechazó la base no se escribió: un intento nuevo lleva otro token, porque puede llevar otros datos.
      setToken(crypto.randomUUID());
      setAtipicos(null);
      setError(mensajeAlGuardar(falla, "llevarlo al stock"));
      return;
    }
    setAbierta(false);
    setAtipicos(null);
    // La prenda puede seguir aquí con lo que falta repartir: la próxima tanda es otra.
    setToken(crypto.randomUUID());
    if (resultado) onHecho(resultado);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1" data-guia="recepcion.llevar-al-stock">
        <Boton type="button" peso="fantasma" disabled={esperandoGuardar} title={esperandoGuardar ? "Guardando lo último que contaste…" : undefined} onClick={() => setAbierta(true)}>
          <span className="inline-flex items-center gap-2">
            <PackageCheck aria-hidden className="h-4 w-4 shrink-0" />
            Llevar al stock ahora · {unidades.toLocaleString("es-PE")}
          </span>
        </Boton>
        <p className="text-sm text-taupe">Sale ya; lo demás se sigue contando.</p>
      </div>
      {abierta && atipicos && (
        <Modal titulo="Hay un costo fuera de lo normal" onClose={() => setAtipicos(null)} bloqueado={guardando} tamano="mediana">
          <AvisoCostoAtipico
            costos={atipicosPorLinea(atipicos)}
            pie="El costo no se parece al que tiene la prenda hoy. Si está bien, confírmalo: el costo de la prenda se promedia con él."
            textoCorregir="Volver"
            textoConfirmar="Está bien, llevar al stock"
            textoCargando="Guardando…"
            cargando={guardando}
            listo={responsable.listo}
            motivoNoListo={responsable.motivo}
            onCorregir={() => setAtipicos(null)}
            onConfirmar={() => void llevar(true)}
          />
        </Modal>
      )}
      {abierta && !atipicos && (
        <Modal titulo={`Llevar ${unidades.toLocaleString("es-PE")} de ${nombre} al stock`} subtitulo={`Entran al almacén de ${sede} ahora. El envío sigue abierto: lo demás se sigue contando.`} tamano="angosta" bloqueado={guardando} onClose={() => setAbierta(false)}>
          {(cerrar) => (
            <form
              noValidate
              className="space-y-4"
              onKeyDown={enterNoGuarda}
              onSubmit={(e) => {
                e.preventDefault();
                void llevar(false);
              }}
            >
              {editaCosto ? (
                <CampoGuiado id="salida-costo" guia={guia}>
                  <CampoMonto
                    etiqueta={guia.etiqueta("salida-costo", "Costo por prenda")}
                    pie={lectura.problema ?? (linea.linea ? "El de la orden. Corrígelo si la factura dice otro." : "Si no lo sabes, déjalo vacío: llega con la factura.")}
                    tono={lectura.problema ? "error" : undefined}
                    inputMode="decimal"
                    placeholder="0.00"
                    value={costo}
                    onChange={(e) => setCosto(e.target.value)}
                  />
                </CampoGuiado>
              ) : (
                <p className="nota-cayla">Entra sin costo: llega con la factura.</p>
              )}
              {preguntaDueno && empresasDeLaSede && (
                <CampoGuiado id="salida-dueno" guia={guia}>
                  <DuenoDeLoQueEntra empresas={empresasDeLaSede} duenoId={duenoId} onElegir={setDuenoId} deshabilitado={guardando} />
                </CampoGuiado>
              )}
              {!responsable.listo && (
                <CampoGuiado id="salida-responsable" guia={guia} titulo="Quién lo lleva">
                  <ComboResponsable control={responsable} deshabilitado={guardando} />
                </CampoGuiado>
              )}
              {error && (
                <Aviso tono="error" titulo="No se pudo llevar al stock">
                  {error}
                </Aviso>
              )}
              <PieGuia guia={guia} listo="Todo listo." />
              <div className="pie-acciones pie-hoja-fijo pt-1">
                <Boton type="button" peso="fantasma" onClick={cerrar} disabled={guardando}>
                  Cancelar
                </Boton>
                <Boton type="submit" peso="primario" cargando={guardando} textoCargando="Llevando…" title={guia.frase ?? undefined} className={guia.claseConfirmar}>
                  Llevar al stock
                </Boton>
              </div>
            </form>
          )}
        </Modal>
      )}
    </>
  );
}

/** Lo que sigue después de salir: las etiquetas de esa tanda, bajarlas al piso o seguir contando. */
export function SalidaHecha({ resultado, nombre, veExistencias, onCerrar }: { resultado: ResultadoDeSalida; nombre: string; veExistencias: boolean; onCerrar: () => void }) {
  const n = resultado.unidades.toLocaleString("es-PE");
  return (
    <Modal titulo={`${n} de ${nombre} ya están en el stock`} subtitulo="Están en el almacén. El envío sigue abierto." tamano="angosta" onClose={onCerrar} conCerrar>
      <div className="grid gap-2">
        <BotonEnlace href={urlEtiquetasDeLaTanda(resultado.lineas)} peso="primario">
          {resultado.unidades === 1 ? "Imprimir la etiqueta" : `Imprimir ${n} etiquetas`}
        </BotonEnlace>
        {veExistencias && (
          <BotonEnlace href={urlBajarDeLaTanda(resultado.lineas)} peso="fantasma">
            Bajar al piso
          </BotonEnlace>
        )}
        <Boton type="button" peso="fantasma" onClick={onCerrar}>
          Seguir contando
        </Boton>
      </div>
    </Modal>
  );
}

/** Deshacer una tanda (`corregir_salida`): con quién y por qué, y solo mientras siga en el almacén. Si no se puede, lo dice y lleva a Ajustar stock. */
export function CorregirSalida({ salida, responsable, onHecho, onCerrar }: { salida: SalidaDelEnvio; responsable: ControlResponsable; onHecho: () => void; onCerrar: () => void }) {
  const [motivo, setMotivo] = useState("");
  const [token] = useState(() => crypto.randomUUID());
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<{ texto: string; alStock: boolean } | null>(null);
  const texto = motivo.trim();
  const guia = useGuiaCampos([
    { id: "corregir-motivo", nombre: "Por qué", requerido: true, hecho: texto.length >= 3, pendiente: "Escribe por qué se corrige." },
    ...(responsable.listo ? [] : [{ id: "corregir-responsable", nombre: "Quién corrige", requerido: true, hecho: false, pendiente: responsable.motivo ?? "Elige quién corrige." }]),
  ]);

  async function corregir() {
    if (guardando) return;
    if (!guia.puedeConfirmar) {
      const ahora = guia.ahora ?? guia.faltan[0]?.id;
      if (ahora) guia.ir(ahora);
      return;
    }
    setGuardando(true);
    setError(null);
    const { error: falla } = await corregirSalida({ p_salida_id: salida.id, p_motivo: texto, p_token: token }, responsable.firma());
    responsable.despues(falla);
    setGuardando(false);
    if (falla) {
      setError({ texto: mensajeAlGuardar(falla, "corregir lo que salió"), alStock: falla.hint === "salida_ya_bajo" || falla.hint === "salida_no_se_deshace" });
      return;
    }
    onHecho();
  }

  return (
    <Modal titulo={`Corregir ${salida.unidades.toLocaleString("es-PE")} de ${salida.prenda}`} subtitulo="Salen del almacén y vuelven a lo contado, para repartirlas de nuevo." tamano="angosta" bloqueado={guardando} onClose={onCerrar}>
      {(cerrar) => (
        <form
          noValidate
          className="space-y-4"
          onKeyDown={enterNoGuarda}
          onSubmit={(e) => {
            e.preventDefault();
            void corregir();
          }}
        >
          <CampoGuiado id="corregir-motivo" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("corregir-motivo", "¿Por qué se corrige?")}
              value={motivo}
              maxLength={300}
              onChange={(e) => setMotivo(e.target.value)}
              // sugerir-fijo: el motivo de corregir no depende de nada elegido antes
              placeholder="Ej. Eran de otra talla"
            />
          </CampoGuiado>
          {!responsable.listo && (
            <CampoGuiado id="corregir-responsable" guia={guia} titulo="Quién corrige">
              <ComboResponsable control={responsable} deshabilitado={guardando} />
            </CampoGuiado>
          )}
          {error && (
            <Aviso
              tono="error"
              titulo="No se pudo corregir"
              accion={
                error.alStock ? (
                  <BotonEnlace href={`/inventario?q=${encodeURIComponent(salida.prenda)}`} peso="fantasma">
                    Ir a Ajustar stock
                  </BotonEnlace>
                ) : undefined
              }
            >
              {error.texto}
            </Aviso>
          )}
          <PieGuia guia={guia} listo="Todo listo." />
          <div className="pie-acciones pie-hoja-fijo pt-1">
            <Boton type="button" peso="fantasma" onClick={cerrar} disabled={guardando}>
              Cancelar
            </Boton>
            <Boton type="submit" peso="primario" cargando={guardando} textoCargando="Corrigiendo…" title={guia.frase ?? undefined} className={guia.claseConfirmar}>
              Corregir
            </Boton>
          </div>
        </form>
      )}
    </Modal>
  );
}
