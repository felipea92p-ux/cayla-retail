"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Boton } from "@/components/ui/campos";
import { ComboResponsable } from "@/components/ComboResponsable";
import type { ControlResponsable } from "@/lib/useResponsable";
import { agruparCambios, type GrupoCambios, type ResumenCambios } from "@/lib/producto-cambios-reglas";
import { Volver } from "@/components/ui/Volver";
import { Casilla } from "@/components/ui/Casilla";
import { nombreCorto, soles, unirConY, type tiendasAlCambiarPrecio } from "@/lib/precio-sede-reglas";
import { TituloGrupo } from "@/components/ui/TituloSeccion";

/**
 * La hoja «Revisa y guarda los cambios» (ADR-0257; Felipe eligió la opción A de la pregunta 2 el 2026-09-28).
 *
 * EL PROBLEMA. Guardar una ficha pedía elegir «Responsable» en un panel lejano y dejaba el botón gris sin decir por qué. Ahora
 * «Revisar y guardar» abre esta hoja: lista lo que va a cambiar y confirma. Del 2026-09-29 al 2026-10-06 la hoja no pedía
 * «Responsable» y, en una terminal, el cambio quedaba sin firma; desde ADR-0354 lo pide AQUÍ, junto al botón (viene elegido con
 * quien inició sesión, si está de turno): el historial de la prenda dice quién cambió cada cosa.
 *
 * `onConfirmar` guarda y dice si la hoja debe cerrarse: sí cuando salió bien (la pantalla se va sola) o cuando lo que falló
 * se arregla en la ficha (un nombre repetido, una versión vieja); `false` deja la hoja abierta.
 *
 * Con la sección de variantes de ADR-0263, un grupo puede juntar varios cambios en una línea («3 variantes pasan de Sin color
 * a Negro»): la insignia dice cuántos cambios son (`cantidad`), no cuántas líneas, y la `nota` del grupo dice lo que conviene
 * saber antes de confirmar (el código viejo sigue sonando; las nuevas nacen sin unidades). `avisos`: lo que deja guardar pero
 * hay que leer antes (todas las variantes quedan desactivadas).
 */
export function ConfirmarCambios({
  nombre,
  resumen,
  onConfirmar,
  onClose,
  avisos = [],
  notaAgregan,
  extra,
  extraPrecio,
  tiendas,
  responsable,
}: {
  nombre: string;
  resumen: ResumenCambios;
  onConfirmar: () => Promise<boolean>;
  onClose: () => void;
  /** Lo que no impide guardar pero conviene leer justo antes de confirmar. */
  avisos?: readonly string[];
  /** Lo que se dice de las variantes que se agregan cuando NO nacen en 0: la ficha (maqueta B) deja poner su stock con el stepper
   *  y entra como stock inicial al guardar. Sin esto, la nota de siempre («Nacen sin unidades…»). */
  notaAgregan?: string;
  /** Un grupo que no sale de la comparación de la ficha: el stock tocado en la matriz («S · Blanco 4 → 6»), que se guarda con el
   *  mismo «Confirmar y guardar» (ADR-0313, act. 2026-10-02 noche). Va al final, con su nota (motivo y lugar). */
  extra?: { titulo: string; lineas: { texto: string; antes: string; despues: string }[]; nota?: string } | null;
  /** El precio de la tienda escrito en la tabla por una terminal (Felipe 2026-10-27): se guarda con el mismo «Confirmar y guardar». */
  extraPrecio?: { titulo: string; lineas: { texto: string; antes: string; despues: string }[]; nota?: string } | null;
  /** Precio por tienda (Felipe 2026-10-10, «preguntar al guardar»): si cambió el precio de la prenda y alguna tienda tiene precio
   *  propio, cómo queda cada tienda; las que se pueden igualar al precio nuevo llevan su casilla (sin marcar: se quedan con el suyo). */
  tiendas?: {
    datos: NonNullable<ReturnType<typeof tiendasAlCambiarPrecio>>;
    igualar: ReadonlySet<string>;
    onIgualar: (ubicacionId: string, si: boolean) => void;
  } | null;
  /** Quién hace los cambios (ADR-0354). Sin elegir a alguien de turno, «Confirmar y guardar» espera y dice por qué. */
  responsable?: ControlResponsable;
}) {
  const faltaResponsable = !!responsable && !responsable.listo;
  const [enCurso, setEnCurso] = useState(false);
  const grupos: (Omit<GrupoCambios, "clave"> & { clave: string })[] = [
    ...agruparCambios(resumen.cambios),
    ...(extra && extra.lineas.length > 0 ? [{ clave: "extra", titulo: extra.titulo, lineas: extra.lineas, cantidad: extra.lineas.length, nota: extra.nota }] : []),
    ...(extraPrecio && extraPrecio.lineas.length > 0
      ? [{ clave: "precio-aqui", titulo: extraPrecio.titulo, lineas: extraPrecio.lineas, cantidad: extraPrecio.lineas.length, nota: extraPrecio.nota }]
      : []),
  ];

  return (
    <Modal
      titulo="Revisa y guarda los cambios"
      subtitulo={`Esto es lo que va a cambiar en «${nombre}». Nada se guarda hasta que confirmes.`}
      variante="hoja"
      bloqueado={enCurso}
      onClose={onClose}
    >
      {(cerrar) => (
        <div className="space-y-4">
          <div className="max-h-[36vh] divide-y divide-sand overflow-y-auto pr-1">
            {grupos.map((g) => (
              <section key={g.clave} className="py-2.5 first:pt-0">
                <TituloGrupo cuenta={g.cantidad} className="mb-1.5">
                  {g.titulo}
                </TituloGrupo>
                <ul className="space-y-1">
                  {g.lineas.map((l, i) => (
                    // Un valor largo (un nombre, «marca · proveedor») baja a su propia línea y se parte ahí; antes no cabía, el
                    // rótulo se encogía a cero y el valor viejo tachado se le montaba encima. Los cortos (stock) siguen a la derecha.
                    <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm text-tinta">
                      <span className="shrink-0">{l.texto}</span>
                      {l.antes !== undefined && l.despues !== undefined ? (
                        <span className="min-w-0 tabular-nums [overflow-wrap:anywhere]">
                          <s className="mr-1 text-tinta/50">{l.antes}</s>→ {l.despues}
                        </span>
                      ) : l.detalle ? (
                        <span className="min-w-0 text-tinta/65 [overflow-wrap:anywhere]">{l.detalle}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {(g.clave === "agregan" && notaAgregan ? notaAgregan : g.nota) && (
                  <p className="mt-1.5 text-[12px] leading-snug text-taupe">{g.clave === "agregan" && notaAgregan ? notaAgregan : g.nota}</p>
                )}
              </section>
            ))}
          </div>

          {tiendas && <PrecioEnCadaTienda {...tiendas} deshabilitado={enCurso} />}

          {avisos.length > 0 && (
            <div className="space-y-1">
              {avisos.map((a, i) => (
                <p key={i} className="text-[12.5px] leading-snug text-ambar-profundo">
                  {a}
                </p>
              ))}
            </div>
          )}

          {responsable && (
            <div id="confirmar-cambios-responsable" data-campo="confirmar-cambios-responsable" className="space-y-1.5">
              <p className="label-cayla text-[11px] text-taupe">Quién hace estos cambios</p>
              <ComboResponsable control={responsable} deshabilitado={enCurso} />
              {faltaResponsable && responsable.motivo && <p className="text-[12px] leading-snug text-taupe">{responsable.motivo}</p>}
            </div>
          )}

          <div className="flex gap-2">
            <Volver onClick={cerrar} deshabilitado={enCurso} a="Volver a editar" className="self-center" />
            <Boton
              type="button"
              peso="primario"
              className="flex-1"
              cargando={enCurso}
              disabled={faltaResponsable}
              onClick={async () => {
                setEnCurso(true);
                const cerrarHoja = await onConfirmar();
                setEnCurso(false);
                if (cerrarHoja) cerrar();
              }}
            >
              Confirmar y guardar
            </Boton>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** «Precio en cada tienda»: al cambiar el precio de la prenda, las tiendas sin precio propio pasan al nuevo; las que tienen uno se
 *  quedan con el suyo (o se igualan solas si el nuevo es el mismo). Antes no se decía nada, y subir el precio de la prenda dejaba a
 *  AQP con un «precio propio» igual al de las demás sin que nadie lo supiera (FAL-0008, 2026-10-10). */
function PrecioEnCadaTienda({
  datos,
  igualar,
  onIgualar,
  deshabilitado,
}: {
  datos: NonNullable<ReturnType<typeof tiendasAlCambiarPrecio>>;
  igualar: ReadonlySet<string>;
  onIgualar: (ubicacionId: string, si: boolean) => void;
  deshabilitado: boolean;
}) {
  // «pasa a S/ 89.90» o «pasa al precio nuevo de cada talla».
  const aNuevo = datos.despues !== null ? `a ${soles(datos.despues)}` : "al precio nuevo de cada talla";
  return (
    <section aria-label="Precio en cada tienda" className="rounded-sm border border-sand bg-hueso/40 px-3 py-2.5">
      <TituloGrupo className="mb-1.5">Precio en cada tienda</TituloGrupo>
      <ul className="space-y-2 text-sm text-tinta">
        {datos.siguen.length > 0 && (
          <li className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span>{unirConY(datos.siguen.map(nombreCorto))}</span>
            {datos.antes !== null && datos.despues !== null ? (
              <span className="tabular-nums">
                <s className="mr-1 text-tinta/50">{soles(datos.antes)}</s>→ {soles(datos.despues)}
              </span>
            ) : (
              <span className="text-tinta/65">pasa{datos.siguen.length === 1 ? "" : "n"} al precio nuevo</span>
            )}
          </li>
        )}
        {datos.conPropio.map((t) =>
          t.que === "se-iguala" ? (
            <li key={t.ubicacionId} className="leading-snug">
              <span className="font-medium">{nombreCorto(t.sede)}</span>
              <span className="text-tinta/70"> ya estaba a {soles(t.propio)}: queda igual al precio de la prenda y deja de ser precio propio.</span>
            </li>
          ) : (
            <li key={t.ubicacionId} className="space-y-1">
              <p className="leading-snug">
                <span className="font-medium">{nombreCorto(t.sede)}</span>
                <span className="text-tinta/70">
                  {igualar.has(t.ubicacionId) ? ` pasa ${aNuevo}, como el precio de la prenda.` : ` se queda en ${soles(t.propio)}, su precio propio.`}
                </span>
              </p>
              {t.puedeIgualar && (
                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-tinta/80">
                  <Casilla
                    marcada={igualar.has(t.ubicacionId)}
                    onCambio={() => !deshabilitado && onIgualar(t.ubicacionId, !igualar.has(t.ubicacionId))}
                    etiqueta={`Igualar ${t.sede} al precio nuevo`}
                  />
                  Igualar {nombreCorto(t.sede)} al precio nuevo
                </label>
              )}
            </li>
          )
        )}
      </ul>
    </section>
  );
}
