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
| Menú lateral (abierto, plegado, cajón de grupo) | `AppShell.tsx` (`GrupoLateral`, `CajonGrupo`) | Elegido | B · Riel de vidrio con la gota en la fila activa | `marco-vidrio-2026-10/` |
| Cabecera (sede, buscador, Actividad, tema, Demo) | `AppShell.tsx` (`data-cabecera-app`) | Elegido | C · Dos islas | `marco-vidrio-2026-10/` |
| El combo: la sede y todos los demás | `ui/campos.tsx` (`Desplegable`, 7 formas), `UbicacionSwitcher.tsx` | En maqueta | — | `marco-vidrio-2026-10/` |
| Íconos del marco | `lib/menu-iconos.ts` (trazo 1,5) | Por auditar | — | — |
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

| Pieza | Dónde vive | Estado |
|---|---|---|
| Cabecera de pantalla | `ui/EncabezadoPagina.tsx` | Por auditar |
| Tarjetas de cifra | `ui/TarjetaCifra.tsx` | Por auditar |
| Tablas | `ui/Tabla` + `.fila-cayla` | Por auditar |
| Pestañas de sección | `ui/Pestanas` | Por auditar |
| Buscador | `ui/Buscador.tsx` | Por auditar |
| Filtros (píldora, «Filtros», limpiar) | `ui/FiltrosPildora.tsx`, `ui/FiltrosPuestos.tsx` | Por auditar |
| Insignias de estado | `ui/Chip.tsx` | Por auditar |
| Estados vacíos | `ui/Vacio.tsx` | Por auditar |
| Paginación | `ui/Paginas.tsx` | Por auditar |
| Globito con número | `ui/Globito.tsx` | Por auditar |
| Avatares | `ui/AvatarPersona.tsx` | Por auditar |
| Barra de avance, anillo, línea, barras por tiempo | `ui/BarraAvance`, `Anillo`, `Linea`, `BarrasTiempo` | Por auditar |
| Casillas e interruptores | `ui/Casilla`, `Interruptor` | Por auditar |
| Menú «Más», copiar, descargar, imprimir, editar | `ui/MenuAcciones`, `BotonCopiar`, `BotonDescargar`, `BotonImprimir`, `BotonEditar` | Por auditar |
| Selector de mes | `ui/SelectorMes.tsx` | Por auditar |
| Títulos de sección y enlaces | `ui/TituloSeccion`, `btn-enlace`, `EnlaceVer` | Por auditar |
| Avisos de éxito (esquina) | `ui/Avisos` | Por auditar |
| Loader a pantalla completa | `ui/Espera.tsx` | Por auditar |
| «Hay una versión nueva» | `VersionNueva.tsx` | Por auditar |
| Barra de abajo del celular (la Isla) | `ui/BarraDeAbajo.tsx` | Por auditar |
| Íconos del contenido (lucide) | `lib/iconos.ts` | Por auditar |

## Fuera hasta que Felipe diga

Lo que tiene diseño propio decidido: la vista rápida de producto, Catálogo ▸ Insignias, Ajustar stock de Existencias, el Observatorio,
la persiana de Caja, El telar de Finanzas, el login «El vuelo vivo», las guías interactivas. Y lo que es papel o cámara: ticket, boleta,
etiqueta, QR y los visores de cámara (ADR-0336, regla 3).

## Antes de la primera pieza en código

1. Medir con `tema:auditar` el contraste sobre el vidrio con una prenda oscura detrás (Existencias).
2. Medir el desenfoque en el Mac mini con un cajón y una hoja abiertos a la vez.
3. Felipe decide si en «Celdas vivas» el − y el + se ven recién al apuntar.
