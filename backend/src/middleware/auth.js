const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * requireAuth — Verifies the request has a valid JWT.
 * Attaches decoded token to req.user.
 * Does NOT enforce a specific role (use requireApproverRole for that).
 */
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Authentication required. Provide a valid Bearer token.",
      code: "UNAUTHENTICATED",
    });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      error: "Invalid or expired token.",
      code: "INVALID_TOKEN",
    });
  }
}

module.exports = { requireAuth };