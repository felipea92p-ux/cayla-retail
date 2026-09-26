"use client";

import { useEffect, useRef, useState } from "react";
import type { Clienta } from "@/lib/clientas-reglas";
import { buscarClienta, registrarClienta, type DatosAlta } from "@/lib/clientas-acciones";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { CampoTexto, Boton, Interruptor } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { useResponsable } from "@/lib/useResponsable";

// Pantalla MÍNIMA de verificación de la ficha de clienta (D-76/D-77) — para poder probar
// `buscar_clienta`/`registrar_clienta` a mano en el navegador. NO es la pantalla de captura
// del mostrador (Punto de Venta): esa la construye otra tanda de agentes después, y por eso
// esto no está enganchado a `lib/menu.ts`.
const ALTA_VACIA: DatosAlta = { dni: "", nombre: "", telefonoWhatsapp: "", aceptaWhatsapp: false, cumpleDia: "", cumpleMes: "" };

export function ClientasPanel({ clientasIniciales, busquedaInicial = "" }: { clientasIniciales: Clienta[]; busquedaInicial?: string }) {
  const [termino, setTermino] = useState(busquedaInicial);
  const [resultados, setResultados] = useState<Clienta[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [alta, setAlta] = useState<DatosAlta>(ALTA_VACIA);
  const [guardando, setGuardando] = useState(false);
  const [recientes, setRecientes] = useState(clientasIniciales);
  // Quién registra a la clienta (ADR-0161): la base firma el alta con el responsable del combo.
  const responsable = useResponsable();

  async function onBuscar(e: React.FormEvent) {
    e.preventDefault();
    await buscar(termino);
  }

  async function buscar(termino: string) {
    if (termino.trim() === "") {
      setResultados(null);
      return;
    }
    setBuscando(true);
    const { clientas, error } = await buscarClienta(termino);
    setBuscando(false);
    if (error) {
      avisar.error(traducirError(error, "buscar la clienta"));
      return;
    }
    setResultados(clientas);
  }

  // «Ficha de la clienta» desde Ventas ▸ Historial (ADR-0230) llega con `?q=<nombre>`: se busca una vez al abrir.
  const yaBuscoInicial = useRef(false);
  useEffect(() => {
    if (!busquedaInicial.trim() || yaBuscoInicial.current) return;
    yaBuscoInicial.current = true;
    void buscar(busquedaInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, []);

  async function onRegistrar(e: React.FormEvent) {
    e.preventDefault();
    if (alta.dni.trim() === "" && alta.nombre.trim() === "" && alta.telefonoWhatsapp.trim() === "") {
      avisar.error("Escribe al menos un dato — DNI, nombre o WhatsApp — antes de registrar.");
      return;
    }
    if (!responsable.listo) {
      if (responsable.motivo) avisar.error(responsable.motivo);
      return;
    }
    setGuardando(true);
    const { id, error } = await registrarClienta(alta, responsable.firma());
    setGuardando(false);
    responsable.despues(error);
    if (error || !id) {
      avisar.error(traducirError(error, "registrar la clienta"));
      return;
    }
    avisar.exito("Clienta registrada", { detalle: alta.nombre.trim() || alta.dni.trim() || "sin nombre" });
    setAlta(ALTA_VACIA);
    setRecientes((prev) => [
      {
        id,
        dni: alta.dni.trim() || null,
        nombre: alta.nombre.trim() || null,
        telefonoWhatsapp: alta.telefonoWhatsapp.trim() || null,
        tienePermisoWhatsapp: alta.aceptaWhatsapp,
        cumpleDia: alta.cumpleDia.trim() === "" ? null : Number(alta.cumpleDia),
        cumpleMes: alta.cumpleMes.trim() === "" ? null : Number(alta.cumpleMes),
        createdAt: new Date().toISOString(),
      },
      ...prev.filter((c) => c.id !== id),
    ]);
  }

  const lista = resultados ?? recientes;

  return (
    <div className="space-y-8">
      <div>
        <p className="label-cayla text-[11px] text-tinta/65">Clientas — verificación de backend</p>
        <h1 className="font-display mt-1 text-2xl text-tinta">Clientas</h1>
        <p className="mt-1 text-sm text-tinta/65">
          Ficha mínima (D-76/D-77): identificación no invasiva, WhatsApp con permiso aparte del teléfono. Esta
          pantalla es solo para probar el backend a mano — el mostrador tendrá su propia captura.
        </p>
      </div>

      <form onSubmit={onBuscar} className="flex items-end gap-3">
        <div className="max-w-sm flex-1">
          <CampoTexto
            etiqueta="Buscar"
            value={termino}
            onChange={(e) => setTermino(e.target.value)}
            placeholder="DNI, WhatsApp o nombre…"
          />
        </div>
        <Boton type="submit" peso="primario" cargando={buscando}>
          Buscar
        </Boton>
        {resultados !== null && (
          <Boton
            type="button"
            onClick={() => {
              setTermino("");
              setResultados(null);
            }}
          >
            Limpiar
          </Boton>
        )}
      </form>

      <div className="space-y-3">
        <p className="label-cayla text-[11px] text-tinta/65">
          {resultados !== null ? `${resultados.length} resultado${resultados.length === 1 ? "" : "s"}` : "Últimas registradas"}
        </p>
        {lista.length === 0 ? (
          <p className="text-sm text-tinta/65">
            {resultados !== null ? "Sin coincidencias." : "Todavía no hay clientas registradas."}
          </p>
        ) : (
          <div className="space-y-2">
            {lista.map((c) => (
              <div key={c.id} className="card-cayla flex items-center justify-between gap-4 p-4">
                <div>
                  <p className="text-sm font-medium text-tinta">{c.nombre ?? "Sin nombre"}</p>
                  <p className="mt-0.5 text-xs text-tinta/65">
                    {[c.dni ? `DNI ${c.dni}` : null, c.telefonoWhatsapp].filter(Boolean).join(" · ") || "Sin DNI ni WhatsApp"}
                    {c.cumpleDia && c.cumpleMes ? ` · cumple ${c.cumpleDia}/${c.cumpleMes}` : ""}
                  </p>
                </div>
                <span className={`label-cayla text-[10px] ${c.tienePermisoWhatsapp ? "text-verde" : "text-tinta/40"}`}>
                  {c.tienePermisoWhatsapp ? "WhatsApp permitido" : "Sin permiso WhatsApp"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={onRegistrar} className="card-cayla max-w-lg space-y-4 p-5">
        <p className="label-cayla text-[11px] text-tinta/65">Registrar clienta</p>
        <CampoTexto
          etiqueta="DNI (opcional)"
          value={alta.dni}
          onChange={(e) => setAlta((a) => ({ ...a, dni: e.target.value }))}
          mono
          inputMode="numeric"
        />
        <CampoTexto etiqueta="Nombre" value={alta.nombre} onChange={(e) => setAlta((a) => ({ ...a, nombre: e.target.value }))} />
        <CampoTexto
          etiqueta="WhatsApp"
          value={alta.telefonoWhatsapp}
          onChange={(e) => setAlta((a) => ({ ...a, telefonoWhatsapp: e.target.value }))}
          mono
          inputMode="tel"
        />
        <Interruptor
          activo={alta.aceptaWhatsapp}
          onActivo={(v) => setAlta((a) => ({ ...a, aceptaWhatsapp: v }))}
          etiqueta="Acepta que la contactemos por WhatsApp"
          pie="Permiso APARTE de dejar el número — nunca se asume (Ley 29733)."
        />
        <div className="grid grid-cols-2 gap-3">
          <CampoTexto
            etiqueta="Día de cumpleaños"
            value={alta.cumpleDia}
            onChange={(e) => setAlta((a) => ({ ...a, cumpleDia: e.target.value }))}
            mono
            inputMode="numeric"
            placeholder="1-31"
          />
          <CampoTexto
            etiqueta="Mes de cumpleaños"
            value={alta.cumpleMes}
            onChange={(e) => setAlta((a) => ({ ...a, cumpleMes: e.target.value }))}
            mono
            inputMode="numeric"
            placeholder="1-12"
          />
        </div>
        <ComboResponsable control={responsable} deshabilitado={guardando} />
        <Boton type="submit" peso="primario" cargando={guardando} disabled={!responsable.listo} title={responsable.motivo ?? undefined}>
          Registrar
        </Boton>
      </form>
    </div>
  );
}
