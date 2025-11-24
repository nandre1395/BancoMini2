import express from "express";
import mysql from "mysql2";
import bcrypt from "bcrypt";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios"; // 👈 Nuevo: para consumir API externa

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Servir frontend (ruta corregida)
app.use(express.static(path.join(__dirname, "../frontend")));

// Servir imágenes
app.use("/img", express.static(path.join(__dirname, "../img")));

// Conexión DB
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "Andrea",
  database: "MiniBanco"
});

db.connect((err) => {
  if (err) console.log("❌ Error DB", err);
  else console.log("✅ Conectado a MySQL");
});

/* ------------------------
   RUTAS USUARIO / AUTH
-------------------------*/

// Registro
app.post("/api/register", async (req, res) => {
  const { id, nombre, password } = req.body;
  if (!id || !nombre || !password) return res.status(400).json({ message: "Datos incompletos" });

  try {
    const hashedPass = await bcrypt.hash(password, 10);
    db.query("INSERT INTO usuarios (id, nombre, password) VALUES (?, ?, ?)",
      [id, nombre, hashedPass],
      (err) => {
        if (err) {
          console.log(err);
          return res.status(500).json({ message: "❌ El usuario ya existe o error" });
        }
        res.json({ message: "✅ Registro exitoso" });
      }
    );
  } catch (e) {
    console.log(e);
    res.status(500).json({ message: "Error servidor" });
  }
});

// Login
app.post("/api/login", (req, res) => {
  const { id, password } = req.body;
  if (!id || !password) return res.status(400).json({ message: "Datos incompletos" });

  db.query("SELECT * FROM usuarios WHERE id = ?", [id], async (err, result) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ message: "Error servidor" });
    }
    if (!result || result.length === 0) return res.status(401).json({ message: "❌ Usuario no encontrado" });

    const user = result[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "❌ Contraseña incorrecta" });

    res.json({ message: "✅ Bienvenido", id: user.id, nombre: user.nombre });
  });
});

// Obtener info de usuario
app.get("/api/user/:id", (req, res) => {
  db.query("SELECT id, nombre FROM usuarios WHERE id = ?", [req.params.id], (err, rows) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ message: "Error" });
    }
    if (!rows || rows.length === 0) return res.status(404).json({ message: "Usuario no encontrado" });
    res.json(rows[0]);
  });
});

/* ------------------------
   RUTAS CUENTAS
-------------------------*/

// Obtener cuentas del usuario
app.get("/api/cuentas/:id", (req, res) => {
  db.query("SELECT * FROM cuentas WHERE usuario_id = ?", [req.params.id], (err, result) => {
    if (err) {
      console.log(err);
      return res.status(500).json({ message: "Error al obtener cuentas" });
    }
    res.json(result || []);
  });
});

// Crear nueva cuenta (soporta CDT)
app.post("/api/cuentas", (req, res) => {
  const { usuario_id, tipo, monto, cuentaOrigen, plazo } = req.body;

  if (!usuario_id || !tipo) return res.status(400).json({ message: "Datos incompletos" });

  if (tipo === "CDT") {
    if (!monto || !cuentaOrigen || !plazo) return res.status(400).json({ message: "Datos CDT incompletos" });
    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum <= 0) return res.status(400).json({ message: "Monto inválido" });

    db.query("SELECT saldo FROM cuentas WHERE id = ?", [cuentaOrigen], (err, rows) => {
      if (err) { console.log(err); return res.status(500).json({ message: "Error" }); }
      if (!rows || rows.length === 0) return res.status(404).json({ message: "Cuenta origen no encontrada" });
      const origenSaldo = parseFloat(rows[0].saldo);
      if (origenSaldo < montoNum) return res.status(400).json({ message: "❌ Saldo insuficiente" });

      db.query("INSERT INTO cuentas (usuario_id, tipo, saldo) VALUES (?, ?, ?)",
        [usuario_id, tipo, montoNum], (err2, result2) => {
          if (err2) { console.log(err2); return res.status(500).json({ message: "Error al crear CDT" }); }

          const newCtaId = result2.insertId;

          db.query("UPDATE cuentas SET saldo = saldo - ? WHERE id = ?", [montoNum, cuentaOrigen], (err3) => {
            if (err3) console.log(err3);

            db.query("INSERT INTO movimientos (cuenta_id, tipo, valor) VALUES (?, ?, ?)",
              [cuentaOrigen, "Inversión CDT", -montoNum]);
            db.query("INSERT INTO movimientos (cuenta_id, tipo, valor) VALUES (?, ?, ?)",
              [newCtaId, "CDT abierto", montoNum]);

            res.json({ message: "✅ CDT creado correctamente", cuentaId: newCtaId });
          });
        }
      );
    });

  } else {
    db.query("INSERT INTO cuentas (usuario_id, tipo, saldo) VALUES (?, ?, 0)",
      [usuario_id, tipo], (err) => {
        if (err) { console.log(err); return res.status(500).json({ message: "Error al crear cuenta" }); }
        res.json({ message: "✅ Cuenta creada" });
      }
    );
  }
});

// Eliminar cuenta (primero elimina sus movimientos)
app.delete("/api/cuentas/:id", (req, res) => {
  const cuentaId = req.params.id;
  const transferTo = req.query.transferTo;

  db.query("SELECT saldo, usuario_id FROM cuentas WHERE id = ?", [cuentaId], (err, rows) => {
    if (err) { 
      console.log(err); 
      return res.status(500).json({ message: "Error al consultar cuenta" }); 
    }
    if (!rows || rows.length === 0) 
      return res.status(404).json({ message: "Cuenta no encontrada" });

    const saldo = parseFloat(rows[0].saldo);

    // Caso 1: La cuenta tiene saldo y no se indica destino
    if (saldo > 0 && !transferTo) {
      return res.status(400).json({ message: "❌ La cuenta aún tiene saldo, especifique cuenta destino" });
    }

    // Función auxiliar para eliminar movimientos y luego la cuenta
    const eliminarCuenta = () => {
      db.query("DELETE FROM movimientos WHERE cuenta_id = ?", [cuentaId], (errMov) => {
        if (errMov) { 
          console.log(errMov); 
          return res.status(500).json({ message: "Error al eliminar movimientos" }); 
        }

        db.query("DELETE FROM cuentas WHERE id = ?", [cuentaId], (errDel) => {
          if (errDel) { 
            console.log(errDel); 
            return res.status(500).json({ message: "Error al eliminar cuenta" }); 
          }
          return res.json({ message: "✅ Cuenta y movimientos eliminados correctamente" });
        });
      });
    };

    // Caso 2: Transferir saldo antes de eliminar
    if (saldo > 0 && transferTo) {
      db.query("UPDATE cuentas SET saldo = saldo + ? WHERE id = ?", [saldo, transferTo], (err2) => {
        if (err2) { 
          console.log(err2); 
          return res.status(500).json({ message: "Error al transferir saldo" }); 
        }

        // Registrar movimientos
        db.query("INSERT INTO movimientos (cuenta_id, tipo, valor) VALUES (?, ?, ?)", 
          [transferTo, "Transferencia recibida", saldo]);
        db.query("INSERT INTO movimientos (cuenta_id, tipo, valor) VALUES (?, ?, ?)", 
          [cuentaId, "Transferencia salida", -saldo]);

        eliminarCuenta();
      });
    } else {
      eliminarCuenta();
    }
  });
});

/* ------------------------
   MOVIMIENTOS
-------------------------*/

// Registrar movimiento (consignación / retiro)
app.post("/api/movimientos", (req, res) => {
  const { cuenta_id, tipo, valor } = req.body;
  console.log("Movimiento recibido:", req.body);

  if (!cuenta_id || !tipo || (valor === undefined || valor === null)) {
    return res.status(400).json({ message: "Datos inválidos" });
  }

  const valNum = parseFloat(valor);
  if (isNaN(valNum) || valNum <= 0) return res.status(400).json({ message: "Valor inválido" });

  if (tipo === "Retiro") {
    db.query("SELECT saldo FROM cuentas WHERE id = ?", [cuenta_id], (err, rows) => {
      if (err) { console.log(err); return res.status(500).json({ message: "Error" }); }
      if (!rows || rows.length === 0) return res.status(404).json({ message: "Cuenta no encontrada" });
      const saldo = parseFloat(rows[0].saldo);
      if (saldo < valNum) return res.status(400).json({ message: "Saldo insuficiente" });

      db.query("INSERT INTO movimientos (cuenta_id, tipo, valor) VALUES (?, ?, ?)",
        [cuenta_id, tipo, -valNum], (err2) => {
          if (err2) { console.log(err2); return res.status(500).json({ message: "Error al guardar movimiento" }); }

          db.query("UPDATE cuentas SET saldo = saldo - ? WHERE id = ?", [valNum, cuenta_id], (err3) => {
            if (err3) console.log(err3);
            return res.json({ message: "✅ Retiro efectuado" });
          });
        });
    });
  } else {
    db.query("INSERT INTO movimientos (cuenta_id, tipo, valor) VALUES (?, ?, ?)",
      [cuenta_id, tipo, valNum], (err) => {
        if (err) { console.log(err); return res.status(500).json({ message: "Error al guardar movimiento" }); }
        db.query("UPDATE cuentas SET saldo = saldo + ? WHERE id = ?", [valNum, cuenta_id], (err2) => {
          if (err2) console.log(err2);
          return res.json({ message: "✅ Movimiento registrado" });
        });
      });
  }
});

// Obtener historial de movimientos
app.get("/api/movimientos/:cuentaId", (req, res) => {
  const cuentaId = req.params.cuentaId;
  db.query("SELECT * FROM movimientos WHERE cuenta_id = ? ORDER BY fecha DESC", [cuentaId], (err, rows) => {
    if (err) { console.log(err); return res.status(500).json({ message: "Error" }); }
    res.json(rows || []);
  });
});

/* ------------------------
   SALDO
-------------------------*/

// Obtener saldo
app.get("/api/saldo/:id", (req, res) => {
  db.query("SELECT saldo, tipo FROM cuentas WHERE id = ?", [req.params.id], (err, rows) => {
    if (err) { console.log(err); return res.status(500).json({ message: "Error" }); }
    if (!rows || rows.length === 0) return res.status(404).json({ message: "Cuenta no encontrada" });
    res.json({ saldo: parseFloat(rows[0].saldo), tipo: rows[0].tipo });
  });
});

/* ------------------------
   NUEVAS FUNCIONALIDADES
-------------------------*/

// 🪙 Consultar tasa de cambio (API pública)
app.get("/api/tasa-cambio/:moneda", async (req, res) => {
  const moneda = req.params.moneda.toUpperCase();
  try {
    const response = await axios.get(`https://api.exchangerate.host/latest?base=${moneda}&symbols=COP`);
    const tasa = response.data.rates.COP;
    res.json({ base: moneda, destino: "COP", tasa, fecha: response.data.date });
  } catch (error) {
    console.error("Error al consultar tasa:", error.message);
    res.status(500).json({ error: "No se pudo obtener la tasa de cambio." });
  }
});

// 💹 Simulador de inversión (interés compuesto)
app.post("/api/simulador-inversion", (req, res) => {
  const { monto, tasaAnual, años, periodos } = req.body;

  if (!monto || !tasaAnual || !años || !periodos) {
    return res.status(400).json({ error: "Faltan datos para la simulación." });
  }

  const r = tasaAnual / 100;
  const n = periodos;
  const t = años;

  const montoFinal = monto * Math.pow(1 + r / n, n * t);
  const interesGenerado = montoFinal - monto;

  const crecimiento = [];
  for (let i = 1; i <= años; i++) {
    const valor = monto * Math.pow(1 + r / n, n * i);
    crecimiento.push({ año: i, monto: valor.toFixed(2) });
  }

  res.json({
    monto_inicial: monto,
    tasa_anual: tasaAnual,
    años,
    periodos,
    monto_final: montoFinal.toFixed(2),
    interes_generado: interesGenerado.toFixed(2),
    crecimiento
  });
});

/* ------------------------
   SERVIDOR
-------------------------*/

// Si ninguna ruta coincide, devolver index.html (para evitar Cannot GET /)
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend", "index.html"));
});

app.listen(3000, () => console.log("🚀 Servidor ejecutándose en http://localhost:3000"));
