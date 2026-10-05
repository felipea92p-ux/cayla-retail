# ADR-0336 — Modo oscuro en todo el ERP: los mismos tokens con `tinta` y `crema` intercambiadas, preferencia del aparato

**Fecha:** 2026-10-05 · **Estado:** en construcción (actividad 1 de 14 hecha) · **Sin migraciones** · **Revierte:** el «sin modo oscuro» de ADR-0116 y de ADR-0169 · **Cumple:** la reserva de `[data-tema="oscuro"]` de ADR-0169 y el «oscuro listo, apagado» de ADR-0322 · **Rama:** `claude/cayla-dark-mode-849463`

## Contexto

ADR-0116 (2026-09-18) y ADR-0169 (2026-09-22) dejaron el modo oscuro fuera **por decisión de Felipe**, y ADR-0169 reservó el nombre `[data-tema="oscuro"]` para cuando entrara. El 2026-10-03 Felipe eligió el Observatorio oscuro del Inicio del Admin («le gusta») y ADR-0322 lo dejó escrito pero apagado, con una pregunta abierta: *cómo se activa en todo el sistema (preferencia de la cuenta o del aparato)*. El 2026-10-05 pidió el modo oscuro para todo el ERP, módulo por módulo y cuenta por cuenta, con el botón entre «Actividad» y el combo de la sede.

El ERP ya está muy tokenizado: `tinta` se usa 5.600 veces (3.917 con opacidad: `text-tinta/65`, `bg-tinta/5`, `border-tinta/10`), `sand` 825, `taupe` 902, `rojo` 1.059, `papel` 312, `hueso` 220. Lo que **no** cambia solo (medido el 2026-10-05): 189 hex en TSX (31 archivos, casi todos colores de dato como muestras de tejido), 61 hex y 63 `rgb()` en CSS (casi todos `rgb(26 26 24 / x)`), 42 `white/black` (la mitad en `BoletaA4` y `ProformaA4`, que son papel) y 76 estilos inline.

## Decisión

1. **El oscuro es la misma paleta con `tinta` y `crema` en los papeles cambiados**, y el resto de los tokens aclarados. El fondo es la tinta de siempre (`#1a1a18`, la que Felipe aprobó en el Observatorio) y el texto, la crema (`#f5f0e8`). Se redefinen **los mismos nombres** bajo `:root[data-tema="oscuro"]` en `app/estilos/tema.css`. Así `bg-tinta text-crema` (el botón primario) se invierte a un botón claro con texto oscuro, `text-tinta/65` sigue siendo «texto secundario» y `border-tinta/10` sigue siendo «línea sutil», sin tocar ninguna pantalla. No se escribió un solo `dark:` en una clase.
2. **Superficies** (elevado = más claro): `crema #1a1a18` < `papel #262624` < `hueso #31302d` < `sand #3d3c38`. **Texto**: `tinta #f5f0e8`, `tinta-60 #b9b2a7`, `taupe #c4a898`. **Acento**: `rojo #e8806a` (el de marca sube de tono para leerse sobre oscuro), `rojo-profundo #f29a86`. **Semáforo**: `verde #9ccb8d`, `ámbar #e4b968`, `pizarra #a2b8cd`. Los métodos de pago y las tres marcas de gráfico, también aclarados (`tema.css`). Las sombras pasan a negro, más abiertas.
3. **Contraste (WCAG 2.1), medido por una prueba, no por un ADR:** todo texto ≥ 4.5:1 sobre crema, papel y hueso; los chips ≥ 4.5:1 sobre su propio tinte; las marcas de gráfico ≥ 3:1 sobre papel y separadas ΔE ≥ 17 (`lib/tema-tokens.test.ts`). El rojo, el plomo y el azul **sobre `sand`** quedan en 4.0–4.4: el mismo caso raro que ya tenía el claro (rojo sobre sand, 4.18); sobre `sand` solo se leen tinta y taupe, y esas dos pasan.
4. **La preferencia es del APARATO, no de la cuenta** (`localStorage`, clave `cayla-tema`). Las cuentas de mostrador son compartidas por tienda: una tablet de TRU puede quedarse en oscuro de noche, y la persona que la usa de día en su teléfono la ve como prefiera. Guardarla por cuenta exigiría una migración en producción por un gusto visual. Si Felipe la quiere por cuenta, es una migración aparte (columna en `colaboradores`/`terminales` y una función que la guarde), y se le pide por separado.
5. **Arranca en CLARO.** Nadie encuentra el ERP distinto el día del despliegue; solo cambia quien pulsa el botón. No se sigue `prefers-color-scheme`: es un cambio de tres líneas si Felipe lo pide.
6. **Sin parpadeo:** un script en el `<head>` de `app/layout.tsx` (`SCRIPT_TEMA_ANTES_DE_PINTAR`, `lib/tema-reglas.ts`) lee lo guardado y pone `data-tema` en `<html>` antes de pintar el cuerpo. Siempre deja un valor puesto y, si el almacenamiento falla (ventana privada), cae al claro sin romper la página. La prueba lo ejecuta contra un documento falso.
7. **El botón** (`components/ui/BotonTema.tsx`) va en la cabecera **entre «Actividad» y la sede**, y lo ve toda cuenta —también una terminal—: no es un módulo ni una pantalla, es una preferencia del aparato (no entra en Roles y accesos, ADR-0306). El ícono (luna en claro, sol en oscuro) lo decide el CSS según el atributo de `<html>`, no React: sale bien desde la primera pintura. `aria-label="Modo oscuro"` fijo y `aria-pressed` con el estado; el `title` dice qué hará el clic. Si otra pestaña del aparato cambia el tema, esta la adopta (evento `storage`).
8. **Movimiento (ADR-0136):** el cambio se funde en ~280 ms con la API de transiciones del navegador (`startViewTransition`), con `--ease-cayla`, sin rebote y no decorativo. Sin ella, o con `prefers-reduced-motion`, es instantáneo.
9. **Solo en pantalla (`@media screen`):** imprimir sale **siempre en claro**, como el papel. Y todo objeto que representa **papel físico** —boleta A4, proforma, ticket térmico, etiqueta de precio, código QR y de barras— lleva `.papel-fijo`, que vuelve a declarar los tokens claros **incluidos los alias del puente shadcn** (un alias ya resuelto en la raíz seguiría oscuro dentro del papel si no se declarara de nuevo; se midió).
10. **Observatorio:** su bloque `[data-tema="oscuro"] .obs` de ADR-0322 asumía tokens sin intercambiar; con el intercambio sus variables claras (`--o-fondo: var(--color-crema)`…) ya salen oscuras, y dejarlo habría invertido dos veces. Se borró el bloque y el tooltip invertido (ya se invierte solo) y se conservó el brillo del cursor, que era un efecto aprobado. **Una diferencia visible:** los estados (urgente, ok, aviso, info) ahora usan los tonos del sistema (más vivos) en lugar de los apagados de la maqueta (mezcla con crema). Si Felipe prefiere los apagados, son 4 líneas en `observatorio.css`.
11. **Regla para pantallas nuevas:** colores solo de tokens (`bg-papel`, `text-tinta`…), nunca un hex, un `rgb()` ni `white/black`. Eso es lo que hace que el oscuro las alcance. El candado de CI (actividad 3) y la sección de CLAUDE.md (actividad 14) lo hacen cumplir.

## Plan (aprobado por Felipe, 2026-10-05; una actividad, un commit)

1. **Núcleo del tema** — hecha: tokens oscuros, `.papel-fijo`, script anti-parpadeo, `BotonTema`, reconciliación del Observatorio, pruebas.
2. Piezas compartidas (`components/ui/*` y clases de `globals.css`). 3. Herramienta `pnpm tema:auditar` y candado de CI. 4. Estructura (lateral, cabecera, Ctrl K, login, error, offline). 5. Inicio y Rendimiento por cuenta. 6–7. Ventas. 8. Catálogo. 9–10. Inventario. 11. Compras y Producción. 12. Finanzas. 13. Clientes, Comercial y Administración. 14. Cierre.

Cada actividad de módulo corre la herramienta con cada cuenta que ve esa pantalla (Líder/Admin, Integrante, Terminal de ventas, Terminal administrativa, un rol personalizado y la vista «CAYLA Global»), revisa las capturas a 1440 px y, donde la regla lo exige (Vender, Cambios, Devoluciones), a 375 px.

## Lo que NO se hace, a propósito

- **Las 3 páginas públicas del club** (`/club/...`) las ve el cliente final y son parte del cartel impreso: se quedan en claro salvo que Felipe diga otra cosa.
- **No se oscurecen las fotos de producto** (tienen fondo blanco por norma): se ven como tarjetas de producto sobre el oscuro.
- **No se cambia `prefers-color-scheme`** ni se agrega un tercer estado «sistema»: un botón de dos estados.
- **Los colores de DATO** (muestras de tejido, el color de una prenda) no cambian: son la prenda, no la interfaz.

## Se rompe si

- Alguien escribe un hex, un `rgb()` o `bg-white` en una pantalla nueva: se queda clara dentro del oscuro.
- Se agrega un token de color al `@theme` sin su versión en `tema.css` o en `.papel-fijo`: `lib/tema-tokens.test.ts` falla.
- Se define un alias de token (como los del puente shadcn) y no se re-declara en `.papel-fijo`: el papel hereda el oscuro por el alias.
- Se pone un bloque oscuro fuera de `@media screen`: imprimir saldría oscuro.
- Una pantalla vuelve a definir su propio bloque `[data-tema="oscuro"]` con los nombres sin intercambiar (como hacía el Observatorio): se invierte dos veces.

## Cómo se verificó (actividad 1)

Pruebas unitarias (`lib/tema-reglas.test.ts`, `lib/tema-tokens.test.ts`; la segunda se probó con tres mutaciones a propósito: papel fijo desincronizado, un token oscuro faltante y un taupe ilegible, y falló en las tres), `tsc` sin errores, ESLint limpio y las 156.030 pruebas de la suite completa en verde. En el navegador contra la base local: clic alterna, recargar conserva el tema, el script corre antes del `<body>`, el bloque oscuro vive dentro de `@media screen`, `.papel-fijo` conserva el claro dentro del oscuro (alias incluidos), sin errores de consola, cabecera correcta con y sin el botón Actividad (Admin/Líder y Integrante) y a 375 px sin desborde.
