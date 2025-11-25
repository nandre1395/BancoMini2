import express from "express";
import mysql from "mysql2";
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

// CORS
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
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

//  FIX PARA EXPRESS 5 + RENDER 
app.options("*", cors());

// MySQL Config
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
});

// Conectar MySQL
db.connect((err) => {
  if (err) {
    console.error("❌ Error MySQL:", err.message);
  } else {
    console.log("✅ MySQL conectado correctamente");
  }
});

// Keep-alive Railway
setInterval(() => {
  db.ping((err) => {
    if (err) console.log("⚠️ Error keep-alive:", err);
  });
}, 240000);

function limpiarTexto(texto) {
  if (typeof texto !== "string") return texto;
  return texto.trim();
}

// -------------------------------------------------------------------
// RUTAS API
// -------------------------------------------------------------------

// Health
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Backend funcionando correctamente",
    timestamp: new Date().toISOString(),
  });
});

// Registro
app.post("/api/register", async (req, res) => {
  const id = limpiarTexto(req.body.id);
  const nombre = limpiarTexto(req.body.nombre);
  const password = limpiarTexto(req.body.password);

  if (!id || !nombre || !password)
    return res.status(400).json({ message: "Datos incompletos" });

  try {
    const hashedPass = await bcrypt.hash(password, 10);
    db.query(
      "INSERT INTO usuarios (id, nombre, password) VALUES (?, ?, ?)",
      [id, nombre, hashedPass],
      (err) => {
        if (err) {
          return res
            .status(500)
            .json({ message: "❌ El usuario ya existe o error" });
        }
        res.json({ message: "✅ Registro exitoso" });
      }
    );
  } catch (e) {
    res.status(500).json({ message: "Error servidor" });
  }
});

// Login
app.post("/api/login", (req, res) => {
  const id = limpiarTexto(req.body.id);
  const password = req.body.password;

  if (!id || !password)
    return res.status(400).json({ message: "Datos incompletos" });

  db.query("SELECT * FROM usuarios WHERE id = ?", [id], async (err, result) => {
    if (err) return res.status(500).json({ message: "Error servidor" });
    if (!result || result.length === 0)
      return res.status(401).json({ message: "Usuario no encontrado" });

    const user = result[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match)
      return res.status(401).json({ message: "Contraseña incorrecta" });

    res.json({
      message: "Bienvenido",
      id: user.id,
      nombre: user.nombre,
    });
  });
});

// Usuario info
app.get("/api/user/:id", (req, res) => {
  db.query(
    "SELECT id, nombre FROM usuarios WHERE id = ?",
    [req.params.id],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "Error" });
      if (!rows || rows.length === 0)
        return res.status(404).json({ message: "Usuario no encontrado" });
      res.json(rows[0]);
    }
  );
});

// Cuentas
app.get("/api/cuentas/:id", (req, res) => {
  db.query(
    "SELECT * FROM cuentas WHERE usuario_id = ?",
    [req.params.id],
    (err, result) => {
      if (err)
        return res.status(500).json({ message: "Error al obtener cuentas" });
      res.json(result || []);
    }
  );
});

// Crear cuenta
app.post("/api/cuentas", (req, res) => {
  const { usuario_id, tipo, monto, cuentaOrigen, plazo } = req.body;

  if (!usuario_id || !tipo)
    return res.status(400).json({ message: "Datos incompletos" });

  if (tipo === "CDT") {
    if (!monto || !cuentaOrigen || !plazo)
      return res.status(400).json({ message: "Datos CDT incompletos" });

    const montoNum = parseFloat(monto);

    db.query(
      "SELECT saldo FROM cuentas WHERE id = ?",
      [cuentaOrigen],
      (err, rows) => {
        if (err) return res.status(500).json({ message: "Error" });
        if (!rows || rows.length === 0)
          return res
            .status(404)
            .json({ message: "Cuenta origen no encontrada" });

        const saldo = parseFloat(rows[0].saldo);
        if (saldo < montoNum)
          return res.status(400).json({ message: "Saldo insuficiente" });

        db.query(
          "INSERT INTO cuentas (usuario_id, tipo, saldo) VALUES (?, ?, ?)",
          [usuario_id, tipo, montoNum],
          (err2, result2) => {
            if (err2)
              return res.status(500).json({ message: "Error al crear CDT" });

            const newCtaId = result2.insertId;

            db.query(
              "UPDATE cuentas SET saldo = saldo - ? WHERE id = ?",
              [montoNum, cuentaOrigen]
            );
            db.query(
              "INSERT INTO movimientos (cuenta_id, tipo, valor) VALUES (?, ?, ?)",
              [cuentaOrigen, "Inversión CDT", -montoNum]
            );
            db.query(
              "INSERT INTO movimientos (cuenta_id, tipo, valor) VALUES (?, ?, ?)",
              [newCtaId, "CDT abierto", montoNum]
            );

            res.json({
              message: "CDT creado correctamente",
              cuentaId: newCtaId,
            });
          }
        );
      }
    );
  } else {
    db.query(
      "INSERT INTO cuentas (usuario_id, tipo, saldo) VALUES (?, ?, 0)",
      [usuario_id, tipo],
      (err) => {
        if (err)
          return res.status(500).json({ message: "Error al crear cuenta" });
        res.json({ message: "Cuenta creada" });
      }
    );
  }
});

// Eliminar cuenta
app.delete("/api/cuentas/:id", (req, res) => {
  const cuentaId = req.params.id;
  const transferTo = req.query.transferTo;

  db.query(
    "SELECT saldo FROM cuentas WHERE id = ?",
    [cuentaId],
    (err, rows) => {
      if (err)
        return res.status(500).json({ message: "Error al consultar cuenta" });
      if (!rows || rows.length === 0)
        return res.status(404).json({ message: "Cuenta no encontrada" });

      const saldo = parseFloat(rows[0].saldo);

      const eliminarCuenta = () => {
        db.query("DELETE FROM movimientos WHERE cuenta_id = ?", [cuentaId]);
        db.query("DELETE FROM cuentas WHERE id = ?", [cuentaId]);
        res.json({ message: "Cuenta eliminada correctamente" });
      };

      if (saldo > 0 && transferTo) {
        db.query(
          "UPDATE cuentas SET saldo = saldo + ? WHERE id = ?",
          [saldo, transferTo],
          eliminarCuenta
        );
      } else if (saldo > 0 && !transferTo) {
        res.status(400).json({
          message: "La cuenta tiene saldo, especifique cuenta destino",
        });
      } else {
        eliminarCuenta();
      }
    }
  );
});

// Movimientos
app.post("/api/movimientos", (req, res) => {
  const { cuenta_id, tipo, valor } = req.body;
  if (!cuenta_id || !tipo || valor === undefined)
    return res.status(400).json({ message: "Datos inválidos" });

  const valNum = parseFloat(valor);

  if (tipo === "Retiro") {
    db.query(
      "SELECT saldo FROM cuentas WHERE id = ?",
      [cuenta_id],
      (err, rows) => {
        if (err) return res.status(500).json({ message: "Error" });
        const saldo = rows[0].saldo;
        if (saldo < valNum)
          return res.status(400).json({ message: "Saldo insuficiente" });

        db.query(
          "INSERT INTO movimientos (cuenta_id, tipo, valor) VALUES (?, ?, ?)",
          [cuenta_id, tipo, -valNum]
        );
        db.query(
          "UPDATE cuentas SET saldo = saldo - ? WHERE id = ?",
          [valNum, cuenta_id]
        );
        res.json({ message: "Retiro realizado" });
      }
    );
  } else {
    db.query(
      "INSERT INTO movimientos (cuenta_id, tipo, valor) VALUES (?, ?, ?)",
      [cuenta_id, tipo, valNum]
    );
    db.query(
      "UPDATE cuentas SET saldo = saldo + ? WHERE id = ?",
      [valNum, cuenta_id]
    );
    res.json({ message: "Movimiento registrado" });
  }
});

// Historial
app.get("/api/movimientos/:cuentaId", (req, res) => {
  db.query(
    "SELECT * FROM movimientos WHERE cuenta_id = ? ORDER BY fecha DESC",
    [req.params.cuentaId],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "Error" });
      res.json(rows || []);
    }
  );
});

// Saldo
app.get("/api/saldo/:cuentaId", (req, res) => {
  db.query(
    "SELECT tipo, saldo FROM cuentas WHERE id = ?",
    [req.params.cuentaId],
    (err, rows) => {
      if (err) return res.status(500).json({ message: "Error" });
      if (!rows || rows.length === 0)
        return res.status(404).json({ message: "Cuenta no encontrada" });
      res.json(rows[0]);
    }
  );
});

// Simulador
app.post("/api/simulador-inversion", (req, res) => {
  const { monto, tasaAnual, años, periodos } = req.body;
  const r = tasaAnual / 100;
  const n = periodos;
  const t = años;

  const montoFinal = monto * Math.pow(1 + r / n, n * t);
  const interesGenerado = montoFinal - monto;

  const crecimiento = [];
  for (let i = 1; i <= años; i++) {
    crecimiento.push({
      año: i,
      monto: (monto * Math.pow(1 + r / n, n * i)).toFixed(2),
    });
  }

  res.json({
    monto_inicial: monto,
    monto_final: montoFinal.toFixed(2),
    interes_generado: interesGenerado.toFixed(2),
    crecimiento,
  });
});

// -------------------------------------------------------------------
// SERVIR FRONTEND
// -------------------------------------------------------------------
const frontendPath = path.join(__dirname, "../frontend");
app.use(express.static(frontendPath));

app.use((req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// -------------------------------------------------------------------
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor BACKEND corriendo en puerto ${PORT}`);
});
