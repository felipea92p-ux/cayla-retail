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
| Menú lateral (abierto, plegado, cajón de grupo) | `AppShell.tsx` (`GrupoLateral`, `CajonGrupo`) | En código | B · Riel de vidrio con la gota en la fila activa; todos los íconos, también en submódulos; despliegue en cascada; submódulos en bandeja (A); plegar con un botón que flota en el borde, a la altura del logo; plegado con nombre corto bajo cada ícono (A, 84 px) | `marco-vidrio-2026-10/` |
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
| Avatares | `ui/AvatarPersona.tsx` | Elegido (el equipo del Inicio) | A · Placa (avatar en lente) | `inicio-lider-vidrio-2026-10/` |
| Barra de avance, apilada, anillo, línea, barras por tiempo | `ui/BarraAvance` (61), `BarraApilada` (39), `Anillo` (16), `Linea` (17) + `Sparkline` (6), `BarrasTiempo` (12) | En código | B · Tinta sobre vidrio y globito B · Ahumado | `graficos-vidrio-2026-11/` (la barra de avance también en `inicio-lider-vidrio-2026-10/`) |
| Casillas e interruptores | `ui/Casilla` (38 archivos), `Interruptor` (19) | En código | A · Pozo y gota (casilla e interruptor) | `casilla-enlaces-vidrio-2026-11/` (el interruptor también en `inicio-lider-vidrio-2026-10/`) |
| Menú «Más», copiar, descargar, imprimir, editar | `ui/MenuAcciones`, `BotonCopiar`, `BotonDescargar`, `BotonImprimir`, `BotonEditar`, `LapizEditar` | En código (los botones con palabra ya eran la gota elegida) | Íconos de fila B · Gota siempre; menú «Más» A · La lista del combo | `acciones-mes-vidrio-2026-11/` |
| Selector de mes | `ui/SelectorMes.tsx` (4 archivos) | En código | B · Gota entera; el mes elegido de la grilla, la gota ahumada | `acciones-mes-vidrio-2026-11/` |
| Títulos de sección y enlaces | `ui/TituloSeccion` (140), `TituloGrupo` (60), `SeparadorDia` (6), `btn-enlace` (181), `EnlaceVer` (45) | En código | B · «Ver» en gota (con la raya de luz) y separador B · Gotas que flotan | `casilla-enlaces-vidrio-2026-11/` (los títulos del Inicio, en `inicio-lider-vidrio-2026-10/`) |
| Avisos de la esquina (éxito, error, advertencia, proceso) | `ui/Avisos.tsx`, `estilos/avisos.css` | En código | B · Lente del tono | `avisos-espera-vidrio-2026-10/` |
| Loader a pantalla completa | `ui/Espera.tsx` | En código | B · Lente sola: la pantalla se esmerila y queda la lente con el colibrí | `avisos-espera-vidrio-2026-10/` |
| «Hay una versión nueva» | `VersionNueva.tsx` | En código (el movimiento no cambia: solo el material) | A · Gota ahumada; con «Dos islas», en el hueco entre las islas o bajo la cabecera | `avisos-espera-vidrio-2026-10/` |
| Barra de abajo del celular (la Isla) | `ui/BarraDeAbajo.tsx` | Elegido (la del Inicio, con una acción) | A · Gota ahumada | `inicio-lider-vidrio-2026-10/` |
| «Te toca» (los avisos del Inicio) | `app/(app)/page.tsx` (`TeToca`) | Elegido | A · Placa | `inicio-lider-vidrio-2026-10/` |
| Accesos del Inicio | `app/(app)/page.tsx` (`Accesos`) | Elegido | A · Gotas | `inicio-lider-vidrio-2026-10/` |
| Íconos del contenido (lucide) | `lib/iconos.ts` (477 archivos) | En código | A · Duotono en los de 20 (y los dibujos grandes); 12, 14 y 16 px, solo línea | `iconos-vidrio-2026-11/` |
| Página · Punto de Venta (`/vender`) | `PuntoDeVenta.tsx`, `PuntoDeVentaCatalogo.tsx`, `PuntoDeVentaTicket.tsx`, `punto-de-venta/TarjetaPrenda.tsx` | En código | La mesa A · Catálogo al aire, ticket en placa; tarjeta de prenda B · Foto al aire | `vender-vidrio-2026-11/` |
| Página · Existencias (Inventario) | `ExistenciasTarjetas.tsx`, `existencias/ParaHoy.tsx`, `FiltrosRapidos.tsx`, `PieTarjeta.tsx` | En código (falta la talla en cero) | Vitrina A · Translúcida, sin desenfoque; tira A · Pozo de vidrio; talla en cero: A · Lente que pide o B · Hueco por llenar, por elegir | `existencias-vidrio-2026-11/` |
| Página · Catálogo ▸ Productos | `ProductosGrilla.tsx`, `ProductosTabla.tsx`, `FiltrosProductos.tsx` | En código | Tarjeta A · Foto al aire con la distribución A · Catálogo de moda (tres renglones bajo la foto); modo A · Pozo y gota | `productos-vidrio-2026-11/` |
| Página · Clientes ▸ Fichas (`/clientas`; el plan es de Dany, solo cambia el material) | `ClientasPanel.tsx` (`FilaClienta`) | En código | A · Filas en la placa | `clientes-fichas-vidrio-2026-11/` |
| **El Observatorio** (Inicio del Admin, ADR-0322) | `components/observatorio/`, `estilos/observatorio.css` | En código | B · El mapa al aire, controles B · Ahumado (con contraste 3:1), orbes A · Lente, y los extras: orbes con líquido, cinta de vidrio, anillos de tubo, el Perú de vidrio, gráficos de vidrio, estela del cometa | `observatorio-vidrio-2026-10/` |
| **Caja** (página entera: `app/(app)/caja`, vista «hoy contra ayer») | `CajaAbiertaPanel`, `CajaComparativa`, `BarraCierreCaja` | En código (armada con las piezas elegidas) | Titular A · Ahumado; barra de cierre B · Isla (píldora al centro, sin la bajada); «Cerrar caja» en gota roja | `caja-vidrio-2026-11/` |
| **Historial de ventas** (página entera: `app/(app)/vender/historial`) | `HistorialVentasLista`, `HistorialVentasPulso`, `FiltrosHistorialVentas`, `AvisosHistorial` | En código (armada con las piezas elegidas) | Línea del tiempo B · Solo los días en gota (sin hilo; el día con `SeparadorDia` B); pila de prendas A · Lentes apiladas | `historial-ventas-vidrio-2026-11/` |
| **Traslados** (página entera: la billetera de pases, ADR-0355) | `components/traslados-pases/`, `estilos/traslados-pases.css` | En código (al vidrio con el mismo movimiento) | Pase B · Lente del tono (perforación recortada de verdad); escenario A · Al aire | `traslados-vidrio-2026-11/` |
| **Cambios y Devoluciones** (páginas enteras: `app/(app)/cambios`, `app/(app)/devoluciones`; una sola maqueta) | `CambiosPanel`, `CambiosFlujo`, `DevolucionesPanel`, `DevolucionesFlujo`, `FlujoGuiado`, `CambioResumen` | Elegido (medida a 375 px, PL-105) | Paso a paso A · Hilo de vidrio; trae y lleva A · Balanza | `posventa-vidrio-2026-11/` |
| **Apartados** (página entera: `app/(app)/vender/apartados`) | `components/apartados/` (`ApartadosPanel`, `TodosVista`, `EntregarVista`, `ApartarVista`) | En código (medida a 375 px, PL-105) | La hoja A · Al aire; pestañas del celular A · Isla de pestañas | `apartados-vidrio-2026-11/` |
| **Mis compras** (página entera: `app/(app)/compras/mi-plata`, ADR-0559) | `components/mi-plata/` (`MesaDeLaRonda`, `Billetera`, `AccionDelDia`) | En maqueta (armada con las piezas elegidas) | — (recomendadas: billetera A · Ahumada, «¿Qué hiciste?» A · Gota grande) | `mis-compras-vidrio-2026-11/` |
| **Conteo** (página entera: `app/(app)/inventario/conteo` y `conteo/[id]`) | `ConteoVista`, `components/conteo/` (`ContarConteo`, `ListaConteo`, `FilaConteo`, `PasosConteo`) | En código (la planilla conserva su cara de tabla, ADR-0358) | Planilla A · Placa Serena; pasos A · Ranura con gotas (el riel compartido con Recibir) | `conteo-vidrio-2026-11/` |
| **Frescura del piso** (página entera: `app/(app)/gestion/frescura`, ADR-0208; el piloto de /formidable) | `components/frescura/` (`FrescuraPanel`, `FrescuraPiso`, `FrescuraAguja`, `FrescuraFila`) | En maqueta (armada con las piezas elegidas; los colores de los tramos no cambian) | — (recomendadas: la aguja A · Placas chicas, por decidir A · Gota al canto) | `frescura-vidrio-2026-11/` |

## Fuera hasta que Felipe diga

Lo que tiene diseño propio decidido: la vista rápida de producto, Catálogo ▸ Insignias, Ajustar stock de Existencias,
la persiana de Caja, El telar de Finanzas, el login «El vuelo vivo», las guías interactivas. Y lo que es papel o cámara: ticket, boleta,
etiqueta, QR y los visores de cámara (ADR-0336, regla 3).

## Antes de la primera pieza en código

1. Medir con `tema:auditar` el contraste sobre el vidrio con una prenda oscura detrás (Existencias).
2. Medir el desenfoque en el Mac mini con un cajón y una hoja abiertos a la vez.
3. Felipe decide si en «Celdas vivas» el − y el + se ven recién al apuntar.
