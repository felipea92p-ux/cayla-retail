# Vidrio líquido — el tablero (ADR-0596)

Felipe decidió el 2026-10-31 rediseñar todo el ERP con el vidrio de «Mi perfil» en su versión **Serena**, componente por componente.
Este archivo es el tablero: qué pieza se auditó, qué cara eligió Felipe, en qué maqueta, y si ya está en el código.

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
| El fondo (lienzo) | `AppShell.tsx` (`bg-crema`), `globals.css` | Elegido | B · Aurora | `marco-vidrio-2026-10/` |
| Menú lateral (abierto, plegado, cajón de grupo) | `AppShell.tsx` (`GrupoLateral`, `CajonGrupo`) | Elegido | B · Riel de vidrio con la gota en la fila activa; todos los íconos, también en submódulos; despliegue en cascada; submódulos en bandeja (A); plegar con un botón que flota en el borde, a la altura del logo; plegado con nombre corto bajo cada ícono (A, 84 px) | `marco-vidrio-2026-10/` |
| Cabecera (sede, buscador, Actividad, tema, Demo) | `AppShell.tsx` (`data-cabecera-app`) | Elegido | C · Dos islas; el buscador se encoge con la cabecera hasta quedar en una lupa | `marco-vidrio-2026-10/` |
| El combo: la sede y todos los demás | `ui/campos.tsx` (`Desplegable`, 7 formas), `UbicacionSwitcher.tsx` | Elegido | A · Gota viajera | `marco-vidrio-2026-10/` |
| Íconos del marco | `lib/menu-iconos.ts` (trazo 1,5) | Por auditar (hoy se usan todos tal cual, también en submódulos) | — | — |
| Cajón del menú en el celular | `AppShell.tsx` (`cajon-lateral`), `useLateralConElDedo.ts` | Por auditar | — | — |

## 2. Las hojas

| Pieza | Dónde vive | Estado | Cara | Maqueta |
|---|---|---|---|---|
| La hoja | `ui/Modal.tsx` (275 archivos) | Elegido | Serena | `modales-vidrio-2026-10/` |
| El cajón lateral | `ui/Cajon.tsx` (14) | Elegido | Serena, flotante a 12 px | `modales-vidrio-2026-10/` |
| Campos de texto y monto | `ui/campos.tsx` | Elegido | A · Hundido | `modales-vidrio-2026-10/` |
| Botones | `btn-cayla`, `<Boton>` | Elegido | A · Gota | `modales-vidrio-2026-10/` |
| Combo (Responsable y los demás) | `ComboResponsable`, `Desplegable`, `ComboBuscable` | Elegido | A · Pozo y gota | `modales-vidrio-2026-10/` |
| Nota | `nota-cayla` | Elegido | A · Placa | `modales-vidrio-2026-10/` |
| Aviso | `ui/Aviso.tsx` | Elegido | B · Lente | `modales-vidrio-2026-10/` |
| Planilla de tallas / paso de cantidad | `ui/PasoCantidad.tsx`, matrices | Elegido | A · Celdas vivas | `modales-vidrio-2026-10/` |
| Barra apilada | `ui/BarraApilada.tsx` | Elegido | A · Tubo de vidrio | `modales-vidrio-2026-10/` |
| Lista de prendas | `MiniaturaPrenda`, listas de detalle | Elegido | B · Lámina de vidrio | `modales-vidrio-2026-10/` |
| Segmento y pestañas de una hoja | `SegmentoDeslizante` | Elegido | la gota de Mi perfil | `modales-vidrio-2026-10/` |

## 3. Las pantallas (por cuántas veces se ven)

Cada maqueta de esta sección va montada sobre el marco ya elegido, que vive aparte en `docs/maquetas/vidrio-base-2026-10/` junto con
las piezas que ya eligió Felipe y toda pantalla trae (los botones gota, la cabecera A y las tarjetas de cifra A).

| Pieza | Dónde vive | Estado | Cara | Maqueta |
|---|---|---|---|---|
| Cabecera de pantalla | `ui/EncabezadoPagina.tsx` (115 archivos), `ResumenSede` | Elegido | A · Plana con gotas | `cabecera-vidrio-2026-10/` |
| Tarjetas de cifra | `ui/TarjetaCifra.tsx` (238 usos, 68 archivos) | Elegido | A · Placa Serena | `cifras-vidrio-2026-10/` |
| Tablas | `ui/Tabla` (75 archivos) + `.fila-cayla` (20 más) | Elegido | B · Placa Serena, con superpoderes: A · Globo desde la cabecera, responsive de 320 a 1920 px | `tablas-vidrio-2026-10/`, `tabla-superpoderes-2026-10/` |
| Pestañas de sección | `ui/Pestanas` (35 archivos) | Elegido | A · La gota de Mi perfil | `pestanas-vidrio-2026-10/` |
| Buscador | `ui/Buscador.tsx` (67 archivos) | En maqueta | — (recomendada: A · Pozo) | `buscador-filtros-vidrio-2026-10/` |
| Filtros (píldora, «Filtros», limpiar) | `ui/FiltrosPildora.tsx`, `ui/FiltrosPuestos.tsx`, `pildora-cayla` | En maqueta | — (recomendada: A · Gotas, la puesta ahumada) | `buscador-filtros-vidrio-2026-10/` |
| Insignias de estado | `ui/Chip.tsx` | Por auditar | — | — |
| Estados vacíos | `ui/Vacio.tsx` | Por auditar | — | — |
| Paginación | `ui/Paginas.tsx` | Por auditar | — | — |
| Globito con número | `ui/Globito.tsx` | Por auditar | — | — |
| Avatares | `ui/AvatarPersona.tsx` | En maqueta (el equipo del Inicio) | — (recomendada: A · Placa) | `inicio-lider-vidrio-2026-10/` |
| Barra de avance, anillo, línea, barras por tiempo | `ui/BarraAvance`, `Anillo`, `Linea`, `BarrasTiempo` | Barra de avance en maqueta; lo demás, por auditar | — (recomendada: A · Tubo) | `inicio-lider-vidrio-2026-10/` |
| Casillas e interruptores | `ui/Casilla`, `Interruptor` | Interruptor en maqueta; la casilla, por auditar | — (recomendada: A · Pozo y gota) | `inicio-lider-vidrio-2026-10/` |
| Menú «Más», copiar, descargar, imprimir, editar | `ui/MenuAcciones`, `BotonCopiar`, `BotonDescargar`, `BotonImprimir`, `BotonEditar` | Por auditar | — | — |
| Selector de mes | `ui/SelectorMes.tsx` | Por auditar | — | — |
| Títulos de sección y enlaces | `ui/TituloSeccion`, `btn-enlace`, `EnlaceVer` | Títulos en maqueta; los enlaces, por auditar | — (recomendada: A · Serif) | `inicio-lider-vidrio-2026-10/` |
| Avisos de éxito (esquina) | `ui/Avisos` | Por auditar | — | — |
| Loader a pantalla completa | `ui/Espera.tsx` | Por auditar | — | — |
| «Hay una versión nueva» | `VersionNueva.tsx` | Por auditar | — | — |
| Barra de abajo del celular (la Isla) | `ui/BarraDeAbajo.tsx` | En maqueta (la del Inicio, con una acción) | — (recomendada: A · Gota ahumada) | `inicio-lider-vidrio-2026-10/` |
| «Te toca» (los avisos del Inicio) | `app/(app)/page.tsx` (`TeToca`) | En maqueta | — (recomendada: A · Placa) | `inicio-lider-vidrio-2026-10/` |
| Accesos del Inicio | `app/(app)/page.tsx` (`Accesos`) | En maqueta | — (recomendada: A · Gotas) | `inicio-lider-vidrio-2026-10/` |
| Íconos del contenido (lucide) | `lib/iconos.ts` | Por auditar | — | — |
| **El Observatorio** (Inicio del Admin, ADR-0322) | `components/observatorio/`, `estilos/observatorio.css` | Elegido (pasado a la sesión que implementa) | B · El mapa al aire, controles B · Ahumado (con contraste 3:1), orbes A · Lente, y los extras: orbes con líquido, cinta de vidrio, anillos de tubo, el Perú de vidrio, gráficos de vidrio, estela del cometa | `observatorio-vidrio-2026-10/` |

## Fuera hasta que Felipe diga

Lo que tiene diseño propio decidido: la vista rápida de producto, Catálogo ▸ Insignias, Ajustar stock de Existencias,
la persiana de Caja, El telar de Finanzas, el login «El vuelo vivo», las guías interactivas. Y lo que es papel o cámara: ticket, boleta,
etiqueta, QR y los visores de cámara (ADR-0336, regla 3).

## Antes de la primera pieza en código

1. Medir con `tema:auditar` el contraste sobre el vidrio con una prenda oscura detrás (Existencias).
2. Medir el desenfoque en el Mac mini con un cajón y una hoja abiertos a la vez.
3. Felipe decide si en «Celdas vivas» el − y el + se ven recién al apuntar.
