const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
const {
    exec
} = require("child_process");
var chokidar = require('chokidar');
var http = require('http').createServer(app);
var io = require('socket.io')(http);
var request = require('request');
var async = require("async");
const utf8 = require('utf8');
//requiring path and fs modules
const path = require('path');
const fs = require('fs');
//joining path of directory 
const uploadsFolder = './uploads/';
const resultsFolder = './results/';
const resultsWGeoFolder = './results_with_geo/';
//start app 
const port = process.env.PORT || 3000;

var uploads = []
var data = []
var watcher = chokidar.watch('uploads', {
    ignored: /(^|[\/\\])\../,
    persistent: true
});

//instagram-scraper @insta_args.txt --followings-input --include-location --media-types none --destination scrape1 --latest --maximum 3

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname + '/index.html'));
});

app.get('/getFriendsPosts', function (req, res) {
    getFriendsPosts("uploads/" + req.query.destination, req.query.maximum)
    res.json({
        error: "none"
    })
})

app.get('/getLocationMap', function (req, res) {
    let requestedMap = fs.readFileSync(resultsWGeoFolder + req.query.locationMap);
    let mapPoints = JSON.parse(requestedMap);
    res.json(mapPoints)
})

app.get('/getFilesGeoProcessed', function (req, res) {
    let files = []
    fs.readdirSync(resultsWGeoFolder).forEach(file => {
        if (file != '.gitkeep')
            files.push(file);
    });
    res.json(files)
})

app.get('/getFilesToProcess', function (req, res) {
    let files = []
    fs.readdirSync(uploadsFolder).forEach(file => {
        if (file != '.gitkeep')
            files.push(file);
    });
    res.json(files)
})

app.get('/getFilesToGeoProcess', function (req, res) {
    let files = []
    fs.readdirSync(resultsFolder).forEach(file => {
        if (file != '.gitkeep')
            files.push(file);
    });
    res.json(files)
})

http.listen(port, () => console.log(`listening on *: ${port}!`))

io.on('connection', function (socket) {
    console.log('a user connected');
    socket.join(socket.handshake.query.token);
    socket.on('friendsProcess', function (val) {
        console.log('friendsProcess: ' + val.file);
        processUploadFolder(val.file, val.token)
    });
    socket.on('friendsGeoProcess', function (val) {
        console.log('friendsGeoProcess: ' + JSON.stringify(val));
        processLocation(val.token, val.file)
    });
    socket.on('disconnect', function () {
        console.log('user disconnected');
    });
});

/* async.waterfall([function (callback) {
        getUploadsFolder(function () {
            callback(null);
        })
    },
    function (callback) {
        processUploadFolder(uploads[0],function(){
            callback(null); 
        })
    },
    function (callback) {
        let data = JSON.parse(fs.readFileSync(resultsFolder + uploads[0] + ".json"));
        processLocation(data, uploads[0])
    }
], function (err, result) {
    // result now equals 'done'
}) */


function processLocation(token, fileName) {
    var number = 0;
    var processed = require(resultsFolder + fileName);
    var processedSize = processed.length;
    async.mapSeries(processed, function (user, next) {
        number++;
        io.to(token).emit("friendsGeoProcessPercentage", Math.floor(100 * number / processedSize));
        //console.log(user.location)
        //console.log("https://nominatim.openstreetmap.org/search/" + user.location.replace(/\s/g, '') + "?format=json&limit=1")
        request({
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/27.0.1453.110 Safari/537.36',
                'Content-Type': 'application/json'
            },
            uri: utf8.encode("https://nominatim.openstreetmap.org/search/" + user.location + "?format=json&limit=1"),
            method: 'GET'
        }, function (error, response, body) {
            if (!error && response.statusCode == 200) {
                let geo = JSON.parse(body);
                if (geo.length > 0) {
                    console.log(user.user)
                    console.log(geo[0].lat)
                    console.log(geo[0].lon)
                    user.lat = geo[0].lat
                    user.lon = geo[0].lon
                }
                next(null, user);
            } else {
                console.log("err")
                console.log(error)
                console.log(response)
                console.log(body)
                next(null, user);
            }
        });
    }, function (err, geoProcessed) {
        console.log("end")
        console.log(geoProcessed)
        fs.writeFile(resultsWGeoFolder + fileName.split('.').slice(0, -1).join('.') + "_with_geo" + ".json", JSON.stringify(geoProcessed), function (err) {
            console.log("write to file " + resultsWGeoFolder + fileName.split('.').slice(0, -1).join('.') + "_with_geo" + ".json")
            io.to(token).emit("refreshView", "multiLocationMap");
        });
    })
}

function processUploadFolder(folderToProcess, token) {
    //passsing directoryPath and callback function
    fs.readdir(uploadsFolder + folderToProcess, function (err, files) {
        //handling error
        if (err) {
            return console.log('Unable to scan directory: ' + err);
        }
        var numberOfLines = files.length;
        var number = 0;
        //listing all files using forEach
        files.forEach(function (file) {
            number++;
            io.to(token).emit("friendsProcessPercentage", Math.floor(100 * number / numberOfLines));
            // Do whatever you want to do with the file
            console.log(file);
            var cenas = require(uploadsFolder + folderToProcess + "/" + file);
            cenas.GraphImages.forEach(function (image) {
                if (image.location != null) {
                    //console.log(image.location);
                    data.push({
                        user: image.username,
                        location: image.location.name
                    });
                }
            });
        });
        console.log(data)
        fs.writeFile(resultsFolder + folderToProcess + ".json", JSON.stringify(data), function (err) {
            console.log("write to file " + resultsFolder + folderToProcess + ".json")
            io.to(token).emit("refreshView", "friendsToGeoProcess");
        });
    });
}

//getFriendsPosts("uploads/scrape_teste", "3")

function getFriendsPosts(destination, maximum) {
    let loginCredentials = fs.readFileSync("insta_args.txt");
    let loginCredentialsJson = JSON.parse(loginCredentials);

    io.emit("console", "instagram-scraper started");
    exec("instagram-scraper --login-user " + loginCredentialsJson.user + " --login-pass " + loginCredentialsJson.password + " --followings-input --include-location --media-types none --destination " + destination + " --latest --maximum " + maximum, (error, stdout, stderr) => {
        if (error) {
            console.log(`error: ${error.message}`);
            io.emit("console", error.message);
            return;
        }
        if (stderr) {
            console.log(`stderr: ${stderr}`);
            io.emit("console", stderr);
            return;
        }
        console.log(`stdout: ${stdout}`);
        io.emit("console", stdout);
    });
}

watcher
    .on('add', function (path) {
        console.log('File', path, 'has been added');
        io.emit("console", path);
    })
    .on('error', function (error) {
        console.error('Error happened', error);
    })