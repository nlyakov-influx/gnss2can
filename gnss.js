var fs = require('fs');
var readline = require('readline');
const pipeinPath = '/dev/ttymxc1';
const pipeoutPath =  '/var/run/rexgen/can0/tx';
var pipeout = fs.createWriteStream(pipeoutPath);
const debug = console.log; // Set to false to remove debug

const readFileByLine = (name, callback) => {
	const lineReader = readline.createInterface({ input: fs.createReadStream(name) });

	lineReader.on('line', line => { 
		callback && callback(line);
 	});
}

async function run()
{
	while (true)
	{
		readFileByLine(pipeinPath, onGNSSLine);
		debug && debug('pipe finish, waiting...');
		await new Promise((resolve) => { setTimeout(resolve, 1000); });
	}
}

function onGNSSLine(line)
{
	var gnss = new GNSS();
	if (line.startsWith('$GPGGA'))
	{
		gnss = parseGGA(line);
	}
	else if (line.startsWith('$GPRMC'))
	{
		gnss = parseRMC(line);
	}
	else
	{
		return;
	}
	if (gnss == null)
		return;

	debug && debug('gnss: ' + JSON.stringify(gnss));

	gnss.pipe(pipeout);
}


function parseGGA(data)
{
	const arr = data.split(',');
	if (arr.length < 15)
		return null;

	var gga = new GNSS();
	gga['timestamp'] = parseFloat(arr[1]);
	gga['latitude']= parseCoordinate(arr[2].substring(0, 2), arr[2].substring(2), arr[3]);
	gga['longitude']= parseCoordinate(arr[4].substring(0, 3), arr[4].substring(3), arr[5]);
	gga['quality'] = Number(arr[6]);
	gga['satellites'] = Number(arr[7]);
	gga['dilution'] = parseFloat(arr[8]);
	gga['altitude'] = parseFloat(arr[9]);
	gga['altitude-units'] = arr[10];
	gga['geoidal-separation'] = parseFloat(arr[11]);
	gga['geoidal-separation-units'] = arr[12];
	gga['checksum'] = arr[14];

	return gga;
}

function parseRMC(data)
{
	const knot2kmh = 1.852;

	const arr = data.split(',');
	if (arr.length < 13)
		return null;

	var rmc = new GNSS();
	rmc['timestamp'] = parseFloat(arr[1]);
	rmc['warning'] = arr[2];
	rmc['latitude']= parseCoordinate(arr[3].substring(0, 2), arr[3].substring(2), arr[4]);
	rmc['longitude']= parseCoordinate(arr[5].substring(0, 3), arr[5].substring(3), arr[6]);
	rmc['speed-over-ground'] = parseFloat(arr[7]); //knots
	rmc['course'] = parseFloat(arr[8]);
	rmc['date'] = Number(arr[9]);
	rmc['variation'] = parseFloat(arr[10]);
	rmc['eastwest'] = arr[11];
	rmc['checksum'] = arr[12];

	return rmc;
}

function parseCoordinate(degrees, minutes, direction)
{
	var coord = Number(degrees) + parseFloat(minutes)/60;
	if ('SW'.includes(direction))
		coord*= -1;

	return coord;
}

function PopulateString(data, params, defparams)
{
	var str = data;
	for (var key in params)
		if (params.hasOwnProperty(key))
			str = str.replace(key, params[key]);
	for (var key in defparams)
		if (defparams.hasOwnProperty(key))
			str = str.replace(key, defparams[key]);

	return str;
}

function float32ToHexString(data, delimiter)
{
	const getHex = i => ('00' + i.toString(16)).slice(-2);
	var view = new DataView(new ArrayBuffer(4)),
		result;

	view.setFloat32(0, data);
	return Array.apply(null, { length: 4 }).map((_, i) => getHex(view.getUint8(i))).join(delimiter);
}

function GNSS() {}

GNSS.prototype.pipe = function (streamout)
{
	if (this.hasOwnProperty('latitude') && this.hasOwnProperty('longitude'))
		SendCan(
			streamout,
			this['timestamp'],
			0x12a,
			8,
			float32ToHexString(this['latitude'], ' ') + ' ' + float32ToHexString(this['longitude'], ' ')
		);

	if (this.hasOwnProperty('altitude') && this.hasOwnProperty('satellites'))
		SendCan(
			streamout,
			this['timestamp'],
			0x12b,
			8,
			float32ToHexString(this['altitude'], ' ') + ' ' + float32ToHexString(this['satellites'], ' ')
		);

	if (this.hasOwnProperty('speed-over-ground') && this.hasOwnProperty('course'))
		SendCan(
			streamout,
			this['timestamp'],
			0x12c,
			8,
			float32ToHexString(this['speed-over-ground'], ' ') + ' ' + float32ToHexString(this['course'], ' ')
		);
}

function SendCan(streamout, timestamp, ident, dlc, data)
{
	var canrow = `(${timestamp})   can0      ${ident.toString(16)}  [${dlc}]  ${data}`;
	streamout.write(canrow + '\n');
	debug && debug(canrow);
}

run();