module.exports = function(RED) {
	
	//var pik;
	
    function PhidgetInterfaceKitNode(config) {
		var phidgets = require('phidgets');			
		
        RED.nodes.createNode(this,config);
        var node = this;
		this.interval = null;
		this.status({fill:"red",shape:"dot",text:"not started"});
		//pik = null;
		//var pik = this.pik;
		this.pik = new phidgets.PhidgetInterfaceKit();
		var pik = this.pik;
		
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
					pik.setSensitivity(i, value=sensitivity);
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
	
    RED.nodes.registerType("Phidget-PIK",PhidgetInterfaceKitNode);
	
	//trigger on redeploy
	PhidgetInterfaceKitNode.prototype.close = function() {
		//stop the interval
        if (this.interval != null) {
            clearInterval(this.interval);
			console.log("Stopped Interval Period");
        }
		
		//stop the listeners so data is not duplicated
		this.pik.removeAllListeners('sensor');
		this.pik.removeAllListeners('input');
    }
	
	//Creates an HTTP end point in the runtime /Phidget-PIK/<node-id> that can be used to trigger the node -- allows node button to work.
	RED.httpAdmin.post("/Phidget-PIK/:id", RED.auth.needsPermission("Phidget-PIK.write"), function(req,res) {
        var node = RED.nodes.getNode(req.params.id);
        if (node != null) {
            try {
                node.receive();
                res.sendStatus(200);
            } catch(err) {
                res.sendStatus(500);
                node.error(RED._("Phidget-PIK.failed",{error:err.toString()}));
            }
        } else {
            res.sendStatus(404);
        }
    });
	
}
    
