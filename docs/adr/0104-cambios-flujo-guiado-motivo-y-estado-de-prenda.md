# ADR-0104 — Cambios: flujo guiado, motivo y estado de la prenda que vuelve

**Fecha:** 2026-09-18
**Estado:** Aplicado en local (rama `claude/interface-recommendations-8ce365`).
**Migración `20260918150000_cambios_motivo_y_estado_de_prenda.sql`: NO aplicada en
producción.** Orden obligatorio al desplegar: primero la migración, después el front
(ver "Consecuencias").
**Afecta:** `retail.cambios`, `retail.prendas_danadas`, `retail.registrar_cambio`
(firma nueva: drop + create), `/cambios` completo, `/devoluciones` (`?item=`),
`ui/Chip.tsx` y `ui/PrendaCelda.tsx` (props aditivas), `--color-papel` (todo el sistema).

## Contexto

Felipe mostró la pantalla de Cambios recién rediseñada (PR #128) y dijo que no lo
convencía. La auditoría encontró problemas de pantalla y, debajo, huecos reales del
modelo:

1. **El stock mentía con las prendas falladas.** `registrar_cambio` devolvía SIEMPRE la
   prenda al piso de venta. Una blusa cambiada por costura abierta volvía a figurar como
   vendible. R-39 (`docs/datos/15-COMO-OPERA-CAYLA.md`) ya había decidido que el destino
   depende del estado de la prenda; Devoluciones lo cumplía desde la cuarentena
   (20260917095000), Cambios no.
2. **No se sabía por qué se cambia una prenda.** Para una marca que confecciona, "la
   Blusa Emma se cambia de M a L" es información para el Taller que no existía.
3. **Se podía cambiar una prenda de una venta anulada.** `anular_venta` bloqueaba el
   sentido contrario, pero no este: la prenda volvía al stock dos veces.
4. **La lista podía perder las ventas nuevas.** Pedía todas las líneas de la sede sin
   `.order()` y ordenaba en JS; PostgREST corta en 1000 filas sin orden garantizado.
5. **"Buscar en todas las sedes" le mentía a una integrante.** La RLS de `ventas`/
   `venta_items`/`comprobantes` (`fn_puede_operar_ubicacion` = líder o su sede) no le
   deja ver otras sedes: el switch respondía "no encontramos" aunque la boleta existiera.

Después Felipe pidió un rediseño profundo con un brief detallado (flujo guiado en 4
pasos, validaciones visibles, impacto en inventario y caja, estados, accesibilidad,
responsive, componentes). Este ADR registra cómo se adaptó ese brief a lo que CAYLA
tiene de verdad.

## Decisión

### Modelo (migración 20260918150000)

- `cambios.motivo`: lista cerrada (`talla_chica`, `talla_grande`, `otro_color`,
  `defecto`, `otro`) — mismo criterio que el descuento (R-45): una lista se suma, un
  texto libre no. Nullable: los cambios anteriores no lo tienen.
- `cambios.condicion`: `vendible` (al piso, lo de siempre) o `no_vendible` (a la
  cuarentena de Devoluciones). Default `vendible`, que describe con verdad los cambios
  viejos.
- Candado en la tabla: `cambios_defecto_no_vuelve_al_piso`.
- `prendas_danadas.cambio_id` + `devolucion_item_id` nullable + `prendas_danadas_un_origen`
  (exactamente un origen). La cuarentena y su resolución (se botó / donada / devuelta al
  proveedor / liquidada) se reusan tal cual; no hay tabla gemela.
- `registrar_cambio`: `p_motivo` y `p_condicion` nuevos, con default. Rechaza la venta
  anulada. `drop` + `create`: agregar parámetros con `create or replace` habría dejado
  dos sobrecargas vivas (el mismo bug que 20260918070000 documentó).

### Pantalla

- **Dos bloques que no se mezclan:** "Iniciar un cambio" (buscador protagonista + escanear
  + sin comprobante; los resultados aparecen ahí) y "Actividad reciente" (compras de los
  últimos 15 días —exactamente las que todavía se pueden cambiar— con filtros Todas / Con
  cambio / Sin comprobante).
- **Flujo guiado en la misma página, sin modal** (mismo criterio que ADR-0044): Venta →
  Prenda → Reemplazo → Confirmación → éxito. "Paso X de 4", el foco sigue al paso,
  Escape retrocede, los pasos hechos se pueden volver a abrir.
- **Una sola lista de validaciones** (`validarCambio` + `primerBloqueo` en
  `cambios-reglas.ts`, el patrón de `motivoBloqueoCobro`): alimenta el panel "Lo que el
  sistema revisa", el aviso junto al botón y a qué campo va el foco. Cada validación
  refleja una regla que ya existe en `registrar_cambio` o en la pantalla — incluida la
  caja abierta para una diferencia en efectivo, que antes solo se enteraba la base.
- **Impacto en inventario y caja** calculado de lo que el RPC hace de verdad
  (`impactoCambio`): +1 de la devuelta al piso o a cuarentena, −1 de la nueva del piso; la
  diferencia solo mueve el cajón si es en efectivo (ADR-0053).
- **Un buscador para todo lo que existe:** boleta, DNI/RUC y nombre de la clienta (salen de
  `comprobantes`), nombre de la prenda y su etiqueta/SKU/código de barras. Solo dígitos se
  buscan como boleta Y como documento, sin adivinar. El RUC no se compara contra
  `comprobantes.numero` (integer: la consulta reventaba).
- **"Buscar en: Tienda Lima ▾ / Todas las tiendas" reemplaza al switch**, y solo lo ve un
  líder. El selector global de sede (`UbicacionSwitcher`, barra superior) sigue siendo la
  única forma de cambiar DÓNDE se registra el cambio; no se duplicó.
- **Chips de estado siempre con palabra e ícono** (Dentro del plazo, Vence en N días,
  Fuera del plazo, Cambio completado, Sin comprobante, Venta anulada). Rojo solo en
  "Confirmar cambio", la acción que mueve stock y plata.
- **Tono de tarjeta:** `--color-papel` de `#fbf8f2` (se leía como blanco puro) a
  `#fbf6ec`, blanco cálido. Para todo el sistema, con el ok de Felipe. Sigue siendo más
  claro que el crema, así que el contraste medido en ADR-0012 no baja.

## Se descartó

- **Estados "Pendiente" y "Requiere autorización"** del brief: un cambio se completa en
  el acto y R-38 no pide líder. Mostrarlos sería lógica falsa.
- **Buscar por teléfono:** ninguna tabla lo guarda.
- **"Sin comprobante" como cambio de una venta que nunca se registró (R-15):**
  `registrar_cambio` necesita una línea de venta; inventar ese caso toca el núcleo y es
  una decisión de negocio. El botón lleva a las ventas sin boleta registradas y a escanear.
- **"Ver comprobante" en el éxito:** un cambio no emite comprobante. Qué pasa con la
  diferencia ante SUNAT es la decisión de dinero pendiente (BACKLOG), no se tocó. Por lo
  mismo, el método de la diferencia sigue arrancando en efectivo.
- **Cmd/Ctrl+K:** no existe una paleta global; construirla toca AppShell y todos los
  módulos. Dentro de Cambios, "/" enfoca el buscador.
- **Un modal paso a paso:** el panel que cambia de momento ya es la convención (ADR-0044).

## Consecuencias

- **Orden de despliegue:** la migración va primero. Los parámetros nuevos tienen default y
  `p_motivo` null se acepta, así que la pantalla vieja sigue funcionando contra la firma
  nueva; al revés, PostgREST no encuentra la función y Cambios se cae. Pegar con prefijo
  `retail.` (ya lo trae) y verificar en `pg_proc` que queda UNA sobrecarga.
- La pantalla nueva no deja confirmar sin motivo; la base lo acepta nulo solo por la
  transición. Endurecerlo (not null para cambios nuevos) queda en BACKLOG.
- `packages/database/src/types.ts` se regeneró completo desde el Postgres local: trae
  también columnas de migraciones ya fusionadas cuyos tipos nadie había regenerado
  (proveedores, compras, comprobantes).
- `prendas_danadas` ya no es solo de devoluciones; su nombre describe menos que antes (el
  mismo aviso que dejó 20260918070000).
- `Chip` gana `versalitas={false}` y `PrendaCelda` exporta `MiniaturaPrenda`; los defaults
  dejan a las demás pantallas iguales.
- `getLineasVentaRecientes` pasó a `getVentasParaCambio` (solo la usaba Cambios).

## Verificación

- `pnpm pruebas:registrar-cambio` 18/18 contra Postgres real — las 13 de antes llaman con
  la firma vieja (prueban que la pantalla vieja no se rompe) + 5 nuevas (motivo guardado,
  defecto a cuarentena con `prendas_danadas`, defecto no vuelve al piso, venta anulada,
  motivo desconocido). Además `aprobar-devolucion-caja` 2/2, `fn-aplicar-movimiento`
  11/11, `registrar-venta` 22/22.
- 407 pruebas unitarias (35 de `cambios-reglas.test.ts`), `tsc`, `eslint` y `next build`
  en verde.
- Navegador, con datos de ejemplo en una ruta temporal (sin sesión: el panel no tenía
  login), a 1280/1024/768/390 px: lista, filtros, búsqueda con resaltado, los 4 pasos,
  bloqueo por caja cerrada con foco al método, cambio de método a Yape, defecto →
  cuarentena forzada, cantidad para 2 unidades, error del RPC con foco al aviso, Escape y
  el indicador de pasos. Interacción por DOM (`element.click()`), no por puntero.
- Las 9 consultas nuevas pasaron la resolución de relaciones de PostgREST (sin PGRST201).
- **Pendiente:** la vuelta completa con sesión real (búsquedas contra datos, cambio
  registrado y la pantalla de éxito).
