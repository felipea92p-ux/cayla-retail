# 2026-10-31 · fabric-cost-bug-c71cbb

- OP-3 (Blusa Hanna, 54 prendas) mostraba «Costo hasta hoy S/ 79.50 de S/ 406.74»: la tela (6 colores × 5.454 m × S/ 10 = S/ 327.24) no contaba porque `movimientos_insumo` no tiene ningún consumo de esa orden. La base no falla: el costo real es lo descontado del estante.
- La cabecera ahora dice «Costo hasta hoy · sin la tela» mientras la tela estimada > 0 y la real = 0 (`cifrasDeLaOrden`). Sin cambio de base.
- Pendiente de decisión de Felipe: ¿descontar la tela al terminar Corte (plan × consumo) en vez de esperar «Anotar cuánto quedó»?
- Causa de fondo (verificada en producción): el Corte se anotó el 30-oct sin tela en el estante; los 6 lotes (`saldo_inicial`) se cargaron el 31-oct. Nadie avisó a quien cargaba la tela.
- Construido: `fn_telas_cortadas_sin_anotar` (migración `20261031173000`, solo lectura, **NO está en producción**) + aviso en Insumos (`lib/telas-cortadas-sin-anotar-reglas.ts`, `getTelasCortadasSinAnotar`, `InsumosPanel`). ADR-0570, actualización 2026-10-31 (a).
- Pruebas: `pnpm pruebas:produccion-telas-cortadas-sin-anotar` 10/10 (base desechable de 1000 migraciones) y 4 mutaciones atrapadas; vitest 762 archivos / 164.990 casos; tsc; knip.
- Falta: pegar la migración en producción (Felipe) y mirar el aviso en el navegador con la función ya pegada. Mientras tanto la web calla sin error.
- Para la OP-3: abrir la orden → «Anotar cuánto quedó» (viene con el plan puesto) → Guardar.
