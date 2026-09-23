const { Router } = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const prisma = require("../lib/prisma");

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("FATAL: JWT_SECRET environment variable is not set. Server refusing to start with insecure defaults.");
}
const JWT_EXPIRES_IN = "24h";

/**
 * POST /api/auth/login
 *
 * Accepts: { email, password }
 * Returns: { token, role, userId }
 *
 * Looks up the user by email, compares password hash with bcrypt,
 * signs a JWT containing { userId, role }, returns it.
 */
router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const passwordValid = await bcrypt.compare(password, user.passwordHash);

    if (!passwordValid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.status(200).json({
      token,
      role: user.role,
      userId: user.id,
    });
  } catch (err) {
    console.error("Login failed:", err.message);
    return res.status(500).json({ error: "Internal server error from auth" });
  }
});

/**
 * GET /api/auth/me
 *
 * Returns the current user's info from a valid JWT.
 * Used by the frontend to verify a stored token is still valid.
 */
router.get("/auth/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
    });

    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    return res.status(200).json({
      userId: user.id,
      email: user.email,
      role: user.role,
    });
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
});

module.exports = router;
