import express from "express";
import mysql from "mysql2/promise";
import bcrypt from "bcrypt";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();
const app = express();

// Resolver paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware
app.use(express.json());

// CORS (origins permitidos)
const allowedOrigins = [
  "https://minibanco-68w4.onrender.com",
  "https://minibanco-backend.onrender.com",
  "http://localhost:3000",
  "http://127.0.0.1:5500",
];

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  })
);

// ⚠️ Cambio crítico para evitar PathError
app.options("/*", cors()); // reemplaza app.options("*", cors())

// ---------------------------------------------
// 🚀 CONEXIÓN MYSQL (Railway → Render)
// ---------------------------------------------
let db;

async function initDB() {
  try {
    db = await mysql.createPool({
      host: process.env.MYSQLHOST,
      user: process.env.MYSQLUSER,
      password: process.env.MYSQLPASSWORD,
      database: process.env.MYSQLDATABASE,
      port: Number(process.env.MYSQLPORT),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    console.log("🔥 Conexión exitosa a MySQL (Railway)");
  } catch (err) {
    console.error("❌ Error conectando MySQL:", err.message);
  }
}

await initDB();

// Keep alive
setInterval(async () => {
  try {
    await db.query("SELECT 1");
  } catch (e) {
    console.log("⚠️ keep-alive error:", e.message);
  }
}, 240000);

// Limpiar texto
function limpiarTexto(texto) {
  if (typeof texto !== "string") return texto;
  return texto.trim();
}

// ---------------------------------------------
// RUTAS API
// ---------------------------------------------
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Backend funcionando correctamente",
    timestamp: new Date().toISOString(),
  });
});

app.post("/api/register", async (req, res) => {
  const id = limpiarTexto(req.body.id);
  const nombre = limpiarTexto(req.body.nombre);
  const password = limpiarTexto(req.body.password);

  if (!id || !nombre || !password)
    return res.status(400).json({ message: "Datos incompletos" });

  try {
    const hashedPass = await bcrypt.hash(password, 10);

    await db.query(
      "INSERT INTO usuarios (id, nombre, password) VALUES (?, ?, ?)",
      [id, nombre, hashedPass]
    );

    res.json({ message: "✅ Registro exitoso" });
  } catch (err) {
    res.status(500).json({ message: "❌ El usuario ya existe o error" });
  }
});

app.post("/api/login", async (req, res) => {
  const id = limpiarTexto(req.body.id);
  const password = req.body.password;

  if (!id || !password)
    return res.status(400).json({ message: "Datos incompletos" });

  try {
    const [rows] = await db.query("SELECT * FROM usuarios WHERE id = ?", [id]);

    if (!rows || rows.length === 0)
      return res.status(401).json({ message: "Usuario no encontrado" });

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match)
      return res.status(401).json({ message: "Contraseña incorrecta" });

    res.json({
      message: "Bienvenido",
      id: user.id,
      nombre: user.nombre,
    });
  } catch {
    res.status(500).json({ message: "Error servidor" });
  }
});

app.get("/api/user/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT id, nombre FROM usuarios WHERE id = ?",
      [req.params.id]
    );

    if (!rows || rows.length === 0)
      return res.status(404).json({ message: "Usuario no encontrado" });

    res.json(rows[0]);
  } catch {
    res.status(500).json({ message: "Error" });
  }
});

app.get("/api/cuentas/:id", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM cuentas WHERE usuario_id = ?",
      [req.params.id]
    );
    res.json(rows || []);
  } catch {
    res.status(500).json({ message: "Error al obtener cuentas" });
  }
});

app.post("/api/cuentas", async (req, res) => {
  const { usuario_id, tipo, monto, cuentaOrigen, plazo } = req.body;

  if (!usuario_id || !tipo)
    return res.status(400).json({ message: "Datos incompletos" });

  try {
    if (tipo === "CDT") {
      if (!monto || !cuentaOrigen || !plazo)
        return res.status(400).json({ message: "Datos CDT incompletos" });

      const montoNum = parseFloat(monto);

      const [rows] = await db.query(
        "SELECT saldo FROM cuentas WHERE id = ?",
        [cuentaOrigen]
      );

      if (!rows || rows.length === 0)
        return res.status(404).json({ message: "Cuenta origen no encontrada" });

      const saldo = parseFloat(rows[0].saldo);

      if (saldo < montoNum)
        return res.status(400).json({ message: "Saldo insuficiente" });

      const [result] = await db.query(
        "INSERT INTO cuentas (usuario_id, tipo, saldo) VALUES (?, ?, ?)",
        [usuario_id, tipo, montoNum]
      );

      const newCtaId = result.insertId;

      await db.query(
        "UPDATE cuentas SET saldo = saldo - ? WHERE id = ?",
        [montoNum, cuentaOrigen]
      );

      await db.query(
        "INSERT INTO movimientos (cuenta_id, tipo, valor) VALUES (?, ?, ?)",
        [cuentaOrigen, "Inversión CDT", -montoNum]
      );

      await db.query(
        "INSERT INTO movimientos (cuenta_id, tipo, valor) VALUES (?, ?, ?)",
        [newCtaId, "CDT abierto", montoNum]
      );

      return res.json({
        message: "CDT creado correctamente",
        cuentaId: newCtaId,
      });
    }

    await db.query(
      "INSERT INTO cuentas (usuario_id, tipo, saldo) VALUES (?, ?, 0)",
      [usuario_id, tipo]
    );

    res.json({ message: "Cuenta creada" });
  } catch {
    res.status(500).json({ message: "Error al crear cuenta" });
  }
});

app.delete("/api/cuentas/:id", async (req, res) => {
  const cuentaId = req.params.id;
  const transferTo = req.query.transferTo;

  try {
    const [rows] = await db.query(
      "SELECT saldo FROM cuentas WHERE id = ?",
      [cuentaId]
    );

    if (!rows || rows.length === 0)
      return res.status(404).json({ message: "Cuenta no encontrada" });

    const saldo = parseFloat(rows[0].saldo);

    if (saldo > 0 && transferTo) {
      await db.query("UPDATE cuentas SET saldo = saldo + ? WHERE id = ?", [
        saldo,
        transferTo,
      ]);
    } else if (saldo > 0 && !transferTo) {
      return res.status(400).json({
        message: "La cuenta tiene saldo, especifique cuenta destino",
      });
    }

    await db.query("DELETE FROM movimientos WHERE cuenta_id = ?", [cuentaId]);
    await db.query("DELETE FROM cuentas WHERE id = ?", [cuentaId]);

    res.json({ message: "Cuenta eliminada correctamente" });
  } catch {
    res.status(500).json({ message: "Error al eliminar cuenta" });
  }
});

app.post("/api/movimientos", async (req, res) => {
  const { cuenta_id, tipo, valor } = req.body;

  if (!cuenta_id || !tipo || valor === undefined)
    return res.status(400).json({ message: "Datos inválidos" });

  const valNum = parseFloat(valor);

  try {
    if (tipo === "Retiro") {
      const [rows] = await db.query(
        "SELECT saldo FROM cuentas WHERE id = ?",
        [cuenta_id]
      );

      if (!rows || rows.length === 0)
        return res.status(404).json({ message: "Cuenta no encontrada" });

      const saldo = rows[0].saldo;

      if (saldo < valNum)
        return res.status(400).json({ message: "Saldo insuficiente" });

      await db.query(
        "INSERT INTO movimientos (cuenta_id, tipo, valor) VALUES (?, ?, ?)",
        [cuenta_id, tipo, -valNum]
      );

      await db.query(
        "UPDATE cuentas SET saldo = saldo - ? WHERE id = ?",
        [valNum, cuenta_id]
      );

      return res.json({ message: "Retiro realizado" });
    }

    await db.query(
      "INSERT INTO movimientos (cuenta_id, tipo, valor) VALUES (?, ?, ?)",
      [cuenta_id, tipo, valNum]
    );

    await db.query(
      "UPDATE cuentas SET saldo = saldo + ? WHERE id = ?",
      [valNum, cuenta_id]
    );

    res.json({ message: "Movimiento registrado" });
  } catch {
    res.status(500).json({ message: "Error al procesar movimiento" });
  }
});

app.get("/api/movimientos/:cuentaId", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT * FROM movimientos WHERE cuenta_id = ? ORDER BY fecha DESC",
      [req.params.cuentaId]
    );
    res.json(rows || []);
  } catch {
    res.status(500).json({ message: "Error" });
  }
});

app.get("/api/saldo/:cuentaId", async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT tipo, saldo FROM cuentas WHERE id = ?",
      [req.params.cuentaId]
    );

    if (!rows || rows.length === 0)
      return res.status(404).json({ message: "Cuenta no encontrada" });

    res.json(rows[0]);
  } catch {
    res.status(500).json({ message: "Error" });
  }
});

// ---------------------------------------------
// SERVIR FRONTEND
// ---------------------------------------------
const frontendPath = path.join(__dirname, "frontend");
app.use(express.static(frontendPath));

// Catch-all corregido para servir frontend sin errores
app.get("/*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// ---------------------------------------------
// SERVIDOR
// ---------------------------------------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor BACKEND OK en puerto ${PORT}`);
});
