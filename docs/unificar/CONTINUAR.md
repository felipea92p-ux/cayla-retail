# Cómo seguir con `/unificar` desde otra sesión

Escrito el 2026-10-07 al cerrar la ronda 4 y puesto al día el 2026-10-08 al cerrar la ronda 5 (rama `claude/unificar-next-round-bdaaa0`) y el 2026-10-09 con la ronda 5b, la barra apilada (rama `claude/keen-feistel-35a4cb`). Es el punto de partida para la próxima sesión: qué está
decidido, qué falta, cómo se trabaja y lo que se aprendió en el camino. **Léelo antes de abrir la skill** (`/unificar`) y mantenlo al día
al cerrar cada ronda: la próxima sesión no ve esta conversación.

**Para arrancar, pega esto en la sesión nueva:**

> Seguimos con `/unificar`. Lee `docs/unificar/CONTINUAR.md` y `docs/unificar/README.md`, revisa qué cambió en `main` desde el
> 2026-10-08 y arma la ronda 6 (`combo`, `tabla`, `titulo-seccion`): censo nuevo, depurado contra el código y la página de elegir con
> demos vivas, en claro y oscuro, como la de la ronda 5.

## Dónde quedó

Doce familias decididas por Felipe, todas **mirando** (y de la ronda 3 en adelante, **tocando** demos vivas), migradas y vigiladas por
`lib/unificar.test.ts`. **Las diez con candado de las rondas 1 a 5 están en deuda 0; la de la ronda 5b, `grafico.barra`, tiene 14 archivos por migrar.**

| Ronda | Familia | La pieza | Registro |
|---|---|---|---|
| 1 | `accion.volver` | `<Volver>`: la flecha redonda. Desde la ronda 3 también es el «Atrás» de un paso a paso («volver solo es una flecha») | [accion.volver.md](accion.volver.md) |
| 1 | `pestanas` | `<Pestanas>` (cambia de sección), `pildora-cayla` (filtra), `SegmentoEnlaces` / `SegmentoDeslizante forma="modo"` (otra forma de ver) | [pestanas.md](pestanas.md) |
| 1 | `cifra` | `<TarjetaCifra>` | [cifra.md](cifra.md) |
| 2 | `estado` | `<Chip>` (sin candado: quedan 7 píldoras a mano que son contadores o etiquetas) | [estado.md](estado.md) |
| 2 | `accion.nuevo` | `<Boton>` / `<BotonEnlace>` / `<BotonAncla>` | [accion.nuevo.md](accion.nuevo.md) |
| 3 | movimiento | `.mov-boton` (`app/globals.css`): sube 2 px con sombra, luz que cruza, el «+» gira, la flecha avanza, se encoge al presionar; un botón negro pasa a rojo profundo | [accion.nuevo.md](accion.nuevo.md) |
| 4 | `boton` | **Dos voces**: la voz la pone el LUGAR (`data-voz="cabecera"` → versalitas de 11 px y 40 px; hojas, tarjetas y filas → letra normal de 13,5 px). Pieza: `btn-cayla` (que `<Boton>` dibuja). **Onda al clic** (`<OndaBotones>` en `app/layout.tsx`). Todo `btn-cayla` tiene el movimiento | [boton.md](boton.md) |
| 4 | `accion.eliminar` | `btn-peligro` (rojo desde el principio); en la barra de vidrio, `fila-alerta` | [boton.md](boton.md) |
| 4 | `accion.cerrar` | la × de `<Modal conCerrar>`; `ModalRuta` la trae por defecto | [boton.md](boton.md) |
| 5 | `vacio` | `<Vacio>`: el ícono de lo que falta que se dibuja, título serif, frase que dice qué hacer y su botón; chico en tablas y hojas; al no encontrar, lo deshace ahí mismo | [vacio.md](vacio.md) |
| 5 | `aviso` | `<Aviso tono>` en franja (el error destella una vez); `nota-cayla` con su «i»; el error de un dato bajo su campo | [aviso.md](aviso.md) |
| 5 | `buscador` | `<Buscador>`: la caja hundida (lista) y la píldora que se despega (mostrador); «Buscando…» solo si tarda; busca mientras se escribe (salvo Cambios y Devoluciones) | [buscador.md](buscador.md) |
| 5b | `grafico.barra` | `<BarraApilada>`: pista de arena + el movimiento de Compras (entra, se reacomoda, el apuntado se estira y los demás bajan); 12 · 8 · 4 px; si responde, cada tramo es un botón. **Deuda: 14 archivos**, solo se migró «Deuda por vencimiento» | [grafico.barra.md](grafico.barra.md) |

Lo mismo, en corto, está en la tabla «Piezas únicas» de `CLAUDE.md`, que es lo que lee cualquier sesión que construya una pantalla.

## Ronda 5b (2026-10-09): la barra apilada, decidida y con una pantalla migrada

Se pidió desde Frescura (ADR-0208 act. 2026-10-07: su rama creó `ui/BarraApilada`, la misma barra que «Deuda por vencimiento» de Compras dibuja a
mano). Felipe eligió **P** tocando las demos. **Falta:** migrar las otras 13 barras (14 archivos de deuda) (lista y orden en `grafico.barra.md`) y decidir con Felipe
si las barras de Análisis (ADR-0357) y del aviso de cierre de Caja (ADR-0359) se unifican. Lo aprendido:
- **El censo no veía las barras hechas con cajas**: solo recorría SVG. Ahora `censarBarrasApiladas` (`unificar/motor/censo-en-pagina.js`) las
  reconoce por su forma (fila baja y ancha de tramos pintados sin texto cuyos anchos suman el de la fila) y las anota como `grafico.barra`.
  Con una **familia partida**, `--familia grafico` sigue incluyéndola (el filtro acepta prefijo) y la decisión vive en el id nuevo.
- **Sin el Chromium de Playwright** (170 MB que Felipe no autorizó): `NAVEGADOR_CANAL=chrome` hace que el censo, las fotos y el auditor de
  tema usen el Google Chrome instalado. Se probó con un censo de 180 vistas y con `tema:auditar`.
- **Una pieza que otra rama ya creó** (`ui/BarraApilada` en `claude/frescura-vara-cayla-dos-niveles`): se trae con
  `git show <rama>:<ruta>` y se extiende como superconjunto (mismas props), para que el choque al fusionar se resuelva quedándose con la de esta rama.
- **Mirar los datos de verdad antes de escribir el registro**: dos afirmaciones del primer borrador eran falsas (el color de «Cómo se pagó» sale
  de un token en un `style` inline, no de un hex). Importa para migrar Historial: la pieza hoy solo recibe una clase.

## Ronda 5 (2026-10-07/08): cerrada

`vacio`, `aviso` y `buscador`: decididas tocándolas, construidas (`components/ui/Vacio.tsx`, `Aviso.tsx`, `Buscador.tsx`, CSS en
`app/estilos/vacio-aviso-buscador.css`) y migradas enteras, deuda 0 (registros en `vacio.md`, `aviso.md`, `buscador.md`). Lo nuevo de la
página de elegir (`elegir.mjs`): `estilos`, `guion`, «Ver en oscuro», `fotosAlFinal` y demos vivas con «Ver» y «Repetir la entrada».
Para migrar rápido se repartió el ERP en cuatro agentes con instrucciones escritas (`apps/web/unificar/.salida/INSTRUCCIONES-MIGRAR-R5.md`,
fuera de git) y un archivo por agente: funcionó sin choques. Lo aprendido:
- **En JSX, `unificar-fijo` va como `{/* unificar-fijo: … */}` dentro del elemento**: un `//` suelto se dibuja como texto.
- **Una firma tiene que mirar la forma, no la prop**: `inputMode="search"` o un placeholder pasado a la pieza contaban como deuda.
- **Archivos que se prueban sin el alias `@/`** (`PerdidasVista`, `ExistenciasVacio`, los que `lib/*.test.ts` renderiza): no importes
  `components/ui/campos` ahí; usa la clase del botón (`btn-cayla btn-secundario`).
- **Turbopack guarda un CSS roto aunque ya lo arreglaste**: si el error nombra una línea que el archivo no tiene, comenta y vuelve a poner
  su `@import` en `globals.css` (borrar `.next` puede estar bloqueado).
- Las firmas de la ronda no veían todo (Existencias, Apartados): después de migrar, recorre las pantallas con una búsqueda imposible.

## Lo que falta, en orden

### 1. Las próximas rondas (de a 3 familias como máximo)

El orden recomendado sale del tablero `README.md` («Por analizar»): primero lo que la colaboradora lee o toca en más pantallas.

1. ~~`vacio`~~, ~~`aviso`~~, ~~`buscador`~~: ronda 5, decididas y migradas (deuda 0). **La próxima es `combo`, `tabla` y
   `titulo-seccion`**: su censo ya está hecho (`apps/web/unificar/.salida/r6-admin/`, 42, 39 y 46 formas sin depurar; falta depurar y la
   pasada del mostrador).
4. **`combo`** (42 formas) — la regla de buscar y paginar ya es una (ADR-0209); `SelectFin` es de Finanzas (ADR-0195, decidida a propósito).
5. **`tabla`** (37 formas) — `fin-tabla` de Finanzas queda aparte por ADR-0195.
6. **`campo` + `etiqueta-campo`** — viven en las hojas: censo con `--escenarios`.
7. **`titulo-seccion`** (46 formas, sin pieza del sistema).
8. **`accion.ver`, `accion.filtrar`, `accion.exportar`** — botones de una función.
9. **`casilla`, `enlace`, `modal`, `grafico`, `paginacion`, `avatar`** — pocas formas: rondas cortas. De los gráficos, **la barra apilada ya está decidida (ronda 5b)**; faltan la línea (Caja), las barras mensuales (Rendimiento) y la dona (mapa del Inicio). Los de Análisis tienen su excepción de movimiento (ADR-0357).
10. **`icono`** (250 huellas: casi todo tamaño y trazo de lucide; depurar mucho antes de mostrar).
11. **`contador` y las píldoras-etiqueta** — cierran el candado de `estado` (las 7 a mano: `ExistenciasChips`, `ConfirmarCambios`, `RolesPanel`, `DevolucionesPanel`, `atributos/kit`, `ModalesApartado`, `FichaColaborador`).
12. **`titulo-pagina`** — **no se corre** hasta que Felipe decida la cabecera de Compras, Caja, Recibir y el resto de Catálogo (ADR-0220).

### 2. Preguntas abiertas para Felipe

- **La cabecera de Compras, Caja, Recibir y el resto de Catálogo** (ADR-0220): decidirla destraba `titulo-pagina`.
- **«Piden algo hoy»** de Análisis (la cifra que cuenta tres grupos y filtra uno): va en su propia tarea.
- **Avisar a Dany** de los cambios en Rendimiento y Clientes (dueña del plan de Clientes): pestañas, cifras, botones y la × en
  Beneficios del club. Redactar el mensaje con capturas; lo envía Felipe.
- **Confirmar mirando** tres cosas que se aplicaron por regla:
  - la cabecera de Caja, cuyos botones en versalitas bajan de fila a 1440 px (quedaron a la derecha);
  - la flecha redonda en la banda de color del reverso de los pases de Traslados (ADR-0355);
  - Finanzas en versalitas en su cabecera (commit propio en la ronda 2, por si se revierte).
- **El «Registrar N» del anillo de Análisis** (`components/analisis/TodaviaNo.tsx`): quedó como excepción de `accion.nuevo` (diseño de ADR-0357).

- **Ronda 5, dos «Limpiar filtros» que no se pudieron poner:** el vacío de Recepciones de compra (el filtro llega como prop) y el de
  Proveedores del Taller con todo archivado (su «Limpiar» no cambia nada). Decidir si se arreglan con su pantalla.

### 3. Deudas chicas que vio la auditoría de modo oscuro (heredadas del claro)

Ninguna la causó la ronda 4, pero fallan contraste (WCAG) en los dos temas:

- el «Pagar» `btn-sutil` de una fila marcada en Por pagar (1,8:1);
- el conteo gris de las píldoras de Clientes (`dark:opacity-85`, 2,5:1);
- 24 textos de filas atenuadas (Por pagar, Compras, Categorías, Configuración).

### 4. Huecos del censo

- **La auditoría de modo oscuro de la ronda 5 solo midió la mitad del ERP** (38 de 77 visitas, 0 hallazgos solo en oscuro): la cuenta
  Admin quedó sin sede en la base local y las demás rutas fueron a «elige una sede». Repetirla con la cuenta en una sede
  (`TEMA_BASE_URL=… node tema/cli.mjs --cuenta admin --todas`) antes de la ronda 6, mirando las capturas.
- **Las firmas no ven todo:** en la ronda 5 se escaparon el vacío de Existencias y los de Apartados (hechos con otras clases). Al
  migrar una familia, recorre las pantallas con una búsqueda imposible («zzzz») para encontrar los que la firma no vio.
- **Falta una pasada con la cuenta `integrante`.** Ya hubo con Admin y con `terminal-ventas`.
- **Apartados no tiene escenarios a 375 px:** a ese ancho, la auditoría de modo oscuro solo midió la pantalla principal.
- **Sin escenario:** «Registrar gasto» de Caja, «Nueva serie» y «Registrar» de Series (con la cuenta del mostrador), y «la ficha de
  una prenda» de Análisis. Los modales que el auditor no sabe abrir quedan en «No cubierto».

## Cómo se trabaja (lo que funcionó)

**La rama.** Una rama nueva desde `origin/main` por ronda (`git checkout -b claude/unificar-<familia> origin/main`), commits locales por
actividad y el PR al final, cuando Felipe lo pide.

**El servidor.** Esta worktree no traía `apps/web/.env.local`: se copian **solo** las dos variables de Supabase local de otra worktree
(`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54421` y su `PUBLISHABLE_KEY`). Luego:

- `preview_start` **`cayla-retail-dev-libre`** (puerto 3110) para el ERP;
- `preview_start` **`unificar-laminas`** (puerto 8793) para servir `apps/web/unificar/.salida/` (láminas, páginas de elegir, pruebas).

**Ojo: la app cierra los dos servidores cuando la sesión queda quieta** (pasó cuatro veces). Si un script da `ERR_CONNECTION_REFUSED`
o «fetch failed», se vuelve a hacer `preview_start` y se espera un `200` en `/login` antes de seguir.

**El censo** (desde `apps/web`, unos 10 minutos con escenarios; correlo en segundo plano):

```bash
node unificar/cli.mjs --base-url http://localhost:3110 --todas --escenarios --familia <a,b> --salida unificar/.salida/<carpeta>
node unificar/cli.mjs --base-url http://localhost:3110 --cuenta terminal-ventas --todas --escenarios --salida unificar/.salida/<carpeta>
node unificar/deuda.mjs [familia]
```

El informe trae, por variante, su `movimiento:` (qué hace al pasar el mouse, al presionar, con el foco, en bucle, al aparecer) y lo
`medido:` (el censo le pasa el mouse sin clic). **Felipe quiere conservar, mejorar y unificar también las animaciones**: díselo por
variante y no pierdas ninguna al migrar.

**Depurar antes de mostrar.** Agrupa las variantes por cara y por función con un script sobre `censo.json`. El motor cuenta de más:
- las tallas de Vender salían como «Nuevo» (ya corregido);
- un chip de filtro parece un botón;
- «Volver al inicio» de una paginación parece una vuelta.

**La página de elegir** (`node unificar/elegir.mjs <spec.json>`, cabecera del script). Lo que hizo elegir bien:

- **fotos reales con la pieza cambiada en vivo:** un script de Playwright abre la pantalla, cambia el DOM (las clases o el texto) y
  fotografía el antes y el después en las mismas pantallas, así se compara parejo;
- **`demo`: botones o una hoja VIVOS** dibujados con el CSS real del ERP (`css` apuntando a un `recursos/app.css` de un censo, o al CSS
  descargado del servidor, y `claseHtml` con las clases de las fuentes). Una foto no muestra el movimiento; Felipe eligió la ronda 3 y la
  4 tocándolos;
- **`movimiento`: lo que la foto no muestra**, en una línea por opción;
- `ancha: true` cuando la demo es una hoja (si no, los botones se apilan);
- recomendación en el texto de la respuesta, pero **la elección es de Felipe** y llega pegada al chat («Copiar mi elección»).

**Migrar.**

- Las piezas primero, con una prueba viva para su OK antes de tocar los módulos (como se hizo con la onda y las dos voces).
- Después un **transformador de clases** en Python, corrido primero en seco (`ver`) y luego `aplicar`. Saca la cara a mano (`label-cayla`,
  esquinas, relleno, color, hover, transiciones) y conserva lo que ubica al botón en la fila (`flex-1`, `w-full`, márgenes, alto).
- El peso sale de **cómo se ve en reposo, sin `hover:`**: un `hover:border-rojo` no hace peligroso a un botón.
- Una línea `import { … }` nueva va **después del último import completo**: insertarla tras la última línea que empieza con `import`
  la metió dos veces en medio de un import de varias líneas.
- Un commit por módulo.

**Antes de cerrar.**

- `node unificar/deuda.mjs` con todo en 0, o la deuda declarada.
- `pnpm --filter web typecheck` y `pnpm --filter web test`.
- Fotos antes y después al mismo ancho (`pnpm unificar:fotos`); el mostrador también a 375 px (PL-105).
- `tema:auditar` con 0 hallazgos solo en oscuro, **mirando las capturas**.
- El registro de la familia, `README.md`, `CLAUDE.md`, ADR-0358, y la bitácora y el backlog de la rama.

## Lo que se aprendió (y conviene no repetir)

- **Elegir por descripción falla; mirando y tocando, no.** El 2026-10-06 Felipe eligió tres por su texto y, al verlas, no le gustaron.
- **Una firma del CI puede volverse falsa cuando cambia la pieza.** La de la ronda 2 trataba `btn-cayla` como copia a mano, y en la
  ronda 4 `btn-cayla` pasó a ser la pieza. Revisa las firmas de las familias vecinas al decidir.
- **Las pruebas exactas también bajan:** al quitar un anillo de foco propio, `lib/foco-comun.test.ts` (`PENDIENTES_HOY`) pide bajar la
  cuenta; hazlo con una línea que diga por qué.
- **El motor del censo tenía tres puntos ciegos con `::after`,** ya corregidos (`4cc1e386`):
  - el pseudo-elemento no se puede comparar con `matches()`;
  - un atajo `animation` con `var()` deja vacías sus partes en el CSSOM;
  - lo medido se cortaba en las tres primeras transiciones.

  Si una animación «no aparece», sospecha del motor antes que de la pantalla.
- **El gancho de commit corre todas las pruebas unitarias.** Con la máquina cargada, una de propiedades (`separaciones-reglas`, 29 999
  casos) puede pasar su límite de 5 s: córrela sola y reintenta. No es el cambio.
- **La base local es compartida:** otra sesión cerró y reabrió la caja de Lima a mitad de las fotos (`estado.prueba.mjs`). Si una foto
  cambia sin razón, mira `retail.cajas` antes de buscar el error en el código.
- **`.salida/` está fuera de git:** las láminas, las páginas de elegir y los scripts de captura de esta sesión no viajan a otra worktree.
  Lo que hay que conservar va a `docs/unificar/` (registros y `capturas/*.jpg` chicas).

## Archivos clave

| | |
|---|---|
| `.claude/skills/unificar/` | la skill: método, criterio, propuesta, decisión, informe |
| `apps/web/unificar/familias.mjs` | las familias, las funciones de botón y las `DECISIONES` con firmas, deuda y excepciones (también `ventana`) |
| `apps/web/unificar/motor/censo-en-pagina.js` | la huella y el movimiento de cada pieza (corre en la página) |
| `apps/web/unificar/cli.mjs` | el censo, lo medido al pasar el mouse, el informe y la lámina |
| `apps/web/unificar/elegir.mjs` | la página de elegir (fotos, `demo` vivas, `movimiento`) |
| `apps/web/unificar/deuda.mjs` | la deuda (la usa `lib/unificar.test.ts`) |
| `apps/web/components/ui/campos.tsx` | `Boton`, `BotonEnlace`, `BotonAncla` (y sus pesos) |
| `apps/web/components/ui/OndaBotones.tsx` | la onda al clic |
| `apps/web/app/globals.css` | `btn-cayla`, `.mov-boton`, la voz de la cabecera y `cayla-onda` |
| `docs/adr/0358-unificar-una-funcion-una-pieza.md` | el ADR y la línea de cada decisión |
