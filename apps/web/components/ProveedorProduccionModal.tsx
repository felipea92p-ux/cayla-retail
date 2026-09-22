"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Boton, CampoSelectNativo, CampoTexto } from "@/components/ui/campos";
import { Modal } from "@/components/ui/Modal";
import { normalizarCci, normalizarCelular } from "@/lib/proveedores-reglas";
import {
  BANCOS_COMUNES,
  BILLETERAS,
  ETIQUETA_BILLETERA,
  cuentasDeFila,
  escribirCci,
  escribirCelular,
  primerErrorCuentas,
  validarCuentas,
  type Billetera,
} from "@/lib/proveedores-cuentas-form";
import { ETIQUETA_FORMA_PAGO, RUBROS_PRODUCCION, type ProveedorProduccion, type RubroProduccion } from "@/lib/proveedores-produccion-reglas";

// Alta y edición de un proveedor de Producción (ADR-0133, F4a). Un solo formulario para las dos cosas: `guardar_proveedor_produccion`
// crea si no recibe id y reemplaza si lo recibe. Es solo del líder (lleva datos bancarios de un tercero). Con `<Modal>` del
// sistema (ADR-0136). Las reglas de CCI, celular y billetera son las mismas de Compras (`lib/proveedores-cuentas-form`),
// pero el formulario NO es el de Compras: este directorio es aparte (D-H) y no comparte sus RPC ni sus tablas.
//
// Archivar no borra: los lotes y, más adelante, los comprobantes cuelgan del proveedor.

export function ProveedorProduccionModal({ proveedor, onClose }: { proveedor: ProveedorProduccion | null; onClose: () => void }) {
  const router = useRouter();
  const esAlta = proveedor === null;
  const cuentasIniciales = cuentasDeFila({
    cci: proveedor?.cci ?? null,
    celular_billetera: proveedor?.celularBilletera ?? null,
    billeteras: proveedor?.billeteras ?? null,
    titular_cuenta: proveedor?.titularCuenta ?? null,
  });

  const [nombre, setNombre] = useState(proveedor?.nombre ?? "");
  const [rubro, setRubro] = useState<RubroProduccion | "">(proveedor?.rubro ?? "");
  const [ruc, setRuc] = useState(proveedor?.ruc ?? "");
  const [contacto, setContacto] = useState(proveedor?.contacto ?? "");
  const [telefono, setTelefono] = useState(proveedor?.telefono ?? "");
  const [plazo, setPlazo] = useState(proveedor?.plazoCreditoDias ? String(proveedor.plazoCreditoDias) : "");
  const [forma, setForma] = useState(proveedor?.formaPagoPreferida ?? "");
  const [banco, setBanco] = useState(proveedor?.banco ?? "");
  const [cuenta, setCuenta] = useState(proveedor?.cuentaBancaria ?? "");
  const [cci, setCci] = useState(cuentasIniciales.cci);
  const [celular, setCelular] = useState(cuentasIniciales.celularBilletera);
  const [billeteras, setBilleteras] = useState<string[]>(cuentasIniciales.billeteras);
  const [titular, setTitular] = useState(cuentasIniciales.titularCuenta);
  const [cargando, setCargando] = useState(false);
  const [archivando, setArchivando] = useState(false);

  const errores = validarCuentas({ cci, celularBilletera: celular, billeteras, titularCuenta: titular });
  const rucDigitos = ruc.replace(/\D/g, "");
  const errorRuc = ruc.trim() !== "" && rucDigitos.length !== 11 ? "El RUC tiene 11 dígitos." : null;
  const plazoNum = plazo.trim() === "" ? null : Number(plazo);
  const errorPlazo = plazoNum !== null && (!Number.isInteger(plazoNum) || plazoNum <= 0) ? "Días enteros, mayores a cero." : null;

  function alternarBilletera(b: Billetera) {
    setBilleteras((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]));
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return avisar.error("El proveedor necesita un nombre.");
    if (!rubro) return avisar.error("Elige a qué le vende al Taller: tela, avíos, maquila u otro.");
    const primero = primerErrorCuentas(errores);
    if (errorRuc || errorPlazo || primero) return avisar.error(errorRuc ?? errorPlazo ?? primero?.mensaje ?? "Revisa los datos.");

    setCargando(true);
    const { error } = await createClient().rpc("guardar_proveedor_produccion", {
      // p_proveedor_id no tiene DEFAULT en Postgres (hay que pasarlo siempre), pero sí acepta
      // NULL como valor explícito ("id nulo = crear", ver la migración) — el tipo generado no
      // lo refleja porque el generador solo agrega `| null` a parámetros con DEFAULT.
      p_proveedor_id: (proveedor?.id ?? null) as string,
      p_nombre: nombre.trim(),
      p_rubro: rubro,
      p_ruc: rucDigitos || undefined,
      p_contacto: contacto.trim() || undefined,
      p_telefono: telefono.trim() || undefined,
      p_plazo_credito_dias: plazoNum ?? undefined,
      p_forma_pago_preferida: forma || undefined,
      p_banco: banco.trim() || undefined,
      p_cuenta_bancaria: cuenta.trim() || undefined,
      p_cci: normalizarCci(cci) || undefined,
      p_celular_billetera: normalizarCelular(celular) || undefined,
      p_billeteras: billeteras.length > 0 ? billeteras : undefined,
      p_titular_cuenta: titular.trim() || undefined,
    });
    setCargando(false);
    if (error) {
      avisar.error(traducirError(error, esAlta ? "crear el proveedor" : "guardar el proveedor"));
      return;
    }
    avisar.exito(esAlta ? `${nombre.trim()} entró al directorio` : `${nombre.trim()} se actualizó`);
    router.refresh();
    onClose();
  }

  async function cambiarEstado() {
    if (!proveedor) return;
    setArchivando(true);
    const { error } = await createClient().rpc("cambiar_estado_proveedor_produccion", { p_proveedor_id: proveedor.id, p_activo: !proveedor.activo });
    setArchivando(false);
    if (error) {
      avisar.error(traducirError(error, proveedor.activo ? "archivar el proveedor" : "reactivar el proveedor"));
      return;
    }
    avisar.exito(proveedor.activo ? `${proveedor.nombre} quedó archivado` : `${proveedor.nombre} volvió a estar activo`, {
      detalle: proveedor.activo ? "No se borra: sus lotes y su historia se conservan." : undefined,
    });
    router.refresh();
    onClose();
  }

  return (
    <Modal titulo={esAlta ? "Nuevo proveedor" : proveedor.nombre} subtitulo={esAlta ? "Quien le vende tela, avíos o maquila al Taller" : "Proveedor de Producción"} onClose={onClose} ancho="max-w-xl">
      <form onSubmit={guardar} className="space-y-5">
        <CampoTexto etiqueta="Nombre o razón social" placeholder="Textiles Gamarra SAC" value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus={esAlta} />

        <fieldset>
          <legend className="label-cayla text-[11px] text-tinta/65">¿Qué le vende al Taller?</legend>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {RUBROS_PRODUCCION.map((r) => (
              <button
                key={r.valor}
                type="button"
                aria-pressed={rubro === r.valor}
                title={r.ayuda}
                onClick={() => setRubro(r.valor)}
                className="rounded-full border border-tinta/15 px-3.5 py-1.5 text-[13px] text-tinta/80 outline-none transition-colors hover:border-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo/60 aria-pressed:border-tinta aria-pressed:bg-tinta aria-pressed:text-crema"
              >
                {r.etiqueta}
              </button>
            ))}
          </div>
          <p className="mt-1 min-h-4 text-xs text-tinta/65">{RUBROS_PRODUCCION.find((r) => r.valor === rubro)?.ayuda ?? ""}</p>
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <CampoTexto etiqueta="RUC" mono inputMode="numeric" placeholder="Opcional · 11 dígitos" value={ruc} onChange={(e) => setRuc(e.target.value)} tono={errorRuc ? "error" : "neutro"} pie={errorRuc ?? undefined} />
          <CampoTexto etiqueta="Contacto" placeholder="Persona con quien se habla" value={contacto} onChange={(e) => setContacto(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <CampoTexto etiqueta="Teléfono" inputMode="tel" placeholder="Opcional" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
          <CampoTexto
            etiqueta="Plazo de crédito (días)"
            inputMode="numeric"
            placeholder="Contado"
            value={plazo}
            onChange={(e) => setPlazo(e.target.value)}
            tono={errorPlazo ? "error" : "neutro"}
            pie={errorPlazo ?? "Vacío = paga al contado"}
          />
          <CampoSelectNativo etiqueta="Forma de pago" value={forma} onChange={(e) => setForma(e.target.value)}>
            <option value="">Sin preferencia</option>
            {Object.entries(ETIQUETA_FORMA_PAGO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </CampoSelectNativo>
        </div>

        <div className="space-y-3 rounded-2xl border border-sand bg-crema p-3.5">
          <p className="label-cayla text-[11px] text-tinta/65">Cómo pagarle · todo opcional</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <CampoTexto etiqueta="Banco" list="bancos-produccion" placeholder="BCP, Interbank…" value={banco} onChange={(e) => setBanco(e.target.value)} />
            <CampoTexto etiqueta="N.° de cuenta" mono inputMode="numeric" placeholder="Depósito o mismo banco" value={cuenta} onChange={(e) => setCuenta(e.target.value)} />
          </div>
          <datalist id="bancos-produccion">
            {BANCOS_COMUNES.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
          <CampoTexto
            etiqueta="CCI (transferencia de otro banco)"
            mono
            inputMode="numeric"
            placeholder="20 dígitos"
            value={cci}
            onChange={(e) => setCci(escribirCci(e.target.value))}
            tono={errores.cci ? "error" : "neutro"}
            pie={errores.cci}
          />
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <CampoTexto
              etiqueta="Celular Yape / Plin"
              mono
              inputMode="tel"
              placeholder="987 654 321"
              value={celular}
              onChange={(e) => setCelular(escribirCelular(e.target.value))}
              tono={errores.celular || errores.billeteras ? "error" : "neutro"}
              pie={errores.celular ?? errores.billeteras}
            />
            <div>
              <p className="label-cayla text-[11px] text-tinta/65">App</p>
              <div className="mt-1.5 flex gap-1.5">
                {BILLETERAS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    aria-pressed={billeteras.includes(b)}
                    onClick={() => alternarBilletera(b)}
                    className="h-9 rounded-md border border-tinta/15 px-3 text-[13px] text-tinta/80 outline-none transition-colors hover:border-tinta focus-visible:outline focus-visible:outline-2 focus-visible:outline-rojo/60 aria-pressed:border-tinta aria-pressed:bg-tinta aria-pressed:text-crema"
                  >
                    {ETIQUETA_BILLETERA[b]}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <CampoTexto
            etiqueta="Titular de la cuenta"
            placeholder="Como lo muestra el banco al pagar"
            value={titular}
            onChange={(e) => setTitular(e.target.value)}
            tono={errores.titular ? "error" : "neutro"}
            pie={errores.titular}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          {proveedor ? (
            <Boton peso="discreto" type="button" cargando={archivando} onClick={cambiarEstado}>
              {proveedor.activo ? "Archivar proveedor" : "Reactivar proveedor"}
            </Boton>
          ) : (
            <span />
          )}
          <Boton peso="primario" type="submit" cargando={cargando} className="sm:min-w-44">
            {cargando ? "Guardando…" : esAlta ? "Agregar al directorio" : "Guardar cambios"}
          </Boton>
        </div>
      </form>
    </Modal>
  );
}
