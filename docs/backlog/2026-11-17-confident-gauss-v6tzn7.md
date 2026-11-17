# 2026-11-17 · El ERP en teléfonos de gama baja — TRASPASO para seguir en otra cuenta

Rama `claude/confident-gauss-v6tzn7`. Bitácora: `docs/bitacora/2026-11-17-confident-gauss-v6tzn7.md`. Decisiones y números:
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
| 6a | El ticket de **Vender** sobrevive a que Android cierre la pestaña | **Hecho en esta rama** (commit `d837a8b`), NO en producción |
| 6b | La compra a medio registrar en **Mis compras** sobrevive igual | Diseño listo (abajo), sin código |
| 7 | Partir el código de las pantallas pesadas | Sin empezar (datos y método abajo) |
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
- [ ] `/chaos` sobre Vender con las familias «red y sesión» y «navegación torcida» (lo de arriba fue un ataque a mano, no la corrida
  completa). Dos pestañas de Vender en la misma sede: cada una tiene su foto (sessionStorage), comprobar que no se pisan.
- [ ] Decidir con Felipe si, cuando el «cobro en duda» se resuelve como «no se registró» tras una recarga, el ticket debería volver a la
  espera. Hoy se pierde (el comportamiento de antes); recuperarlo exigiría guardar la foto junto al cobro anotado.

### 6b · Mis compras: la compra a medio registrar (diseño listo)

Archivo: `components/mi-plata/RegistrarCompra.tsx` (1 816 líneas; pasos `proveedor → habituales → revisar → papel → listo`).

**Lo que lo hace seguro:** cada compra lleva su `id` (`useState(() => crypto.randomUUID())`, viaja como `p_id` a `registrarCompraRapida`) y
la base no repite una compra con el mismo id («si ya se guardó, no se repite»). Si la foto conserva ese `id`, recuperarla nunca duplica la
compra, aunque la pestaña haya muerto en pleno guardado. No hace falta el candado de Vender.

Diseño:
1. **Foto** en `sessionStorage` (`leer/guardar/borrar` de `lib/almacen-local.ts` con `"pestana"`; clave propia, por ejemplo
   `cayla:mis-compras:en-curso`): `{ id, proveedorId, marcaElegida, porMarca, lineas, paso, tipo, monto, serie, numero, pago, pagadoPropio,
   pagoParcial, teniaFoto }`. Se guarda en un efecto cuando `paso !== "listo"` y hay proveedor y prendas; se borra en `"listo"`, en
   `otraCompra()` y sin prendas.
2. **El archivo de la foto del papel NO se puede guardar** (`File`): al recuperar, la guía del papel ya pide la foto (`camposPapel` con
   `conFoto: archivo !== null`). El aviso lo dice si `teniaFoto`.
3. **Al montar**, una sola vez: si hay foto válida y su `proveedorId` está en `datos.proveedores`, rearmar la compra **sin** llamar a
   `elegirProveedor()` (que abre «Algo nuevo» si el proveedor no tiene habituales): `setId(foto.id)`, `setProveedor`, `setMarcaElegida`,
   `setHabituales("cargando")` + `cargarHabituales(p.id).then(setHabituales)` (con la guardia de `proveedorPedido`), `setLineas`, lo del papel,
   y `setPaso(foto.paso === "papel" ? "papel" : "revisar")`. Aviso: `avisar.aviso("Seguimos con la compra que estabas anotando", { detalle:
   "<proveedor> · N prendas", accion: { texto: "Empezar de nuevo", onClick: otraCompra } })` (los avisos aceptan `accion`).
4. Lógica pura en `lib/compra-en-curso.ts` con su prueba (qué foto sirve, a qué paso vuelve), como `lib/ticket-en-curso.ts`.
5. Verificar en local: Felipe ve Mis compras; elegir un proveedor, anotar una prenda, ir a «revisar», recargar → vuelve con la prenda y el
   mismo `id`; guardar dos veces con el mismo `id` → una sola compra en `retail.compras`. Es pantalla que guarda: `/chaos`.

### 7 · Partir el código de las pantallas pesadas

Lo propio de cada pantalla (sin el marco), del armado de producción del 2026-11-17: Caja 980 KB · Mis compras 887 · Apartados 860 ·
Vender 681 · Existencias 668 · Nuevo producto 505 · Campañas e Insignias 424 · Recibir 417 · Productos 403.

Método (el mismo que funcionó en la Fase 1):
- **Medir antes de tocar** qué arrastra cada componente: el script de cierres de import descrito en «Cómo medir», con la pantalla como raíz.
  En la Fase 1 la causa no fue «muchos componentes», fue UN import (el buscador traía `inicio-avisos.ts` entero).
- **Modales que se abren con un toque** → `next/dynamic` con `{ ssr: false }`, y precarga al acercarse al botón (`onPointerEnter`/`onFocus`),
  como `PanelActividad` y `PerfilModal`. Candidatos en Vender: `AbrirCajaFormV2`, `CerrarCajaModalV2`, `HojaDeCobro`, `HojaDeDescuento`,
  `PrendaSinRegistrarModal`, `VentaRegistradaModal`, `OpcionesDePrendaModal`, `CobroEnDuda`.
- **GSAP** (`lib/motion-gsap.ts`, solo lo usa `PuntoDeVenta` para el Flip del ticket) se carga aunque las animaciones arrancan apagadas
  (ADR-0625): cargarlo con `import()` solo si `prefiereQuieto()` es falso.
- Comprobar después con el armado de producción y la tabla de arriba, y en el navegador que cada modal abre igual (y a 375 px en Vender,
  Cambios y Devoluciones).

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
