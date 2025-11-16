const express = require('express');
const AuthenticateToken = require ('../utils/auth/authenticate')
const { get_financial_Insti_list, get_financial_Insti_info, delete_financial_Insti} = require('../controller/financial.controller')


const financialrouter = express.Router();

financialrouter.get('/',AuthenticateToken,get_financial_Insti_list);
financialrouter.get('/:id',AuthenticateToken ,get_financial_Insti_info);
financialrouter.delete('/:id',AuthenticateToken,delete_financial_Insti);

module.exports = financialrouter;