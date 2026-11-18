# 2026-11-06 · Balance: Activo, Pasivo y Patrimonio a la vista

- **Hecho:** el Balance ya no se esconde por una cuenta que difiere: sale con un aviso «Balance provisional» (solo se esconde si falla el arranque, el diario o la ecuación). El informe se lee en tres secciones, Activo, Pasivo y Patrimonio, cada una con su total, y el Patrimonio va línea por línea. Migración `20261107021000` (ADR-0619): los pagos del Taller entran al diario, a la 231 o a la 241, y la 104 vuelve a coincidir.
- **Por qué:** S/ 88 de dos ploteos dejaban a Felipe sin Balance, con la ecuación cuadrada sobre S/ 150 mil, y la pantalla decía «Lo que tienes» y «Lo tuyo» donde él busca Activo, Pasivo y Patrimonio.
- **Cómo verificarlo:** Finanzas ▸ Estados financieros ▸ Balance general: las tres secciones a la vista. Antes de pegar la migración sale el aviso de la 104 por S/ 88; después, sin aviso: banco 289.64 y «Ropa en proceso en el Taller» 88.00 dentro de «Mercadería y telas».
- **Falta:** pegar la migración en producción.
