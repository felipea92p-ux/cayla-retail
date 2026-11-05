# Vidrio líquido — el tablero (ADR-0596)

Felipe decidió el 2026-10-31 rediseñar todo el ERP con el vidrio de «Mi perfil» en su versión **Serena**, componente por componente.
Este archivo es el tablero: qué pieza se auditó, qué cara eligió Felipe, en qué maqueta, y si ya está en el código.

**Dónde vive el vidrio en el código:** las recetas en `apps/web/app/estilos/vidrio/recetas.css` y las piezas en `app/estilos/vidrio/*.css`: cambiar una pieza ahí la cambia en todo el ERP (ADR-0596, act. b).

**Cómo se hace cada pieza:** (1) se audita en el código y en pantalla: dónde vive, cuántas veces se usa, qué le pasa sobre el vidrio;
(2) se dibujan 2 o 3 caras en una maqueta tocable en `docs/maquetas/`, en claro, oscuro y 375 px, con «Como ahora» al lado; (3) Felipe
elige mirando; (4) se anota aquí; (5) se lleva al código por `/unificar` (familia por familia, sin cambiar qué hace la pieza), midiendo
contraste con `tema:auditar` y con su prueba al día.

**El idioma:** lo hundido espera tu dato · lo que sobresale es lo que haces · lo que explica es plano. Solo tokens (ADR-0169 / ADR-0336);
movimiento una vez, sin rebote, apagado con `prefers-reduced-motion` (ADR-0136).

Estados: **Por auditar** · **En maqueta** (esperando que Felipe elija) · **Elegido** (en maqueta, falta el código) · **En código**.

## 1. El marco (lo primero: el vidrio necesita algo detrás)

| Pieza | Dónde vive | Estado | Cara | Maqueta |
|---|---|---|---|---|
| El fondo (lienzo) | `AppShell.tsx` (`bg-crema`), `globals.css` | En código | B · Aurora | `marco-vidrio-2026-10/` |
| Menú lateral (abierto, plegado, cajón de grupo) | `AppShell.tsx` (`GrupoLateral`, `CajonGrupo`) | En código | Desde el 2026-11-02, en escritorio, una columna LISA que sigue el tema (papel con una línea de límite en claro; negro cálido bajo la página en oscuro: `--riel-fondo` y `--riel-borde`), sin vidrio, sin degradado ni sombra larga en la unión con el contenido (Felipe: «el degradado se ve raro»; maqueta «E»); el cajón del celular conserva su vidrio. Con la gota en la fila activa; todos los íconos, también en submódulos; despliegue en cascada; submódulos en una placa apenas hundida y la fila activa una ficha teñida de rojo con su filo, ambas planas (`--bandeja-*` y `--menu-activa-*`); plegar con un botón que flota en el borde, a la altura del logo; plegado con nombre corto bajo cada ícono (A, 84 px) | `marco-vidrio-2026-10/`, `lateral-glass-2026-11/` |
| Cabecera (sede, buscador, Actividad, tema, Demo) | `AppShell.tsx` (`data-cabecera-app`) | En código | C · Dos islas; el buscador se encoge con la cabecera hasta quedar en una lupa | `marco-vidrio-2026-10/` |
| El combo: la sede y todos los demás | `ui/campos.tsx` (`Desplegable`, 7 formas), `UbicacionSwitcher.tsx` | En código | A · Gota viajera | `marco-vidrio-2026-10/` |
| Íconos del marco | `lib/menu-iconos.ts` (trazo 1,5) | En código | A · Se llena al elegir: la pantalla en que estás, con su dibujo lleno de vidrio (34 %) | `iconos-vidrio-2026-11/` |
| Cajón del menú en el celular | `AppShell.tsx` (`cajon-lateral`), `useLateralConElDedo.ts` | En código | A · Hoja con profundidad | `cajon-menu-vidrio-2026-11/` |

## 2. Las hojas

| Pieza | Dónde vive | Estado | Cara | Maqueta |
|---|---|---|---|---|
| La hoja | `ui/Modal.tsx` (275 archivos) | En código | Serena | `modales-vidrio-2026-10/` |
| El cajón lateral | `ui/Cajon.tsx` (14) | En código | Serena, flotante a 12 px | `modales-vidrio-2026-10/` |
| Campos de texto y monto | `ui/campos.tsx` | En código | A · Hundido | `modales-vidrio-2026-10/` |
| Botones | `btn-cayla`, `<Boton>` | En código | A · Gota | `modales-vidrio-2026-10/` |
| Combo (Responsable y los demás) | `ComboResponsable`, `Desplegable`, `ComboBuscable` | En código | A · Pozo y gota | `modales-vidrio-2026-10/` |
| Nota | `nota-cayla` | En código | A · Placa | `modales-vidrio-2026-10/` |
| Aviso | `ui/Aviso.tsx` | En código | B · Lente | `modales-vidrio-2026-10/` |
| Planilla de tallas / paso de cantidad | `ui/PasoCantidad.tsx`, matrices | En código | A · Celdas vivas | `modales-vidrio-2026-10/` |
| Barra apilada | `ui/BarraApilada.tsx` | En código | A · Tubo de vidrio | `modales-vidrio-2026-10/` |
| Lista de prendas | `MiniaturaPrenda`, listas de detalle | En código | B · Lámina de vidrio | `modales-vidrio-2026-10/` |
| Segmento y pestañas de una hoja | `SegmentoDeslizante` | En código | la gota de Mi perfil | `modales-vidrio-2026-10/` |

## 3. Las pantallas (por cuántas veces se ven)

Cada maqueta de esta sección va montada sobre el marco ya elegido, que vive aparte en `docs/maquetas/vidrio-base-2026-10/` junto con
las piezas que ya eligió Felipe y toda pantalla trae (los botones gota, la cabecera A y las tarjetas de cifra A).

| Pieza | Dónde vive | Estado | Cara | Maqueta |
|---|---|---|---|---|
| Cabecera de pantalla | `ui/EncabezadoPagina.tsx` (115 archivos), `ResumenSede` | En código | A · Plana con gotas | `cabecera-vidrio-2026-10/` |
| Tarjetas de cifra | `ui/TarjetaCifra.tsx` (238 usos, 68 archivos) | En código | A · Placa Serena | `cifras-vidrio-2026-10/` |
| Tablas | `ui/Tabla` (75 archivos) + `.fila-cayla` (20 más) | En código (la placa); superpoderes en un piloto | B · Placa Serena, con superpoderes: A · Globo desde la cabecera, responsive de 320 a 1920 px | `tablas-vidrio-2026-10/`, `tabla-superpoderes-2026-10/` |
| Pestañas de sección | `ui/Pestanas` (35 archivos) | En código | A · La gota de Mi perfil | `pestanas-vidrio-2026-10/` |
| Buscador | `ui/Buscador.tsx` | En código | A · Pozo (píldora hundida de 44 px que sube al escribir) | `buscador-filtros-vidrio-2026-10/` |
| Filtros (píldora, «Filtros», limpiar) | `ui/FiltrosPildora.tsx`, `ui/FiltrosPuestos.tsx` | En código | A · Gotas, la puesta ahumada con su ✓ | `buscador-filtros-vidrio-2026-10/` |
| Insignias de estado | `ui/Chip.tsx` (288 archivos) | En código | A · Lente de color | `insignias-vidrio-2026-10/` |
| Estados vacíos | `ui/Vacio.tsx` (217 archivos) | En código | B · Pozo | `vacio-paginas-vidrio-2026-10/` |
| Paginación | `ui/Paginas.tsx` (31 archivos con sus usuarios) | En código | A · Gota en su pozo | `vacio-paginas-vidrio-2026-10/` |
| Globito con número | `ui/Globito.tsx` (15 archivos) | En código | A · Gota | `insignias-vidrio-2026-10/` |
| Avatares | `ui/AvatarPersona.tsx` | En código (el equipo del Inicio) | A · Placa (avatar en lente) | `inicio-lider-vidrio-2026-10/` |
| Barra de avance, apilada, anillo, línea, barras por tiempo | `ui/BarraAvance` (61), `BarraApilada` (39), `Anillo` (16), `Linea` (17) + `Sparkline` (6), `BarrasTiempo` (12) | En código | B · Tinta sobre vidrio y globito B · Ahumado | `graficos-vidrio-2026-11/` (la barra de avance también en `inicio-lider-vidrio-2026-10/`) |
| Casillas e interruptores | `ui/Casilla` (38 archivos), `Interruptor` (19) | En código | A · Pozo y gota (casilla e interruptor) | `casilla-enlaces-vidrio-2026-11/` (el interruptor también en `inicio-lider-vidrio-2026-10/`) |
| Menú «Más», copiar, descargar, imprimir, editar | `ui/MenuAcciones`, `BotonCopiar`, `BotonDescargar`, `BotonImprimir`, `BotonEditar`, `LapizEditar` | En código (los botones con palabra ya eran la gota elegida) | Íconos de fila B · Gota siempre; menú «Más» A · La lista del combo | `acciones-mes-vidrio-2026-11/` |
| Selector de mes | `ui/SelectorMes.tsx` (4 archivos) | En código | B · Gota entera; el mes elegido de la grilla, la gota ahumada | `acciones-mes-vidrio-2026-11/` |
| Títulos de sección y enlaces | `ui/TituloSeccion` (140), `TituloGrupo` (60), `SeparadorDia` (6), `btn-enlace` (181), `EnlaceVer` (45) | En código | B · «Ver» en gota (con la raya de luz) y separador B · Gotas que flotan | `casilla-enlaces-vidrio-2026-11/` (los títulos del Inicio, en `inicio-lider-vidrio-2026-10/`) |
| Avisos de la esquina (éxito, error, advertencia, proceso) | `ui/Avisos.tsx`, `estilos/avisos.css` | En código | B · Lente del tono | `avisos-espera-vidrio-2026-10/` |
| Loader a pantalla completa | `ui/Espera.tsx` | En código | B · Lente sola: la pantalla se esmerila y queda la lente con el colibrí | `avisos-espera-vidrio-2026-10/` |
| «Hay una versión nueva» | `VersionNueva.tsx` | En código (el movimiento no cambia: solo el material) | A · Gota ahumada; con «Dos islas», en el hueco entre las islas o bajo la cabecera | `avisos-espera-vidrio-2026-10/` |
| Barra de abajo del celular (la Isla) | `ui/BarraDeAbajo.tsx` | En código (la del Inicio, con una acción) | A · Gota ahumada | `inicio-lider-vidrio-2026-10/` |
| «Te toca» (los avisos del Inicio) | `app/(app)/page.tsx` (`TeToca`) | En código | A · Placa | `inicio-lider-vidrio-2026-10/` |
| Accesos del Inicio | `app/(app)/page.tsx` (`Accesos`) | En código | A · Gotas | `inicio-lider-vidrio-2026-10/` |
| Íconos del contenido (lucide) | `lib/iconos.ts` (477 archivos) | En código | A · Duotono en los de 20 (y los dibujos grandes); 12, 14 y 16 px, solo línea | `iconos-vidrio-2026-11/` |
| Página · Punto de Venta (`/vender`) | `PuntoDeVenta.tsx`, `PuntoDeVentaCatalogo.tsx`, `PuntoDeVentaTicket.tsx`, `punto-de-venta/TarjetaPrenda.tsx` | En código | La mesa A · Catálogo al aire, ticket en placa; tarjeta de prenda B · Foto al aire | `vender-vidrio-2026-11/` |
| Página · Existencias (Inventario) | `ExistenciasTarjetas.tsx`, `existencias/ParaHoy.tsx`, `FiltrosRapidos.tsx`, `PieTarjeta.tsx` | En código (falta la talla en cero) | Vitrina A · Translúcida, sin desenfoque; tira A · Pozo de vidrio; talla en cero: A · Lente que pide o B · Hueco por llenar, por elegir | `existencias-vidrio-2026-11/` |
| Página · Catálogo ▸ Productos | `ProductosGrilla.tsx`, `ProductosTabla.tsx`, `FiltrosProductos.tsx` | En código | Tarjeta A · Foto al aire con la distribución A · Catálogo de moda (tres renglones bajo la foto); modo A · Pozo y gota | `productos-vidrio-2026-11/` |
| Página · Catálogo ▸ Categorías, Marcas y Atributos (una maqueta: comparten la tarjeta; el buscador con sombra de Marcas, ADR-0373, y «Existe también», ADR-0576, no cambian) | `CategoriasLista`, `MarcasLista`, `AtributosHub`, `atributos/kit.tsx` (`TarjetaAtributo`), `marcas/TarjetaMarca`, `marcas/IndiceLetras` | En código | La tarjeta de un valor A · Muestra al aire; el índice de letras A · Ranura con gotas | `catalogo-vocabulario-vidrio-2026-11/` |
| Página · Catálogo ▸ Liquidación (ADR-0379; la etiqueta es papel térmico y no cambia) | `liquidacion/LiquidacionPantalla`, `PiezaLiquidacionModal` (`.liq-previa`), `estilos/liquidacion.css` (`.liq-cifra-chica`) | En código | La etiqueta en la hoja A · En su bandeja; las cifras chicas del celular A · Placas chicas | `liquidacion-vidrio-2026-11/` |
| Página · Clientes ▸ Fichas (`/clientas`; el plan es de Dany, solo cambia el material) | `ClientasPanel.tsx` (`FilaClienta`) | En código | A · Filas en la placa | `clientes-fichas-vidrio-2026-11/` |
| Página · Colaboradores ▸ Equipo | `ColaboradoresPanel.tsx`, `colaboradores/EquipoLista.tsx` | En código | Rol A · Gotas; «Esperan tu ok» A · Lente ámbar | `colaboradores-vidrio-2026-11/` |
| Página · Configuración (Tiendas) | `configuracion/page.tsx` (kit de Finanzas), `ConfiguracionTiendas.tsx` | En código | Casilla A · Pozo en la celda; al guardarse A · Visto en la celda | `configuracion-vidrio-2026-11/` |
| Página · Recibir mercadería «B» (diseño propio, ADR-0575: el movimiento no cambia, solo el material) | `recepcion-viva.css`, `recepcion-envio/Trayecto.tsx`, `recepcion-conteo/` | En código | Superficies A · Vidrio claro; avances B · Tubo (el movimiento de ADR-0575 no cambia) | `recibir-vidrio-2026-11/` |
| Página · Gestión ▸ Plan del piso (el riel «La percha» y su movimiento no cambian) | `plan-del-piso/page.tsx`, `components/plan-piso/`, `plan-piso.css` | En código | Tarjeta B · Al aire; banda B · Estante de vidrio | `plan-piso-vidrio-2026-11/` |
| Página · Producción ▸ Órdenes (la lista y una orden: la «Ruta viva» de ADR-0570) | `ordenes-lista/OrdenesLista.tsx`, `orden-pagina.css` | En código | Ruta B · Lentes al aire; paso abierto A · Placa con su pico | `ordenes-vidrio-2026-11/` |
| Página · Producción ▸ Insumos (telas y avíos, ADR-0133; «Existe también» antes de crear un tejido, ADR-0576, no cambia) | `InsumosPanel` (`FilaInsumo`, el libro de movimientos), `insumos-taller/NuevaTelaModal` | En código | La fila de un insumo A · Una placa por tela; el libro de movimientos A · Placa con filas | `insumos-vidrio-2026-11/` |
| **El Observatorio** (Inicio del Admin, ADR-0322) | `components/observatorio/`, `estilos/observatorio.css` | En código | B · El mapa al aire, controles B · Ahumado (con contraste 3:1), orbes A · Lente, y los extras: orbes con líquido, cinta de vidrio, anillos de tubo, el Perú de vidrio, gráficos de vidrio, estela del cometa | `observatorio-vidrio-2026-10/` |
| **Caja** (página entera: `app/(app)/caja`, vista «hoy contra ayer») | `CajaAbiertaPanel`, `CajaComparativa`, `BarraCierreCaja` | En código (armada con las piezas elegidas) | Titular A · Ahumado; barra de cierre B · Isla (píldora al centro, sin la bajada); «Cerrar caja» en el ahumado del botón principal (la gota roja hasta el 2026-11-05) | `caja-vidrio-2026-11/` |
| **Historial de ventas** (página entera: `app/(app)/vender/historial`) | `HistorialVentasLista`, `HistorialVentasPulso`, `FiltrosHistorialVentas`, `AvisosHistorial` | En código (armada con las piezas elegidas) | Línea del tiempo B · Solo los días en gota (sin hilo; el día con `SeparadorDia` B); pila de prendas A · Lentes apiladas | `historial-ventas-vidrio-2026-11/` |
| **Comprobantes** (página entera: `app/(app)/vender/comprobantes`, ADR-0124; solo el material, nada de SUNAT ni Lucode) | `FacturacionShell`, `FacturacionCabecera`, `ComprobantesTarjetas` (`TarjetaKpiVidrio`), `ComprobantesPanel` (`DocumentosSunat`); se fue la isla `.tema-vidrio` (`vidrio/comprobantes.css`) | En código | Las tarjetas de indicador A · Lente del tono; los documentos de SUNAT A · Gotas chicas | `comprobantes-vidrio-2026-11/` |
| **Traslados** (página entera: la billetera de pases, ADR-0355) | `components/traslados-pases/`, `estilos/traslados-pases.css` | En código (al vidrio con el mismo movimiento) | Pase B · Lente del tono (perforación recortada de verdad); escenario A · Al aire | `traslados-vidrio-2026-11/` |
| **Cambios y Devoluciones** (páginas enteras: `app/(app)/cambios`, `app/(app)/devoluciones`; una sola maqueta) | `CambiosPanel`, `CambiosFlujo`, `DevolucionesPanel`, `DevolucionesFlujo`, `FlujoGuiado`, `CambioResumen` | En código (medida a 375 px, PL-105) | Paso a paso A · Hilo de vidrio; trae y lleva A · Balanza | `posventa-vidrio-2026-11/` |
| **Apartados** (página entera: `app/(app)/vender/apartados`) | `components/apartados/` (`ApartadosPanel`, `TodosVista`, `EntregarVista`, `ApartarVista`) | En código (medida a 375 px, PL-105) | La hoja A · Al aire; pestañas del celular A · Isla de pestañas | `apartados-vidrio-2026-11/` |
| **Mis compras** (página entera: `app/(app)/compras/mi-plata`, ADR-0559) | `components/mi-plata/` (`MesaDeLaRonda`, `Billetera`, `AccionDelDia`) | En código | Billetera A · Ahumada; «¿Qué hiciste?» A · Gota grande | `mis-compras-vidrio-2026-11/` |
| **Conteo** (página entera: `app/(app)/inventario/conteo` y `conteo/[id]`) | `ConteoVista`, `components/conteo/` (`ContarConteo`, `ListaConteo`, `FilaConteo`, `PasosConteo`) | En código (la planilla conserva su cara de tabla, ADR-0358) | Planilla A · Placa Serena; pasos A · Ranura con gotas (el riel compartido con Recibir) | `conteo-vidrio-2026-11/` |
| **Frescura del piso** (página entera: `app/(app)/gestion/frescura`, ADR-0208; el piloto de /formidable) | `components/frescura/` (`FrescuraPanel`, `FrescuraPiso`, `FrescuraAguja`, `FrescuraFila`) | En código (armada con las piezas elegidas; los colores de los tramos no cambian) | La aguja B · Lentes del tono; por decidir B · Fila hundida | `frescura-vidrio-2026-11/` |
| **Rendimiento** (`app/(app)/rendimiento`, ADR-0219, ADR-0325 y ADR-0610: Felipe aprobó rediseñarla el 2026-11-04, ya no «solo cambia el material») | `components/rendimiento/*`, `app/estilos/vidrio/rendimiento.css` | En código, en local: la placa Serena con el brillo y el filo de «Mi perfil», sin pegar su migración | `rendimiento-superpoderes-2026-11/` |
| **Preguntas del equipo** (página entera: `app/(app)/gestion/preguntas`, ADR-0536) | `asistente/PreguntasEquipo`, `asistente/InformeSemanal` | Maqueta lista | Lo que conviene mejorar (A · Placa con su número en gota, recomendada) | `preguntas-equipo-vidrio-2026-11/` |
| **Movimientos** (página entera: `app/(app)/inventario/movimientos`, ADR-0353) | `MovimientosLista`, `FilaMovimiento`, `components/movimientos/` (`SelloTipo`, `TiposMovimiento`), `estilos/movimientos-sellos.css` | En código (con el mismo movimiento de los sellos) | El sello A · Lente del tono; los tipos A · Placas con su tono | `movimientos-vidrio-2026-11/` |
| **Plan de campaña** (página entera: `app/(app)/compras/plan`, ADR-0349) | `PlanCampana`, `BarraRango`, `CentroDeAvisos` (`estilos/centro-avisos.css`), `CifrasPlan`, `ListaCategorias`; fuera la hoja «Configuración» (ADR-0488) | En código | La barra de rango A · Banda esmerilada; el centro de avisos B · Lentes del tono | `plan-campana-vidrio-2026-11/` |
| **Proveedores** (página entera: `app/(app)/compras/proveedores`, el ranking «C» de 2026-10-26) | `ProveedoresPanel`, `ProveedoresRanking`, `ProveedoresLoQueNoSeVe`, `ProveedoresComparar` | En código | «Qué hacer» A · Placa con filas; «Comparar» A · Placa con columnas | `proveedores-vidrio-2026-11/` |

## 4. Cierre de las maquetas (Felipe 2026-11-02)

Felipe paró aquí la creación de maquetas: **no se dibujan maquetas nuevas de vidrio**. Lo que sigue es la constancia de lo elegido y de
lo que queda, para seguir después con una **auditoría** módulo por módulo (no con más maquetas): a una pantalla que falta se le ponen
las piezas ya elegidas, y solo si algo de ella no calza con ninguna se le pregunta a Felipe.

### 4.1 Las piezas elegidas (lo que se usa al construir algo nuevo)

Todas viven en código y se heredan solas al usar el componente del sistema. Las recetas, en `app/estilos/vidrio/recetas.css`; las
piezas, en `app/estilos/vidrio/*.css`.

| Para… | La pieza (componente o clase) | La receta |
|---|---|---|
| El fondo, el menú y la cabecera | `AppShell` (Aurora, riel de vidrio, dos islas) | `--marco-*` |
| Una hoja o un cajón | `<Modal>` (vidrio Serena; «Mi perfil», `variante="vidrio"`), `<Cajon>` | `--vidrio-hoja-*`, `--cajon-movil-*` |
| Lo que espera un dato (campo, combo, buscador, paso de cantidad, casilla) | `CampoTexto`, `CampoMonto`, `Desplegable`, `ComboBuscable`, `<Buscador>`, `<PasoCantidad>`, `<Casilla>` | el pozo `--pozo-*` |
| Lo que haces (botón secundario, opción elegida, fila activa, «Ver») | `btn-cayla btn-secundario`, `<Boton peso="fantasma">`, `opcion-activa`, `<EnlaceVer>` | la gota `--gota-*`, `--gota-chica-*`, `--gota-clara-*` |
| La acción principal y lo elegido en una fila de píldoras | `btn-primario`, la píldora puesta de un filtro | el ahumado `--ahumado-*`, `--ahumado-denso-*` |
| La acción principal que no se deshace | `<Boton peso="primario">` con `<AvisoNoSeDeshace />` sobre los botones | el ahumado `--ahumado-*` y la lente de `<Aviso tono="error">` |
| Lo peligroso que no es la principal (abre la confirmación, va en una fila o junto a «Guardar») | `btn-peligro`, `<Boton peso="peligro">` | `--gota-peligro-*` con la letra en rojo profundo |
| Un ícono urgente que no se aprieta | `.prov-gota-roja` (Proveedores) | `--gota-roja-*` |
| Lo que explica (nota, fila de datos, lámina) | `nota-cayla`, filas dentro de una hoja | la placa `--placa-*`, `--lamina-*` |
| Cifras, tablas y bloques de una pantalla | `<TarjetaCifra>`, `<Tabla>`, `ResumenSede`, una tarjeta de la columna | la placa Serena `--serena-*` y el hilo `--hilo-fila` |
| Tarjetas que se repiten muchas veces (sin desenfoque, por costo) | la Vitrina de Existencias, los grupos de Recibir | el vidrio claro `--vidrio-claro-*` |
| Un ícono o un estado que se mira a través | `<Chip>` (lente de color), `<Aviso>` (lente), la «i» de una nota | `--lente-*`, `--lente-tono-*`, `--lente-chica-*`, `--lente-estado-*` |
| Avances y gráficos | `<BarraAvance>`, `<BarraApilada>`, `<Anillo>`, `<Linea>`, `<BarrasTiempo>` (fuera de una hoja: tinta sobre vidrio; dentro: tubo) | `--tubo-*`, `--grafico-vidrio-*` |
| Una foto o una muestra que llega al borde | la foto de Posventa, la de un valor de Catálogo | `--foto-al-aire-*`, `--muestra-al-aire-filo` |
| La tarjeta de una prenda con su foto (Felipe 2026-11-03, «A · Vidrio claro») | `.pv-prenda` de Vender y `.prod-tarjeta` de Catálogo ▸ Productos | la placa de prenda `--placa-prenda-*` (50 → 20 %, sin desenfoque) |
| Lo puesto o abierto (filtro elegido, fila abierta, panel desplegado) | se hunde | `--hundido-*` |
| Pestañas, segmento, paginación, índice de letras | `<Pestanas>`, `SegmentoDeslizante`, `<Paginas>` | la gota en su pozo; la ranura `--ranura-*` |
| El sistema que habla (avisos de la esquina, loader, versión nueva) | `avisar.*`, `<EsperaGlobal>`, `VersionNueva` | `--espera-*`, `--version-*` |
| La barra de abajo del celular | `<BarraDeAbajo>` | el ahumado en gota |
| Íconos | lucide (duotono a 20 px; línea a 12, 14 y 16) | — |

### 4.2 Los módulos analizados (con maqueta elegida y en código)

Inicio de la líder · Observatorio (Inicio del Admin) · Ventas: Punto de Venta, Apartados, Caja, Historial, Cambios, Devoluciones,
Comprobantes · Inventario: Existencias, Movimientos, Traslados, Conteo, Recibir mercadería «B» · Catálogo: Productos, Categorías, Marcas,
Atributos, Liquidación · Compras: Plan de campaña, Mis compras, Proveedores · Gestión: Frescura del piso, Plan del piso · Producción:
Órdenes, Insumos · Clientes: Fichas · Colaboradores: Equipo · Configuración: Tiendas. El detalle de cada cara, en las tablas de arriba.

**Con maqueta y sin elegir** (se cerraron así; no se implementan hasta que Felipe elija): Gestión ▸ Preguntas del equipo (`docs/maquetas/preguntas-equipo-vidrio-2026-11/`).

### 4.3 Lo que falta auditar (sin maqueta propia)

Estas pantallas ya llevan el vidrio de todas las piezas del sistema que usan (cabecera, cifras, tablas, pestañas, campos, botones,
insignias, vacíos, hojas): lo que les falta es revisar **sus piezas propias**, una por una, con lo de 4.1.

- **Salud del negocio** (`/global`).
- **Gestión:** Análisis (`/gestion/analisis`, ADR-0357, con su movimiento propio).
- **Clientes:** Avisos (`/clientas/avisos`) y Beneficios (`/clientas/beneficios`).
- **Administración:** Colaboradores ▸ Roles y accesos, Actividad.
- **Las pantallas internas** (una factura, editar un producto, una compra, una orden de insumos): heredan las piezas; se revisan con su módulo.

**Auditadas y en código** (sin maqueta, con las piezas de 4.1):

- **Tienda web** (ADR-0430; `app/estilos/vidrio/tienda-web.css`, 2026-11-02): Resumen, Pedidos, Vitrina, Campañas, Recomendaciones, Tráfico y Conf. Tienda. Cada bloque es la placa Serena; las cartas, la bandeja y las puertas, vidrio claro; lo hueso, el pozo; las opciones de Campañas, gota que se hunde al elegirse; y dentro de una hoja, la lámina (`card-cayla`). El layout del grupo pone `.pantalla-en-vidrio` (`display: contents`). El movimiento no cambia. Se quedan como están, porque muestran lo que ve el cliente: la vista previa de una campaña, el teléfono de Conf. Tienda y la captura del chat de «Editar mensaje». Medida con `tema:auditar` en claro y oscuro, y a 1440 y 375 px, también con datos inventados (la base local no trae pedidos, campañas ni tráfico). Sin probar con datos reales de producción.

- **Configuración ▸ Empresa y tiendas** (`app/estilos/vidrio/vitrinas-sedes.css`, 2026-11-04): «Las vitrinas», `docs/maquetas/empresa-tiendas-vitrinas-2026-11/`: vidrio neutro, un instrumento por dato en una gota y el color de la sede solo en su aro y sus instrumentos. Es el lenguaje que siguen Metas, Dinero, Gastos e Impuestos.
- **Configuración ▸ Metas, Dinero, Gastos e Impuestos** (`app/estilos/vidrio/config-vistas.css`, 2026-11-05): `docs/maquetas/configuracion-cuatro-vistas-2026-11/`. Los tubos por mes, los hilos de cada cobro a su cuenta, la línea del mes y el límite del año, sobre `.vs-liquido`.
- **Configuración** (`app/estilos/vidrio/pantalla-en-vidrio.css`, 2026-11-02; desde el 2026-11-05 sus 5 pestañas viven en las dos entradas de arriba y aquí quedan sus hojas): del kit de Finanzas: el bloque es la placa Serena, el campo y el combo el pozo, y la tabla sin rayado y con su hilo, como `<Tabla>`. La misma pieza la usa Tienda web; un grupo nuevo solo pone `.pantalla-en-vidrio` en su layout. Finanzas sigue en papel (El telar). **Falta:** en las hojas de Configuración, los campos y combos del kit (`fin-control`) siguen en hueso: la regla de las hojas (hoja.css) no los alcanza.

- **Compras** (`.pantalla-en-vidrio` en `app/(app)/compras/layout.tsx`, 2026-11-03): todo el grupo. Lo nuevo: Historial, Revisar compras y Por pagar, las pantallas de una factura y de un proveedor, Órdenes de compra (lista, una orden, nueva, editar, registrar compra, enviar), Apunte de compras, Mis envíos y las pestañas de Plan de campaña (Presupuesto, Cuándo se paga, Calendario, Resultados, Historial). Plan, Mis compras y Proveedores ya tenían su maqueta: lo único que les cambia es que sus bloques de papel pasan a la placa. La pieza respeta la tarjeta de cifra, la tarjeta elegida (se hunde), el filo de color de una tarjeta y el borde de lo que se toca. Medida con `tema:auditar` en 15 rutas, y con datos en un banco local cuyas migraciones llegan hasta el 2026-10-24. **Por decidir (Felipe):** el botón verde sólido «Pagado» de una factura (`CompraDetallePanel.tsx`), que repite la insignia «Pagada» y no calza con ninguna pieza elegida.

- **Producción** (`.pantalla-en-vidrio` en `app/(app)/produccion/layout.tsx` y `app/(app)/ordenes-insumos/layout.tsx`, 2026-11-03): Resumen, Eficiencia, Cotizaciones de maquila, y Abastecimiento (Órdenes de insumos, Proveedores, Facturas de insumos, Recibir y Por pagar). Órdenes e Insumos conservan la cara elegida en su maqueta: la pieza compartida quedó con `:where()` y se importa antes que los archivos de cada pantalla, para que lo elegido le gane siempre. El botón `<BotonCompacto variante="primario">` pasa al ahumado en todo el ERP. Medida con `tema:auditar` en 12 rutas. Sin ver con datos: Facturas de insumos y Por pagar del Taller (ninguna base local tiene facturas de producción), y Recibir con órdenes pendientes.

**Fuera, hasta que Felipe diga** (diseño propio decidido, ver más abajo): la vista rápida de producto, Catálogo ▸ Insignias, Ajustar stock,
la persiana de Caja, Finanzas (El telar, ADR-0493), el login, las guías interactivas, y lo que es papel o cámara.

### 4.4 Cómo se audita lo que falta (sin maquetas)

1. Abrir la pantalla en local, en claro, oscuro, 375 y 1440 px, y buscar lo que todavía es papel sólido, hueso o arena (`card-cayla`,
   `bg-hueso`, `bg-papel`, `border-sand`) o tinta sólida donde una pieza elegida ya responde.
2. Ponerle la pieza de 4.1 que corresponde según el idioma (espera tu dato → pozo; lo haces → gota; explica → placa), en un archivo
   `app/estilos/vidrio/<pantalla>.css` o en la pieza común si es de todo el ERP. Solo recetas; si falta una, se agrega a `recetas.css`.
3. Si una pieza no calza con ninguna de las elegidas, no se inventa: se le muestra a Felipe con la pieza más cercana.
4. Se mide (contraste, nada que se salga a 375 px), se anota aquí y en la bitácora, y se marca «En código».

## Fuera hasta que Felipe diga

Lo que tiene diseño propio decidido: la vista rápida de producto, Catálogo ▸ Insignias, Ajustar stock de Existencias,
la persiana de Caja, El telar de Finanzas, el login «El vuelo vivo», las guías interactivas. Y lo que es papel o cámara: ticket, boleta,
etiqueta, QR y los visores de cámara (ADR-0336, regla 3).

## Antes de la primera pieza en código

1. Medir con `tema:auditar` el contraste sobre el vidrio con una prenda oscura detrás (Existencias).
2. Medir el desenfoque en el Mac mini con un cajón y una hoja abiertos a la vez.
3. Felipe decide si en «Celdas vivas» el − y el + se ven recién al apuntar.
