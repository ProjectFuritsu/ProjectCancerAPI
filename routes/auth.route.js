const express = require('express');
const {logout,login,signup,refreshtoken} = require('../controller/auth.controller')
const AuthenticateToken = require('../utils/auth/authenticate')


const auth = express.Router();

auth.post("/refresh", AuthenticateToken,refreshtoken)
auth.post("/signup",signup)
auth.post("/login",login)
auth.delete("/logout", logout)

module.exports = auth;  