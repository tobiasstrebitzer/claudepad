// Rate-limit panel gate.
//
// The panel is most useful with a quota log, and those come from a personal
// tracking tool almost nobody runs - so shipping it to everyone would mostly
// show reverse-engineered budgets with no way to check them. Dev builds keep it
// on; a self-hosted production build can opt in with VITE_QUOTA_PANEL=true.
export const QUOTA_PANEL_ENABLED: boolean =
  import.meta.env.DEV || import.meta.env.VITE_QUOTA_PANEL === 'true'
