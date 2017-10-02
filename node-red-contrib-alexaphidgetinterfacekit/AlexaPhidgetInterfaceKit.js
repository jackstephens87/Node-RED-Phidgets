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
	//var pik;
	
    function AlexaPhidgetInterfaceKitNode(config) {
		var phidgets = require('phidgets');			
		
        RED.nodes.createNode(this,config);
        var node = this;
		this.interval = null;
		this.status({fill:"red",shape:"dot",text:"not started"});
		//pik = null;
		//var pik = this.pik;
		this.pik = new phidgets.PhidgetInterfaceKit();
		var pik = this.pik;
		
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
						//status of LED could be array or boolean.
						statusType = alexaGetLED(alexaNumber);						
					}
					else if(alexaType.includes("input")){
						//status of Input could be array or boolean.						
						statusType = alexaGetInput(alexaNumber);
					}
					else if(alexaType.includes("sensor")){
						//status of Sensor could be array or boolean.						
						statusType = alexaGetSensor(alexaNumber);
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
		var payloadInput = [];
		var payloadOutput = [];
		var msg1 = {topic:"Phidget Interface Kit Analogue Input", payload:payload};
		var msg2 = {topic:"Phidget Interface Kit Digital Input", payload:payloadInput};
		var msg3 = {topic:"Phidget Interface Kit Digital Output", payload:payloadOutput};
		
		//Interval Period from Config Selection
		var repeat=config.repeat;
        var intervalCount=config.repeat_interval_count;
		var intervalPeriod=config.repeat_interval_period;
		
		//Sensitivity or Data Rate Trigger
		this.dataTrigger = config.data_trigger;
		var dataTrigger = this.dataTrigger
		console.log("Trigger config: " + dataTrigger);
		
		//Sensitivity from Config Selection
		this.sensitivity=parseInt(config.sensitivity);
		var sensitivity = this.sensitivity;
		console.log("sensitivity config: " + sensitivity);
		
		//Data Rate from Config Selection
		this.dataRate=parseInt(config.dataRate);
		var dataRate = this.dataRate;
		console.log("Data Rate config: " + dataRate);
		
		function alexaSetLED(alexaLEDStatus, alexaNumber) {			
			var LEDStatus = false;
			var alexaNumberString = "";
			
			if(alexaNumber) {
				alexaNumberString = alexaNumber.toString;
			}
			
			if(alexaLEDStatus == "on" || alexaLEDStatus == "true") {
				LEDStatus = true;
				if(alexaNumberString == "?" || alexaNumberString == "") {					
					pik.setOutput([0,1,2,3,4,5,6,7], LEDStatus);
				}
				else if(alexaNumber >=0 && alexaNumber <= 7) {					
					pik.setOutput(alexaNumber, LEDStatus);
				}
				else {
					//do nothing
				}
			}
			else if(alexaLEDStatus == "off" || alexaLEDStatus == "false") {
				if(alexaNumber == "?" || alexaNumberString == "") {
					pik.setOutput ([0,1,2,3,4,5,6,7], LEDStatus);
				}
				else if(alexaNumber >=0 && alexaNumber <= 7) {					
					pik.setOutput(alexaNumber, LEDStatus);
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
					if (pik.outputs.count) {						
						var outputLEDArray = [];
						for(var i = 0; i < pik.outputs.count; i++) {
							outputLEDArray.push(pik.outputs[i].value);
						}						
						return outputLEDArray;
					}
				}
				catch(error) {
					//node.warn("No Output Devices Detected: " + i);
				}
			}
			else if(alexaNumber >= 0 && alexaNumber <=7){				
				return pik.outputs[alexaNumber].value;
			}
			else{
				//do nothing
			}
		}

		function alexaGetInput(alexaNumber) {
			var alexaNumberString = "";
			
			if(alexaNumber) {				
				alexaNumberString = alexaNumber.toString;
			}

			if(alexaNumberString == "?" || alexaNumberString == "") {				
				try{
					if (pik.inputs.count) {
						var inputArray = [];
						for(var i = 0; i < pik.inputs.count; i++) {
							inputArray.push(pik.inputs[i].value);
						}
						return inputArray;
					}
				}
				catch(error) {
					//node.warn("No Input Devices Detected: " + i);
				}
			}
			else if(alexaNumber >= 0 && alexaNumber <=7){				
				return pik.inputs[alexaNumber].value;
			}
			else{
				//do nothing
			}			
		}

		function alexaGetSensor(alexaNumber) {
			var alexaNumberString = "";
			
			if(alexaNumber) {
				alexaNumberString = alexaNumber.toString;
			}

			if(alexaNumberString == "?" || alexaNumberString == "") {
				var sensorArray = [];
				for(var i = 0; i <= 7; i++) {
					try{
						if(pik.sensors[i].value){
							sensorArray.push(pik.sensors[i].value);
						}
					}
					catch(error) {
						//node.warn("No Sensor Devices Detected: " + i);
					}
				}
				return sensorArray;
				
			}
			else if(alexaNumber >= 0 && alexaNumber <=7){				
				return pik.sensors[alexaNumber].value;
			}
			else{
				//do nothing
			}			
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
				else if(value >=0 && value <=7){								
					returnSpeech = "The LED at position " + value + " was successfully turned " + alexaLEDStatus;
				}
				else {
					returnSpeech = "I tried to set LED setting but value was not understood";
				}
			}
			else {				
				if(alexaType.includes("input")) {
					var inputStatus = "off";
					if(typeof value == "boolean") {						
						if(value == true) {
							inputStatus = "on"
						}
						returnSpeech = "The input at position " + returnValue + " is currently turned " + inputStatus;
					}
					else if(typeof value == "object") {
						var inputBoolean = false;						
						returnSpeech = "";						
						
						for (var i = 0; i <=7; i++) {
							inputBoolean = value[i];
							inputStatus = "off";
							if (inputBoolean == true) {
								inputStatus = "on";
							}
							inputBoolean = value[i];							
							returnSpeech = returnSpeech + "The input at position " + i + " is currently turned " + inputStatus + ". ";
						}						
					}
					else {
						returnSpeech = "I'm sorry but I didn't understand what data you wanted me to get";
					}
				}
				else if(alexaType.includes("light")) {
					var ledStatus = "off";
					if(typeof value == "boolean") {
						if(value == true) {
							ledStatus = "on"
						}
						returnSpeech = "The LED at position " + returnValue + " is currently turned " + ledStatus;
					}
					else if(typeof value == "object") {
						var ledBoolean = false;						
						returnSpeech = "";						
						
						for (var i = 0; i <= 7; i++) {
							ledBoolean = value[i];
							ledStatus = "off";
							if (ledBoolean == true) {
								ledStatus = "on";
							}
							returnSpeech = returnSpeech + "The LED at position " + i + " is currently turned " + ledStatus + ". ";
						}
						

						//returnSpeech = "The LED at position 0 is currently turned " + firstLED + ".  The LED at position 1 is currently turned " + secondLED;
					}
					else {
						returnSpeech = "I'm sorry but I didn't understand what data you wanted me to get";
					}
				}
				else if(alexaType.includes("sensor")) {
					if(typeof value == "number") {						
						returnSpeech = "The sensor at position " + returnValue + " is set to " + pik.sensors[returnValue].value;
					}
					else if(typeof value == "object") {						
						returnSpeech = "";
						
						for (var i = 0; i <= 7; i++) {
							try{
								if(pik.sensors[i].value){
									returnSpeech = returnSpeech + "The sensor at position " + i + " is set to " +  pik.sensors[i].value + ". ";
								}
							}
							catch(error) {
								//node.warn("No Sensor Devices Detected: " + i);
							}							
						}
						

						//returnSpeech = "The LED at position 0 is currently turned " + firstLED + ".  The LED at position 1 is currently turned " + secondLED;
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
		
		node.log("Repeat: " + repeat);
		node.log("Counter: " + intervalCount);
		node.log("Period: " + intervalPeriod);
		
		pik.on('sensor', function(emitter, data) {			
			//msg1.payload = data.value;
			row={};
	        row["Sensor_Position"] = data.index;
	        row["Sensor_Reading"] = data.value;
	        row["Phidget_Name"] = emitter.name;
			row["Phidget_Serial"] = emitter.serial;
	        //node.log(JSON.stringify(row))
	        payload.push(row);
			msg1["payload"]=payload;
			//console.log and node.log do the same thing
			node.log('Sensor: ' + data.index + ', Value: ' + msg1.payload[0].Sensor_Reading);
			node.log("Sensor Info: " + pik.sensors[data.index].sensitivity);
			//console.log(emitter.type);
			node.send(msg1);
			payload = [];
		});
		
		//trigger on start of flow
		pik.on('opened', function(emitter, data) {
			//Check if we are using Data Rate or Sensitivity
			if(dataTrigger == "sensitivity") {
				console.log("sensitivity: " + sensitivity);
				console.log("pik: " + pik);
				console.log("sensitivity: " + pik.sensors[0].sensitivity);
				setSensorSensitivity();
			}
			else {
				console.log("Data Rate: " + dataRate);
				console.log("pik: " + pik);
				console.log("Data Rate: " + pik.sensors[0].updateInterval);
				setSensorDataRate();
			}
			
			node.status({fill:"green",shape:"dot",text:"connected to device"});
			
			
			//Only change sensitivity if the config is different to what is currently set.
			/*
			if(sensitivity != pik.sensors[0].sensitivity) {
				setSensorSensitivity();
			}	*/	
			/*if(sensitivity >= 0 && sensitivity <= 1000) {
				for(var i=0; i <= 7; i++) {
					console.log("Sensitivity Before: " + pik.sensors[i].sensitivity);
					pik.setSensitivity(i, value=sensitivity);
					console.log("Sensitivity set to " + sensitivity + " for Sensor Index " + i);					
					console.log("Sensitivity After: " + pik.sensors[i].sensitivity);
				}
			}
			else {
				console.log("Sensitivity not within Accepted Range.  Must be within 0-1000");
			}*/
		});
		
		pik.on('input', function(emitter, data) {			
			//msg1.payload = data.value;
			row={};
	        row["Input_Position"] = data.index;
	        row["Input_Reading"] = data.value;
	        row["Phidget_Name"] = emitter.name;
			row["Phidget_Serial"] = emitter.serial;
	        //node.log(JSON.stringify(row))
	        payloadInput.push(row);
			msg2["payload"]=payloadInput;
			//console.log and node.log do the same thing
			node.log('Input: ' + data.index + ', value: ' + msg2.payload[0].Input_Reading);
			//console.log(emitter.type);
			node.send(msg2);
			payloadInput = [];
		});
		
		/*
		pik.on('output', function(emitter, data) {
			//msg1.payload = data.value;
			row={};
	        row["Output_Position"] = data.index;
	        row["Output_Reading"] = data.value;
	        row["Phidget_Name"] = emitter.name;
			row["Phidget_Serial"] = emitter.serial;
	        //node.log(JSON.stringify(row))
	        payloadOutput.push(row);
			msg1["payload"]=payloadOutput;
			//console.log and node.log do the same thing
			node.log('Sensor: ' + data.index + ', value: ' + msg3.payload[0].Sensor_Reading);
			//console.log(emitter.type);
			node.send(msg3);
			payloadOutput = [];
		});
		*/
		
		pik.on('error', function(emitter, error) {
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
			pik.open();
		}
		else if(hostAddress == "" && portNumber) {
			console.log("Connecting to Local Machine using port " + portNumber);
			pik.open({
				port: portNumber
			});
		}
		else {
			console.log("Connecting to Address: " + hostAddress + " using port " + portNumber);
			pik.open({
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
		
		function setSensorSensitivity() {
			if(sensitivity >= 0 && sensitivity <= 1000) {
				for(var i=0; i <= 7; i++) {
					console.log("Sensitivity Before: " + pik.sensors[i].sensitivity);
					pik.setSensitivity(i, sensitivity);
					console.log("Sensitivity set to " + sensitivity + " for Sensor Index " + i);					
					console.log("Sensitivity After: " + pik.sensors[i].sensitivity);
				}
			}
			else {
				console.log("Sensitivity not within Accepted Range.  Must be within 0-1000");
			}
		}
		
		function setSensorDataRate() {
			if(dataRate >= 16 && dataRate <= 1000) {
				for(var i=0; i <= 7; i++) {
					console.log("Data Rate Before: " + pik.sensors[i].updateInterval);
					pik.setUpdateInterval(i, value=dataRate);
					console.log("Data Rate set to " + dataRate + " for Sensor Index " + i);					
					console.log("Data Rate After: " + pik.sensors[i].updateInterval);
				}
			}
			else {
				console.log("Data Rate not within Accepted Range.  Must be within 16-1000 ms");
			}
		}
		
		function getData() {
			if(pik.ready) {
				//not sure i need this here if i'm already doing it on the open
				if(dataTrigger == "sensitivity") {
					console.log("sensitivity: " + sensitivity);
					console.log("pik: " + pik);
					console.log("sensitivity: " + pik.sensors[0].sensitivity);
					setSensorSensitivity();
				}
				else {
					console.log("Data Rate: " + dataRate);
					console.log("pik: " + pik);
					console.log("Data Rate: " + pik.sensors[0].updateInterval);
					setSensorDataRate();
				}
				//Only change sensitivity if the config is different to what is currently set.
				/*if(sensitivity != pik.sensors[0].sensitivity) {
					setSensorSensitivity();
				}*/
				
				//Analogue Inputs
				for(var i = 0; i <= 7; i++) {
					try{
						if(pik.sensors[i].value){
							row={};
							row["Sensor_Position"] = i;
							row["Sensor_Reading"] = pik.sensors[i].value;
							row["Phidget_Name"] = pik.name;
							row["Phidget_Serial"] = pik.serial;
							//node.log(JSON.stringify(row))
							//console.log and node.log do the same thing
							node.log('Sensor: ' + i + ', value: ' + pik.sensors[i].value);
							payload.push(row);
						}
					}
					catch(error) {
						node.warn("No Sensors Detected");
					}				
				}
				
				
				//Digital Inputs
				try{
					console.log("Count input" + pik.inputs.count);
					if (pik.inputs.count) {
						for(var i = 0; i <= pik.inputs.count; i++) {
							row={};
							row["Input_Position"] = i;
							row["Input_Reading"] = pik.inputs[i].value;
							row["Phidget_Name"] = pik.name;
							row["Phidget_Serial"] = pik.serial;
							//node.log(JSON.stringify(row))
							//console.log and node.log do the same thing
							node.log('Input: ' + i + ', value: ' + pik.inputs[i].value);
							payloadInput.push(row);
							console.log("Reached position: " + i);
						}
					}
				}
				catch(error) {
					node.warn("No Input Devices Detected: " + i);
				}
				
				
				//test Output
				/*
				console.log("status of 0: " + pik.outputs[0].value);
				if(pik.outputs[0].value) {
					pik.setOutput(0, value=false);
				}
				else {
					pik.setOutput(0, value=true);
				}
				console.log("Status of 1: " + pik.outputs[0].value);
				*/
				try{
					console.log("Count output" + pik.outputs.count);
					if (pik.outputs.count) {
						for(var i = 0; i <= pik.outputs.count; i++) {
							row={};
							row["Output_Position"] = i;
							row["Output_Reading"] = pik.outputs[i].value;
							row["Phidget_Name"] = pik.name;
							row["Phidget_Serial"] = pik.serial;
							//node.log(JSON.stringify(row))
							//console.log and node.log do the same thing
							node.log('Output: ' + i + ', value: ' + pik.outputs[i].value);
							payloadOutput.push(row);
							console.log("Reached position: " + i);
						}
					}
				}
				catch(error) {
					//node.warn("No Output Devices Detected: " + i);
				}
				
				msg1["payload"]=payload;	
				msg2["payload"]=payloadInput;
				msg3["payload"]=payloadOutput;			
				node.send([ msg1, msg2, msg3 ]);
				payload = [];
				payloadInput = [];
				payloadOutput = [];
				
				node.status({fill:"green",shape:"dot",text:"connected to device"});
			}
			else {
				node.warn("Cannot Detect device, Attempting to Reconnect");
				node.status({fill:"red",shape:"dot",text:"error connecting"});
				
				//Decide where to connect to
				if((hostAddress == "" && !portNumber) || !hostAddress) {
					console.log("Connecting to Local Machine using default port 5001");
					pik.open();
				}
				else if(hostAddress == "" && portNumber) {
					console.log("Connecting to Local Machine using port " + portNumber);
					pik.open({
						port: portNumber
					});
				}
				else {
					console.log("Connecting to Address: " + hostAddress + " using port " + portNumber);
					pik.open({
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
	
    RED.nodes.registerType("Alexa-Phidget-PIK",AlexaPhidgetInterfaceKitNode);
	
	//trigger on redeploy
	AlexaPhidgetInterfaceKitNode.prototype.close = function() {
		//stop the interval
        if (this.interval != null) {
            clearInterval(this.interval);
			console.log("Stopped Interval Period");
        }
		
		//stop the listeners so data is not duplicated
		this.pik.removeAllListeners('sensor');
		this.pik.removeAllListeners('input');
    }
	
	//Creates an HTTP end point in the runtime /Alexa-Phidget-PIK/<node-id> that can be used to trigger the node -- allows node button to work.
	RED.httpAdmin.post("/Alexa-Phidget-PIK/:id", RED.auth.needsPermission("Alexa-Phidget-PIK.write"), function(req,res) {
        var node = RED.nodes.getNode(req.params.id);
        if (node != null) {
            try {
                node.receive();
                res.sendStatus(200);
            } catch(err) {
                res.sendStatus(500);
                node.error(RED._("Alexa-Phidget-PIK.failed",{error:err.toString()}));
            }
        } else {
            res.sendStatus(404);
        }
    });
	
}
    
