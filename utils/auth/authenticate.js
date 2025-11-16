const con = require("../db/con");
const jwt = require("jsonwebtoken");
/*
  Middleware to authenticate JWT token
  - Validates the token
  - Checks if the token is revoked

  * STATUS:
    401 - Unauthorized (Missing token)
    403 - Forbidden (Invalid or revoked token)
    500 - Internal Server Error (Database error)

  * Usage:
    Add `authenticateToken` as middleware to any route that requires authentication.

  * Example:
    router.get("/protected", authenticateToken, (req, res) => { ... });
 */ 
async function AuthenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    
    const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    delete payload.password; // Remove password from payload if present
    payload.access_token_id = token; // Add access_token_id to payload

    // console.log(payload);
    
    // Check if the token's access_token_id exists in DB
    const session = await con.query(
      'SELECT * FROM sessions WHERE access_token_id = $1',
      [payload.access_token_id]
    );


    if (session.rowCount === 0) return res.sendStatus(403); // token revoked

    req.user = payload;
   
    
    next();
  } catch (err) {
   
    return res.sendStatus(403);
  }
}

module.exports = AuthenticateToken;