const { port, host, user, password, database } = require('./config');
const express = require('express');
const cors = require('cors');
const crypto = require('./modules/crypto');
const { Pool } = require('pg');

// report any uncaught Errors
process.on('uncaughtException', (error) => {
    console.trace('!!!UNCAUGHT ERROR!!!' + error.stack);
 });

const pool = new Pool({
    max: 20,
    host: host,
    user: user,
    password: Buffer.from(password, 'base64').toString('utf8'),
    database: database
});

// var used to track database connection
let dbConnected = false;

// sends error message and updates dbConnected if error occurs during connection
const handleDisconnect = (err) => {
    // if error and database is still connected, end database connection
    if(err && dbConnected) pool.end(); 

    console.trace(err);
    return dbConnected = false;
};

// attempts to connect to database; updates dbConnected variable and sends error message if necessary
const connect = () => pool.connect((err) => {
    if(err) {
        handleDisconnect(err);
    } else {
        dbConnected = true;
    };
});
connect();

// looks for errors with client connection
pool.on('connect', client => {
    client.on('error', err => {
        if(err && dbConnected) handleDisconnect(err);
    });
});

// processes query and logs query information
const dbQuery = (text, params, callback) => {
    if(dbConnected) {
        const start = Date.now();
        return pool.query(text, params, (err, res) => {
            const duration = Date.now() - start;
            console.log('executed query', { text, duration, rows: res?.rowCount });
            callback(err, res);
        });
    };
};
exports.dbQuery = dbQuery;

// imports authorization functions
const { verifyJWT, validateUser } = require('./modules/auth');

// initialize server
const app = express();
app.use(cors());
app.use(express.json());
app.listen(process.env.PORT || 3000, () => {
    console.log(`app is running on port ${port || 3000}`)
});

// if database not connected, attempt reconnect and send error response to frontend if issue persists
app.use((req, res, next) => {
    if(!dbConnected){
        connect();
        if(!dbConnected) return res.status(503).json('Error connecting to database... please try again later');
    };
    next();
});

// add api calls from modules - ensure userHandling is first to skip verifyJWT middleware
require('./modules/routing/userHandling')(app, validateUser, crypto, dbQuery);

// ensure remaining api calls are secured by verifyJWT
app.use(verifyJWT);

app.get('/auth/refreshToken', (req, res) => res.status(200).json(req.headers.token));
require('./modules/routing/entriesHandling')(app, crypto, dbQuery);