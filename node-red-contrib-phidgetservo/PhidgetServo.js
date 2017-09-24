module.exports = function(RED) {
	
	//var pServo;
	
    function PhidgetServoNode(config) {
		var phidgets = require('phidgetapi');			
		
        RED.nodes.createNode(this,config);
        var node = this;
		this.interval = null;
		this.status({fill:"red",shape:"dot",text:"not started"});
		//pServo = null;
		//var pServo = this.pServo;
		this.pServo = new phidgets.phidget();
		var pServo = this.pServo;
		
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
						
		//Interval Period from Config Selection
		/*var repeat=config.repeat;
        var intervalCount=config.repeat_interval_count;
		var intervalPeriod=config.repeat_interval_period;
		*/
		var reconnectCount = 0;
		/*		
		node.log("Repeat: " + repeat);
		node.log("Counter: " + intervalCount);
		node.log("Period: " + intervalPeriod);
*/
		function powerdown(){
			//this will stop servo from moving if it has not completed its motion.
			pServo.Engaged=1; //fake a hard power up just to be sure servo listens to power off command
			pServo.Engaged=0; //power off
		}
		
		function calcPosition(degrees){
			var degreeRange = (180-0);
			var deviceRange = (2499 - 455);
			var degreeToDeviceValue = (((degrees-0)*deviceRange)/degreeRange)+455;
			var numString = degreeToDeviceValue.toString();
			return numString;
		}
		
		pServo.on("log", function(data){
			console.log('log ',data);
		});
		
		/*
		 * Detecting status change for both Re-Attach and Detach
		 */
		/*pServo.on(
			'changed',
			function(data){
				console.log('phidget status changed');
				console.log('data ',data);

			}
		);
		*/
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
		
		//need to check for changes.		
		/*if(repeat == "interval") {
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
		*/		
		//required to read successful input from nodes.
		this.on("input",function(msg) {
			reconnectCount = 0;
			if(pServo.ready) {														
				node.status({fill:"green",shape:"dot",text:"connected to device"});
			}
			else {
				node.warn("Cannot Detect device, Attempting to Reconnect");
				node.status({fill:"red",shape:"dot",text:"error connecting"});
				
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
			
			console.log("Number coming from msg: " + msg.payload);
			var degrees = calcPosition(msg.payload);
						
			if(msg.payload >=0 && msg.payload <=180) {
				console.log("Setting motor to degrees: " + msg.payload);
				
				try {
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
							type:'Velocity',
							key:'0',
							value:'6'
						}
					);
					*/				
					pServo.set(
						{
							type:'Position',
							key:'0',
							value:degrees
						}
					);
					setTimeout(
						powerdown,
						1000
					);
					console.log(pServo.data);
					msg = null;
				} catch(err) {
					this.error(err,msg);
				}
			}
			else {
				node.warn("Position requested is not within acceptable range. Value must be between 0 and 180");
				console.log("Position requested is not within acceptable range. Value must be between 0 and 180");
			}
        });
    }
	
    RED.nodes.registerType("Phidget-Servo",PhidgetServoNode);
	
	//trigger on redeploy
	PhidgetServoNode.prototype.close = function() {
		//stop the interval
        if (this.interval != null) {
            clearInterval(this.interval);
			console.log("Stopped Interval Period");
        }
		
		//stop the listeners so data is not duplicated
		this.pServo.removeAllListeners('detached');
		this.pServo.removeAllListeners('input');
		this.pServo.removeAllListeners('changed');
		this.pServo.removeAllListeners('phidgetReady');
    }
	
	//Creates an HTTP end point in the runtime /Phidget-Servo/<node-id> that can be used to trigger the node -- allows node button to work.
	/*RED.httpAdmin.post("/Phidget-Servo/:id", RED.auth.needsPermission("Phidget-Servo.write"), function(req,res) {
        var node = RED.nodes.getNode(req.params.id);
        if (node != null) {
            try {
                node.receive();
                res.sendStatus(200);
            } catch(err) {
                res.sendStatus(500);
                node.error(RED._("Phidget-Servo.failed",{error:err.toString()}));
            }
        } else {
            res.sendStatus(404);
        }
    });
	*/
}
    
