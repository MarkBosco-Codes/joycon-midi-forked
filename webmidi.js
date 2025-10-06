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
   console.log('SendMidi--' + bytes + ' ' + msg);
    //console.log('MIDI not connected');
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
    0,                      // Reset the control value to 0
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
    MIDI_CHANNEL,                 // Control number is now the MIDI_CHANNEL value
    Math.max(
      Math.min(Math.round(127 * readValue), MIDI_VELOCITY_MAX),
      MIDI_VELOCITY_MIN
    ),
  ];
};

const buttonCCToggleForControl = (control) => {
    
    return function(readValue) {
        if (readValue) { 
            
            // 1. Flip the state stored on the control object.
            this.isToggleOn = !this.isToggleOn;
            // 2. Determine the output value based on the new state.
            const outputValue = this.isToggleOn ? MIDI_VELOCITY_MAX : MIDI_VELOCITY_MIN;

            // 3. Return the new MIDI message array.
            //console.log(outputValue)
            return [
                MIDI_CC_CH_1,
                control, // Captured from the factory function
                outputValue,
            ];
        }
        // Return null for the 'release' event.
        return []; 
    };
};

// --- JOYSTICK LOGIC START ---

const JOYSTICK_CC_HORIZONTAL = 13; // Using CC 13 from original for horizontal
const JOYSTICK_CC_VERTICAL = 14; // Using CC 14 from original for vertical/absolute
const ABSOLUTE_DEADZONE = 0.10; // Magnitude threshold (0-1.66 normalized)

/**
 * Returns a function that converts analog stick readings (horizontal and vertical)
 * into one or two MIDI CC messages, applying scaling based on increments and mode.
 */
const analogCCForJoystick = (controlNumber) => {
  // The control object will store the last values for both H and V
  return function(readValues) {
    const { h, v } = readValues;

    // Calculate the scaling factor
    const scalingFactor = JOYSTICK_INCREMENTS / 12;

    if (JOYSTICK_MODE === '2-axis') {
      // 2-axis: Treat H (CC 13) and V (CC 14) separately.
      // 'h' is between 0 and 1. 'v' is between 0 and 1.
      const hValue = Math.round(127 * h * scalingFactor);
      const vValue = Math.round(127 * v * scalingFactor);

      const messages = [];
      
      // Horizontal message
      messages.push([
        MIDI_CC_CH_1,
        JOYSTICK_CC_HORIZONTAL,
        Math.max(MIDI_VELOCITY_MIN, Math.min(hValue, MIDI_VELOCITY_MAX)),
      ]);
      
      // Vertical message
      messages.push([
        MIDI_CC_CH_1,
        JOYSTICK_CC_VERTICAL,
        Math.max(MIDI_VELOCITY_MIN, Math.min(vValue, MIDI_VELOCITY_MAX)),
      ]);

      return messages;

    } else if (JOYSTICK_MODE === 'absolute-offset') {

      // We use the original packet values for the most accurate magnitude calculation.
      const packet = window.lastPacket; // Access the last stored packet
      
      if (!packet || !packet.analogStickLeft) return [];

      const stickH = packet.analogStickLeft.horizontal;
      const stickV = packet.analogStickLeft.vertical;
      
      // Use the symmetrical MAX_DEVIATION for magnitude normalization.
      const MAX_DEVIATION = window.JOYSTICK_MAX_DEVIATION || 1.38; // Fallback to 1.38
      
      // MAX_MAGNITUDE is the hypotenuse of the largest square inscribed in the circle.
      // MAX_MAGNITUDE = sqrt(MAX_DEVIATION^2 + MAX_DEVIATION^2)
      const MAX_MAGNITUDE = Math.sqrt(MAX_DEVIATION * MAX_DEVIATION * 2);
      
      const magnitude = Math.sqrt(stickH * stickH + stickV * stickV);
      
      // Normalize the magnitude to 0-1
      let normalizedMagnitude = Math.min(magnitude / MAX_MAGNITUDE, 1.0);
      
      // Deadzone: Force output to 0 if magnitude is too small
      if (normalizedMagnitude < ABSOLUTE_DEADZONE) {
        normalizedMagnitude = 0;
      }

      const ccValue = Math.round(127 * normalizedMagnitude * scalingFactor);

      return [
        MIDI_CC_CH_1,
        JOYSTICK_CC_VERTICAL, // Use CC 14 for the absolute offset output
        Math.max(MIDI_VELOCITY_MIN, Math.min(ccValue, MIDI_VELOCITY_MAX)),
      ];
    }
    return [];
  };
};


// The read_value function for the new combined joystick control
const readJoystickValues = (packet) => {
  const hmin_initial = -0.7;
  const hmax_initial = 0.9;
  const vmin_initial = -0.7; 
  const vmax_initial = 0.9;
  
  // Find the largest absolute deviation from center (0)
  const MAX_DEVIATION = Math.max(
    Math.abs(hmin_initial), 
    Math.abs(hmax_initial), 
    Math.abs(vmin_initial), 
    Math.abs(vmax_initial)
  );

  // Use the new symmetrical range
  const LIMIT_MIN = -MAX_DEVIATION; // -0.7
  const LIMIT_MAX = MAX_DEVIATION; // 0.9
  const RANGE = LIMIT_MAX - LIMIT_MIN; // 1.6
  
  // Store the MAX_DEVIATION on the window object for use in analogCCForJoystick
  window.JOYSTICK_MAX_DEVIATION = MAX_DEVIATION; 

  // Horizontal (0-1)
  const h_raw = Number(packet.analogStickLeft.horizontal);
  const h = (
    (Math.max(LIMIT_MIN, Math.min(h_raw, LIMIT_MAX)) - LIMIT_MIN) / RANGE
  );

  // Vertical (0-1)
  const v_raw = Number(packet.analogStickLeft.vertical);
  const v = (
    (Math.max(LIMIT_MIN, Math.min(v_raw, LIMIT_MAX)) - LIMIT_MIN) / RANGE
  );
  
  return { h, v };
};


const leftControls = [
  // Define buttons first since they're latency critical and the updates are
  // rarer.
  {
    name: 'down-button',
    read_value: (packet) => packet.buttonStatus.down,
    generate_midi: buttonCCForControl(0x24),
  },
  {
    name: 'right-button',
    read_value: (packet) => packet.buttonStatus.right,
    generate_midi: buttonCCForControl(0x25),
  },
  {
    name: 'up-button',
    read_value: (packet) => packet.buttonStatus.up,
    isToggleOn:false,
    generate_midi: buttonCCToggleForControl(0x26),
  },
  {
    name: 'left-button',
    read_value: (packet) => packet.buttonStatus.left,
    isToggleOn:false,
    generate_midi: buttonCCToggleForControl(0x27),
  },
  {
    name: 'l-button',
    read_value: (packet) => packet.buttonStatus.l,
    generate_midi: buttonCCForControl(0x28),
  },
  {
    name: 'zl-button',
    read_value: (packet) => packet.buttonStatus.zl,
    generate_midi: buttonCCForControl(0x29),
  },
  {
    name: 'capture-button-as-note',
    read_value: (packet) => packet.buttonStatus.capture,
    isToggleOn:false,
    generate_midi: buttonCCToggleForControl(0x2a),
  },
  {
    name: 'minus-button-as-note',
    read_value: (packet) => packet.buttonStatus.minus,
    isToggleOn:false,
    generate_midi: buttonCCToggleForControl(0x2b),
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

  // --- NEW ANALOG JOYSTICK CONTROL ---
  {
    name: 'l-analog-joystick',
    read_value: readJoystickValues, // Returns { h, v }
    generate_midi: analogCCForJoystick(),
    // We will use a lower threshold for 2-axis mode to detect small movements.
    // For absolute-offset, the deadzone is handled inside analogCCForJoystick.
    threshold: 0.02, 
    last_value: {h: 0, v: 0}, // Initialize as an object for comparison
  },

];

// unused (original analog stick entries removed)

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

  let shouldUpdate = false;
  
  if (control.name === 'l-analog-joystick') {
    // Custom logic for the joystick object {h, v}
    const hDiff = Math.abs(newValue.h - control.last_value.h);
    const vDiff = Math.abs(newValue.v - control.last_value.v);
    
    if (JOYSTICK_MODE === '2-axis') {
      // In 2-axis, check if either axis exceeds the threshold
      if (hDiff > control.threshold || vDiff > control.threshold) {
        shouldUpdate = true;
      }
    } else if (JOYSTICK_MODE === 'absolute-offset') {
      // In absolute-offset, only consider the vertical axis change for the threshold
      // which represents the magnitude.
      const magnitude = Math.sqrt(newValue.h * newValue.h + newValue.v * newValue.v);
      const lastMagnitude = Math.sqrt(control.last_value.h * control.last_value.h + control.last_value.v * control.last_value.v);
      
      // Use the deadzone as the threshold when mode is absolute-offset
      if (Math.abs(magnitude - lastMagnitude) > control.threshold) {
        shouldUpdate = true;
      } else if (magnitude < ABSOLUTE_DEADZONE && lastMagnitude >= ABSOLUTE_DEADZONE) {
        // Ensure a final update to 0 if we just entered the deadzone
        shouldUpdate = true;
      }
    }
  } else if (typeof newValue === 'object' && newValue !== null) {
    // Fallback for any other control that might return an object
    const hDiff = Math.abs(newValue.h - control.last_value.h);
    const vDiff = Math.abs(newValue.v - control.last_value.v);
    if (hDiff > control.threshold || vDiff > control.threshold) {
      shouldUpdate = true;
    }
  } else if (Math.abs(newValue - control.last_value) > control.threshold) {
    // Original logic for single number values
    shouldUpdate = true;
  }

  if (shouldUpdate) {
    const msg = control.generate_midi(newValue);

    if (Array.isArray(msg) && msg.every(Array.isArray)) {
      // If multiple messages are returned (e.g., 2-axis mode)
      msg.forEach(m => sendMidi(m, control.name));
    } else if (msg.length > 0) {
      // If a single message is returned
      sendMidi(msg, control.name);
      //console.log('SendMidi--' + control.name + ' ' + msg);
    }
    control.last_value = newValue;
  }
};

// Original analogStickActive function removed as it's no longer used.


var MIDI_CHANNEL = 88
var BEND_MIN = -35
var BEND_MAX = 70
var DIVISIONS = 12
var GYRO_AXIS = 'beta'
var JOYSTICK_INCREMENTS = 12 // NEW
var JOYSTICK_MODE = '2-axis' // NEW

const axisInput = document.getElementById('gyro-axis');
const midiChannelInput = document.getElementById('midi-channel');
const minAngleInput = document.getElementById('min-angle');
const maxAngleInput = document.getElementById('max-angle');
const divisionsInput = document.getElementById('divisions');

// NEW JOYSTICK INPUTS
const joystickIncrementsInput = document.getElementById('joystick-increments');
const joystickModeInput = document.getElementById('joystick-mode');


midiChannelInput.value = MIDI_CHANNEL;
minAngleInput.value = BEND_MIN;
maxAngleInput.value = BEND_MAX;
divisionsInput.value = DIVISIONS;
axisInput.value=GYRO_AXIS
joystickIncrementsInput.value = JOYSTICK_INCREMENTS; // Set initial value
joystickModeInput.value = JOYSTICK_MODE; // Set initial value


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

// NEW JOYSTICK EVENT LISTENERS
joystickIncrementsInput.addEventListener('change', function() {
  JOYSTICK_INCREMENTS = parseInt(this.value);
  if (isNaN(JOYSTICK_INCREMENTS) || JOYSTICK_INCREMENTS < 1 || JOYSTICK_INCREMENTS > 12) {
    JOYSTICK_INCREMENTS = 12; // Default to 12 if invalid
    this.value = 12;
  }
  console.log('JOYSTICK_INCREMENTS updated:', JOYSTICK_INCREMENTS);
});

joystickModeInput.addEventListener('change', function() {
  JOYSTICK_MODE = this.value;
  console.log('JOYSTICK_MODE updated:', JOYSTICK_MODE);
});


var tiltReading = {
  name: 'l-orientation.beta',
  // read_value: (packet) =>
  //   (Number(packet.actualOrientation.gamma) + 90.0) / 180.0, // between  0 and 1
  read_value: (packet) =>
    (Math.max(0, Number(packet.actualOrientation[GYRO_AXIS])-BEND_MIN) / (BEND_MAX-BEND_MIN))*(DIVISIONS/12), // between  0 and 1
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
  window.lastPacket = packet; // Update global packet for access in analogCCForJoystick
  if (joyCon instanceof JoyConLeft) {
    if (MODE == 'gyro'){
      //if (analogStickActive(packet)) { // Removed unused function

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


    for (const control of leftControls) {
      updateControl(control, packet);
    }
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
    // Note: These IDs are for the LEFT controller in the debug section.
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