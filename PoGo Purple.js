/* TODO List:
 - Add experience gained to the player object
 - Create a level-up callback once it hits the necessary number
 */

// TODO: Add XP function that calls getLevelup when necessary
// TODO: Add a check to see whether the encountered pokemon is not in our pokedex (or one of its evolutions)
//      and use the best ball we have in order to capture it.
// TODO: Make the client able to keep track of pokemon candies to know whether to do an evolution
//      so that it can fill out one's pokedex.
// TODO: Consider having a list of catchable pokemon per location. If the player is out of pokeballs, the pokemon
//      should remain on the list because they were never truly encountered. This could be saved along with their
//      despawn time so that they're never kept longer than they need to be.
//      ** This would also be a good way to save pokemon based on their value so that the most important are caught first
// TODO: Based on whether or not the player has captured a given pokemon, change how well they throw their pokeballs.

const PokemonGO = require('pokemon-go-node-api');
const async = require('async');

var username = '';
var password = '';

var provider = 'google';

// Fill this up with pokedex id's of the pokemon you want to catch!
// If it's empty, it'll grab everything.
var desired_pokemon = [];

// If you want to be more picky, then raise this up.
// We're only keeping pokemon with IV scores of at least that number!
var min_iv = 90;

var locations = [
    {'latitude':34.0074288, 'longitude':-118.4994885},
    {'latitude':34.0100837, 'longitude':-118.4959304}
];

var __author__ = 'Vlek';
var __version__ = '0.0.5';

console.log('PoGo Purple v' + __version__ + " by " + __author__);
// Forgive me for my wrongs, I have just begun
// https://www.youtube.com/watch?v=ZkqyIoYAXV8

var a, player;
var inventory = {
    remove_item: function(item_id){
        for (var i = 0; i < this.items.length; i++){
            if (this.items[i].item_id == item_id){
                this.items[i].count -= 1;
                if (this.items[i].count < 1){
                    this.items.splice(i, 1);
                }
                return true;
            }
        }
        return false;
    },
    add_item: function(item_id, count){
        count = count || 1;
        for (var i = 0; i < this.items.length; i++){
            if (this.items[i].item_id == item_id){
                this.items[i].count += count;
                return true;
            }
        }
        this.items.push({"item_id": item_id, "count": count});
    },
    items: [],
    pokemon: []
};
var pokedex = [];
var maxDistance = 5; //in meters
var current_location = 0;
var totalexp = 0;
var tick = 0;
var num_empty_heartbeats = 0;
var items = {"0": "Unknown", "1": "Pokeball", "2": "Greatball", "3": "Ultraball", "4": "Masterball",
    "101": "Potion", "102": "Super Potion", "103": "Hyper Potion", "104": "Max Potion", "201": "Revive",
    "202": "Max Revive", "301": "Lucky Egg", "401": "Incense", "402": "Spicy Incense", "403": "Cool Incense",
    "404": "Floral Incense", "501": "Troy Disk", "602": "X Attack", "603": "X Defense", "604": "X Miracle",
    "701": "Razz Berry", "702": "Bluk Berry", "703": "Nanab Berry", "704": "Wepar Berry", "705": "Pinap Berry",
    "801": "Special Camera", "901": "Incubator (Unlimited)", "902": "Incubator", "1001": "Pokemon Storage Upgrade",
    "1002": "Item Storage Upgrade"};

var queue = async.priorityQueue(
    // TODO: Add a check to the queue that checks the starting timestamp to see whether to re-up the authkey.
    function(task, next){
        if (task.PokedexTypeId){
            // If we got passed a wild pokemon,
            capturePokemon(task, next);
        } else if (task.FortId) {
            // Otherwise, if it's a Pokestop,
            SpinFort(task, next);
        } else if (task.pokeball) {
            // If it has a pokeball, then it's a pokemon to be released
            log('Releasing a ' + task.cp + ' '.repeat(5 - task.cp.toString().length) + 'cp ' + a.pokemonlist[parseInt(task.pokemon_id) - 1].name, 'Release');
            a.ReleasePokemon(task.id, function(err) {
                if (err) log(err, 'Release');
                setTimeout(next, 1000);
            });
        } else if (task.item_id){
            log('Recycling ' + task.count + ' ' + items[task.item_id], 'Recycle');
            a.DropItem(task.item_id, task.count, function(err){
                if (err) log(err, 'Recycle');
                setTimeout(next, 1000)
            });
        } else if (task.getinventory){
            getInventory(next);
        } else if (task.heartbeat){
            // If heartbeat==true, you know what to do!
            do_heartbeat(next);
        }
    }, 1
);

queue.drain = function(){
    log('Drained queue', 'Queue');
    if (locations[current_location].pokestops && locations[current_location].pokestops.length == 0){
        log("We're going to chill here until we get mapcell data", 'Queue')
    } else {
        rotateLocation();
    }
};

function pad(str, num){
    // pads an object num times with '0'
    if (typeof(str) != 'string') str = str + "";
    return '0'.repeat(num > str.length ? num - str.length : 0) + str;
}

function getTimestamp(){
    var timestamp = new Date();
    return '[' + pad(timestamp.getHours(),2) + ':' + pad(timestamp.getMinutes(),2) + ':' + pad(timestamp.getSeconds(),2) + ']';
}

function log(message, message_type){
    console.log(getTimestamp() + (message_type ? " [" + message_type + "] " : ' ') + message);
}

function randint(x, y){
    // Produces a number between x and y
    return Math.floor(Math.random() * y + x);
}

function deg2rad(deg) {
    return deg * (Math.PI / 180)
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    var R = 6371; // Radius of the earth in km
    var dLat = deg2rad(lat2 - lat1);  // deg2rad below
    var dLon = deg2rad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    var d = R * c; // Distance in km
    return (d * 1000).toFixed(2); //convert to meters
}

function calc_iv(attack, defense, stamina){
    attack = attack || 0;
    defense = defense || 0;
    stamina = stamina || 0;
    var iv = ((parseInt(defense) + parseInt(attack) + parseInt(stamina)) / 45 * 100).toFixed(1);
    if (isNaN(iv)){
        log('Got NaN bug on scores: ' + attack + ', ' + defense + ", and " + stamina)
    }
    return iv;
}
function do_heartbeat(callback){
    a.Heartbeat(function (err, hb) {
        callback = callback || function(){};
        if (err) {
            log('Error during heartbeat', "!");
            console.log(err);
        }
        if (!hb) {
            log('Error: Received Empty Heartbeat', '!');
            num_empty_heartbeats += 1;
            if ( num_empty_heartbeats > 2 ){
                // TODO: Use Segura's script for key re-auth to fix this to actually work.
                log('Error: Received too many empty heartbeat requests. Stopping. :(', '!');
                setTimeout(start_bot, 15000);
                return callback();
            }
            //setTimeout(do_heartbeat, randint(10000,14000));
            setTimeout(function(){
                queue.push({heartbeat: true}, 1, function(err){
                    if (err){
                        log('Error swiping Pokestop: ' + err, "!");
                    }
                });
            }, randint(10000,14000));
            return callback();
        } else {
            num_empty_heartbeats = 0;
        }

        tick += 1;
        if (tick >= 6){
            var secs = parseInt((new Date().getTime() - a.timestamp) / 1000);
            var new_total = parseInt(player.experience) + totalexp;
            var xp_hr = parseInt((totalexp*3600)/secs);
            log("Total XP: " + new_total + ', For run: ' + totalexp + ', ' +
                xp_hr + ' XP/hr', '♥');
            tick = 0;
        } else {
            log('Performing heartbeat', '♥');
        }

        var check_for_stops = true;
        if (locations[current_location].pokestops && locations[current_location].pokestops.length > 0){
            check_for_stops = false;
        } else {
            locations[current_location].pokestops = [];
        }
        // TODO: Save gym information in another cubbyhole for sending information to the webclient
        for (var i = hb.cells.length - 1; i >= 0; i--) {
            if (check_for_stops){
                for (var z = 0; z < hb.cells[i].Fort.length; z++) {
                    if (hb.cells[i].Fort[z].FortType == 1 && hb.cells[i].Fort[z].Enabled){
                        locations[current_location].pokestops.push(hb.cells[i].Fort[z]);
                        queue.push(hb.cells[i].Fort[z], 9, function(err){
                            if (err){
                                log('Error swiping Pokestop: ' + err, "!");
                            }
                        });
                    }
                }
            }
            for (var z = 0; z < hb.cells[i].MapPokemon.length; z++) {
                // Figure out whether you want the pokemon before you add it to the queue.
                var wanted = false;
                if (desired_pokemon.length == 0){
                    wanted = true;
                } else if (hb.cells[i].MapPokemon[z].PokedexId in desired_pokemon){
                    wanted = true;
                }
                if (wanted){
                    queue.push(hb.cells[i].MapPokemon[z], 2, function(err){
                        if (err){
                            log('Error capturing pokemon: ' + err, "!");
                        }
                    });
                }
            }
        }
        setTimeout(function(){
            queue.push({heartbeat: true}, 1, function(err){
                if (err){
                    log('Error getting heartbeat: ' + err, "!");
                }
            });
        }, randint(10000,14000));
        callback();
    });
}

function capturePokemon(currentPokemon, callback){
    // TODO: Figure out whether or not the pokestop swiping is causing the client to be
    // out of range of the pokemon when it comes back to capture them since we're not re-centering
    // ** May have to rethink how we're doing pokestops and only grab those that are close enough
    // Which is fine, considering that means there would be more points and thus more opportunities
    // to grab pokemon.
    // Regardless of whether or not we try to catch it, we still want to know what we saw.
    var pokedexInfo = a.pokemonlist[parseInt(currentPokemon.PokedexTypeId)-1];
    log('there is a ' + pokedexInfo.name + ' near!! I can try to catch it!', 'Pokemon');
    // First, we have to see whether our inventory is already full of pokemon,
    if (inventory.pokemon.length >= a.profile.poke_storage){
        log('Error: we have reached max pokemon capacity', '!');
        return callback();
    }
    a.EncounterPokemon(currentPokemon, function(suc, dat){
        log('Encountering pokemon ' + pokedexInfo.name, 'Pokemon');
        if(dat){
            // TODO: Figure out whether I can get some difficulty data outta dat
            /*
             for (var each in dat.EncounterCaptureProbability){
             log('Pokeball: ' + dat.EncounterCaptureProbability[each].PokeballType +
             ', Capture probability: ' + dat.EncounterCaptureProbability[each].CaptureProbability, 'Encounter');
             }
             */
            var status = {
                "0": "ENCOUNTER_ERROR", "1": "ENCOUNTER_SUCCESS", "2": "ENCOUNTER_NOT_FOUND",
                "3": "ENCOUNTER_CLOSED", "4": "ENCOUNTER_POKEMON_FLED", "5": "ENCOUNTER_NOT_IN_RANGE",
                "6": "ENCOUNTER_ALREADY_HAPPENED", "7": "POKEMON_INVENTORY_FULL"
            };
            if (dat.EncounterStatus == 1){
                return setTimeout(function() {
                    CaptureLoop(currentPokemon, callback);
                }, 1000);
            } else {
                log(status[dat.EncounterStatus], '!');
            }
            return setTimeout(callback, 1000);
        }
    })
}

function CaptureLoop(currentPokemon, callback) {
    // TODO: Check the pokemon, if it's one that we don't have (Or from a family with one we don't have, use the best ball possible.
    /*
     var use_best_pokeballs = false;
     for (var entry in pokedex){
     // TODO: Check to make sure that these are actually the same
     if (entry.pokedex_entry_number == currentPokemon.pokemon_id){
     log("We've caught this kind of pokemon " + currentPokemon.times_captured + ' times.', 'CaptureLoop');
     }
     }
     */
    // First, lets check what pokeball to use!
    var chosen_pokeball_type = 0;
    for (var e = 1; e < 4; e++){
        if (inventory.remove_item(e)){
            chosen_pokeball_type = e;
            break;
        }
    }
    if (chosen_pokeball_type == 0){
        log('Error: Out of Pokeballs.', '!');
        return callback();
    }
    a.CatchPokemon(currentPokemon, 1.0, 1.95 + Math.random() * 0.05, 0.85 + Math.random() * 0.15, chosen_pokeball_type, function (xsuc, xdat) {
        if (!xdat){
            log("Error Catching Pokemon: Empty Server Response", "!");
            return callback();
        }
        if (xdat.Status){
            if (xdat.Status == 1) {
                totalexp += 100;
                inventory.pokemon.push({});
                log('Successful Catch! Gained: 100xp! Total xp for run: ' + totalexp, 'XP');
            } else if (xdat.Status == 2 || xdat.Status == 4) {
                log('Capture failed, retrying!', '!');
                return setTimeout(function(){ CaptureLoop(currentPokemon, callback) }, 1000);
            } else if (xdat.Status == 3) {
                log('Capture failed, pokemon fled', '!');
            } else {
                log('Error: Received error code response', '!');
            }
        } else{
            log('Error: Most likely due to not having pokeballs or having too many pokemon', '!');
        }
        //log('Sleeping one second', 'i');
        setTimeout(callback, 1000);
    });
}

function SpinFort(fort, callback) {
    var newLocation = {
        'type': 'coords',
        'coords': {
            'latitude': fort.Latitude,
            'longitude': fort.Longitude
        }
    };

    a.SetLocation(newLocation, function (err, coords) {
        a.GetFort(fort.FortId, fort.Latitude, fort.Longitude, function (err, res) {
            if (err) {
                // TODO: Make this re-login like sagundo's key re-up
                log(err, "SpinFort");
            }
            if (res) {
                log("Spinning: " + fort.FortId + ", Distance: " +
                    calculateDistance(locations[0]['latitude'], locations[0]['longitude'],
                        fort.Latitude, fort.Longitude) + " meters.", "Pokestop");
                if (res.result == 1) {
                    var rewards = {};
                    for (var y in res.items_awarded) {
                        var item_id = res.items_awarded[y].item_id;
                        if (item_id in rewards){
                            rewards[item_id] += 1;
                        } else{
                            rewards[item_id] = 1;
                        }
                    }
                    for (var each in rewards){
                        inventory.add_item(each, rewards[each]);
                        log("Reward: " + items[each] + " " + rewards[each], "Pokestop");
                    }
                    var exp_earned = 0;
                    if (res.experience_awarded != null){
                        exp_earned = parseInt(res.experience_awarded)
                    } else {
                        exp_earned = 50;
                    }
                    totalexp += exp_earned;
                    log("Gained: " + exp_earned + "xp! Total xp for run: " + totalexp, "XP");

                } else if (res.result == 2) {
                    log('Failure: Pokestop out of range', 'Pokestop');
                } else if (res.result == 3) {
                    log('Failure: Pokestop in cooldown period', 'Pokestop');
                } else if (res.result == 4) {
                    if (res.experience_awarded != null) {
                        totalexp = totalexp + parseInt(res.experience_awarded);
                        log("Inventory full, Gained: " + res.experience_awarded.toString() + "xp! Total xp for run: " + totalexp, "XP");
                    }
                    // Still need to set this to check inventory for potions and shit to drop instead of 'balls.
                    /*
                     a.DropItem(1, 10, function (err, resp) {
                     if (err){
                     console.log(err);
                     }
                     if (resp.result === 1) {
                     console.log("[i] success dropped 10 unused pokeball.");
                     }
                     });
                     */
                } else {
                    log('Failure: undefined result', 'Pokestop');
                }
            }
            //log('Sleeping six seconds', 'i');
            setTimeout(callback, 6000);
        });
    });
}

function rotateLocation() {
    current_location = current_location + 1;

    if(current_location == locations.length) {
        current_location = 0;
    }

    var nextLocation = {
        'type': 'coords',
        'coords': {
            latitude: locations[current_location].latitude,
            longitude: locations[current_location].longitude
        }
    };

    a.SetLocation(nextLocation, function (err, coords) {
        log("Teleporting to next location: " + a.playerInfo.locationName, "i");
        for (var stop in locations[current_location].pokestops){
            queue.push(locations[current_location].pokestops[stop], 9, function(err){
                if (err){
                    log('Error swiping Pokestop: ' + err, "!");
                }
            });
        }
        queue.push({"getinventory": true}, 2, function(err){
            if (err){
                log('Error getting inventory: ' + err, "!");
            }
        });
    });
}

function getInventory(callback){
    callback = callback || function(){};
    a.GetInventory(function(err, inv){
        if(err) log('Error getting inventory: '+err, "GetInventory");
        if(!inv.success) log('Received unsuccessful inventory get code', 'GetInventory');
        log('Getting inventory', 'Inventory');
        inventory.items = [];
        inventory.pokemon = [];
        pokedex = [];

        var inv_list = inv.inventory_delta.inventory_items;
        for (var item_num = 0; item_num < inv_list.length; item_num++){
            // If it's a pokemon,
            if (inv_list[item_num].inventory_item_data.pokemon){
                var p = inv_list[item_num].inventory_item_data.pokemon;
                // If the pokemon isn't in an egg, we gotta check its IV to see if we need to dump it:
                if (!p.is_egg){
                    // If it's the case that the pokemon's iv is less than our min_iv var AND they're not favorited,
                    var p_iv = calc_iv(p.individual_attack, p.individual_defense, p.individual_stamina);
                    if (p_iv < min_iv && !p.favorite){
                        queue.push(p, 4, function(err){
                            if (err){
                                log('Error swiping Pokestop: ' + err, "!");
                            }
                        });
                        // TODO: Add all pokemon to the list, and, once they've been properly removed, then consider them gone.
                        continue;
                    }
                    //log('Your ' + p.cp +'cp ' + a.pokemonlist[parseInt(p.pokemon_id)-1].name + ' has an IV of: ' + p_iv, 'IV');
                }
                inventory.pokemon.push(p);
                // Item
            } else if (inv_list[item_num].inventory_item_data.item){
                // TODO: Make it so that these items are still added to one's inventory and are only really removed
                // once the recycle has passed through the queue
                var item = inv_list[item_num].inventory_item_data.item;
                var undesireable_items = {"101": "Potion", "102": "Super Potion", "103": "Hyper Potion", "104": "Max Potion",
                    "201": "Revive", "202": "Max Revive", "701": "Razz Berry"};
                if (item.item_id in undesireable_items && item.count != null){
                    queue.push(item, 5, function(err){
                        if (err){
                            log('Error recycling item: ' + err, "!");
                        }
                    });
                } else {
                    inventory.items.push(inv_list[item_num].inventory_item_data.item);
                }
                // Pokedex Entry
            } else if (inv_list[item_num].inventory_item_data.pokedex_entry){
                pokedex.push(inv_list[item_num].inventory_item_data.pokedex_entry);
                // Player Stats
            } else if (inv_list[item_num].inventory_item_data.player_stats){
                player = inv_list[item_num].inventory_item_data.player_stats;
            }
        }
        setTimeout(callback, 1000);
    });
}

function start_bot() {
    a = new PokemonGO.Pokeio();

    var location = {
        type: 'coords',
        coords: {
            'latitude':locations[0]['latitude'],
            'longitude':locations[0]['longitude']
        }
    };

    a.timestamp = new Date().getTime();

    a.init(username, password, location, provider, function (err){
        if (err) throw err;

        log('Current location: ' + a.playerInfo.locationName, 'i');
        log('lat/long/alt: : ' + a.playerInfo.latitude + ' ' + a.playerInfo.longitude + ' ' + a.playerInfo.altitude, 'i');

        setTimeout(function(){
            a.GetProfile(function(err, profile){
                if (err) throw err;

                a.profile = profile;
                log('Username: ' + profile.username, 'i');
                log('Poke Storage: ' + profile.poke_storage, 'i');
                log('Item Storage: ' + profile.item_storage, 'i');
                log('Pokecoin: ' + (profile.currency[0].amount ? profile.currency[0].amount : 0), 'i');
                log('Stardust: ' + profile.currency[1].amount, 'i');

                setTimeout(function(){
                    getInventory(function(){
                        setTimeout(do_heartbeat, 1000);
                    });
                }, 1000);
            });
        }, 1000);
    });
}

start_bot();
