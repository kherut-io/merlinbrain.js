//REQUIREs
const express = require('express');
const MongoClient = require('mongodb').MongoClient;
const bodyParser = require('body-parser');
const winston = require('winston');
const ip = require('ip');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

//CONFIG
const config = require('../config')(true);

//PROJECT ROOT
const root = path.resolve(path.dirname(require.main.filename), '..');

//LOGGING
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    defaultMeta: {service: 'user-service'},
    transports: [
        new winston.transports.File({ filename: root + '/logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: root + '/logs/combined.log' })
    ]
});

if (config.environment == 'development') {
    logger.add(new winston.transports.Console());
}

//LOGGING MIDDLEWARE
function logMiddleware(req, res, next) {
    logger.info({ originalUrl: req.originalUrl, method: req.method, body: req.body });

    next();
}

//INITIALISE VARIABLES
const api = express();
const webserver = express();
const apiPort = process.env.API_PORT || config.apiPort;
const httpPort = process.env.HTTP_PORT || config.httpPort;
const localIp = ip.address();
var theme = config.theme;
var wsMongoError;

//DOES THEME EXIST?
fs.access(root + '/app/www/views/themes/' + theme + '/theme.json', function(err) {
    if(err) {
        logger.error('No such theme as `' + theme + '`. Falling back to `merlin-light`.');

        theme = 'merlin-light';
    }
});

//SET UP API AND WEBSERVER
api.use(bodyParser.urlencoded({ extended: true }));
api.use(logMiddleware);
api.use(cors());

webserver.use(express.static(path.join(root, '/app/www/views'))); 
webserver.engine('.ejs', require('ejs').__express);
webserver.set('views', path.join(root, '/app/www/views'));
webserver.set('view engine', 'ejs');

webserver.get('/favicon.ico' , function(req, res) {
    //HANDLE FAVICON
});

webserver.get('*', function(req, res) {
    //WE'RE PASSING FULL CONFIG EVEN IF THE USER DOESN'T HAVE ENOUGH PERMISSIONS <- I'm gonna handle it with Merlin Master and Passport.js in a few commits
    res.render(root + '/app/www/views/' + req.url, { appPath: __dirname, config: require(root + '/config')(true), theme: require(root + '/app/www/views/themes/' + theme + '/theme.json'), localIp: localIp });
});

//CONNECT TO MONGODB
MongoClient.connect(config.mongo._address, (err, database) => {
    //COULDN'T CONNECT TO MONGODB
    if (err) {
        logger.error(err);
        
        //FALLBACK WEBSERVER WHEN MONGO FAILS TO CONNECT
        wsMongoError = express();
    
        wsMongoError.use(express.static(path.join(root, '/app/www/views'))); 
        wsMongoError.engine('.ejs', require('ejs').__express);
        wsMongoError.set('views', path.join(root, '/app/www/views'));
        wsMongoError.set('view engine', 'ejs');

        wsMongoError.get('/favicon.ico' , function(req, res) {});
        wsMongoError.get('*', function(req, res) {
            //WE'RE PASSING FULL CONFIG EVEN IF THE USER DOESN'T HAVE ENOUGH PERMISSIONS <- I'm gonna handle it with Merlin Master and Passport.js in a few commits
            res.render(root + '/app/www/fallback/index', { appPath: __dirname, config: require(root + '/config')(true), theme: require(root + '/app/www/views/themes/' + theme + '/theme.json'), localIp: localIp });
        });

        wsMongoError.listen(httpPort, () => {
            logger.info('Mongo config on http://' + localIp + ':' + httpPort);
        });
    }
     
    //GET ALL THE ROUTES FOR THE API
    require(root + '/app/api/routes')(api, database);

    //MAKE THE API LISTEN ON apiPort
    api.listen(apiPort, () => {
        logger.info('API on http://' + localIp + ':' + apiPort);

        if(typeof wsMongoError == 'undefined') {
            //CREATE WEBSERVER ON httpPort -> SERVES www/views
            webserver.listen(httpPort, () => {
                logger.info('Control panel on http://' + localIp + ':' + httpPort);
            });
        }
    });               
})