# Auditoría al milímetro — «Se lo llevó el líder» en Cuentas y dinero (ADR-0710) · 2026-11-27 · claude/intelligent-elbakyan-89f80b (60506e7ee)
Medido: 1440×900 claro (quieto y vivo) · 1440 oscuro · 375×812 claro con dedo     Servidor: `http://localhost:3010` contra una base privada con las migraciones de `main` y el seed
Resumen: 0 graves · 1 media · 2 leves · 1 de antes de este PR

Qué se midió: las dos piezas que trae el PR, **el botón «Se lo llevó el líder»** (`btn-cayla btn-enlace` en el detalle de una caja fuerte,
`components/finanzas/dinero/PanoramaDinero.tsx`, y en la campana, `CampanaDinero.tsx`) y **la hoja «Registrar movimiento» abierta en «El líder se lleva
efectivo»** (`components/finanzas/CuentasDinero.tsx`, `<Modal tamano="mediana">`, 576 px). Corrieron enteros los medidores de `/milimetro` (con y sin foco),
`/espacio`, `/tipografia`, `/color` (claro y oscuro), `/movimiento` (quieto y vivo) y `/textos`. Los de espacio, letra y color miden la pantalla entera
aunque se les dé una raíz: lo que marcaron fuera de la hoja y del botón es de la pantalla de antes y no va aquí.

Árbol: las dos piezas ya están decididas. El botón es la acción chica de una tarjeta (`btn-enlace`, «Enlaces», ADR-0358), igual que «Registrar el depósito»
a su lado. La hoja es `<Modal>` con el kit de Finanzas (`CampoFin`, `SelectFin`, `InputFin`, `<Boton cargando>`). El PR no dibuja nada a mano.

## Graves
Ninguno.
- Contraste: 0 textos que fallan en la hoja, en claro (15 medidos) y en oscuro (15 medidos); 0 controles bajo 3:1. `tema:auditar` con el escenario nuevo
  `dinero.lider-se-lleva`: **0 hallazgos solo en oscuro**.
- Foco: 8 controles de la hoja con anillo, 0 sin anillo, 0 tapados; el Tab no sale de la hoja.
- Blancos: 0 controles de la hoja bajo 24 px. El botón dibuja 113×21 px, separado de lo demás (excepción de espaciado de WCAG 2.5.8); con el dedo su área
  es de 44 px (`::after` de `tacto.css`, medido a 375 px con puntero táctil).
- Doble guardado: imposible (ver el informe de `/chaos`: ráfaga de 5 clics, una fila).

## Medias
1. **A 375 px, «Cancelar» y «Registrar» quedan bajo el pliegue de la hoja.** — `div.fin-botones` de `RegistrarMovimientoModal` (`CuentasDinero.tsx`) —
   medido: la hoja termina en «Fecha» y la nota de quien firma; los botones aparecen recién al desplazar — regla del repo «Botones a la vista en una hoja larga»
   (`modales.md`: la fila de acciones lleva `pie-hoja-fijo`, y «las demás hojas largas la piden cuando se toquen») — sin prueba — va a `/milimetro`.
   Arreglo de una clase; espera el OK de Felipe.

## Leves
1. **En «De», el saldo de la caja fuerte se corta** a 1440 px: «Caja fuerte · Tienda Trujillo · S/ 1,2…». Justo en esta opción el saldo es lo que dice cuánto
   se puede llevar. — `conSaldo` en `CuentasDinero.tsx`, dos campos por fila (`fin-dos-campos`) — [Práctica] — va a `/textos`. El detalle de la cuenta,
   detrás de la hoja, sí lo muestra entero, y la hoja frena un monto mayor con «En … hay S/ …: no se puede llevar más».
2. **El ejemplo del monto («1,500.00») es mayor que lo que suele haber en una caja fuerte**, y aquí no se puede llevar más que su saldo. — placeholder de
   `mov-monto`, marcado `sugerir-fijo` por ser el formato — regla del repo «Sugerencias coherentes» (ADR-0290) — va a `/sugerir`.

## De antes de este PR (sin severidad aquí)
- El error de un monto vacío («Escribe el monto.») sale en el aviso de la esquina, no bajo su campo. Es la hoja entera: está en la deuda de la guía de foco
  (`lib/guia-de-foco-pantallas.ts`, `components/finanzas/CuentasDinero.tsx`, `PENDIENTE`).

## Sin medir
- `/graficos`: el PR no trae gráficos.
- El estado «error» de un campo en vivo: la hoja no tiene errores por campo (ver arriba).
