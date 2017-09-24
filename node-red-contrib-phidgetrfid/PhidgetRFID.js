module.exports = function(RED) {
	
	//var pRFID;
	
    function PhidgetRFIDNode(config) {
		var phidgets = require('phidgets');			
		
        RED.nodes.createNode(this,config);
        var node = this;
		this.interval = null;
		this.status({fill:"red",shape:"dot",text:"not started"});
		//pRFID = null;
		//var pRFID = this.pRFID;
		this.pRFID = new phidgets.PhidgetRFID();
		var pRFID = this.pRFID;
		
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
		
		node.log("Repeat: " + repeat);
		node.log("Counter: " + intervalCount);
		node.log("Period: " + intervalPeriod);
				
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
	
    RED.nodes.registerType("Phidget-RFID",PhidgetRFIDNode);
	
	//trigger on redeploy
	PhidgetRFIDNode.prototype.close = function() {
		//stop the interval
        if (this.interval != null) {
            clearInterval(this.interval);
			console.log("Stopped Interval Period");
        }
		
		//stop the listeners so data is not duplicated
		this.pRFID.removeAllListeners('detected');
		this.pRFID.removeAllListeners('lost');
    }
	
	//Creates an HTTP end point in the runtime /Phidget-RFID/<node-id> that can be used to trigger the node -- allows node button to work.
	RED.httpAdmin.post("/Phidget-RFID/:id", RED.auth.needsPermission("Phidget-RFID.write"), function(req,res) {
        var node = RED.nodes.getNode(req.params.id);
        if (node != null) {
            try {
                node.receive();
                res.sendStatus(200);
            } catch(err) {
                res.sendStatus(500);
                node.error(RED._("Phidget-RFID.failed",{error:err.toString()}));
            }
        } else {
            res.sendStatus(404);
        }
    });
	
}
    
