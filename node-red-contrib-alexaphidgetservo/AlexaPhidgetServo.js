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

    function createRequestWrapper(node,req) {
        // This misses a bunch of properties (eg headers). Before we use this function
        // need to ensure it captures everything documented by Express and HTTP modules.
        var wrapper = {
            _req: req
        };
        var toWrap = [
            "param",
            "get",
            "is",
            "acceptsCharset",
            "acceptsLanguage",
            "app",
            "baseUrl",
            "body",
            "cookies",
            "fresh",
            "hostname",
            "ip",
            "ips",
            "originalUrl",
            "params",
            "path",
            "protocol",
            "query",
            "route",
            "secure",
            "signedCookies",
            "stale",
            "subdomains",
            "xhr",
            "socket" // TODO: tidy this up
        ];
        toWrap.forEach(function(f) {
            if (typeof req[f] === "function") {
                wrapper[f] = function() {
                    node.warn(RED._("httpin.errors.deprecated-call",{method:"msg.req."+f}));
                    var result = req[f].apply(req,arguments);
                    if (result === req) {
                        return wrapper;
                    } else {
                        return result;
                    }
                }
            } else {
                wrapper[f] = req[f];
            }
        });


        return wrapper;
    }
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
	//var pServo;
	
    function AlexaPhidgetServoNode(config) {
		var phidgets = require('phidgetapi');			
		
        RED.nodes.createNode(this,config);
        var node = this;
		this.status({fill:"red",shape:"dot",text:"not started"});		
		this.pServo = new phidgets.phidget();
		var pServo = this.pServo;
		var payload = {};
		var msg = {};
		
		
		//alexa Details
		this.url = config.url;
		var url = this.url;
		var method = "post"; //forcing method to be post --may alter in future
		this.alexaServoValue = 0;
		var alexaServoValue = this.alexaServoValue;
		
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
				//node.send({_msgid:msgid,req:req,res:createResponseWrapper(node,res)});
				console.log({_msgid:msgid,res:createResponseWrapper(node,res)});
				//console.log({_msgid:msgid,req:req.body.request.intent.slots});
				var alexaMethod = req.body.request.intent.slots.Text.value;
				var alexaNumber = req.body.request.intent.slots.Number.value;
				
				var alexaMethodCheck = "set";

				if(alexaMethod.includes(alexaMethodCheck)) {
					//console.log("Contains SET");					
					var alexaServoConvertedValue = calcPosition(alexaNumber);				
					alexaSetServo(alexaServoConvertedValue);
					returnToAlexa(msg,"SET", 0);
				}
				else {
					//console.log("Doesn't contain SET");					
					var alexaPositionString = pServo.data.Position[0];
					//set scientific notation string to integer using Number method
					var alexaPosition = Number(alexaPositionString);
					var alexaCalculatedValue = reverseCalcPosition(alexaPosition);					
					returnToAlexa(msg,"GET", alexaCalculatedValue);
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
		
		//velocity
		/*
		this.velocity=config.velocity;
		var velocity = this.velocity;
		var velocityString = velocity.toString();
		*/
		
		this.startingPos=config.startingPos;
		var startingPos = this.startingPos;		
		var startingPosString = "";
		
		//connection Details
		this.hostAddress=config.hostAddress;
		var hostAddress = this.hostAddress;
		this.portNumber=parseInt(config.portNumber);
		var portNumber = this.portNumber;
				
		var reconnectCount = 0;
		
		function alexaSetServo(alexaValue) {
			var alexaValueToString = alexaValue.toString();			
			pServo.set(
					{
						type:'Engaged',
						key:'0',
						value:'1'
					}
				);
			pServo.set(
					{
						type:'Position',
						key:'0',
						value:alexaValueToString
					}
				);			
		}
		
		function powerdown(){
			//this should stop servo from moving if it has not completed its motion.
			pServo.Engaged=1; //fake a hard power up just to be sure servo listens to power off command
			pServo.Engaged=0; //power off
		}
		
		function reverseCalcPosition(position){			
			var degreeRange = (180-0);
			var deviceRange = (2499 - 455);
			var degreeToDeviceValue = Math.round((((position-455)*degreeRange)/deviceRange)+0);			
			//var numString = degreeToDeviceValue.toString();
			//return numString;
			return degreeToDeviceValue;
		}
		
		function calcPosition(degrees){
			var degreeRange = (180-0);
			var deviceRange = (2499 - 455);
			var degreeToDeviceValue = (((degrees-0)*deviceRange)/degreeRange)+455;
			var numString = degreeToDeviceValue.toString();
			return numString;
		}
		
		function returnToAlexaSpeech(msg,method,position) {			
			var speech = "";
			var speechEnd = " degrees";
			var returnValue = 0;
			var returnSpeech = "";
			
			if(method == "SET") {
				var intentNumberString = msg.payload.request.intent.slots.Number.value.toString();
				returnValue = msg.payload.request.intent.slots.Number.value;
				
				if(intentNumberString == "?") {
					console.log("Position was not understood by Alexa");
					returnSpeech = "I tried to set the position but I didn't hear a value ";
				}
				else if(returnValue >=0 && returnValue <=180){
					speech = "Servo position was successfully set to ";					
					returnSpeech = speech + returnValue + speechEnd;
				}
				else {
					console.log("Position was not in acceptable range");
					returnSpeech = "I tried to set the position but value was not within acceptable range.  Value must be between 0 and 180 ";
				}
			}
			else {
				speech = "Current Servo position is ";
				returnValue = position;
				returnSpeech = speech + returnValue + speechEnd;
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
		
		function returnToAlexa(msg,method,position){
			returnToAlexaSpeech(msg,method,position);
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
		
		pServo.on("log", function(data){
			console.log('log ',data);
		});
		
		pServo.on(
			'phidgetReady',
			function(){
				node.status({fill:"green",shape:"dot",text:"connected to device"});
				console.log('motor ready');
				console.log("startingPos: " + startingPos);
				startingPosString = calcPosition(startingPos);
				console.log(pServo.data);
				
				pServo.set(
					{
						type:'Engaged',
						key:'0',
						value:'1'
					}
				);
				/*
				pServo.set(
					{
						type:'board',
						key:'VelocityMaxLimit',
						value:'2'
					}
				);
				
				pServo.set(
					{
						type:'board',
						key:'AccelerationMax',
						value:'210'
					}
				);
				
				pServo.set(
					{
						type:'VelocityMax',
						key:'0',
						value:'2'
					}
				);
				*/
				pServo.set(
					{
						type:'Position',
						key:'0',
						value:startingPosString
					}
				);
				setTimeout(
					powerdown,
					1000
				);
				console.log(pServo.data);
			}
		);
		
		pServo.on(
			'detached',
			function(data){
				node.status({fill:"red",shape:"dot",text:"device disconnected"});
				node.warn("Device has been disconnected.  Please reconnect device for operations to continue.");
				console.log("Device has been disconnected.  Please reconnect device for operations to continue.");
			}
		);
				
		pServo.on('error', function(data) {
			console.log("An Error occurred when trying to open device.");
			node.status({fill:"red",shape:"dot",text:"error connecting"});
			pServo.ready = false;
			
			if((hostAddress == "" && !portNumber) || !hostAddress) {
				console.log("This happened when trying to connect to 127.0.0.1, port number 5001");				
				if(reconnectCount <=5){
					console.log("Attempting to connect to Local Machine using default port 5001");
					reconnectCount = reconnectCount + 1;
					try{
						pServo.connect({
							type: 'PhidgetAdvancedServo'
						});
					}
					catch(err){
						console.log("Failed to reconnect");
						console.log("Error: " + err);
					}
				}
			}
			else if(hostAddress == "" && portNumber) {
				console.log("This happened when trying to connect to 127.0.0.1, port number " + portNumber);
				if(reconnectCount <=5){
					console.log("Attempting to connect to Local Machine using port " + portNumber);
					reconnectCount = reconnectCount + 1;
					try{
						pServo.connect({
							type: 'PhidgetAdvancedServo',
							port: portNumber
						});
					}
					catch(err){
						console.log("Failed to reconnect");
						console.log("Error: " + err);
					}
				}
			}
			else {
				console.log("This happened when trying to connect to " + hostAddress + ", port number " + portNumber);
				if(reconnectCount <=5){
					console.log("Attempting to connect to " + hostAddress + " using port " + portNumber);
					reconnectCount = reconnectCount + 1;
					try{
						pServo.connect({
							type: 'PhidgetAdvancedServo',
							host: hostAddress,
							port: portNumber
						});
					}
					catch(err){
						console.log("Failed to reconnect");
						console.log("Error: " + err);
					}
				}
			}			
		});
		
		//Decide where to connect to
		if((hostAddress == "" && !portNumber) || !hostAddress) {
			console.log("Connecting to Local Machine using default port 5001");
			pServo.connect({
				type: 'PhidgetAdvancedServo'
			});
		}
		else if(hostAddress == "" && portNumber) {
			console.log("Connecting to Local Machine using port " + portNumber);
			pServo.connect({
				type: 'PhidgetAdvancedServo',
				port: portNumber
			});
		}
		else {
			console.log("Connecting to Address: " + hostAddress + " using port " + portNumber);
			pServo.connect({
				type: 'PhidgetAdvancedServo',
				host: hostAddress,
				port: portNumber
			});
		}
		
    }
	
    RED.nodes.registerType("Alexa-Phidget-Servo",AlexaPhidgetServoNode);
	
	//trigger on redeploy
	AlexaPhidgetServoNode.prototype.close = function() {				
		//stop the listeners so data is not duplicated
		this.pServo.removeAllListeners('detached');
		this.pServo.removeAllListeners('changed');
		this.pServo.removeAllListeners('phidgetReady');
    }
	
}
    