"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Boton } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoFin, InputFin, SelectFin } from "@/components/finanzas/kit";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { sePuedeConfirmar } from "@/lib/guia-campos";
import { parsearMonto } from "@/lib/gastos-reglas";
import { TIPOS_QUE_SE_AGREGAN, type TipoCuenta } from "@/lib/cuentas-dinero-reglas";
import { MAX_NOMBRE_CUENTA, MAX_NUMERO_CUENTA } from "@/lib/finanzas-topes";
import { sugerirNombreCuenta } from "@/lib/sugerencias-cuenta";

// Configuración ▸ Dinero ▸ «Agregar cuenta» (ADR-0195 F3): un banco, una billetera que no cae a un banco, el POS de tarjeta o la tarjeta de crédito de CAYLA. El saldo inicial se
// registra una vez y después solo cambia con movimientos. Cuentan como «falta» lo mismo que frena `agregar`: el nombre, una fecha que no sea futura y quién lo hace.

export function AgregarCuentaModal({ hoy, onCerrar }: { hoy: string; onCerrar: () => void }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<TipoCuenta>("banco");
  const [saldo, setSaldo] = useState("0");
  const [desde, setDesde] = useState(hoy);
  const [numero, setNumero] = useState("");
  const [guardando, setGuardando] = useState(false);
  const esTarjeta = tipo === "tarjeta_credito";

  const campos = [
    { id: "nombre", nombre: "Nombre", requerido: true, hecho: !!nombre.trim(), pendiente: "Ponle un nombre a la cuenta." },
    { id: "desde", nombre: "Fecha del saldo", requerido: true, hecho: !!desde && desde <= hoy, pendiente: "La fecha del saldo no puede ser futura." },
    { id: "responsable", nombre: "Responsable", requerido: true, hecho: responsable.listo, pendiente: responsable.motivo ?? "Elige quién hace el cambio." },
  ];
  const guia = useGuiaCampos(campos);

  async function agregar() {
    if (!nombre.trim()) return avisar.error("Ponle un nombre a la cuenta.");
    let s = 0;
    if (saldo.trim() !== "" && saldo.trim() !== "0") {
      const m = parsearMonto(saldo.replace(/^-/, ""));
      if (!m.ok) return avisar.error(m.error);
      // La tarjeta de crédito empieza con lo que se debe: el saldo es negativo.
      s = esTarjeta ? -m.valor : m.valor;
    }
    if (!desde || desde > hoy) return avisar.error("La fecha del saldo no puede ser futura.");
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { error } = await firmar(
      createClient().rpc("crear_cuenta_dinero" as never, { p_nombre: nombre.trim(), p_tipo: tipo, p_saldo_inicial: s, p_saldo_desde: desde, p_numero: numero.trim() || null } as never),
      responsable.firma(),
    );
    setGuardando(false);
    responsable.despues(error);
    if (error) return avisar.error(traducirError(error, "agregar la cuenta"));
    avisar.exito("Cuenta agregada", { detalle: "Dile en «A dónde entra cada cobro» qué cobros le llegan." });
    onCerrar();
    router.refresh();
  }

  return (
    <Modal variante="hoja" titulo="Agregar cuenta" subtitulo="Un banco, una billetera que no cae a un banco, el POS de tarjeta o la tarjeta de crédito de CAYLA." onClose={onCerrar}>
      <CampoGuiado id="nombre" guia={guia}>
        <CampoFin etiqueta="Nombre" htmlFor="cta-nombre">
          <InputFin id="cta-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={sugerirNombreCuenta(tipo)} maxLength={MAX_NOMBRE_CUENTA} />
        </CampoFin>
      </CampoGuiado>
      <div className="fin-dos-campos">
        <CampoFin etiqueta="Tipo" htmlFor="cta-tipo">
          <SelectFin<TipoCuenta> id="cta-tipo" valor={tipo} onValor={setTipo} opciones={TIPOS_QUE_SE_AGREGAN.map((t) => ({ valor: t.tipo, texto: t.texto }))} />
        </CampoFin>
        <CampoFin etiqueta="Número (opcional)" htmlFor="cta-numero">
          {/* sugerir-fijo: los últimos dígitos de una cuenta tienen la misma forma en todos los tipos */}
          <InputFin id="cta-numero" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="•••• 1942" maxLength={MAX_NUMERO_CUENTA} />
        </CampoFin>
      </div>
      <div className="fin-dos-campos">
        <CampoFin etiqueta={esTarjeta ? "Lo que se debe al empezar" : "Saldo con el que empieza"} htmlFor="cta-saldo">
          <InputFin id="cta-saldo" inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} />
        </CampoFin>
        <CampoGuiado id="desde" guia={guia}>
          <CampoFin etiqueta="Al empezar el día" htmlFor="cta-desde">
            <InputFin id="cta-desde" type="date" max={hoy} value={desde} onChange={(e) => setDesde(e.target.value)} />
          </CampoFin>
        </CampoGuiado>
      </div>
      <p className="-mt-2 mb-4 text-sm text-taupe">El saldo inicial se registra una vez; después el saldo solo cambia con movimientos, cobros y pagos desde ese día.</p>
      <CampoGuiado id="responsable" guia={guia}>
        <ComboResponsable control={responsable} deshabilitado={guardando} />
      </CampoGuiado>
      <PieGuia guia={guia} listo="Todo listo para agregarla." />
      <div className="fin-botones mt-4">
        <button type="button" className="btn-cayla btn-secundario" onClick={onCerrar} disabled={guardando}>
          Cancelar
        </button>
        <Boton peso="primario" cargando={guardando} textoCargando="Agregando…" type="button" onClick={agregar} disabled={guardando || !sePuedeConfirmar(campos)}>
          Agregar
        </Boton>
      </div>
    </Modal>
  );
}
