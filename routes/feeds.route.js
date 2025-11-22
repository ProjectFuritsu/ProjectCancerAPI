const express = require('express');
const AuthenticateToken = require('../utils/auth/authenticate')

const { delete_new_author, delete_new_feed, delete_new_type, get_feeds_info, get_feeds_list, insert_new_author, insert_new_feed, insert_new_type, patch_update_publication, update_new_author, update_new_type } = require('../controller/feeds.controller')

const feedsrouter = express.Router();

feedsrouter.get('/', AuthenticateToken, get_feeds_list);
feedsrouter.get('/:id', AuthenticateToken, get_feeds_info);
feedsrouter.delete('/:publication_id', AuthenticateToken, delete_new_feed);
feedsrouter.put('/:id', AuthenticateToken, patch_update_publication);
feedsrouter.post('/', AuthenticateToken, insert_new_feed);

// ? This is the routes for Types
feedsrouter.post('/type', AuthenticateToken, insert_new_type);
feedsrouter.delete('/type/:type_code', AuthenticateToken, delete_new_type);
feedsrouter.put('/type/:type_code', AuthenticateToken, update_new_type);

// ? This is the routes for Author
feedsrouter.post('/author', AuthenticateToken, insert_new_author);
feedsrouter.delete('/author/:author_id', AuthenticateToken, delete_new_author);
feedsrouter.put('/author/:author_id', AuthenticateToken, update_new_author);

module.exports = feedsrouter;
