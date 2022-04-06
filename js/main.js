// DOM elements
const ppgPlotDiv = document.getElementById('ppgPlotDiv')
const stressGaugeDiv = document.getElementById('stressGaugeDiv');
const heartpyMeasureDiv = document.getElementById('heartpyMeasureDiv');
const sampleRateSpan = document.getElementById('sampleRateSpan')
const frameRateSpan = document.getElementById('frameRateSpan')

/// BLE things, mainly for debug
var device, server, service, magnetoCharacteristic, accelCharacteristic, battService, battCharacteristic
/// to display the actual sample rate
var sampleCnt = 0, acceleroSampleCnt = 0, frameCnt = 0
/// x, y, z coordinates sent to Plotly at
var xq = [], yq = [], zq = []
var axq = [], ayq = [], azq = []
var heartlog = [];
var requesst_id = String(Math.floor(Math.random()*Date.now()))
/// push the data to the temp arrays
function gotMagnetoData(evt) {
    var raw = evt.target.value
    var magData = new Uint8Array(raw.buffer)
    sampleCnt++
    for (let ix = 0; ix < magData.length; ix++) {
        xq.push(magData[ix]);
        heartlog.push([Date.now(), magData[ix]]);
    }
    //Push Data to Backend Service
    let request = new XMLHttpRequest();
    request.open("POST", "http://localhost:8000/data", true);
    request.setRequestHeader("Content-Type", "application/json");
    request.send(JSON.stringify({
                "request_id": requesst_id,
                "data": Array.from(magData),
        }));
    //yq.push(magData[1])
    //zq.push(magData[2])

}

/// the function executing at requestAnimationFrame.
/// otherwise 80Hz update rate would lock up my browser (I guess depends on screen refresh rate)
function step() {
    frameCnt++
    if (xq.length) {
        Plotly.extendTraces(
            ppgPlotDiv,
            {
                y: [xq],
            },
            [0], 1000
        );
        xq.length = 0;
        yq.length = 0;
        zq.length = 0;
    }
    window.requestAnimationFrame(step)
}

function setSampleRate(rateInHz) {
    magnetoCharacteristic && magnetoCharacteristic.writeValue && magnetoCharacteristic.writeValue(new Int8Array([rateInHz]))
}

function disconnect() {
    server = server && server.disconnect()
    device = undefined
    server = undefined
    service = undefined
    magnetoCharacteristic = undefined
    accelCharacteristic = undefined
    battService = undefined
    battCharacteristic = undefined
    axq.join(";")
}
function sendData(){
    const queryString = window.location.search;
    console.log(queryString);
    const urlParams = new URLSearchParams(queryString);
    let send_id = undefined;
    if (urlParams.has('id')){
        send_id = urlParams.get('id');
    }
    else {
        send_id = String(Math.floor(Math.random()*Date.now()));
    }
    console.log(send_id);
    var request = new XMLHttpRequest();
    request.open("POST", "https://lstsim.ailab.rocks/bangle_data");
    request.setRequestHeader("Content-Type", "application/json");
    request.send(JSON.stringify({
        "id": send_id,
        "data": heartlog,
        }));
}
function download() {
    let csvContent = "data:text/csv;charset=utf-8,";
    let rows = []
    console.log(heartlog.length);
    for (let ix = 0; ix < heartlog.length; ix++) {
        rows.push(String(heartlog[ix].join(",")))
    }
    console.log(rows);
    csvContent += rows.join("\r\n");
    var encodedUri = encodeURI(csvContent);
    window.open(encodedUri);
}

/// Connect to the Puck
function doIt() {
    disconnect();

    navigator.bluetooth.requestDevice({ optionalServices: ['f8b23a4d-89ad-4220-8c9f-d81756009f0c', 0x2A19], acceptAllDevices: true })
        .then(d => {
            device = d;
            console.debug('device:', device)
            return device.gatt.connect()
        })
        .then(s => {
            server = s
            console.debug('server:', server)
            // get magnetometer service & characteristic:
            s.getPrimaryService('f8b23a4d-89ad-4220-8c9f-d81756009f0c')
                .then(srv => {
                    service = srv
                    console.debug('service:', service)
                    return service.getCharacteristics()
                })
                .then(chs => {
                    console.log('characteristics:', chs)
                    for (let ix = 0; ix < chs.length; ix++) {
                        const ch = chs[ix];
                        if (ch.uuid == 'f8b23a4d-89ad-4220-8c9f-d81756009f0c') {
                            // Puck or Bangle magnetometer
                            magnetoCharacteristic = ch
                            ch.addEventListener('characteristicvaluechanged', gotMagnetoData)
                            ch.startNotifications()
                        }
                    }
                })
        })
}

/// Create the initial graph & clear it
function clearIt() {
    Plotly.newPlot(ppgPlotDiv, [{
        y: [],
        type: 'scattergl',
        mode: 'lines',
        line: { color: '#f00' },
        name: 'x'
    }, {
        y: [],
        type: 'scattergl',
        mode: 'lines',
        line: { color: '#0f0' },
        name: 'y'
    }, {
        y: [],
        type: 'scattergl',
        mode: 'lines',
        line: { color: '#00f' },
        name: 'z'
    }], {   xaxis: {range: [0, 1000]}, title: 'PPG value'});
    Plotly.newPlot(stressGaugeDiv, [{
      domain: { x: [0, 1], y: [0, 1] },
      value: 47,
      title: { text: "Stress Index" },
      type: "indicator",
      mode: "gauge+number",
      gauge: {
        axis: { range: [null, 100] },
        bar: { color: "black", thickness: 0.2 },
        steps: [
          { range: [0, 20], color: "green" },
          { range: [20, 70], color: "yellow" },
          { range: [70, 100], color: "red" }
        ],
      }
    }],
      {height: 300,  margin: { t: 0, b: 0 } }
    );
    Plotly.newPlot(heartpyMeasureDiv, [
      {
        type: "indicator",
        mode: "number",
        value: 0,
        title: {
          text: "Frame Rate"
        },
        domain: { x: [0, 0.5], y: [0, 0.2] },
      },
      {
        type: "indicator",
        mode: "number",
        value: 0,
        title: {
          text: "Sample Rate"
        },
        domain: { x: [0.5, 1], y: [0, 0.2] }
      },
      {
        type: "indicator",
        mode: "number",
        value: 0,
        title: {
          text: "Heart Rate"
        },
        domain: { x: [0, 0.3], y: [0.5, 1] }
      },
      {
        type: "indicator",
        mode: "number",
        value: 0,
        title: {
          text: "pNN 20"
        },
        domain: { x: [0.3, 0.6], y: [0.5, 1] }
      },
      {
        type: "indicator",
        mode: "number",
        value: 0,
        title: {
          text: "Breathing Rate"
        },
        domain: { x: [0.6, 1], y: [0.5, 1] }
      }
    ], {height: 300, margin: { t: 25, r: 25, l: 25, b: 25 }}
    );
}

// the actual initialization
setInterval(() => {
  Plotly.update(heartpyMeasureDiv, {value: frameCnt}, {}, [0]);
  Plotly.update(heartpyMeasureDiv, {value: sampleCnt*10}, {}, [1])
  fetch('http://localhost:8000/data/' + requesst_id).then(function(response) {
    return response.json();
  }).then(function(data) {
    console.log(data);
    Plotly.update(heartpyMeasureDiv, {value: data.heartrate}, {}, [2]);
    Plotly.update(heartpyMeasureDiv, {value: data.pnn20}, {}, [3]);
    Plotly.update(heartpyMeasureDiv, {value: data.breathingrate}, {}, [4]);

  }).catch(function() {
    console.log("Booo");
  });
  sampleCnt = 0;
  frameCnt = 0;
}, 1000)
window.requestAnimationFrame(step)

// first: initialize the main plot
clearIt()
// second plot for battery level
