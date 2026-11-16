# 2026-11-16 · Lo que queda de la auditoría responsive

Rama `claude/responsive-audit-optimization-3f6552`. Informe completo: `docs/auditoria-responsive/2026-11-16/INFORME.md`.

## Esperan una decisión de Felipe

- [ ] **El menú lateral en tablet y celular de lado (640–1023 px).** A · plegado a íconos (644 px útiles a 768), B · cajón ☰ como el celular (728), C · como
  hoy (456). Recomendé B: de lado, el riel plegado solo deja ver 4 de las 9 entradas. Demo con capturas en el artefacto «Decisiones responsive del ERP»
  (versión 1, sección «El menú en tablet»). Toca `AppShell.tsx` y `vidrio/marco.css`: tarea en Dynamic.
- [ ] **La regla «una grilla decide por su espacio, no por la ventana» y su prueba** (`lib/grillas-por-contenedor.test.ts`, con la deuda contada que
  solo baja). El prototipo marcó 19 grillas fuera de `<Tabla>` que no caben en su rango. Recomendé hacerla.
- [ ] **Arreglos que los agentes dejaron sin aplicar a propósito** (cambian lógica, el orden de una pantalla o un material elegido mirando):
  - Caja ▸ «Dónde ganas y dónde pierdes»: las etiquetas del eje se pisan (el arreglo cambia el texto del eje).
  - `.historial-placa`, `.kpi-vidrio`, `.cmp-heroe` al vidrio claro (materiales que Felipe eligió).
  - Mi plata ▸ Bandeja: a 1024 px el detalle queda en ~226 px (el arreglo exige mover el `matchMedia` del handler `abrir`).
  - Producción ▸ Ficha de la orden: la barra pegada ocupa mucho bajo 880 px (separar `children` cambia el contrato de `FichaOrden`).
  - Producción ▸ Ruta viva con 7 u 8 pasos: los nodos quedan apretados entre 600 y 800 px de contenedor.
  - Plan del piso ▸ Historia del espacio: fijar la primera columna exige un fondo sólido sobre el vidrio.
  - Inicio: pasar el reparto de dos columnas de `lg:` a `xl:` cambia el orden de la pantalla entre 1024 y 1279.
  - Finanzas ▸ Qué debes: los carriles por sede a 1280–1440 (la letra queda chica en la columna doble).
  - `<Tabla>`: `fila()`/`celda()` alinean por la ventana (`sm:`), no por el contenedor; cambiar la firma de `celda()` toca todas sus llamadas.

## Sin decisión, para hacer

- [ ] **`/milimetro auditar` de las pantallas tocadas antes del PR** (regla «Al milímetro»: el check del PR lo pide). Con 222 archivos, por módulo.
- [ ] **CAYLA Dynamic:** cambian 10 archivos de `app/estilos/vidrio/` y 7 de `components/ui/` (ninguno es `recetas.css` ni el contrato, así que nada viaja
  solo): `hoja.css` (la foto de la hoja con costado ya no tapa el título), `marco.css` (la sede se acorta; nace `--alto-cabecera`), `pantalla.css`
  (paginación y precio en tarjeta angosta), `catalogo.css`, `config-vistas.css`, `fusionar.css`, `historial.css`, `proveedores.css`, `rendimiento.css`,
  `vender.css`; `Modal.tsx` (con acciones, el título baja en el celular), `Cajon.tsx`, `BarraFija.tsx`, `TarjetaCifra.tsx`, `TarjetaKpiVidrio.tsx`,
  `BotonCompacto.tsx`, `lista-actividad.tsx`. Decir en el PR: «queda como tarea allá», con estas piezas.
- [ ] **Usar `--alto-cabecera`** (nuevo, `vidrio/marco.css`) en los números sueltos de alto de cabecera: `FiltrosMovimientos.tsx` (`top-[3.625rem]`),
  `HistorialDinero.tsx`, `HistorialClaure.tsx`, `ExtractoGastos.tsx`, `telar.css`, `vidrio/historial.css`.
- [ ] **Sacar de `CON_TOPE_DE_ANCHO`** `/actividad`, `/buscar`, `/comercial`, `/global` y `/pedidos-no-atendidos` después de mirarlas a 1440 y 1920 px
  (ADR-0462). `/movimientos` ya salió (era una entrada muerta).
- [ ] **Nueva orden de insumos:** aviso de hidratación a 375 px por `autoFocus` distinto entre servidor y cliente (decidir el foco en un efecto).
- [ ] **Lo que sigue bajo 44 px con el dedo** (254 controles a 375, 530 a 768; antes 620 y 913): botones de texto sin clase del sistema (~120),
  enlaces de tarjeta `a.group` (~40), casillas `casilla-input` (~30) y los segmentos de un campo (`segmento-campo__op`). Uno a uno con `tacto:medir`.
- [ ] **Probar en aparatos reales** (iPhone y iPad) lo que el barrido mide en emulación, y la tienda online en su servidor (`tienda-dev`).
- [ ] **Commit y PR con `/abrir-pr`** (nada confirmado al cerrar la sesión).
