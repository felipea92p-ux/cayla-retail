# fabric-cost-bug-c71cbb (2026-10-31)

- **POR PEGAR en producción:** `supabase/migrations/20261031173000_produccion_telas_cortadas_sin_anotar.sql` (una parte, solo `create or replace function` + permisos; sin `alter`, sin políticas). Sin ella la web no avisa (no se cae).
- Camino de vuelta: `drop function retail.fn_telas_cortadas_sin_anotar(uuid);` (nada la llama salvo la pantalla de Insumos, que tolera su ausencia).
- Abrir el PR con `/abrir-pr`; la casilla «SQL para producción» de la plantilla va con el archivo de arriba.
- Pendiente de Felipe: anotar la tela de la OP-3 («Anotar cuánto quedó»).
