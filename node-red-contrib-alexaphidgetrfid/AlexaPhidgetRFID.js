module.exports = function(RED) {
	"use strict";
    var bodyParser = require("body-parser");
    var cookieParser = require("cookie-parser");
    var getBody = require('raw-body');
    var cors = require('cors');
    var jsonParser = bodyParser.json();
    var urlencParser = bodyParser.urlencoded({extended:true});
    var onHeaders = require('on-headers');
    var typer = require('media-typer');
    var isUtf8 = require('is-utf8');

    function rawBodyParser(req, res, next) {
        if (req.skipRawBodyParser) { next(); } // don't parse this if told to skip
        if (req._body) { return next(); }
        req.body = "";
        req._body = true;

        var isText = true;
        var checkUTF = false;

        if (req.headers['content-type']) {
            var parsedType = typer.parse(req.headers['content-type'])
            if (parsedType.type === "text") {
                isText = true;
            } else if (parsedType.subtype === "xml" || parsedType.suffix === "xml") {
                isText = true;
            } else if (parsedType.type !== "application") {
                isText = false;
            } else if (parsedType.subtype !== "octet-stream") {
                checkUTF = true;
            } else {
                // applicatino/octet-stream
                isText = false;
            }
        }

        getBody(req, {
            length: req.headers['content-length'],
            encoding: isText ? "utf8" : null
        }, function (err, buf) {
            if (err) { return next(err); }
            if (!isText && checkUTF && isUtf8(buf)) {
                buf = buf.toString()
            }
            req.body = buf;
            next();
        });
    }

    var corsSetup = false;

    function createResponseWrapper(node,res) {
        var wrapper = {
            _res: res
        };
        var toWrap = [
            "append",
            "attachment",
            "cookie",
            "clearCookie",
            "download",
            "end",
            "format",
            "get",
            "json",
            "jsonp",
            "links",
            "location",
            "redirect",
            "render",
            "send",
            "sendfile",
            "sendFile",
            "sendStatus",
            "set",
            "status",
            "type",
            "vary"
        ];
        toWrap.forEach(function(f) {
            wrapper[f] = function() {
                node.warn(RED._("httpin.errors.deprecated-call",{method:"msg.res."+f}));
                var result = res[f].apply(res,arguments);
                if (result === res) {
                    return wrapper;
                } else {
                    return result;
                }
            }
        });
        return wrapper;
    }

    var corsHandler = function(req,res,next) { next(); }

    if (RED.settings.httpNodeCors) {
        corsHandler = cors(RED.settings.httpNodeCors);
        RED.httpNode.options("*",corsHandler);
    }
	//var pRFID;
	
    function AlexaPhidgetRFIDNode(config) {
		var phidgets = require('phidgets');			
		
        RED.nodes.createNode(this,config);
        var node = this;
		this.interval = null;
		this.status({fill:"red",shape:"dot",text:"not started"});
		//pRFID = null;
		//var pRFID = this.pRFID;
		this.pRFID = new phidgets.PhidgetRFID();
		var pRFID = this.pRFID;
		
		//alexa Details
		this.url = config.url;
		var url = this.url;
		var method = "post"; //forcing method to be post --may alter in future

		var msg = {};
		var row = {};
		
		this.errorHandler = function(err,req,res,next) {
                node.warn(err);
                res.sendStatus(500);
            };
		
		//this is what deals with msg
		this.callback = function(req,res) {
                var msgid = RED.util.generateId();
                res._msgid = msgid;
				//this is the node to node message
                node.send({_msgid:msgid,req:req,res:createResponseWrapper(node,res),payload:req.body});
				//added this for internal message to return to alexa
				msg = {_msgid:msgid,req:req,res:createResponseWrapper(node,res),payload:req.body};
				console.log({_msgid:msgid,res:createResponseWrapper(node,res)});
				
				var alexaMethod = req.body.request.intent.slots.Text.value;
				var alexaNumber = req.body.request.intent.slots.Number.value;
				var alexaLEDStatus = req.body.request.intent.slots.Status.value;
				var alexaType = req.body.request.intent.slots.Type.value;
				
				var alexaMethodCheck = "set";

				if(alexaMethod.includes(alexaMethodCheck)) {
					//console.log("Contains SET");
					alexaSetLED(alexaLEDStatus, alexaNumber);
					returnToAlexa(msg,"SET", alexaNumber);
				}
				else {
					//console.log("Doesn't contain SET");
					var statusType;
					if(alexaType.includes("light")) {
						//statusOfLED could be array or boolean.
						statusType = alexaGetLED(alexaNumber);						
					}
					else if(alexaType.includes("tag")){						
						statusType = alexaGetTag();
					}
					else {
						//do nothing
					}
					returnToAlexa(msg,"GET", statusType);
					
				}
		};
		//For POST requests, the body is available under <code>msg.req.body</code>. This uses the <a href="http://expressjs.com/api.html#bodyParser">Express bodyParser middleware</a> to parse the content to a JSON object.
		var httpMiddleware = function(req,res,next) { next(); }

        if (RED.settings.httpNodeMiddleware) {
            if (typeof RED.settings.httpNodeMiddleware === "function") {
                httpMiddleware = RED.settings.httpNodeMiddleware;
            }
        }		
		
		var metricsHandler = function(req,res,next) { next(); }
        if (this.metric()) {
            metricsHandler = function(req, res, next) {
                var startAt = process.hrtime();
                onHeaders(res, function() {
                    if (res._msgid) {
                        var diff = process.hrtime(startAt);
                        var ms = diff[0] * 1e3 + diff[1] * 1e-6;
                        var metricResponseTime = ms.toFixed(3);
                        var metricContentLength = res._headers["content-length"];
                        //assuming that _id has been set for res._metrics in HttpOut node!
                        node.metric("response.time.millis", {_msgid:res._msgid} , metricResponseTime);
                        node.metric("response.content-length.bytes", {_msgid:res._msgid} , metricContentLength);
                    }
                });
                next();
            };
        }
		
		//run as this is using post method.
		RED.httpNode.post(this.url,cookieParser(),httpMiddleware,corsHandler,metricsHandler,jsonParser,urlencParser,rawBodyParser,this.callback,this.errorHandler);
		
		this.on("close",function() {
            var node = this;
            RED.httpNode._router.stack.forEach(function(route,i,routes) {
                if (route.route && route.route.path === node.url && route.route.methods[node.method]) {
                    routes.splice(i,1);
                }
            });
        });
		
		//connection Details
		this.hostAddress=config.hostAddress;
		var hostAddress = this.hostAddress;
		this.portNumber=parseInt(config.portNumber);
		var portNumber = this.portNumber;
		
		var payload = [];
		var payloadOutput = [];
		var msg1 = {topic:"Phidget RFID", payload:payload};
		var msg2 = {topic:"Phidget RFID", payload:payloadOutput};
		
		//Interval Period from Config Selection
		var repeat=config.repeat;
        var intervalCount=config.repeat_interval_count;
		var intervalPeriod=config.repeat_interval_period;
		
		function alexaSetLED(alexaLEDStatus, alexaNumber) {			
			var LEDStatus = false;
			var alexaNumberString = "";
			
			if(alexaNumber) {
				alexaNumberString = alexaNumber.toString;
			}
			
			if(alexaLEDStatus == "on" || alexaLEDStatus == "true") {
				LEDStatus = true;
				if(alexaNumberString == "?" || alexaNumberString == "") {					
					pRFID.setOutput([0,1], LEDStatus);
				}
				else if(alexaNumber >=0 && alexaNumber <= 1) {					
					pRFID.setOutput(alexaNumber, LEDStatus);
				}
				else {
					//do nothing
				}
			}
			else if(alexaLEDStatus == "off" || alexaLEDStatus == "false") {
				if(alexaNumber == "?" || alexaNumberString == "") {
					pRFID.setOutput ([0,1], LEDStatus);
				}
				else if(alexaNumber >=0 && alexaNumber <= 1) {					
					pRFID.setOutput(alexaNumber, LEDStatus);
				}
				else {
					//do nothing
				}
			}
			else {
				//do nothing
			}
		}
		
		function alexaGetLED(alexaNumber) {
			var alexaNumberString = "";
			
			if(alexaNumber) {				
				alexaNumberString = alexaNumber.toString;
			}			
			
			if(alexaNumberString == "?" || alexaNumberString == "") {				
				try{
					if (pRFID.outputs.count) {						
						var outputLEDArray = [];
						for(var i = 0; i < pRFID.outputs.count; i++) {
							outputLEDArray.push(pRFID.outputs[i].value);
						}						
						return outputLEDArray;
					}
				}
				catch(error) {
					//node.warn("No Output Devices Detected: " + i);
				}
			}
			else if(alexaNumber >= 0 && alexaNumber <=1){				
				return pRFID.outputs[alexaNumber].value;
			}
			else{
				//do nothing
			}
		}
		
		function alexaGetTag() {			
			//Will need to get tag name and last recorded date/time.
			var tagDetails = [];
			tagDetails.push(pRFID.tag.value);
			tagDetails.push(pRFID.tag.detectedAt);
			return tagDetails;
		}
		
		function returnToAlexaSpeech(msg,method,value) {			
			var returnValue = 0;
			var returnSpeech = "";
			
			var intentNumberString = "";

			if (msg.payload.request.intent.slots.Number.value) {				
				intentNumberString = msg.payload.request.intent.slots.Number.value.toString();				
			}
			
			returnValue = msg.payload.request.intent.slots.Number.value;
			
			var alexaType = msg.payload.request.intent.slots.Type.value;
			
			if(method == "SET") {
				var alexaLEDStatus = msg.payload.request.intent.slots.Status.value;
				
				if(alexaLEDStatus == "on" || alexaLEDStatus == "true") {
					alexaLEDStatus = "on";
				}
				else if(alexaLEDStatus == "off" || alexaLEDStatus == "false") {
					alexaLEDStatus = "off";
				}
				else {
					alexaLEDStatus = "undefined";
				}				
				
				if(intentNumberString == "?" || intentNumberString == "") {
					returnSpeech = "The LED's were successfully turned " + alexaLEDStatus;
				}
				else if(value >=0 && value <=1){								
					returnSpeech = "The LED at position " + value + " was successfully turned " + alexaLEDStatus;
				}
				else {					
					returnSpeech = "I tried to set LED setting but value was not understood";
				}
			}
			else {
				//either a tag array with name and time, or a single led, or an led array
				//if it's an array, check to see if its tag details or all led
				if(alexaType.includes("tag")) {					
					var tagName = value[0];
					var tagDetectionTime = value[1];
					returnSpeech = "The Last Detected Tag was " + tagName + ".  This was detected at " + tagDetectionTime;
				}
				else if(alexaType.includes("light")) {					
					if(typeof value == "boolean") {						
						var statusLED = "off";
						if(value == true) {
							statusLED = "on"
						}
						returnSpeech = "The LED at position " + returnValue + " is currently turned " + statusLED;
					}
					else if(typeof value == "object") {						
						var firstLEDBoolean = value[0];
						var secondLEDBoolean = value[1];
						var firstLED = "off";
						var secondLED = "off";
						if (firstLEDBoolean == true) {
							firstLED = "on";
						}
						if (secondLEDBoolean == true) {
							secondLED = "on";
						}
						
						returnSpeech = "The LED at position 0 is currently turned " + firstLED + ".  The LED at position 1 is currently turned " + secondLED;
					}
					else {
						returnSpeech = "I'm sorry but I didn't understand what data you wanted me to get";
					}
				}
				else {
					returnSpeech = "The get request was not understood";
				}
			}						
			
				msg.payload = {
				  "version": "1.0",
				  "response": {
					"outputSpeech": {
					  "type": "SSML",
					  "ssml": "<speak> "  + returnSpeech + " </speak>"
					},
					"reprompt": {
					  "outputSpeech": {
						"type": "SSML",
						"ssml": "<speak> "  + returnSpeech + " </speak>"
					  }
					},
					"shouldEndSession": true
				  }
				}
		}
		
		function returnToAlexa(msg,method,value){
			returnToAlexaSpeech(msg,method,value);
			if (msg.res) {
                if (msg.headers) {
                    msg.res._res.set(msg.headers);
                }
                if (msg.cookies) {
                    for (var name in msg.cookies) {
                        if (msg.cookies.hasOwnProperty(name)) {
                            if (msg.cookies[name] === null || msg.cookies[name].value === null) {
                                if (msg.cookies[name]!==null) {
                                    msg.res._res.clearCookie(name,msg.cookies[name]);
                                } else {
                                    msg.res._res.clearCookie(name);
                                }
                            } else if (typeof msg.cookies[name] === 'object') {
                                msg.res._res.cookie(name,msg.cookies[name].value,msg.cookies[name]);
                            } else {
                                msg.res._res.cookie(name,msg.cookies[name]);
                            }
                        }
                    }
                }
                var statusCode = msg.statusCode || 200;
                if (typeof msg.payload == "object" && !Buffer.isBuffer(msg.payload)) {
                    msg.res._res.status(statusCode).jsonp(msg.payload);
                } else {
                    if (msg.res._res.get('content-length') == null) {
                        var len;
                        if (msg.payload == null) {
                            len = 0;
                        } else if (Buffer.isBuffer(msg.payload)) {
                            len = msg.payload.length;
                        } else if (typeof msg.payload == "number") {
                            len = Buffer.byteLength(""+msg.payload);
                        } else {
                            len = Buffer.byteLength(msg.payload);
                        }
                        msg.res._res.set('content-length', len);
                    }

                    if (typeof msg.payload === "number") {
                        msg.payload = ""+msg.payload;
                    }
                    msg.res._res.status(statusCode).send(msg.payload);
                }
            } else {
                node.warn(RED._("httpin.errors.no-response"));
            }
		}
		
		//trigger on start of flow
		pRFID.on('opened', function(emitter, data) {			
			console.log("pRFID: " + emitter.name);
			//the antenna must be activated for the PhidgetRFID to report tag reads
			emitter.antenna = true;
			console.log("Device ready. Antenna activated.");
					
			node.status({fill:"green",shape:"dot",text:"connected to device"});
					
		});
		
		pRFID.on('detected', function(emitter, tag) {
			console.log("Tag Detected!");
			console.log("Tag Protocol: " + tag.protocol);
			console.log("Tag Value: " + tag.value);
			console.log("Tag detection time: " + tag.detectedAt);
			console.log("Tag detection lost time: " + tag.lostAt);
			row={};
	        row["Tag_Value"] = tag.value;
	        row["Tag_Detection_Time"] = tag.detectedAt;
	        row["Tag_Detection_Lost_Time"] = tag.lostAt;
			row["Phidget_Name"] = emitter.name;
			row["Phidget_Serial"] = emitter.serial;
	        //node.log(JSON.stringify(row))
	        payload.push(row);
			msg1["payload"]=payload;
			//console.log and node.log do the same thing
			node.log('Phidget Name: ' + msg1.payload[0].Phidget_Name + ', value: ' + msg1.payload[0].Tag_Value);
			//console.log(emitter.type);
			node.send(msg1);
			payload = [];
		});
		
		pRFID.on('lost', function(emitter, tag) {
			console.log("Tag Lost!");
			console.log("Tag Protocol: " + tag.protocol);
			console.log("Tag Value: " + tag.value);
			console.log("Tag detection time: " + tag.detectedAt);
			console.log("Tag detection lost time: " + tag.lostAt);
			row={};
	        row["Tag_Value"] = tag.value;
	        row["Tag_Detection_Time"] = tag.detectedAt;
	        row["Tag_Detection_Lost_Time"] = tag.lostAt;
			row["Phidget_Name"] = emitter.name;
			row["Phidget_Serial"] = emitter.serial;
	        //node.log(JSON.stringify(row))
	        payload.push(row);
			msg1["payload"]=payload;
			//console.log and node.log do the same thing
			node.log('Phidget Name: ' + msg1.payload[0].Phidget_Name + ', value: ' + msg1.payload[0].Tag_Value);
			//console.log(emitter.type);
			node.send(msg1);
			payload = [];
		});
		
		pRFID.on('error', function(emitter, error) {
			console.log("An Error occurred when trying to open device " + emitter.name);
			if((hostAddress == "" && !portNumber) || !hostAddress) {
				console.log("This happened when trying to connect to 127.0.0.1, port number 5001");
			}
			else if(hostAddress == "" && portNumber) {
				console.log("This happened when trying to connect to 127.0.0.1, port number " + portNumber);
			}
			else {
				console.log("This happened when trying to connect to " + error.address + ", port number " + error.port);
			}			
			console.log("Error Code: " + error.code);
			console.log("Error Message: " + error.message);
			node.status({fill:"red",shape:"dot",text:"error connecting"});
		});
		
		//Decide where to connect to
		if((hostAddress == "" && !portNumber) || !hostAddress) {
			console.log("Connecting to Local Machine using default port 5001");			
			pRFID.open();
		}
		else if(hostAddress == "" && portNumber) {
			console.log("Connecting to Local Machine using port " + portNumber);			
			pRFID.open({
				port: portNumber
			});
		}
		else {
			console.log("Connecting to Address: " + hostAddress + " using port " + portNumber);			
			pRFID.open({
				host: hostAddress,
				port: portNumber
			});
		}		
		
		//need to check for changes.		
		if(repeat == "interval") {
			var timer = 0;
			
			if(intervalPeriod == "s"){
				timer = intervalCount * 1000;
			}
			else if(intervalPeriod == "m") {
				timer = intervalCount * 60000;
			}
			else {
				timer = intervalCount * 3600000;
			}
			this.interval = setInterval (getData,timer);
			console.log("Repeat:" + repeat);
			console.log("Timer: " + timer);
			console.log("Interval Timer:" + this.interval);
		}
		else if(repeat == "none") {
			if (this.interval != null) {
				clearInterval(this.interval);
			}	
			console.log("Repeat:" + repeat);
			console.log("Interval Timer:" + this.interval);
		}
		
		function getData() {
			if(pRFID.ready) {
				//not sure i need this here if i'm already doing it on the open
				console.log("pRFID: " + pRFID.name);
				console.log("pRFID tag: " + pRFID.tag.value);						
				
				try{
					if(pRFID.tag.value){
						row={};
						row["Tag_Value"] = pRFID.tag.value;
						row["Tag_Detection_Time"] = pRFID.tag.detectedAt;
						row["Tag_Detection_Lost_Time"] = pRFID.tag.lostAt;
						row["Phidget_Name"] = pRFID.name;
						row["Phidget_Serial"] = pRFID.serial;
						//node.log(JSON.stringify(row))
						//console.log and node.log do the same thing
						node.log('RFID: ' + pRFID.name + ', value: ' + pRFID.tag.value);
						payload.push(row);
					}
				}
				catch(error) {
					node.warn("No Historic Tags Detected");
				}
								
				try{
					console.log("Count output" + pRFID.outputs.count);
					if (pRFID.outputs.count) {
						for(var i = 0; i <= pRFID.outputs.count; i++) {
							row={};
							row["Output_Position"] = i;
							row["Output_Reading"] = pRFID.outputs[i].value;
							row["Phidget_Name"] = pRFID.name;
							row["Phidget_Serial"] = pRFID.serial;
							//node.log(JSON.stringify(row))
							//console.log and node.log do the same thing
							node.log('Output: ' + i + ', value: ' + pRFID.outputs[i].value);
							payloadOutput.push(row);
							console.log("Reached position: " + i);
						}
					}
				}
				catch(error) {
					//node.warn("No Output Devices Detected: " + i);
				}
				
				msg1["payload"]=payload;	
				msg2["payload"]=payloadOutput;			
				node.send([ msg1, msg2 ]);
				payload = [];
				payloadOutput = [];
				
				node.status({fill:"green",shape:"dot",text:"connected to device"});
			}
			else {
				node.warn("Cannot Detect device, Attempting to Reconnect");
				node.status({fill:"red",shape:"dot",text:"error connecting"});
				
				//Decide where to connect to
				if((hostAddress == "" && !portNumber) || !hostAddress) {
					console.log("Connecting to Local Machine using default port 5001");
					pRFID.on('opened', function(emitter, data) {						
						emitter.antenna = true;						
						node.status({fill:"green",shape:"dot",text:"connected to device"});						
					});
					pRFID.open();
					pRFID.antenna = true;
				}
				else if(hostAddress == "" && portNumber) {
					console.log("Connecting to Local Machine using port " + portNumber);
					pRFID.on('opened', function(emitter, data) {						
						emitter.antenna = true;						
						node.status({fill:"green",shape:"dot",text:"connected to device"});						
					});
					pRFID.open({
						port: portNumber
					});
				}
				else {
					console.log("Connecting to Address: " + hostAddress + " using port " + portNumber);
					pRFID.on('opened', function(emitter, data) {						
						emitter.antenna = true;						
						node.status({fill:"green",shape:"dot",text:"connected to device"});						
					});
					pRFID.open({
						host: hostAddress,
						port: portNumber
					});
				}
			}
		}
		
		//required to read successful input from node button.
		this.on("input",function(msg1) {
            try {
				getData();                
                msg1 = null;				
            } catch(err) {
                this.error(err,msg1);
            }
        });
    }
	
    RED.nodes.registerType("Alexa-Phidget-RFID",AlexaPhidgetRFIDNode);
	
	//trigger on redeploy
	AlexaPhidgetRFIDNode.prototype.close = function() {
		//stop the interval
        if (this.interval != null) {
            clearInterval(this.interval);
			console.log("Stopped Interval Period");
        }
		
		//stop the listeners so data is not duplicated
		this.pRFID.removeAllListeners('detected');
		this.pRFID.removeAllListeners('lost');
    }
	
	//Creates an HTTP end point in the runtime /Alexa-Phidget-RFID/<node-id> that can be used to trigger the node -- allows node button to work.
	RED.httpAdmin.post("/Alexa-Phidget-RFID/:id", RED.auth.needsPermission("Alexa-Phidget-RFID.write"), function(req,res) {
        var node = RED.nodes.getNode(req.params.id);
        if (node != null) {
            try {
                node.receive();
                res.sendStatus(200);
            } catch(err) {
                res.sendStatus(500);
                node.error(RED._("Alexa-Phidget-RFID.failed",{error:err.toString()}));
            }
        } else {
            res.sendStatus(404);
        }
    });
	
}
    
