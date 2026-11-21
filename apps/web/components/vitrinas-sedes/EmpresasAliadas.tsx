"use client";

import { useState } from "react";
import { Plus, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { firmar } from "@/lib/responsable-reglas";
import { traducirError } from "@/lib/error-escritura";
import { fechaCorta } from "@/lib/carga-inicial-reglas";
import { avisar } from "@/components/ui/Avisos";
import { Aviso } from "@/components/ui/Aviso";
import { BotonDeshacer } from "@/components/ui/BotonDeshacer";
import { Boton, Interruptor } from "@/components/ui/campos";
import { Chip } from "@/components/ui/Chip";
import { LapizEditar } from "@/components/ui/BotonEditar";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { Vacio } from "@/components/ui/Vacio";
import { HojaEmpresaAliada } from "@/components/vitrinas-sedes/HojaEmpresaAliada";
import type { useResponsable } from "@/lib/useResponsable";
import { borradorDeAliada, etiquetaCuenta, REGIMENES, type BorradorAliada, type LecturaAliadas } from "@/lib/empresas-aliadas-reglas";

// «Empresas aliadas» (ADR-0683, opción D que eligió Felipe el 2026-11-21): bajo la banda de CAYLA, que sigue como está, una tarjeta por cada empresa
// que vende en las tiendas con su propio RUC. El botón para agregar vive solo aquí, a un lado del título; las tiendas no muestran quién vende en ellas.
// Solo el Admin agrega o edita: los demás ven las tarjetas.

export function EmpresasAliadas({
  lectura,
  tiendas,
  rucDeCasa,
  responsable,
}: {
  lectura: LecturaAliadas;
  tiendas: readonly { id: string; nombre: string }[];
  rucDeCasa: string | null;
  responsable: ReturnType<typeof useResponsable>;
}) {
  const router = useRouter();
  const [hoja, setHoja] = useState<{
    inicial: BorradorAliada | null;
    bajaPedida: boolean;
  } | null>(null);
  const [deshaciendo, setDeshaciendo] = useState<string | null>(null);
  const { aliadas, puedeEditar } = lectura;
  const otrosRuc = (id: string | null) => aliadas.filter((a) => a.id !== id && a.ruc).map((a) => a.ruc as string);
  const agregar = puedeEditar ? (
    <Boton type="button" onClick={() => setHoja({ inicial: null, bajaPedida: false })} data-guia="config.aliadas-agregar">
      <span className="inline-flex items-center gap-1.5">
        <Plus className="mas h-4 w-4" aria-hidden /> Agregar empresa aliada
      </span>
    </Boton>
  ) : null;

  // Deshacer la baja pedida, durante su semana: un toque, sin otra confirmación (perdonar antes que preguntar).
  // ADR-0683: si las prendas de una aliada pueden entrar a las campañas de CAYLA. Se guarda al tocarlo, como un ajuste; nace apagado.
  async function cambiarCampanas(id: string, nombre: string, entra: boolean) {
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién hace el cambio (Responsable).");
      return;
    }
    setDeshaciendo(id);
    const { error } = (await firmar(createClient().rpc("fijar_aliada_en_campanas" as never, { p_id: id, p_entra: entra } as never) as never, responsable.firma())) as {
      error: unknown;
    };
    setDeshaciendo(null);
    responsable.despues(error as never);
    if (error) {
      avisar.error(traducirError(error as never, "cambiar si entra a las campañas"));
      return;
    }
    avisar.exito(entra ? `Las prendas de ${nombre} ya pueden entrar a una campaña que las incluya.` : `Las prendas de ${nombre} quedan fuera de las campañas.`);
    router.refresh();
  }

  async function deshacerBaja(id: string, nombre: string) {
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién hace el cambio (Responsable).");
      return;
    }
    setDeshaciendo(id);
    const { error } = (await firmar(createClient().rpc("deshacer_baja_empresa_aliada" as never, { p_id: id } as never) as never, responsable.firma())) as {
      error: unknown;
    };
    setDeshaciendo(null);
    responsable.despues(error as never);
    if (error) {
      avisar.error(traducirError(error as never, "deshacer la baja"));
      return;
    }
    avisar.exito(`${nombre} sigue vendiendo: se deshizo la baja.`);
    router.refresh();
  }

  return (
    <section aria-label="Empresas aliadas" data-guia="config.aliadas">
      <TituloSeccion cuenta={aliadas.length} accion={agregar}>
        Empresas aliadas
      </TituloSeccion>
      {aliadas.length === 0 ? (
        <Vacio tamano="chico" icono={<Store />}>
          Ninguna otra empresa vende en tus tiendas.
        </Vacio>
      ) : (
        <div className="vs-aliadas">
          {aliadas.map((a, e) => {
            const regimen = REGIMENES.find((r) => r.valor === a.regimen)?.nombre;
            const contacto = [a.correo, a.telefono].filter(Boolean).join(" · ");
            return (
              <article key={a.id} className="vs-aliada vs-liquido" data-luz style={{ ["--e" as string]: e }}>
                <header>
                  <div className="min-w-0">
                    <b className="vs-aliada-nombre">{a.nombre}</b>
                    <span className="vs-rotulo">{[a.razonSocial, a.ruc ? `RUC ${a.ruc}` : "Sin RUC"].filter(Boolean).join(" · ")}</span>
                  </div>
                  {puedeEditar && (
                    <LapizEditar
                      que={a.nombre}
                      onClick={() =>
                        setHoja({
                          inicial: borradorDeAliada(a),
                          bajaPedida: a.bajaEl !== null,
                        })
                      }
                    />
                  )}
                </header>
                {a.bajaEl && (
                  <div className="vs-aliada-fila items-center">
                    <Chip tono="ambar">Se da de baja el {fechaCorta(a.bajaEl)}</Chip>
                    {puedeEditar && <BotonDeshacer onClick={() => deshacerBaja(a.id, a.nombre)} disabled={deshaciendo === a.id} />}
                  </div>
                )}
                {a.bajaDetenida && (
                  <Aviso tono="atencion" chico titulo="La baja no se aplicó">
                    {a.bajaDetenida}
                  </Aviso>
                )}
                <div className="vs-aliada-fila">
                  {regimen && (
                    <Chip tono="pizarra" versalitas={false}>
                      {a.regimen === "nuevo_rus" ? `${regimen} · solo boleta` : regimen}
                    </Chip>
                  )}
                  {a.sedes.map((s) => (
                    <Chip key={s.id} versalitas={false}>
                      {s.nombre}
                    </Chip>
                  ))}
                </div>
                {contacto && <span className="vs-dato-e text-sm">{contacto}</span>}
                <div className="vs-aliada-fila">
                  {a.cuentas.length ? (
                    a.cuentas.map((c) => (
                      <Chip key={c.id} versalitas={false} title={c.nombre}>
                        {etiquetaCuenta(c)}
                      </Chip>
                    ))
                  ) : (
                    <span className="vs-rotulo">Sin cuentas para cobrar</span>
                  )}
                </div>
                {puedeEditar ? (
                  <Interruptor
                    activo={a.entraACampanas}
                    onActivo={(v) => cambiarCampanas(a.id, a.nombre, v)}
                    disabled={deshaciendo === a.id}
                    etiqueta="Entra a las campañas de CAYLA"
                  />
                ) : (
                  a.entraACampanas && <span className="vs-rotulo">Entra a las campañas de CAYLA</span>
                )}
              </article>
            );
          })}
        </div>
      )}
      {hoja && (
        <HojaEmpresaAliada
          inicial={hoja.inicial}
          bajaPedida={hoja.bajaPedida}
          tiendas={tiendas}
          otrosRuc={otrosRuc(hoja.inicial?.id ?? null)}
          rucDeCasa={rucDeCasa}
          responsable={responsable}
          onClose={() => setHoja(null)}
        />
      )}
    </section>
  );
}
