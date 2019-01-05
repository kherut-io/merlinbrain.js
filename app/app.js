//REQUIREs
const express = require('express');
const MongoClient = require('mongodb').MongoClient;
const bodyParser = require('body-parser');
const winston = require('winston');
const ip = require('ip');
const path = require('path');
const cors = require('cors')

//CONFIG
const config = require('../config')(true);

//LOGGING
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    defaultMeta: {service: 'user-service'},
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
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

//SET UP API AND WEBSERVER
api.use(bodyParser.urlencoded({ extended: true }));
api.use(logMiddleware);
api.use(cors());

webserver.use(express.static(path.join(__dirname, 'www/views'))); 
webserver.engine('.ejs', require('ejs').__express);
webserver.set('views', path.join(__dirname, 'www/views'));
webserver.set('view engine', 'ejs');

webserver.get('/favicon.ico' , function(req, res) {
    //HANDLE FAVICON
});

webserver.get('*', function(req, res) {
    res.render(path.join(__dirname, 'www/views') + req.url, { appPath: __dirname, config: require('../config')(false), theme: require(path.join(__dirname, 'www/views/themes/', config.theme, '/theme.json')), localIp: localIp });
});

//CONNECT TO MONGODB
MongoClient.connect(config.mongo.address, (err, database) => {
    //COULDN'T CONNECT TO MONGODB
    if (err) {
        logger.error(err);
        process.exit(1);
    }

    //GET ALL THE ROUTES FOR THE API
    require('./api/routes')(api, database);

    //MAKE THE API LISTEN ON apiPort
    api.listen(apiPort, () => {
        logger.info('API on http://' + localIp + ':' + apiPort);

        //CREATE WEBSERVER ON httpPort -> SERVES www/views
        webserver.listen(httpPort, () => {
            logger.info('Control panel on http://' + localIp + ':' + httpPort);
        });
    });               
})