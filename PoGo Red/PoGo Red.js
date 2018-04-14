const async = require('async');
const PokemonGO = require('pokemon-go-node-api');
const express = require('express');
var webclient = express();
var expressWs = require('express-ws')(webclient);
var favicon = require('serve-favicon');

var __author__ = 'Vlek';
var __version__ = '0.0.1';
var __webclient_port__ = 8080;

console.log('PoGo Red v' + __version__ + " by " + __author__);

function randint(x, y){
    // Produces a number between x and y
    return Math.floor(Math.random() * y + x);
}

function skatter(num){
    // Returns the given number with fuzzing in the range of +- 0.006135
    return parseFloat((num + randint(1, 6135) * 0.000001 * (randint(1,2) == 1 ? -1 : 1)).toFixed(6));
}

function randpokemon(){
    return {pokemon_id: randint(1,151),
            latitude: skatter(34.009491),
            longitude: skatter(-118.496647),
            TimeTillHiddenMs: 1000}
}

function randpokestop(){
    return {latitude: skatter(34.009491),
        longitude: skatter(-118.496647),
        islured: randint(1,2) == 1}
}

function randgym(){
    return {latitude: skatter(34.009491),
        longitude: skatter(-118.496647)}
}

// First, we gotta get all of the accounts out of our handy-dandy config.json into our clients list,
var config = require('./config.json');
var clients = [];

for (var i=0; i < config.accounts.length; i++){
    // Get everything necessary in order to do a login, then process the rest within appropriate callbacks
    console.log('Adding account: ' + config.accounts[i].username);
    var client = {};
    client.api = new PokemonGO.Pokeio();
    client.account = config.accounts[i];
    client.path = config.accounts[i].locations;
    client.location = client.path[0];

    client.inventory = {};
    clients.push(client);
}

// Start the webclient
webclient.use(express.static(__dirname + "/webclient"));
webclient.use(express.static(__dirname + "/resources"));
webclient.use(favicon(__dirname + '/favicon.ico'));

function webclient_send(msg, msgtype){
    obj = {};
    obj[msgtype] = msg;
    ws.send(JSON.stringify(obj, null, ''));
}

webclient.ws('/ws', function(ws, req) {
    ws.on('open', function open() {
        setTimeout(function(){
            console.log('Sending new location information');
            ws.send(JSON.stringify({'location':{'lat':34.0074288, 'long':-118.4994885}}, null, ''));
            }, 5000);
    });
    ws.on('close', function() {
        console.log('Connection closed');
    });
    ws.on('message', function(msg) {
        // console.log(msg);
        var json = JSON.parse(msg);
        if (json.sync){
            ws.send(JSON.stringify({'location':{'lat':34.0100837, 'long':-118.4959304}}, null, ''));
            var new_poke_list = [];
            for (var i = 0; i < 100; i++){
                new_poke_list.push(randpokemon());
            }
            var new_pokestops = [];
            for (var i = 0; i < 20; i++){
                new_pokestops.push(randpokestop());
            }
            var new_gyms = [];
            for (var i = 0; i < 5; i++){
                new_gyms.push(randgym());
            }
            ws.send(JSON.stringify({'map':{'pokemon':new_poke_list, 'pokestops':new_pokestops, 'gyms': new_gyms}}, null, ''));
        }
    });
    console.log('Connection opened');
});

webclient.listen(__webclient_port__, function (){
    console.log('Starting webclient on port ' + __webclient_port__ + '!');
});

// TODO: Push a new pokemon to the webclient with type and lat/long coordinates
// TODO: Push the pokestop map to the webclient
//      Make it such that, once a pokestop has been swiped, it turns purple in the webclient
// TODO: Push events to the webclient's console such as captures, swipes, etc.
