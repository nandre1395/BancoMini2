// =================== CONFIG ===================
// Detecta si es local ejecutando desde file:// o localhost.
// Si NO es local, usa el backend en Render.
const API_BASE_URL = 
  location.hostname === "localhost" || location.hostname === "127.0.0.1"
    ? "http://localhost:3000"
    : "https://minibanco-backend.onrender.com";

// =================== TOAST ===================
function showToast(message, type = "info") {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    Object.assign(container.style, { position: "fixed", top: "12px", right: "12px", zIndex: 9999 });
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.innerText = message;
  toast.style.padding = "10px 14px";
  toast.style.borderRadius = "8px";
  toast.style.marginTop = "8px";
  toast.style.color = "#fff";
  toast.style.fontWeight = "600";
  toast.style.boxShadow = "0 4px 12px rgba(0,0,0,0.12)";
  toast.style.background = type === "danger" ? "#dc3545" : type === "success" ? "#28a745" : type === "warning" ? "#ffc107" : "#007bff";
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// =================== AUTH ===================
async function registerUser(e) {
  e.preventDefault();
  const id = regId.value.trim(), nombre = regName.value.trim(), password = regPassword.value.trim();
  if (!id || !nombre || !password) return showToast("Completa todos los campos", "warning");

  try {
    const res = await fetch(`${API_BASE_URL}/api/register`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, nombre, password })
    });
    const data = await res.json();
    showToast(data.message, res.ok ? "success" : "danger");
    if (res.ok) e.target.reset();
  } catch (err) {
    console.log(err); showToast("Error servidor", "danger");
  }
}

async function loginUser(e) {
  e.preventDefault();
  const id = loginId.value.trim(), password = loginPassword.value.trim();
  if (!id || !password) return showToast("Completa todos los campos", "warning");

  try {
    const res = await fetch(`${API_BASE_URL}/api/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, password })
    });
    const data = await res.json();
    showToast(data.message, res.ok ? "success" : "danger");
    if (res.ok) {
      localStorage.setItem("activeUser", data.id);
      localStorage.setItem("activeUserName", data.nombre);
      setTimeout(() => window.location.href = "dashboard.html", 700);
    }
  } catch (err) {
    console.log(err); showToast("Error servidor", "danger");
  }
}

function logoutUser() {
  localStorage.removeItem("activeUser");
  localStorage.removeItem("activeUserName");
  window.location.href = "index.html";
}

// =================== CUENTAS / DASHBOARD ===================
async function loadAccounts() {
  const userId = localStorage.getItem("activeUser");
  if (!userId) return logoutUser();

  try {
    const res = await fetch(`${API_BASE_URL}/api/cuentas/${userId}`);
    const cuentas = await res.json();

    const select = document.getElementById("accountSelect");
    const origenSelect = document.getElementById("cuentaOrigen");
    const accountInfo = document.getElementById("accountInfo");
    const movementsList = document.getElementById("movementsList");

    select.innerHTML = "";
    origenSelect.innerHTML = "<option value=''>-- Seleccione cuenta origen --</option>";
    accountInfo.innerHTML = "";
    movementsList.innerHTML = "";

    if (!cuentas || cuentas.length === 0) {
      document.getElementById("balanceInfo").innerHTML = "<p>No tienes cuentas registradas</p>";
      return;
    }

    cuentas.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.tipo} — ${c.id}`;
      select.appendChild(opt);

      const opt2 = opt.cloneNode(true);
      origenSelect.appendChild(opt2);
    });

    select.selectedIndex = 0;
    await updateBalance();
    await loadMovements();
  } catch (err) {
    console.log(err); showToast("Error cargando cuentas", "danger");
  }
}

async function updateBalance() {
  const cuentaId = document.getElementById("accountSelect").value;
  if (!cuentaId) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/saldo/${cuentaId}`);
    if (!res.ok) return;
    const data = await res.json();
    const saldoFmt = Number(data.saldo).toLocaleString("es-CO", { style: "currency", currency: "COP" });
    document.getElementById("balanceInfo").innerHTML = `<p class="m-0">💰 ${saldoFmt}</p>`;
    document.getElementById("accountInfo").innerHTML = `<strong>Tipo:</strong> ${data.tipo} | <strong>Saldo:</strong> ${saldoFmt}`;
  } catch (err) {
    console.log(err);
  }
}

async function addAccount() {
  const tipo = document.getElementById("newAccountType").value;
  const usuario_id = localStorage.getItem("activeUser");
  const monto = document.getElementById("cdtMonto")?.value;
  const plazo = document.getElementById("cdtPlazo")?.value;
  const cuentaOrigen = document.getElementById("cuentaOrigen")?.value;

  const payload = { usuario_id, tipo };
  if (tipo === "CDT") {
    if (!monto || !plazo || !cuentaOrigen) return showToast("Datos CDT incompletos", "warning");
    payload.monto = monto;
    payload.plazo = plazo;
    payload.cuentaOrigen = cuentaOrigen;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/cuentas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    showToast(data.message, res.ok ? "success" : "danger");
    if (res.ok) loadAccounts();
  } catch (err) {
    console.log(err); showToast("Error servidor", "danger");
  }
}

async function addMovement() {
  const cuenta_id = document.getElementById("accountSelect").value;
  const tipo = document.getElementById("movementType").value;
  const valor = document.getElementById("movementAmount").value;

  if (!cuenta_id || !tipo || !valor) return showToast("Complete todos los campos", "warning");

  try {
    const res = await fetch(`${API_BASE_URL}/api/movimientos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cuenta_id, tipo, valor })
    });
    const data = await res.json();
    showToast(data.message, res.ok ? "success" : "danger");
    if (res.ok) {
      document.getElementById("movementAmount").value = "";
      await loadAccounts();
      await loadMovements();
    }
  } catch (err) {
    console.log(err); showToast("Error servidor", "danger");
  }
}

async function loadMovements() {
  const cuentaId = document.getElementById("accountSelect").value;
  if (!cuentaId) return;
  try {
    const res = await fetch(`${API_BASE_URL}/api/movimientos/${cuentaId}`);
    const movimientos = await res.json();
    const container = document.getElementById("movementsList");
    container.innerHTML = "";
    if (!movimientos || movimientos.length === 0) return container.innerHTML = "<p>No hay movimientos</p>";

    movimientos.forEach(m => {
      const div = document.createElement("div");
      const sign = m.valor >= 0 ? "+" : "";
      const valorFmt = Number(m.valor).toLocaleString("es-CO", { style: "currency", currency: "COP" });
      div.innerHTML = `<span>[${new Date(m.fecha).toLocaleDateString()}]</span> ${m.tipo}: <strong>${sign}${valorFmt}</strong>`;
      container.appendChild(div);
    });
  } catch (err) {
    console.log(err);
  }
}

// =================== CDT ===================
function calcularRendimientoCDT() {
  const monto = parseFloat(document.getElementById("cdtMonto").value);
  const plazoMeses = parseInt(document.getElementById("cdtPlazo").value);

  if (!monto || !plazoMeses) return showToast("Ingrese monto y plazo", "warning");

  const tasaAnual = 12;
  const meses = plazoMeses;
  const montoFinal = monto * Math.pow(1 + tasaAnual / 100 / 12, meses);
  const interes = montoFinal - monto;

  document.getElementById("cdtResultado").innerText = `Monto final: ${montoFinal.toFixed(2)} COP | Interés: ${interes.toFixed(2)} COP`;
}

function limpiarCDT() {
  document.getElementById("cdtMonto").value = "";
  document.getElementById("cdtPlazo").value = "";
  document.getElementById("cdtResultado").innerText = "";
}

// =================== SIMULADOR ===================
function calcularSimulacionInversion() {
  const monto = parseFloat(document.getElementById("simMonto").value);
  const plazo = parseInt(document.getElementById("simPlazo").value);
  const tasa = parseFloat(document.getElementById("simTasa").value);

  if (!monto || !plazo || !tasa) return showToast("Complete todos los campos", "warning");

  const n = 12;
  const t = plazo / 12;
  const r = tasa / 100;
  const montoFinal = monto * Math.pow(1 + r / n, n * t);
  const interes = montoFinal - monto;

  document.getElementById("resultadoInversion").innerText =
    `Monto final: ${montoFinal.toFixed(2)} COP | Interés: ${interes.toFixed(2)} COP`;
}

function limpiarSimulador() {
  document.getElementById("simMonto").value = "";
  document.getElementById("simPlazo").value = "";
  document.getElementById("simTasa").value = "";
  document.getElementById("resultadoInversion").innerText = "";
}

// =================== TASA DE CAMBIO ===================
async function loadExchangeRate() {
  const el = document.getElementById("tasaCambio");
  try {
    const res = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=COP");
    const data = await res.json();
    el.innerText = `1 USD = ${data.rates.COP.toLocaleString("es-CO")} COP`;
  } catch (err) {
    el.innerText = "Error cargando tasa";
  }
}

// =================== EVENTOS ===================
document.addEventListener("DOMContentLoaded", () => {
  if (window.location.pathname.includes("dashboard.html")) {
    const name = localStorage.getItem("activeUserName") || localStorage.getItem("activeUser");
    document.getElementById("userName").innerText = name;

    loadAccounts();
    loadExchangeRate();

    document.getElementById("logoutBtn").addEventListener("click", logoutUser);
    document.getElementById("addAccountBtn").addEventListener("click", addAccount);
    document.getElementById("addMovementBtn").addEventListener("click", addMovement);
    document.getElementById("calculateCDTRendimientoBtn").addEventListener("click", calcularRendimientoCDT);
    document.getElementById("limpiarCDTBtn").addEventListener("click", limpiarCDT);
    document.getElementById("calcularInversionBtn").addEventListener("click", calcularSimulacionInversion);
    document.getElementById("limpiarSimBtn").addEventListener("click", limpiarSimulador);
    document.getElementById("deleteAccountBtn").addEventListener("click", async () => {
      const cuentaId = document.getElementById("accountSelect").value;
      if (!cuentaId) return showToast("Seleccione una cuenta", "warning");
      const transferTo = prompt("Si la cuenta tiene saldo, ingrese ID de cuenta destino (dejar vacío si no tiene saldo):");
      try {
        const url = transferTo
          ? `${API_BASE_URL}/api/cuentas/${cuentaId}?transferTo=${transferTo}`
          : `${API_BASE_URL}/api/cuentas/${cuentaId}`;
        const res = await fetch(url, { method: "DELETE" });
        const data = await res.json();
        showToast(data.message, res.ok ? "success" : "danger");
        if (res.ok) await loadAccounts();
      } catch (err) {
        console.log(err); showToast("Error eliminando cuenta", "danger");
      }
    });
  } else {
    document.getElementById("loginForm")?.addEventListener("submit", loginUser);
    document.getElementById("registerForm")?.addEventListener("submit", registerUser);
  }
});
