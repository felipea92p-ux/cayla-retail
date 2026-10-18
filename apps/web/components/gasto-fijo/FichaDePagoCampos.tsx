"use client";

import { CampoFin, InputFin, SelectFin } from "@/components/finanzas/kit";
import { Casilla } from "@/components/ui/Casilla";
import { TituloGrupo } from "@/components/ui/TituloSeccion";
import {
  BILLETERAS,
  camposDePago,
  FORMAS_DE_PAGO,
  TEXTO_BILLETERA,
  TEXTO_FORMA_DE_PAGO,
  TEXTO_TIPO_DOCUMENTO,
  TIPOS_DOCUMENTO,
  TOPES_FICHA,
  type Billetera,
  type FichaFijo,
  type FormaDePago,
  type TipoDocumento,
} from "@/lib/gasto-fijo-ficha-reglas";
import { sugerirFicha } from "@/lib/sugerencias-gasto-fijo";

// La ficha de pago de un gasto fijo dentro de su hoja (ADR-0452): a quién se le paga, cómo, y cómo reconocerlo. Todo es opcional,
// se completa de a poco. Los campos de la cuenta solo existen para quien puede verlos (líder y admin): para el resto ni se piden
// ni se mandan. Los ejemplos siguen a la categoría elegida (`sugerirFicha`, ADR-0290). Solo dibuja: guardar es de `GastoFijoModal`.

export function FichaDePagoCampos({
  valor,
  onCambio,
  categoria,
  puedeVerBanco,
  deshabilitado = false,
}: {
  valor: FichaFijo;
  onCambio: <K extends keyof FichaFijo>(campo: K, v: FichaFijo[K]) => void;
  /** El código de la categoría elegida arriba: decide los ejemplos. */
  categoria: string;
  puedeVerBanco: boolean;
  deshabilitado?: boolean;
}) {
  const sug = sugerirFicha(categoria);
  const { cuenta, billetera } = camposDePago(valor);
  const alternar = (b: Billetera) => onCambio("billeteras", valor.billeteras.includes(b) ? valor.billeteras.filter((x) => x !== b) : [...valor.billeteras, b]);

  return (
    <div className="mt-5">
      <TituloGrupo className="mb-3" nota="todo es opcional: complétalo cuando tengas el dato">A quién se le paga</TituloGrupo>
      <CampoFin etiqueta="Propietario o empresa" htmlFor="ficha-beneficiario">
        <InputFin
          id="ficha-beneficiario"
          data-campo="ficha-beneficiario"
          value={valor.beneficiario}
          onChange={(e) => onCambio("beneficiario", e.target.value)}
          placeholder={sug.beneficiario}
          maxLength={TOPES_FICHA.beneficiario}
          disabled={deshabilitado}
        />
      </CampoFin>
      <div className="fin-dos-campos">
        <CampoFin etiqueta="Documento" htmlFor="ficha-documento-numero">
          <div className="flex gap-2">
            <SelectFin<TipoDocumento | "">
              id="ficha-documento-tipo"
              etiqueta="Tipo de documento"
              className="w-28 shrink-0"
              valor={valor.documentoTipo}
              onValor={(v) => onCambio("documentoTipo", v)}
              deshabilitado={deshabilitado}
              opciones={[{ valor: "", texto: "Sin dato" }, ...TIPOS_DOCUMENTO.map((t) => ({ valor: t, texto: TEXTO_TIPO_DOCUMENTO[t] }))]}
            />
            <InputFin
              id="ficha-documento-numero"
              inputMode={valor.documentoTipo === "dni" || valor.documentoTipo === "ruc" ? "numeric" : "text"}
              value={valor.documentoNumero}
              onChange={(e) => onCambio("documentoNumero", e.target.value)}
              placeholder={valor.documentoTipo === "ruc" ? "11 números" : valor.documentoTipo === "dni" ? "8 números" : "Número"}
              maxLength={20}
              disabled={deshabilitado || valor.documentoTipo === ""}
            />
          </div>
        </CampoFin>
        <CampoFin etiqueta="Teléfono" htmlFor="ficha-telefono">
          <InputFin id="ficha-telefono" inputMode="tel" value={valor.telefono} onChange={(e) => onCambio("telefono", e.target.value)} placeholder="987 654 321" maxLength={TOPES_FICHA.telefono} disabled={deshabilitado} />
        </CampoFin>
      </div>
      <CampoFin etiqueta="Correo" htmlFor="ficha-correo">
        <InputFin
            id="ficha-correo"
            type="email"
            value={valor.correo}
            onChange={(e) => onCambio("correo", e.target.value)}
            placeholder="nombre@correo.com" // sugerir-fijo: el formato de un correo no depende de lo que se eligió antes
            maxLength={TOPES_FICHA.correo}
            disabled={deshabilitado}
          />
      </CampoFin>

      <TituloGrupo className="mb-3 mt-2">Cómo se paga</TituloGrupo>
      <CampoFin etiqueta="Forma de pago" htmlFor="ficha-forma">
        <SelectFin<FormaDePago | "">
          id="ficha-forma"
          valor={valor.formaDePago}
          onValor={(v) => onCambio("formaDePago", v)}
          deshabilitado={deshabilitado}
          opciones={[{ valor: "", texto: "Sin elegir todavía" }, ...FORMAS_DE_PAGO.map((f) => ({ valor: f, texto: TEXTO_FORMA_DE_PAGO[f] }))]}
        />
      </CampoFin>
      {!puedeVerBanco && (cuenta || billetera) && (
        <p className="nota-cayla">La cuenta a la que se transfiere la ve y la cambia solo un líder o admin.</p>
      )}
      {puedeVerBanco && cuenta && (
        <>
          <div className="fin-dos-campos">
            <CampoFin etiqueta="Banco" htmlFor="ficha-banco">
              {/* sugerir-fijo: el nombre de un banco no depende de lo que se eligió antes */}
              <InputFin id="ficha-banco" value={valor.banco} onChange={(e) => onCambio("banco", e.target.value)} placeholder="BCP, Interbank, BBVA…" maxLength={TOPES_FICHA.banco} disabled={deshabilitado} />
            </CampoFin>
            <CampoFin etiqueta="Número de cuenta" htmlFor="ficha-cuenta">
              <InputFin id="ficha-cuenta" inputMode="numeric" value={valor.cuentaBancaria} onChange={(e) => onCambio("cuentaBancaria", e.target.value)} maxLength={TOPES_FICHA.cuenta} disabled={deshabilitado} />
            </CampoFin>
          </div>
          <div className="fin-dos-campos">
            <CampoFin etiqueta="CCI (20 números)" htmlFor="ficha-cci">
              <InputFin id="ficha-cci" inputMode="numeric" value={valor.cci} onChange={(e) => onCambio("cci", e.target.value)} maxLength={26} disabled={deshabilitado} />
            </CampoFin>
            <CampoFin etiqueta="La cuenta está a nombre de" htmlFor="ficha-titular" ayuda="Compáralo con el nombre que muestra el banco antes de confirmar.">
              <InputFin id="ficha-titular" value={valor.titularCuenta} onChange={(e) => onCambio("titularCuenta", e.target.value)} maxLength={TOPES_FICHA.titular} disabled={deshabilitado} />
            </CampoFin>
          </div>
        </>
      )}
      {puedeVerBanco && billetera && (
        <div className="fin-dos-campos">
          <CampoFin etiqueta="Celular de Yape o Plin" htmlFor="ficha-celular">
            <InputFin id="ficha-celular" inputMode="tel" value={valor.celularBilletera} onChange={(e) => onCambio("celularBilletera", e.target.value)} placeholder="987 654 321" maxLength={16} disabled={deshabilitado} />
          </CampoFin>
          <CampoFin etiqueta="Con qué app">
            <div className="flex items-center gap-5 py-2">
              {BILLETERAS.map((b) => (
                <label key={b} className="flex items-center gap-2 text-sm text-tinta">
                  <Casilla marcada={valor.billeteras.includes(b)} onCambio={() => alternar(b)} etiqueta={TEXTO_BILLETERA[b]} disabled={deshabilitado} />
                  {TEXTO_BILLETERA[b]}
                </label>
              ))}
            </div>
          </CampoFin>
        </div>
      )}

      <TituloGrupo className="mb-3 mt-2">Para reconocerlo y no perderlo</TituloGrupo>
      <div className="fin-dos-campos">
        <CampoFin etiqueta="Código del servicio" htmlFor="ficha-codigo" ayuda="El que sale en el recibo: suministro, contrato o cliente.">
          <InputFin id="ficha-codigo" data-campo="ficha-codigo" value={valor.codigoServicio} onChange={(e) => onCambio("codigoServicio", e.target.value)} placeholder={sug.codigo} maxLength={TOPES_FICHA.codigo} disabled={deshabilitado} />
        </CampoFin>
        <CampoFin etiqueta="Vence el contrato" htmlFor="ficha-contrato">
          <InputFin id="ficha-contrato" type="date" value={valor.contratoVence} onChange={(e) => onCambio("contratoVence", e.target.value)} disabled={deshabilitado} />
        </CampoFin>
      </div>
      <CampoFin etiqueta="Cómo llega el recibo" htmlFor="ficha-recibo">
        <InputFin id="ficha-recibo" value={valor.reciboLlega} onChange={(e) => onCambio("reciboLlega", e.target.value)} placeholder={sug.recibo} maxLength={TOPES_FICHA.recibo} disabled={deshabilitado} />
      </CampoFin>
      <CampoFin etiqueta="Notas para quien herede esto" htmlFor="ficha-notas" ayuda="No escribas claves ni contraseñas: aquí las puede leer quien tenga acceso a este gasto.">
        <textarea /* unificar-fijo: el kit de Finanzas (fin-control, ADR-0195) no tiene caja de varias líneas; es la misma caja hundida */
          id="ficha-notas"
          className="fin-control min-h-[72px] resize-y"
          value={valor.notas}
          onChange={(e) => onCambio("notas", e.target.value)}
          maxLength={TOPES_FICHA.notas}
          rows={3}
          disabled={deshabilitado}
        />
      </CampoFin>
    </div>
  );
}
