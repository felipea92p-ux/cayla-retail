# 2026-11-17 · El ERP en teléfonos de gama baja — TRASPASO para seguir en otra cuenta

Rama `claude/confident-gauss-continue-f86c75` (la `claude/confident-gauss-v6tzn7` se fusionó con la Fase 1 y sus dos commits de más
se trajeron aquí el 2026-11-17). Bitácora: `docs/bitacora/2026-11-17-confident-gauss-v6tzn7.md`. Decisiones y números:
`docs/adr/0674-erp-en-telefonos-de-gama-baja.md`. Auditoría: `docs/milimetro/auditorias/2026-11-17-telefonos-gama-baja.md`.

**Para retomar:** abre una sesión en esta rama (`git fetch origin claude/confident-gauss-v6tzn7 && git checkout claude/confident-gauss-v6tzn7`),
lee este archivo entero y el ADR-0674, y sigue por «Lo que falta», en orden. Si la rama ya se fusionó, créala de nuevo desde `main` y trae
lo que falte de aquí.

## Lo que pidió Felipe (2026-11-17)

- «Qué se podría realizar para que el sistema retail sea funcional para teléfonos gama baja».
- **Alcance:** en el celular se usan **Catálogo, Compras, Inventario y TODO Ventas** (Vender, Apartados, Caja, Historial, Reportes,
  Cambios, Devoluciones, Comprobantes).
- **Modo liviano:** «automático + botón» (en un equipo lento se enciende solo; un botón lo cambia).
- **Orden:** Fase 1 primero (lo que vale para todas las pantallas), después la Fase 2 (pantalla por pantalla). «Sube los cambios a
  producción y continúa con lo que falte».

## Estado

### Fase 1 — EN PRODUCCIÓN (PR [#1916](https://github.com/felipea92p-ux/cayla-retail/pull/1916), `main` `fe7bc7c8`, Vercel READY)

1. **El cronómetro del clic anota la clase del equipo** (`lib/clase-de-equipo.ts`): `ram`, `nucleos`, `red`, `ahorro_datos`, `tactil` en
   cada línea `tiempo_de_pantalla` del registro de Vercel (ADR-0654, actualización 2026-11-17).
2. **Modo liviano** (`data-liviano` en `<html>`; `lib/liviano-reglas.ts`, `app/estilos/liviano.css`, `components/ui/BotonLiviano.tsx`):
   cara maciza del vidrio, sin desenfoque ni nubes. Se enciende solo con ≤ 2 GB, o ≤ 4 GB con pantalla táctil, o ahorro de datos. Botón en
   escritorio junto a «Animaciones»; en el celular, al pie del menú (☰).
3. **«Actualiza el navegador»** sin `color-mix()` (`lib/navegador-viejo-reglas.ts`, `components/AvisoNavegadorViejo.tsx`,
   `app/estilos/navegador-viejo.css`).
4. **CSS por pantalla:** 19 hojas de estilo de otros módulos salen de `globals.css` y se importan desde sus componentes
   (`app/estilos/por-pantalla/`, vigilado por `lib/css-por-pantalla.test.ts`).
5. **Marco más liviano:** de 936 KB (303 comprimidos) a 626 KB (200). Buscador de la cabecera sin las reglas de recepción
   (`lib/equipo-de-turno.ts`), estación de impresión diferida (`EstacionDeImpresion` → `EstacionActiva`), panel de Actividad diferido.

JavaScript total por pantalla, antes → después (armado de producción local):

| Pantalla | Antes | Ahora | Cambio |
|---|---|---|---|
| `/compras` (Historial de compras) | 1 499 KB | 1 205 KB | −20 % |
| `/inventario/conteo` | 1 506 | 1 213 | −19 % |
| `/compras/plan` | 1 733 | 1 441 | −17 % |
| `/cambios` · `/devoluciones` | 1 622 | 1 449 · 1 475 | −11 · −9 % |
| `/productos` · `/productos/nuevo` · `/productos/campanas` | ~1 820–1 920 | ~1 640–1 740 | −9 a −10 % |
| `/inventario` · `/inventario/movimientos` | 2 067 · 1 687 | 1 903 · 1 562 | −8 · −7 % |
| `/vender` · `/caja` · `/vender/apartados` | 2 081 · 2 379 · 2 259 | 1 937 · 2 240 · 2 136 | −7 · −6 · −5 % |
| `/recibir` | 1 817 | 1 754 | −3 % |

### Fase 2 — EN CURSO

| # | Actividad | Estado |
|---|---|---|
| 6a | El ticket de **Vender** sobrevive a que Android cierre la pestaña | **Hecho** (commit `d837a8b`), verificado con dos pestañas; NO en producción |
| 6b | La compra a medio registrar en **Mis compras** sobrevive igual | **Hecho** (2026-11-17), verificado en local a 375 px; NO en producción |
| 7 | Partir el código de las pantallas pesadas | **Dos cortes hechos** (2026-11-17): Vender y su arrastre en Caja, Apartados y Mis compras (en el PR #1923); y las cuatro hojas de Caja (en la rama, sin subir). Faltan los cortes de las demás pantallas (abajo) |
| 8 | Recorrer las pantallas de los 4 módulos a 375 px y arreglar lo roto | Sin empezar |
| 9 | Probar en un teléfono barato real | Lo hace Felipe |

## Lo que falta, en orden

### 6a · Cerrar el ticket de Vender (hecho, falta el PR)

Qué hace (`lib/ticket-en-curso.ts`, `components/PuntoDeVenta.tsx`, `lib/almacen-local.ts` con `donde: "pestana"`): mientras se arma el
ticket, una foto en `sessionStorage` (`cayla:vender:<sede>:en-curso`); al volver a Vender, entra a «En espera» con el aviso «Recuperamos el
ticket que estabas armando» y se retoma con `retomar()` (precios y campañas al día). **Guardia:** `anotarCobro` borra la foto y pone
`fotoBloqueada`; se libera si la base rechaza el cobro, si «Revisar si se guardó» dice que no, o cuando el ticket queda vacío. La recuperación
corre UNA vez por montaje (`fotoLeida`), porque el efecto vuelve a correr al abrir o cerrar la caja.

Verificado en local: a 375 px, agregar Blusa Emma M → recargar → aparece en espera como «Cliente 1», con el aviso; otra recarga no lo duplica.
**Recarga en pleno cobro** (con `registrar_venta` interceptada): la foto ya no estaba y el cobro quedó anotado; la venta llegó a guardarse
y, al volver, el ticket NO reapareció (sin la guardia, se habría podido cobrar dos veces). `vitest` completo (940), `tsc`, `eslint`, `knip`.

Falta antes de producción:
- [ ] `/abrir-pr` (la casilla de 375 px de Vender: capturas en local; la de `/milimetro`: el único cambio visible es un `avisar.aviso` del
  sistema, así que «Al milímetro no aplica» con ese motivo, o `/milimetro auditar /vender`).
- [x] Dos pestañas de Vender en la misma sede (2026-11-17, Playwright a 375 px): cada una guarda su foto; recargadas una tras otra, cada
  ticket entra UNA vez a «En espera» y otra recarga no lo duplica. Sin cobros: no se escribió en la base.
- [ ] La corrida completa de `/chaos` sobre Vender (familias «red y sesión» y «navegación torcida») sigue pendiente: lo hecho son ataques
  a mano sobre este flujo.
- [ ] Visto en esa prueba: los dos tickets recuperados se llaman «Cliente 1» (cada pestaña numera por su cuenta). No rompe nada; si
  molesta, renombrar al entrar a la espera cuando el nombre ya existe.
- [ ] Decidir con Felipe si, cuando el «cobro en duda» se resuelve como «no se registró» tras una recarga, el ticket debería volver a la
  espera. Hoy se pierde (el comportamiento de antes); recuperarlo exigiría guardar la foto junto al cobro anotado.

### 6b · Mis compras: la compra a medio registrar (hecho, falta el PR)

Qué hace (`lib/compra-en-curso.ts` con su prueba, `components/mi-plata/RegistrarCompra.tsx`, `compra/page.tsx`): mientras se anota, una foto
en `sessionStorage` (`cayla:mis-compras:<persona>:en-curso`; una terminal, por su sede) con el identificador de la compra, el proveedor, las
prendas, el paso y lo del papel. Al volver, la compra se rearma en «revisar» (o en el papel, si estaba ahí) con el aviso «Seguimos con la
compra que estabas anotando» y el botón «Empezar de nuevo». Decisiones y lo que se descartó: ADR-0674, «Actualización 2026-11-17».

Dos cosas que el diseño no traía y salieron al probar:
- **La compra ya estaba guardada** (la pestaña murió justo al guardar): la base no la duplica, pero la pantalla final restaba su plata dos
  veces («Gastaste S/ 150 más» con una compra de S/ 75). Ahora la página pasa los identificadores de «Mis compras» (`guardadas`) y esa foto
  no se recupera: avisa «La compra que estabas anotando ya se guardó» con «Ver Mis compras».
- **El callejón de `compra_rapida_otros_datos`**: tras un corte ambiguo y un cambio, la base decía «recarga la pantalla» y la recarga traía
  la misma compra con el mismo identificador. Ahora la foto se borra en ese rechazo, la guardia de salida se retira y el aviso lleva a Mis compras.

Verificado en local a 375 px (Playwright, base restaurada con `estado.mjs` después): recargar en «revisar» y en el papel; «Empezar de nuevo»;
guardar → reponer la foto → recargar → «ya se guardó» y una sola fila en `compra_papeles`; corte de red con la compra en la base + cambiar el
medio + guardar → «Esta compra ya estaba guardada», y recargar abre limpio. `vitest` completo (941 archivos), `tsc`, `eslint`, `knip` y
`knip:produccion` en verde. La huella de la guía de la pantalla se aceptó (un enlace nuevo, solo en ese aviso de error: no lleva paso).

Falta antes de producción:
- [ ] `/abrir-pr`. Casillas: Mis compras no está en PL-105, pero se probó a 375 px (capturas en local). `/milimetro`: lo visible son dos
  avisos del sistema y un `<Aviso>` con enlace, piezas ya decididas; auditar `/compras/mi-plata/compra` o marcar «no aplica» con ese motivo.
- [ ] La corrida completa de `/chaos` sobre «Compré ropa» (lo hecho son ataques a mano de «red y sesión» y «navegación torcida»).
- [ ] No vuelve la foto del papel (un `File` no cabe en la memoria de la pestaña): el aviso pide tomarla otra vez. Si en el teléfono real
  es justo la cámara la que mata la pestaña, vale subir la foto al tomarla y guardar su ruta (hoy se sube al guardar).

### 7 · Partir el código de las pantallas pesadas (primer corte hecho; faltan los demás)

**Hecho el 2026-11-17** (commits `635f257` y `81f5889`; decisiones y tabla en ADR-0674, «Actualización 2026-11-17 (b)»):
- **El hallazgo:** Caja, Apartados y Mis compras cargaban la pantalla de Vender ENTERA por dos imports chicos (`money`, que vivía dentro de
  `PuntoDeVenta.tsx`, e `iconoMetodo`, dentro de su ticket; este último llegaba a todo el ERP por `components/ui/FichasMedio.tsx`). Salieron
  a `lib/money.ts` y `components/punto-de-venta/iconoMetodo.tsx`; lo vigila `lib/vender-no-se-arrastra.test.ts`.
- **Vender:** GSAP solo con las animaciones encendidas (`useFlipDelTicket`), «Cerrar caja» al abrirla y «Prenda sin registrar» en reposo
  (`hojaBajoDemanda`, que avisa y reintenta si no hay red). Lo de cobrar sin conexión (hoja de cobro, venta registrada, cobro en duda) NO se difiere.
- **Medido** (JavaScript total, armado de producción): Compré ropa 2 097 → 1 406 KB (−33 %), Caja 2 241 → 1 650 (−26 %; con el segundo
  corte, 1 454: −35 %), Apartados 2 137 → 1 692 (−21 %), Vender 1 938 → 1 751 (−10 %). Sin cambio: Existencias 1 903, Recibir 1 754, Nuevo producto 1 742, Productos 1 640.

**Los medidores viven en `scripts/peso/`** (ya no hay que reescribirlos): `cierres.mjs` (qué arrastra cada import fijo de un componente),
`camino.mjs` (por dónde un archivo termina cargando a otro) y `por-pantalla.mjs` (JavaScript por ruta sobre un armado de producción).

Lo que sigue, en orden de lo que más pesa (medir SIEMPRE antes: buscar primero un arrastre como el de `money`, después los modales):
- [x] **Caja** (2026-11-17, commit `17aede6`): cerrar caja, historial de cierres, detalle de venta y registrar gasto completo pasan a
  `hojaBajoDemanda` (`components/caja/CerrarCajaBajoDemanda.tsx` y `hojas-bajo-demanda.tsx`). 1 650 → 1 454 KB. Decisiones en ADR-0674,
  «Actualización 2026-11-17 (c)». Dos trampas que costaron tiempo: el archivo que define una hoja diferida tiene que ser **`.tsx`** y no
  juntar hojas de pantallas distintas, o el escáner de las guías pierde o inventa controles (`lib/guias.test.ts` lo marca); y los medidores
  contaban el código de las acciones del servidor (corregido).
- [ ] **El detalle de una venta** (`DetalleVentaModal`, 154 KB de fuente) sigue fijo en Historial de ventas, Movimientos, Devoluciones,
  Comprobantes y Pedidos web: `DetalleVentaBajoDemanda` ya existe, falta usarlo ahí (medir cada pantalla antes).
- [ ] Abrir el detalle de una venta desde Caja con una venta de verdad (no se pudo: la base local no tenía ventas de hoy).
- [ ] **Vender**, segunda pasada: `ClientaDelTicket` (114 KB solo suyos: partir su buscador, que solo sirve con red), `EscanerCamara` (52; hoy
  Vender importa de ese archivo también `precargarLectorQR`: separarlo primero), `PuntoDeVentaCatalogo` (109, siempre a la vista: no).
  El botón «Cerrar caja» vive en el menú «Más»: se le puede sumar `CerrarCajaBajoDemanda.precargar` al acercar el dedo o el foco.
- [ ] **Existencias** (1 903), **Recibir** (1 754), **Nuevo producto** (1 742), **Productos** (1 640), **Apartados** (1 692), **Campañas**:
  sin medir todavía. Correr `cierres.mjs` con su componente raíz.
- [ ] **El marco** (1 073 KB de los ~1 400–1 900 de cada pantalla) es ya lo que más pesa en todas: la Fase 1 lo bajó de 936 a 626 KB
  «propios» con otra cuenta; con la de `por-pantalla.mjs` (marco = `rootMainFiles` + los `layout`) son 1 073. Vale otra pasada de cierres
  sobre `components/AppShell.tsx` y `app/(app)/layout.tsx`.
- [ ] Otros tableros con el mismo patrón que `money`: una pantalla grande que exporta una utilidad que importan sus vecinas. La prueba
  solo vigila Vender. Para buscarlos: `grep -rn 'from "@/components/<PantallaGrande>"'` sin `import type`.

### 8 · Las pantallas de los 4 módulos a 375 px

Hoy solo Vender, Cambios y Devoluciones están obligadas a 375 px (PL-105). Felipe amplió el uso del celular a Catálogo, Compras, Inventario y
todo Ventas: escribir el ADR que amplía PL-105 (y la casilla de `.github/pull_request_template.md`), recorrer cada pantalla y cada hoja a
375 px con los medidores de `/milimetro` (`/espacio` mide los blancos de 44 px con el dedo y el desborde) y arreglar lo roto, módulo por
módulo. `/multi-view-responsive` no cubre celular.

### 9 · Lo que es de Felipe

- [ ] **Reservar el ADR-0674** (`pnpm reservar adr` desde una máquina que pueda subir etiquetas). Desde la nube el remoto rechaza
  `refs/tags/reserva/*` (HTTP 403). El 0673 lo tomó `claude/anular-comprobante-permisos`.
- [ ] **Probar en un teléfono barato real** (Galaxy A05 / Redmi A3, ~S/ 350, Chrome por USB): la ganancia del modo liviano no se puede medir
  en el emulador (frena el procesador, no la gráfica).
- [ ] **Mover los umbrales del modo liviano con datos** tras una semana: `vercel logs --query tiempo_de_pantalla --json`, filtrar con `jq`
  `select(.tactil == true)` y agrupar por `ram`. La regla cambió respecto de la que se aprobó en la pregunta (ADR-0674, decisión 2).
- [ ] **Dynamic:** `components/ui/BotonLiviano.tsx` es una pieza nueva en una carpeta que Dynamic mira: queda como tarea allá si lo quieren.

## Visto de paso (sin decidir)

- Abrir los Filtros de Productos en el celular tarda ~600–700 ms con el procesador frenado 4 veces (`next dev`): es JavaScript, no dibujo.
- CSS que se quedó global por el orden: `tienda-web.css`, `tienda-web-conf.css`, `trafico.css` (los pisa `vidrio/tienda-web.css`),
  `estados-financieros.css` (`vidrio/estados.css`) y `vidrio/vitrinas-sedes.css` (`config-vistas.css`). Se pueden mover junto con su par.
- ~744 KB de CSS que alcanza el marco (65 archivos: `finanzas.css`, `vidrio/estados.css`, `telar.css`, `analisis.css`…).
- `RecordatorioCierreCaja` (20 KB + 15 KB de CSS) se carga todo el día y solo se ve al cierre: candidato a diferir, con cuidado (cabecera).
- Sin verificar a la vista tras mover su CSS: el Inicio de almacén, el acompañante y la vista previa de campañas.
- El medidor de color (`.claude/skills/color/referencia/medir.js`) da un falso positivo en el menú del celular con el modo liviano: cuenta el
  `::after` del menú (tinta al 22 %, una sombra de borde) como si cubriera todo el panel. Con píxeles: 8,79:1.

## Cómo se probó en el Mac mini (2026-11-17)

- Docker Desktop estaba apagado: `open -a Docker` y los contenedores `supabase_*_cayla-retail` suben solos. `next dev` cayó con un pánico de
  Turbopack por una caché vieja de 8 GB: `rm -rf apps/web/.next/dev` y volver a levantar (`preview_start` → `cayla-retail-dev`, puerto 3011).
- **Con el panel del navegador oculto** (la sesión no está abierta en ninguna ventana) la página no revela el contenido de `Suspense` a tiempo
  y la emulación de 375 px se descuadra (llegó a 1500×3248): se usó Playwright, que no depende del panel.
- La guardia de «salir sin guardar» abre el diálogo `beforeunload` al recargar y corta el guion de Playwright: aceptarlo con
  `browser_handle_dialog` y leer el estado en otra llamada. Android no pregunta al descartar una pestaña.
- «Compré ropa» pide una ronda abierta: la base local no tenía ninguna. Foto con `estado.mjs guardar`, «Abrir mi ronda», probar, y
  `comparar` + `restaurar --si` al final (cambiaron solo `compra_rondas`, `compra_papeles`, `ordenes_compra`, sus ítems y `actividad`).

## Cómo levantar el ERP local en una sesión en la nube (lo que funcionó)

```bash
nohup dockerd > /tmp/dockerd.log 2>&1 &
cp supabase/0000_local_stub_dynamic.sql.example supabase/migrations/0000_local_stub_dynamic.sql   # fuera de git
SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx -y supabase@2.118.0 start -x studio,imgproxy,edge-runtime,logflare,vector,supavisor,mailpit,postgres-meta,storage-api,realtime
```

- Las imágenes de `public.ecr.aws` las bloquea el proxy; las de Docker Hub sí bajan (`SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`). El CLI
  más nuevo no acepta `supabase/config.toml` (`inbucket`): usar `supabase@2.118.0`, el del CI.
- `apps/web/.env.local` con `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SERVICE_ROLE_KEY` de
  `npx -y supabase@2.118.0 status -o env` (fuera de git). `pnpm install --frozen-lockfile --filter web...` y `npx next dev -p 3100` en `apps/web`.
- Entrar con `felipe@cayla.local` / `cayla-local` (líder y Admin en el stub). Tienda Lima tiene la caja abierta.
- **Reiniciar `next dev`** tras agregar un `@import` nuevo a `globals.css`: el servidor no lo toma solo.
- `gh pr list` usa GraphQL (bloqueado): `pnpm abrir-pr:choques` falla; cruzar los PR abiertos con la API REST (herramientas MCP de GitHub).

## Cómo medir

- **Desde el 2026-11-17 los medidores están en `scripts/peso/`** (`cierres.mjs`, `camino.mjs`, `por-pantalla.mjs`; cada uno dice su uso
  arriba). Lo de abajo explica qué hacen.
- **Armado de producción** sin revisar tipos (rápido): en `apps/web`, `NODE_OPTIONS=--max-old-space-size=8000 VERCEL=1 npx next build`.
- **JavaScript por pantalla:** leer `.next/server/app/(app)/<ruta>/page_client-reference-manifest.js` (deja `globalThis.__RSC_MANIFEST`),
  sumar los `.js` de `entryJSFiles` más `rootMainFiles` de `.next/build-manifest.json`, y comprimir con `zlib.gzipSync`. Lo del marco son las
  entradas `app/layout` y `app/(app)/layout`.
- **Qué arrastra un componente:** recorrer sus `import` fijos (no los `import()`) con un resolvedor de `@/` y sumar el tamaño de cada archivo; ordenar
  por lo que es solo suyo frente a sus hermanos. Así salió el 595 KB del buscador.
- **Recalcular estilos:** Playwright + CDP `Tracing` con `devtools.timeline`, sumando `UpdateLayoutTree` y `RecalculateStyles`, con
  `Emulation.setCPUThrottlingRate` en 4.
- **Medidores de `/milimetro`:** cada `.claude/skills/*/referencia/medir.js` es una expresión: `await page.evaluate(contenidoDelArchivo)`.
  En escritorio el primer `.boton-liviano` es el del menú del celular (escondido): usar `.marco-isla-der .boton-liviano`.

## Trampas que costaron tiempo

- `lib/equipo-reglas.ts` ya existe (el equipo de Colaboradores): no lo pises (pasó en esta rama y se restauró desde git).
- `navigator.deviceMemory` solo existe en contextos seguros: en una página `data:` sale `undefined`; en `localhost` sí está. Chrome nuevo da
  16 (antes topaba en 8).
- Insertar HTML en el `<body>` desde un script del `<head>` hace que React lo borre al hidratar («Hydration failed»): dibujarlo en el
  servidor y mostrarlo con CSS.
- Un CSS que se importa desde un componente carga DESPUÉS de los globales: si un global lo pisaba, el orden se invierte (por eso 5 se quedaron).
- `page.route` sin responder deja la petición colgada, pero al soltar la ruta o recargar puede llegar igual a la base (así quedó una venta
  de prueba en la base local el 2026-11-17).
