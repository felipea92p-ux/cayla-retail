# Ronda 17 de `/unificar`: el mes, el cajón, la cantidad y el paso a paso (fuentes)

Armada el 2026-10-17 (rama `claude/unificar-control`) con las cuatro familias que el [censo de control del 16](../../control/2026-10-16.md)
encontró sin decidir. **Decidida el 2026-10-17, mirando: P1 en las cuatro** («‹ Octubre 2026 ›» en todas, la banda de Compras en
todos los cajones, la caja con el número adentro y, en la guía de impresión, la flecha y «Siguiente»). **Migrada el mismo día: deuda 0 en
las cuatro** (registros: [mes.md](../../mes.md), [cajon.md](../../cajon.md), [cantidad.md](../../cantidad.md),
[accion.anterior.md](../../accion.anterior.md)). La página vive en `apps/web/unificar/.salida/elegir-ronda17/` (fuera de git),
también en un solo archivo (`empaquetar.mjs`); estas son sus fuentes.

| # | Familia | La pregunta | Opciones |
|---|---|---|---|
| 1 | `mes` | ¿Cómo se elige el mes en todo el ERP? | P1 (recomendada: «‹ Octubre 2026 ›» del Historial de cierres, con los doce meses) · P2 (los vecinos con su nombre) · A (hoy: dos formas). Finanzas queda aparte (ADR-0195) |
| 2 | `cajon` | ¿Qué cara tiene el cajón lateral? | P1 (recomendada: la banda de Compras con avatar, versalitas y título, y el pie con flechas) · P2 (la cara de las hojas, de costado) · A (hoy: tres caras en 7 cajones) |
| 3 | `cantidad` | ¿Cómo es el paso de cantidad («− 1 +»)? | P1 (recomendada: la caja del campo con − y + adentro; celda 26 px y fila 36 px que crece a 44 en pantalla táctil) · P2 (botones sueltos) · A (hoy: 23 controles, 7 caras). Las teclas grandes de contar quedan aparte |
| 4 | `accion.anterior` | ¿Cómo pasa de paso la guía de impresión? | P1 (recomendada: la flecha de `<Volver>` y «Siguiente» con su flecha, como todo paso a paso) · P2 (dos botones con palabra) · A (hoy) |

## Archivos

| Archivo | Qué hace |
|---|---|
| `fotos.mjs` | lo de hoy y cada propuesta aplicada EN VIVO sobre la pantalla real (solo el dibujo; no guarda nada). Agrega una prenda al ticket o a la lista con el buscador, sin guardar. Pide `PRODUCTO` (para Etiquetas de precio) y `MOVIMIENTO` (el cajón de Movimientos se abre por su URL) |
| `piezas.mjs`, `demo17.css` | las demos con el HTML exacto de `SelectorMes`, `Volver`, `Boton`, `BotonVer` y `AvatarPersona`, y las dos propuestas del paso de cantidad y del cajón; usan `demo9.css` (ronda 9), `demo15.css` y `svg.mjs` (ronda 15) |
| `bajar-css.mjs`, `construir.mjs`, `ver-demos.mjs`, `empaquetar.mjs` | bajan el CSS real, arman la página, fotografían cada tarjeta (claro y oscuro) y la dejan en un solo archivo |

Los de la página se corren desde `apps/web/unificar/.salida/elegir-ronda17/`; los demás, desde `apps/web`.

**Lo que no se pudo fotografiar en local:** la matriz de Editar producto (a la base local le falta la migración de `familias.entra_a_motores`,
que ya está en `main`, y la pantalla se cae) y el cajón de una orden de Producción (la base local no tiene órdenes). Van como demo y como
texto.

## Lo que se migró

1. **`mes`** → `SelectorMes` (`components/ui/SelectorMes.tsx`) también en Comprobantes ▸ Emitidos y Proformas, en lugar de
   `SelectorMesFacturacion.tsx` (hoy de servidor, con enlaces `?m=`). Conservar las anclas de la guía `comprobantes.mes` y
   `comprobantes.mes-anterior`. Finanzas (`SelectFin`, `fin-mes-chico`) queda aparte (ADR-0195).
2. **`cajon`** → una pieza `<Cajon>` con la cara de la demo P1: banda (avatar `<AvatarPersona>` de 40, o el sello de Movimientos, o el
   ícono del aparato; el nombre en versalitas; el título serif de 24; la × de `<Modal conCerrar>`), cuerpo con `scroll-cayla`, pie con las
   acciones y «n de N» con ↑ ↓ (`useFlechasDelCajon`); anchos 456 y 544; el marco, el velo y el movimiento de hoy (`anim-cajon`,
   `anim-cajon-salida`, 240 ms, `useEscapeLibre`), y la opción sin velo (Movimientos es `modal={false}`).
3. **`cantidad`** → una pieza `<PasoCantidad>`: la caja del campo (`caja-cayla caja-campo`) con − y + de lucide adentro y el número
   editable; «celda» de 26 px (matrices) y «fila» de 36 px que crece a 44 con `pointer: coarse`. El CSS de la demo está en `demo17.css`
   (`.r17-paso…`). Las teclas grandes de contar (#19, #20) y el paso de días de Análisis quedan aparte.
4. **`accion.anterior`** → en `GuiaImpresion.tsx`, «← Anterior» pasa a `<Volver onClick a="Volver al paso anterior">` (no se dibuja en el
   primer paso) y «Siguiente →» a `btn-cayla btn-primario` con su `ArrowRight`, como «Seguir» de Nuevo producto.

Al migrar `mes` y `accion.anterior` se sacan las dos excepciones temporales de `familias.mjs` (`SelectorMesFacturacion.tsx` en
`accion.volver` y `enlace`; `GuiaImpresion.tsx` en `enlace`).

## Inventario: el paso de cantidad (23, 2026-10-17)

Rutas relativas a `apps/web/components/`. Ninguna pieza compartida; solo `.etq-paso` se comparte entre dos archivos.

| # | Archivo | Pantalla | Cara de hoy |
|---|---|---|---|
| 1 | `BajarAlPisoForm.tsx:1086` | /inventario/bajar | botones sueltos `btn-secundario h-11 w-11` + `caja-campo-input h-11 w-14` |
| 2 | `cuadre-piso/CuadrarPisoForm.tsx:767` | /inventario/cuadrar | igual a #1 |
| 3 | `LlegoMercaderia.tsx:547` | /recibir | `btn-sutil h-8 w-8` + `caja-campo-input h-8 w-14` |
| 4 | `PedirAOtraSedeModal.tsx:113` (`Contador`, ×2) | hoja «Pedir a otra sede» | `btn-sutil h-9 w-9`, número en texto |
| 5 | `conteo/CampoContaste.tsx:108` | /inventario/conteo/[id] | `BOTON` 26 px (36 táctil), `caja-campo-input h-[26px]` |
| 6 | `SelectorDeAjuste.tsx:66` | hoja «Ajustar inventario» | caja `h-9 rounded-lg border-sand`, botones sin borde, input w-10 |
| 7 | `apartados/ApartarVista.tsx:815` | /vender/apartados | caja `h-9 rounded-lg border-sand`, número en texto |
| 8 | `apartados/ModalesApartado.tsx:906` | hoja de sumar prendas a un apartado | igual a #7, h-8 |
| 9 | `ImprimirEtiquetasPrecio.tsx:468` | /etiquetas-de-precio | `.etq-paso` (`app/estilos/etiquetas-precio.css:96`) |
| 10 | `rotulos/TiraBrother.tsx:167` | /rotulos | `.etq-paso` |
| 11 | `punto-de-venta/LineaDelTicket.tsx:62` | /vender (ticket) | `caja-cayla caja-campo h-8` con «−»/«+» escritos (`BOTON_PASO` l. 13) |
| 12 | `RecepcionEnvio.tsx:864` | /recibir | caja con el borde teñido por estado (rojo/verde/ámbar); botones de 42 px que se esconden en lo ancho hasta el hover |
| 13 | `existencias/FlujoTalla.tsx:95` (`Stepper`, l. 636 y 945) | Existencias táctil | caja `rounded-2xl`, botones de 56 px, número serif de 26 |
| 14 | `ficha-producto/MatrizStockFicha.tsx:566` | /productos/[id]/editar | celda `matriz-paso`, `BOTON_PASO` l. 64 (`h-6 w-5`) |
| 15 | `alta-producto/MatrizCantidades.tsx:298` | /productos/nuevo y las hojas de órdenes | el mismo `BOTON_PASO` copiado (l. 54) |
| 16 | `recepcion-envio/MatrizRecepcion.tsx:131` | /recibir/envio/[id] | el mismo `BOTON_PASO` copiado (l. 19) |
| 17 | `existencias/FlujoTalla.tsx:172` y `:776` | Existencias táctil | celda hueso con glifos; número verde si es > 0 |
| 18 | `traslados-pases/ReversoPase.tsx:712` | /inventario/traslados (reverso) | `.tp-contador` (`traslados-pases.css:228`): bandeja hueso, número serif de 20 |
| 19 | `EscanerConteo.tsx:251` | hoja del escáner (bajar, cuadrar, conteo, traslados) | **queda aparte:** teclas de 56 px, número serif de 36 |
| 20 | `recepcion-conteo/ContarEnvio.tsx:435` | /recibir/envio/[id] | **queda aparte:** `.rc-paso-btn` 56 px redondo, número serif de 84 |
| 21 | `recepcion-conteo/SepararPrendas.tsx:40` (`PasoCantidad`, también en `DescribirNuevas.tsx`) | /recibir/envio/[id] | botones fantasma de 32 px, número en texto |
| 22 | `NuevaProformaModal.tsx:233` | /vender/comprobantes/proformas | fantasma `h-7 w-7`, número en texto |
| 23 | `ficha-producto/PanelDelTaller.tsx:189` | /productos/[id]/editar | `.taller-stepper[data-mini]` (`ficha-taller.css:101`), número fuera de la píldora |

No son pasos de cantidad: `InsumosPanel.tsx:194` y los demás signos de dinero; el `Minus` de `ui/Casilla.tsx` y `ui/FiltrosPildora.tsx`
(la marca «a medias»); `analisis/PestanaQuieta.tsx:146` (`.paso-dias`, pasa de días; Análisis, ADR-0357).

## Inventario: los cajones (7, 2026-10-17)

Marco común: `fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-sand bg-papel`, `anim-cajon` / `anim-cajon-salida`
(`globals.css`, 380 ms / 240 ms), `MS_SALIDA = 240` en cada archivo, `useEscapeLibre`.

| Cara | Archivos | Ancho | Cabecera | × | Pie |
|---|---|---|---|---|---|
| A · Compras | `PorPagarVistaRapida.tsx` (/compras/por-pagar), `RecepcionVistaRapida.tsx` (/recibir), `ProveedorVistaRapida.tsx` (/compras/proveedores), `NotaCreditoVistaRapida.tsx` (/compras/notas-credito) | 456 | banda `border-b border-tinta/10 px-6 pb-4 pt-5`, círculo de iniciales a mano (56 px; 40 en Recepción), versalitas arriba (Por pagar, Nota de crédito) o frase abajo (Recepción, Proveedor), título serif de 23 | botón propio `X h-4`, `text-tinta/55 hover:text-rojo` | acciones y «n de N» con ↑ ↓ (`useFlechasDelCajon`) |
| B · sin banda | `CajonMovimiento.tsx` (/inventario/movimientos, `?mov=`, `modal={false}`, sin velo), `colaboradores/CajonFicha.tsx` (/colaboradores; la cabecera la pone quien lo usa: `FichaColaborador` con avatar de 80, `FichaTerminal` con su aparato, `PlanCampana` en /compras/plan con velo) | 472 / 432 | dentro del cuerpo; Movimientos con su sello de 56 px (ADR-0353) en `.mv-cajon-cab` | `absolute right-5 top-5`, `X h-5`, tinta plena | sin pie |
| C · la orden | `OrdenPanel.tsx` (/produccion/ordenes) | 544 | banda `border-b border-sand`, versalitas `<p>`, título de 24 y chips | `Dialog.Close` `p-2`, otro hover | `<footer>` con `<Boton>`; sin `scroll-cayla` |

No son cajones: la vista rápida de Productos (`vista-rapida/VistaRapidaProducto.tsx`, una hoja al centro, ADR-0136), `existencias/PanelTalla.tsx`
(`<Modal variante="hoja">`; los comentarios de `CajonFicha` y `CajonMovimiento` que lo nombran están viejos) y `ProveedorModal.tsx`.
