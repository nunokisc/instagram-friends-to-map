const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const app = express();
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

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname + '/index.html'));
});

app.get('/getRequestMap', function (req, res) {
    let requestedMap = fs.readFileSync(resultsWGeoFolder + req.query.requestMap);
    let mapPoints = JSON.parse(requestedMap);
    res.json(mapPoints)
})

app.get('/getFilesGeoProcessed', function (req, res) {
    let files = []
    fs.readdirSync(resultsWGeoFolder).forEach(file => {
        files.push(file);
    });
    res.json(files)
})

http.listen(port, () => console.log(`listening on *: ${port}!`))

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


function processLocation(data, resultToProcess) {
    async.mapSeries(data, function (user, next) {
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
        fs.writeFile(resultsWGeoFolder + resultToProcess + "_with_geo" + ".json", JSON.stringify(geoProcessed), function (err) {
            console.log("write to file " + resultsWGeoFolder + resultToProcess + "_with_geo" + ".json")
        });
    })
}

function getUploadsFolder(callback) {
    fs.readdir(uploadsFolder, function (err, folders) {
        //handling error
        if (err) {
            return console.log('Unable to scan directory: ' + err);
        }
        uploads = folders;
        callback()
    });

}


function processUploadFolder(folderToProcess,callback) {
    //passsing directoryPath and callback function
    fs.readdir(uploadsFolder + folderToProcess, function (err, files) {
        //handling error
        if (err) {
            return console.log('Unable to scan directory: ' + err);
        }
        //listing all files using forEach
        files.forEach(function (file) {
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
            callback()
        });
    });
}