// =================== TOASTS ===================
function showToast(message, type = "info") {
  const containerClass = "toast-container-custom";
  let container = document.querySelector("." + containerClass);
  if (!container) {
    container = document.createElement("div");
    container.className = containerClass;
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
    const res = await fetch("http://localhost:3000/api/register", {
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
    const res = await fetch("http://localhost:3000/api/login", {
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
    const res = await fetch(`http://localhost:3000/api/cuentas/${userId}`);
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
    const res = await fetch(`http://localhost:3000/api/saldo/${cuentaId}`);
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
  const userId = localStorage.getItem("activeUser");

  if (tipo === "CDT") {
    const monto = parseFloat(document.getElementById("cdtMonto").value);
    const plazo = parseInt(document.getElementById("cdtPlazo").value);
    const cuentaOrigen = document.getElementById("cuentaOrigen").value;

    if (!monto || monto <= 0 || !plazo || !cuentaOrigen) return showToast("Complete monto/plazo y cuenta origen", "warning");

    try {
      const res = await fetch("http://localhost:3000/api/cuentas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario_id: userId, tipo, monto, cuentaOrigen, plazo })
      });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "danger");
      if (res.ok) {
        limpiarCDT();
        await loadAccounts();
      }
    } catch (err) {
      console.log(err); showToast("Error al crear CDT", "danger");
    }
  } else {
    try {
      const res = await fetch("http://localhost:3000/api/cuentas", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario_id: userId, tipo })
      });
      const data = await res.json();
      showToast(data.message, res.ok ? "success" : "danger");
      if (res.ok) await loadAccounts();
    } catch (err) {
      console.log(err); showToast("Error crear cuenta", "danger");
    }
  }
}

// =================== CDT ===================
function calcularRendimientoCDT() {
  const monto = parseFloat(document.getElementById("cdtMonto").value);
  const plazo = parseInt(document.getElementById("cdtPlazo").value);
  if (!monto || !plazo) return showToast("Ingrese monto y plazo", "warning");

  const tasaAnual = 12;
  const interes = monto * Math.pow(1 + (tasaAnual / 100 / 12), plazo) - monto;
  const total = monto + interes;

  document.getElementById("cdtResultado").innerHTML = `
    <p>Rendimiento estimado: <strong>${interes.toLocaleString("es-CO", { style: "currency", currency: "COP" })}</strong></p>
    <p>Total al finalizar: <strong>${total.toLocaleString("es-CO", { style: "currency", currency: "COP" })}</strong></p>
  `;
}

function limpiarCDT() {
  document.getElementById("cdtMonto").value = "";
  document.getElementById("cdtPlazo").value = "";
  document.getElementById("cuentaOrigen").selectedIndex = 0;
  document.getElementById("cdtResultado").innerHTML = "";
  document.getElementById("cdtExtra").style.display = "none";
}

// =================== MOVIMIENTOS ===================
async function addMovement() {
  const cuenta_id = document.getElementById("accountSelect").value;
  const tipo = document.getElementById("movementType").value;
  const valor = parseFloat(document.getElementById("movementAmount").value);

  if (!cuenta_id || !tipo || !valor || isNaN(valor) || valor <= 0) return showToast("Complete todos los campos válidos", "warning");

  try {
    const res = await fetch("http://localhost:3000/api/movimientos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cuenta_id, tipo, valor })
    });
    const data = await res.json();
    showToast(data.message, res.ok ? "success" : "danger");
    if (res.ok) {
      document.getElementById("movementAmount").value = "";
      await updateBalance();
      await loadMovements();
    }
  } catch (err) {
    console.log(err); showToast("Error al registrar movimiento", "danger");
  }
}

async function loadMovements() {
  const cuentaId = document.getElementById("accountSelect").value;
  const list = document.getElementById("movementsList");
  if (!cuentaId) { list.innerHTML = ""; return; }
  list.innerHTML = "Cargando...";

  try {
    const res = await fetch(`http://localhost:3000/api/movimientos/${cuentaId}`);
    const movimientos = await res.json();
    if (!movimientos || movimientos.length === 0) {
      list.innerHTML = "<p>No hay movimientos.</p>";
      return;
    }
    list.innerHTML = movimientos.map(m => {
      const valorFmt = Number(m.valor).toLocaleString("es-CO", { style: "currency", currency: "COP" });
      return `<div class="mb-2"><small class="text-muted">${new Date(m.fecha).toLocaleString()}</small><br><strong>${m.tipo}</strong>: ${valorFmt}</div>`;
    }).join("");
  } catch (err) {
    console.log(err); list.innerHTML = "<p>Error cargando movimientos</p>";
  }
}

// =================== SIMULADOR ===================
function calcularSimulacionInversion() {
  const monto = parseFloat(document.getElementById("simMonto").value);
  const plazo = parseInt(document.getElementById("simPlazo").value);
  const tasa = parseFloat(document.getElementById("simTasa").value);
  if (!monto || !plazo || !tasa) return showToast("Ingrese todos los campos del simulador", "warning");

  const interes = monto * (Math.pow(1 + tasa / 100 / 12, plazo) - 1);
  const total = monto + interes;

  document.getElementById("resultadoInversion").innerHTML = `
    Rendimiento: <strong>${interes.toLocaleString("es-CO", { style: "currency", currency: "COP" })}</strong><br>
    Total al finalizar: <strong>${total.toLocaleString("es-CO", { style: "currency", currency: "COP" })}</strong>
  `;
}

function limpiarSimulador() {
  document.getElementById("simMonto").value = "";
  document.getElementById("simPlazo").value = "";
  document.getElementById("simTasa").value = "";
  document.getElementById("resultadoInversion").innerHTML = "";
}

// =================== TASA DE CAMBIO ===================
async function loadExchangeRate() {
  const tasaEl = document.getElementById("tasaCambio");
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const data = await res.json();
    if (!data || !data.rates || !data.rates.COP) throw new Error("No se pudo obtener la tasa");
    const tasa = data.rates.COP;
    tasaEl.innerText = tasa.toLocaleString("es-CO", { maximumFractionDigits: 2 });
  } catch (err) {
    console.log(err);
    tasaEl.innerText = "Error cargando tasa";
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

    document.getElementById("accountSelect").addEventListener("change", async () => {
      await updateBalance();
      await loadMovements();
    });

    document.getElementById("newAccountType").addEventListener("change", () => {
      const el = document.getElementById("cdtExtra");
      el.style.display = document.getElementById("newAccountType").value === "CDT" ? "block" : "none";
      if (el.style.display === "none") limpiarCDT();
    });

    document.getElementById("calculateCDTRendimientoBtn").addEventListener("click", calcularRendimientoCDT);
    document.getElementById("limpiarCDTBtn").addEventListener("click", limpiarCDT);

    document.getElementById("calcularInversionBtn").addEventListener("click", calcularSimulacionInversion);
    document.getElementById("limpiarSimBtn").addEventListener("click", limpiarSimulador);
  }
});
