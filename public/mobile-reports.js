// Identifica colunas para leitura dos relatórios como cartões em telas estreitas.
// Calendários e cabeçalhos compostos mantêm sua própria rolagem horizontal.
function labelReportTables() {
  document.querySelectorAll('.table-wrap table').forEach(table => {
    const headings = [...(table.tHead?.rows[0]?.cells || [])];
    if (!headings.length || headings.length > 15 || headings.some(cell => cell.colSpan > 1 || cell.rowSpan > 1)) return;
    table.dataset.mobileCards = 'true';
    const labels = headings.map(cell => cell.textContent.trim());
    table.querySelectorAll('tbody tr').forEach(row => {
      [...row.cells].forEach((cell, index) => {
        if (cell.colSpan === 1 && row.cells.length === labels.length) cell.dataset.label = labels[index];
      });
    });
  });
}
let queued = false;
const reportObserver = new MutationObserver(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; labelReportTables(); });
});
const reportRoot = document.getElementById('app-view');
if (reportRoot) reportObserver.observe(reportRoot, { childList: true, subtree: true });
labelReportTables();
