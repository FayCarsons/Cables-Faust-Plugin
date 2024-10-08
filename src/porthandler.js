'use strict'

const TRIGGER_LEN = 20

// Split an array into two arrays according to a predicate while also threading 
// an accumulator (that is set with side effects) through iterations
function foldPartition({
  predicate,
  folder,
  acc,
  collection,
}) {
  const truthy = [], falsy = []

  collection.forEach(element => {
    if (predicate(element))
      truthy.push(element)
    else
      falsy.push(element)
    folder(acc, element)
  })

  return [truthy, falsy, acc]
}

const BUILTIN_MIDI_PARAM_NAMES = [
  'freq',
  'key',
  'gate',
  'gain',
  'vel',
  'velocity',
]

// Parameter is controlled by midi?
// If we are in poly mode then we need to always count poly params
// denoted by Faust's conventions 'freq' 'key' 'gate' etc
function isMidi(descriptor, isPoly = false) {
  if (descriptor.meta) {
    return descriptor.meta?.some(option => !!option.midi) ?? false
  }

  return isPoly && BUILTIN_MIDI_PARAM_NAMES.includes(descriptor.label)
}

// Types of Faust params that have an equivalent cables signal type
// We use a static object like a sum type to minimize error
const ControlType = {
  Slider: 0,
  Button: 1,
  CheckBox: 2,
}

class Control {
  constructor(descriptor, context) {
    this.context = context // 'op' context needed for creating a port, setting error messages

    this.address = descriptor.address
    this.label = descriptor.label
    this.type = this.parseType(descriptor.type)

    this.initialize()
  }

  parseType(typeString) {
    switch (typeString) {
      case 'button':
        return ControlType.Button
      case 'checkbox':
        return ControlType.CheckBox
      default:
        return ControlType.Slider
    }
  }

  /// Create a port for the given parameter
  /// @param {AudioNode} node
  initialize() {
    console.log(`Initializing control port: ${this.address}`)
    if (this.type == ControlType.Button || this.type == ControlType.CheckBox)
      this.port = this.context.inTrigger(this.label)
    else this.port = this.context.inFloat(this.label)
  }

  /// add a callback to port that sets the appropriate param
  ///
  /// @param {AudioNode} node
  /// @param {CablesPort} port
  addCallback(node) {
    switch (this.type) {
      case ControlType.Button: {
        this.port.onTriggered = this.addButtonCallback(node)
        break
      }
      case ControlType.CheckBox: {
        this.port.onTriggered = this.addCheckBoxCallback(node)
        break
      }
      default:
        this.port.onChange = this.addSliderCallback(node)
    }
  }

  addButtonCallback(node) {
    return () => {
      if (!node) {
        return
      }
      node.setParamValue(this.address, 1)
      setTimeout(() => node.setParamValue(this.address, 0), TRIGGER_LEN)
    }
  }

  addSliderCallback(node) {
    return () => {
      if (!node) {
        return
      }
      node.setParamValue(this.address, this.port.get())
    }
  }

  addCheckBoxCallback(node) {
    return () => {
      if (!node) {
        return
      }
      const new_value = Boolean(node.getParamValue(this.address)) ? 0 : 1
      node.setParamValue(this.address, new_value)
    }
  }

  // Remove the port from the operator
  disconnect() {
    if (this.port) this.port.remove()
  }
}

class Midi {
  constructor(context) {
    this.context = context
    this.port = context.op.inObject('Midi')
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

  disconnect() {
    this.port.remove()
  }
}

// Audio input singleton
class Audio {
  constructor(node, context) {
    this.context = context // Cables 'op' object
    this.currentInput = null // initialize current audio connection as null
    this.port = this.context.inObject(`Audio In`) // Create input port
    this.addCallback(node) // attach a callback to it
    this.addUnlinkCallback(node)
  }

  /// attach a callback that updates audio connections to the Faust node
  /// This runs whenver the user connects a new WebAudio node to the 'Audio In' port of the Faust operator
  addCallback(node) {
    this.port.onChange = () => {
      if (!node) return

      const input = this.port.get()
      if (this.currentInput) return
      else {
        const input = this.port.get()
        if (!input) return
        if (!(input instanceof AudioNode)) {
          op.setUiError(
            'FaustError',
            'Audio input is not an audio node: signals connected to audio input must be a WebAudio or Faust node',
          )
        }

        try {
          input.connect(node)
          this.currentInput = input
        } catch (err) {
          this.context.setUiError(
            'FaustError',
            `Cannot connect audio input to Faust node: ${err}`,
          )
        }
      }
    }
  }

  addUnlinkCallback(node) {
    this.port.onLinkChanged = () => {
      if (this.port.isLinked()) return
      else {
        try {
          this.currentInput.disconnect(node)
        } catch (_) { }
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
    this.midi =
      context.voiceMode == context.Voicing.Poly ? new Midi(context) : null

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
      this.control[address] =
        this.control[address] ?? new Control(descriptor, this.context.op)
      // Add a new callback that holds a reference to the current WebAudio node
      this.control[address].addCallback(node)
    }
  }

  /// Update or initialize audio input singleton
  /// @param {WebAudioNode} node
  updateAudio(node) {
    // if there are no audio inputs but our audio singleton is not null then drop it and return
    const numAudioInputs = node.getNumInputs()
    if (numAudioInputs === 0) {
      try {
        this.audio.disconnect()
        this.audio = null
      } catch (_) {
      } finally {
        return
      }
    } else if (this.audio) {
      // If the audio singleton has already been instantiated then add a new
      // callback holding a reference to the current Faust node and if there's
      // an op linked then connect it to the node
      this.audio.addCallback(node)
      this.audio.addUnlinkCallback(node)
      if (this.audio.port.isLinked()) {
        this.audio.currentInput = this.audio.port.get()
        this.audio.currentInput.connect(node)
      }
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

  // Separates MIDI-controlled params from non-MIDI and asserts that necessary 
  // params are present for polyphony
  processParams(descriptors, isPoly) {
    const foldPolyParams = (acc, element) => {
      const label = element.label
      if (label === 'freq' || label === 'key') {
        acc.frequencyParam = true
        return acc
      }
      else if (label === 'gate') {
        acc.gateParam = true
        return acc
      } else return acc
    }

    // Fold over params separating MIDI from non-MIDI and add boolean flags 
    // stating whether a poly-compatible frequency and gate param are present
    const [midi, rest, { frequencyParam, gateParam }] = foldPartition({
      predicate: descriptor => isMidi(descriptor, isPoly),
      folder: foldPolyParams,
      acc: {},
      collection: descriptors,
    })

    if (isPoly)
      if (!(frequencyParam && gateParam))
        throw new Error(`Polyphonic scripts must have the following params:\n
            freq -> accepts MIDI notes 0-127\n
            gate -> accepts triggers\n
            for more information see: github.com/FayCarsons/Cables-Faust-Plugin\n 
            and the Faust MIDI documentation: faustdoc.grame.fr/manual/midi/
          `)

    return [midi, rest]
  }

  // Update control ports and AUDIO + MIDI singletons
  update(node, ctx = this.context) {
    let descriptors = node.getDescriptors()

    if (ctx.voiceMode === ctx.Voicing.Poly || this.context.midi) {
      // ignore midi parameters, they will be controlled by the midi port
      const [_, nonMidiParams] = this.processParams(
        descriptors,
        ctx.voiceMode == ctx.Voicing.Poly,
      )

      this.updateMidi(node)

      // parameter descriptors with midi filtered out - so that we can create input ports
      // for only the params that are not controlled by the MIDI handler Singleton
      descriptors = nonMidiParams
    } else {
      // We are not using MIDI, remove our MIDI handler if it exists
      if (this.midi) {
        this.midi.disconnect()
        this.midi = null
      }
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
        port.disconnect()
        delete this.control[address]
      }
    }
  }
}

export default { PortHandler }
