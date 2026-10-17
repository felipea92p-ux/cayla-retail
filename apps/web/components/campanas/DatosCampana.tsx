"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Globe, Store } from "lucide-react";
import { avisar } from "@/components/ui/Avisos";
import { Aviso } from "@/components/ui/Aviso";
import { DISENO_DE_SIEMPRE, type DisenoDeCampana } from "@cayla-retail/portada";
import { Boton, CampoTexto } from "@/components/ui/campos";
import { BotonEditar } from "@/components/ui/BotonEditar";
import { BotonImprimir } from "@/components/ui/BotonImprimir";
import { PieAcciones } from "@/components/ui/PieAcciones";
import { TituloSeccion } from "@/components/ui/TituloSeccion";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CampoGuiado, PieGuia } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { firmar } from "@/lib/responsable-reglas";
import { useResponsable } from "@/lib/useResponsable";
import { prendasBajoCosto, type PrendaConCosto } from "@/lib/etiqueta-campana";
import { urlEtiquetasDePrecio } from "@/lib/etiqueta-precio-reglas";
import { vigenciaDe } from "@/lib/etiqueta-vigencia";
import { camposDeDatos, datosValidos, limpiarNombre, NOMBRE_MAX, type CampanaDetalle } from "@/lib/campana-detalle";
import { sugerirNombreCampana } from "@/lib/sugerencias-campanas";
import type { PiezaDePortada } from "@/lib/campana-diseno";
import { CamposDeCampana, leerCamposDeCampana, type CategoriaDeCampana } from "./CamposDeCampana";
import { Lienzo } from "./Lienzo";
import { PortadaDeCampana } from "./PortadaDeCampana";

/**
 * Tienda web ▸ Campañas ▸ una campaña ▸ Datos (ADR-0436, actividad 2; maqueta, pantalla 4): lo que antes era «Configurar campaña» de
 * Catálogo ▸ Atributos, en su página. El nombre, el descuento, las fechas y las categorías se guardan juntos (`guardar_campana`, todo o
 * nada), firmados con el responsable. Quien ve Campañas pone también el descuento (Felipe, decisión 3: una sola llave), y la pantalla
 * dice dónde se cobra: en la caja de las tiendas y en la web. Al lado, lo que la campaña es en tienda (sus etiquetas de precio) y en la
 * web (su portada, la que ve el cliente hoy, con el botón para diseñarla).
 */
export function DatosCampana({
  campana,
  categorias,
  prendasConCosto,
  tiendas,
  nombresUsados,
  hoy,
  disenoPublicado,
  piezas,
  ahora,
}: {
  campana: CampanaDetalle;
  categorias: CategoriaDeCampana[];
  prendasConCosto: PrendaConCosto[];
  /** Las tiendas cuya caja cobra el descuento (las activas). */
  tiendas: string[];
  /** Los nombres de las otras etiquetas: el ejemplo del nombre nunca propone uno que ya existe. */
  nombresUsados: string[];
  hoy: string;
  /** El diseño que ve el cliente hoy (null: la portada de siempre). */
  disenoPublicado: DisenoDeCampana | null;
  piezas: readonly PiezaDePortada[];
  ahora: number;
}) {
  const router = useRouter();
  const responsable = useResponsable();
  const inicial = {
    nombre: campana.nombre,
    descuento: campana.pct === null ? "" : String(campana.pct),
    desde: campana.desde ?? "",
    hasta: campana.hasta ?? "",
    categorias: [...campana.categoriaIds].sort().join(","),
  };
  const [nombre, setNombre] = useState(inicial.nombre);
  const [descuento, setDescuento] = useState(inicial.descuento);
  const [desde, setDesde] = useState(inicial.desde);
  const [hasta, setHasta] = useState(inicial.hasta);
  const [elegidas, setElegidas] = useState(() => new Set(campana.categoriaIds));
  const [guardando, setGuardando] = useState(false);
  const [cambiandoActivo, setCambiandoActivo] = useState(false);

  const hayCambio =
    nombre !== inicial.nombre ||
    descuento !== inicial.descuento ||
    desde !== inicial.desde ||
    hasta !== inicial.hasta ||
    [...elegidas].sort().join(",") !== inicial.categorias;
  const entrada = { nombre, descuento, desde, hasta, categorias: elegidas.size, puedeDarDescuento: true };
  const guia = useGuiaCampos([
    ...camposDeDatos(entrada),
    ...(hayCambio ? [{ id: "responsable", nombre: "Quién registra", requerido: true, hecho: responsable.listo, pendiente: "Elige quién registra." }] : []),
  ]);
  const { pct, fDesde, fHasta } = leerCamposDeCampana({ descuento, desde, hasta });
  const bajoCosto = prendasBajoCosto(pct.ok ? pct.valor : null, prendasConCosto, elegidas, new Set(campana.varianteIds));
  const valido = datosValidos(entrada);

  function deshacer() {
    setNombre(inicial.nombre);
    setDescuento(inicial.descuento);
    setDesde(inicial.desde);
    setHasta(inicial.hasta);
    setElegidas(new Set(campana.categoriaIds));
  }

  async function guardar() {
    if (!valido || !pct.ok || !fDesde.ok || !fHasta.ok || !responsable.listo) return;
    setGuardando(true);
    try {
      const { error } = await firmar(
        createClient().rpc(
          "guardar_campana" as never,
          {
            p_id: campana.id,
            p_nombre: limpiarNombre(nombre),
            p_descuento_pct: pct.valor,
            p_desde: fDesde.valor,
            p_hasta: fHasta.valor,
            p_categoria_ids: [...elegidas],
          } as never,
        ),
        responsable.firma(),
      );
      responsable.despues(error);
      if (error) {
        avisar.error(traducirError(error, "guardar la campaña"));
        return;
      }
      avisar.exito(`${limpiarNombre(nombre)} guardada`, { detalle: "La caja y la tienda online la toman en menos de un minuto." });
      router.refresh();
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarActivo(activo: boolean) {
    if (!responsable.listo) {
      avisar.error("Elige quién registra antes de cambiar la campaña.");
      return;
    }
    setCambiandoActivo(true);
    try {
      const { error } = await firmar(createClient().rpc("activar_campana" as never, { p_id: campana.id, p_activo: activo } as never), responsable.firma());
      responsable.despues(error);
      if (error) {
        avisar.error(traducirError(error, activo ? "activar la campaña" : "desactivar la campaña"));
        return;
      }
      avisar.exito(activo ? `${campana.nombre} activada` : `${campana.nombre} desactivada`, {
        detalle: activo ? undefined : "Ya no sale en la portada ni se cobra su descuento. Se puede volver a activar.",
      });
      router.refresh();
    } catch {
      avisar.error("No se pudo hablar con el servidor. Reintenta en un momento.");
    } finally {
      setCambiandoActivo(false);
    }
  }

  // Las etiquetas de precio: con la campaña vigente (precio rebajado) o ya terminada (vuelve al normal); antes de empezar no hay nada
  // que imprimir, la etiqueta diría el precio de hoy (la misma regla de Atributos, ADR-0180).
  const vigencia = vigenciaDe(campana.desde, campana.hasta, hoy);
  const imprimible = campana.pct !== null && campana.estado === "aprobado" && campana.activo && vigencia?.estado !== "proxima";

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <section className="card-cayla" data-guia="campana.datos">
        <div className="border-b border-sand px-4 py-3.5 sm:px-5">
          <TituloSeccion>Qué y cuándo</TituloSeccion>
        </div>
        {!campana.activo && (
          <div className="px-4 pt-4 sm:px-5">
            <Aviso
              tono="atencion"
              titulo="Esta campaña está desactivada"
              accion={
                <Boton peso="fantasma" onClick={() => void cambiarActivo(true)} cargando={cambiandoActivo} textoCargando="Activando…">
                  Activarla de nuevo
                </Boton>
              }
            >
              No sale en la portada ni se cobra su descuento.
            </Aviso>
          </div>
        )}
        <div className="space-y-5 p-4 sm:p-5">
          <CampoGuiado id="nombre" guia={guia}>
            <CampoTexto
              etiqueta={guia.etiqueta("nombre", "Nombre")}
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={NOMBRE_MAX + 10}
              placeholder={sugerirNombreCampana(nombresUsados, hoy)}
              pie="El nombre que ve el cliente en la portada y en la cinta de arriba."
              autoComplete="off"
            />
          </CampoGuiado>
          <CamposDeCampana
            guia={guia}
            descuento={descuento}
            setDescuento={setDescuento}
            desde={desde}
            setDesde={setDesde}
            hasta={hasta}
            setHasta={setHasta}
            elegidas={elegidas}
            setElegidas={setElegidas}
            categorias={categorias}
            puedeDarDescuento
            bajoCosto={bajoCosto}
          />
          <div data-guia="campana.cobra">
            <p className="campo-etiqueta">Se cobra en</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {tiendas.map((t) => (
                <li key={t} className="inline-flex items-center gap-1.5 rounded-full bg-hueso px-3 py-1.5 text-[13px] font-semibold text-tinta">
                  <Store aria-hidden className="h-3.5 w-3.5 text-taupe" />
                  {t}
                </li>
              ))}
              <li className="inline-flex items-center gap-1.5 rounded-full bg-hueso px-3 py-1.5 text-[13px] font-semibold text-tinta">
                <Globe aria-hidden className="h-3.5 w-3.5 text-taupe" />
                La web
              </li>
            </ul>
            <p className="mt-2 text-[13px] text-tinta/70">
              Vender aplica el descuento solo, dentro de las fechas. Si una prenda tiene dos campañas, va la de mayor descuento.
            </p>
          </div>
          {hayCambio && (
            <div className="space-y-1.5">
              <p className="campo-etiqueta">Quién registra</p>
              <ComboResponsable control={responsable} />
            </div>
          )}
          <PieGuia guia={guia} listo={hayCambio ? "Todo listo para guardar." : "Sin cambios por guardar."} />
          <PieAcciones
            guia="campana.pie"
            izquierda={
              campana.activo ? (
                <Boton peso="peligro" onClick={() => void cambiarActivo(false)} cargando={cambiandoActivo} textoCargando="Desactivando…" disabled={guardando}>
                  Desactivar campaña
                </Boton>
              ) : undefined
            }
          >
            <Boton peso="fantasma" onClick={deshacer} disabled={!hayCambio || guardando}>
              Cancelar
            </Boton>
            <Boton peso="primario" onClick={() => void guardar()} cargando={guardando} disabled={!hayCambio || !valido || !responsable.listo} title={guia.frase ?? undefined}>
              Guardar cambios
            </Boton>
          </PieAcciones>
        </div>
      </section>

      <div className="space-y-5">
        <section className="card-cayla" data-guia="campana.en-tienda">
          <div className="border-b border-sand px-4 py-3.5 sm:px-5">
            <TituloSeccion>En tienda</TituloSeccion>
          </div>
          <div className="space-y-3 p-4 sm:p-5">
            <p className="text-[13.5px] text-tinta/80">
              {campana.pct === null
                ? "Sin descuento, la campaña no cambia ningún precio: no hay etiquetas que imprimir."
                : vigencia?.estado === "proxima"
                  ? "Cuando empiece, imprime aquí las etiquetas con el precio rebajado."
                  : vigencia?.estado === "terminada"
                    ? "Ya terminó: imprime las etiquetas con el precio normal de las mismas prendas."
                    : "Con la campaña vigente, imprime las etiquetas con el precio rebajado. Al terminar, las mismas prendas vuelven al precio normal."}
            </p>
            {imprimible && (
              <BotonImprimir href={urlEtiquetasDePrecio({ campana: campana.id })}>
                {vigencia?.estado === "terminada" ? "Imprimir con el precio normal" : "Imprimir etiquetas de precio"}
              </BotonImprimir>
            )}
          </div>
        </section>
        <section className="card-cayla overflow-hidden" data-guia="campana.en-web">
          <div className="border-b border-sand px-4 py-3.5 sm:px-5">
            <TituloSeccion>En la web</TituloSeccion>
          </div>
          <div className="space-y-3 p-4 sm:p-5">
            <div className="overflow-hidden rounded-xl border border-sand">
              <Lienzo ancho={1280} alto={720} etiqueta={`La portada de ${campana.nombre} en la tienda online`}>
                <PortadaDeCampana campana={campana} diseno={disenoPublicado ?? DISENO_DE_SIEMPRE} tema="claro" piezas={piezas} ahora={ahora} />
              </Lienzo>
            </div>
            <p className="text-[13px] text-tinta/70">
              {disenoPublicado ? "Así se anuncia en la portada de la tienda online." : "Así se anuncia en la portada de la tienda online: con el diseño de siempre."}
            </p>
            <BotonEditar href={`/tienda-web/campanas/${campana.id}`} chico>
              Diseñar la portada
            </BotonEditar>
          </div>
        </section>
      </div>
    </div>
  );
}
