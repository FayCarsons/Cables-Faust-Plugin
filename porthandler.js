'use strict'

const TRIGGER_LEN = 20

// Split an array into two arrays according to a predicate 
// (a -> bool) -> [a] -> ([a], [a])
function partition(pred, arr) {
  const t = [], f = []
  for (const idx in arr) {
    if (pred(arr[idx])) {
      t.push(arr[idx])
    } else {
      f.push(arr[idx])
    }
  }

  return [t, f]
}

// Faust script has `declare option "[midi:on]";`?
function hasMidi(node) {
  const metadata = node.getMeta().meta
  // Options is generally near the end of the metadata array, so start from there
  if (metadata)
    for (let i = metadata.length - 1; i > 0; --i) {
      const options = metadata[i].options
      if (options) {
        return options.trim().includes("[midi:on]")
      }
    }

  return false
}

// Parameter is controlled by midi?
// If we are in poly mode then we need to always count 'freq' 'gate' and 'gain'
// as MIDI params, otherwise only those specifically label as midi
function isMidi(descriptor, isPoly = false) {
  console.log("DESCRIPTOR IN 'isMidi':")
  console.log(descriptor)
  if (descriptor.meta) {
    return descriptor.meta?.some(option => !!option.midi) || false
  }

  return isPoly && ['freq', 'gate', 'gain'].includes(descriptor.label)
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
    console.log(`Initializing port: ${this.address}`)
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

// Audio input singleton
class Audio {
  constructor(node, context) {
    this.context = context // Cables 'op' object
    this.port = this.context.inObject(`Audio In`) // Create input port
    this.addCallback(node) // attach a callback to it
  }

  /// attach a callback that updates audio connections to the Faust node 
  /// This runs whenver the user connects a new WebAudio node to the 'Audio In' port of the Faust operator
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
          this.context.setUiError("FaustError", `Cannot connect audio input to Faust node: ${err}`)
        }
      }
    }
  }

  disconnect() {
    this.port.remove()
  }
}

export class PortHandler {
  constructor(context) {
    // parameter 'address' -> input port mapping
    this.control = {}
    // Midi event port 
    this.midi = context.voiceMode == context.Voicing.Poly ? new Midi(context) : null

    // share global context w/ main script
    this.context = context
  }

  /// Initialize or update input ports for control-rate parameters
  /// @param {WebAudioNode} node
  /// @param {FaustUIInputItem[]}
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

  /// Update or initialize audio input singleton 
  /// @param {WebAudioNode} node
  updateAudio(node) {
    // if there are no audio inputs but our audio singleton is not null then drop it and return 
    if (node.getNumInputs() === 0 && this.audio) {
      this.audio.disconnect()
      this.audio = null
      return
    } else if (this.audio) {
      // If the audio singleton has already been instantiated then add a new 
      // callback holding a reference to the current Faust node
      this.audio.addCallback(node)
    } else {
      // Instantiate the Audio singleton - this adds the callback mentioned in 
      // the previous comment
      this.audio = new Audio(node, this.context.op)
    }
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

  partitionMidi(descriptors, isPoly = false) {
    console.log("DESCRIPTORS IN 'partitionMidi':")
    console.log(descriptors)
    const [poly, rest] = partition(descriptor => isMidi(descriptor, isPoly), descriptors)
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

    if (ctx.voiceMode == ctx.Voicing.Poly || hasMidi(node)) {
      // ignore midi parameters, they will be controlled by the midi port
      const [_, nonMidiParams] = this.partitionMidi(node.getDescriptors(), ctx.voiceMode == this.context.Voicing.Poly)
      this.updateMidi(node)
      // parameter descriptors with midi filtered out - so that we can create input ports 
      // for only the params that are not controlled by the MIDI handler Singleton
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
