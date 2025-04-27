import { connectJoyCon, connectedJoyCons, JoyConLeft } from './index.js';

const connectButton = document.querySelector('#connect-joy-cons');
const connectMidiButton = document.querySelector('#connect-midi');
const connectMidiLabel = document.querySelector('#connect-midi-label');
const debugLeft = document.querySelector('#debug-left');
const debugRight = document.querySelector('#debug-right');
const showVisualize = document.querySelector('#show-visualize');
const showDebug = document.querySelector('#show-debug');
const rootStyle = document.documentElement.style;

connectButton.addEventListener('click', connectJoyCon);

let midiout = null;

const onMIDISuccess = (midiAccess) => {
  const outputs = midiAccess.outputs;
  for (const o of outputs.values()) {
    midiout = o;
    console.log(o);
    connectMidiLabel.textContent = 'Connected to ' + o.name;
    return;
  }
  connectMidiLabel.textContent = 'No MIDI receivers found!';
};

const onMIDIFailure = () => {
  connectMidiLabel.textContent = 'Permission denied by browser';
};

const connectMidi = () => {
  if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);
    return;
  } else {
    connectMidiLabel.textContent = 'MIDI unsupported by browser';
  }
};

connectMidiButton.addEventListener('click', connectMidi);

const sendMidi = (bytes, msg = '') => {
  if (midiout) {
    //console.log('SendMidi--' + bytes + ' ' + msg);
    midiout.send(bytes);
  } else {
    console.log('MIDI not connected');
  }
};

const MIDI_NOTE_ON_CH_1 = 0x90;
const MIDI_NOTE_OFF_CH_1 = 0x80;
const MIDI_VELOCITY_MAX = 0x7f;
const MIDI_VELOCITY_MIN = 0;
const MIDI_CC_CH_1 = 0xb0;

// Returns a function that converts a boolean value to a note-on or note-off
// message.
const noteOnOff = (note) => {
  return (readValue) => [
    readValue ? MIDI_NOTE_ON_CH_1 : MIDI_NOTE_OFF_CH_1,
    note,
    MIDI_VELOCITY_MAX,
  ];
};

// Returns a function that converts a boolean value to a CC message.
const buttonCCForControl = (control) => {
  return (readValue) => [
    MIDI_CC_CH_1,
    control,
    readValue ? MIDI_VELOCITY_MAX : MIDI_VELOCITY_MIN,
  ];
};

const resetControlValueForChannel = (channel) => {
  return [
    MIDI_CC_CH_1, 
    channel,       
    0,                      // Reset the control value to 0
  ];
};


// Returns a function that convents a float in the range 0-1 to a CC message.
const analogCCForControl = (control) => {
  return (readValue) => [
    MIDI_CC_CH_1,
    control,
    Math.max(
      Math.min(Math.round(127 * readValue), MIDI_VELOCITY_MAX),
      MIDI_VELOCITY_MIN
    ),
  ];
};



const analogCCForControl2 = () => {
  return (readValue) => [
    MIDI_CC_CH_1,
    MIDI_CHANNEL,                 // Control number is now the MIDI_CHANNEL value
    Math.max(
      Math.min(Math.round(127 * readValue), MIDI_VELOCITY_MAX),
      MIDI_VELOCITY_MIN
    ),
  ];
};

const leftControls = [
  // Define buttons first since they're latency critical and the updates are
  // rarer.
  {
    name: 'down-button',
    read_value: (packet) => packet.buttonStatus.down,
    generate_midi: noteOnOff(0x24),
  },
  {
    name: 'right-button',
    read_value: (packet) => packet.buttonStatus.right,
    generate_midi: noteOnOff(0x25),
  },
  {
    name: 'up-button',
    read_value: (packet) => packet.buttonStatus.up,
    generate_midi: noteOnOff(0x26),
  },
  {
    name: 'left-button',
    read_value: (packet) => packet.buttonStatus.left,
    generate_midi: noteOnOff(0x27),
  },
  {
    name: 'l-button',
    read_value: (packet) => packet.buttonStatus.l,
    generate_midi: noteOnOff(0x28),
  },
  {
    name: 'zl-button',
    read_value: (packet) => packet.buttonStatus.zl,
    generate_midi: noteOnOff(0x29),
  },
  {
    name: 'capture-button-as-note',
    read_value: (packet) => packet.buttonStatus.capture,
    generate_midi: noteOnOff(0x2a),
  },
  {
    name: 'minus-button-as-note',
    read_value: (packet) => packet.buttonStatus.minus,
    generate_midi: noteOnOff(0x2b),
  },

  // Control (CC) buttons
  {
    name: 'minus-button-as-cc',
    read_value: (packet) => packet.buttonStatus.minus,
    generate_midi: buttonCCForControl(0x01),
  },
  {
    name: 'capture-button-as-cc',
    read_value: (packet) => packet.buttonStatus.capture,
    generate_midi: buttonCCForControl(0x02),
  },
  {
    name: 'l-sl-button',
    read_value: (packet) => packet.buttonStatus.sl,
    generate_midi: buttonCCForControl(0x03),
  },
  {
    name: 'l-sr-button',
    read_value: (packet) => packet.buttonStatus.sr,
    generate_midi: buttonCCForControl(0x04),
  },
  {
    name: 'l-stick',
    read_value: (packet) => packet.buttonStatus.leftStick,
    generate_midi: buttonCCForControl(0x05),
  },

  // Analog controls (CC)
  {
    name: 'l-orientation.beta',
    read_value: (packet) =>
      (Number(packet.actualOrientation.beta) + 90.0) / 180.0,
    generate_midi: analogCCForControl(0x0b),
    threshold: 3 / 180.0,
  },
  {
    name: 'l-orientation.gamma',
    read_value: (packet) =>
      (Number(packet.actualOrientation.gamma) + 90.0) / 180.0,
    generate_midi: analogCCForControl(0x0c),
    threshold: 3 / 180.0,
  },
  {
    name: 'l-analog-horizontal',
    read_value: (packet) => {
      const hmin = -1.2;
      const hmax = 1.4;
      return (
        (Math.max(
          hmin,
          Math.min(Number(packet.analogStickLeft.horizontal), hmax)
        ) -
          hmin) /
        (hmax - hmin)
      );
    },
    generate_midi: analogCCForControl(0x0d),
    threshold: 0.02,
  },
  {
    name: 'l-analog-vertical',
    read_value: (packet) => {
      const vmin = -0.7;
      const vmax = 0.9;
      return (
        (Math.max(
          vmin,
          Math.min(Number(packet.analogStickLeft.vertical), vmax)
        ) -
          vmin) /
        (vmax - vmin)
      );
    },
    generate_midi: analogCCForControl(0x0e),
    threshold: 0.02,
  },
];

// unused

const updateControl = (control, packet, side) => {
  window.lastPacket = packet;
  if (control.threshold === undefined) {
    control.threshold = 0;
  }
  if (control.last_value === undefined) {
    if (control.init_value === undefined) {
      control.init_value = 0;
    }
    control.last_value = control.init_value;
  }
  const newValue = control.read_value(packet);
  if (Math.abs(newValue - control.last_value) > control.threshold) {
    const msg = control.generate_midi(newValue);
    if (msg !== undefined) {
      sendMidi(msg, control.name);
      //console.log('SendMidi--' + control.name + ' ' + msg);
    }
    control.last_value = newValue;
  }
};
function analogStickActive(packet) {
  if (!packet || !packet.analogStickLeft) {
    return false; // Packet or analogStickLeft is missing
  }

  const horizontal = packet.analogStickLeft.horizontal;
  const vertical = packet.analogStickLeft.vertical;

  if (Math.abs(horizontal) > 0.2 || Math.abs(vertical) > 0.2) {
    return true; // Either horizontal or vertical absolute value is greater than 0.2
  } else {
    return false; // Neither horizontal nor vertical absolute value is greater than 0.2
  }
}


var MIDI_CHANNEL = 12
var BEND_MIN = -35
var BEND_MAX = 70
var DIVISIONS = 12
var GYRO_AXIS = 'beta'

const axisInput = document.getElementById('gyro-axis');
const midiChannelInput = document.getElementById('midi-channel');
const minAngleInput = document.getElementById('min-angle');
const maxAngleInput = document.getElementById('max-angle');
const divisionsInput = document.getElementById('divisions');

midiChannelInput.value = MIDI_CHANNEL;
minAngleInput.value = BEND_MIN;
maxAngleInput.value = BEND_MAX;
divisionsInput.value = DIVISIONS;
axisInput.value=GYRO_AXIS


axisInput.addEventListener('change', function() {
  GYRO_AXIS = this.value;
});


midiChannelInput.addEventListener('change', function() {
  sendMidi(resetControlValueForChannel(MIDI_CHANNEL))
  MIDI_CHANNEL = parseInt(this.value);
});


minAngleInput.addEventListener('change', function() {
  BEND_MIN = parseInt(this.value);
  console.log('BEND_MIN updated:', BEND_MIN);
});

maxAngleInput.addEventListener('change', function() {
  BEND_MAX = parseInt(this.value);
  console.log('BEND_MAX updated:', BEND_MAX);
});


divisionsInput.addEventListener('change', function() {
  DIVISIONS = parseInt(this.value);
});


var tiltReading = {
  name: 'l-orientation.beta',
  // read_value: (packet) =>
  //   (Number(packet.actualOrientation.gamma) + 90.0) / 180.0, // between  0 and 1
  read_value: (packet) =>
    (Math.max(0, Number(packet.actualOrientation[GYRO_AXIS])-BEND_MIN) / (BEND_MAX-BEND_MIN))*(DIVISIONS/12), // between  0 and 1
  generate_midi: analogCCForControl2(MIDI_CHANNEL),
  threshold: 1 / 180.0,
};



var stickReading = {
  name: 'l-analog-horizontal',
  read_value: (packet) => {
    const hmin = -1.2;
    const hmax = 1.4;
    return (
      (Math.max(
        hmin,
        Math.min(Number(packet.analogStickLeft.horizontal), hmax)) 
        -hmin) 
        / (hmax - hmin)
    )*2-1;
  },
  generate_midi: analogCCForControl(0x0c),
  threshold: 0.05,
}


var MODE = 'gyro'


var CALIBRATING = false;
var CALIBRATE_ID = '';

export function calibrateInput(id){
  console.log('calibrating '+id)
  CALIBRATE_ID = id;
  CALIBRATING = true;
}
const Calibratebuttons = [
  { id: 'calibrate-min-angle', action: 'min-angle' },
  { id: 'calibrate-max-angle', action: 'max-angle' },
];

Calibratebuttons.forEach(({ id, action }) => {
  const button = document.getElementById(id);
  if (button) {
    button.addEventListener('click', () => calibrateInput(action));
  }
});


const updateBothControls = (joyCon, packet) => {
  if (!packet || !packet.actualOrientation) {
    return;
  }
  if (joyCon instanceof JoyConLeft) {
    // check if analog stick is active
    if (MODE == 'gyro'){
    //if (analogStickActive(packet)) {
      // packet.actualOrientation.gamma returns between -90 and 90
      //then send gamma orientation messages
    if (true){
      //console.log(tiltReading.read_value(packet))
      updateControl(tiltReading, packet);
      if (CALIBRATING) {
        const currentReading = Number(packet.actualOrientation[GYRO_AXIS])
        const inputField = document.getElementById(CALIBRATE_ID);
        inputField.value=currentReading;
        if (CALIBRATE_ID.includes('min')){
          BEND_MIN = currentReading

        }
        else{
          BEND_MAX=currentReading
        }
    
        CALIBRATING = false; // Reset calibrating flag after setting
        CALIBRATE_ID = ''
      }
    }
  }


  else if (MODE == 'stick'){
    console.log(stickReading.read_value(packet))
    updateControl(stickReading, packet);


  }

    // for (const control of leftControls) {
    //   updateControl(control, packet);
    // }
  }
};

const visualize = (joyCon, packet) => {
  if (!packet || !packet.actualOrientation) {
    return;
  }

  const {
    actualAccelerometer: accelerometer,
    buttonStatus: buttons,
    actualGyroscope: gyroscope,
    actualOrientation: orientation,
    actualOrientationQuaternion: orientationQuaternion,
  } = packet;

  if (showVisualize.checked) {
    document
    .querySelector('#visualise').style.display = "block" ;
    
    if (joyCon instanceof JoyConLeft) {
      rootStyle.setProperty('--left-alpha', `${orientation.alpha}deg`);
      rootStyle.setProperty('--left-beta', `${orientation.beta}deg`);
      rootStyle.setProperty('--left-gamma', `${orientation.gamma}deg`);
    } else {
      rootStyle.setProperty('--right-alpha', `${orientation.alpha}deg`);
      rootStyle.setProperty('--right-beta', `${orientation.beta}deg`);
      rootStyle.setProperty('--right-gamma', `${orientation.gamma}deg`);
    }

    if (joyCon instanceof JoyConLeft) {
      const joystick = packet.analogStickLeft;
      const joystickMultiplier = 10;
      document.querySelector('#joystick-left').style.transform = `translateX(${joystick.horizontal * joystickMultiplier
        }px) translateY(${joystick.vertical * joystickMultiplier}px)`;

      document.querySelector('#up').classList.toggle('highlight', buttons.up);
      document
        .querySelector('#down')
        .classList.toggle('highlight', buttons.down);
      document
        .querySelector('#left')
        .classList.toggle('highlight', buttons.left);
      document
        .querySelector('#right')
        .classList.toggle('highlight', buttons.right);
      document
        .querySelector('#capture')
        .classList.toggle('highlight', buttons.capture);
      document
        .querySelector('#l')
        .classList.toggle('highlight', buttons.l || buttons.zl);
      document
        .querySelector('#l')
        .classList.toggle('highlight', buttons.l || buttons.zl);
      document
        .querySelector('#minus')
        .classList.toggle('highlight', buttons.minus);
      document
        .querySelector('#joystick-left')
        .classList.toggle('highlight', buttons.leftStick);
    } else {
      const joystick = packet.analogStickRight;
      const joystickMultiplier = 10;
      document.querySelector('#joystick-right').style.transform = `translateX(${joystick.horizontal * joystickMultiplier
        }px) translateY(${joystick.vertical * joystickMultiplier}px)`;

      document.querySelector('#a').classList.toggle('highlight', buttons.a);
      document.querySelector('#b').classList.toggle('highlight', buttons.b);
      document.querySelector('#x').classList.toggle('highlight', buttons.x);
      document.querySelector('#y').classList.toggle('highlight', buttons.y);
      document
        .querySelector('#home')
        .classList.toggle('highlight', buttons.home);
      document
        .querySelector('#r')
        .classList.toggle('highlight', buttons.r || buttons.zr);
      document
        .querySelector('#r')
        .classList.toggle('highlight', buttons.r || buttons.zr);
      document
        .querySelector('#plus')
        .classList.toggle('highlight', buttons.plus);
      document
        .querySelector('#joystick-right')
        .classList.toggle('highlight', buttons.rightStick);
    }
  }
  else{
    document
    .querySelector('#visualise').style.display = "none" ;
  }

  if (showDebug.checked) {
    const controller = joyCon instanceof JoyConLeft ? debugLeft : debugRight;
    controller.querySelector('pre').textContent =
      JSON.stringify(orientation, null, 2) +
      '\n' +
      JSON.stringify(orientationQuaternion, null, 2) +
      '\n' +
      JSON.stringify(gyroscope, null, 2) +
      '\n' +
      JSON.stringify(accelerometer, null, 2) +
      '\n';
    const meterMultiplier = 300;
    controller.querySelector('#acc-x').value =
      accelerometer.x * meterMultiplier;
    controller.querySelector('#acc-y').value =
      accelerometer.y * meterMultiplier;
    controller.querySelector('#acc-z').value =
      accelerometer.z * meterMultiplier;

    const gyroscopeMultiplier = 300;
    controller.querySelector('#gyr-x').value =
      gyroscope.rps.x * gyroscopeMultiplier;
    controller.querySelector('#gyr-y').value =
      gyroscope.rps.y * gyroscopeMultiplier;
    controller.querySelector('#gyr-z').value =
      gyroscope.rps.z * gyroscopeMultiplier;
  }
};

// Joy-Cons may sleep until touched, so attach the listener dynamically.
setInterval(async () => {
  for (const joyCon of connectedJoyCons.values()) {
    if (joyCon.eventListenerAttached) {
      continue;
    }
    joyCon.eventListenerAttached = true;
    await joyCon.disableVibration();
    joyCon.addEventListener('hidinput', (event) => {
      updateBothControls(joyCon, event.detail);
      visualize(joyCon, event.detail);
    });
  }
}, 2000);

showDebug.addEventListener('input', (e) => {
  document.querySelector('#debug').style.display = e.target.checked
    ? 'flex'
    : 'none';
});

connectMidi();
