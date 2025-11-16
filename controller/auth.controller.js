import jwt from "jsonwebtoken";
import con from "../utils/db/con.js";
import bcrypt from "bcryptjs";
import validator from "validator";

import GenerateAccessToken from "../utils/auth/generatetoken.js";


/* 
  Token Refresh Endpoint
  - Accept refresh token
  - Validate and verify refresh token
  - Generate new access token

  * STATUS:
    200 - OK (New access token generated)
    401 - Unauthorized (Missing or invalid refresh token)
    403 - Forbidden (Refresh token not found or expired)
    500 - Internal Server Error (Database error)

  * Request Sample:
    POST /auth/refresh
    Content-Type: application/json
    {
      "refresh_token": "your_refresh_token_here"
    }

  * The response contains the new access token.
*/
export async function refreshtoken(req, res)  {
  const { refresh_token } = req.body;

  if (!refresh_token) return res.sendStatus(401);

  try {
    // Check if refresh token exists in DB
    const tokenExists = await con.query(
      'SELECT * FROM sessions WHERE session_code = $1',
      [refresh_token]
    );

    if (tokenExists.rowCount === 0) return res.sendStatus(403);

    // Verify refresh token
    jwt.verify(refresh_token, process.env.REFRESH_TOKEN_SECRET, async (err, user) => {
      if (err) return res.sendStatus(403);

      // Generate new access token
      const access_token = generateAccessToken({ id: user.id, email: user.email });


      await con.query(
        'UPDATE sessions SET access_token_id = $1 WHERE session_code = $2',
        [access_token, refresh_token]
      );

      
      res.json({ access_token });
    });

  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
};


/*
  Registration Endpoint
  - Accept user details
  - Hash password
  - Validate required fields
  - Save user to the database

  * STATUS:
    201 - Created (User registered successfully)
    400 - Bad Request (Missing required fields)
    500 - Internal Server Error (Database error)

  * Request Sample:
    POST /auth/signup
    Content-Type: application/json
    {
      "fname": "John",
      "lname": "Doe",
      "suffix": "Jr",
      "contact_number": "1234567890",
      ... other fields ...
    }
  
  * The response contains a success message.

*/
export async function signup (req, res)  {
  // get data from request body
  const { fname, lname, suffix, contact_number, date_of_birth, email, password, pin, city_zip_code, brgy_code, prov_code, prk_code, role_id, cancer_type_code, gender_code, ethnic_code, occu_code } = req.body;

  // Validate required fields
  const safeFname = validator.escape(fname);
  const safeLname = validator.escape(lname);
  const safeEmail = validator.normalizeEmail(email);
  const safePassword = validator.escape(password);
  const safePin = validator.escape(pin);

  // Save user to the database
  const sql = `
      INSERT INTO clients (
        fname, lname, suffix, contact_number, date_of_birth,
        email, password, pin, city_zip_code,
        brgy_code, prov_code, role_id,
        cancer_type_code, gender_code, ethnic_code, occu_code
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16
      ) RETURNING *`;

  // Hash the password before saving to the database
  const salt = bcrypt.genSaltSync(10);
  const hashedPassword = bcrypt.hashSync(safePassword, salt);

  // Parameters for the SQL query
  const params = [
    safeFname, safeLname, suffix, contact_number, date_of_birth,
    safeEmail, hashedPassword, safePin, city_zip_code,
    brgy_code, prov_code, role_id,
    cancer_type_code, gender_code, ethnic_code, occu_code
  ];

  await con.query(sql, params);

  // Respond with success message
  res.json({
    message: "User registered successfully",
  }).status(201);

};


/* 
  Login Endpoint
  - Validate user credentials
  - Generate JWT tokens (access and refresh)

  * STATUS:
    200 - OK
    400 - Bad Request (Missing username or password)
    401 - Unauthorized (Invalid credentials)
    500 - Internal Server Error (Database error)

  * Request Sample:
    POST /auth/login
    Content-Type: application/json
    {
      "username": "johndoe",
      "password": "password123"
    }

  * The response contains the access token, refresh token, and user info (excluding password).

*/
export async function login(req, res) {
  const { username, password } = req.body;

  // Validate request body
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  try {
    // Query the user from the database

    const result = await con.query(
      "SELECT * FROM clients WHERE username = $1",
      [username]
    );

    // If no user found, return 401
    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = result.rows[0];

    // Compare hashed passwords
    const validPassword = bcrypt.compareSync(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate JWT tokens
    const access_token = GenerateAccessToken(user);
    const refresh_token = jwt.sign(user, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });


    // Store refresh token in the database
    try {
      const insert_session = `INSERT INTO sessions (
          clientid, session_code, session_time, expired_at,access_token_id
        ) VALUES (
          $1,$2,$3,$4,$5
        ) RETURNING *`

      const params = [
        user.clientid, refresh_token, new Date().toISOString(), new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), access_token
      ];

      await con.query(insert_session, params);

    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Database error" });
    }

    res.setHeader("Authorization", `Bearer ${access_token}`);

    // Return tokens and user info (excluding password)
    delete user.password; // Remove password from user object before sending response
    res.json({
      message: "User logged in successfully",
      access_token,
      refresh_token,
      user,
    }).status(200);


  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
};


/*
  Logout Endpoint
  - Invalidate refresh token

  * STATUS:
    200 - OK (User logged out successfully)
    400 - Bad Request (Missing refresh token)
    404 - Not Found (Refresh token not found)
    500 - Internal Server Error (Database error)

  * Request Sample:
    DELETE /auth/logout
    Content-Type: application/json
    {
      "refresh_token": "your_refresh_token_here"
    }

  * The response contains a success message.
*/
export async function logout (req, res) {
  const { refresh_token } = req.body;
  if (!refresh_token) return res.sendStatus(400);

  try {
    // Delete the session row, which revokes both access and refresh token
    await con.query(
      'DELETE FROM sessions WHERE session_code = $1 returning *',
      [refresh_token]
    );

    res.json({ message: "User logged out successfully" });
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
}
