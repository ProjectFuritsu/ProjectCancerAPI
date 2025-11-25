const express = require('express');
const AuthenticateToken = require ('../utils/auth/authenticate')
const {get_sg_details,get_sg_list,insert_new_founder,insert_sg,update_sg, delete_sg} = require('../controller/supportgroups.controller');



const SGrouter = express.Router();

SGrouter.get('/',AuthenticateToken,get_sg_list);
SGrouter.get('/:SGID',AuthenticateToken,get_sg_details);
SGrouter.post('/',AuthenticateToken,insert_sg);
SGrouter.put('/:SGID',AuthenticateToken,update_sg);

SGrouter.delete('/:SGID',AuthenticateToken,delete_sg);

SGrouter.post('/founders',AuthenticateToken,insert_new_founder);



module.exports = SGrouter;