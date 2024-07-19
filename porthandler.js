'use strict'

const TRIGGER_LEN = 50
const DEFAULT_VELOCITY = 100

// Split an array into two arrays according to a predicate 
// (a -> bool) -> [a] -> ([a], [a])
function partition(pred, arr) {
  const t = [], f = []
  arr.forEach(elt => {
    if (pred(elt)) {
      t.push(elt)
    } else {
      f.push(elt)
    }
  })

  return [t, f]
}

/// Determine if a parameter is a button  
/// @param {object[]} descriptors  
/// @param {string} address
/// @return {boolean}
function isButton(descriptor) {
  return descriptor.type === 'button'
}

function isMidi(descriptor) {
  if (descriptor.meta) {
    return descriptor.meta?.some(option => !!option.midi)
  }

  return descriptor.label in ['freq', 'gate', 'gain']
}


/// Get the 'name' portion of a dsp address, I.E. '/dsp/:name'
/// @param {string} address
/// @return {string}
function paramName(address) {
  return address.substring(address.lastIndexOf('/') + 1);
}

class Control {
  constructor(descriptor, context) {
    this.context = context // 'op' context needed for creating a port, setting error messages

    this.address = descriptor.address
    this.label = descriptor.label
    this.isButton = descriptor.type === 'button'

    this.initialize()
  }

  /// Create a port for the given parameter
  /// @param {AudioNode} node 
  initialize() {
    console.log(`Initializing node: ${this.address}`)
    this.port = this.isButton ? this.context.inTrigger(this.label) : this.context.inFloat(this.label);
  }

  /// add a callback to port that sets the appropriate param
  ///
  /// @param {AudioNode} node 
  /// @param {CablesPort} port 
  addCallback(node) {
    // The callback field for Cables trigger ports is "onTriggered", 
    // "onChange" for every other type
    this.port[this.isButton ? 'onTriggered' : 'onChange'] =
      // If this parameter is a Faust button param then we need to create a callback 
      // that acts as a trigger, an on-off with no sustain otherwise we may simply set 
      // the parameter's value to the value the input port is receiving
      this.isButton ? () => {
        if (!node) return
        node.setParamValue(this.address, 1)
        setTimeout(() => node.setParamValue(this.address, 0), TRIGGER_LEN)
      } : () => {
        if (!node) return
        node.setParamValue(this.address, this.value)
      }
  }

  // Remove the port from the operator
  disconnect() {
    if (this.port)
      this.port.remove()
  }

  // Get the current value of this parameter's input port 
  get value() {
    return this.port.get()
  }
}

class Midi {
  constructor(context) {
    this.context = context
    this.port = context.op.inObject("Midi")
  }

  update(node) {
    this.port.onChange = () => {
      if (!node) return
      const event = this.port.get()
      if (!event) return
      const data = Object.values(event.data)
      node.midiMessage(data)
    }
  }
}

class Audio {
  constructor(node, index, context) {
    this.index = index
    this.context = context
    this.port = this.context.inObject(`Audio ${this.index}`)
    this.addCallback(node)
  }

  /// attach a callback that updates audio connections to the node
  /// @param {AudioNode} node
  /// @param {Number} idx
  /// @param {CablesPort} audioPort
  addCallback(node) {
    this.port.onChange = () => {
      if (!node) return

      const input = this.port.get()
      if (input == this.currentInput) return
      else {
        const input = this.port.get()
        if (!input) return;

        if (!(input instanceof AudioNode)) {
          op.setUiError("FaustError", "Audio input is not an audio node: signals connected to audio input must be a WebAudio or Faust node")
        }

        try {
          input.connect(node)
          this.currentInput = input
        } catch (err) {
          console.error(err)
          this.context.setUiError("FaustError", `Cannot connect audio input ${this.index} to node: ${err}`)
        }
      }
    }
  }

  // Potentially just run this.port.onChange instead?
  update(node) {
    const input = this.port.get()
    if (!input || input == this.currentInput) return
    input.connect(node)
    this.currentInput = input
  }

  disconnect() {
    this.port.remove();
  }
}

export class PortHandler {
  constructor(context) {
    // parameter 'address' -> input port mapping
    this.control = {}
    // audio input ports
    this.audio = []
    // Midi event port 
    this.midi = context.voiceMode == context.Voicing.Poly ? new Midi(context) : null

    // share global context w/ main script
    this.context = context
  }

  /// Initialize or update input ports for control-rate parameters
  /// @param {WebAudioNode} node
  /// @return {void}
  updateControl(node, descriptors) {
    // Remove ports attached to params that do not exist on current node
    this.removeUnusedControl(descriptors)

    for (const descriptor of descriptors) {
      const address = descriptor.address
      // If this is a new parameter then we need to create a control object
      this.control[address] = this.control[address] ?? new Control(descriptor, this.context.op)
      // Add a new callback that holds a reference to the current WebAudio node
      this.control[address].addCallback(node)
    }
  }

  /// Initialize audio input ports 
  /// @param {WebAudioNode} node
  updateAudio(node) {
    if (!node) return;

    const numInputs = node.getNumInputs()
    if (numInputs === 0) return

    console.log(`NUMBER OF AUDIO INPUTS: ${numInputs}`)
    console.log("PortHandler audio before audio update: ")
    console.log(this.audio)

    for (let i = 0; i < numInputs; ++i) {
      if (this.audio[i]) {
        if (i < numInputs) {
          console.log(`Audio in ${i} exists, updating`)
          this.audio[i].addCallback(node)
          // Reconnect to current audio in
          this.audio[i].update(node)
        }
        else {
          this.audio[i].disconnect()
          delete this.audio[i]
        }
      } else {
        console.log(`Audio ${i} does not exist, initializing. \nCurrent entry:`)
        console.log(this.audio[i])

        this.audio[i] = new Audio(node, i, this.context.op)
      }
    }

    console.log("PortHandler audio after update: ")
    console.log(this.audio)
  }

  updateMidi(node) {
    // If we initialized the operator as monophonic then `this.midi` will be null
    if (!this.midi) {
      this.midi = new Midi(this.context)
    }

    // Add a new MIDI callback that holds a reference to the current WebAudio node 
    // to this.midi
    this.midi.update(node)
  }

  partitionMidi(descriptors) {
    const [poly, rest] = partition(isMidi, descriptors)
    if (poly.length === 0)
      throw new Error(`Polyphonic scripts must have the following params:\n
            freq -> accepts MIDI notes 0-127\n
            gate -> accepts triggers\n
            for more information see: github.com/FayCarsons/Cables-Faust-Plugin\n 
            and the Faust MIDI documentation: faustdoc.grame.fr/manual/midi/
          `)
    return [poly, rest]
  }

  update(node, ctx) {
    this.context = ctx

    let descriptors = node.getDescriptors();

    if (ctx.voiceMode == ctx.Voicing.Poly) {
      // ignore midi parameters, they will be controlled by the midi port
      const [_, nonMidiParams] = this.partitionMidi(node)
      this.updateMidi(node)
      descriptors = nonMidiParams
    }

    this.updateControl(node, descriptors)
    this.updateAudio(node)
  }

  /// Remove control ports not used by current Faust script
  /// @param {string[]} addresses - current params
  removeUnusedControl(descriptors) {
    const addresses = descriptors.map(descriptor => descriptor.address)
    for (const [address, port] of Object.entries(this.control)) {
      if (!addresses.includes(address)) {
        console.log(`Removing port \`${address}\``)
        port.disconnect()
        delete this.control[address];
      }
    }
  }

  // For debugging, removes all input ports
  clearPorts() {
    console.log("CLEARING PORTHANDLER")
    for (const [addr, port] of Object.entries(this.control)) {
      port.diisconnect()
      delete this.control[addr]
    }
    for (const i in this.audio) {
      this.audio[i].disconnect()
      delete this.audio[i]
    }
  }

}

export default { PortHandler }
