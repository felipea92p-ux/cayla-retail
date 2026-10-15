"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { traducirError } from "@/lib/error-escritura";
import { avisar } from "@/components/ui/Avisos";
import { Aviso } from "@/components/ui/Aviso";
import { Chip } from "@/components/ui/Chip";
import { Interruptor } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import { CabeceraBloque, CampoFin, InputFin, Superficie } from "@/components/finanzas/kit";
import { FaltanDelPaso } from "@/components/alta-producto/guia";
import { CampoGuiado } from "@/components/guia-de-foco/CampoGuiado";
import { useGuiaCampos, type GuiaCampos } from "@/components/guia-de-foco/useGuiaCampos";
import { useResponsable } from "@/lib/useResponsable";
import { firmar } from "@/lib/responsable-reglas";
import { ajustarCelular, celularValido } from "@/lib/club-reglas";
import { nombreCorto } from "@/lib/precio-sede-reglas";
import type { CampoDeGuia } from "@/lib/guia-campos";
import { sugerirDireccion, sugerirNombreWeb } from "@/lib/sugerencias-tienda-web";
import {
  NOMBRE_DATO,
  TOPES_SEDE,
  borradorDe,
  borradorParametros,
  camposDeGuia,
  errorDeLargo,
  estadoSedeWeb,
  faltaParaMostrar,
  fraseNiveles,
  fusionarBorrador,
  idCampo,
  limpiarTexto,
  pendientesDe,
  validarParametrosTiendaWeb,
  type BorradorParametros,
  type BorradorSede,
  type ConfiguracionTiendaWeb as Datos,
  type DatoWeb,
  type ParametrosTiendaWeb,
  type SedeWeb,
} from "@/lib/tienda-web-reglas";

// Configuración ▸ Tienda web (ADR-0408, actividad 6; maqueta `vConfig` de docs/maquetas/tienda-online-2026-10/): lo que la
// tienda online le muestra al cliente de cada tienda —nombre, WhatsApp, dirección y horario, y si se muestra— y los plazos de
// los pedidos web. Dibujada con el kit de Finanzas como el resto de Configuración (ADR-0195), y como sus otras pestañas: CADA
// CASILLA SE GUARDA SOLA AL SALIR DE ELLA, firmada con el responsable, sin botón «Guardar» (la maqueta tenía uno; aquí manda
// cómo se guarda el resto de Configuración: una función, una pieza).
//
// El WhatsApp es `ubicaciones.whatsapp_numero`, el mismo del QR del club (Tiendas y caja): se guarda con `guardar_whatsapp_tienda`,
// la misma función y la misma regla de allá. El resto, con `guardar_sede_tienda_web`, que no deja encender una tienda a la que
// le falte algo (la guía de foco lo dice antes, con la misma regla: `faltaParaMostrar`).

type Guardar = (hacer: () => PromiseLike<{ error: unknown }>, que: string, listo: string) => Promise<boolean>;
type CampoTexto = "nombreWeb" | "direccion" | "horario";

/** El horario se escribe igual en cualquier tienda: su ejemplo no depende de nada elegido antes. */
const EJEMPLO_HORARIO = "Ej. Lunes a sábado, de 10 a. m. a 9 p. m."; // sugerir-fijo: la forma de escribir un horario es la misma en toda tienda

const DATO_DE: Record<CampoTexto, DatoWeb | "horario"> = { nombreWeb: "nombre_web", direccion: "direccion", horario: "horario" };

const listaDe = (sedes: readonly SedeWeb[]) => Object.fromEntries(sedes.map((s) => [s.id, borradorDe(s)])) as Record<string, BorradorSede>;

export function ConfiguracionTiendaWeb({ datos }: { datos: Datos }) {
  const router = useRouter();
  const responsable = useResponsable();
  const [guardando, setGuardando] = useState(false);
  // La tienda cuyo «Se ve en la web» se está guardando: su interruptor espera la respuesta.
  const [cambiandoEn, setCambiandoEn] = useState<string | null>(null);

  // Lo escrito en cada tienda. Cuando la base trae datos nuevos (otro guardado, un refresco), cada caja toma lo nuevo salvo la
  // que la persona tiene escrita distinto (`fusionarBorrador`): un refresco no le borra a nadie lo que lleva escrito.
  const [borradores, setBorradores] = useState(() => listaDe(datos.sedes));
  const [bases, setBases] = useState(() => listaDe(datos.sedes));
  const [mostrar, setMostrar] = useState(() => Object.fromEntries(datos.sedes.map((s) => [s.id, s.mostrar])) as Record<string, boolean>);
  const [vista, setVista] = useState(datos);
  if (vista !== datos) {
    const nuevas = listaDe(datos.sedes);
    setBorradores((b) => Object.fromEntries(datos.sedes.map((s) => [s.id, fusionarBorrador(b[s.id] ?? nuevas[s.id]!, bases[s.id] ?? nuevas[s.id]!, nuevas[s.id]!)])));
    setBases(nuevas);
    setMostrar(Object.fromEntries(datos.sedes.map((s) => [s.id, s.mostrar])));
    setVista(datos);
  }

  // Guía de foco: qué le falta a cada tienda para verse en la web. Solo llevan marca los datos que llegaron vacíos al abrir.
  const [pendientes] = useState(() => pendientesDe(datos.sedes));
  const guia = useGuiaCampos(
    camposDeGuia(
      datos.sedes.map((s) => ({ id: s.id, nombre: s.nombre, borrador: borradores[s.id] ?? borradorDe(s) })),
      pendientes,
    ),
    { enModal: false },
  );

  const guardar: Guardar = async (hacer, que, listo) => {
    if (!responsable.listo) {
      avisar.error(responsable.motivo ?? "Elige quién hace el cambio (Responsable).");
      return false;
    }
    setGuardando(true);
    const { error } = await firmar(hacer() as never, responsable.firma());
    setGuardando(false);
    responsable.despues(error as never);
    if (error) {
      avisar.error(traducirError(error as never, que));
      return false;
    }
    avisar.exito(listo);
    router.refresh();
    return true;
  };

  const escribir = (sedeId: string, campo: keyof BorradorSede, valor: string) =>
    setBorradores((b) => ({ ...b, [sedeId]: { ...(b[sedeId] as BorradorSede), [campo]: valor } }));
  const revertir = (sedeId: string, campo: keyof BorradorSede) => escribir(sedeId, campo, bases[sedeId]?.[campo] ?? "");

  /** Lo que la base guarda de una tienda: lo escrito en sus cajas (limpio) y si se muestra. */
  const guardarSede = (s: SedeWeb, b: BorradorSede, enWeb: boolean, que: string, listo: string) =>
    guardar(
      () =>
        createClient().rpc(
          "guardar_sede_tienda_web" as never,
          {
            p_ubicacion_id: s.id,
            p_nombre_web: limpiarTexto(b.nombreWeb),
            p_direccion: limpiarTexto(b.direccion),
            p_horario: limpiarTexto(b.horario),
            p_mostrar: enWeb,
          } as never,
        ),
      que,
      listo,
    );

  async function alSalir(s: SedeWeb, campo: CampoTexto) {
    const b = borradores[s.id];
    const base = bases[s.id];
    if (!b || !base || limpiarTexto(b[campo]) === limpiarTexto(base[campo])) return;
    const largo = errorDeLargo(b);
    if (largo) {
      avisar.error(`${s.nombre}: ${largo}`);
      revertir(s.id, campo);
      return;
    }
    const nuevo = limpiarTexto(b[campo]);
    const listo = {
      nombreWeb: nuevo ? `${s.nombre}: en la web se llama «${nuevo}».` : `${s.nombre}: sin nombre en la web.`,
      direccion: nuevo ? `${s.nombre}: dirección para recoger guardada.` : `${s.nombre}: sin dirección para recoger.`,
      horario: nuevo ? `${s.nombre}: horario guardado.` : `${s.nombre}: sin horario en la web.`,
    }[campo];
    const ok = await guardarSede(s, b, mostrar[s.id] ?? false, `guardar ${NOMBRE_DATO[DATO_DE[campo]].toLocaleLowerCase("es")} de ${s.nombre}`, listo);
    if (!ok) revertir(s.id, campo);
  }

  async function alSalirWhatsapp(s: SedeWeb) {
    const numero = borradores[s.id]?.whatsapp ?? "";
    if (numero === (bases[s.id]?.whatsapp ?? "")) return;
    if (numero !== "" && !celularValido(numero)) {
      avisar.error(`WhatsApp de ${s.nombre}: tiene 9 dígitos y empieza en 9. Si la tienda no tiene uno, déjalo vacío.`);
      revertir(s.id, "whatsapp");
      return;
    }
    const ok = await guardar(
      () => createClient().rpc("guardar_whatsapp_tienda", { p_ubicacion_id: s.id, p_numero: numero || undefined }),
      "guardar el WhatsApp de la tienda",
      numero
        ? `${s.nombre}: WhatsApp ${numero}. Es el mismo del QR del club.`
        : `${s.nombre}: sin WhatsApp. No se ve en la web ni muestra el QR del club.`,
    );
    if (!ok) revertir(s.id, "whatsapp");
  }

  async function alCambiarMostrar(s: SedeWeb, valor: boolean) {
    const b = borradores[s.id] ?? borradorDe(s);
    const nombre = limpiarTexto(b.nombreWeb) ?? nombreCorto(s.nombre);
    setCambiandoEn(s.id);
    const ok = await guardarSede(s, b, valor, `${valor ? "mostrar" : "ocultar"} ${s.nombre} en la web`, valor ? `«${nombre}» ya se ve en la web.` : `«${nombre}» ya no se ve en la web.`);
    setCambiandoEn(null);
    if (ok) setMostrar((m) => ({ ...m, [s.id]: valor }));
  }

  if (!datos.sedes.length) {
    return <div className="nota-cayla">No hay tiendas abiertas para mostrar en la web.</div>;
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <p className="max-w-md text-[13px] text-taupe">
          Lo que la tienda online le muestra al cliente de cada tienda. Cada casilla se guarda sola al salir de ella, a nombre de quien figure como
          responsable; la web lo muestra en unos minutos.
        </p>
        <div className="w-full max-w-xs">
          <ComboResponsable control={responsable} deshabilitado={guardando} />
        </div>
      </div>

      <section className="fin-dos-col" data-guia="config.tienda-web-sedes">
        {datos.sedes.map((s, i) => (
          <TarjetaSede
            key={s.id}
            sede={s}
            borrador={borradores[s.id] ?? borradorDe(s)}
            enWeb={mostrar[s.id] ?? false}
            primera={i === 0}
            guia={guia}
            pendientes={pendientes}
            guardandoMostrar={cambiandoEn === s.id}
            onEscribir={(campo, valor) => escribir(s.id, campo, valor)}
            onRevertir={(campo) => revertir(s.id, campo)}
            onSalir={(campo) => (campo === "whatsapp" ? alSalirWhatsapp(s) : alSalir(s, campo))}
            onMostrar={(v) => alCambiarMostrar(s, v)}
          />
        ))}
      </section>

      {datos.parametros ? (
        <Plazos parametros={datos.parametros} guardar={guardar} />
      ) : (
        <p className="nota-cayla">Falta pegar en la base la migración de la tienda web (20261014231000) para ajustar los plazos.</p>
      )}

      <div className="nota-cayla" data-guia="config.tienda-web-nota">
        El WhatsApp de cada tienda es el mismo del QR del club: cambiarlo aquí también lo cambia en Tiendas y caja y en el cartel del
        mostrador. Por ahora no hay envíos: todo pedido web se recoge en la tienda que eligió el cliente.
      </div>
    </>
  );
}

function TarjetaSede({
  sede: s,
  borrador: b,
  enWeb,
  primera,
  guia,
  pendientes,
  guardandoMostrar,
  onEscribir,
  onRevertir,
  onSalir,
  onMostrar,
}: {
  sede: SedeWeb;
  borrador: BorradorSede;
  enWeb: boolean;
  primera: boolean;
  guia: GuiaCampos;
  pendientes: ReadonlySet<string>;
  guardandoMostrar: boolean;
  onEscribir: (campo: keyof BorradorSede, valor: string) => void;
  onRevertir: (campo: keyof BorradorSede) => void;
  onSalir: (campo: keyof BorradorSede) => void;
  onMostrar: (valor: boolean) => void;
}) {
  const falta = faltaParaMostrar(b);
  const estado = estadoSedeWeb({ mostrar: enWeb, ...b });
  const paraLaFrase = limpiarTexto(b.nombreWeb) ?? nombreCorto(s.nombre);
  // La marca de la guía solo en los datos que llegaron vacíos al abrir (una tienda completa no se llena de marcas).
  const etiqueta = (dato: DatoWeb | "horario", texto: string): ReactNode => (pendientes.has(idCampo(s.id, dato)) ? guia.etiqueta(idCampo(s.id, dato), texto) : texto);
  // El pie de la tarjeta dice, con la regla real, qué le falta para verse en la web; cada cosa lleva a su caja.
  const faltan: CampoDeGuia[] = [
    ...falta.map((dato) => ({ id: idCampo(s.id, dato), nombre: NOMBRE_DATO[dato], requerido: true, hecho: false, pendiente: "" })),
    ...(limpiarTexto(b.horario) === null ? [{ id: idCampo(s.id, "horario"), nombre: NOMBRE_DATO.horario, requerido: false, sugerido: true, hecho: false, pendiente: "" }] : []),
  ];
  const teclas = (campo: keyof BorradorSede) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") onRevertir(campo);
  };
  const caja = (campo: CampoTexto, placeholder: string, tope: number) => (
    <InputFin
      id={`tw-${s.id}-${campo}`}
      value={b[campo]}
      maxLength={tope}
      placeholder={placeholder}
      autoComplete="off"
      onChange={(e) => onEscribir(campo, e.target.value)}
      onBlur={() => onSalir(campo)}
      onKeyDown={teclas(campo)}
    />
  );

  return (
    <Superficie pad className="anim-sube">
      <CabeceraBloque titulo={s.nombre}>
        <Chip tono={estado.tono}>{estado.texto}</Chip>
      </CabeceraBloque>

      <CampoGuiado id={idCampo(s.id, "nombre_web")} guia={guia}>
        <CampoFin
          etiqueta={etiqueta("nombre_web", "Nombre que ve el cliente")}
          htmlFor={`tw-${s.id}-nombreWeb`}
          ayuda="La ciudad o el lugar, como lo diría el cliente; no el nombre de la sede en el sistema."
        >
          {caja("nombreWeb", sugerirNombreWeb(s.nombre), TOPES_SEDE.nombreWeb)}
        </CampoFin>
      </CampoGuiado>

      <CampoGuiado id={idCampo(s.id, "whatsapp")} guia={guia}>
        <CampoFin
          etiqueta={etiqueta("whatsapp", "WhatsApp de la tienda")}
          htmlFor={`tw-${s.id}-whatsapp`}
          ayuda={`Aquí llegan los pedidos que separan para ${paraLaFrase}. Es el mismo número del QR del club.`}
        >
          <div className="fin-con-unidad">
            <span>+51</span>
            <InputFin
              id={`tw-${s.id}-whatsapp`}
              value={b.whatsapp}
              inputMode="tel"
              autoComplete="off"
              placeholder="987 654 321"
              onChange={(e) => onEscribir("whatsapp", ajustarCelular(e.target.value))}
              onBlur={() => onSalir("whatsapp")}
              onKeyDown={teclas("whatsapp")}
              className="fin-num"
            />
          </div>
        </CampoFin>
      </CampoGuiado>

      <CampoGuiado id={idCampo(s.id, "direccion")} guia={guia}>
        <CampoFin etiqueta={etiqueta("direccion", "Dirección para recoger")} htmlFor={`tw-${s.id}-direccion`} ayuda="Donde el cliente recoge lo que separó: la calle, el número y una referencia.">
          {caja("direccion", sugerirDireccion(s.nombre), TOPES_SEDE.direccion)}
        </CampoFin>
      </CampoGuiado>

      <CampoGuiado id={idCampo(s.id, "horario")} guia={guia}>
        <CampoFin etiqueta={etiqueta("horario", "Horario")} htmlFor={`tw-${s.id}-horario`} ayuda="Opcional. El cliente lo lee tal cual lo escribes.">
          {caja("horario", EJEMPLO_HORARIO, TOPES_SEDE.horario)}
        </CampoFin>
      </CampoGuiado>

      <div className="space-y-3 border-t border-sand pt-3">
        {faltan.length > 0 ? (
          <FaltanDelPaso faltan={faltan} ahora={guia.ahora} onIr={(c) => guia.ir(c.id)} />
        ) : (
          <p role="status" className="text-[12.5px] text-verde">
            Todo listo para mostrarla en la web.
          </p>
        )}
        <div data-guia={primera ? "config.tienda-web-mostrar" : undefined}>
          <Interruptor
            activo={enWeb}
            onActivo={onMostrar}
            disabled={guardandoMostrar || (!enWeb && falta.length > 0)}
            etiqueta="Se ve en la web"
            pie={
              enWeb
                ? `El cliente ve ${paraLaFrase} en la web y puede recoger ahí lo que separa.`
                : falta.length > 0
                  ? "Para encenderla, completa lo que falta."
                  : `Apagada: el cliente no ve ${paraLaFrase} ni puede recoger ahí.`
            }
          />
        </div>
      </div>
    </Superficie>
  );
}

/** Para todas las sedes: los plazos de los pedidos web y desde cuántas unidades el cliente ve el número. */
function Plazos({ parametros, guardar }: { parametros: ParametrosTiendaWeb; guardar: Guardar }) {
  const [b, setB] = useState<BorradorParametros>(() => borradorParametros(parametros));
  const [base, setBase] = useState<BorradorParametros>(() => borradorParametros(parametros));
  if (JSON.stringify(borradorParametros(parametros)) !== JSON.stringify(base)) {
    setBase(borradorParametros(parametros));
    setB(borradorParametros(parametros));
  }

  async function alSalir(campo: keyof BorradorParametros) {
    if (b[campo].trim() === base[campo].trim()) return;
    const v = validarParametrosTiendaWeb(b);
    if (!v.ok) {
      avisar.error(v.error);
      setB(base);
      return;
    }
    const p = v.valor;
    const listo = {
      horasParaConfirmar: `Un pedido sin confirmar se cierra solo a las ${p.horasParaConfirmar} horas.`,
      horasAvisoSinPagar: `Un pedido confirmado y sin pagar avisa a las ${p.horasAvisoSinPagar} horas.`,
      diasAvisoSinRecoger: `Un pedido pagado y sin recoger avisa a los ${p.diasAvisoSinRecoger} días.`,
      quedanPocasDesde: `El cliente ve el número con ${p.quedanPocasDesde} o menos.`,
    }[campo];
    const ok = await guardar(
      () =>
        createClient().rpc(
          "guardar_parametros_tienda_web" as never,
          {
            p_horas_para_confirmar: p.horasParaConfirmar,
            p_horas_aviso_sin_pagar: p.horasAvisoSinPagar,
            p_dias_aviso_sin_recoger: p.diasAvisoSinRecoger,
            p_quedan_pocas_desde: p.quedanPocasDesde,
          } as never,
        ),
      "guardar los plazos de la tienda web",
      listo,
    );
    if (!ok) setB(base);
  }

  const casilla = (campo: keyof BorradorParametros, etiqueta: string, ayuda: ReactNode, unidad?: string) => (
    <CampoFin etiqueta={etiqueta} htmlFor={`tw-${campo}`} ayuda={ayuda}>
      <div className="fin-con-unidad">
        <InputFin
          id={`tw-${campo}`}
          inputMode="numeric"
          value={b[campo]}
          onChange={(e) => setB((x) => ({ ...x, [campo]: e.target.value.replace(/[^\d-]/g, "") }))}
          onBlur={() => alSalir(campo)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setB(base);
          }}
          className="fin-num"
        />
        {unidad && <span>{unidad}</span>}
      </div>
    </CampoFin>
  );

  return (
    <Superficie pad className="anim-sube" guia="config.tienda-web-plazos">
      <CabeceraBloque titulo="Para todas las sedes" bajada="Los plazos de los pedidos que se separan en la web, y desde cuándo el cliente ve el número." />
      <div className="fin-dos-campos">
        {casilla("horasParaConfirmar", "Horas para confirmar", "Si la tienda no confirma el pedido en ese tiempo, se cierra solo y el cliente puede volver a separarlo.", "horas")}
        {casilla("horasAvisoSinPagar", "Aviso si no paga, en horas", "Desde que la tienda lo confirma. Pasado ese tiempo, el pedido sale con aviso y la tienda decide.", "horas")}
        {casilla("diasAvisoSinRecoger", "Días para recoger", "Desde que paga. Pasado ese plazo, se le recuerda al cliente y la tienda decide.", "días")}
        {casilla("quedanPocasDesde", "El número se ve desde", fraseNiveles(Number(b.quedanPocasDesde)), "o menos")}
      </div>
      <Aviso tono="atencion" chico>
        Cambiar estos números afecta a todas las sedes desde el siguiente pedido.
      </Aviso>
    </Superficie>
  );
}
