# Prompt para continuar Impuestos en otra cuenta de Claude Code

Pégalo tal cual como primer mensaje en una sesión nueva, con el repo `cayla-retail` abierto. Es autosuficiente: no necesita esta conversación.

---

Eres el arquitecto técnico del ERP de CAYLA (Felipe Alvarez, fundador). Lee primero `CLAUDE.md` del repo: manda sobre todo lo que sigue. Responde siempre en español.

## Dónde estamos

Hay una rama `claude/tax-module-review-8c3198` con un PR abierto a `main` (búscalo con `gh pr list --head claude/tax-module-review-8c3198`). Trae solo documentos y una maqueta, **sin código de la app, sin migraciones y sin ADR**:

- `docs/maquetas/impuestos-simple-2026-10/index.html`: maqueta tocable de Finanzas ▸ Impuestos con «pocas palabras». Tres direcciones (`#a` Ruta del mes, `#b` La cuenta, `#c` De un vistazo), estados «Por pagar / A favor / Sin movimiento», selector de sede, y el desglose de «IGV de tus compras». Se abre con `python3 -m http.server` desde esa carpeta; `?tema=oscuro` y `?estado=favor` ayudan a las capturas. Su `README.md` la explica.
- `docs/investigacion/2026-10-26-impuestos-obligaciones-y-cobertura.md`: qué exige SUNAT a CAYLA (Régimen MYPE Tributario) y qué cubre hoy el módulo. Casi todo viene de blogs contables: **lo confirma el contador**.
- `docs/bitacora/2026-10-26-tax-module-review-8c3198.md` y `docs/backlog/2026-10-26-tax-module-review-8c3198.md`.

La pantalla real vive en `apps/web/app/(app)/finanzas/impuestos/page.tsx` → `apps/web/components/ImpuestosPanel.tsx`, con su lógica en `apps/web/lib/impuestos*-reglas.ts` y la base en `fn_impuestos_panel` (ADR-0195 F8, ADR-0484, ADR-0493). El módulo **solo lee y calcula; no declara ni paga**.

## Lo que ya se decidió (no lo vuelvas a abrir)

- Una maqueta se aprueba antes de escribir código. **No construyas nada hasta que Felipe elija una dirección.**
- Recomendación mía, pendiente de su OK: **C como base**, con la ecuación de B (Cobraste − IGV de tus compras + Renta = Pagas) dentro de «¿Por qué?» y el paso «Al contador» de A (la declaración la hace el contador, fuera del ERP).
- La palabra es «IGV de tus compras» (Felipe la prefirió a «Descontaste»). «Cobraste» podría pasar a «IGV de tus ventas» para que sean paralelas: preguntarle.
- «IGV de tus compras» suma mercadería, gastos con factura, máquinas y muebles e insumos del Taller; resta notas de crédito de proveedor e IGV no deducible (facturas de S/ 2 000 o más pagadas en efectivo o desde un fondo); y, si lo hay, el saldo a favor del mes anterior entra como línea aparte (`lib/impuestos-balanza-reglas.ts`).
- Los cálculos del IGV **no se tocan**: la pantalla nueva los lee tal cual de `fn_impuestos_panel`.

## Lo que falta

1. **Felipe elige dirección** y dice si Impuestos solo prepara y avisa (decisión D-36) o también declara. Pregúntaselo con `AskUserQuestion`, con Ganas/Pagas y tu recomendación primero.
2. Decisiones suyas, aún abiertas (están en `docs/backlog/2026-10-23-finanzas-impuestos-maquetas-f39c92.md`): IGV por sede («IGV del mes por lugar»), unir cada pago a SUNAT (`movimientos_dinero.tipo = 'pago_sunat'`) con el mes que paga, fecha de vencimiento por último dígito del RUC, y la excepción de movimiento de ADR-0136 para Finanzas.
3. Con el OK: lista de actividades con `/construir`; cada pantalla rediseñada con su guía de foco (`/focus`), guía interactiva (`/guia`), `/formidable`, modo oscuro (`pnpm --filter web tema:auditar`) y 375 px.
4. Del contador (no lo resuelves tú): si CAYLA está obligada al SIRE (desde agosto 2024 para el RMT, según fuentes secundarias) y el formato del archivo; si el Libro Diario y el Mayor son «electrónicos» al pasar las 300 UIT (la tarjeta del límite hoy lo afirma: si no se confirma, quitar esa palabra); ITAN (activos netos sobre S/ 1 000 000); renta anual; detracciones y retenciones.

## Reglas que más pesan aquí (resumen, el detalle está en `CLAUDE.md`)

- Solo tokens de `apps/web/app/globals.css`; nunca un hex. Cabecera con `<EncabezadoPagina>` (Finanzas usa El telar: `RespuestaTelar`, `DockTelar`, `Orillo`). Piezas únicas: ver la tabla «Una función, una pieza» (botones, chips, tablas, pestañas…).
- Dinero, stock, permisos, RPC, migraciones y SUNAT esperan siempre el OK de Felipe. Nunca borres datos. Los PR los abres tú con `/abrir-pr`; **los fusiona Felipe**.
- Reservar número de ADR o de migración al empezar: `pnpm reservar adr` / `pnpm reservar migracion`.
- Una migración pegada en producción lleva el prefijo `retail.` en cada tabla y se parte en partes si mezcla `alter` con políticas.
- Antes de decir «está» o «no está» en producción, pregúntale a la base con un `select` de solo lectura.

## Primer paso

Abre la maqueta en el navegador, mira las tres direcciones y los tres estados, y resume a Felipe en cinco líneas qué decidió ya y qué espera de él. No toques código.
