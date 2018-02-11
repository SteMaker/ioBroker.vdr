"use strict";

var utils = require(__dirname + '/lib/utils'); // Get common adapter utils

var adapter = utils.adapter('vdr');
var http = require('http')

// is called when adapter shuts down - callback has to be called under any circumstances!
adapter.on('unload', function (callback) {
    try {
        adapter.log.info('cleaned everything up...');
        callback();
    } catch (e) {
        callback();
    }
});

// is called if a subscribed object changes
adapter.on('objectChange', function (id, obj) {
    // Warning, obj can be null if it was deleted
    adapter.log.debug('objectChange ' + id + ' ' + JSON.stringify(obj));
});

// is called if a subscribed state changes
adapter.on('stateChange', function (id, state) {
    adapter.log.debug('stateChange ' + id + ' ' + JSON.stringify(state));

    // you can use the ack flag to detect if it is status (true) or command (false)
    if (state && !state.ack) {
        var as = id.split('.');
        if (as[0] + '.' + as[1] !== adapter.namespace) return;
        switch (as[2]) {
            case 'KeyPress':
                adapter.log.debug("Keypress: "+state.val);
                adapter.setState('KeyPress', {val:state.val,ack:true});
                sendKeyPress(state.val);
                break;
            case 'ChannelSelect':
                adapter.log.debug("ChannelSelect: "+state.val);
                adapter.setState('ChannelSelect', {val:state.val,ack:true});
                selectChannel(state.val);
                break;
        }
    }
});

// Some message was sent to adapter instance over message box. Used by email, pushover, text2speech, ...
adapter.on('message', function (obj) {
    if (typeof obj == 'object' && obj.message) {
        if (obj.command == 'send') {
            // e.g. send email or pushover or whatever
            console.log('send command');

            // Send response in callback if required
            if (obj.callback) adapter.sendTo(obj.from, obj.command, 'Message received', obj.callback);
        }
    }
});

// is called when databases are connected and adapter received configuration.
// start here!
adapter.on('ready', function () {
    main();
});

function getFromVdrRestfulApi(service, handler) {
    var url = "http://"+adapter.config.ip+":"+adapter.config.port+"/"+service;
    adapter.log.info(url);
    http.get(url, (res) => {
        const statusCode = res.statusCode;
        const contentType = res.headers['content-type'];

        let error;
        if (statusCode !== 200) {
            error = new Error('Request Failed.\n' +
                    "Status Code: "+statusCode);
        } else if (!/^application\/json/.test(contentType)) {
            error = new Error('Invalid content-type.\n' +
                    "Expected application/json but received ${contentType}");
        }
        if (error) {
            adapter.log.error(error.message);
            // consume response data to free up memory
            res.resume();
            return;
        }

        res.setEncoding('utf8');
        let rawData = '';
        res.on('data', (chunk) => { rawData += chunk; });
        return res.on('end', () => {
            handler(rawData);
        });
    }).on('error', (e) => {
        adapter.log.error("Got error: ${e.message}");
    });
}

function postWithoutBodyToVdrRestfulApi(service, command) {
    var options = {
        hostname: adapter.config.ip,
        port: adapter.config.port,
        path: "/"+service+"/"+command,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': 0
        }
    };
    adapter.log.debug("Post request to: "+options.hostname+":"+options.port+options.path);
    const req = http.request(options, (res) => {
        adapter.log.debug(`STATUS: ${res.statusCode}`);
        adapter.log.debug(`HEADERS: ${JSON.stringify(res.headers)}`);
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
            adapter.log.debug(`BODY: ${chunk}`);
        });
        res.on('end', () => {
            adapter.log.debug('No more data in response.');
        });
    });

    req.on('error', (e) => {
        adapter.log.info('problem with request: ${e.message}');
    });

    req.end();
}

function getChannels(consumerFct) {
    adapter.log.info("Retrieving list of channels");
    getFromVdrRestfulApi("channels.json", function (rawData) {
        try {
            var parsedData = JSON.parse(rawData);
            consumerFct(parsedData.channels);
        } catch (e) {
            adapter.log.error(e.message);
        }
    });
}

function getRecordings(consumerFct) {
    adapter.log.info("Retrieving list of recordings");
    getFromVdrRestfulApi("recordings.json", function (rawData) {
        try {
            var parsedData = JSON.parse(rawData);
            consumerFct(parsedData.recordings);
        } catch (e) {
            adapter.log.error(e.message);
        }
    });
}

function getInfo(consumerFct) {
    getFromVdrRestfulApi("info.json", function (rawData) {
        try {
            var parsedData = JSON.parse(rawData);
            consumerFct(parsedData);
        } catch (e) {
            adapter.log.error(e.message);
        }
    });
}

function sendKeyPress(key) {
    adapter.log.info("Sending key "+key);
    postWithoutBodyToVdrRestfulApi("remote" , key);
}

function selectChannel(key) {
    adapter.log.info("Selecting channel "+key);
    postWithoutBodyToVdrRestfulApi("remote/switch" , key);
}

// This function is only for debug purposes
function channelListPrinter(channels) {
    for(var i in channels) {
        adapter.log.info("Channel name: "+channels[i].name);
    }
}

function channelListProvider(channels) {
    adapter.log.debug("Filling channel information, length: "+channels.length);
    var chJson = []
    for(var i=0; i < channels.length; i++) {
        var entry = {
            nr: channels[i].number,
            name: channels[i].name,
            chid: channels[i].channel_id
        };
        chJson.push(entry);
    }
    adapter.setState('ChannelList', {val: JSON.stringify(chJson), ack: true});
}

// This function is only for debug purposes
function recordingsListPrinter(recordings) {
    for(var i in recordings) {
        adapter.log.info("Recording name: "+recordings[i].name);
    }
}

function recordingsListProvider(recordings) {
    adapter.log.debug("Filling recordings information, length: "+recordings.length);
    var recJson = []
    for(var i=0; i < recordings.length; i++) {
        var entry = {
            nr: recordings[i].number,
            name: recordings[i].name,
            filename: recordings[i].filename
        };
        recJson.push(entry);
    }
    adapter.setState('RecordingsList', {val: JSON.stringify(recJson), ack: true});
}

function main()
{
    adapter.log.info("Starting VDR Adapter, IP: "+adapter.config.ip+":"+adapter.config.port);

    // Input from VDR
    adapter.setObject('ChannelList', {
        type: 'state',
        common: {
            name: 'ChannelList',
            type: 'string',
            role: 'json'
        },
        native: {}
    });

    adapter.setObject('RecordingsList', {
        type: 'state',
        common: {
            name: 'RecordingsList',
            type: 'string',
            role: 'json'
        },
        native: {}
    });

    // Commands to VDR
    adapter.setObject('ChannelSelect', {
        type: 'state',
        common: {
            name: 'ChannelSelect',
            type: 'string',
            role: 'text'
        },
        native: {}
    });

    adapter.setObject('KeyPress', {
        type: 'state',
        common: {
            name: 'KeyPress',
            type: 'string',
            role: 'text'
        },
        native: {}
    });

    // in this template all states changes inside the adapters namespace are subscribed
    adapter.subscribeStates('*');
    getChannels(channelListProvider);
    getRecordings(recordingsListProvider);
}
