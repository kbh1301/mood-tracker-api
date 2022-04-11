const jwt = require('jsonwebtoken');
const crypto = require('./crypto.js');
const { dbQuery } = require('../server.js');

const secret = 'jwtSecret';
const refreshSecret = 'jwtSecret';
const jwtExpiration = 300; // 5 min
const jwtRefreshExpiration = 86400; // 24 hrs

const tokenList = {};

// handles token validation; also handles token refresh if refreshToken is not yet expired
const checkTokens = (req) => {
    const { token, refreshtoken } = req.headers;
    try {
        const decodeRefreshToken = jwt.verify(refreshtoken, refreshSecret);
        const id = decodeRefreshToken.id;

        try {
            jwt.verify(token, secret);
        } catch(err) {
            // refreshToken is not expired && token is expired; generate new token and attach to headers
            const newToken = jwt.sign({id}, secret, {expiresIn: jwtExpiration});
            tokenList.token = newToken;
            req.headers.token = newToken;
            return id;
        }

        // refreshToken and token are valid; return id
        return id;
    } catch(err) {
        // tokens are invalid; throw error
        throw err;
    }
};

// middleware to secure routes
const verifyJWT = (req, res, next) => {
    try {
        // pass decoded user id to parameters for fetch continuation
        req.body.decodedId = checkTokens(req);
        next();
    } catch(err) {
        // checkTokens returned an error; send error response to frontend
        console.trace(err)
        res.status(401).json('Unauthorized: Invalid Token(s)');
    }
};

// middleware that handles username and password validation; generates tokens for valid logins
const validateUser = (req, res, next) => {
    const { username, password } = req.body;
    const query = `SELECT * FROM users WHERE username = $1`;

    // run user table query
    dbQuery(query, [username], (err, result) => {
        if(err) {
            console.trace('ERROR: ' + error);
            return res.status(400).json(error);
        };
        const data = result.rows[0];

        // check if user exists
        if(!data) return res.status(400).json('Cannot find user');
        // validate password
        const isValid = data.password ? crypto.verify(password, data.password) : true;
        if(!isValid) return res.status(401).json('Invalid Password');

        // generate tokens and user id
        const id = data.user_id;
        const token = jwt.sign({id}, secret, {expiresIn: jwtExpiration});
        const refreshToken = jwt.sign({id}, refreshSecret, {expiresIn: jwtRefreshExpiration});
        Object.assign(tokenList, {token: token, refreshToken: refreshToken});

        // append token and id information to req and continue
        req.body = {...req.body, id: id, token: token, refreshToken: refreshToken}
        return next();
    });
};

module.exports = {
    verifyJWT,
    validateUser
};