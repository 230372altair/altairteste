import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createReadCoordinator, mapWithConcurrency } from "./report-requests.js";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, ANO_LETIVO } from "./supabase-config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  classes: [],
  coordinations: [],
  dashboardClasses: [],
  dashboardStudents: [],
  dailyRows: [],
  migrationGeneralRows: [],
  migrationGeneralMeta: null,
  absenceAlerts: [],
  students: [],
  quickStudentResults: [],
  attendanceCardResults: [],
  selectedAttendanceCard: null,
  contatosCache: new Map(),
  atendimentos: [],
  serviceStudent: null,
  serviceSearchResults: []
};

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isoMinusDays(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfYear() { return `${ANO_LETIVO}-02-18`; }
function formatNumber(v) { return Number(v || 0).toLocaleString("pt-BR"); }
function pct(value, total) { return total ? `${((Number(value || 0) / Number(total)) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%` : "0,0%"; }
function formatDateBr(value) {
  if (!value) return "—";
  const raw = String(value).slice(0, 10);
  const parts = raw.split("-");
  if (parts.length !== 3) return raw;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}
function formatCompetencia(value) {
  if (!value) return "—";
  const raw = String(value).slice(0, 10);
  const [y,m] = raw.split("-").map(Number);
  if (!y || !m) return raw;
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}
function monthValueFromIso(value) {
  return value ? String(value).slice(0, 7) : "";
}
function escapeHtml(v) {
  return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function toast(message, type = "info") {
  const el = $("#toast");
  if (!el) return alert(message);
  el.textContent = message;
  el.classList.toggle("error", type === "error");
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 4200);
}
let loadingCount = 0;
function setLoading(active) {
  loadingCount = Math.max(0, loadingCount + (active ? 1 : -1));
  const el = $("#loading");
  if (!el) return;
  el.classList.toggle("hidden", loadingCount === 0);
  el.setAttribute("aria-hidden", String(loadingCount === 0));
}
function emptyCell(message, colspan = 1) { return `<tr><td class="empty-cell" colspan="${colspan}">${escapeHtml(message)}</td></tr>`; }
function codeCountsBase() { return { P:0, F:0, FJ:0, A:0, AJ:0, AD:0, JE:0, S:0, SC:0, semLancamento:0, total:0 }; }
function sumCodes(row) {
  return {
    P: Number(row.total_p ?? row.p ?? row.presencas ?? 0),
    F: Number(row.total_f ?? row.f ?? row.faltas ?? 0),
    FJ: Number(row.total_fj ?? row.fj ?? 0),
    A: Number(row.total_a ?? row.a ?? 0),
    AJ: Number(row.total_aj ?? row.aj ?? 0),
    AD: Number(row.total_ad ?? row.ad ?? 0),
    JE: Number(row.total_je ?? row.je ?? 0),
    S: Number(row.total_s ?? row.s ?? 0),
    SC: Number(row.total_sc ?? row.sc ?? 0),
    semLancamento: Number(row.total_sem_lancamento ?? row.sem_lancamento ?? row.semLancamento ?? 0)
  };
}
function addCodes(acc, c) {
  ["P","F","FJ","A","AJ","AD","JE","S","SC","semLancamento"].forEach(k => acc[k] += Number(c[k] || 0));
  acc.total += Number(c.P||0)+Number(c.F||0)+Number(c.FJ||0)+Number(c.A||0)+Number(c.AJ||0)+Number(c.AD||0)+Number(c.JE||0)+Number(c.S||0)+Number(c.SC||0);
  return acc;
}
function rowCountsFromAluno(row) {
  return {
    P: Number(row.total_p || 0),
    F: Number(row.total_f || 0),
    FJ: Number(row.total_fj || 0),
    A: Number(row.total_a || 0),
    AJ: Number(row.total_aj || 0),
    AD: Number(row.total_ad || 0),
    JE: Number(row.total_je || 0),
    S: Number(row.total_s || 0),
    SC: Number(row.total_sc || 0),
    semLancamento: Number(row.total_sem_lancamento || 0)
  };
}
function totalsFromAlunoRows(rows) {
  const total = { students: rows.length, ...codeCountsBase() };
  rows.forEach(r => addCodes(total, rowCountsFromAluno(r)));
  return total;
}
function selectedOptionData(selector, attr) {
  const el = $(selector);
  return el?.selectedOptions?.[0]?.dataset?.[attr] || "";
}
function csvDownload(filename, rows, columns) {
  if (!rows?.length) return toast("Gere o relatório antes de exportar.", "error");
  const q = (v) => `"${String(v ?? "").replaceAll('"','""')}"`;
  const text = "\ufeff" + columns.map(c => q(c.title)).join(";") + "\n" + rows.map(r => columns.map(c => q(typeof c.value === "function" ? c.value(r) : r[c.value])).join(";")).join("\n");
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function navGroupForView(view) {
  if (["students", "new-service", "history", "attendance-card"].includes(view)) return "students";
  if (view === "absence-alert") return "apoia";
  if (["admin", "admin-details", "migration-diagnostic", "migration-audit-general"].includes(view)) return "admin";
  return "";
}
function setView(view) {
  $$(".view-section").forEach(sec => sec.classList.toggle("hidden", sec.id !== `${view}-section`));
  $$(".nav-button").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
  const group = navGroupForView(view);
  $$(".portal-nav-group").forEach(el => el.classList.toggle("active", !!group && el.dataset.navGroup === group));
  $$(".portal-submenu [data-view]").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function setupNavigation() {
  $$(".nav-button[data-view], .portal-submenu [data-view]").forEach(btn => btn.addEventListener("click", () => abrirVisao(btn.dataset.view)));
  $$('[data-open-view]').forEach(btn => btn.addEventListener("click", () => abrirVisao(btn.dataset.openView)));
  $("#logout-button")?.addEventListener("click", sairDoPortal);
}

async function abrirVisao(view) {
  setView(view);
  const carregar = {
    dashboard: renderDashboard,
    "daily-attendance": renderDaily,
    sectors: renderSectors,
    history: renderHistory,
    admin: renderAdmin
  }[view];
  if (carregar) {
    try { await carregar(); }
    catch (error) { toast(`Erro ao carregar esta página: ${error.message}`, "error"); }
  }
}

const coordinateRead = createReadCoordinator(6);
const reportReads = new Set([
  "fn_alunos_por_turma_parametrizado", "fn_consultar_contatos_aluno_2026",
  "fn_espelho_frequencia_aluno", "fn_frequencia_diaria_parametrizada",
  "fn_historico_atendimentos_apoia", "fn_iee_painel_resumo_turmas",
  "fn_painel_cache_frequencia", "fn_ranking_turmas_faltas_parametrizado",
  "fn_relatorio_apoia_parametrizado", "fn_ultimas_atualizacoes_frequencia"
]);
async function rpc(name, args) {
  const request = async () => {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw error;
    return data || [];
  };
  return reportReads.has(name) ? coordinateRead(name, args, request) : request();
}

// Registro manual de atendimentos APOIA pela Edge Function protegida.
window.registrarAtendimentoApoiaManual = async function registrarAtendimentoApoiaManual(payload, token) {
  const chave = String(token || "").trim();
  if (!chave) throw new Error("Informe a chave de autorização para salvar o atendimento.");
  const response = await fetch(`${SUPABASE_URL}/functions/v1/registrar-atendimento-apoia`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-iee-atendimento-token": chave
    },
    body: JSON.stringify(payload || {})
  });
  let body = null;
  try { body = await response.json(); } catch { body = null; }
  if (!response.ok || !body?.ok) {
    throw new Error(body?.message || body?.erro || `Falha ao salvar atendimento (HTTP ${response.status}).`);
  }
  return body;
};


// Recarrega o histórico consolidado do estudante após um novo atendimento manual.
window.obterHistoricoApoiaAtualizado = async function obterHistoricoApoiaAtualizado(matricula, dataFim) {
  const mat = String(matricula || "").trim();
  if (!mat) return { rows: [], html: `<div class="history-print-empty">Matrícula não informada.</div>` };
  const registros = await rpc("fn_historico_atendimentos_apoia", {
    p_ano_letivo: ANO_LETIVO,
    p_matricula: mat,
    p_turma: "",
    p_nome: "",
    p_data_inicio: `${ANO_LETIVO}-01-01`,
    p_data_fim: dataFim || todayIso()
  });
  const rows = Array.isArray(registros)
    ? registros
        .filter(r => String(r.matricula || "") === mat)
        .sort((a,b) => {
          const ca = String(a.competencia || "");
          const cb = String(b.competencia || "");
          if (ca !== cb) return ca.localeCompare(cb);
          return String(a.data_atendimento || "").localeCompare(String(b.data_atendimento || ""));
        })
    : [];
  return { rows, html: renderHistoricoAtendimentosPrint(rows) };
};

function firstNumber(row, keys, fallback = 0) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && value !== "" && !Number.isNaN(Number(value))) return Number(value);
  }
  return fallback;
}

function normalizeDashboardRow(row) {
  const totalLancamentos = firstNumber(row, ["total_lancamentos", "total_classificado", "total", "lancamentos"], 0);
  const totalF = firstNumber(row, ["total_f", "f", "faltas", "total_faltas", "total_ausencias_f", "faltas_em_periodo"], 0);
  const totalFj = firstNumber(row, ["total_fj", "fj", "faltas_justificadas", "total_faltas_justificadas"], 0);
  const totalA = firstNumber(row, ["total_a", "a", "atrasos"], 0);
  const totalAj = firstNumber(row, ["total_aj", "aj", "atrasos_justificados"], 0);
  const totalAd = firstNumber(row, ["total_ad", "ad", "atendimento_domiciliar"], 0);
  const totalJe = firstNumber(row, ["total_je", "je", "justificado_escola"], 0);
  const totalS = firstNumber(row, ["total_s", "s", "suspensoes"], 0);
  const totalSc = firstNumber(row, ["total_sc", "sc", "sem_computar"], 0);
  let totalP = firstNumber(row, ["total_p", "p", "presencas", "total_presencas"], 0);
  if (!totalP && totalLancamentos) {
    totalP = Math.max(0, totalLancamentos - totalF - totalFj - totalA - totalAj - totalAd - totalJe - totalS - totalSc);
  }
  return {
    ...row,
    total_alunos_ativos: firstNumber(row, ["total_alunos_ativos", "totalAlunosAtivos", "alunos_ativos", "alunos"], 0),
    total_p: totalP,
    total_f: totalF,
    total_fj: totalFj,
    total_a: totalA,
    total_aj: totalAj,
    total_ad: totalAd,
    total_je: totalJe,
    total_s: totalS,
    total_sc: totalSc,
    total_lancamentos: totalLancamentos || (totalP + totalF + totalFj + totalA + totalAj + totalAd + totalJe + totalS + totalSc),
    total_sem_lancamento: firstNumber(row, ["total_sem_lancamento", "sem_lancamento", "semLancamento"], 0)
  };
}

async function carregarDashboardConsolidadoFallback(sector = "", turma = "") {
  const data = await rpc("fn_iee_painel_resumo_turmas", {});
  return (data || [])
    .filter(r => !sector || String(r.coordenacao_codigo || r.setorId || r.coordenacao_nome || r.setor || "") === String(sector) || String(r.coordenacao_nome || r.setor || "").toLowerCase().includes(String(sector).toLowerCase()))
    .filter(r => !turma || String(r.turma || "") === String(turma))
    .map(normalizeDashboardRow);
}

async function getContatoAluno(matricula, turma = "") {
  const key = `${matricula || ""}::${turma || ""}`;
  if (state.contatosCache.has(key)) return state.contatosCache.get(key);
  if (!matricula) return null;
  try {
    const data = await rpc("fn_consultar_contatos_aluno_2026", {
      p_ano_letivo: ANO_LETIVO,
      p_turma: turma || "",
      p_matricula: String(matricula || ""),
      p_nome: ""
    });
    const contato = data?.[0] || null;
    state.contatosCache.set(key, contato);
    return contato;
  } catch (e) {
    console.warn("Contato do aluno não disponível.", e);
    state.contatosCache.set(key, null);
    return null;
  }
}
function contatoValor(contato, campo) {
  const v = contato?.[campo];
  return v === null || v === undefined || String(v).trim() === "" ? "—" : String(v);
}
function resumoTelefonesContato(contato) {
  const vals = [contato?.telefone_1, contato?.telefone_2, contato?.telefone_3, contato?.celular, contato?.residencial, contato?.comercial]
    .map(v => String(v || "").trim())
    .filter(Boolean);
  return vals.length ? [...new Set(vals)].join(" / ") : "—";
}
function enderecoContato(contato) {
  const partes = [contato?.endereco_residencial, contato?.complemento, contato?.bairro, contato?.municipio_residencia, contato?.cep]
    .map(v => String(v || "").trim())
    .filter(Boolean);
  return partes.length ? partes.join(" - ") : "—";
}
function renderContatoPainel(contato) {
  const root = $("#card-contact-section");
  if (!root) return;
  root.innerHTML = `<div class="identity-item"><span>Telefone(s)</span><strong>${escapeHtml(resumoTelefonesContato(contato))}</strong></div>
    <div class="identity-item"><span>E-mail</span><strong>${escapeHtml(contatoValor(contato, "email"))}</strong></div>
    <div class="identity-item wide"><span>Mãe / responsável</span><strong>${escapeHtml(contatoValor(contato, "nome_mae"))}</strong></div>
    <div class="identity-item"><span>CPF da mãe</span><strong>${escapeHtml(contatoValor(contato, "cpf_mae"))}</strong></div>
    <div class="identity-item wide"><span>Pai / responsável</span><strong>${escapeHtml(contatoValor(contato, "nome_pai"))}</strong></div>
    <div class="identity-item"><span>CPF do pai</span><strong>${escapeHtml(contatoValor(contato, "cpf_pai"))}</strong></div>
    <div class="identity-item full"><span>Endereço residencial</span><strong>${escapeHtml(enderecoContato(contato))}</strong></div>`;
}
function contatoPrintBlock(contato) {
  return `<div class="pc-contact">
    <div><span>Telefone(s)</span><strong>${escapeHtml(resumoTelefonesContato(contato))}</strong></div>
    <div><span>E-mail</span><strong>${escapeHtml(contatoValor(contato, "email"))}</strong></div>
    <div><span>Mãe / responsável</span><strong>${escapeHtml(contatoValor(contato, "nome_mae"))}</strong></div>
    <div><span>CPF mãe</span><strong>${escapeHtml(contatoValor(contato, "cpf_mae"))}</strong></div>
    <div><span>Pai / responsável</span><strong>${escapeHtml(contatoValor(contato, "nome_pai"))}</strong></div>
    <div><span>CPF pai</span><strong>${escapeHtml(contatoValor(contato, "cpf_pai"))}</strong></div>
    <div class="wide"><span>Endereço</span><strong>${escapeHtml(enderecoContato(contato))}</strong></div>
  </div>`;
}
function contatoCouncilBlock(contato) {
  return `<h2>Contatos e responsáveis</h2><div class="grid"><div><span>Telefone(s)</span><strong>${escapeHtml(resumoTelefonesContato(contato))}</strong></div><div><span>E-mail</span><strong>${escapeHtml(contatoValor(contato, "email"))}</strong></div><div><span>Mãe / responsável</span><strong>${escapeHtml(contatoValor(contato, "nome_mae"))}</strong></div><div><span>CPF da mãe</span><strong>${escapeHtml(contatoValor(contato, "cpf_mae"))}</strong></div><div><span>Pai / responsável</span><strong>${escapeHtml(contatoValor(contato, "nome_pai"))}</strong></div><div><span>CPF do pai</span><strong>${escapeHtml(contatoValor(contato, "cpf_pai"))}</strong></div></div><h2>Endereço residencial</h2><p>${escapeHtml(enderecoContato(contato))}</p>`;
}
async function loadBase() {
  const data = (await rpc("fn_iee_painel_resumo_turmas", {}))
    .sort((a, b) => String(a.coordenacao_codigo || "").localeCompare(String(b.coordenacao_codigo || ""), "pt-BR")
      || String(a.turma || "").localeCompare(String(b.turma || ""), "pt-BR", { numeric: true }));
  state.classes = (data || []).map(row => ({
    ...row,
    id: String(row.turma || row.codigo || row.id || ""),
    turma: String(row.turma || row.codigo || row.id || ""),
    setorId: String(row.coordenacao_codigo || row.setor_id || ""),
    setor: String(row.coordenacao_nome || row.setor || ""),
    turno: String(row.turno || ""),
    totalAlunosAtivos: Number(row.total_alunos_ativos ?? row.alunos_ativos ?? row.qtd_alunos_ativos ?? 0)
  })).filter(r => r.turma);

  const seen = new Map();
  state.classes.forEach(c => {
    if (!seen.has(c.setorId)) seen.set(c.setorId, { id: c.setorId, label: c.setor || c.setorId, turno: c.turno });
  });
  state.coordinations = [...seen.values()].sort((a,b)=>a.label.localeCompare(b.label,"pt-BR",{numeric:true}));
}
function fillSectorSelect(selector, placeholder="Todos os setores autorizados") {
  const el = $(selector); if (!el) return;
  el.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + state.coordinations.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.label)}</option>`).join("");
}
function fillClassSelect(selector, sectorSelector, placeholder="Todas as turmas autorizadas") {
  const el = $(selector); if (!el) return;
  const sector = sectorSelector ? ($(sectorSelector)?.value || "") : "";
  const rows = state.classes.filter(c => !sector || c.setorId === sector);
  el.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + rows.map(c => `<option value="${escapeHtml(c.turma)}">${escapeHtml(c.turma)} — ${escapeHtml(c.setor)}</option>`).join("");
}
function setupSelectors() {
  const sectors = ["#dashboard-sector-filter", "#daily-sector-filter", "#absence-sector-filter", "#sector-view-filter", "#students-sector-filter", "#quick-sector-filter", "#card-sector-filter", "#history-sector-filter", "#service-sector-filter"];
  sectors.forEach(s => fillSectorSelect(s));
  fillMigrationDiagnosticClasses();

  fillClassSelect("#dashboard-class-filter", "#dashboard-sector-filter");
  fillClassSelect("#daily-class-filter", "#daily-sector-filter");
  fillClassSelect("#absence-class-filter", "#absence-sector-filter");
  fillClassSelect("#students-class-filter", "#students-sector-filter", "Selecione uma turma");
  fillClassSelect("#card-class-filter", "#card-sector-filter");
  fillClassSelect("#history-class-filter", "#history-sector-filter");
  fillClassSelect("#service-class-filter", "#service-sector-filter", "Selecione uma turma");

  [["#dashboard-sector-filter","#dashboard-class-filter"],["#daily-sector-filter","#daily-class-filter"],["#absence-sector-filter","#absence-class-filter"],["#students-sector-filter","#students-class-filter"],["#card-sector-filter","#card-class-filter"],["#history-sector-filter","#history-class-filter"],["#service-sector-filter","#service-class-filter"]].forEach(([s,c]) => {
    $(s)?.addEventListener("change", () => {
      fillClassSelect(c, s, c.includes("students") ? "Selecione uma turma" : "Todas as turmas autorizadas");
      if (c === "#dashboard-class-filter") clearStudentSelect("#dashboard-student-list", "Selecione uma turma para carregar alunos");
      if (c === "#daily-class-filter") clearStudentSelect("#daily-student-list", "Selecione uma turma para carregar alunos");
      if (c === "#students-class-filter") clearStudentSelect("#students-student-list", "Selecione uma turma para carregar alunos");
      if (c === "#absence-class-filter") clearStudentSelect("#absence-student-list", "Selecione uma turma");
      if (c === "#card-class-filter") clearStudentSelect("#card-student-list", "Selecione uma turma para carregar a relação");
      if (c === "#history-class-filter") clearStudentSelect("#history-student-list", "Selecione uma turma para carregar alunos");
      if (c === "#service-class-filter") clearStudentSelect("#service-student-list", "Selecione uma turma para carregar alunos");
    });
  });
}
function clearStudentSelect(selector, placeholder = "Selecione uma turma") {
  const el = $(selector);
  if (!el) return;
  el.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>`;
  el.disabled = true;
}
function setStudentSelectLoading(selector) {
  const el = $(selector);
  if (!el) return;
  el.innerHTML = `<option value="">Carregando alunos...</option>`;
  el.disabled = true;
}
async function loadStudentsIntoSelect(selector, turma, sector = "", { status = "ATIVO", placeholder = "Selecione um aluno" } = {}) {
  const el = $(selector);
  if (!el) return [];
  if (!turma) {
    clearStudentSelect(selector, "Selecione uma turma");
    return [];
  }
  setStudentSelectLoading(selector);
  try {
    const rows = await rpc("fn_alunos_por_turma_parametrizado", {
      p_ano_letivo: ANO_LETIVO,
      p_coordenacao_codigo: sector || "",
      p_turma: turma || "",
      p_status: status,
      p_data_inicio: startOfYear(),
      p_data_fim: todayIso()
    });
    el.innerHTML = `<option value="">${escapeHtml(placeholder)}</option>` + rows.map(r => {
      const matricula = escapeHtml(r.matricula || "");
      const nome = escapeHtml(r.aluno_nome || "Aluno sem nome");
      const situacao = r.status && r.status !== "ATIVO" ? ` — ${escapeHtml(r.status)}` : "";
      return `<option value="${matricula}" data-turma="${escapeHtml(r.turma || turma)}" data-nome="${nome}">${nome} — ${matricula}${situacao}</option>`;
    }).join("");
    el.disabled = rows.length === 0;
    if (!rows.length) el.innerHTML = `<option value="">Nenhum aluno localizado na turma</option>`;
    return rows;
  } catch (e) {
    el.innerHTML = `<option value="">Erro ao carregar alunos</option>`;
    el.disabled = true;
    toast(`Erro ao carregar alunos da turma ${turma}: ${e.message}`, "error");
    return [];
  }
}
async function handleCardClassChange() {
  const turma = $("#card-class-filter")?.value || "";
  const sector = $("#card-sector-filter")?.value || "";
  await loadStudentsIntoSelect("#card-student-list", turma, sector, { status: "TODOS", placeholder: "Selecione um aluno da turma" });
  const btn = $("#card-generate-selected");
  if (btn) btn.disabled = !turma;
}
async function handleAbsenceClassChange() {
  const turma = $("#absence-class-filter")?.value || "";
  const sector = $("#absence-sector-filter")?.value || "";
  await loadStudentsIntoSelect("#absence-student-list", turma, sector, { status: "ATIVO", placeholder: "Todos os alunos da turma" });
}
async function handleDashboardClassChange() {
  const turma = $("#dashboard-class-filter")?.value || "";
  const sector = $("#dashboard-sector-filter")?.value || "";
  await loadStudentsIntoSelect("#dashboard-student-list", turma, sector, { status: "ATIVO", placeholder: "Todos os alunos da turma" });
}
async function handleDailyClassChange() {
  const turma = $("#daily-class-filter")?.value || "";
  const sector = $("#daily-sector-filter")?.value || "";
  await loadStudentsIntoSelect("#daily-student-list", turma, sector, { status: "ATIVO", placeholder: "Todos os alunos da turma" });
}
async function handleStudentsClassChange() {
  const turma = $("#students-class-filter")?.value || "";
  const sector = $("#students-sector-filter")?.value || "";
  await loadStudentsIntoSelect("#students-student-list", turma, sector, { status: "TODOS", placeholder: "Todos os alunos da turma" });
  if (turma) await loadClassStudents();
}
async function handleHistoryClassChange() {
  const turma = $("#history-class-filter")?.value || "";
  const sector = $("#history-sector-filter")?.value || "";
  await loadStudentsIntoSelect("#history-student-list", turma, sector, { status: "TODOS", placeholder: "Todos os alunos da turma" });
}

function atendimentoDados(row) {
  return row?.dados_completos && typeof row.dados_completos === "object" ? row.dados_completos : {};
}
function atendimentoEndereco(row) {
  const d = atendimentoDados(row);
  const e = d.endereco || {};
  return [e.logradouro, e.complemento, e.bairro, e.cep, e.municipio].filter(Boolean).join(" · ") || "—";
}
function atendimentoContatos(row) {
  const d = atendimentoDados(row);
  const c = d.contatos || {};
  return [c.telefone_1, c.telefone_2, c.celular, c.residencial, c.comercial].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(" / ") || "—";
}
function atendimentoResponsaveis(row) {
  const d = atendimentoDados(row);
  const r = d.responsaveis || {};
  return [r.mae ? `Mãe/responsável: ${r.mae}` : "", r.pai ? `Pai/responsável: ${r.pai}` : ""].filter(Boolean).join(" · ") || "—";
}
function truncateText(value, max = 95) {
  const text = String(value || "").trim();
  if (!text) return "—";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
function updateHistorySummary(rows) {
  const matriculas = new Set(rows.map(r => String(r.matricula || "")).filter(Boolean));
  const comps = rows.map(r => r.competencia).filter(Boolean).sort();
  $("#history-total-registros") && ($("#history-total-registros").textContent = formatNumber(rows.length));
  $("#history-total-alunos") && ($("#history-total-alunos").textContent = formatNumber(matriculas.size));
  $("#history-primeira-competencia") && ($("#history-primeira-competencia").textContent = comps.length ? formatCompetencia(comps[0]) : "—");
  $("#history-ultima-competencia") && ($("#history-ultima-competencia").textContent = comps.length ? formatCompetencia(comps[comps.length - 1]) : "—");
}
function historyMonthTitle(value) {
  const text = formatCompetencia(value);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "—";
}
function historyRowsByStudent(rows) {
  const map = new Map();
  rows.forEach((row, index) => {
    const key = String(row.matricula || row.estudante || index);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push({ ...row, __historyIndex: index });
  });
  return map;
}
function renderHistoryTable(rows) {
  state.atendimentos = rows;
  updateHistorySummary(rows);
  const panel = $("#history-student-panel");
  if (!panel) return;

  if (!rows.length) {
    $("#history-count-label") && ($("#history-count-label").textContent = "Nenhum registro localizado.");
    panel.innerHTML = `<div class="empty-cell history-empty-state">Nenhum histórico de observações foi localizado para os filtros selecionados.</div>`;
    return;
  }

  const groups = historyRowsByStudent(rows);
  $("#history-count-label") && ($("#history-count-label").textContent = `${formatNumber(groups.size)} aluno(s) · ${formatNumber(rows.length)} registro(s) histórico(s)`);

  if (groups.size > 1) {
    panel.innerHTML = `
      <div class="history-student-browser">
        ${[...groups.values()].map(studentRows => {
          const ordered = [...studentRows].sort((a,b) => String(a.competencia || "").localeCompare(String(b.competencia || "")));
          const first = ordered[0] || {};
          const last = ordered[ordered.length - 1] || {};
          const obs = [...ordered].reverse().find(r => String(r.observacao || "").trim())?.observacao || "Sem observação registrada.";
          return `
            <article class="history-student-card">
              <div class="history-student-card-head">
                <div>
                  <strong>${escapeHtml(first.estudante || "—")}</strong>
                  <span>Matrícula ${escapeHtml(first.matricula || "—")} · Turma ${escapeHtml(last.turma || first.turma || "—")}</span>
                </div>
                <span class="history-month-count">${ordered.length} registro(s)</span>
              </div>
              <p>${escapeHtml(truncateText(obs, 190))}</p>
              <div class="history-student-card-footer">
                <small>${escapeHtml(historyMonthTitle(first.competencia))} → ${escapeHtml(historyMonthTitle(last.competencia))}</small>
                <button class="button primary compact-button" data-history-student="${escapeHtml(first.matricula || "")}" type="button">Ver histórico</button>
              </div>
            </article>`;
        }).join("")}
      </div>`;

    $$('[data-history-student]').forEach(btn => btn.addEventListener("click", async () => {
      const matricula = btn.dataset.historyStudent || "";
      if (!matricula) return;
      if ($("#history-search")) $("#history-search").value = matricula;
      if ($("#history-student-list")) $("#history-student-list").value = "";
      await renderHistory();
    }));
    return;
  }

  const studentRows = [...groups.values()][0].sort((a,b) => String(a.competencia || "").localeCompare(String(b.competencia || "")));
  const latest = studentRows[studentRows.length - 1] || studentRows[0];
  const first = studentRows[0] || {};
  const totalFaltas = studentRows.reduce((acc, r) => acc + Number(r.total_faltas || 0), 0);
  const mesesComObs = studentRows.filter(r => String(r.observacao || "").trim()).length;

  panel.innerHTML = `
    <section class="history-profile-card">
      <div class="history-profile-main">
        <span>Estudante</span>
        <strong>${escapeHtml(latest.estudante || first.estudante || "—")}</strong>
        <small>Matrícula ${escapeHtml(latest.matricula || first.matricula || "—")} · Turma ${escapeHtml(latest.turma || first.turma || "—")} · Setor ${escapeHtml(latest.setor || first.setor || "—")}</small>
      </div>
      <div class="history-profile-stat"><span>Registros históricos</span><strong>${formatNumber(studentRows.length)}</strong></div>
      <div class="history-profile-stat"><span>Registros com observação</span><strong>${formatNumber(mesesComObs)}</strong></div>
      <div class="history-profile-stat"><span>Faltas nos registros</span><strong>${formatNumber(totalFaltas)}</strong></div>
    </section>

    <div class="history-timeline" aria-label="Histórico mensal de observações">
      ${studentRows.map(r => {
        const index = Number(r.__historyIndex ?? state.atendimentos.indexOf(r));
        const manual = String(r.tipo_registro || "").toUpperCase() === "MANUAL";
        const titulo = manual && r.data_atendimento ? `Atendimento em ${formatDateBr(r.data_atendimento)}` : historyMonthTitle(r.competencia);
        const subtitulo = manual ? (r.responsavel_atendimento || "Registro manual") : (r.aba_origem || "");
        return `
          <article class="history-month-card ${manual ? "manual-record" : ""}">
            <div class="history-month-card-head">
              <div><span class="history-month-label">${escapeHtml(titulo)}</span><small>${escapeHtml(subtitulo)}</small></div>
              ${manual ? `<div class="history-manual-badge"><span>ATENDIMENTO</span></div>` : `<div class="history-month-faults"><strong>${formatNumber(r.total_faltas || 0)}</strong><span>faltas</span></div>`}
            </div>
            <div class="history-observation-block"><span>Observação</span><p>${escapeHtml(r.observacao || "Sem observação registrada.")}</p></div>
            ${r.justificativa ? `<div class="history-justification-block"><span>Justificativa</span><p>${escapeHtml(r.justificativa)}</p></div>` : ""}
            ${r.encaminhamento ? `<div class="history-justification-block"><span>Encaminhamento</span><p>${escapeHtml(r.encaminhamento)}</p></div>` : ""}
            ${r.providencias ? `<div class="history-justification-block"><span>Providências</span><p>${escapeHtml(r.providencias)}</p></div>` : ""}
            ${r.dias_faltas ? `<div class="history-days-block"><span>Dias registrados</span><p>${escapeHtml(r.dias_faltas)}</p></div>` : ""}
            <div class="history-month-actions"><button class="button secondary compact-button" data-history-detail="${index}" type="button">Ver atendimento completo</button></div>
          </article>`;
      }).join("")}
    </div>`;

  $$('[data-history-detail]').forEach(btn => btn.addEventListener("click", () => showHistoryDetail(Number(btn.dataset.historyDetail))));
}
function showHistoryDetail(index) {
  const row = state.atendimentos[index];
  if (!row) return;
  const d = atendimentoDados(row);
  const detail = $("#history-detail-card");
  const body = $("#history-detail-body");
  if (!detail || !body) return;
  body.innerHTML = `
    <div class="history-detail-grid">
      <div><span>Aluno</span><strong>${escapeHtml(row.estudante || "—")}</strong></div>
      <div><span>Matrícula</span><strong>${escapeHtml(row.matricula || "—")}</strong></div>
      <div><span>Turma</span><strong>${escapeHtml(row.turma || "—")}</strong></div>
      <div><span>Competência</span><strong>${escapeHtml(formatCompetencia(row.competencia))}</strong></div>
      <div><span>Setor</span><strong>${escapeHtml(row.setor || "—")}</strong></div>
      <div><span>Tipo de registro</span><strong>${escapeHtml(String(row.tipo_registro || "IMPORTADO_MENSAL").replaceAll("_", " "))}</strong></div>
      <div><span>Data do atendimento</span><strong>${escapeHtml(formatDateBr(row.data_atendimento) || "—")}</strong></div>
      <div><span>Responsável pelo atendimento</span><strong>${escapeHtml(row.responsavel_atendimento || "—")}</strong></div>
      <div><span>Total de faltas</span><strong>${formatNumber(row.total_faltas || 0)}</strong></div>
      <div class="wide"><span>Dias registrados com falta</span><strong>${escapeHtml(row.dias_faltas || "—")}</strong></div>
      <div class="wide"><span>Justificativa</span><p>${escapeHtml(row.justificativa || "—")}</p></div>
      <div class="wide"><span>Observação</span><p>${escapeHtml(row.observacao || "—")}</p></div>
      <div class="wide"><span>Encaminhamento</span><p>${escapeHtml(row.encaminhamento || "—")}</p></div>
      <div class="wide"><span>Providências</span><p>${escapeHtml(row.providencias || "—")}</p></div>
      <div><span>Situação</span><strong>${escapeHtml(row.situacao || "—")}</strong></div>
      <div class="wide"><span>Responsáveis</span><strong>${escapeHtml(atendimentoResponsaveis(row))}</strong></div>
      <div><span>Telefone(s)</span><strong>${escapeHtml(atendimentoContatos(row))}</strong></div>
      <div><span>E-mail</span><strong>${escapeHtml(d?.contatos?.email || "—")}</strong></div>
      <div class="wide"><span>Endereço</span><strong>${escapeHtml(atendimentoEndereco(row))}</strong></div>
      <div><span>Data de nascimento</span><strong>${escapeHtml(formatDateBr(d.data_nascimento))}</strong></div>
      <div><span>Idade registrada</span><strong>${escapeHtml(d.idade || "—")}</strong></div>
    </div>`;
  detail.classList.remove("hidden");
  detail.scrollIntoView({ behavior: "smooth", block: "start" });
}
async function renderHistory() {
  setLoading(true);
  try {
    const turma = $("#history-class-filter")?.value || "";
    const sector = $("#history-sector-filter")?.value || "";
    const selectedMatricula = $("#history-student-list")?.value || "";
    const q = ($("#history-search")?.value || "").trim();
    const matricula = selectedMatricula || (/^\d+$/.test(q) ? q : "");
    const nome = selectedMatricula ? "" : (/^\d+$/.test(q) ? "" : q);
    const monthStart = $("#history-month-start")?.value || `${ANO_LETIVO}-02`;
    const monthEnd = $("#history-month-end")?.value || monthValueFromIso(todayIso());
    let rows = await rpc("fn_historico_atendimentos_apoia", {
      p_ano_letivo: ANO_LETIVO,
      p_matricula: matricula || "",
      p_turma: turma || "",
      p_nome: nome || "",
      p_data_inicio: monthStart ? `${monthStart}-01` : null,
      p_data_fim: monthEnd ? `${monthEnd}-01` : null
    });
    if (sector && !turma) {
      const permitidas = new Set(state.classes.filter(c => c.setorId === sector).map(c => String(c.turma)));
      rows = rows.filter(r => permitidas.has(String(r.turma || "")));
    }
    rows.sort((a,b) => String(b.competencia || "").localeCompare(String(a.competencia || "")) || String(a.estudante || "").localeCompare(String(b.estudante || ""), "pt-BR"));
    renderHistoryTable(rows);
    $("#history-detail-card")?.classList.add("hidden");
  } catch (e) {
    console.error(e);
    toast(`Erro ao carregar histórico de atendimentos: ${e.message}`, "error");
    renderHistoryTable([]);
  } finally {
    setLoading(false);
  }
}
function clearHistoryFilters() {
  if ($("#history-sector-filter")) $("#history-sector-filter").value = "";
  fillClassSelect("#history-class-filter", "#history-sector-filter");
  fillClassSelect("#service-class-filter", "#service-sector-filter", "Selecione uma turma");
  clearStudentSelect("#history-student-list", "Selecione uma turma para carregar alunos");
  if ($("#history-search")) $("#history-search").value = "";
  if ($("#history-month-start")) $("#history-month-start").value = `${ANO_LETIVO}-02`;
  if ($("#history-month-end")) $("#history-month-end").value = monthValueFromIso(todayIso());
  renderHistory();
}

async function generateSelectedAttendanceCard() {
  const el = $("#card-student-list");
  const matricula = el?.value || "";
  const turma = el?.selectedOptions?.[0]?.dataset?.turma || $("#card-class-filter")?.value || "";
  if (!matricula) return toast("Selecione um aluno na lista da turma ou localize por nome/matrícula.", "error");
  await loadAttendanceCard(matricula, turma);
}
function setupDates() {
  const t = todayIso();
  [["#date-start", startOfYear()], ["#date-end", t], ["#daily-date", t], ["#absence-date", t]].forEach(([sel,val]) => { const el=$(sel); if(el && !el.value) el.value=val; });
  const historyStart = $("#history-month-start");
  const historyEnd = $("#history-month-end");
  if (historyStart && !historyStart.value) historyStart.value = `${ANO_LETIVO}-02`;
  if (historyEnd && !historyEnd.value) historyEnd.value = monthValueFromIso(t);
  $("#reset-period")?.addEventListener("click", () => { $("#date-start").value=startOfYear(); $("#date-end").value=todayIso(); });
}

function renderHomeStats() {
  $("#sync-label") && ($("#sync-label").textContent = "Supabase");
  $("#profile-label") && ($("#profile-label").textContent = `${usuarioAtual?.email || "Usuário autorizado"} — Administrador`);
}

async function refreshCacheLabel() {
  try {
    const data = await rpc("fn_painel_cache_frequencia", {});
    if (data?.[0]?.atualizado_em) $("#sync-label").textContent = `Supabase • ${new Date(data[0].atualizado_em).toLocaleString("pt-BR")}`;
  } catch { $("#sync-label").textContent = "Supabase"; }
}

function dashboardTotalsFromRows(rows) {
  const total = { students: 0, ...codeCountsBase() };
  rows.map(normalizeDashboardRow).forEach(r => {
    total.students += Number(r.total_alunos_ativos ?? r.totalAlunosAtivos ?? 0);
    addCodes(total, sumCodes(r));
  });
  return total;
}
function updateDashboardKpis(total) {
  const presenca = total.total - total.F;
  $("#kpi-total") && ($("#kpi-total").textContent = formatNumber(total.total));
  $("#kpi-students") && ($("#kpi-students").textContent = formatNumber(total.students));
  $("#kpi-p") && ($("#kpi-p").textContent = formatNumber(presenca));
  $("#kpi-p-pct") && ($("#kpi-p-pct").textContent = pct(presenca, total.total));
  $("#kpi-f") && ($("#kpi-f").textContent = formatNumber(total.F));
  $("#kpi-f-pct") && ($("#kpi-f-pct").textContent = pct(total.F, total.total));
  $("#kpi-a") && ($("#kpi-a").textContent = formatNumber(total.A + total.AJ));
  $("#kpi-fj") && ($("#kpi-fj").textContent = formatNumber(total.FJ + total.AD + total.JE + total.S));
}

function updateDashboardEvaOverview(total, meta = {}) {
  const setText = (id, value) => {
    const el = $(id);
    if (el) el.textContent = value;
  };

  const totalAlunos = Number(total.students || 0);

  const p  = Number(total.P || 0);
  const f  = Number(total.F || 0);
  const fj = Number(total.FJ || 0);
  const a  = Number(total.A || 0);
  const aj = Number(total.AJ || 0);
  const ad = Number(total.AD || 0);
  const je = Number(total.JE || 0);
  const s  = Number(total.S || 0);
  const sc = Number(total.SC || 0);

  // Regra gerencial solicitada:
  // Presenças = todos os códigos lançados, exceto F.
  // FJ conta como presença.
  // Faltas = somente F.
  // Sem lançamento não entra no cálculo percentual.
  const presencas = p + fj + a + aj + ad + je + s + sc;
  const faltas = f;
  const totalGrafico = presencas + faltas;

  const atrasos = a + aj;
  const justificativas = fj + ad + je + s;

  const pctPresencas = totalGrafico > 0 ? (presencas / totalGrafico) * 100 : 0;

  setText("#dash-eva-total-alunos", formatNumber(totalAlunos || 0));
  setText("#dash-eva-total-turmas", formatNumber(meta.turmas || 0));
  setText("#dash-eva-total-setores", formatNumber(meta.setores || 0));
  setText("#dash-eva-total-lancamentos", formatNumber(totalGrafico));
  setText("#dash-eva-presencas", formatNumber(presencas));
  setText("#dash-eva-faltas", formatNumber(faltas));
  setText("#dash-eva-atrasos", formatNumber(atrasos));
  setText("#dash-eva-justificativas", formatNumber(justificativas));
  setText("#dash-eva-sem-lancamento", formatNumber(total.semLancamento));

  setText("#dash-eva-percent-frequencia", pct(presencas, totalGrafico));
  setText("#dash-eva-percent-faltas", pct(faltas, totalGrafico));

  setText("#dash-eva-legend-presencas", `${formatNumber(presencas)} · ${pct(presencas, totalGrafico)}`);
  setText("#dash-eva-legend-faltas", `${formatNumber(faltas)} · ${pct(faltas, totalGrafico)}`);

  setText("#dashboard-eva-donut-label", pct(presencas, totalGrafico));
  setText("#dash-eva-periodo", meta.periodo || "Período não gerado.");
  setText("#dashboard-eva-scope", meta.scope || "Resumo consolidado conforme filtros selecionados.");
  setText("#dashboard-eva-updated", `Relatório gerado em ${new Date().toLocaleString("pt-BR")}`);

  const donut = $("#dashboard-eva-donut");
  if (donut) {
    donut.style.setProperty("--presence-pct", `${Math.max(0, Math.min(100, pctPresencas)).toFixed(2)}%`);
    donut.setAttribute(
      "aria-label",
      `Presenças: ${formatNumber(presencas)} (${pct(presencas, totalGrafico)}). Faltas: ${formatNumber(faltas)} (${pct(faltas, totalGrafico)}).`
    );
  }
}
function dashboardMetaFromClassRows(rows, start, end, sector, turma) {
  const setores = new Set(rows.map(r => String(r.coordenacao_codigo || r.setorId || r.coordenacao_nome || r.setor || "")).filter(Boolean));
  const turmas = new Set(rows.map(r => String(r.turma || "")).filter(Boolean));
  const scopeParts = [];
  if (sector) scopeParts.push("setor filtrado"); else scopeParts.push("todos os setores autorizados");
  if (turma) scopeParts.push(`turma ${turma}`); else scopeParts.push("todas as turmas");
  return {
    setores: setores.size,
    turmas: turmas.size,
    scope: `Resumo consolidado: ${scopeParts.join(" · ")}.`,
    periodo: `Período: ${start} a ${end}`
  };
}
function dashboardMetaFromStudentRows(rows, start, end, label = "aluno selecionado") {
  const setores = new Set(rows.map(r => String(r.coordenacao_nome || "")).filter(Boolean));
  const turmas = new Set(rows.map(r => String(r.turma || "")).filter(Boolean));
  return {
    setores: setores.size,
    turmas: turmas.size,
    scope: `Resumo individual: ${label}.`,
    periodo: `Período: ${start} a ${end}`
  };
}
function renderDashboardHierarchy(rows) {
  const total = dashboardTotalsFromRows(rows);
  $("#hierarchy-general-label").textContent = "Relatório gerado";
  $("#hierarchy-general-body").innerHTML = `<div class="hierarchy-total-card"><strong>${formatNumber(total.total)}</strong><span>Total classificado</span><small>${formatNumber(total.students)} aluno(s) ativos • F ${pct(total.F,total.total)}</small></div>`;
  const bySector = new Map();
  rows.forEach(r => {
    const key = r.coordenacao_codigo || r.setorId || "";
    if (!bySector.has(key)) bySector.set(key, { label: r.coordenacao_nome || r.setor || key, turmas: 0, alunos: 0, total: 0, F: 0 });
    const item = bySector.get(key); const c = sumCodes(r); item.turmas++; item.alunos += Number(r.total_alunos_ativos ?? r.totalAlunosAtivos ?? 0); item.total += c.P+c.F+c.FJ+c.A+c.AJ+c.AD+c.JE+c.S+c.SC; item.F += c.F;
  });
  $("#hierarchy-sector-label").textContent = `${bySector.size} grupo(s)`;
  $("#hierarchy-sector-body").innerHTML = [...bySector.values()].map(s => `<div class="hierarchy-pill"><strong>${escapeHtml(s.label)}</strong><span>${s.turmas} turma(s) · ${formatNumber(s.alunos)} aluno(s) · F ${pct(s.F,s.total)}</span></div>`).join("") || `<div class="empty-cell">Nenhum grupo.</div>`;
  $("#hierarchy-class-label").textContent = `${rows.length} turma(s)`;
  $("#hierarchy-class-body").innerHTML = rows.map(r => {
    const c = sumCodes(r); const total = c.P+c.F+c.FJ+c.A+c.AJ+c.AD+c.JE+c.S+c.SC;
    return `<button class="hierarchy-pill hierarchy-class-item" data-dashboard-class="${escapeHtml(r.turma)}" type="button"><strong>Turma ${escapeHtml(r.turma)}</strong><span>${escapeHtml(r.coordenacao_nome || r.setor || "")} · ${formatNumber(r.total_alunos_ativos ?? r.totalAlunosAtivos)} aluno(s) · F ${pct(c.F,total)}</span></button>`;
  }).join("") || `<div class="empty-cell">Nenhuma turma.</div>`;
  $$('[data-dashboard-class]').forEach(b => b.addEventListener("click", () => loadDashboardStudents(b.dataset.dashboardClass)));
}
function renderClassTable(rows) {
  const body = $("#class-table-body"); if (!body) return;
  $("#class-count-label").textContent = `${rows.length} turma(s)`;
  body.innerHTML = rows.map(r => {
    const c=sumCodes(r); const total = c.P+c.F+c.FJ+c.A+c.AJ+c.AD+c.JE+c.S+c.SC;
    return `<tr><td><button class="link-button" data-dashboard-class="${escapeHtml(r.turma)}">${escapeHtml(r.turma)}</button></td><td>${escapeHtml(r.coordenacao_nome||r.setor)}</td><td>${formatNumber(r.total_alunos_ativos ?? r.totalAlunosAtivos)}</td><td>${formatNumber(total-c.F)}</td><td>${pct(total-c.F,total)}</td><td>${formatNumber(c.F)}</td><td>${pct(c.F,total)}</td><td>${formatNumber(c.A+c.AJ)}</td><td>${formatNumber(c.FJ+c.AD+c.JE+c.S)}</td><td>${formatNumber(c.SC)}</td><td>${formatNumber(total)}</td><td>${escapeHtml(r.ultima_frequencia || r.data_ultima_frequencia || "")}</td></tr>`;
  }).join("") || emptyCell("Gere um relatório.", 12);
  $$('[data-dashboard-class]').forEach(b => b.addEventListener("click", () => loadDashboardStudents(b.dataset.dashboardClass)));
}
async function renderDashboard() {
  setLoading(true);
  try {
    const sector = $("#dashboard-sector-filter")?.value || "";
    const turma = $("#dashboard-class-filter")?.value || "";
    const start = $("#date-start")?.value || startOfYear();
    const end = $("#date-end")?.value || todayIso();
    const selectedMatricula = $("#dashboard-student-list")?.value || "";
    const selectedTurma = selectedOptionData("#dashboard-student-list", "turma") || turma;
    const q = $("#dashboard-student-search")?.value?.trim() || "";

    if (selectedMatricula || q) {
      const rows = await rpc("fn_espelho_frequencia_aluno", {
        p_ano_letivo: ANO_LETIVO,
        p_matricula: selectedMatricula || (/^\d+$/.test(q) ? q : ""),
        p_nome: selectedMatricula ? "" : (/^\d+$/.test(q) ? "" : q),
        p_turma: selectedTurma || turma || "",
        p_data_inicio: start,
        p_data_fim: end
      });
      state.dashboardStudents = rows;
      const total = totalsFromAlunoRows(rows);
      updateDashboardKpis(total);
      const label = selectedMatricula ? ($("#dashboard-student-list")?.selectedOptions?.[0]?.textContent || "aluno selecionado") : (q ? `busca por ${q}` : "aluno selecionado");
      updateDashboardEvaOverview(total, dashboardMetaFromStudentRows(rows, start, end, label));
      $("#hierarchy-general-label").textContent = "Aluno selecionado";
      $("#hierarchy-general-body").innerHTML = `<div class="hierarchy-total-card"><strong>${formatNumber(total.total)}</strong><span>Total classificado</span><small>${formatNumber(total.students)} aluno(s) • F ${pct(total.F,total.total)}</small></div>`;
      $("#hierarchy-sector-label").textContent = sector ? "Setor filtrado" : "Busca geral";
      $("#hierarchy-sector-body").innerHTML = `<div class="empty-cell">Filtro individual aplicado. Use setor/turma para restringir a busca quando houver homônimos.</div>`;
      $("#hierarchy-class-label").textContent = turma ? `Turma ${turma}` : "Turmas";
      $("#hierarchy-class-body").innerHTML = `<div class="empty-cell">Relatório gerado em nível de aluno. Limpe o campo nome/matrícula e o aluno selecionado para voltar ao consolidado por turma.</div>`;
      $("#hierarchy-student-label").textContent = `${rows.length} aluno(s) localizado(s)`;
      $("#hierarchy-student-body").innerHTML = renderDashboardStudentRows(rows);
      $$('[data-student-action="card"]').forEach(b => b.addEventListener("click", () => { setView("attendance-card"); loadAttendanceCard(b.dataset.matricula, b.dataset.turma); }));
      $("#class-count-label").textContent = "Filtro individual";
      $("#class-table-body").innerHTML = emptyCell("Relatório em nível de aluno gerado no quadro Alunos / relatório individual.", 12);
      return;
    }

    let rows = [];
    try {
      rows = await rpc("fn_ranking_turmas_faltas_parametrizado", { p_ano_letivo: ANO_LETIVO, p_data_inicio: start, p_data_fim: end, p_coordenacao_codigo: sector, p_limite: 300 });
    } catch (rpcError) {
      console.warn("Falha no RPC de visão gerencial; usando cache consolidado.", rpcError);
      rows = await carregarDashboardConsolidadoFallback(sector, turma);
    }
    state.dashboardClasses = rows.filter(r => !turma || String(r.turma) === turma).map(normalizeDashboardRow);
    const dashboardTotal = dashboardTotalsFromRows(state.dashboardClasses);
    updateDashboardKpis(dashboardTotal);
    updateDashboardEvaOverview(dashboardTotal, dashboardMetaFromClassRows(state.dashboardClasses, start, end, sector, turma));
    renderDashboardHierarchy(state.dashboardClasses);
    renderClassTable(state.dashboardClasses);
    $("#hierarchy-student-body").innerHTML = `<div class="empty-cell">Clique em uma turma para carregar a relação nominal dos alunos, ou selecione um aluno nos filtros acima e gere novamente.</div>`;
  } catch(e) { toast(`Erro ao gerar visão gerencial: ${e.message}`, "error"); }
  finally { setLoading(false); }
}
function renderDashboardStudentRows(rows) {
  if (!rows.length) return `<div class="empty-cell">Nenhum aluno localizado para os filtros informados.</div>`;
  return `<div class="table-wrap"><table><thead><tr><th>Aluno</th><th>Matrícula</th><th>Turma</th><th>Setor</th><th>P</th><th>F</th><th>FJ</th><th>A</th><th>Total</th><th>% frequência</th><th>Ação</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.aluno_nome)}</td><td>${escapeHtml(r.matricula)}</td><td>${escapeHtml(r.turma)}</td><td>${escapeHtml(r.coordenacao_nome)}</td><td>${formatNumber(r.total_p)}</td><td>${formatNumber(r.total_f)}</td><td>${formatNumber(r.total_fj)}</td><td>${formatNumber(r.total_a)}</td><td>${formatNumber(r.total_lancamentos)}</td><td>${r.percentual_frequencia ?? "-"}</td><td><button class="button secondary small" data-matricula="${escapeHtml(r.matricula)}" data-turma="${escapeHtml(r.turma)}" data-student-action="card">Cartão</button></td></tr>`).join("")}</tbody></table></div>`;
}
async function loadDashboardStudents(turma) {
  try {
    $("#hierarchy-student-label").textContent = `Turma ${turma}`;
    $("#hierarchy-student-body").innerHTML = `<div class="empty-cell">Carregando alunos...</div>`;
    const rows = await rpc("fn_alunos_por_turma_parametrizado", { p_ano_letivo: ANO_LETIVO, p_coordenacao_codigo: "", p_turma: turma, p_status: "ATIVO", p_data_inicio: $("#date-start")?.value || startOfYear(), p_data_fim: $("#date-end")?.value || todayIso() });
    state.dashboardStudents = rows;
    $("#hierarchy-student-label").textContent = `Turma ${turma} — ${rows.length} aluno(s)`;
    $("#hierarchy-student-body").innerHTML = `<div class="table-wrap"><table><thead><tr><th>Aluno</th><th>Matrícula</th><th>P</th><th>F</th><th>FJ</th><th>A</th><th>Total</th><th>% frequência</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${escapeHtml(r.aluno_nome)}</td><td>${escapeHtml(r.matricula)}</td><td>${formatNumber(r.total_p)}</td><td>${formatNumber(r.total_f)}</td><td>${formatNumber(r.total_fj)}</td><td>${formatNumber(r.total_a)}</td><td>${formatNumber(r.total_lancamentos)}</td><td>${r.percentual_frequencia ?? "-"}</td></tr>`).join("")}</tbody></table></div>`;
  } catch(e) { $("#hierarchy-student-body").innerHTML = `<div class="empty-cell">Erro: ${escapeHtml(e.message)}</div>`; }
}

async function renderDaily() {
  setLoading(true);
  try {
    const date = $("#daily-date")?.value || todayIso();
    const sector = $("#daily-sector-filter")?.value || "";
    const turma = $("#daily-class-filter")?.value || "";
    const selectedMatricula = $("#daily-student-list")?.value || "";
    const selectedTurma = selectedOptionData("#daily-student-list", "turma") || turma;

    let rows;
    if (selectedMatricula) {
      const alunos = await rpc("fn_espelho_frequencia_aluno", {
        p_ano_letivo: ANO_LETIVO,
        p_matricula: selectedMatricula,
        p_nome: "",
        p_turma: selectedTurma || turma || "",
        p_data_inicio: date,
        p_data_fim: date
      });
      rows = alunos.map(a => ({
        turno: a.turno || "",
        coordenacao_nome: a.coordenacao_nome || "",
        turma: a.turma || selectedTurma || turma || "",
        aluno_nome: a.aluno_nome || "",
        total_alunos_ativos: 1,
        total_p: Number(a.total_p || 0),
        total_f: Number(a.total_f || 0),
        total_fj: Number(a.total_fj || 0),
        total_a: Number(a.total_a || 0),
        total_aj: Number(a.total_aj || 0),
        total_ad: Number(a.total_ad || 0),
        total_je: Number(a.total_je || 0),
        total_s: Number(a.total_s || 0),
        total_sc: Number(a.total_sc || 0),
        total_sem_lancamento: Number(a.total_lancamentos || 0) === 0 ? 1 : 0
      }));
    } else {
      rows = await rpc("fn_frequencia_diaria_parametrizada", { p_ano_letivo: ANO_LETIVO, p_data: date, p_coordenacao_codigo: sector, p_turma: turma });
    }

    state.dailyRows = rows;
    const total = { students:0, ...codeCountsBase() };
    rows.forEach(r => { total.students += Number(r.total_alunos_ativos || 0); addCodes(total, sumCodes(r)); });

    // Regra do relatório diário: somente F é falta. Todo código lançado diferente de F
    // é considerado presença para o percentual; sem lançamento fica fora da base percentual.
    const dailyMetric = (counts) => {
      const base = Number(counts.total || 0);
      const faltas = Number(counts.F || 0);
      const presencas = Math.max(0, base - faltas);
      return {
        base,
        presencas,
        faltas,
        pctPresenca: base ? (presencas / base) * 100 : 0,
        pctFalta: base ? (faltas / base) * 100 : 0
      };
    };

    const dailyPct = (value, base) => Number(base || 0) > 0 ? pct(value, base) : "—";
    const metricTotal = dailyMetric(total);
    $("#daily-kpi-total").textContent = formatNumber(total.students);
    $("#daily-kpi-presentes").textContent = formatNumber(metricTotal.presencas);
    $("#daily-kpi-presentes-pct").textContent = dailyPct(metricTotal.presencas, metricTotal.base);
    $("#daily-kpi-faltantes").textContent = formatNumber(metricTotal.faltas);
    $("#daily-kpi-faltantes-pct").textContent = dailyPct(metricTotal.faltas, metricTotal.base);
    $("#daily-kpi-sem").textContent = formatNumber(total.semLancamento);

    const renderDailyDonutCard = (item, isGeneral = false) => {
      const m = dailyMetric(item);
      const presencaPct = Math.max(0, Math.min(100, m.pctPresenca));
      const faltaPct = Math.max(0, Math.min(100, m.pctFalta));
      const titulo = isGeneral ? "GERAL" : (item.turno || "Sem turno");
      const subtitulo = selectedMatricula
        ? "Aluno selecionado"
        : `${formatNumber(item.turmas || rows.length)} turma(s)`;
      return `<article class="daily-turno-pizza-card ${isGeneral ? "daily-turno-pizza-geral" : ""}">
        <div class="daily-turno-pizza-head">
          <div><span>${escapeHtml(titulo)}</span><strong>${formatNumber(item.alunos || 0)} aluno(s)</strong></div>
          <small>${escapeHtml(subtitulo)}</small>
        </div>
        <div class="daily-turno-pizza-body">
          <div class="daily-turno-pizza" style="--daily-presenca:${presencaPct.toFixed(2)}%" aria-label="Presenças ${dailyPct(m.presencas,m.base)}; faltas ${dailyPct(m.faltas,m.base)}">
            <div class="daily-turno-pizza-center"><strong>${dailyPct(m.presencas,m.base)}</strong><span>presença</span></div>
          </div>
          <div class="daily-turno-pizza-legend">
            <div class="daily-turno-pizza-line presenca"><span></span><b>Presenças</b><strong>${dailyPct(m.presencas,m.base)}</strong></div>
            <div class="daily-turno-pizza-line falta"><span></span><b>Faltas</b><strong>${dailyPct(m.faltas,m.base)}</strong></div>
            <p>F ${formatNumber(m.faltas)} • Sem lançamento ${formatNumber(item.semLancamento || 0)}</p>
          </div>
        </div>
      </article>`;
    };

    $("#daily-turnos-label").textContent = selectedMatricula ? "Relatório individual do aluno" : `${rows.length} turma(s)`;
    const byTurno = new Map();
    rows.forEach(r => {
      const k = r.turno || "Sem turno";
      if(!byTurno.has(k)) byTurno.set(k,{turno:k, turmas:0, alunos:0, ...codeCountsBase()});
      const x=byTurno.get(k);
      x.turmas++;
      x.alunos += Number(r.total_alunos_ativos||0);
      addCodes(x,sumCodes(r));
    });

    const geralCard = { turno:"GERAL", turmas:rows.length, alunos:total.students, ...codeCountsBase() };
    ["P","F","FJ","A","AJ","AD","JE","S","SC","semLancamento","total"].forEach(k => geralCard[k] = Number(total[k] || 0));
    const turnoCards = [renderDailyDonutCard(geralCard, true), ...[...byTurno.values()].map(t => renderDailyDonutCard(t, false))];
    $("#daily-turno-charts").innerHTML = rows.length ? turnoCards.join("") : `<div class="empty-cell">Nenhum dado.</div>`;

    $("#daily-group-count").textContent = selectedMatricula ? "1 aluno" : `${rows.length} turma(s)`;
    $("#daily-summary-body").innerHTML = rows.map(r => {
      const c = sumCodes(r);
      const base = c.P+c.F+c.FJ+c.A+c.AJ+c.AD+c.JE+c.S+c.SC;
      const faltas = c.F;
      const presencas = Math.max(0, base - faltas);
      return `<tr>
        <td>${escapeHtml(r.turno)}</td>
        <td>${escapeHtml(r.coordenacao_nome)}</td>
        <td>${escapeHtml(r.turma)}</td>
        <td>${escapeHtml(r.aluno_nome || "—")}</td>
        <td>${formatNumber(r.total_alunos_ativos)}</td>
        <td class="daily-presencas-count">${formatNumber(presencas)}</td>
        <td class="daily-pct-presenca">${dailyPct(presencas,base)}</td>
        <td class="daily-faltas-count">${formatNumber(faltas)}</td>
        <td class="daily-pct-falta">${dailyPct(faltas,base)}</td>
        <td>${formatNumber(c.semLancamento)}</td>
      </tr>`;
    }).join("") || emptyCell("Nenhuma frequência localizada.", 10);
  } catch(e) { toast(`Erro ao gerar frequência diária: ${e.message}`, "error"); }
  finally { setLoading(false); }
}
function clearDaily(){
  state.dailyRows=[];
  ["daily-kpi-total","daily-kpi-presentes","daily-kpi-faltantes","daily-kpi-sem"].forEach(id=>{ const el=$("#"+id); if(el) el.textContent="0"; });
  $("#daily-kpi-presentes-pct").textContent="—";
  $("#daily-kpi-faltantes-pct").textContent="—";
  $("#daily-turnos-label").textContent="Gere um relatório para visualizar geral e turnos.";
  $("#daily-turno-charts").innerHTML=`<div class="empty-cell">Gere o relatório para visualizar o resumo geral e os gráficos por turno.</div>`;
  $("#daily-group-count").textContent="";
  $("#daily-summary-body").innerHTML=emptyCell("Gere um relatório diário.",10);
}

async function renderSectors() {
  const sector = $("#sector-view-filter")?.value || "";
  const rows = state.classes.filter(r => !sector || r.setorId === sector);
  const sectors = new Set(rows.map(r=>r.setorId));
  const total = dashboardTotalsFromRows(rows);
  $("#sector-kpi-sectors").textContent = formatNumber(sectors.size);
  $("#sector-kpi-classes").textContent = formatNumber(rows.length);
  $("#sector-kpi-students").textContent = formatNumber(total.students);
  $("#sector-kpi-total").textContent = formatNumber(total.total);
  $("#sector-count-label").textContent = `${sectors.size} coordenação(ões) • ${rows.length} turma(s)`;
  $("#sector-table-body").innerHTML = rows.map(r => { const c=sumCodes(r); const tot=c.P+c.F+c.FJ+c.A+c.AJ+c.AD+c.JE+c.S+c.SC; return `<tr><td>${escapeHtml(r.turno)}</td><td>${escapeHtml(r.setor)}</td><td><span class="badge">${escapeHtml(r.turma)}</span></td><td>${formatNumber(r.totalAlunosAtivos)}</td><td>${formatNumber(c.P)}</td><td>${formatNumber(c.F)}</td><td>${formatNumber(c.FJ)}</td><td>${formatNumber(c.A)}</td><td>${formatNumber(c.AJ)}</td><td>${formatNumber(c.AD)}</td><td>${formatNumber(c.JE)}</td><td>${formatNumber(c.S)}</td><td>${formatNumber(tot)}</td><td>${escapeHtml(r.ultima_frequencia || r.data_ultima_frequencia || "")}</td></tr>`; }).join("") || emptyCell("Nenhuma turma localizada.", 14);
}

async function searchStudents({queryText="", turma="", sector="", includeTransferred=true}={}) {
  const q = String(queryText || "").trim();
  if (q && q.length < 3 && !turma) return [];
  if (q) {
    return await rpc("fn_espelho_frequencia_aluno", { p_ano_letivo: ANO_LETIVO, p_matricula: /^\d+$/.test(q) ? q : "", p_nome: /^\d+$/.test(q) ? "" : q, p_turma: turma || "", p_data_inicio: startOfYear(), p_data_fim: todayIso() });
  }
  if (turma) {
    return await rpc("fn_alunos_por_turma_parametrizado", { p_ano_letivo: ANO_LETIVO, p_coordenacao_codigo: sector || "", p_turma: turma || "", p_status: includeTransferred ? "TODOS" : "ATIVO", p_data_inicio: startOfYear(), p_data_fim: todayIso() });
  }
  return [];
}
function renderStudentSearchRows(rows, bodySelector, action) {
  const body = $(bodySelector); if(!body) return;
  body.innerHTML = rows.map(r => `<tr><td>${escapeHtml(r.aluno_nome)}</td><td>${escapeHtml(r.matricula)}</td><td>${escapeHtml(r.turma)}</td><td>${escapeHtml(r.coordenacao_nome)}</td><td>${escapeHtml(r.status)}</td><td><button class="button secondary" data-student-action="${action}" data-matricula="${escapeHtml(r.matricula)}" data-turma="${escapeHtml(r.turma)}">Abrir</button></td></tr>`).join("") || emptyCell("Nenhum aluno localizado.", 6);
  $$(`[data-student-action="${action}"]`).forEach(b => b.addEventListener("click", () => action === "card" ? loadAttendanceCard(b.dataset.matricula, b.dataset.turma) : loadStudentReport(b.dataset.matricula, b.dataset.turma)));
}
async function quickStudentSearch() {
  try { const rows = await searchStudents({ queryText: $("#quick-student-search")?.value?.trim() || "", sector: $("#quick-sector-filter")?.value || "" }); state.quickStudentResults=rows; renderStudentSearchRows(rows, "#quick-students-table-body", "student"); } catch(e){ toast(`Erro na busca: ${e.message}`,"error"); }
}

async function handleServiceClassChange() {
  const turma = $("#service-class-filter")?.value || "";
  const sector = $("#service-sector-filter")?.value || "";
  await loadStudentsIntoSelect("#service-student-list", turma, sector, { status: "TODOS", placeholder: "Selecione um aluno da turma" });
}

function serviceStatus(message, type = "") {
  const el = $("#service-status");
  if (!el) return;
  el.textContent = message;
  el.classList.remove("ok", "error");
  if (type) el.classList.add(type);
}

function renderServiceSearchResults(rows) {
  const root = $("#service-search-results");
  if (!root) return;
  if (!rows.length) {
    root.classList.remove("hidden");
    root.innerHTML = `<div class="empty-cell">Nenhum aluno localizado.</div>`;
    return;
  }
  root.classList.remove("hidden");
  root.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Aluno</th><th>Matrícula</th><th>Turma</th><th>Setor</th><th>Ação</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escapeHtml(r.aluno_nome || r.estudante || "")}</td><td>${escapeHtml(r.matricula || "")}</td><td>${escapeHtml(r.turma || "")}</td><td>${escapeHtml(r.coordenacao_nome || r.setor || "")}</td><td><button class="button primary compact-button" data-service-select="${escapeHtml(r.matricula || "")}" data-service-turma="${escapeHtml(r.turma || "")}" type="button">Selecionar</button></td></tr>`).join("")}</tbody></table></div>`;
  $$('[data-service-select]').forEach(btn => btn.addEventListener("click", () => loadServiceStudent(btn.dataset.serviceSelect, btn.dataset.serviceTurma)));
}

function renderServiceHistoryRows(rows) {
  const root = $("#service-history-body");
  const count = $("#service-history-count");
  if (!root) return;
  const ordered = [...(rows || [])].sort((a,b) => {
    const da = String(a.data_atendimento || a.competencia || "");
    const db = String(b.data_atendimento || b.competencia || "");
    return db.localeCompare(da);
  });
  if (count) count.textContent = `${ordered.length} registro(s)`;
  if (!ordered.length) {
    root.innerHTML = `<div class="empty-cell">Nenhum atendimento anterior localizado.</div>`;
    return;
  }
  root.innerHTML = ordered.map(r => {
    const manual = String(r.tipo_registro || "").toUpperCase() === "MANUAL";
    const titulo = manual && r.data_atendimento ? formatDateBr(r.data_atendimento) : formatCompetencia(r.competencia);
    return `<article class="service-history-item ${manual ? "manual" : ""}">
      <div class="service-history-head"><strong>${escapeHtml(titulo)}</strong><span>${manual ? "Atendimento manual" : `${formatNumber(r.total_faltas || 0)} falta(s)`}</span></div>
      ${r.responsavel_atendimento ? `<div><b>Responsável:</b> ${escapeHtml(r.responsavel_atendimento)}</div>` : ""}
      <div><b>Observação:</b> ${escapeHtml(r.observacao || "Sem observação registrada.")}</div>
      ${r.justificativa ? `<div><b>Justificativa:</b> ${escapeHtml(r.justificativa)}</div>` : ""}
      ${r.encaminhamento ? `<div><b>Encaminhamento:</b> ${escapeHtml(r.encaminhamento)}</div>` : ""}
      ${r.providencias ? `<div><b>Providências:</b> ${escapeHtml(r.providencias)}</div>` : ""}
      ${r.situacao ? `<div><b>Situação:</b> ${escapeHtml(r.situacao)}</div>` : ""}
    </article>`;
  }).join("");
}

async function refreshServiceHistory() {
  const student = state.serviceStudent;
  if (!student?.matricula) return;
  try {
    const registros = await rpc("fn_historico_atendimentos_apoia", {
      p_ano_letivo: ANO_LETIVO,
      p_matricula: String(student.matricula),
      p_turma: "",
      p_nome: "",
      p_data_inicio: `${ANO_LETIVO}-01-01`,
      p_data_fim: todayIso()
    });
    renderServiceHistoryRows(registros || []);
  } catch (e) {
    $("#service-history-body").innerHTML = `<div class="empty-cell">Erro ao carregar histórico: ${escapeHtml(e.message)}</div>`;
  }
}

async function loadServiceStudent(matricula, turma = "") {
  if (!matricula) return toast("Selecione um aluno.", "error");
  setLoading(true);
  try {
    const rows = await rpc("fn_espelho_frequencia_aluno", {
      p_ano_letivo: ANO_LETIVO,
      p_matricula: String(matricula),
      p_nome: "",
      p_turma: turma || "",
      p_data_inicio: startOfYear(),
      p_data_fim: todayIso()
    });
    const aluno = rows?.[0];
    if (!aluno) throw new Error("Aluno não localizado na base de frequência.");
    const contato = await getContatoAluno(aluno.matricula || matricula, aluno.turma || turma || "");
    state.serviceStudent = { ...aluno, __contato: contato };
    $("#service-student-card")?.classList.remove("hidden");
    $("#service-form-card")?.classList.remove("hidden");
    $("#service-history-card")?.classList.remove("hidden");
    $("#service-search-results")?.classList.add("hidden");
    $("#service-student-name").textContent = aluno.aluno_nome || "Aluno selecionado";
    $("#service-student-meta").textContent = `Matrícula ${aluno.matricula || "—"} • Turma ${aluno.turma || "—"} • ${aluno.coordenacao_nome || aluno.setor || "Setor não informado"}`;
    $("#service-student-contact").innerHTML = `<div><span>Telefone(s)</span><strong>${escapeHtml(resumoTelefonesContato(contato))}</strong></div><div><span>E-mail</span><strong>${escapeHtml(contatoValor(contato, "email"))}</strong></div><div><span>Mãe / responsável</span><strong>${escapeHtml(contatoValor(contato, "nome_mae"))}</strong></div><div><span>Pai / responsável</span><strong>${escapeHtml(contatoValor(contato, "nome_pai"))}</strong></div>`;
    if ($("#service-date")) $("#service-date").value = todayIso();
    serviceStatus("Aluno carregado. Registre o atendimento e salve.");
    await refreshServiceHistory();
  } catch (e) {
    toast(`Erro ao carregar aluno: ${e.message}`, "error");
  } finally {
    setLoading(false);
  }
}

async function serviceLoadStudent() {
  const selected = $("#service-student-list")?.value || "";
  const selectedTurma = selectedOptionData("#service-student-list", "turma") || $("#service-class-filter")?.value || "";
  if (selected) return loadServiceStudent(selected, selectedTurma);
  const q = $("#service-search")?.value?.trim() || "";
  if (q.length < 3) return toast("Selecione um aluno da turma ou digite ao menos 3 caracteres.", "error");
  try {
    const rows = await searchStudents({ queryText: q, sector: $("#service-sector-filter")?.value || "", includeTransferred: true });
    state.serviceSearchResults = rows;
    if (rows.length === 1) return loadServiceStudent(rows[0].matricula, rows[0].turma || "");
    renderServiceSearchResults(rows);
  } catch (e) {
    toast(`Erro na busca do aluno: ${e.message}`, "error");
  }
}

async function saveServiceAttendance() {
  const student = state.serviceStudent;
  if (!student?.matricula) return toast("Carregue um aluno antes de registrar o atendimento.", "error");
  const responsavel = $("#service-responsavel")?.value?.trim() || "";
  const observacao = $("#service-observacao")?.value?.trim() || "";
  const token = $("#service-token")?.value?.trim() || "";
  if (!responsavel) return serviceStatus("Informe o servidor responsável.", "error");
  if (!observacao) return serviceStatus("Informe a observação do atendimento.", "error");
  if (!token) return serviceStatus("Informe a chave de autorização.", "error");
  const payload = {
    ano_letivo: ANO_LETIVO,
    matricula: student.matricula,
    estudante: student.aluno_nome || "",
    turma: student.turma || "",
    setor: student.coordenacao_nome || student.setor || "",
    data_atendimento: $("#service-date")?.value || todayIso(),
    responsavel_atendimento: responsavel,
    observacao,
    justificativa: $("#service-justificativa")?.value?.trim() || "",
    encaminhamento: $("#service-encaminhamento")?.value?.trim() || "",
    providencias: $("#service-providencias")?.value?.trim() || "",
    situacao: $("#service-situacao")?.value || "EM_ACOMPANHAMENTO",
    contexto_frequencia: {}
  };
  const btn = $("#service-save");
  if (btn) btn.disabled = true;
  serviceStatus("Salvando atendimento...");
  try {
    await window.registrarAtendimentoApoiaManual(payload, token);
    await refreshServiceHistory();
    ["#service-responsavel","#service-observacao","#service-justificativa","#service-encaminhamento","#service-providencias","#service-token"].forEach(sel => { if ($(sel)) $(sel).value = ""; });
    if ($("#service-situacao")) $("#service-situacao").value = "EM_ACOMPANHAMENTO";
    if ($("#service-observacao-counter")) $("#service-observacao-counter").textContent = "0/600 caracteres";
    serviceStatus("Atendimento salvo e histórico atualizado.", "ok");
  } catch (e) {
    serviceStatus(e.message || "Falha ao salvar atendimento.", "error");
  } finally {
    if (btn) btn.disabled = false;
  }
}

function clearServiceWorkspace() {
  state.serviceStudent = null;
  state.serviceSearchResults = [];
  if ($("#service-sector-filter")) $("#service-sector-filter").value = "";
  fillClassSelect("#service-class-filter", "#service-sector-filter", "Selecione uma turma");
  clearStudentSelect("#service-student-list", "Selecione uma turma para carregar alunos");
  if ($("#service-search")) $("#service-search").value = "";
  if ($("#service-search-results")) { $("#service-search-results").classList.add("hidden"); $("#service-search-results").innerHTML = ""; }
  $("#service-student-card")?.classList.add("hidden");
  $("#service-form-card")?.classList.add("hidden");
  $("#service-history-card")?.classList.add("hidden");
}
async function loadClassStudents() {
  try {
    const sector = $("#students-sector-filter")?.value || ""; const turma = $("#students-class-filter")?.value || ""; if(!turma) return;
    const rows = await rpc("fn_alunos_por_turma_parametrizado", { p_ano_letivo: ANO_LETIVO, p_coordenacao_codigo: sector, p_turma: turma, p_status: "TODOS", p_data_inicio: startOfYear(), p_data_fim: todayIso() });
    state.students = rows; renderStudentsTable(rows);
  } catch(e){ toast(`Erro ao carregar turma: ${e.message}`,"error"); }
}
function renderStudentsTable(rows) {
  const q = $("#student-search")?.value?.trim().toLowerCase() || "";
  const filtered = rows.filter(r => !q || String(r.aluno_nome||"").toLowerCase().includes(q) || String(r.matricula||"").includes(q));
  $("#students-count-label").textContent = `${filtered.length} aluno(s)`;
  $("#students-table-body").innerHTML = filtered.map(r => `<tr><td>${escapeHtml(r.aluno_nome)}</td><td>${escapeHtml(r.matricula)}</td><td>${escapeHtml(r.status)}</td><td>${formatNumber(r.total_p)}</td><td>${formatNumber(r.total_f)}</td><td>${formatNumber(r.total_fj)}</td><td>${formatNumber(r.total_a)}</td><td>${formatNumber(r.total_aj)}</td><td>${formatNumber(r.total_ad)}</td><td>${formatNumber(r.total_je)}</td><td>${formatNumber(r.total_s)}</td><td>${formatNumber(r.total_lancamentos)}</td><td>${r.percentual_frequencia ?? "-"}</td></tr>`).join("") || emptyCell("Selecione uma turma ou use a busca.", 13);
}
async function buscarOuCarregarAlunos() {
  try {
    const sector = $("#students-sector-filter")?.value || "";
    const turma = $("#students-class-filter")?.value || "";
    const selected = $("#students-student-list")?.value || "";
    const selectedTurma = selectedOptionData("#students-student-list", "turma") || turma;
    const q = $("#student-search")?.value?.trim() || "";
    let rows = [];
    if (selected) {
      rows = await rpc("fn_espelho_frequencia_aluno", { p_ano_letivo: ANO_LETIVO, p_matricula: selected, p_nome: "", p_turma: selectedTurma || "", p_data_inicio: startOfYear(), p_data_fim: todayIso() });
    } else if (turma) {
      rows = await rpc("fn_alunos_por_turma_parametrizado", { p_ano_letivo: ANO_LETIVO, p_coordenacao_codigo: sector, p_turma: turma, p_status: "TODOS", p_data_inicio: startOfYear(), p_data_fim: todayIso() });
    } else if (q.length >= 3) {
      rows = await searchStudents({ queryText: q, sector, includeTransferred: true });
    } else {
      return toast("Selecione uma turma/aluno ou digite ao menos 3 caracteres para buscar.", "error");
    }
    state.students = rows;
    renderStudentsTable(rows);
  } catch(e) { toast(`Erro ao buscar/carregar alunos: ${e.message}`, "error"); }
}
function limparFiltroAlunos() {
  if ($("#students-sector-filter")) $("#students-sector-filter").value = "";
  fillClassSelect("#students-class-filter", "#students-sector-filter", "Selecione uma turma");
  clearStudentSelect("#students-student-list", "Selecione uma turma para carregar alunos");
  if ($("#student-search")) $("#student-search").value = "";
  state.students = [];
  $("#students-count-label").textContent = "";
  $("#students-table-body").innerHTML = emptyCell("Selecione turma/aluno ou use a busca por nome/matrícula.", 13);
}
async function loadStudentReport(matricula, turma) { setView("attendance-card"); await loadAttendanceCard(matricula, turma); }

async function cardSearch() {
  try { const rows = await searchStudents({ queryText: $("#card-student-search")?.value?.trim() || "", turma: $("#card-class-filter")?.value || "", sector: $("#card-sector-filter")?.value || "" }); state.attendanceCardResults=rows; renderStudentSearchRows(rows, "#card-search-results-body", "card"); } catch(e){ toast(`Erro na busca do cartão: ${e.message}`,"error"); }
}

function normalizeFreqRecord(f) {
  return {
    data: String(f.data || f.data_frequencia || f.dia || ""),
    codigo: String(f.codigo || f.codigo_frequencia || f.status || "").trim().toUpperCase()
  };
}
function classForCode(code) {
  const c = String(code || "").toUpperCase();
  if (c === "P") return "code-present";
  if (c === "F") return "code-falta";
  if (c === "A" || c === "AJ") return "code-atraso";
  if (c === "FJ" || c === "AD" || c === "JE") return "code-just";
  if (c === "S") return "code-suspensao";
  if (c === "SC") return "code-sc";
  return "code-empty";
}
function labelForCode(code) {
  const labels = { P:"Presença", F:"Falta", FJ:"Falta justificada", A:"Atraso", AJ:"Atraso justificado", AD:"Atendimento domiciliar", JE:"Justificado pela escola", S:"Suspensão", SC:"Sem computar" };
  return labels[String(code || "").toUpperCase()] || "Sem lançamento";
}
function monthNameFromKey(key) {
  const [y,m] = String(key || "").split("-").map(Number);
  if (!y || !m) return key || "Sem mês";
  return new Date(y, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}
function dateLabel(iso) {
  if (!iso) return "—";
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
function weekdayLabel(iso) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
}
function renderCardMonths(freqs) {
  const byMonth = new Map();
  (freqs || []).map(normalizeFreqRecord).filter(f => f.data).sort((a,b)=>a.data.localeCompare(b.data)).forEach(f => {
    const key = f.data.slice(0,7);
    if(!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(f);
  });
  return [...byMonth.entries()].map(([m, rows]) => {
    const counts = rows.reduce((acc, f) => { const c = f.codigo || "—"; acc[c] = (acc[c] || 0) + 1; return acc; }, {});
    const summary = ["P","F","FJ","A","AJ","AD","JE","S","SC","—"].filter(k => counts[k]).map(k => `<span>${escapeHtml(k)}: <b>${formatNumber(counts[k])}</b></span>`).join("");
    return `<article class="attendance-month-card">
      <div class="attendance-month-card-header">
        <div><h4>${escapeHtml(monthNameFromKey(m))}</h4><span>${formatNumber(rows.length)} data(s) exibida(s)</span></div>
        <div class="month-total-badge">${formatNumber(rows.length)} dias</div>
      </div>
      <div class="attendance-month-summary">${summary || "<span>Sem lançamentos no mês</span>"}</div>
      <div class="attendance-date-grid">
        ${rows.map(f => `<div class="attendance-date-tile ${classForCode(f.codigo)}">
          <span class="tile-weekday">${escapeHtml(weekdayLabel(f.data))}</span>
          <span class="tile-date">${escapeHtml(dateLabel(f.data))}</span>
          <span class="tile-code"><span class="attendance-code ${classForCode(f.codigo)}">${escapeHtml(f.codigo || "—")}</span></span>
          <span class="tile-label">${escapeHtml(labelForCode(f.codigo))}</span>
        </div>`).join("")}
      </div>
    </article>`;
  }).join("") || `<div class="empty-cell">Nenhuma frequência localizada.</div>`;
}
function buildAttendancePrintHtml(aluno) {
  const freqs = Array.isArray(aluno?.frequencias) ? aluno.frequencias.map(normalizeFreqRecord).filter(f=>f.data).sort((a,b)=>a.data.localeCompare(b.data)) : [];
  const byMonth = new Map();
  freqs.forEach(f => { const key = f.data.slice(0,7); if(!byMonth.has(key)) byMonth.set(key, []); byMonth.get(key).push(f); });
  const allCodes = ["P","F","FJ","A","AJ","AD","JE","S","SC"];
  const monthRows = [...byMonth.entries()].map(([m, rows]) => {
    const cells = Array.from({length:31}, (_,i) => {
      const day = String(i+1).padStart(2,"0");
      const f = rows.find(x => x.data.slice(8,10) === day);
      const code = f?.codigo || "";
      const cls = code === "P" ? "p" : code === "F" ? "f" : ["A","AJ"].includes(code) ? "a" : ["FJ","AD","JE"].includes(code) ? "j" : code === "S" ? "s" : code === "SC" ? "sc" : "empty";
      // O número do dia já aparece no cabeçalho. Na linha mensal mostramos somente o lançamento.
      return `<td class="pc-day ${cls}"><strong>${escapeHtml(code || "—")}</strong></td>`;
    }).join("");
    // Regra institucional do painel: somente o código F é contabilizado como falta.
    const faltasMes = rows.filter(x => String(x?.codigo || "").toUpperCase() === "F").length;
    return `<tr><td class="pc-month">${escapeHtml(monthNameFromKey(m))}</td>${cells}<td class="pc-month-absences">${formatNumber(faltasMes)}</td></tr>`;
  }).join("");
  const totals = allCodes.map(k => `<div><span>${k}</span><strong>${formatNumber(aluno[`total_${k.toLowerCase()}`] || 0)}</strong></div>`).join("");
  const title = `Cartão de frequência - ${aluno?.aluno_nome || "Aluno"}`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
  <style>
    @page{size:A4 landscape;margin:4mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#fff}.pc-page{width:289mm;margin:0 auto}.pc-header{display:grid;grid-template-columns:1.45fr .9fr;gap:2mm;margin-bottom:2mm}.pc-org,.pc-title,.pc-id div,.pc-kpis div,.pc-contact div{border:1px solid #91a4bd;background:#f8fafc;padding:1.1mm}.pc-org span,.pc-title span,.pc-id span,.pc-kpis span{display:block;text-transform:uppercase;color:#475569;font-weight:700;font-size:6pt}.pc-org strong{display:block;color:#17365d;font-size:9pt}.pc-title{text-align:right}.pc-title strong{display:block;color:#17365d;font-size:13pt}.pc-id{display:grid;grid-template-columns:2.4fr .9fr .9fr .7fr .7fr 1fr;gap:1mm;margin-bottom:2mm}.pc-id strong{display:block;font-size:7.2pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pc-contact{display:grid;grid-template-columns:1fr 1fr 1.2fr .7fr 1.2fr .7fr;gap:1mm;margin-bottom:2mm}.pc-contact .wide{grid-column:1/-1}.pc-contact span{display:block;text-transform:uppercase;color:#475569;font-weight:700;font-size:5.8pt}.pc-contact strong{display:block;font-size:6.5pt;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pc-kpis{display:grid;grid-template-columns:repeat(9,1fr);gap:1mm;margin-bottom:2mm}.pc-kpis div{text-align:center}.pc-kpis strong{display:block;font-size:9pt;color:#17365d}.pc-table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:6pt}.pc-table th,.pc-table td{border:1px solid #91a4bd;text-align:center;padding:.7mm .3mm;height:6.2mm}.pc-table th{background:#17365d;color:#fff}.pc-month{width:22mm;text-align:left!important;font-weight:700;background:#e7f0ff;color:#17365d}.pc-day{width:7.6mm}.pc-day strong{display:block;font-size:7pt}.pc-day.p{background:#dcfce7}.pc-day.f{background:#fecaca}.pc-day.a{background:#fed7aa}.pc-day.j{background:#dbeafe}.pc-day.s{background:#ede9fe}.pc-day.sc,.pc-day.empty{background:#f8fafc}.pc-month-absences{width:13mm;background:#fff1f2;color:#b42318;font-weight:900;font-size:7.4pt}.pc-table th.pc-month-absences-head{width:13mm;background:#9f1d20;color:#fff}.pc-legend{margin-top:2mm;border-top:1px solid #91a4bd;padding-top:1mm;font-size:6.4pt;color:#334155}
  </style></head><body><div class="pc-page"><div class="pc-header"><div class="pc-org"><span>Estado de Santa Catarina</span><span>Secretaria de Estado da Educação</span><strong>Instituto Estadual de Educação</strong></div><div class="pc-title"><span>Relatório individual</span><strong>Cartão de frequência</strong><span>${escapeHtml(startOfYear())} a ${escapeHtml(todayIso())}</span></div></div><div class="pc-id"><div><span>Aluno</span><strong>${escapeHtml(aluno?.aluno_nome || "—")}</strong></div><div><span>Matrícula</span><strong>${escapeHtml(aluno?.matricula || "—")}</strong></div><div><span>Nascimento</span><strong>${escapeHtml(aluno?.data_nascimento || "—")}</strong></div><div><span>Idade</span><strong>${escapeHtml(aluno?.idade || "—")}</strong></div><div><span>Turma</span><strong>${escapeHtml(aluno?.turma || "—")}</strong></div><div><span>Ano</span><strong>${ANO_LETIVO}</strong></div></div>${contatoPrintBlock(aluno?.__contato || null)}<div class="pc-kpis">${totals}</div><table class="pc-table"><thead><tr><th class="pc-month">Mês</th>${Array.from({length:31},(_,i)=>`<th>${i+1}</th>`).join("")}<th class="pc-month-absences-head">Faltas</th></tr></thead><tbody>${monthRows || `<tr><td colspan="33">Nenhuma frequência localizada.</td></tr>`}</tbody></table><div class="pc-legend"><b>Legenda:</b> P = Presente; F = Falta; FJ = Falta justificada; A = Atraso; AJ = Atraso justificado; AD = Atendimento domiciliar; JE = Justificado pela escola; S = Suspensão; SC = sem computar. O traço “—” indica ausência de lançamento na data.</div></div><script>window.onload=()=>{setTimeout(()=>window.print(),350);};</script></body></html>`;
}
function openAttendancePrint() {
  if (!state.selectedAttendanceCard) return toast("Gere o cartão de um aluno antes de imprimir.", "error");
  const w = window.open("", "_blank", "width=1200,height=800");
  if (!w) return toast("O navegador bloqueou a janela de impressão. Libere pop-ups para este site.", "error");
  w.document.open();
  w.document.write(buildAttendancePrintHtml(state.selectedAttendanceCard));
  w.document.close();
}

async function emitirCartaoFrequencia() {
  try {
    const lista = $("#card-student-list");
    const alunoSelecionado = lista?.value || "";
    const turmaSelecionada = lista?.selectedOptions?.[0]?.dataset?.turma || $("#card-class-filter")?.value || "";
    const busca = $("#card-student-search")?.value?.trim() || "";

    if (alunoSelecionado) {
      const aluno = await loadAttendanceCard(alunoSelecionado, turmaSelecionada);
      if (aluno) openAttendancePrint();
      return;
    }

    if (state.selectedAttendanceCard) {
      openAttendancePrint();
      return;
    }

    if (busca.length >= 3) {
      const rows = await searchStudents({ queryText: busca, turma: $("#card-class-filter")?.value || "", sector: $("#card-sector-filter")?.value || "" });
      state.attendanceCardResults = rows;
      renderStudentSearchRows(rows, "#card-search-results-body", "card");
      if (rows.length === 1) {
        const aluno = await loadAttendanceCard(rows[0].matricula, rows[0].turma);
        if (aluno) openAttendancePrint();
      } else if (rows.length > 1) {
        toast("Foram encontrados vários alunos. Clique em Abrir no aluno correto ou selecione um aluno da lista da turma.");
      } else {
        toast("Nenhum aluno localizado para emitir o cartão.", "error");
      }
      return;
    }

    toast("Selecione um aluno da turma ou faça uma busca rápida por nome/matrícula antes de emitir o cartão.", "error");
  } catch (e) {
    toast(`Erro ao emitir cartão: ${e.message}`, "error");
  }
}
async function loadAttendanceCard(matricula, turma) {
  try {
    const rows = await rpc("fn_espelho_frequencia_aluno", { p_ano_letivo: ANO_LETIVO, p_matricula: matricula, p_nome: "", p_turma: turma || "", p_data_inicio: startOfYear(), p_data_fim: todayIso() });
    const aluno = rows[0]; if(!aluno) { toast("Aluno não localizado.", "error"); return null; }
    const contato = await getContatoAluno(aluno.matricula || matricula, aluno.turma || turma || "");
    aluno.__contato = contato;
    state.selectedAttendanceCard = aluno;
    renderContatoPainel(contato);
    $("#attendance-card-report")?.classList.remove("hidden");
    $("#attendance-card-status").textContent = "Cartão carregado. Use o botão para abrir a impressão A4.";
    $("#card-student-name").textContent = aluno.aluno_nome || "—";
    $("#card-matricula").textContent = aluno.matricula || "—";
    $("#card-nascimento").textContent = aluno.data_nascimento || "—";
    $("#card-idade").textContent = aluno.idade || "—";
    $("#card-turma").textContent = aluno.turma || "—";
    $("#card-setor").textContent = aluno.coordenacao_nome || "—";
    $("#card-ano").textContent = String(ANO_LETIVO);
    const freqs = Array.isArray(aluno.frequencias) ? aluno.frequencias : [];
    $("#card-total-dates").textContent = formatNumber(freqs.length);
    ["p","f","fj","a","aj","ad","je","s","sc"].forEach(k => { const id = `#card-total-${k}`; if($(id)) $(id).textContent = formatNumber(aluno[`total_${k}`] || 0); });
    $("#card-kpi-dias").textContent = formatNumber(freqs.length);
    $("#card-kpi-presencas").textContent = formatNumber(aluno.total_p || 0);
    $("#card-kpi-faltas").textContent = formatNumber(aluno.total_f || 0);
    $("#card-kpi-atrasos").textContent = formatNumber(Number(aluno.total_a||0)+Number(aluno.total_aj||0));
    $("#card-kpi-justificadas").textContent = formatNumber(Number(aluno.total_fj||0)+Number(aluno.total_ad||0)+Number(aluno.total_je||0)+Number(aluno.total_s||0));
    $("#card-kpi-sem-lancamento").textContent = "0";
    $("#card-period-label").textContent = `${startOfYear()} a ${todayIso()}`;
    $("#attendance-card-months").innerHTML = renderCardMonths(freqs);
    $("#attendance-card-report").scrollIntoView({ behavior: "smooth", block: "start" });
    return aluno;
  } catch(e){ toast(`Erro ao gerar cartão: ${e.message}`,"error"); }
}

function clearCard(){ state.selectedAttendanceCard=null; $("#attendance-card-report")?.classList.add("hidden"); renderContatoPainel(null); $("#card-search-results-body").innerHTML=emptyCell("Digite nome ou matrícula e clique em Localizar.",6); }


async function renderAbsenceAlert() {
  setLoading(true);
  try {
    const ref = $("#absence-date")?.value || todayIso();
    const dias = Math.max(1, Number($("#absence-days-window")?.value || 30));
    const faltasAlt = Math.max(1, Number($("#absence-alt-threshold")?.value || 7));
    const faltasCons = Math.max(1, Number($("#absence-consecutive-threshold")?.value || 5));
    const start = isoMinusDays(ref, dias);
    const sector = $("#absence-sector-filter")?.value || "";
    const turma = $("#absence-class-filter")?.value || "";
    const data = await rpc("fn_relatorio_apoia_parametrizado", { p_ano_letivo: ANO_LETIVO, p_data_inicio: start, p_data_fim: ref, p_faltas_consecutivas: faltasCons, p_faltas_alternadas: faltasAlt, p_coordenacao_codigo: sector, p_turma: turma });
    const alunoSelecionado = $("#absence-student-list")?.value || "";
    const rows = (alunoSelecionado ? data.filter(r => String(r.matricula || "") === String(alunoSelecionado)) : data)
      .map(row => ({ ...row, total_f: numeroFaltasApoia(row), maior_sequencia_f: maiorSequenciaApoia(row) }));
    state.absenceAlerts = rows;
    $("#absence-rule-alt-title") && ($("#absence-rule-alt-title").textContent = `Mais de ${String(faltasAlt).padStart(2,"0")} faltas intercaladas`);
    $("#absence-rule-alt-text") && ($("#absence-rule-alt-text").textContent = `Conta código F no intervalo de ${dias} dia(s) anteriores à data de referência.`);
    $("#absence-rule-consecutive-title") && ($("#absence-rule-consecutive-title").textContent = `${String(faltasCons).padStart(2,"0")} faltas consecutivas`);
    $("#absence-rule-consecutive-text") && ($("#absence-rule-consecutive-text").textContent = `Verifica sequência de ${String(faltasCons).padStart(2,"0")} códigos F nas datas válidas da turma.`);
    $("#absence-alert-period").textContent = `${start} a ${ref}`;
    $("#absence-alert-total").textContent = formatNumber(rows.length);
    $("#absence-alert-intercaladas").textContent = formatNumber(rows.filter(r=>String(r.criterio_acionamento||"").includes("ALTERN")).length);
    $("#absence-alert-consecutivas").textContent = formatNumber(rows.filter(r=>String(r.criterio_acionamento||"").includes("CONSEC")).length);
    $("#absence-alert-max").textContent = formatNumber(Math.max(0, ...rows.map(r=>Number(r.total_f||0))));
    const empty = `<tr><td class="empty-cell" colspan="9">Nenhum aluno em alerta para os critérios selecionados.</td></tr>`;
    $("#absence-alert-body").innerHTML = rows.map(r => `<tr><td>${escapeHtml(r.aluno_nome || r.nome_aluno)}</td><td>${escapeHtml(r.matricula)}</td><td>${escapeHtml(r.coordenacao_nome)}</td><td>${escapeHtml(r.turma)}</td><td>${formatNumber(r.total_f)}</td><td>${formatNumber(r.maior_sequencia_f)}</td><td>${escapeHtml(r.criterio_acionamento)}</td><td class="absence-dates">${escapeHtml(r.datas_faltas || [r.primeira_ausencia, r.ultima_ausencia].filter(Boolean).join(" a "))}</td><td><button class="button secondary small council-row-button" data-matricula="${escapeHtml(r.matricula)}" data-turma="${escapeHtml(r.turma)}" data-student-action="council-individual">Emitir relatório individual ao Conselho Tutelar</button></td></tr>`).join("") || empty;
    $$('[data-student-action="council-individual"]').forEach(b => b.addEventListener("click", () => openCouncilReportIndividual(b.dataset.matricula, b.dataset.turma)));
  } catch(e){ toast(`Erro ao gerar APOIA: ${e.message}`, "error"); }
  finally { setLoading(false); }
}

function clearAbsence(){ state.absenceAlerts=[]; $("#absence-alert-body").innerHTML=emptyCell("Selecione os filtros e clique em Gerar relatório.",9); ["absence-alert-total","absence-alert-intercaladas","absence-alert-consecutivas","absence-alert-max"].forEach(id=>$("#"+id).textContent="0"); }



const LOTES_TURMAS = {
  1: ["601","602","603","604","701","702","703","704","705","706","901","902","903","904","905","801","802","803","804","805","101","102","103","104","105","106","210"],
  2: ["309","310","906","201","202","203","204","205","206","207","208","209","301","302","303","304","305","306","307","308","771","991","611","612","613","614","615"],
  3: ["711","712","714","715","716","811","812","813","814","815","911","912","913","914","915","119","120","121","213","311","312","313","314","773","123","124","211"],
  4: ["212","122","214","215","216","217","111","112","113","114","115","116","117","118","772","992","131","132","231","232","331","332","353","361","451","551"]
};

function statusClass(status) {
  const s = String(status || "").toUpperCase();
  if (s === "CONCLUIDA") return "ok";
  if (s === "EM_ANDAMENTO") return "pending";
  if (["ERRO", "FALHA", "CANCELADA"].includes(s)) return "danger";
  return "off";
}
function turmaAtualDoRegistro(row) {
  const msg = String(row?.mensagem || "");
  const m = msg.match(/turma\s+(\d{3})/i);
  if (m) return m[1];
  const lote = Number(String(row?.origem || "").match(/lote_(\d)/)?.[1] || 0);
  const processadas = Number(row?.turmas_processadas || 0);
  const lista = LOTES_TURMAS[lote] || [];
  if (String(row?.status || "").toUpperCase() === "EM_ANDAMENTO" && processadas > 0) return lista[Math.min(processadas - 1, lista.length - 1)] || "";
  return "";
}

function fillMigrationDiagnosticClasses() {
  const el = $("#migration-diagnostic-class");
  if (!el) return;
  const current = el.value || "";
  const rows = [...state.classes].sort((a,b) => String(a.turma).localeCompare(String(b.turma), "pt-BR", { numeric:true }));
  el.innerHTML = `<option value="">Selecione uma turma</option>` + rows.map(c => `<option value="${escapeHtml(c.turma)}">${escapeHtml(c.turma)} — ${escapeHtml(c.setor || c.setorId || "")}</option>`).join("");
  if (current && rows.some(c => c.turma === current)) el.value = current;
}

function formatDateTimeBr(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("pt-BR", { dateStyle:"short", timeStyle:"medium" });
}

function formatDurationMs(value) {
  const ms = Number(value);
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60000) return `${(ms/1000).toLocaleString("pt-BR", { maximumFractionDigits:1 })} s`;
  return `${(ms/60000).toLocaleString("pt-BR", { maximumFractionDigits:1 })} min`;
}

function localIsoToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function migrationPeriodCriterionLabel(value) {
  const map = {
    PRIMEIRA_DATA_NAO_MIGRADA: "Primeira data letiva não migrada",
    PRIMEIRA_DIVERGENCIA_GOOGLE_POSTGRESQL: "Primeira divergência entre Google e PostgreSQL",
    ULTIMA_DATA_DISPONIVEL: "Última data disponível",
    DATA_INICIAL_INFORMADA_PELO_USUARIO: "Data inicial escolhida pelo usuário"
  };
  return map[String(value || "")] || String(value || "—").replaceAll("_", " ");
}

function syncMigrationPeriodControls() {
  const mode = $("#migration-diagnostic-period-mode")?.value || "automatico";
  const start = $("#migration-diagnostic-date-start");
  const end = $("#migration-diagnostic-date-end");
  const help = $("#migration-diagnostic-date-start-help");
  if (end && !end.value) end.value = localIsoToday();
  if (end) end.max = localIsoToday();
  if (start) {
    start.max = end?.value || localIsoToday();
    start.disabled = mode !== "personalizado";
    if (mode !== "personalizado") start.value = "";
  }
  if (help) help.textContent = mode === "personalizado"
    ? "Informe a data a partir da qual deseja comparar planilha e banco."
    : "No modo automático, o sistema localizará a primeira data não migrada ou a primeira divergência.";
}

function migrationSetMessage(message, type = "info") {
  const el = $("#migration-diagnostic-message");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", type === "error");
  el.classList.toggle("ok", type === "ok");
}

function migrationFact(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value ?? "—")}</dd></div>`;
}

function migrationStatusClass(status, categoria) {
  const s = String(status || "").toUpperCase();
  const c = String(categoria || "").toUpperCase();
  if (s === "OK" || c === "ATUALIZADA") return "ok";
  if (s === "ATENCAO" || ["IMPORTACAO_PENDENTE", "REALOCACAO_AUTOMATICA_PENDENTE"].includes(c)) return "warning";
  return "error";
}

function renderMigrationDiagnostic(data) {
  const results = $("#migration-diagnostic-results");
  if (!results) return;
  results.classList.remove("hidden");

  const d = data?.diagnostico || {};
  const dates = data?.datas || {};
  const period = data?.periodo || {};
  const pending = data?.pendencias || {};
  const source = data?.fonte || {};
  const sheet = data?.planilha || {};
  const pg = data?.postgresql || {};
  const links = data?.vinculos || {};
  const reconciliation = data?.reconciliacao_vinculos || {};
  const deep = data?.auditoria?.profunda || {};
  const history = Array.isArray(data?.historico_execucoes) ? data.historico_execucoes : [];
  const lastRun = history[0] || null;

  $("#migration-diagnostic-title").textContent = d.titulo || d.categoria || "Diagnóstico concluído";
  $("#migration-diagnostic-summary").textContent = d.resumo || "—";
  const badge = $("#migration-diagnostic-status-badge");
  if (badge) {
    badge.textContent = d.status || "—";
    badge.className = `migration-diagnostic-status-badge ${migrationStatusClass(d.status, d.categoria)}`;
  }
  const statusCard = $("#migration-diagnostic-status-card");
  if (statusCard) statusCard.className = `migration-diagnostic-status-card ${migrationStatusClass(d.status, d.categoria)}`;

  $("#migration-period-start").textContent = formatDateBr(period.data_inicio_analisada);
  $("#migration-period-end").textContent = formatDateBr(period.data_fim_analisada);
  $("#migration-period-criterion").textContent = migrationPeriodCriterionLabel(period.criterio_inicio);
  $("#migration-first-not-migrated").textContent = formatDateBr(period.primeira_data_nao_migrada);
  $("#migration-first-divergence").textContent = formatDateBr(period.primeira_data_divergencia_dados);
  $("#migration-first-failure").textContent = period.primeira_falha_registrada_em
    ? `${formatDateTimeBr(period.primeira_falha_registrada_em)}${period.primeira_falha_categoria ? ` • ${period.primeira_falha_categoria}` : ""}`
    : "—";

  $("#migration-google-last-date").textContent = formatDateBr(dates.ultima_data_google);
  $("#migration-db-last-date").textContent = formatDateBr(dates.ultima_data_postgresql);
  $("#migration-gap-days").textContent = dates.defasagem_dias == null ? "—" : `${formatNumber(dates.defasagem_dias)} dia(s)`;
  $("#migration-pending-frequency").textContent = formatNumber(pending.frequencias_a_inserir || 0);
  $("#migration-pending-days").textContent = formatNumber(pending.dias_letivos_a_criar || 0);
  $("#migration-pending-links").textContent = formatNumber(pending.vinculos_a_criar || 0);
  $("#migration-last-run").textContent = lastRun ? `${formatDateTimeBr(lastRun.iniciado_em)} • ${lastRun.status || "—"}` : "Sem log individual anterior";
  $("#migration-diagnostic-time").textContent = formatDurationMs(d.duracao_diagnostico_ms);

  $("#migration-confidence").textContent = `Classificação ${String(d.confianca || "").toLowerCase() || "não informada"}`;
  $("#migration-cause-summary").textContent = d.resumo || "—";
  $("#migration-cause-guidance").textContent = d.orientacao || "—";
  const tech = $("#migration-technical-error");
  if (tech) {
    const msg = data?.erro_tecnico || d?.etapa_falha ? `${d.etapa_falha ? `Etapa: ${d.etapa_falha}. ` : ""}${data?.erro_tecnico || ""}` : "";
    tech.textContent = msg;
    tech.classList.toggle("hidden", !msg);
  }

  const sf = $("#migration-source-facts");
  if (sf) sf.innerHTML = [
    migrationFact("Fonte", source.codigo || "—"),
    migrationFact("Nome", source.nome || "—"),
    migrationFact("Aba", source.aba || d.turma || "—"),
    migrationFact("Coordenação efetiva", source.coordenacao_efetiva || "—"),
    migrationFact("Cabeçalho", sheet.cabecalho_linha ? `Linha ${sheet.cabecalho_linha}` : "—"),
    migrationFact("Bloco de frequência", sheet.bloco_frequencia ? `${sheet.bloco_frequencia.coluna_inicial || "?"}:${sheet.bloco_frequencia.coluna_final || "?"}` : "—"),
  ].join("");

  const cf = $("#migration-consistency-facts");
  if (cf) cf.innerHTML = [
    migrationFact("Alunos na planilha", formatNumber(sheet.alunos || 0)),
    migrationFact("Ativos / transferidos", `${formatNumber(sheet.ativos || 0)} / ${formatNumber(sheet.transferidos || 0)}`),
    migrationFact("Dias Google no período", formatNumber(period.dias_letivos_google_no_periodo || 0)),
    migrationFact("Dias banco no período", formatNumber(period.dias_letivos_postgresql_no_periodo || 0)),
    migrationFact("Frequências Google no período", formatNumber(period.frequencias_google_no_periodo || sheet.frequencias_no_periodo || 0)),
    migrationFact("Frequências banco no período", formatNumber(period.frequencias_postgresql_no_periodo || 0)),
    migrationFact("Divergências no período", formatNumber(period.divergencias_no_periodo || 0)),
    migrationFact("Códigos não reconhecidos no período", formatNumber(sheet.nao_reconhecidos_no_periodo || 0)),
  ].join("");

  const sheetErrors = Array.isArray(sheet.erros) ? sheet.erros : [];
  const sheetBody = $("#migration-sheet-errors-body");
  if (sheetBody) sheetBody.innerHTML = sheetErrors.length ? sheetErrors.map(e => `<tr>
    <td>${escapeHtml(e.tipo || "—")}</td>
    <td>${escapeHtml(formatDateBr(e.data || e.data_atual || ""))}</td>
    <td>${escapeHtml([e.aluno, e.matricula].filter(Boolean).join(" • ") || "—")}</td>
    <td>${escapeHtml([e.linha ? `linha ${e.linha}` : "", e.coluna ? `coluna ${e.coluna}` : "", e.coluna_repetida ? `coluna ${e.coluna_repetida}` : ""].filter(Boolean).join(" • ") || "—")}</td>
    <td>${escapeHtml(e.valor_encontrado || e.cabecalho_repetido || e.data_anterior || "—")}</td>
  </tr>`).join("") : emptyCell("Nenhum erro estrutural ou código inválido encontrado na planilha.", 5);

  const conflicts = Array.isArray(links.conflitos) ? links.conflitos : [];
  const approvedMoves = Array.isArray(reconciliation.aprovadas) ? reconciliation.aprovadas : [];
  const blockedMoves = Array.isArray(reconciliation.bloqueadas) ? reconciliation.bloqueadas : [];
  const approvedByMatricula = new Map(approvedMoves.map(x => [String(x.matricula || ""), x]));
  const blockedByMatricula = new Map(blockedMoves.map(x => [String(x.matricula || ""), x]));
  const linkBody = $("#migration-link-conflicts-body");
  if (linkBody) linkBody.innerHTML = conflicts.length ? conflicts.map(c => {
    const mat = String(c.matricula || "");
    const approved = approvedByMatricula.get(mat);
    const blocked = blockedByMatricula.get(mat);
    const resolution = approved
      ? `REALOCACAO_AUTOMATICA_APROVADA • ${approved.motivo || "origem anterior validada"}`
      : (blocked ? `BLOQUEADO • ${blocked.motivo_reconciliacao || c.motivo || "conflito nas fontes"}` : (c.motivo || "—"));
    return `<tr>
      <td>${escapeHtml(c.nome_planilha || c.nome_planilha_118 || c.nome_postgresql || "—")}</td>
      <td>${escapeHtml(mat || "—")}</td>
      <td>${escapeHtml(d.turma || links.turma_diagnosticada || "—")}</td>
      <td>${escapeHtml(c.turma_ativa_existente || "—")}</td>
      <td>${escapeHtml(c.coordenacao_nome_existente || c.coordenacao_codigo_existente || "—")}</td>
      <td>${escapeHtml(resolution)}</td>
    </tr>`;
  }).join("") : emptyCell("Nenhum conflito de vínculo ativo encontrado.", 6);

  const divergences = Array.isArray(deep.divergencias) ? deep.divergencias : [];
  const auditBody = $("#migration-audit-body");
  if (auditBody) auditBody.innerHTML = divergences.length ? divergences.map(x => `<tr>
    <td>${escapeHtml(x.tipo || "—")}</td>
    <td>${escapeHtml(formatDateBr(x.data || ""))}</td>
    <td>${escapeHtml([x.nome, x.matricula].filter(Boolean).join(" • ") || "—")}</td>
    <td>${escapeHtml(x.codigo_google || "—")}</td>
    <td>${escapeHtml(x.codigo_postgresql || (Array.isArray(x.codigos_postgresql) ? x.codigos_postgresql.join(", ") : "—"))}</td>
  </tr>`).join("") : emptyCell("Nenhuma divergência célula a célula encontrada.", 5);

  const histBody = $("#migration-history-body");
  if (histBody) histBody.innerHTML = history.length ? history.map(h => `<tr>
    <td>${escapeHtml(formatDateTimeBr(h.iniciado_em))}</td>
    <td>${escapeHtml(formatDateTimeBr(h.finalizado_em))}</td>
    <td>${escapeHtml(h.origem || "—")}${h.lote ? ` • lote ${escapeHtml(h.lote)}` : ""}</td>
    <td>${escapeHtml(h.status || "—")}</td>
    <td>${escapeHtml(formatDurationMs(h.duracao_ms))}</td>
    <td>${escapeHtml(h.categoria_erro || "—")}</td>
    <td>${escapeHtml(h.mensagem || "—")}</td>
  </tr>`).join("") : emptyCell("Ainda não há histórico individual. Ele começará a ser registrado nas próximas importações após instalar este pacote.", 7);
}

async function runMigrationDiagnostic() {
  const turma = $("#migration-diagnostic-class")?.value || "";
  const token = $("#migration-diagnostic-token")?.value.trim() || "";
  const mode = $("#migration-diagnostic-period-mode")?.value || "automatico";
  const dateStart = $("#migration-diagnostic-date-start")?.value || "";
  const dateEnd = $("#migration-diagnostic-date-end")?.value || localIsoToday();
  if (!turma) return migrationSetMessage("Selecione uma turma.", "error");
  if (!token) return migrationSetMessage("Informe a chave administrativa IEE_IMPORT_TOKEN.", "error");
  if (mode === "personalizado" && !dateStart) return migrationSetMessage("Informe a data inicial do diagnóstico personalizado.", "error");
  if (dateStart && dateEnd && dateStart > dateEnd) return migrationSetMessage("A data inicial não pode ser posterior à data final.", "error");

  const btn = $("#migration-diagnostic-run");
  const original = btn?.textContent || "Executar diagnóstico completo";
  if (btn) { btn.disabled = true; btn.textContent = "Diagnosticando..."; }
  setLoading(true);
  migrationSetMessage(`Analisando a turma ${turma}: planilha, banco, vínculos, auditoria e histórico...`);
  try {
    const params = new URLSearchParams({
      acao: "diagnostico_completo",
      turma,
      dry_run: "true",
      limite: "200",
      modo_periodo: mode,
      data_fim: dateEnd
    });
    if (mode === "personalizado" && dateStart) params.set("data_inicio", dateStart);
    const url = `${SUPABASE_URL}/functions/v1/importar-frequencia?${params.toString()}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "x-iee-token": token, "apikey": SUPABASE_PUBLISHABLE_KEY }
    });
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok || !body?.ok) throw new Error(body?.mensagem || body?.erro || `Falha no diagnóstico (HTTP ${response.status}).`);
    renderMigrationDiagnostic(body);
    const status = body?.diagnostico?.status || "concluído";
    const p = body?.periodo || {};
    migrationSetMessage(
      `Diagnóstico da turma ${turma} concluído: ${status}. Período analisado: ${formatDateBr(p.data_inicio_analisada)} a ${formatDateBr(p.data_fim_analisada)}.`,
      status === "OK" ? "ok" : "info"
    );
  } catch (e) {
    migrationSetMessage(`Erro ao diagnosticar a turma ${turma}: ${e.message}`, "error");
    toast(`Diagnóstico: ${e.message}`, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = original; }
    setLoading(false);
  }
}


async function runMigrationUpdate() {
  const turma = $("#migration-diagnostic-class")?.value || "";
  const token = $("#migration-diagnostic-token")?.value.trim() || "";
  const mode = $("#migration-diagnostic-period-mode")?.value || "automatico";
  const dateStart = $("#migration-diagnostic-date-start")?.value || "";
  const dateEnd = $("#migration-diagnostic-date-end")?.value || "";

  if (!turma) return migrationSetMessage("Selecione uma turma.", "error");
  if (!token) return migrationSetMessage("Informe a chave administrativa IEE_IMPORT_TOKEN.", "error");
  if (mode !== "personalizado") {
    return migrationSetMessage("Para atualizar uma turma especifica, selecione Periodo personalizado e informe a data inicial e final.", "error");
  }
  if (!dateStart || !dateEnd) return migrationSetMessage("Informe a data inicial e a data final da atualizacao.", "error");
  if (dateStart > dateEnd) return migrationSetMessage("A data inicial nao pode ser posterior a data final.", "error");

  if (!confirm(`Atualizar somente a turma ${turma}, no periodo de ${formatDateBr(dateStart)} a ${formatDateBr(dateEnd)}?`)) return;

  const btn = $("#migration-diagnostic-update");
  const original = btn?.textContent || "Atualizar esta turma";
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Atualizando...";
  }

  setLoading(true);
  migrationSetMessage(`Atualizando somente a turma ${turma}, de ${formatDateBr(dateStart)} a ${formatDateBr(dateEnd)}...`);

  try {
    const ano = String(dateEnd).slice(0, 4) || "2026";
    const params = new URLSearchParams({
      acao: "importar",
      turma,
      dry_run: "false",
      confirmar: `IMPORTAR_${turma}_${ano}`,
      modo_periodo: "personalizado",
      data_inicio: dateStart,
      data_fim: dateEnd
    });

    const response = await fetch(`${SUPABASE_URL}/functions/v1/importar-frequencia?${params.toString()}`, {
      method: "GET",
      headers: {
        "x-iee-token": token,
        "apikey": SUPABASE_PUBLISHABLE_KEY
      }
    });

    let body = null;
    try { body = await response.json(); } catch { body = null; }

    if (!response.ok || !body?.ok) {
      throw new Error(body?.mensagem || body?.erro || `Falha na atualizacao (HTTP ${response.status}).`);
    }

    const r = body?.resultado || {};
    migrationSetMessage(
      `Turma ${turma} atualizada com sucesso. Frequencias processadas: ${formatNumber(r.frequencias || 0)}. Periodo: ${formatDateBr(dateStart)} a ${formatDateBr(dateEnd)}.`,
      "ok"
    );
    toast(`Turma ${turma} atualizada com sucesso.`);

    await runMigrationDiagnostic();
  } catch (e) {
    const msg = String(e?.message || e || "");
    const low = msg.toLowerCase();
    const amigavel = (
      low.includes("timeout") ||
      low.includes("57014") ||
      low.includes("statement timeout")
    )
      ? "Timeout do banco de dados. A atualizacao nao foi confirmada; execute o diagnostico antes de tentar novamente."
      : msg;

    migrationSetMessage(`Erro ao atualizar a turma ${turma}: ${amigavel}`, "error");
    toast(`Atualizacao da turma ${turma}: ${amigavel}`, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = original;
    }
    setLoading(false);
  }
}

function migrationGeneralSetMessage(message, type = "info") {
  const el = $("#migration-general-message");
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("error", type === "error");
  el.classList.toggle("ok", type === "ok");
}

function migrationGeneralBadge(row) {
  const status = String(row?.status || "").toUpperCase();
  const categoria = String(row?.categoria || "").toUpperCase();
  const cls = status === "OK" ? "ok" : status === "ATENCAO" ? "warning" : "error";
  const labelMap = {
    OK: "OK",
    ERRO_MIGRACAO: "Erro de migração",
    ERRO_VINCULO: "Erro de vínculo",
    FONTE_FISICA_DIVERGENTE: "Fonte física divergente",
    MULTIPLAS_FONTES_CONFIGURADAS: "Múltiplas fontes",
    ERRO_RELATORIO: "Erro de relatório",
    CACHE_PENDENTE: "Cache pendente",
    ERRO_PLANILHA: "Erro de planilha",
    CABECALHO_PLANILHA: "Cabeçalho inválido",
    DATA_DUPLICADA_PLANILHA: "Data duplicada",
    DATA_NAO_ENCONTRADA_PLANILHA: "Data não encontrada"
  };
  return `<span class="migration-general-badge ${cls}">${escapeHtml(labelMap[categoria] || categoria || status || "—")}</span>`;
}

function migrationGeneralMetric(m) {
  const x = m || {};
  return `<div class="migration-general-metric"><strong>${formatNumber(x.presencas || 0)} P</strong><span>${formatNumber(x.faltas || 0)} F</span><small>${formatNumber(x.sem_lancamento || 0)} sem</small></div>`;
}

function migrationGeneralMatchesFilter(row, filter) {
  if (!filter || filter === "TODOS") return true;
  if (filter === "ERRO") return String(row.status || "").toUpperCase() === "ERRO";
  if (filter === "ATENCAO") return String(row.status || "").toUpperCase() === "ATENCAO";
  return String(row.categoria || "").toUpperCase() === filter;
}

function renderMigrationGeneralTable() {
  const body = $("#migration-general-body");
  if (!body) return;
  const filter = $("#migration-general-filter")?.value || "TODOS";
  const rows = (state.migrationGeneralRows || []).filter(r => migrationGeneralMatchesFilter(r, filter));
  body.innerHTML = rows.length ? rows.map(r => {
    const divs = Number(r.divergencias_google_banco || 0) + Number(r.divergencias_vinculo || 0) + Number(r.divergencias_relatorio || 0);
    const detalhe = [r.mensagem || "", divs ? `${divs} divergência(s)` : "", r.coluna_data ? `coluna ${r.coluna_data}` : ""].filter(Boolean).join(" • ");
    return `<tr>
      <td><strong>${escapeHtml(r.turma || "—")}</strong><small>${escapeHtml(r.turno || "")}</small></td>
      <td>${escapeHtml(r.fonte || "—")}<small>${escapeHtml(r.fonte_nome || "")}</small></td>
      <td>${escapeHtml(r.coordenacao_logica || "—")}</td>
      <td>${migrationGeneralMetric(r.google)}</td>
      <td>${migrationGeneralMetric(r.postgresql)}</td>
      <td>${migrationGeneralMetric(r.relatorio)}</td>
      <td>${migrationGeneralBadge(r)}</td>
      <td>${escapeHtml(detalhe || "—")}</td>
      <td><button class="button secondary migration-general-diagnose" data-turma="${escapeHtml(r.turma || "")}" type="button">Diagnosticar</button></td>
    </tr>`;
  }).join("") : emptyCell("Nenhuma turma corresponde ao filtro selecionado.", 9);

  $$(".migration-general-diagnose").forEach(btn => btn.addEventListener("click", async () => {
    const turma = btn.dataset.turma || "";
    const data = $("#migration-general-date")?.value || localIsoToday();
    const token = $("#migration-general-token")?.value || "";
    setView("migration-diagnostic");
    fillMigrationDiagnosticClasses();
    if ($("#migration-diagnostic-class")) $("#migration-diagnostic-class").value = turma;
    if ($("#migration-diagnostic-token")) $("#migration-diagnostic-token").value = token;
    if ($("#migration-diagnostic-period-mode")) $("#migration-diagnostic-period-mode").value = "personalizado";
    syncMigrationPeriodControls();
    if ($("#migration-diagnostic-date-start")) $("#migration-diagnostic-date-start").value = data;
    if ($("#migration-diagnostic-date-end")) $("#migration-diagnostic-date-end").value = data;
    migrationSetMessage(`Turma ${turma} preparada para diagnóstico detalhado em ${formatDateBr(data)}.`);
  }));
}


function renderMigrationGeneralPendencias() {
  const body = $("#migration-general-pending-body");
  if (!body) return;
  const pendencias = (state.migrationGeneralRows || [])
    .flatMap(r => Array.isArray(r.erros_planilha_amostra) ? r.erros_planilha_amostra : []);
  const count = $("#migration-general-pending-count");
  if (count) count.textContent = formatNumber(pendencias.length);
  body.innerHTML = pendencias.length ? pendencias.map(p => `<tr>
    <td>${escapeHtml(p.planilha || p.fonte || "—")}</td>
    <td><strong>${escapeHtml(p.turma || p.aba || "—")}</strong></td>
    <td>${escapeHtml(p.aluno || "—")}</td>
    <td>${escapeHtml(p.matricula || "—")}</td>
    <td>${escapeHtml(p.data ? formatDateBr(p.data) : "—")}</td>
    <td>${escapeHtml(p.linha ?? "—")}</td>
    <td>${escapeHtml(p.coluna || "—")}</td>
    <td><strong>${escapeHtml(p.valor_encontrado || p.valor || "—")}</strong></td>
    <td>${escapeHtml(p.situacao || "PENDENTE_CORRECAO")}</td>
  </tr>`).join("") : emptyCell("Nenhuma pendência de planilha identificada.", 9);
}

function renderMigrationGeneral(data) {
  const results = $("#migration-general-results");
  if (results) results.classList.remove("hidden");
  const resumo = data?.resumo || {};
  state.migrationGeneralRows = Array.isArray(data?.turmas) ? data.turmas : [];
  state.migrationGeneralMeta = data || null;
  $("#migration-general-total").textContent = formatNumber(resumo.turmas || 0);
  $("#migration-general-ok").textContent = formatNumber(resumo.ok || 0);
  $("#migration-general-warning").textContent = formatNumber(resumo.atencao || 0);
  $("#migration-general-error").textContent = formatNumber(resumo.erro || 0);
  $("#migration-general-cache").textContent = data?.cache?.atualizado_em ? formatDateTimeBr(data.cache.atualizado_em) : "Não localizado";
  $("#migration-general-time").textContent = formatDurationMs(resumo.duracao_ms);
  renderMigrationGeneralTable();
  renderMigrationGeneralPendencias();
}
async function runMigrationGeneralAudit() {
  const date = $("#migration-general-date")?.value || localIsoToday();
  const token = $("#migration-general-token")?.value.trim() || "";
  if (!date) return migrationGeneralSetMessage("Informe a data da auditoria.", "error");
  if (!token) return migrationGeneralSetMessage("Informe a chave administrativa IEE_IMPORT_TOKEN.", "error");
  const btn = $("#migration-general-run");
  const original = btn?.textContent || "Auditar todas as turmas";
  if (btn) { btn.disabled = true; btn.textContent = "Auditando..."; }
  setLoading(true);
  migrationGeneralSetMessage(`Auditando todas as turmas em ${formatDateBr(date)}. A leitura compara Google, PostgreSQL, relatório e cache...`);
  try {
    const params = new URLSearchParams({ acao: "auditoria_geral_data", data: date, dry_run: "true" });
    const response = await fetch(`${SUPABASE_URL}/functions/v1/importar-frequencia?${params.toString()}`, {
      method: "GET",
      headers: { "x-iee-token": token, "apikey": SUPABASE_PUBLISHABLE_KEY }
    });
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok || !body?.ok) throw new Error(body?.mensagem || body?.erro || `Falha na auditoria geral (HTTP ${response.status}).`);
    renderMigrationGeneral(body);
    const resumo = body.resumo || {};
    migrationGeneralSetMessage(`Auditoria concluída: ${formatNumber(resumo.ok || 0)} OK, ${formatNumber(resumo.atencao || 0)} atenção e ${formatNumber(resumo.erro || 0)} erro(s).`, Number(resumo.erro || 0) ? "info" : "ok");
  } catch (e) {
    migrationGeneralSetMessage(`Erro na auditoria geral: ${e.message}`, "error");
    toast(`Auditoria geral: ${e.message}`, "error");
  } finally {
    setLoading(false);
    if (btn) { btn.disabled = false; btn.textContent = original; }
  }
}

function renderAdminLotes(history = []) {
  const root = $("#admin-lotes-grid");
  if (!root) return;
  root.innerHTML = [1,2,3,4].map(lote => {
    const lista = LOTES_TURMAS[lote] || [];
    const ultimo = history
      .filter(r => String(r.origem || "") === `automatica_lote_${lote}`)
      .sort((a,b) => new Date(b.iniciado_em || 0).getTime() - new Date(a.iniciado_em || 0).getTime())[0];
    const status = ultimo?.status || "Aguardando";
    const atual = turmaAtualDoRegistro(ultimo);
    const processadas = Number(ultimo?.turmas_processadas || 0);
    const previstas = Number(ultimo?.turmas_previstas || lista.length);
    const badgeClass = statusClass(status);
    const turmasHtml = lista.map((t, idx) => {
      const done = String(status).toUpperCase() === "CONCLUIDA" || (String(status).toUpperCase() === "EM_ANDAMENTO" && idx < processadas);
      const current = atual && t === atual && String(status).toUpperCase() === "EM_ANDAMENTO";
      return `<span class="lote-turma-chip ${done ? "done" : ""} ${current ? "current" : ""}">${escapeHtml(t)}</span>`;
    }).join("");
    return `<article class="lote-card lote-card-${lote}">
      <div class="lote-card-head">
        <div><strong>Lote ${lote}</strong><span>${lista.length} turma(s)</span></div>
        <span class="badge ${badgeClass}">${escapeHtml(status)}</span>
      </div>
      <div class="lote-progress-text">${formatNumber(processadas)} / ${formatNumber(previstas)} processada(s)${atual ? ` • turma atual: ${escapeHtml(atual)}` : ""}</div>
      <div class="lote-chip-list">${turmasHtml}</div>
      <div class="lote-last-msg">${ultimo ? escapeHtml(ultimo.mensagem || fmtDateTime(ultimo.finalizado_em || ultimo.iniciado_em)) : "Nenhuma execução registrada."}</div>
    </article>`;
  }).join("");
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function fmtDateTime(v) { return v ? new Date(v).toLocaleString("pt-BR") : "—"; }
async function loadUpdateHistory(limit = 20) {
  try { return await rpc("fn_ultimas_atualizacoes_frequencia", { p_limite: limit }); }
  catch { return []; }
}
async function renderAdmin() {
  try {
    const cache = await rpc("fn_painel_cache_frequencia", {});
    const history = await loadUpdateHistory(20);
    const total = dashboardTotalsFromRows(state.classes);
    const lastCache = cache?.[0]?.atualizado_em || null;
    renderAdminLotes(history);
    const lastRows = history.slice(0, 5);
    const erros = history.reduce((acc, r) => acc + Number(r.turmas_erro || 0), 0);
    const criticos = history.filter(r => String(r.status || "").toUpperCase() !== "CONCLUIDA" || Number(r.turmas_erro || 0) > 0).length;
    $("#admin-data-status") && ($("#admin-data-status").textContent = criticos ? "Atenção" : "Ativo");
    $("#admin-data-last-sync") && ($("#admin-data-last-sync").textContent = fmtDateTime(lastCache));
    $("#admin-data-origin") && ($("#admin-data-origin").textContent = "Supabase");
    $("#admin-data-classes") && ($("#admin-data-classes").textContent = formatNumber(state.classes.length));
    $("#admin-data-students") && ($("#admin-data-students").textContent = formatNumber(total.students));
    $("#admin-data-sources") && ($("#admin-data-sources").textContent = "11 / 107");
    $("#admin-data-errors") && ($("#admin-data-errors").textContent = formatNumber(erros));
    $("#admin-data-critical") && ($("#admin-data-critical").textContent = formatNumber(criticos));
    $("#admin-data-updated") && ($("#admin-data-updated").textContent = lastCache ? `Cache atualizado em ${fmtDateTime(lastCache)}.` : "Cache ainda não localizado.");
    $("#admin-data-alerts") && ($("#admin-data-alerts").innerHTML = criticos ? `<div class="council-warning">Há rotina em andamento, erro ou pendência no histórico recente.</div>` : `<div class="empty-cell">Rotina Supabase/Cron sem alertas críticos no histórico recente.</div>`);
    $("#admin-economy-status") && ($("#admin-economy-status").textContent = "Ativo");
    $("#admin-economy-schedule") && ($("#admin-economy-schedule").textContent = "07:30 • 10:30 • 14:30 • 18:30");
    $("#admin-economy-writes") && ($("#admin-economy-writes").textContent = "Sob demanda");
    $("#admin-economy-unchanged") && ($("#admin-economy-unchanged").textContent = "—");
    $("#admin-economy-daily-written") && ($("#admin-economy-daily-written").textContent = formatNumber(history.length));
    $("#admin-economy-daily-skip") && ($("#admin-economy-daily-skip").textContent = "—");
    $("#admin-economy-backups") && ($("#admin-economy-backups").textContent = "Firestore bloqueado");
    $("#admin-economy-memory") && ($("#admin-economy-memory").textContent = "Supabase Edge");
    $("#admin-economy-note") && ($("#admin-economy-note").textContent = "Atualização automática ativa via Supabase Cron. A atualização manual apenas antecipa uma rotina extra e não cancela os horários automáticos.");
    const syncBody = $("#admin-sync-jobs-body");
    if (syncBody) {
      syncBody.innerHTML = history.map(r => `<tr><td>${escapeHtml(fmtDateTime(r.iniciado_em))}</td><td>${escapeHtml(r.origem)}</td><td><span class="badge ${String(r.status).toUpperCase()==="CONCLUIDA" ? "ok" : "pending"}">${escapeHtml(r.status)}</span></td><td>${formatNumber(r.turmas_processadas)} / ${formatNumber(r.turmas_previstas)}</td><td>${r.cache_atualizado ? "Cache atualizado" : "—"}</td><td>${formatNumber(r.turmas_erro)}</td><td>${escapeHtml(r.mensagem || "")}</td></tr>`).join("") || emptyCell("Nenhuma atualização localizada.", 7);
    }
    const alertBody = $("#admin-alert-details-body");
    if (alertBody) alertBody.innerHTML = criticos ? history.filter(r => String(r.status || "").toUpperCase() !== "CONCLUIDA" || Number(r.turmas_erro || 0) > 0).map(r => `<tr><td>Rotina</td><td>${escapeHtml(r.origem)}</td><td>${escapeHtml(r.mensagem || r.status)}</td><td>Verificar histórico e logs da Edge Function.</td></tr>`).join("") : `<tr><td colspan="4" class="empty-cell">Nenhum aviso crítico no histórico recente.</td></tr>`;
  } catch (e) { toast(`Erro ao carregar administração: ${e.message}`, "error"); }
}
function renderAdminDetails() {
  const rows = [
    ["Base de dados", "Supabase", "Painel oficial operando sem Firestore", "Manter Cron e cache ativos"],
    ["Firestore", "Firebase", "Bloqueado pelas Rules e mantido apenas como legado", "Não excluir ainda; preservar rollback"],
    ["Importação", "Supabase Edge Function", "Lotes automáticos e atualização manual sob demanda", "Acompanhar histórico de rotinas"],
    ["Agendamento", "Supabase Cron", "20 jobs ativos: 4 ciclos diários com 5 etapas", "Conferir job_run_details em caso de falha"]
  ];
  const html = rows.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join("");
  ["#admin-details-alerts-body", "#admin-details-permissions-body", "#admin-details-sources-body", "#admin-details-structural-body", "#admin-details-codes-body"].forEach(sel => { if($(sel)) $(sel).innerHTML = html; });
}
function adminSetActionMessage(message) {
  const el = $("#admin-action-result");
  if (el) el.textContent = message;
}
function adminToggleButtons(disabled) {
  ["#admin-run-sync", "#admin-run-lote-1", "#admin-run-lote-2", "#admin-run-lote-3", "#admin-run-lote-4", "#admin-run-cache"].forEach(sel => {
    const b = $(sel);
    if (b) b.disabled = disabled;
  });
}
function latestLoteFromHistory(history, lote, startedAtIso, toleranceMinutes = 3) {
  const started = new Date(startedAtIso).getTime() - toleranceMinutes * 60000;
  return history
    .filter(r => String(r.origem || "") === `automatica_lote_${lote}`)
    .filter(r => new Date(r.iniciado_em).getTime() >= started)
    .sort((a, b) => new Date(b.iniciado_em).getTime() - new Date(a.iniciado_em).getTime())[0];
}
async function waitForManualLote(lote, startedAtIso, options = {}) {
  const maxChecks = Number(options.maxChecks || 240); // 240 x 5s = até 20 minutos
  const label = options.label || `Lote ${lote}`;
  for (let i = 0; i < maxChecks; i++) {
    const history = await loadUpdateHistory(60);
    renderAdminLotes(history);
    const row = latestLoteFromHistory(history, lote, startedAtIso, 3);
    if (row) {
      adminSetActionMessage(`${label}: ${row.status} — ${row.turmas_processadas}/${row.turmas_previstas} turma(s). ${row.mensagem || ""}`);
      const status = String(row.status || "").toUpperCase();
      if (status === "CONCLUIDA") {
        if (Number(row.turmas_erro || 0) > 0) throw new Error(`Lote ${lote} concluiu com ${row.turmas_erro} erro(s).`);
        return row;
      }
      if (["ERRO", "FALHA", "CANCELADA", "INTERROMPIDA"].includes(status)) throw new Error(`Lote ${lote}: ${row.mensagem || row.status}`);
    }
    await sleep(5000);
  }
  const finalHistory = await loadUpdateHistory(60);
  renderAdminLotes(finalHistory);
  const finalRow = latestLoteFromHistory(finalHistory, lote, startedAtIso, 10);
  if (finalRow && String(finalRow.status || "").toUpperCase() === "CONCLUIDA" && Number(finalRow.turmas_erro || 0) === 0) {
    return finalRow;
  }
  throw new Error(`Tempo excedido aguardando conclusão do lote ${lote}. Não avance para o próximo lote até conferir o histórico.`);
}
async function runManualLote(lote) {
  const ok = confirm(`Executar manualmente apenas o lote ${lote}? A rotina automática continuará ativa normalmente.`);
  if (!ok) return;
  const btn = $(`#admin-run-lote-${lote}`);
  const original = btn?.textContent || `Rodar lote ${lote}`;
  adminToggleButtons(true);
  if (btn) btn.textContent = `Lote ${lote} em execução...`;
  setLoading(true);
  try {
    const startedAtIso = new Date().toISOString();
    adminSetActionMessage(`Disparando lote ${lote} pelo Supabase...`);
    await rpc("fn_admin_disparar_lote_frequencia", { p_lote: lote });
    const row = await waitForManualLote(lote, startedAtIso);
    await renderAdmin();
    toast(`Lote ${lote} concluído com sucesso.`);
    adminSetActionMessage(`Lote ${lote} concluído: ${row.turmas_processadas}/${row.turmas_previstas} turma(s), ${row.turmas_erro} erro(s).`);
  } catch (e) {
    toast(`Erro no lote ${lote}: ${e.message}`, "error");
    adminSetActionMessage(`Erro no lote ${lote}: ${e.message}`);
  } finally {
    if (btn) btn.textContent = original;
    adminToggleButtons(false);
    setLoading(false);
  }
}
async function runManualCacheUpdate() {
  const ok = confirm("Atualizar somente o cache do painel agora? Use após concluir os lotes necessários.");
  if (!ok) return;
  const btn = $("#admin-run-cache");
  const original = btn?.textContent || "Atualizar cache";
  adminToggleButtons(true);
  if (btn) btn.textContent = "Atualizando cache...";
  setLoading(true);
  try {
    adminSetActionMessage("Atualizando cache do painel pelo Supabase...");
    await rpc("fn_admin_atualizar_cache_frequencia", {});
    await loadBase();
    setupSelectors();
    await refreshCacheLabel();
    await renderAdmin();
    toast("Cache atualizado com sucesso.");
    adminSetActionMessage("Cache atualizado com sucesso. O horário do topo do painel deve refletir esta atualização.");
  } catch (e) {
    toast(`Erro ao atualizar cache: ${e.message}`, "error");
    adminSetActionMessage(`Erro ao atualizar cache: ${e.message}`);
  } finally {
    if (btn) btn.textContent = original;
    adminToggleButtons(false);
    setLoading(false);
  }
}
async function runManualSupabaseUpdate() {
  const ok = confirm("Agendar a sequência completa agora? O sistema criará um ciclo manual temporário: lote 1, lote 2, lote 3, lote 4 e cache, em horários escalonados nos próximos minutos. A rotina automática continuará ativa normalmente.");
  if (!ok) return;
  const btn = $("#admin-run-sync");
  const original = btn?.textContent || "Atualizar sequência completa";
  adminToggleButtons(true);
  if (btn) btn.textContent = "Agendando ciclo...";
  setLoading(true);
  try {
    adminSetActionMessage("Agendando ciclo manual Supabase. O navegador não precisa aguardar os lotes concluírem; acompanhe em Últimas atualizações e Turmas por lote.");
    const data = await rpc("fn_admin_agendar_ciclo_manual_frequencia", {});
    await renderAdmin();
    const info = Array.isArray(data) ? data[0] : data;
    const jobs = info?.jobs || info?.agendamentos || [];
    const resumo = Array.isArray(jobs) && jobs.length
      ? jobs.map(j => `${j.etapa || j.jobname}: ${j.horario_brasilia || j.horario}`).join(" | ")
      : "lote 1, lote 2, lote 3, lote 4 e cache agendados.";
    toast("Ciclo manual agendado com sucesso.");
    adminSetActionMessage(`Ciclo manual agendado. ${resumo} Use "Atualizar histórico" para acompanhar a execução.`);
  } catch(e) {
    toast(`Erro ao agendar sequência manual: ${e.message}`, "error");
    adminSetActionMessage(`Erro ao agendar sequência manual: ${e.message}. Use os botões individuais por lote, se necessário.`);
  } finally {
    if (btn) btn.textContent = original;
    adminToggleButtons(false);
    setLoading(false);
  }
}

function firstDefined(...values) {
  return values.find(v => v !== undefined && v !== null && String(v).trim() !== "");
}
function numeroFaltasApoia(row) {
  return Number(firstDefined(row.total_f, row.faltas_no_periodo, row.total_faltas, row.faltas_periodo, row.faltas_em_30_dias, 0) || 0);
}
function maiorSequenciaApoia(row) {
  return Number(firstDefined(row.maior_sequencia_f, row.maior_sequencia, row.sequencia_faltas, row.maior_sequencia_faltas, 0) || 0);
}
function isoToBr(iso) {
  const s = String(iso || "").slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso || "");
}
function splitDatasFaltasTexto(valor) {
  const texto = String(valor || "").trim();
  if (!texto) return [];
  const datas = texto.match(/\d{4}-\d{2}-\d{2}/g) || [];
  if (datas.length > 2 || /[,;\n]/.test(texto)) return [...new Set(datas)];
  return [];
}
function renderDatasFaltasPrint(datas) {
  const lista = [...new Set((datas || []).filter(Boolean).map(d => String(d).slice(0, 10)))].sort();
  if (!lista.length) return `<p>—</p>`;
  return `<div class="dates-list">${lista.map(d => `<span>${escapeHtml(isoToBr(d))}</span>`).join("")}</div>`;
}
async function obterDatasFaltasAluno(row, dataInicio, dataFim) {
  const jaListadas = splitDatasFaltasTexto(row.datas_faltas || row.datas || "");
  if (jaListadas.length) return jaListadas;
  try {
    const espelho = await rpc("fn_espelho_frequencia_aluno", {
      p_ano_letivo: ANO_LETIVO,
      p_matricula: String(row.matricula || ""),
      p_nome: "",
      p_turma: String(row.turma || ""),
      p_data_inicio: dataInicio,
      p_data_fim: dataFim
    });
    const aluno = Array.isArray(espelho) ? espelho[0] : null;
    const freqs = Array.isArray(aluno?.frequencias) ? aluno.frequencias : [];
    return freqs
      .filter(f => String(f.codigo || f.cod || "").trim().toUpperCase() === "F")
      .map(f => String(f.data || f.data_frequencia || "").slice(0, 10))
      .filter(Boolean);
  } catch (e) {
    console.warn("Não foi possível detalhar datas de faltas do APOIA", e);
    return splitDatasFaltasTexto(row.datas_faltas || row.datas || "");
  }
}


async function obterHistoricoAtendimentosAluno(row, dataFim) {
  try {
    const registros = await rpc("fn_historico_atendimentos_apoia", {
      p_ano_letivo: ANO_LETIVO,
      p_matricula: String(row.matricula || ""),
      p_turma: "",
      p_nome: "",
      p_data_inicio: `${ANO_LETIVO}-01-01`,
      p_data_fim: dataFim || todayIso()
    });
    return Array.isArray(registros)
      ? registros
          .filter(r => String(r.matricula || "") === String(row.matricula || ""))
          .sort((a,b) => String(a.competencia || "").localeCompare(String(b.competencia || "")))
      : [];
  } catch (e) {
    console.warn("Não foi possível carregar o histórico de atendimentos do APOIA", e);
    return [];
  }
}

function renderHistoricoAtendimentosPrint(registros) {
  const rows = (registros || []).filter(r =>
    String(r.observacao || "").trim() || String(r.justificativa || "").trim() ||
    String(r.encaminhamento || "").trim() || String(r.providencias || "").trim() ||
    String(r.dias_faltas || "").trim()
  );
  if (!rows.length) return `<div class="history-print-empty">Nenhum atendimento/observação histórica localizado para este estudante.</div>`;
  return `<div class="history-print-list">${rows.map(r => {
    const manual = String(r.tipo_registro || "").toUpperCase() === "MANUAL";
    const titulo = manual && r.data_atendimento ? `Atendimento em ${formatDateBr(r.data_atendimento)}` : historyMonthTitle(r.competencia);
    const observacao = String(r.observacao || "").trim();
    const justificativa = String(r.justificativa || "").trim();
    const encaminhamento = String(r.encaminhamento || "").trim();
    const providencias = String(r.providencias || "").trim();
    const situacao = String(r.situacao || "").trim();
    const responsavel = String(r.responsavel_atendimento || "").trim();
    const dias = String(r.dias_faltas || "").trim();
    const faltas = Number(r.total_faltas || 0);
    return `<article class="history-print-item ${manual ? "manual" : ""}"><div class="history-print-head"><strong>${escapeHtml(titulo)}</strong><span>${manual ? escapeHtml(responsavel || "Atendimento registrado") : `${formatNumber(faltas)} falta(s) registrada(s)`}</span></div>${observacao ? `<div class="history-print-field"><span>Observação</span><p>${escapeHtml(observacao)}</p></div>` : ""}${justificativa ? `<div class="history-print-field"><span>Justificativa</span><p>${escapeHtml(justificativa)}</p></div>` : ""}${encaminhamento ? `<div class="history-print-field"><span>Encaminhamento</span><p>${escapeHtml(encaminhamento)}</p></div>` : ""}${providencias ? `<div class="history-print-field"><span>Providências</span><p>${escapeHtml(providencias)}</p></div>` : ""}${situacao ? `<div class="history-print-field"><span>Situação</span><p>${escapeHtml(situacao)}</p></div>` : ""}${dias ? `<div class="history-print-field"><span>Dias registrados</span><p>${escapeHtml(dias.split(';').map(x => isoToBr(x.trim())).join(', '))}</p></div>` : ""}</article>`;
  }).join("")}</div>`;
}

async function buildCouncilReportHtml(rows) {
  const ref = $("#absence-date")?.value || todayIso();
  const dias = Math.max(1, Number($("#absence-days-window")?.value || 30));
  const faltasAlt = Math.max(1, Number($("#absence-alt-threshold")?.value || 7));
  const faltasCons = Math.max(1, Number($("#absence-consecutive-threshold")?.value || 5));
  const start = isoMinusDays(ref, dias);
  const enriched = await mapWithConcurrency(rows, 3, async r => {
    const [contato, datas, historico] = await Promise.all([
      r.__contato || getContatoAluno(r.matricula, r.turma || ""),
      obterDatasFaltasAluno(r, start, ref),
      obterHistoricoAtendimentosAluno(r, ref)
    ]);
    return { ...r, __contato: contato, __datas_faltas_detalhadas: datas, __historico_atendimentos: historico };
  });
  const pages = enriched.map(r => {
    const totalFaltas = numeroFaltasApoia(r);
    const maiorSeq = maiorSequenciaApoia(r);
    const datasContexto = Array.isArray(r.__datas_faltas_detalhadas) ? r.__datas_faltas_detalhadas.join("; ") : "";
    return `<section class="page"><header><div><span>Instituto Estadual de Educação</span><h1>Relatório de acompanhamento — Programa APOIA</h1><p>Encaminhamento pedagógico/institucional para análise da rede de proteção.</p></div></header><h2>Identificação do estudante</h2><div class="grid"><div><span>Aluno</span><strong>${escapeHtml(r.aluno_nome || r.nome_aluno || "—")}</strong></div><div><span>Matrícula</span><strong>${escapeHtml(r.matricula || "—")}</strong></div><div><span>Turma</span><strong>${escapeHtml(r.turma || "—")}</strong></div><div><span>Setor</span><strong>${escapeHtml(r.coordenacao_nome || "—")}</strong></div></div>${contatoCouncilBlock(r.__contato || null)}<h2>Situação de frequência</h2><div class="grid"><div><span>Intervalo analisado</span><strong>${escapeHtml(isoToBr(start))} a ${escapeHtml(isoToBr(ref))}</strong></div><div><span>Quantidade de faltas</span><strong>${formatNumber(totalFaltas)}</strong></div><div><span>Maior sequência</span><strong>${formatNumber(maiorSeq)}</strong></div><div><span>Critério acionado</span><strong>${escapeHtml(r.criterio_acionamento || "—")}</strong></div></div><h2>Dias registrados com falta</h2>${renderDatasFaltasPrint(r.__datas_faltas_detalhadas)}<h2>Histórico de atendimentos e observações</h2><div class="history-report-target" data-history-matricula="${escapeHtml(r.matricula || "")}">${renderHistoricoAtendimentosPrint(r.__historico_atendimentos)}</div><h2>Registrar novo atendimento</h2><div class="new-service-box" data-matricula="${escapeHtml(r.matricula || "")}" data-estudante="${escapeHtml(r.aluno_nome || r.nome_aluno || "")}" data-turma="${escapeHtml(r.turma || "")}" data-setor="${escapeHtml(r.coordenacao_nome || "")}" data-total-faltas="${formatNumber(totalFaltas)}" data-criterio="${escapeHtml(r.criterio_acionamento || "")}" data-periodo-inicio="${escapeHtml(start)}" data-periodo-fim="${escapeHtml(ref)}"><input class="new-service-days" type="hidden" value="${escapeHtml(datasContexto)}"><div class="new-service-grid"><label><span>Data do atendimento</span><input class="new-service-date" type="date" value="${escapeHtml(todayIso())}"></label><label><span>Servidor responsável pelo registro</span><input class="new-service-responsavel" type="text" maxlength="120" placeholder="Nome do servidor"></label><label class="wide"><span>Observação do atendimento</span><textarea class="new-service-observacao" maxlength="600" placeholder="Registre o atendimento realizado. Limite de 600 caracteres."></textarea><small class="new-service-counter">0/600 caracteres</small></label><label class="wide"><span>Justificativa / motivo informado</span><textarea class="new-service-justificativa" maxlength="600" placeholder="Opcional"></textarea></label><label class="wide"><span>Encaminhamento</span><textarea class="new-service-encaminhamento" maxlength="600" placeholder="Opcional"></textarea></label><label class="wide"><span>Providências adotadas</span><textarea class="new-service-providencias" maxlength="600" placeholder="Opcional"></textarea></label><label><span>Situação</span><select class="new-service-situacao"><option value="EM_ACOMPANHAMENTO">Em acompanhamento</option><option value="ENCAMINHADO">Encaminhado</option><option value="CONCLUIDO">Concluído</option><option value="OUTRA">Outra</option></select></label><label><span>Chave de autorização</span><input class="new-service-token" type="password" autocomplete="off" placeholder="Chave de registro"></label></div><div class="new-service-actions"><span class="new-service-status">O registro será incorporado ao histórico do estudante.</span><button type="button" onclick="salvarAtendimentoApoia(this)">Salvar atendimento</button></div></div><h2>Critérios utilizados</h2><p>Foram considerados estudantes ativos, com código F, no período de ${dias} dia(s), observando ${faltasAlt} falta(s) intercalada(s) e/ou ${faltasCons} falta(s) consecutiva(s), conforme parâmetros selecionados no painel.</p><footer><div></div><div>Assinatura / carimbo da unidade escolar</div></footer></section>`;
  }).join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Relatório APOIA - Conselho Tutelar</title><style>@page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}html,body{width:100%;min-width:100%}body{font-family:Arial,Helvetica,sans-serif;color:#111827;margin:0;background:#fff}.print-toolbar{position:sticky;top:0;background:#eef6ff;border-bottom:1px solid #bfdbfe;padding:10px 12px;display:flex;gap:10px;align-items:center;justify-content:space-between;z-index:5}.print-toolbar strong{color:#0b245c}.print-toolbar button,.new-service-actions button{background:#0877d9;color:#fff;border:0;border-radius:4px;padding:9px 14px;font-weight:700;cursor:pointer}.page{width:100%;padding:8px 10px 12px;page-break-after:always}.page:last-child{page-break-after:auto}header{border-bottom:2px solid #0b3b86;margin-bottom:10px;padding-bottom:8px}header span{font-size:8pt;text-transform:uppercase;color:#0b3b86;font-weight:700;letter-spacing:.08em}h1{font-size:14pt;margin:4px 0;color:#0b245c;text-transform:uppercase}h2{font-size:10pt;color:#0b3b86;border-left:4px solid #0b3b86;padding-left:7px;margin:10px 0 6px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}.grid div,p{border:1px solid #cbd5e1;border-radius:6px;padding:6px}.grid span{display:block;font-size:7pt;color:#475569;text-transform:uppercase;font-weight:700}.grid strong{display:block;font-size:9pt;margin-top:2px;word-break:break-word}p{font-size:9pt;line-height:1.35;text-align:justify}.dates-list{border:1px solid #cbd5e1;border-radius:6px;padding:6px;display:grid;grid-template-columns:repeat(auto-fit,minmax(84px,1fr));gap:4px}.dates-list span{display:block;border:1px solid #dbeafe;background:#f8fbff;border-radius:4px;padding:4px;text-align:center;font-size:8.5pt;font-weight:700;color:#0b245c}.history-print-list{display:grid;gap:6px}.history-print-item{border:1px solid #cbd5e1;border-radius:6px;padding:6px;background:#fbfdff;break-inside:avoid}.history-print-item.manual{border-left:4px solid #0d9488;background:#f0fdfa}.history-print-head{display:flex;justify-content:space-between;gap:10px;align-items:center;border-bottom:1px solid #dbeafe;padding-bottom:4px;margin-bottom:4px}.history-print-head strong{color:#0b3b86;font-size:9pt}.history-print-head span{color:#475569;font-size:7.5pt;font-weight:700}.history-print-field{margin-top:4px}.history-print-field>span{display:block;font-size:7pt;text-transform:uppercase;color:#475569;font-weight:700;margin-bottom:2px}.history-print-field p{margin:0;border:0;padding:0;font-size:8.5pt;line-height:1.3;text-align:left}.history-print-empty{border:1px dashed #cbd5e1;border-radius:6px;padding:8px;color:#64748b;font-size:8.5pt}.new-service-box{border:1px solid #93c5fd;border-radius:8px;padding:9px;background:#f8fbff}.new-service-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.new-service-grid label{display:block}.new-service-grid label.wide{grid-column:1/-1}.new-service-grid label>span{display:block;font-size:7.5pt;text-transform:uppercase;color:#475569;font-weight:700;margin-bottom:3px}.new-service-grid input,.new-service-grid textarea,.new-service-grid select{width:100%;border:1px solid #cbd5e1;border-radius:5px;padding:7px;background:#fff;font:9pt Arial,Helvetica,sans-serif;color:#111827}.new-service-grid textarea{min-height:58px;resize:vertical}.new-service-grid small{display:block;text-align:right;color:#64748b;font-size:7pt;margin-top:2px}.new-service-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px}.new-service-status{font-size:8pt;color:#475569}.new-service-status.ok{color:#047857;font-weight:700}.new-service-status.error{color:#b91c1c;font-weight:700}footer{display:grid;grid-template-columns:160px 1fr;gap:32px;margin-top:26px;align-items:end}footer div:last-child{border-top:1px solid #111827;text-align:center;padding-top:6px;font-size:9pt}@media(max-width:720px){.grid,.new-service-grid{grid-template-columns:1fr}.new-service-grid label.wide{grid-column:auto}.print-toolbar{align-items:flex-start;flex-direction:column}.print-toolbar button{width:100%}}@media print{.print-toolbar,.new-service-box{display:none!important}.page{padding:0}}</style></head><body><div class="print-toolbar"><strong>O histórico de atendimentos é carregado automaticamente. Você pode registrar um novo atendimento antes de imprimir.</strong><button onclick="window.print()">Imprimir / salvar PDF</button></div>${pages}<script>function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}function formatBr(v){if(!v)return'';const p=String(v).slice(0,10).split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:v}document.querySelectorAll('.new-service-observacao').forEach(function(t){t.addEventListener('input',function(){const c=t.parentElement.querySelector('.new-service-counter');if(c)c.textContent=t.value.length+'/600 caracteres'})});async function salvarAtendimentoApoia(btn){const box=btn.closest('.new-service-box');if(!box)return;const status=box.querySelector('.new-service-status');const responsavel=box.querySelector('.new-service-responsavel').value.trim();const observacao=box.querySelector('.new-service-observacao').value.trim();const token=box.querySelector('.new-service-token').value.trim();if(!responsavel){status.textContent='Informe o servidor responsável pelo registro.';status.className='new-service-status error';return}if(!observacao){status.textContent='Informe a observação do atendimento.';status.className='new-service-status error';return}if(!token){status.textContent='Informe a chave de autorização.';status.className='new-service-status error';return}const payload={ano_letivo:${ANO_LETIVO},matricula:box.dataset.matricula||'',estudante:box.dataset.estudante||'',turma:box.dataset.turma||'',setor:box.dataset.setor||'',data_atendimento:box.querySelector('.new-service-date').value,responsavel_atendimento:responsavel,observacao:observacao,justificativa:box.querySelector('.new-service-justificativa').value.trim(),encaminhamento:box.querySelector('.new-service-encaminhamento').value.trim(),providencias:box.querySelector('.new-service-providencias').value.trim(),situacao:box.querySelector('.new-service-situacao').value,contexto_frequencia:{total_faltas:Number(box.dataset.totalFaltas||0),criterio_acionado:box.dataset.criterio||'',periodo_inicio:box.dataset.periodoInicio||'',periodo_fim:box.dataset.periodoFim||'',dias_faltas:box.querySelector('.new-service-days').value||''}};btn.disabled=true;status.textContent='Salvando atendimento...';status.className='new-service-status';try{if(!window.opener||typeof window.opener.registrarAtendimentoApoiaManual!=='function')throw new Error('A janela principal do sistema não está disponível.');await window.opener.registrarAtendimentoApoiaManual(payload,token);status.textContent='Atendimento salvo. Atualizando histórico...';status.className='new-service-status ok';const target=document.querySelector('.history-report-target[data-history-matricula="'+payload.matricula+'"]');if(target&&typeof window.opener.obterHistoricoApoiaAtualizado==='function'){const atualizado=await window.opener.obterHistoricoApoiaAtualizado(payload.matricula,box.dataset.periodoFim||payload.data_atendimento);if(atualizado&&atualizado.html)target.innerHTML=atualizado.html}box.querySelector('.new-service-responsavel').value='';box.querySelector('.new-service-observacao').value='';box.querySelector('.new-service-justificativa').value='';box.querySelector('.new-service-encaminhamento').value='';box.querySelector('.new-service-providencias').value='';box.querySelector('.new-service-situacao').value='EM_ACOMPANHAMENTO';box.querySelector('.new-service-token').value='';const counter=box.querySelector('.new-service-counter');if(counter)counter.textContent='0/600 caracteres';status.textContent='Atendimento salvo e histórico atualizado.';status.className='new-service-status ok';}catch(e){status.textContent=e.message||'Falha ao salvar atendimento.';status.className='new-service-status error'}finally{btn.disabled=false}}</script></body></html>`;
}

async function openCouncilReportIndividual(matricula, turma) {
  if (!state.absenceAlerts.length) return toast("Gere o relatório APOIA antes de emitir o relatório individual.", "error");

  const alvo = state.absenceAlerts.find(r =>
    String(r.matricula || "") === String(matricula || "") &&
    String(r.turma || "") === String(turma || "")
  ) || state.absenceAlerts.find(r => String(r.matricula || "") === String(matricula || ""));

  if (!alvo) return toast("Estudante não localizado no relatório APOIA atual. Gere o relatório novamente.", "error");

  const w = openReportWindow();
  if (!w) return;
  setLoading(true);
  try {
    const html = await buildCouncilReportHtml([alvo]);
    if (w.closed) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  } catch (e) {
    w.close();
    toast(`Erro ao emitir relatório individual ao Conselho Tutelar: ${e.message}`, "error");
  } finally {
    setLoading(false);
  }
}

async function openCouncilReport() {
  if (!state.absenceAlerts.length) return toast("Gere o relatório APOIA antes de emitir.", "error");
  const w = openReportWindow();
  if (!w) return;
  setLoading(true);
  try {
    const html = await buildCouncilReportHtml(state.absenceAlerts);
    if (w.closed) return;
    w.document.open();
    w.document.write(html);
    w.document.close();
  } catch (e) {
    w.close();
    toast(`Erro ao emitir relatório ao Conselho Tutelar: ${e.message}`, "error");
  } finally {
    setLoading(false);
  }
}

function openReportWindow() {
  // Abrir durante o clique evita o bloqueio de pop-up após a consulta assíncrona.
  const w = window.open("", "_blank", "width=900,height=800");
  if (!w) {
    toast("O navegador bloqueou a janela de impressão. Libere pop-ups para este site.", "error");
    return null;
  }
  w.document.write('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Preparando relatório</title><body style="font:18px system-ui;padding:32px;color:#193b60"><p role="status">Preparando relatório APOIA. Aguarde...</p></body></html>');
  w.document.close();
  return w;
}


function setupActions() {
  $("#refresh-dashboard")?.addEventListener("click", async()=>{ await loadBase(); setupSelectors(); toast("Bases Supabase recarregadas."); });
  $("#apply-filters")?.addEventListener("click", renderDashboard);
  $("#dashboard-class-filter")?.addEventListener("change", handleDashboardClassChange);
  $("#dashboard-student-list")?.addEventListener("change", () => { if ($("#dashboard-student-list")?.value && $("#dashboard-student-search")) $("#dashboard-student-search").value = ""; });
  $("#print-dashboard")?.addEventListener("click", () => window.print());
  $("#daily-class-filter")?.addEventListener("change", handleDailyClassChange);
  $("#daily-student-list")?.addEventListener("change", () => { /* aluno opcional: ao selecionar, o botão Gerar usa o aluno escolhido */ });
  $("#daily-apply")?.addEventListener("click", renderDaily);
  $("#daily-clear")?.addEventListener("click", clearDaily);
  $("#daily-print")?.addEventListener("click", () => window.print());
  $("#daily-export-csv")?.addEventListener("click", () => {
    const rows = (state.dailyRows || []).map(r => {
      const c = sumCodes(r);
      const base = c.P+c.F+c.FJ+c.A+c.AJ+c.AD+c.JE+c.S+c.SC;
      const faltas = c.F;
      const presencas = Math.max(0, base-faltas);
      return { turno:r.turno, coordenacao:r.coordenacao_nome, turma:r.turma, aluno:r.aluno_nome||"", alunos_ativos:r.total_alunos_ativos, presencas, percentual_presenca:base?pct(presencas,base):"—", faltas, percentual_falta:base?pct(faltas,base):"—", sem_lancamento:c.semLancamento };
    });
    csvDownload("frequencias_diarias_presenca_falta.csv", rows, ["turno","coordenacao","turma","aluno","alunos_ativos","presencas","percentual_presenca","faltas","percentual_falta","sem_lancamento"].map(k=>({title:k,value:k})));
  });
  $("#refresh-sectors")?.addEventListener("click", renderSectors);
  $("#sector-view-filter")?.addEventListener("change", renderSectors);
  $("#quick-student-button")?.addEventListener("click", quickStudentSearch);
  $("#service-class-filter")?.addEventListener("change", handleServiceClassChange);
  $("#service-student-list")?.addEventListener("change", () => { if ($("#service-student-list")?.value && $("#service-search")) $("#service-search").value = ""; });
  $("#service-load-student")?.addEventListener("click", serviceLoadStudent);
  $("#service-search")?.addEventListener("keydown", ev => { if (ev.key === "Enter") { ev.preventDefault(); serviceLoadStudent(); } });
  $("#service-clear")?.addEventListener("click", clearServiceWorkspace);
  $("#service-save")?.addEventListener("click", saveServiceAttendance);
  $("#service-refresh-history")?.addEventListener("click", refreshServiceHistory);
  $("#service-observacao")?.addEventListener("input", () => { const el=$("#service-observacao"); const c=$("#service-observacao-counter"); if(c) c.textContent=`${el?.value?.length || 0}/600 caracteres`; });
  $("#quick-student-clear")?.addEventListener("click", () => { $("#quick-student-search").value=""; $("#quick-students-table-body").innerHTML=emptyCell("Digite nome ou matrícula e clique em Localizar.",6); });
  $("#students-class-filter")?.addEventListener("change", handleStudentsClassChange);
  $("#students-student-list")?.addEventListener("change", () => { if ($("#students-student-list")?.value && $("#student-search")) $("#student-search").value = ""; });
  $("#students-filter-button")?.addEventListener("click", buscarOuCarregarAlunos);
  $("#students-filter-clear")?.addEventListener("click", limparFiltroAlunos);
  $("#student-search")?.addEventListener("input", () => {
    if (state.students.length) renderStudentsTable(state.students);
  });
  $("#export-csv")?.addEventListener("click", () => csvDownload("alunos_supabase.csv", state.students, ["aluno_nome","matricula","status","total_p","total_f","total_fj","total_a","total_aj","total_ad","total_je","total_s","total_lancamentos","percentual_frequencia"].map(k=>({title:k,value:k}))));
  $("#card-search-button")?.addEventListener("click", cardSearch);
  $("#card-student-search")?.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); cardSearch(); } });
  $("#card-class-filter")?.addEventListener("change", handleCardClassChange);
  $("#card-student-list")?.addEventListener("change", () => { if ($("#card-student-list")?.value && $("#card-student-search")) $("#card-student-search").value = ""; const btn = $("#card-generate-selected"); if (btn) btn.disabled = !$("#card-student-list")?.value; });
  $("#card-generate-selected")?.addEventListener("click", generateSelectedAttendanceCard);
  $("#attendance-card-clear")?.addEventListener("click", clearCard);
  $("#attendance-card-print")?.addEventListener("click", emitirCartaoFrequencia);
  $("#attendance-card-print-secondary")?.addEventListener("click", emitirCartaoFrequencia);
  $("#absence-class-filter")?.addEventListener("change", handleAbsenceClassChange);
  $("#absence-alert-generate")?.addEventListener("click", renderAbsenceAlert);
  $("#absence-alert-generate-secondary")?.addEventListener("click", renderAbsenceAlert);
  $("#absence-alert-clear")?.addEventListener("click", clearAbsence);
  $("#absence-alert-export")?.addEventListener("click", () => csvDownload("apoia_supabase.csv", state.absenceAlerts, ["situacao_apoia","criterio_acionamento","coordenacao_nome","turno","turma","matricula","aluno_nome","total_f","maior_sequencia_f","total_fj","total_ausencias","primeira_ausencia","ultima_ausencia"].map(k=>({title:k,value:k}))));
  $("#absence-council-report-all")?.addEventListener("click", openCouncilReport);
  $("#history-class-filter")?.addEventListener("change", handleHistoryClassChange);
  $("#history-student-list")?.addEventListener("change", () => { if ($("#history-student-list")?.value && $("#history-search")) $("#history-search").value = ""; });
  $("#history-generate")?.addEventListener("click", renderHistory);
  $("#history-clear")?.addEventListener("click", clearHistoryFilters);
  $("#history-search")?.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); renderHistory(); } });
  $("#history-export")?.addEventListener("click", () => csvDownload("historico_atendimentos_apoia_2026.csv", state.atendimentos, [
    {title:"Competência",value:"competencia"},{title:"Aba de origem",value:"aba_origem"},{title:"Matrícula",value:"matricula"},{title:"Estudante",value:"estudante"},{title:"Turma",value:"turma"},{title:"Setor",value:"setor"},{title:"Total de faltas",value:"total_faltas"},{title:"Dias de faltas",value:"dias_faltas"},{title:"Justificativa",value:"justificativa"},{title:"Observação",value:"observacao"}
  ]));
  $("#history-detail-close")?.addEventListener("click", () => $("#history-detail-card")?.classList.add("hidden"));
  $("#refresh-admin-details")?.addEventListener("click", renderAdminDetails);
  $("#migration-diagnostic-period-mode")?.addEventListener("change", syncMigrationPeriodControls);
  $("#migration-diagnostic-date-end")?.addEventListener("change", syncMigrationPeriodControls);
  syncMigrationPeriodControls();
  $("#migration-diagnostic-run")?.addEventListener("click", runMigrationDiagnostic);
  $("#migration-diagnostic-update")?.addEventListener("click", runMigrationUpdate);
  if ($("#migration-general-date") && !$("#migration-general-date").value) $("#migration-general-date").value = localIsoToday();
  $("#migration-general-run")?.addEventListener("click", runMigrationGeneralAudit);
  $("#migration-general-filter")?.addEventListener("change", renderMigrationGeneralTable);
  $("#refresh-admin")?.addEventListener("click", renderAdmin);
  $("#admin-run-sync")?.addEventListener("click", runManualSupabaseUpdate);
  $("#admin-run-lote-1")?.addEventListener("click", () => runManualLote(1));
  $("#admin-run-lote-2")?.addEventListener("click", () => runManualLote(2));
  $("#admin-run-lote-3")?.addEventListener("click", () => runManualLote(3));
  $("#admin-run-lote-4")?.addEventListener("click", () => runManualLote(4));
  $("#admin-run-cache")?.addEventListener("click", runManualCacheUpdate);
  $("#admin-run-diagnostic")?.addEventListener("click", () => { setView("migration-diagnostic"); fillMigrationDiagnosticClasses(); });
  $("#admin-run-general-audit")?.addEventListener("click", () => { setView("migration-audit-general"); if ($("#migration-general-date") && !$("#migration-general-date").value) $("#migration-general-date").value = localIsoToday(); });
  $("#admin-run-comparison")?.addEventListener("click", renderAdmin);
}

let usuarioAtual = null;
let portalInicializado = false;
let recuperandoSenha = false;

function mostrarArea(area) {
  [["#auth-view", "auth"], ["#pending-view", "pending"], ["#app-view", "app"]]
    .forEach(([seletor, nome]) => $(seletor)?.classList.toggle("hidden", nome !== area));
}

async function verificarAcesso() {
  if (recuperandoSenha) { mostrarArea("auth"); return; }
  const { data: sessionInfo, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  usuarioAtual = sessionInfo?.session?.user || null;
  if (!usuarioAtual) { mostrarArea("auth"); return; }
  const { data: autorizado, error } = await supabase.rpc("fn_iee_acesso_autorizado");
  if (error) throw error;
  if (!autorizado) {
    $("#pending-title").textContent = "Acesso pendente";
    $("#pending-message").textContent = "Sua conta existe, mas precisa de perfil ADMIN ativo para acessar os dados. Solicite a liberação ao responsável pelo sistema.";
    mostrarArea("pending");
    return;
  }
  mostrarArea("app");
  if (!portalInicializado) {
    portalInicializado = await iniciarPortal();
  }
}

async function sairDoPortal() {
  await supabase.auth.signOut();
  window.location.reload(); // apaga da memória os dados consultados nesta sessão
}

function configurarAutenticacao() {
  $("#tab-login")?.addEventListener("click", () => {
    $("#tab-login").classList.add("active");
    $("#tab-register").classList.remove("active");
    $("#login-form").classList.remove("hidden");
    $("#register-form").classList.add("hidden");
  });
  $("#tab-register")?.addEventListener("click", () => {
    $("#tab-login").classList.remove("active");
    $("#tab-register").classList.add("active");
    $("#login-form").classList.add("hidden");
    $("#register-form").classList.remove("hidden");
  });
  $("#login-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: $("#login-email").value.trim(), password: $("#login-password").value
      });
      if (error) throw error;
      await verificarAcesso();
    } catch (error) { toast(error.message || "Falha no login.", "error"); }
    finally { setLoading(false); }
  });
  $("#register-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: $("#register-email").value.trim(), password: $("#register-password").value,
        options: { data: { nome: $("#register-name").value.trim() } }
      });
      if (error) throw error;
      toast("Cadastro recebido. Confirme seu e-mail e aguarde a aprovação do responsável.");
      await verificarAcesso();
    } catch (error) { toast(error.message || "Falha no cadastro.", "error"); }
    finally { setLoading(false); }
  });
  $("#forgot-password")?.addEventListener("click", async () => {
    const email = $("#login-email")?.value.trim();
    if (!email) return toast("Informe seu e-mail acima para receber a recuperação de senha.", "error");
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
    toast(error ? error.message : "Se o e-mail estiver cadastrado, enviaremos um link de recuperação.", error ? "error" : "success");
  });
  supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      recuperandoSenha = true;
      mostrarArea("auth");
      $("#login-form")?.classList.add("hidden");
      $("#register-form")?.classList.add("hidden");
      $("#reset-form")?.classList.remove("hidden");
    }
  });
  $("#reset-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    const { error } = await supabase.auth.updateUser({ password: $("#reset-password").value });
    if (error) return toast(error.message, "error");
    toast("Senha alterada. Entre novamente.");
    await sairDoPortal();
  });
  $("#pending-refresh")?.addEventListener("click", () => verificarAcesso().catch(e => toast(e.message, "error")));
  $("#pending-logout")?.addEventListener("click", sairDoPortal);
}

async function init() {
  mostrarArea("auth");
  configurarAutenticacao();
  try { await verificarAcesso(); }
  catch (error) { mostrarArea("auth"); toast(`Falha na autenticação: ${error.message}`, "error"); }
}

async function iniciarPortal() {
  setLoading(true);
  try {
    renderHomeStats(); setupNavigation(); setupDates();
    await Promise.all([loadBase(), refreshCacheLabel()]);
    setupSelectors(); setupActions(); renderAdminDetails();
    clearDaily(); clearAbsence(); renderAdminLotes([]);
    // Os relatórios são carregados por abrirVisao quando o usuário os abre.
    // Zero lançamentos é um resultado válido e não deve disparar nova consulta.
    return true;
  } catch(e) {
    console.error(e);
    toast(`Erro ao inicializar Supabase oficial: ${e.message}`, "error");
    return false;
  } finally { setLoading(false); }
}

init();
