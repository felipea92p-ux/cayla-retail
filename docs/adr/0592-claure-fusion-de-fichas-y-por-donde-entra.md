# ADR-0592 — Cuentas y dinero ▸ CLAURE: la fusión «fichas + por dónde entra» (2026-10-31)

DECIDÍ: rediseñar solo el orden y la cara de la pestaña CLAURE (ninguna función cambia): fichas (la oscura «¿Cuánto le debes?» + una por término, que abren el historial ya filtrado), «Por dónde entra la plata de Claudia» junto a «Pide tu atención», «Cobrado y pagado por semana» junto a «Lo que ya se le pagó», y una ventana «Historial de movimientos» (pestañas por tipo, período día/semana/mes/todo, páginas de 30 o 40, una línea por día). Maqueta: `docs/maquetas/finanzas-claure-rediseno-2026-10/` (vista D, elegida por Felipe).

DESCARTÉ: las tres direcciones por separado (A «La cuenta», B «Estado de cuenta», C «Por dónde entra») porque Felipe quiso las fichas de B y todo C; y los tres bloques de tablas del día por día, porque el historial los reemplaza con el saldo corrido, a costa de perder las columnas IGV y comisión por fila (siguen en las fichas).

SE ROMPE SI: el libro del historial deja de terminar en el mismo saldo que `resumenClaure` (lo vigila `lib/cuenta-claure-vista-reglas.test.ts`), o si una pantalla de Cuentas y dinero pide su propia respuesta grande sin `panorama`.

- Lógica pura en `lib/cuenta-claure-vista-reglas.ts`; piezas del sistema (ADR-0358) donde la maqueta pedía algo ya decidido; estilos `cl-*` en `app/estilos/finanzas-dinero.css`.
- `CabeceraDinero`/`PantallaDinero` ganan `panorama`, `subtitulo` y `acciones` (la cara dibuja su propio resumen).
- Regla propuesta, sin decidir por Felipe: el aviso «Hace N días que no se le paga» (`DIAS_SIN_PAGAR_AVISO = 5`).
