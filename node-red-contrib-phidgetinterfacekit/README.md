#Pre-requisites
Requires "phidgets" to be installed from the NPM.

#Info

Get Data from the Phidget Interface Kit

Pressing the button on the left side of the node requests the status of the Digital Input/Output ports, and information regarding any connected Analogue Input devices.  This information is output as 3 separate messages:
		Analogue Input
		Digital Input
		Digital Output
	
The "Repeat" function allows the payload of each respective message to be sent on the required schedule.

The "Data Trigger" function allows the user to set either the Sensitivity or the Data Rate of the sensors.  This has a corresponding slider to change:
		Sensitivity - a number between 0 to 1000
		Data Rate - a count in milliseconds ranging from 16ms to 1000ms

The"Host" is the host name or address of the Phidgets Web Service.  This defaults to using the local connection

The "Port" is the respective port number that the Phidget Web Service is using.  This defaults to port 5001.

Any changes to the status of the Digital Inputs or Analogue Inputs will result in the corresponding message being sent with the new status details.
