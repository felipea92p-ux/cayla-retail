# Auditoría al milímetro — Compras reestructurado: Compradores, el detalle de una persona y Todas las compras (PR #2030, ADR-0704) · 2026-11-26 · claude/purchases-history-restructure-d4bb59
Medido: 1440×900 claro (quieto y vivo) · 375×812 claro · 1440 oscuro · foco con teclado (las tres)     Servidor: `http://comprasbanco.localhost:3094` (worktree, contra un banco Supabase propio con todas las migraciones, el seed y datos inventados)
Resumen: 0 graves · 0 medias abiertas (1 corregida) · 3 leves · 3 de piezas que ya existían · 0 decididos a propósito

Cómo se midió: las tres pantallas reales, con sesión del usuario del seed, en un banco propio (`cayla-compradores`, 597xx) con cuatro compradores
inventados (una ronda que no cuadra, una sin plata registrada, una olvidada de 34 días y una cerrada), seis compras con envío y dos comprobantes de la
oficina. Los seis medidores (`milimetro`, `espacio`, `tipografia`, `color`, `movimiento`, `textos`) corrieron enteros, servidos desde la misma página.
Las piezas son las decididas: `<EncabezadoPagina>`, `<TarjetaCifra>`, `<Tabla>`, `<Chip>`, `<AvatarPersona>`, `<Vacio>`, `<Aviso>`, `<Buscador>`,
`<SelectorMesEnUrl>`, `pildora-cayla`, `<Volver>` y `<Modal>`; la bandeja de revisión es `BandejaRevisar` tal cual.

## Graves
Ninguno. 0 textos que fallan contraste en claro ni en oscuro (el primer pase en oscuro dio 1:1 en tres textos del marco: se midió a mitad de la
transición de tema; repetido con 2,5 s de espera, 0). Foco: 33, 33 y 38 controles, todos con anillo y ninguno tapado. 0 blancos < 24 px con mouse,
0 desbordes a 375 px (`scrollWidth` 375), 0 apagados ni ocupados que se pulsan, 0 letras de lectura < 13 px, 0 montos partibles, 0 bucles.

## Medias
1. ~~**La segunda línea del proveedor se cortaba**~~ (papel · prendas · medio · número) en Todas las compras y en «Sus compras» del detalle a 1440 px:
   el número del documento quedaba en «F002-0…». — `components/compras/TodasLasComprasVista.tsx`, `DetalleComprador.tsx` — medido: `textos/medir.js`
   «cortados» (6) — regla: un dato no se esconde con puntos suspensivos — **corregido en este PR**: la línea se parte en dos renglones (`whitespace-normal`);
   medido otra vez: «Sin fallas de texto medibles», a 1440 y a 375 px.

## Leves
1. **Proximidad en la grilla de tarjetas de Compradores:** 16 px entre tarjetas contra 12 px entre el título del grupo y la grilla. — `CompradoresVista.tsx`
   (`gap-4`) — [Práctica] Gestalt — sin cambio: el título queda más cerca de lo suyo, que es lo que importa.
2. **Medios pasos de 6 px** fuera de un control (4 a 1440, 11 a 375), casi todos dentro de `PorDefinir` (pieza que ya existía).
3. **4 cifras proporcionales** en el detalle: dentro de las cifras de la bandeja (pieza que ya existía).

## De piezas que ya existían (no de este PR)
1. **La bandeja de revisión corta sus títulos** («Textiles Andinos SAC · Factura…») en su columna de 25 rem, a 1440 y a 375 px — `components/mi-plata/BandejaRevisar.tsx`.
   Además, en el detalle de una persona cada fila repite su nombre («Rosa Quispe · 24/11 · RC-000002») aunque la página ya es de ella: va a `/formidable`.
2. **La flecha «Volver» mide 42×42** a 375 px con el dedo (pide 44) — `components/ui/Volver.tsx`, pieza única: va a `tacto:medir` / `/unificar`.
3. **`PorDefinir`**: la proximidad de sus filas (29,6 px adentro, 25 px afuera) a 375 px.

## Sin medir
`graficos/medir.js`: las tres pantallas no tienen gráficos. El hover con el dedo (`pointer: coarse`) no se emuló: `tacto:medir` lo cubre.
